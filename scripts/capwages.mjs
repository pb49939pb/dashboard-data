// Nightly CapWages import (licensed API; brief in docs/capwages-integration.md). Contract money is owner-only and this
// repo's Actions logs are public, so this script prints counts and pass/fail only, never a dollar figure, name-value
// pair or team total. Per-team totals and warnings go to the owner-only run log (admin/jobs, via runlog.mjs).
//
//   CAPWAGES_API_KEY=... node scripts/capwages.mjs            nightly import: staging, validate, then publish
//   CAPWAGES_API_KEY=... node scripts/capwages.mjs --dry-run  fetch, normalize and validate; write staging only
//   (add --force to run again within 20 hours)
//   CAPWAGES_API_KEY=... node scripts/capwages.mjs --check    one request: does the key work?
//   node scripts/capwages.mjs --drop                          delete every stored CapWages document (terms: within
//                                                             14 days of the subscription ending)
//
// Storage (one root, so --drop is one operation): capwages/meta (last good run), capwages/live/teams/{ABBR} (what the
// site reads), capwages/staging/teams/{ABBR} and capwages/raw/players/{slug} (last import, for diffing).
// Fair use (their terms): one full import a day, at most 4 requests a second, cache responses.
import { openStore } from "./store.mjs";
import { startRun } from "./runlog.mjs";
import { TEAMS, teamAbbrev, lineupSlug, normalizePlayer, validate, teamDoc, seasonStart } from "./capwages-lib.mjs";

const BASE = "https://capwages.com/api/gateway/v1";
const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run"), DROP = args.has("--drop");
const GAP_MS = 300; // ≤ 3.4 requests a second, under their 4/s limit

class Stop extends Error {} // 401/403: bad or suspended key, or a fair-use problem: stop the whole run, never retry
let last = 0;
async function api(path, run) {
  const key = process.env.CAPWAGES_API_KEY;
  if (!key) throw new Stop("CAPWAGES_API_KEY isn't set");
  for (let attempt = 1; ; attempt++) {
    const wait = last + GAP_MS - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    let r;
    try { r = await fetch(BASE + path, { headers: { Authorization: `ApiKey ${key.trim()}`, Accept: "application/json", "User-Agent": "the-other-score nightly import (owner-only)" } }); }
    catch (e) { r = null; }
    if (r && (r.status === 401 || r.status === 403)) { run.count("capwages", { ok: false }); throw new Stop(`CapWages answered ${r.status} (${r.status === 403 ? "fair use or suspended key" : "key missing or rejected"}); stopping`); }
    if (r && r.ok) { run.count("capwages"); if (attempt > 1) run.retry("capwages", true); const j = await r.json(); if (j.success === false) throw new Error(`${path}: success=false`); return j; }
    if (r && r.status === 404) { run.count("capwages", { ok: false }); return null; }
    const transient = !r || r.status >= 500 || r.status === 429;
    if (!transient || attempt >= 4) { run.count("capwages", { ok: false }); if (attempt > 1) run.retry("capwages", false); throw new Error(`${path}: ${r ? r.status : "network error"}`); }
    await new Promise((res) => setTimeout(res, (r?.status === 429 ? 5000 : 1000) * 2 ** (attempt - 1)));
  }
}

// --check: one request to confirm the key works (status and counts only; no store needed, nothing written)
if (args.has("--check")) {
  const key = process.env.CAPWAGES_API_KEY;
  if (!key) { console.log("CAPWAGES_API_KEY isn't set in this run"); process.exit(1); }
  console.log(`key present (${key.length} characters${/\s/.test(key) ? ", contains whitespace: re-save it without spaces or line breaks" : ""})`);
  const r = await fetch(`${BASE}/players?limit=1&page=1`, { headers: { Authorization: `ApiKey ${key.trim()}`, Accept: "application/json" } }).catch((e) => ({ status: 0, e }));
  const j = r.status === 200 ? await r.json().catch(() => null) : null;
  if (r.status === 200 && j?.success !== false) console.log(`key works: HTTP 200, apiVersion ${j?.apiVersion ?? "?"}, ${j?.meta?.pagination?.total ?? "?"} players listed, source updated ${j?.meta?.lastUpdated ?? "?"}`);
  else console.log(`key check failed: HTTP ${r.status}${r.status === 401 ? " (key missing or rejected)" : r.status === 403 ? " (suspended key or fair-use block)" : ""}`);
  process.exit(r.status === 200 ? 0 : 1);
}
const run = startRun("capwages", { dryRun: DRY });
const store = await openStore();
if (!store) { console.log("FIREBASE_SERVICE_ACCOUNT not set; nothing to do"); run.finish({ ok: true, notes: { skipped: "no store" } }); process.exit(0); }

if (!DROP && !process.env.CAPWAGES_API_KEY) { console.log("CapWages isn't configured (no CAPWAGES_API_KEY secret); skipping"); run.finish({ ok: true, notes: { skipped: "not configured" } }); process.exit(0); }
if (DROP) {
  const n = await store.dropTree?.("capwages");
  console.log(`CapWages data deleted (${n ?? "?"} documents)`);
  run.finish({ ok: true, notes: { dropped: n } }); process.exit(0);
}

