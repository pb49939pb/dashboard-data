// Team form vs roster strength (audit 7.1): how much should a game's odds lean on the team ratings built from this
// season's games ("form") vs the value of the players who dress ("roster", WAR-lite frozen before the season)?
// Walk-forward over a finished season (ratings from earlier games only). Logistic models fit on the first half of the
// games, scored on the second (and the reverse direction for a second look):
//   form      logit of the ratings' home-win probability
//   roster    tonight's lineup value difference (18 skaters + starting goalie, wins per 82)
//   blend     both
//   blend+t   both, with the roster term allowed to fade as games accumulate (x 1 / (1 + games / 20))
// 95% intervals by resampling games. The calibrated weight is reported; a blend is promoted only if it beats form
// alone with an interval excluding 0.
//   node scripts/blendTest.mjs 20252026 /path/pv_through_20242025.json  -> model/scorecards.json (blend)
import { readFile, writeFile, readdir } from "node:fs/promises";
import { teamRatings, winProbability } from "./sim.mjs";

const season = process.argv[2] || "20252026";
const pv = JSON.parse(await readFile(process.argv[3], "utf8"));
const val = new Map(pv.players.map((p) => [String(p.id), p.group === "G" ? p.war82 / Math.max(0.2, p.startShare || 0.5) : p.war82]));
const dir = `public/hockey/seasons/${season}/teams`, by = new Map();
for (const f of await readdir(dir)) for (const g of JSON.parse(await readFile(`${dir}/${f}`, "utf8")).games || []) if (String(g.id).slice(4, 6) === "02" && g.shots && g.players) by.set(g.id, g);
const games = [...by.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
const ratingsFile = JSON.parse(await readFile("model/ratings.json", "utf8"));
const teams = [...new Set(games.flatMap((g) => [g.home, g.away]))], neutral = Object.fromEntries(teams.map((t) => [t, { off: 1, def: 1, fin: 1, gk: 1 }]));
const lineup = (g, side) => { let v = 0; for (const [id, p] of Object.entries(g.players)) if (p[2] === side && p[1] !== "G") v += val.get(id) ?? 0; const s = g.shots.find((x) => x[3] === 1 - side && x[6]); return v + (s ? val.get(String(s[6])) ?? 0 : 0); };
const rows = [];
let before = [];
const gp = {};
for (const d of [...new Set(games.map((g) => g.date))]) {
  const today = games.filter((g) => g.date === d);
  if (before.length >= 32) {
    const mu = before.reduce((a, g) => a + g.shots.filter((s) => s[2] !== "b" && s[4] !== null && s[4] !== 0.9).reduce((x, s) => x + s[4], 0), 0) / (before.length * 2);
    const hw = before.filter((g) => g.hs > g.as).length / before.length, h = Math.sqrt(Math.max(0.8, Math.min(1.25, hw / (1 - hw)))) ** 0.5;
    const R = teamRatings(before, { weights: ratingsFile.weights, prior: neutral, home: h, mu }, null);
    for (const g of today) {
      const p = winProbability(R, g.home, g.away)?.home;
      if (p == null) continue;
      const n = ((gp[g.home] || 0) + (gp[g.away] || 0)) / 2;
      rows.push({ date: d, y: g.hs > g.as ? 1 : 0, form: Math.log(p / (1 - p)), roster: lineup(g, 0) - lineup(g, 1), fade: 1 / (1 + n / 20) });
    }
  }
  for (const g of today) { gp[g.home] = (gp[g.home] || 0) + 1; gp[g.away] = (gp[g.away] || 0) + 1; }
  before = before.concat(today);
}
/** Logistic regression by Newton's method. X rows include the intercept. */
function logit(X, y) {
  let b = new Array(X[0].length).fill(0);
  for (let it = 0; it < 50; it++) {
    const k = b.length, g = new Array(k).fill(0), H = Array.from({ length: k }, () => new Array(k).fill(0));
    X.forEach((x, i) => { const p = 1 / (1 + Math.exp(-x.reduce((s, v, j) => s + v * b[j], 0))); for (let a = 0; a < k; a++) { g[a] += (y[i] - p) * x[a]; for (let c = 0; c < k; c++) H[a][c] += p * (1 - p) * x[a] * x[c]; } });
    for (let a = 0; a < k; a++) H[a][a] += 1e-6;
    // solve H d = g (Gauss)
    const M = H.map((r, i) => [...r, g[i]]);
    for (let i = 0; i < k; i++) { let piv = i; for (let r = i + 1; r < k; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r; [M[i], M[piv]] = [M[piv], M[i]]; for (let r = 0; r < k; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c <= k; c++) M[r][c] -= f * M[i][c]; } }
    const d = M.map((r, i) => r[k] / r[i]);
    b = b.map((v, i) => v + d[i]);
    if (d.every((v) => Math.abs(v) < 1e-8)) break;
  }
  return b;
}
const feats = { form: (r) => [1, r.form], roster: (r) => [1, r.roster], blend: (r) => [1, r.form, r.roster], "blend+t": (r) => [1, r.form, r.roster, r.roster * r.fade] };
const mid = rows[Math.floor(rows.length / 2)].date, H1 = rows.filter((r) => r.date < mid), H2 = rows.filter((r) => r.date >= mid);
const ll = (b, f, r) => { const p = 1 / (1 + Math.exp(-f(r).reduce((s, v, j) => s + v * b[j], 0))); return -(r.y ? Math.log(p) : Math.log(1 - p)); };
let seed = 20261014; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const out = { model: "Team form vs roster strength", season, builtAt: new Date().toISOString(), games: rows.length, splitDate: mid, directions: {} };
for (const [tr, te, label] of [[H1, H2, "first half → second"], [H2, H1, "second half → first"]]) {
  const res = {}, per = {};
  for (const [k, f] of Object.entries(feats)) { const b = logit(tr.map(f), tr.map((r) => r.y)); per[k] = te.map((r) => ll(b, f, r)); res[k] = { coef: b.map((v) => +v.toFixed(4)), logLoss: +(per[k].reduce((a, c) => a + c, 0) / te.length).toFixed(5) }; }
  for (const k of ["roster", "blend", "blend+t"]) { const d = per[k].map((v, i) => v - per.form[i]), bs = []; for (let i = 0; i < 2000; i++) { let s = 0; for (let j = 0; j < d.length; j++) s += d[Math.floor(rand() * d.length)]; bs.push(s / d.length); } bs.sort((a, c) => a - c); res[k].vsForm95 = [+bs[50].toFixed(5), +bs[1949].toFixed(5)]; }
  out.directions[label] = res;
}
const wins = Object.values(out.directions).every((r) => r.blend.vsForm95[1] < 0 || r["blend+t"].vsForm95[1] < 0);
out.decision = wins ? "A form + roster blend beats form alone in both directions: candidate for the game odds" : "Form alone is not beaten with an interval excluding 0 in both directions: no blend yet (the lineup-gap adjustment in the roster-aware simulation stays in shadow)";
console.log(JSON.stringify(out, null, 1));
const sc = JSON.parse(await readFile("model/scorecards.json", "utf8")); sc.blend = out; await writeFile("model/scorecards.json", JSON.stringify(sc));
