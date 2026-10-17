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

  // Today's counts
  const counts = {};
  const start = dayStart(now);
  for (const [k, type] of [["reads", "document/read_count"], ["writes", "document/write_count"], ["deletes", "document/delete_count"]]) {
    try { counts[k] = await metricSum(token, project, `firestore.googleapis.com/${type}`, start, now); }
    catch (e) { errors.push(`${k}: ${e.message}`); counts[k] = prev.day === day ? prev.counts?.[k] ?? null : null; }
  }
  const cost = costOf(counts, price);
  const days = { ...(prev.days || {}) };
  days[day] = Math.round(cost * 1e4) / 1e4;
  for (const d of Object.keys(days)) if (d < quotaDay(new Date(now - 62 * 864e5))) delete days[d];
  const monthCost = Object.entries(days).filter(([d]) => d.startsWith(month)).reduce((s, [, c]) => s + c, 0);

  // Rules: trip, hold, or restore
  const releaseUrl = `https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`;
  let tripped = prev.tripped && prev.day === day, savedRuleset = prev.savedRuleset || null, lockRuleset = prev.lockRuleset || null, action = null;
  const over = cost >= DAILY_LIMIT || monthCost >= MONTHLY_LIMIT;
  try {
    if (over && !tripped) {
      const live = await google(token, releaseUrl);
      if (prev.lockRuleset && live.rulesetName === prev.lockRuleset) { /* still locked from yesterday (month over): keep the saved rules */ }
      else if (!dry) {
        const rs = await google(token, `https://firebaserules.googleapis.com/v1/projects/${project}/rulesets`, { method: "POST", body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: LOCKDOWN }] } }) });
        await google(token, releaseUrl, { method: "PATCH", body: JSON.stringify({ release: { name: `projects/${project}/releases/cloud.firestore`, rulesetName: rs.name } }) });
        lockRuleset = rs.name;
      }
      if (live.rulesetName !== prev.lockRuleset) savedRuleset = live.rulesetName;
      tripped = true; action = `cut off: $${cost.toFixed(3)} today, $${monthCost.toFixed(2)} this month`;
    } else if (!over && prev.tripped && prev.day !== day && savedRuleset) {
      const live = await google(token, releaseUrl);
      if (live.rulesetName === prev.lockRuleset) { // still our lockdown: put the old rules back
        if (!dry) await google(token, releaseUrl, { method: "PATCH", body: JSON.stringify({ release: { name: `projects/${project}/releases/cloud.firestore`, rulesetName: savedRuleset } }) });
        action = `restored ${savedRuleset.split("/").pop()}`;
      } else action = "new day; rules were changed while cut off, so they stay as they are";
      tripped = false; savedRuleset = null; lockRuleset = null;
    } else if (!over && prev.tripped && prev.day !== day) { tripped = false; action = "new day"; }
  } catch (e) { errors.push(`rules: ${e.message}`); if (over) tripped = true; } // jobs still stop even if the rules call failed

  const doc = {
    day, at: now.toISOString(), project, location, price, free: FREE, counts, cost: Math.round(cost * 1e4) / 1e4,
    dailyLimit: DAILY_LIMIT, monthlyLimit: MONTHLY_LIMIT, month, monthCost: Math.round(monthCost * 1e4) / 1e4, days,
    tripped, trippedAt: tripped ? (prev.tripped && prev.day === day ? prev.trippedAt : now.toISOString()) : null,
    savedRuleset, lockRuleset, lastAction: action || (prev.day === day ? prev.lastAction : null), errors,
  };
  log(`budget ${day}: reads ${counts.reads}, writes ${counts.writes}, deletes ${counts.deletes} → $${doc.cost.toFixed(4)} of $${DAILY_LIMIT.toFixed(4)} today; $${doc.monthCost.toFixed(2)} this month${tripped ? "; CUT OFF" : ""}${action ? ` (${action})` : ""}`);
  for (const e of errors) log(`budget error: ${e}`);
  if (!dry) { const json = JSON.stringify(doc); await ref.set({ json, updatedAt: doc.at }); }
  return doc;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const doc = await checkBudget();
  if (doc?.errors?.length && doc.counts.reads == null) process.exitCode = 1; // couldn't measure at all: show red in Actions
}
