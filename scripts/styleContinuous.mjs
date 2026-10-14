// Team style follow-ups (audit section 9, team style and system fit):
//   1. Continuous matchups: instead of 5 x 4 clusters, a ridge model of each game's 5v5 xG residual on every pair of
//      (attacking team's offensive trait z) x (opponent's defensive trait z), fit on one season, scored on the other,
//      vs predicting no matchup effect. Shrinkage picked on the training season (5-fold by game).
//   2. Arena scorekeepers: event-based traits (forecheck, pressure, own-zone giveaways) use road games only because
//      home scorekeepers differ. Alternative: all games, home games divided by a partially pooled arena factor
//      (events recorded per game in that rink vs league, shrunk with 20 games of prior). Which version of each trait
//      repeats better from one season to the next (team-level correlation)?
//   HOCKEY_CACHE=../hockey-models/data/raw/pbp node scripts/styleContinuous.mjs 20242025 20252026 -> model/styleContinuous.json
import { readFile, readdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { scoreGame } from "./league.mjs";
import { fingerprints, OFF, DEF } from "./style.mjs";

const dir = process.env.HOCKEY_CACHE, seasons = process.argv.slice(2);
const model = JSON.parse(await readFile("model/xg_logit.json", "utf8"));
model.gbm = JSON.parse(await readFile("model/xg_gbm.json", "utf8")); model.hands = {};
const bySeason = {}, files = await readdir(dir);
for (const s of seasons) { bySeason[s] = []; for (const f of files.filter((f) => f.startsWith(s.slice(0, 4)))) { const pbp = JSON.parse(gunzipSync(await readFile(`${dir}/${f}`))); if (String(pbp.season) === s && pbp.gameType === 2) bySeason[s].push(scoreGame(pbp, model)); } }
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2))) || 1;
const corr = (a, b) => { const ma = mean(a), mb = mean(b); return a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0) / Math.sqrt(a.reduce((s, v) => s + (v - ma) ** 2, 0) * b.reduce((s, v) => s + (v - mb) ** 2, 0)); };
// 1. continuous matchups
const fp = Object.fromEntries(seasons.map((s) => [s, fingerprints(bySeason[s])]));
function rows(season) {
  const F = fp[season], teams = Object.keys(F), z = (feats) => { const st = feats.map(([k]) => [mean(teams.map((t) => F[t][k])), sd(teams.map((t) => F[t][k]))]); return Object.fromEntries(teams.map((t) => [t, feats.map(([k], i) => (F[t][k] - st[i][0]) / st[i][1])])); };
  const zo = z(OFF), zd = z(DEF), lgx = mean(teams.map((t) => F[t].xgfPg)), out = [];
  for (const g of bySeason[season]) { const one = fingerprints([g]);
    for (const [a, b] of [[g.home, g.away], [g.away, g.home]]) { if (!F[a] || !F[b] || !one[a]) continue; const exp = (F[a].xgfPg * F[b].xgaPg) / lgx;
      out.push({ g: g.id, x: zo[a].flatMap((u) => zd[b].map((v) => u * v)), r: one[a].xgfPg / exp - 1 }); } }
  return out;
}
function ridge(R, lam) { // solve (X'X + lam I) b = X'y
  const k = R[0].x.length, A = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (const { x, r } of R) for (let i = 0; i < k; i++) { A[i][k] += x[i] * r; for (let j = 0; j < k; j++) A[i][j] += x[i] * x[j]; }
  for (let i = 0; i < k; i++) A[i][i] += lam;
  for (let i = 0; i < k; i++) { let p = i; for (let q = i + 1; q < k; q++) if (Math.abs(A[q][i]) > Math.abs(A[p][i])) p = q; [A[i], A[p]] = [A[p], A[i]]; for (let q = 0; q < k; q++) if (q !== i) { const f = A[q][i] / A[i][i]; for (let c = i; c <= k; c++) A[q][c] -= f * A[i][c]; } }
  return A.map((row, i) => row[k] / row[i]);
}
const mse = (R, b) => mean(R.map(({ x, r }) => (r - (b ? x.reduce((s, v, i) => s + v * b[i], 0) : 0)) ** 2));
const continuous = {};
for (const [tr, te] of [[seasons[0], seasons[1]], [seasons[1], seasons[0]]]) {
  const A = rows(tr), B = rows(te), lams = [10, 100, 1000, 10000, 100000];
  const cv = lams.map((lam) => { let e = 0; for (let f = 0; f < 5; f++) { const trn = A.filter((x) => x.g % 5 !== f), val = A.filter((x) => x.g % 5 === f); e += mse(val, ridge(trn, lam)); } return [lam, e / 5]; }).sort((a, b) => a[1] - b[1]);
  const b = ridge(A, cv[0][0]), d = B.map(({ x, r }) => (r - x.reduce((s, v, i) => s + v * b[i], 0)) ** 2 - r ** 2);
  let seed = 9; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); const bs = []; for (let k = 0; k < 1000; k++) { let s = 0; for (let i = 0; i < d.length; i++) s += d[Math.floor(rand() * d.length)]; bs.push(s / d.length); } bs.sort((a, c) => a - c);
  continuous[`${tr}->${te}`] = { lambda: cv[0][0], mseNone: +mse(B, null).toFixed(5), mseContinuous: +mse(B, b).toFixed(5), diff95: [+bs[25].toFixed(6), +bs[974].toFixed(6)] };
}
// 2. arena scorekeepers: event traits road-only vs all games with a partially pooled arena factor
const EVK = { forecheck: [0, 3], pressure: [1, 2, 4, 5], give: [8] };
function eventTraits(games) {
  const arena = {}, team = {};
  for (const g of games) { if (!g.ev) continue; const tot = g.ev[0].reduce((a, b) => a + b, 0) + g.ev[1].reduce((a, b) => a + b, 0); const a = (arena[g.home] ??= { e: 0, n: 0 }); a.e += tot; a.n++; }
  const lg = mean(Object.values(arena).map((a) => a.e / a.n)), K = 20;
  const factor = Object.fromEntries(Object.entries(arena).map(([t, a]) => [t, 1 + (a.e / a.n / lg - 1) * (a.n / (a.n + K))]));
  for (const g of games) { if (!g.ev) continue; [g.home, g.away].forEach((t, i) => { const x = (team[t] ??= { road: {}, all: {}, nr: 0, na: 0 });
    for (const [k, idx] of Object.entries(EVK)) { const v = idx.reduce((s, j) => s + g.ev[i][j], 0); if (i === 1) { x.road[k] = (x.road[k] || 0) + v; } x.all[k] = (x.all[k] || 0) + (i === 0 ? v / factor[g.home] : v); }
    if (i === 1) x.nr++; x.na++; }); }
  return Object.fromEntries(Object.entries(team).map(([t, x]) => [t, Object.fromEntries(Object.keys(EVK).flatMap((k) => [[`road_${k}`, x.road[k] / Math.max(1, x.nr)], [`all_${k}`, x.all[k] / Math.max(1, x.na)]]))]));
}
const E = seasons.map((s) => eventTraits(bySeason[s])), common = Object.keys(E[0]).filter((t) => E[1][t]);
const arena = Object.fromEntries(Object.keys(EVK).map((k) => [k, { roadOnly: +corr(common.map((t) => E[0][t][`road_${k}`]), common.map((t) => E[1][t][`road_${k}`])).toFixed(3),
  allGamesArenaAdjusted: +corr(common.map((t) => E[0][t][`all_${k}`]), common.map((t) => E[1][t][`all_${k}`])).toFixed(3) }]));
const contWins = Object.values(continuous).every((c) => c.diff95[1] < 0);
const out = { model: "Team style follow-ups", builtAt: new Date().toISOString(), seasons, continuous, arenaYearToYear: arena,
  decision: `${contWins ? "Continuous matchups beat no-matchup out of season: candidate (needs approval before entering odds)." : "Continuous matchups don't beat no-matchup out of season either: no matchup term in any odds."} Arena: ${Object.entries(arena).map(([k, v]) => `${k} ${v.allGamesArenaAdjusted > v.roadOnly ? "all games + arena factor repeats better" : "road-only repeats as well or better"}`).join("; ")}.` };
console.log(JSON.stringify(out, null, 1));
await writeFile("model/styleContinuous.json", JSON.stringify(out));
const sc = JSON.parse(await readFile("model/scorecards.json", "utf8")); sc.styleContinuous = out; await writeFile("model/scorecards.json", JSON.stringify(sc));