try {
  // fair use: one full import a day (the nightly workflow also runs on pushes), unless forced
  const prior = await store.read("capwages/meta").catch(() => null);
  const lastTry = [prior?.importedAt, prior?.lastAttempt?.importedAt].filter(Boolean).sort().pop();
  if (!args.has("--force") && lastTry && Date.now() - new Date(lastTry) < 20 * 3600e3) {
    console.log("CapWages was imported in the last 20 hours; skipping (fair use: once a day)");
    run.finish({ ok: true, notes: { skipped: "imported today", lastTry } }); process.exit(0);
  }
  // 1) discovery: every player with a current NHL team (the list has no leagueStatus; the detail does)
  const first = await api("/players?limit=100&page=1", run);
  const lastUpdated = first?.meta?.lastUpdated ?? null, pages = first?.meta?.pagination?.totalPages ?? 1;
  const before = await store.read("capwages/meta").catch(() => null);
  if (!DRY && lastUpdated && before?.lastUpdated === lastUpdated && before?.ok) {
    console.log("CapWages data unchanged since the last good import; skipping");
    run.check(true, "Freshness", "source unchanged since the last good import");
    run.finish({ ok: true, notes: { skipped: "unchanged", lastUpdated } }); process.exit(0);
  }
  const list = [...(first?.data || [])];
  for (let p = 2; p <= pages; p++) list.push(...((await api(`/players?limit=100&page=${p}`, run))?.data || []));
  const keep = list.filter((x) => x.current_team_slug && teamAbbrev(x.current_team_slug));
  console.log(`listed ${list.length} players; ${keep.length} with a current NHL team`);

  // 2) details
  const players = [], raw = [];
  let errors = 0;
  for (const x of keep) {
    try {
      const j = await api(`/players/${encodeURIComponent(x.slug)}`, run);
      if (!j?.data) { errors++; continue; }
      raw.push(j.data);
      const p = normalizePlayer(j.data);
      p.team ??= teamAbbrev(x.current_team_slug);
      players.push(p);
    } catch (e) { if (e instanceof Stop) throw e; errors++; }
  }
  // 3) lineups (game-day rosters; hyphenated slugs)
  const lineups = {};
  for (const a of Object.keys(TEAMS)) { try { const j = await api(`/lineups/${lineupSlug(a)}`, run); if (j?.data) lineups[a] = { ...j.data, lastUpdated: j.meta?.lastUpdated ?? null }; } catch (e) { if (e instanceof Stop) throw e; } }

  // 4) validate (fail closed)
  const y = Number(process.env.CAP_SEASON) || capSeasonNow();
  const v = validate({ players, errors, attempted: keep.length, y, prev: before?.ok ? before : null });
  const years = [y, y + 1, y + 2, y + 3, y + 4, y + 5];
  const meta = { lastUpdated, importedAt: new Date().toISOString() };
  const docs = Object.keys(TEAMS).map((a) => ({ a, doc: { ...teamDoc(a, players, years, meta), lineup: lineups[a] || null } }));

  // staging first, always (for diffing and review)
  for (const { a, doc } of docs) await store.put(`capwages/staging/teams/${a}`, doc, {}, { replace: true });
  await store.putMany(raw.map((d) => ({ path: `capwages/raw/players/${d.slug}`, data: d, fields: {} })), { replace: true });
  run.check(v.failures.length === 0, "Validation gates", v.failures.length ? `${v.failures.length} gate(s) failed` : "all gates passed");
  for (const f of v.failures) run.check(false, "Gate", f);
  for (const w of v.warnings) run.check(true, "Warning", w);
  const totals = Object.fromEntries(docs.map(({ a, doc }) => [a, doc.charges[y]?.totals]));
  const summary = { ok: v.ok, dryRun: DRY, lastUpdated, importedAt: meta.importedAt, season: y, nhlPlayers: v.nhlPlayers, listed: list.length, kept: keep.length, errors, counts: v.counts };

  if (!v.ok) {
    console.log(`validation failed (${v.failures.length} gate(s)); the previous import keeps serving. Details in the owner's run log.`);
    await store.put("capwages/meta", { ...(before || {}), lastAttempt: summary }, {}, { replace: true });
    run.finish({ ok: false, error: "validation failed", notes: { ...summary, failures: v.failures, warnings: v.warnings, totals } }); process.exit(1);
  }
  if (DRY) {
    await store.put("capwages/meta", { ...(before || {}), lastAttempt: summary }, {}, { replace: true }); // counts as today's import (fair use)
    console.log(`dry run: validation passed; staging written, live untouched (${players.length} players, ${errors} fetch errors)`);
    run.finish({ ok: true, notes: { ...summary, warnings: v.warnings, totals } }); process.exit(0);
  }
  for (const { a, doc } of docs) await store.put(`capwages/live/teams/${a}`, doc, {}, { replace: true });
  await store.put("capwages/meta", summary, {}, { replace: true });
  console.log(`published: ${players.length} players across ${docs.length} teams, ${errors} fetch errors, ${v.warnings.length} warning(s)`);
  run.finish({ ok: true, outputs: ["capwages/live/teams/*"], notes: { ...summary, warnings: v.warnings, totals } });
} catch (e) {
  // never echo a payload: messages above carry paths and status codes only
  console.log(e instanceof Stop ? e.message : `import failed: ${String(e.message).slice(0, 200)}`);
  run.finish({ ok: false, error: e.message, notes: { stopped: e instanceof Stop } }); process.exit(1);
}

/** The cap season in progress (a season runs from July): Oct 2026 -> 2026. */
function capSeasonNow(d = new Date()) { return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; }
export { seasonStart };
