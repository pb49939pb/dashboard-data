// Firestore spend guard (2026-10-16). The owner moved the project to Blaze with a $5/month budget and never wants to
// spend more than that, so this job, every ~10 minutes (budget.yml, and live.mjs on game nights):
//   1. reads today's Firestore reads, writes and deletes from Cloud Monitoring (the whole project: the site, the
//      dashboard apps, every job — the same counts Firebase bills from), for the quota day (midnight to midnight Pacific),
//   2. prices them past the free daily quota at the database location's rates,
//   3. if today's cost passes DAILY_LIMIT ($5 / 30), or the month's passes MONTHLY_LIMIT, hard-cuts browser access:
//      it releases a lockdown ruleset that denies every read and write from a browser except the owner's own sign-in
//      (so the owner's dashboard apps keep working and the Admin panel can show what happened). The service account
//      bypasses rules, so every data job also checks admin/budget (store.openStore, budgetCutoff) and skips its
//      Firestore work for the rest of the day.
//   4. at the next quota day it puts the ruleset that was live before back, unless someone released a different one in
//      the meantime (then that one stays).
// Writes admin/budget (owner-only) with today's counts, cost and state, for the Admin > Usage tab.
// BUDGET_DRY_RUN=1 prints what it would do without changing rules or writing.
import { quotaDay } from "./store.mjs";

export const DAILY_LIMIT = 5 / 30, MONTHLY_LIMIT = 5;
export const FREE = { reads: 50_000, writes: 20_000, deletes: 20_000 }; // per day, per project
// $ per 100,000 documents. Single-region US/most regions vs multi-region; unknown locations get the multi-region
// (higher) price, so the guard errs toward cutting off early.
const PRICES = {
  single: { reads: 0.03, writes: 0.09, deletes: 0.01 },
  multi: { reads: 0.06, writes: 0.18, deletes: 0.02 },
};
const MULTI = ["nam5", "nam7", "eur3"];
export const pricesFor = (loc) => (loc && !MULTI.includes(loc) ? PRICES.single : PRICES.multi);
export const costOf = (n, price) => Object.keys(FREE).reduce((s, k) => s + (Math.max(0, (n[k] || 0) - FREE[k]) / 1e5) * price[k], 0);

/** Start of the Pacific day containing `now`, as a Date. */
export function dayStart(now = new Date()) {
  const day = quotaDay(now); // YYYY-MM-DD in Pacific
  for (const off of [7, 8]) { // PDT or PST
    const d = new Date(`${day}T00:00:00-0${off}:00`);
    if (quotaDay(d) === day && quotaDay(new Date(d - 1)) !== day) return d;
  }
  return new Date(`${day}T00:00:00-08:00`);
}

const LOCKDOWN = `rules_version = '2';
// Lockdown: the daily Firestore budget was passed (scripts/budget.mjs in dashboard-data). Only the owner's own sign-in
// gets through until the next Pacific day, when the previous rules are restored automatically.
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null && request.auth.token.email == "pbaldwi3@gmail.com" && request.auth.token.email_verified == true;
    }
  }
}
`;

async function google(token, url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) } });
  const text = await r.text();
  if (!r.ok) { const e = new Error(`${opts.method || "GET"} ${url.split("?")[0]}: ${r.status} ${text.slice(0, 300)}`); e.status = r.status; throw e; }
  return text ? JSON.parse(text) : {};
}

// Hosting: 360 MB a day of downloads free, then $0.15 per GB
export const HOSTING_FREE_BYTES = 360e6, HOSTING_PER_GB = 0.15;
export const hostingCostOf = (bytes) => (Math.max(0, (bytes || 0) - HOSTING_FREE_BYTES) / 1e9) * HOSTING_PER_GB;

/** Firestore rules: the live ruleset, a lockdown ruleset, and releasing one. */
function rulesLock(token, project) {
  const base = `https://firebaserules.googleapis.com/v1/projects/${project}`, rel = `${base}/releases/cloud.firestore`;
  return {
    live: async () => (await google(token, rel)).rulesetName,
    makeLock: async () => (await google(token, `${base}/rulesets`, { method: "POST", body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: LOCKDOWN }] } }) })).name,
    release: (name) => google(token, rel, { method: "PATCH", body: JSON.stringify({ release: { name: `projects/${project}/releases/cloud.firestore`, rulesetName: name } }) }),
  };
}

