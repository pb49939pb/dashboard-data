// Regulation ties (follow-up to goalModelTest.mjs): independent Poisson under-predicts games tied after regulation.
// Two full seasons, each walked forward (ratings from earlier games only). A tie adjustment d (each tied score's
// probability x (1 + d), renormalized) is calibrated to one season's tie share and scored on the other, both directions:
// 3-way regulation result log loss vs plain Poisson (95% interval by resampling games), and predicted vs actual share
// of games going past regulation (which is what sets the league's 3-point games and so standings points).
//   node scripts/tieTest.mjs 20242025 20252026    -> model/tieModel.json (if it wins both ways) + scorecards (ties)
import { readFile, writeFile, readdir } from "node:fs/promises";
import { teamRatings, winProbability } from "./sim.mjs";

const SEASONS = process.argv.slice(2);
const ratingsFile = JSON.parse(await readFile("model/ratings.json", "utf8"));
async function walk(season) {
  const dir = `public/hockey/seasons/${season}/teams`, by = new Map();
  for (const f of await readdir(dir)) for (const g of JSON.parse(await readFile(`${dir}/${f}`, "utf8")).games || []) if (String(g.id).slice(4, 6) === "02" && g.shots) by.set(g.id, g);
  const games = [...by.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const teams = [...new Set(games.flatMap((g) => [g.home, g.away]))], neutral = Object.fromEntries(teams.map((t) => [t, { off: 1, def: 1, fin: 1, gk: 1 }]));
  const rows = []; let before = [];
  for (const d of [...new Set(games.map((g) => g.date))]) {
    const today = games.filter((g) => g.date === d);
    if (before.length >= 32) {
      const mu = before.reduce((a, g) => a + g.shots.filter((s) => s[2] !== "b" && s[4] !== null && s[4] !== 0.9).reduce((x, s) => x + s[4], 0), 0) / (before.length * 2);
      const hw = before.filter((g) => g.hs > g.as).length / before.length, h = Math.sqrt(Math.max(0.8, Math.min(1.25, hw / (1 - hw)))) ** 0.5;
      const R = teamRatings(before, { weights: ratingsFile.weights, prior: neutral, home: h, mu }, null);
      for (const g of today) { const p = winProbability(R, g.home, g.away); if (!p) continue; const reg = g.end && g.end !== "REG", hs = reg ? Math.min(g.hs, g.as) : g.hs, as = reg ? Math.min(g.hs, g.as) : g.as; rows.push({ lh: p.xgHome, la: p.xgAway, y: hs > as ? 0 : hs === as ? 1 : 2 }); }
    }
    before = before.concat(today);
  }
  return rows;
}
const po = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
function three(lh, la, d) { let h = 0, a = 0, t = 0; for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) { const p = po(lh, i) * po(la, j); if (i > j) h += p; else if (j > i) a += p; else t += p * (1 + d); } const s = h + a + t; return [h / s, t / s, a / s]; }
const tieShare = (R, d) => R.reduce((s, r) => s + three(r.lh, r.la, d)[1], 0) / R.length;
const calibrate = (R) => { const target = R.filter((r) => r.y === 1).length / R.length; let lo = 0, hi = 3; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (tieShare(R, m) < target) lo = m; else hi = m; } return (lo + hi) / 2; };
const data = Object.fromEntries(await Promise.all(SEASONS.map(async (s) => [s, await walk(s)])));
const out = { model: "Regulation ties", builtAt: new Date().toISOString(), seasons: SEASONS, directions: {} };
let seed = 11; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
for (const [a, b] of [[SEASONS[0], SEASONS[1]], [SEASONS[1], SEASONS[0]]]) {
  const d = calibrate(data[a]), B = data[b];
  const l0 = B.map((r) => -Math.log(three(r.lh, r.la, 0)[r.y])), l1 = B.map((r) => -Math.log(three(r.lh, r.la, d)[r.y])), diff = l1.map((v, i) => v - l0[i]);
  const bs = []; for (let k = 0; k < 2000; k++) { let s = 0; for (let i = 0; i < diff.length; i++) s += diff[Math.floor(rand() * diff.length)]; bs.push(s / diff.length); } bs.sort((x, y) => x - y);
  const m = (x) => x.reduce((s, v) => s + v, 0) / x.length;
  out.directions[`${a}->${b}`] = { d: +d.toFixed(3), trainTieShare: +(data[a].filter((r) => r.y === 1).length / data[a].length).toFixed(3), testTieShare: +(B.filter((r) => r.y === 1).length / B.length).toFixed(3),
    predictedTiePoisson: +tieShare(B, 0).toFixed(3), predictedTieAdjusted: +tieShare(B, d).toFixed(3), logLossPoisson: +m(l0).toFixed(5), logLossAdjusted: +m(l1).toFixed(5), diff95: [+bs[50].toFixed(5), +bs[1949].toFixed(5)] };
}
const wins = Object.values(out.directions).every((x) => x.diff95[1] < 0);
out.decision = wins ? "Tie adjustment wins out of season in both directions: adopt in the season simulation" : "Tie adjustment doesn't clearly win both ways: no change";
if (wins) { const dAll = calibrate([...data[SEASONS[0]], ...data[SEASONS[1]]]); out.dAdopted = +dAll.toFixed(3); await writeFile("model/tieModel.json", JSON.stringify({ builtAt: out.builtAt, seasons: SEASONS, d: out.dAdopted })); }
console.log(JSON.stringify(out, null, 1));
const sc = JSON.parse(await readFile("model/scorecards.json", "utf8")); sc.ties = out; await writeFile("model/scorecards.json", JSON.stringify(sc));
