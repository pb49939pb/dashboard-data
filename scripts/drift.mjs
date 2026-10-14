// Drift alarms and champion/challenger record (audit D5). Nightly, after the build: is the live system behaving the way
// the tests said it would?
//   pre-game odds   live log loss over this season's logged games vs the walk-forward backtest's (z on the per-game
//                   log-loss spread), and calibration in the large (mean predicted home wins vs actual)
//   xG              this season's goals vs xG (Poisson z)
//   inputs          unblocked shots per game, xG per shot, home win rate vs last season's reference
//   status: ok |z| < 2, warn 2-3, alarm >= 3 (or too few games: "waiting")
// Champion/challenger: each switchable model's live record (pre-game odds of the team-only vs roster-aware
// simulation, scored on the same logged games) and which one is primary.
//   node scripts/drift.mjs              (reads Firestore's prediction log with FIREBASE_SERVICE_ACCOUNT)
//   node scripts/drift.mjs --reference  (locally, from last season's files: writes model/driftReference.json)
import { readFile, readdir, writeFile } from "node:fs/promises";
import { openStore } from "./store.mjs";

const read = (p) => readFile(p, "utf8").then(JSON.parse, () => null);
const ll = (p, y) => -(y ? Math.log(Math.min(1 - 1e-6, Math.max(1e-6, p))) : Math.log(1 - Math.min(1 - 1e-6, Math.max(1e-6, p))));
const shotsOf = (g) => (g.shots || []).filter((s) => s[2] !== "b" && s[4] !== null && s[4] !== 0.9);
function inputs(games) {
  const n = games.length, sh = games.reduce((a, g) => a + shotsOf(g).length, 0), xg = games.reduce((a, g) => a + shotsOf(g).reduce((x, s) => x + s[4], 0), 0);
  const goals = games.reduce((a, g) => a + shotsOf(g).filter((s) => s[2] === "g").length, 0);
  const per = games.map((g) => shotsOf(g)), spg = per.map((x) => x.length), xps = per.map((x) => x.reduce((a, s) => a + s[4], 0) / Math.max(1, x.length));
  const sdOf = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, v) => x + (v - m) ** 2, 0) / a.length); };
  return { games: n, shotsPerGame: sh / n, xgPerShot: xg / sh, goalsPerShot: goals / sh, homeWin: games.filter((g) => g.hs > g.as).length / n, xg, goals, sdShotsPerGame: sdOf(spg), sdXgPerShot: sdOf(xps) };
}
async function seasonGames(dir) {
  const by = new Map();
  for (const f of await readdir(dir).catch(() => [])) for (const g of (await read(`${dir}/${f}`))?.games || []) if (String(g.id).slice(4, 6) === "02" && g.shots) by.set(g.id, g);
  return [...by.values()];
}
if (process.argv.includes("--reference")) {
  const ref = inputs(await seasonGames("public/hockey/seasons/20252026/teams"));
  await writeFile("model/driftReference.json", JSON.stringify({ season: "20252026", builtAt: new Date().toISOString(), ...ref }));
  console.log("drift reference:", JSON.stringify(ref));
  process.exit(0);
}
const [league, ref, sc, proj, cfg] = await Promise.all(["public/hockey/league.json", "model/driftReference.json", "model/scorecards.json", "public/hockey/projections.json", "model/config.json"].map(read));
const store = await openStore().catch(() => null);
const log = store ? await store.read(`hockey/predLog/seasons/${league.season}`).catch(() => null) : null;
const rows = log?.rows || [];
const checks = [], status = (z, n, min) => (n < min ? "waiting" : Math.abs(z) >= 3 ? "alarm" : Math.abs(z) >= 2 ? "warn" : "ok");
const add = (name, value, expected, z, n, min, note) => checks.push({ name, value: +value.toFixed(4), expected: expected == null ? null : +expected.toFixed(4), z: z == null ? null : +z.toFixed(2), n, status: status(z ?? 0, n, min), note });
// pre-game odds
const scored = rows.filter((r) => r.model != null);
if (scored.length) {
  const L = scored.map((r) => ll(r.model, r.homeWon)), m = L.reduce((a, b) => a + b, 0) / L.length, sdv = Math.sqrt(L.reduce((a, v) => a + (v - m) ** 2, 0) / L.length) || 0.1;
  const exp = sc?.games?.models?.["Hockey Lab ratings from xG (production; optimistic, see leakage)"]?.all?.log_loss ?? 0.6833;
  add("Pre-game odds: log loss", m, exp, (m - exp) / (sdv / Math.sqrt(L.length)), L.length, 50, "live, logged before puck drop, vs the 2025-26 walk-forward backtest");
  const pm = scored.reduce((a, r) => a + r.model, 0) / scored.length, am = scored.reduce((a, r) => a + r.homeWon, 0) / scored.length;
  add("Pre-game odds: calibration in the large", am - pm, 0, (am - pm) / Math.sqrt((pm * (1 - pm)) / scored.length), scored.length, 50, "actual home wins minus mean predicted");
} else add("Pre-game odds: log loss", 0, null, null, 0, 50, "no logged games yet");
// xG and inputs, this season so far
const cur = inputs(await seasonGames("public/hockey/teams"));
add("xG: goals vs expected", cur.goals / cur.xg, 1, (cur.goals - cur.xg) / Math.sqrt(cur.xg), cur.games, 100, "this season's goals ÷ xG (all unblocked non-empty-net shots)");
if (ref) {
  const rate = (k, label, sdPer) => add(label, cur[k], ref[k], (cur[k] - ref[k]) / (sdPer / Math.sqrt(cur.games)), cur.games, 100, `vs ${ref.season}`);
  rate("shotsPerGame", "Inputs: unblocked shots per game", ref.sdShotsPerGame ?? 12); // game-to-game spread measured last season
  rate("xgPerShot", "Inputs: xG per shot", ref.sdXgPerShot ?? 0.012);
  add("Inputs: home win rate", cur.homeWin, ref.homeWin, (cur.homeWin - ref.homeWin) / Math.sqrt((ref.homeWin * (1 - ref.homeWin)) / cur.games), cur.games, 100, `vs ${ref.season}`);
}
// champion / challenger
const both = rows.filter((r) => r.team != null && r.roster != null);
const score = (k) => (both.length ? both.reduce((a, r) => a + ll(r[k], r.homeWon), 0) / both.length : null);
const champions = [
  { model: "Season simulation", champion: proj?.simModel === "roster" ? "roster-aware" : "team-only", challenger: proj?.simModel === "roster" ? "team-only" : "roster-aware",
    live: { games: both.length, teamOnly: score("team"), rosterAware: score("roster") }, rule: "switch only if the challenger's live log loss is lower with a 95% interval excluding 0 over 300+ games" },
  { model: "Player value", champion: "WAR-lite", challenger: "RAPM WAR", live: sc?.valueCompare ? Object.values(sc.valueCompare).map((x) => ({ test: `${x.valuesFrom}->${x.testSeason}`, warlite: x.results["WAR-lite"].logLoss, rapm: x.results["RAPM WAR"].logLoss })) : null,
    rule: "rerun the head-to-head each season; switch only on a significant next-season win" },
];
const out = { builtAt: new Date().toISOString(), season: league.season, checks, champions, worst: checks.some((c) => c.status === "alarm") ? "alarm" : checks.some((c) => c.status === "warn") ? "warn" : "ok" };
await writeFile("public/hockey/drift.json", JSON.stringify(out));
console.log(`drift: ${out.worst}; ${checks.map((c) => `${c.name} ${c.status}${c.z != null ? ` (z ${c.z})` : ""}`).join("; ")}`);