const PAUSED = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Back tomorrow</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f14;color:#e8eef5;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}</style></head>
<body><main><h1>Back tomorrow</h1><p>This site is paused for the rest of the day. It comes back at midnight Pacific.</p></main></body></html>
`;
/** Firebase Hosting (the default site): the live version, a one-page "paused" version, and releasing one. */
function hostingLock(token, project) {
  const H = "https://firebasehosting.googleapis.com/v1beta1", site = `sites/${project}`;
  return {
    live: async () => (await google(token, `${H}/${site}/releases?pageSize=1`)).releases?.[0]?.version?.name || null,
    async makeLock() {
      const { gzipSync } = await import("node:zlib"), { createHash } = await import("node:crypto");
      const v = await google(token, `${H}/${site}/versions`, { method: "POST", body: JSON.stringify({ config: {
        rewrites: [{ glob: "**", path: "/index.html" }], headers: [{ glob: "**", headers: { "Cache-Control": "no-store" } }] }, labels: { purpose: "budget-pause" } }) });
      const gz = gzipSync(Buffer.from(PAUSED)), h = createHash("sha256").update(gz).digest("hex");
      const pf = await google(token, `${H}/${v.name}:populateFiles`, { method: "POST", body: JSON.stringify({ files: { "/index.html": h } }) });
      if ((pf.uploadRequiredHashes || []).includes(h)) {
        const r = await fetch(`${pf.uploadUrl}/${h}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: gz });
        if (!r.ok) throw new Error(`hosting upload: ${r.status} ${(await r.text()).slice(0, 200)}`);
      }
      await google(token, `${H}/${v.name}?update_mask=status`, { method: "PATCH", body: JSON.stringify({ status: "FINALIZED" }) });
      return v.name;
    },
    release: (version) => google(token, `${H}/${site}/releases?versionName=${encodeURIComponent(version)}`, { method: "POST", body: JSON.stringify({ message: "budget guard (scripts/budget.mjs)" }) }),
  };
}

/** Sum of one Firestore metric since `start`. Monitoring trails by a few minutes. */
async function metricSum(token, project, type, start, end) {
  const secs = Math.max(60, Math.ceil((end - start) / 1000 / 60) * 60);
  const q = new URLSearchParams({
    filter: `metric.type="${type}"`, "interval.startTime": start.toISOString(), "interval.endTime": end.toISOString(),
    "aggregation.alignmentPeriod": `${secs}s`, "aggregation.perSeriesAligner": "ALIGN_SUM", "aggregation.crossSeriesReducer": "REDUCE_SUM",
  });
  const j = await google(token, `https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${q}`);
  let n = 0;
  for (const ts of j.timeSeries || []) for (const p of ts.points || []) n += Number(p.value?.int64Value ?? p.value?.doubleValue ?? 0);
  return n;
}

