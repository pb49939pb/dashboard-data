// Season simulation backtest (audit 7.3 / 7.4): playoff odds calibrated at frozen dates, shared season risk, and the
// tiebreakers checked against a real final table.
// For each frozen date in a finished season: ratings from games before it (production code, neutral priors, as in
// backtest.mjs), standings built from those games, the rest of the real schedule simulated (sim.mjs simulate) with
// shared team-season risk teamSd in {0, 0.05, 0.1, 0.15, 0.2, 0.3} goals of margin per game, and the playoff odds
// scored against who actually made it (Brier, log loss) and binned for calibration. Tiebreakers: the final table
// rebuilt from game results with our order (points, regulation wins, regulation + OT wins, wins) vs the NHL's final
// division order and playoff field.
//   node scripts/simBacktest.mjs 20252026     -> model/scorecards.json (seasonSim)
import { readFile, writeFile, readdir } from "node:fs/promises";
import { teamRatings, simulate } from "./sim.mjs";

const season = process.argv[2] || "20252026";
const dir = `public/hockey/seasons/${season}/teams`, by = new Map();
for (const f of await readdir(dir)) for (const g of JSON.parse(await readFile(`${dir}/${f}`, "utf8")).games || []) if (String(g.id).slice(4, 6) === "02" && g.shots) by.set(g.id, g);
const games = [...by.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
const end = `${season.slice(4)}-04-17`;
const fin = (await fetch(`https://api-web.nhle.com/v1/standings/${end}`, { headers: { "User-Agent": "hockey-lab/1.0" } }).then((r) => r.json())).standings;
const info = Object.fromEntries(fin.map((r) => [r.teamAbbrev.default, r]));
const made = new Set(fin.filter((r) => r.clinchIndicator && r.clinchIndicator !== "e").map((r) => r.teamAbbrev.default)); // "e" = eliminated
const ratingsFile = JSON.parse(await readFile("model/ratings.json", "utf8"));
const teams = Object.keys(info), neutral = Object.fromEntries(teams.map((t) => [t, { off: 1, def: 1, fin: 1, gk: 1 }]));
function table(gs) {
  const s = Object.fromEntries(teams.map((t) => [t, { pts: 0, gp: 0, w: 0, rw: 0, row: 0 }]));
  for (const g of gs) {
    const hw = g.hs > g.as, W = hw ? g.home : g.away, L = hw ? g.away : g.home, reg = !g.end || g.end === "REG";
    s[W].pts += 2; s[W].w++; s[W].gp++; s[L].gp++; if (reg) s[W].rw++; if (g.end !== "SO") s[W].row++; if (!reg) s[L].pts++;
  }
  return teams.map((t) => ({ teamAbbrev: { default: t }, teamCommonName: { default: t }, conferenceAbbrev: info[t].conferenceAbbrev, divisionAbbrev: info[t].divisionAbbrev, divisionName: info[t].divisionName,
    points: s[t].pts, gamesPlayed: s[t].gp, wins: s[t].w, regulationWins: s[t].rw, regulationPlusOtWins: s[t].row }));
}
// 1. tiebreakers on the real final table
const final = table(games);
const ourOrder = (rows) => [...rows].sort((a, b) => b.points - a.points || b.regulationWins - a.regulationWins || b.regulationPlusOtWins - a.regulationPlusOtWins || b.wins - a.wins);
const divs = [...new Set(fin.map((r) => r.divisionAbbrev))];
const divMatch = divs.map((d) => { const ours = ourOrder(final.filter((r) => r.divisionAbbrev === d)).map((r) => r.teamAbbrev.default), nhl = fin.filter((r) => r.divisionAbbrev === d).sort((a, b) => a.divisionSequence - b.divisionSequence).map((r) => r.teamAbbrev.default);
  return { div: d, same: ours.join() === nhl.join(), ours, nhl }; });
const pointsMatch = final.every((r) => r.points === info[r.teamAbbrev.default].points);
// 2. frozen dates
const y = Number(season.slice(4)) - 1, dates = [`${y}-11-15`, `${y}-12-15`, `${y + 1}-01-15`, `${y + 1}-02-15`, `${y + 1}-03-15`];
const SDS = [0, 0.05, 0.1, 0.15, 0.2, 0.3], results = {};
const clip = (p) => Math.min(1 - 1e-4, Math.max(1e-4, p));
for (const sd of SDS) results[sd] = { brier: [], ll: [], pairs: [] };
for (const D of dates) {
  const before = games.filter((g) => g.date < D), after = games.filter((g) => g.date >= D);
  const mu = before.reduce((a, g) => a + g.shots.filter((s) => s[2] !== "b" && s[4] !== null && s[4] !== 0.9).reduce((x, s) => x + s[4], 0), 0) / (before.length * 2);
  const hw = before.filter((g) => g.hs > g.as).length / before.length, h = Math.sqrt(Math.max(0.8, Math.min(1.25, hw / (1 - hw)))) ** 0.5;
  const R = teamRatings(before, { weights: ratingsFile.weights, prior: neutral, home: h, mu }, null);
  const rows = table(before), remaining = after.map((g) => ({ id: g.id, date: g.date, home: g.home, away: g.away }));
  for (const sd of SDS) {
    const sim = simulate({ R, standings: rows, remaining, teamSd: sd, seed: 20261014 });
    for (const t of sim.teams) { const p = t.playoffs / 100, o = made.has(t.team) ? 1 : 0; results[sd].brier.push((p - o) ** 2); results[sd].ll.push(-(o ? Math.log(clip(p)) : Math.log(1 - clip(p)))); results[sd].pairs.push([p, o, D]); }
  }
  console.log(D, "done");
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const summary = Object.fromEntries(SDS.map((sd) => [sd, { brier: +mean(results[sd].brier).toFixed(4), logLoss: +mean(results[sd].ll).toFixed(4),
  byDate: Object.fromEntries(dates.map((D) => [D, +mean(results[sd].pairs.filter((x) => x[2] === D).map(([p, o]) => (p - o) ** 2)).toFixed(4)])) }]));
// calibration bins for the current model (sd 0)
const bins = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.01].slice(0, -1).map((lo, i, a) => { const hi = [0.1, 0.3, 0.5, 0.7, 0.9, 1.01][i]; const xs = results[0].pairs.filter(([p]) => p >= lo && p < hi);
  return { bin: `${Math.round(lo * 100)}-${Math.min(100, Math.round(hi * 100))}%`, n: xs.length, predicted: xs.length ? +mean(xs.map((x) => x[0])).toFixed(3) : null, actual: xs.length ? +mean(xs.map((x) => x[1])).toFixed(3) : null }; });
// paired bootstrap (team-date rows) of Brier: best sd vs 0
const best = SDS.reduce((a, b) => (summary[b].brier < summary[a].brier ? b : a));
let seed = 7; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const d = results[best].brier.map((v, i) => v - results[0].brier[i]), bs = [];
for (let b = 0; b < 2000; b++) { let s = 0; for (let i = 0; i < d.length; i++) s += d[Math.floor(rand() * d.length)]; bs.push(s / d.length); }
bs.sort((a, b) => a - b);
const out = { model: "Season simulation backtest", season, builtAt: new Date().toISOString(), frozenDates: dates, teamSdGrid: SDS, results: summary, calibration: bins,
  bestTeamSd: best, bestVsNone95: [+bs[50].toFixed(4), +bs[1949].toFixed(4)],
  tiebreakers: { pointsMatchNhl: pointsMatch, divisionsMatching: divMatch.filter((x) => x.same).length, divisions: divMatch.length, mismatches: divMatch.filter((x) => !x.same) },
  note: "rows are team x date (5 dates x 32 teams), not independent: intervals are optimistic" };
out.decision = best !== 0 && out.bestVsNone95[1] < 0 ? `shared season risk sd ${best} improves playoff-odds Brier: use it` : "keep teamSd 0 unless a shared-risk SD improves playoff-odds Brier with an interval excluding 0";
console.log(JSON.stringify({ results: summary, calibration: bins, best, ci: out.bestVsNone95, tiebreakers: out.tiebreakers }, null, 1));
const sc = JSON.parse(await readFile("model/scorecards.json", "utf8")); sc.seasonSim = out; await writeFile("model/scorecards.json", JSON.stringify(sc));
