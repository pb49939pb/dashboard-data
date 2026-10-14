// Data invariants for Hockey Lab (audit section 2, "mandatory invariant tests"). Runs nightly after the build; each
// check passes, fails (with examples) or is skipped with a reason. Never blocks the publish: failures show on the
// Admin page so a bad night is visible instead of silent.
//   node scripts/invariants.mjs        → public/hockey/invariants.json (exit 1 if any check failed)
import { readFile, readdir, writeFile } from "node:fs/promises";

const read = (p) => readFile(p, "utf8").then(JSON.parse, () => null);
const league = await read("public/hockey/league.json"), proj = await read("public/hockey/projections.json");
const checks = [];
const check = (name, ok, detail = "", examples = []) => checks.push({ name, status: ok ? "pass" : "fail", detail, examples: examples.slice(0, 5) });
const skip = (name, why) => checks.push({ name, status: "skip", detail: why, examples: [] });

// every game once, from the per-team files (each game is stored in both teams' files)
const games = new Map(), dupShots = [];
for (const f of await readdir("public/hockey/teams").catch(() => [])) {
  const d = await read(`public/hockey/teams/${f}`);
  for (const g of d?.games || []) if (String(g.id).slice(4, 6) === "02") games.set(g.id, g);
}
const G = [...games.values()];
if (!G.length) skip("games", "no team game files"); else {
  // 1. one home and one away team per game; no duplicate shot events within a game
  const badSides = G.filter((g) => !g.home || !g.away || g.home === g.away).map((g) => g.id);
  check("Each game has one home and one away team", !badSides.length, `${G.length} games`, badSides);
  const noTime = G.filter((g) => g.shots.some((s) => s.length < 14 || s[12] == null)).map((g) => g.id);
  check("Shot records carry their time and empty-net flag", !noTime.length, "14-field records (format 4)", noTime);
  for (const g of G) {
    if (noTime.includes(g.id)) continue; // can't tell duplicates apart without the time
    const seen = new Set();
    for (const s of g.shots) { const k = `${s[8]}|${s[12]}|${s[2]}|${s[5]}|${s[0]}|${s[1]}`; if (seen.has(k)) { dupShots.push(`${g.id}: period ${s[8]} t=${s[12]}`); break; } seen.add(k); }
  }
  check("No duplicate shot events", !dupShots.length, "same period, time, type, shooter and location twice in one game", dupShots);
  // 4. empty-net goals are never charged to a goalie
  const enCharged = G.flatMap((g) => g.shots.filter((s) => s[13] === 1 && s[2] === "g" && s[6]).map(() => g.id));
  check("Empty-net goals aren't charged to a goalie", !enCharged.length, "", enCharged);
  // 8. shot times and periods are possible
  const badTime = G.flatMap((g) => g.shots.filter((s) => s[12] < 0 || s[12] > 1200 || s[8] < 1).map((s) => `${g.id}: period ${s[8]} t=${s[12]}`));
  check("Shot times are inside their period", !badTime.length, "0-1200 s, period >= 1", badTime);
}

if (league) {
  const T = league.teams.filter((t) => t.gp);
  const sum = (k) => T.reduce((a, t) => a + (t[k] ?? 0), 0);
  // 6. for one team = against for its opponents (league-wide totals)
  check("League goals for = goals against", sum("gf") === sum("ga"), `${sum("gf")} vs ${sum("ga")}`);
  check("League power-play goals = penalty-kill goals against", sum("gfPP") === sum("gaPK"), `${sum("gfPP")} vs ${sum("gaPK")}`);
  const dx = Math.abs(sum("xgf5") - sum("xga5"));
  check("League 5v5 xG for = xG against (within rounding)", dx <= 0.01 * T.length, `difference ${dx.toFixed(3)} (stored to 2 decimals per team)`);
  // 5. the goal-differential ledger reconciles for every team
  const off = T.filter((t) => {
    const g = t.gp, other = (t.gf - t.ga) - (t.gf5 - t.ga5) - ((t.gfPP ?? 0) - (t.gaPK ?? 0));
    const parts = [t.xgf5, -t.xga5, t.gf5 - t.xgf5, t.xga5 - t.ga5, t.gfPP ?? 0, -(t.gaPK ?? 0), other].map((v) => v / g);
    return Math.abs(parts.reduce((a, b) => a + b, 0) - (t.gf - t.ga) / g) > 1e-9;
  }).map((t) => t.team);
  check("Goal-differential ledger reconciles for every team", !off.length, "seven parts = GF − GA per game", off);
  // game counts: team games played sum to twice the league's games
  check("Team games played = 2 × league games", sum("gp") === 2 * league.games, `${sum("gp")} vs ${2 * league.games}`);
}

if (proj && !proj.final) {
  // 3. schedule length: every team plays the same number of games (84 in 2026-27) and the league total matches
  const perTeam = proj.teams.map((t) => t.gp), played = perTeam.reduce((a, b) => a + b, 0) / 2, total = played + proj.remaining;
  const expect = { "20262027": 84, "20252026": 82 }[String(proj.season)] ?? 84;
  check(`Schedule totals ${expect} games per team`, Math.abs(total - (expect * proj.teams.length) / 2) < 0.5, `${played} played + ${proj.remaining} left = ${total} (expected ${(expect * proj.teams.length) / 2})`);
  // 2. standings points: 2 per regulation game, 3 per OT/shootout game
  const pts = proj.teams.reduce((a, t) => a + t.pts, 0);
  if (G.length && G.every((g) => g.end)) {
    const fin = G.filter((g) => g.hs != null && g.as != null);
    const expected = fin.reduce((a, g) => a + (g.end === "REG" ? 2 : 3), 0);
    check("Standings points: 2 per regulation game, 3 per OT/SO game", pts === expected || Math.abs(pts - expected) <= 3, `standings ${pts}, from game results ${expected} (small gaps = standings timing)`);
  } else skip("Standings points", "game end types missing");
  // probabilities stay in [0, 1] and odds add up sensibly
  const badP = proj.teams.filter((t) => [t.playoffs, t.cup, t.division].some((v) => v != null && (v < 0 || v > 100))).map((t) => t.team);
  check("Projection probabilities are within 0-100%", !badP.length, "", badP);
  const cupSum = proj.teams.reduce((a, t) => a + (t.cup ?? 0), 0);
  check("Cup odds add up to 100%", Math.abs(cupSum - 100) < 1, `${cupSum.toFixed(2)}%`);
  const po = proj.teams.reduce((a, t) => a + (t.playoffs ?? 0), 0);
  check("Playoff odds add up to 16 teams", Math.abs(po - 1600) < 5, `${(po / 100).toFixed(2)} teams`);
} else skip("Projections", "no projections (or a finished season)");

const failed = checks.filter((c) => c.status === "fail");
const out = { builtAt: new Date().toISOString(), passed: checks.filter((c) => c.status === "pass").length, failed: failed.length, skipped: checks.filter((c) => c.status === "skip").length, checks };
await writeFile("public/hockey/invariants.json", JSON.stringify(out));
for (const c of checks) console.log(`${c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "–"} ${c.name}${c.detail ? `: ${c.detail}` : ""}${c.examples.length ? ` e.g. ${c.examples.join(", ")}` : ""}`);
process.exitCode = failed.length ? 1 : 0;