export async function checkBudget({ log = console.log } = {}) {
  const key = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!key) { log("budget: no FIREBASE_SERVICE_ACCOUNT; skipping"); return null; }
  const dry = !!process.env.BUDGET_DRY_RUN;
  const sa = JSON.parse(key), project = sa.project_id;
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = getApps()[0] || initializeApp({ credential: cert(sa) });
  const db = getFirestore(app);
  const token = (await cert(sa).getAccessToken()).access_token;

  const now = new Date(), day = quotaDay(now), month = day.slice(0, 7);
  const ref = db.doc("admin/budget");
  const snap = await ref.get();
  const prev = snap.exists ? JSON.parse(snap.data().json) : {};
  const errors = [];

  // Database location sets the price (checked once, then remembered)
  let location = prev.location || null;
  if (!location) {
    try { location = (await google(token, `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)`)).locationId || null; }
    catch (e) { errors.push(`location: ${e.message}`); }
  }
  const price = pricesFor(location);

  // Today's counts: Firestore documents and Hosting bytes sent
  const counts = {};
  const start = dayStart(now);
  for (const [k, type] of [["reads", "firestore.googleapis.com/document/read_count"], ["writes", "firestore.googleapis.com/document/write_count"],
    ["deletes", "firestore.googleapis.com/document/delete_count"], ["hostingBytes", "firebasehosting.googleapis.com/network/sent_bytes_count"]]) {
    try { counts[k] = await metricSum(token, project, type, start, now); }
    catch (e) { errors.push(`${k}: ${e.message}`); counts[k] = prev.day === day ? prev.counts?.[k] ?? null : null; }
  }
  const firestoreCost = costOf(counts, price), hostingCost = hostingCostOf(counts.hostingBytes);
  const cost = firestoreCost + hostingCost; // one budget for both
  const days = { ...(prev.days || {}) };
  days[day] = Math.round(cost * 1e4) / 1e4;
  for (const d of Object.keys(days)) if (d < quotaDay(new Date(now - 62 * 864e5))) delete days[d];
  const monthCost = Object.entries(days).filter(([d]) => d.startsWith(month)).reduce((s, [, c]) => s + c, 0);

  // Cutoff. While tripped, every run makes sure both locks are live (a deploy in the meantime would have undone the
  // Hosting one); on the first run of a new day under the limit, both are put back as they were.
  const over = cost >= DAILY_LIMIT || monthCost >= MONTHLY_LIMIT;
  const tripped = over || (prev.tripped && prev.day === day);
  const L = { rules: rulesLock(token, project), hosting: hostingLock(token, project) };
  const state = { rules: { ...(prev.locks?.rules || {}) }, hosting: { ...(prev.locks?.hosting || {}) } };
  if (prev.savedRuleset && !prev.locks) state.rules = { saved: prev.savedRuleset, lock: prev.lockRuleset }; // older record
  const access = {}, actions = [];
  for (const k of ["rules", "hosting"]) {
    try {
      const live = await L[k].live(); access[k] = !!live;
      const s = state[k];
      if (tripped) {
        if (live !== s.lock || !s.lock) {
          if (!dry) { if (!s.lock) s.lock = await L[k].makeLock(); await L[k].release(s.lock); }
          if (live && live !== s.lock && live !== s.prevLock) s.saved = live;
          actions.push(`${k} locked`);
        }
      } else if (s.lock) { // not over any more: undo (retried each run until it works)
        if (live === s.lock && s.saved) { if (!dry) await L[k].release(s.saved); actions.push(`${k} restored`); }
        else actions.push(`${k} changed while cut off; left as is`);
        state[k] = { prevLock: s.lock };
      }
    } catch (e) { access[k] = false; errors.push(`${k}: ${e.message}`); }
  }
  const action = actions.length ? `${tripped ? `over: $${cost.toFixed(3)} today, $${monthCost.toFixed(2)} this month; ` : "new day; "}${actions.join(", ")}` : null;

  const doc = {
    day, at: now.toISOString(), project, location, price, free: FREE, counts, cost: Math.round(cost * 1e4) / 1e4,
    firestoreCost: Math.round(firestoreCost * 1e4) / 1e4, hostingCost: Math.round(hostingCost * 1e4) / 1e4, hostingFree: HOSTING_FREE_BYTES, hostingPrice: HOSTING_PER_GB,
    dailyLimit: DAILY_LIMIT, monthlyLimit: MONTHLY_LIMIT, month, monthCost: Math.round(monthCost * 1e4) / 1e4, days,
    tripped, trippedAt: tripped ? (prev.tripped && prev.day === day ? prev.trippedAt : now.toISOString()) : null,
    locks: state, rulesAccess: access.rules ?? null, hostingAccess: access.hosting ?? null, measured: counts.reads != null && counts.hostingBytes != null,
    lastAction: action || (prev.day === day ? prev.lastAction : null), errors,
  };
  log(`budget ${day}: reads ${counts.reads}, writes ${counts.writes}, deletes ${counts.deletes}, hosting ${counts.hostingBytes == null ? "?" : (counts.hostingBytes / 1e6).toFixed(1) + " MB"} → $${doc.cost.toFixed(4)} of $${DAILY_LIMIT.toFixed(4)} today; $${doc.monthCost.toFixed(2)} this month; ${location || "location unknown"}; access rules ${access.rules ? "ok" : "MISSING"}, hosting ${access.hosting ? "ok" : "MISSING"}${tripped ? "; CUT OFF" : ""}${action ? ` (${action})` : ""}`);
  for (const e of errors) log(`budget error: ${e}`);
  if (!dry) { const json = JSON.stringify(doc); await ref.set({ json, updatedAt: doc.at }); }
  return doc;
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--test-hosting")) {
  // Lists the Hosting metrics Cloud Monitoring has for this project and checks access to Hosting releases
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT), { cert } = await import("firebase-admin/app");
  const token = (await cert(sa).getAccessToken()).access_token;
  const q = new URLSearchParams({ filter: 'metric.type = starts_with("firebasehosting.googleapis.com")' });
  try { const j = await google(token, `https://monitoring.googleapis.com/v3/projects/${sa.project_id}/metricDescriptors?${q}`); for (const d of j.metricDescriptors || []) console.log("metric", d.type, d.metricKind, d.valueType, d.unit); }
  catch (e) { console.log("metrics:", e.message); }
  try { const r = await google(token, `https://firebasehosting.googleapis.com/v1beta1/sites/${sa.project_id}/releases?pageSize=2`); for (const x of r.releases || []) console.log("release", x.type, x.version?.name, x.releaseTime); }
  catch (e) { console.log("releases:", e.message); }
  try { // build the "paused" version without releasing it, then delete it
    const v = await hostingLock(token, sa.project_id).makeLock();
    await google(token, `https://firebasehosting.googleapis.com/v1beta1/${v}`, { method: "DELETE" });
    console.log(`hosting lock test ok: built and deleted ${v.split("/").pop()} (never released)`);
    const H = hostingLock(token, sa.project_id), live = await H.live(); // release permission: re-release what's already live (no change)
    if (live) { await H.release(live); console.log(`hosting release test ok: re-released ${live.split("/").pop()}`); }
  } catch (e) { console.log("hosting lock test:", e.message.replace(/[{}"]/g, " ")); }
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--test-rules")) {
  // Proves the cutoff would work: creates the lockdown ruleset (without releasing it) and deletes it again
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT), { cert } = await import("firebase-admin/app");
  const token = (await cert(sa).getAccessToken()).access_token, base = `https://firebaserules.googleapis.com/v1/projects/${sa.project_id}`;
  const rs = await google(token, `${base}/rulesets`, { method: "POST", body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: LOCKDOWN }] } }) });
  await google(token, `https://firebaserules.googleapis.com/v1/${rs.name}`, { method: "DELETE" });
  console.log(`rules test ok: created and deleted ${rs.name.split("/").pop()} (never released)`);
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const doc = await checkBudget();
  if (doc?.errors?.length && doc.counts.reads == null) process.exitCode = 1; // couldn't measure at all: show red in Actions
}
