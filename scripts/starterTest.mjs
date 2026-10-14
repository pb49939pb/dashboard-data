// Starting-goalie model (audit section 4: "forecast start-share distributions, not a fixed rule in all contexts").
// For every team-game of a finished season (from each team's 6th game): does the team's main goalie so far (most
// starts before tonight) start? Context known before the game: second night of a back-to-back, days since he last
// started, his starts in the previous 7 days, whether he started the team's last game, home, and his share of starts
// so far. Compared with the fixed rule the roster-aware simulation uses (main goalie 63%, 37% on back-to-backs).
// Logistic fit on the first half of the season, scored on the second; 95% interval by resampling team-games.
//   node scripts/starterTest.mjs 20252026     -> model/scorecards.json (starters) + model/starterModel.json
import { readFile, writeFile, readdir } from "node:fs/promises";

const season = process.argv[2] || "20252026";
const dir = `public/hockey/seasons/${season}/teams`, by = new Map();
for (const f of await readdir(dir)) for (const g of JSON.parse(await readFile(`${dir}/${f}`, "utf8")).games || []) if (String(g.id).slice(4, 6) === "02" && g.shots) by.set(g.id, g);
const games = [...by.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
const starter = (g, side) => { const s = g.shots.find((x) => x[3] === 1 - side && x[6]); return s ? String(s[6]) : null; };
const T = {};
for (const g of games) [g.home, g.away].forEach((t, side) => (T[t] ??= []).push({ date: g.date, st: starter(g, side), home: side === 0 }));
const day = (d) => new Date(d + "T12:00:00Z").getTime() / 864e5;
const rows = [];
for (const xs of Object.values(T)) {
  const starts = {};
  xs.forEach((x, i) => {
    if (i >= 5 && x.st) {
      const prim = Object.entries(starts).sort((a, b) => b[1] - a[1])[0][0], prev = xs[i - 1];
      const last = [...xs.slice(0, i)].reverse().find((y) => y.st === prim);
      const rest = last ? day(x.date) - day(last.date) : 10;
      const wk = xs.slice(0, i).filter((y) => y.st === prim && day(x.date) - day(y.date) <= 7).length;
      rows.push({ date: x.date, y: x.st === prim ? 1 : 0, b2b: day(x.date) - day(prev.date) === 1 ? 1 : 0, rest: Math.min(rest, 7), wk, lastStarted: prev.st === prim ? 1 : 0, home: x.home ? 1 : 0, share: starts[prim] / i });
    }
    if (x.st) starts[x.st] = (starts[x.st] || 0) + 1;
  });
}
function logit(X, y) {
  let b = new Array(X[0].length).fill(0);
  for (let it = 0; it < 60; it++) {
    const k = b.length, g = new Array(k).fill(0), H = Array.from({ length: k }, () => new Array(k).fill(0));
    X.forEach((x, i) => { const p = 1 / (1 + Math.exp(-x.reduce((s, v, j) => s + v * b[j], 0))); for (let a = 0; a < k; a++) { g[a] += (y[i] - p) * x[a]; for (let c = 0; c < k; c++) H[a][c] += p * (1 - p) * x[a] * x[c]; } });
    for (let a = 1; a < k; a++) { H[a][a] += 1; g[a] -= b[a]; } // light ridge (not on the intercept)
    H[0][0] += 1e-6;
    const M = H.map((r, i) => [...r, g[i]]);
    for (let i = 0; i < k; i++) { let pv = i; for (let r = i + 1; r < k; r++) if (Math.abs(M[r][i]) > Math.abs(M[pv][i])) pv = r; [M[i], M[pv]] = [M[pv], M[i]]; for (let r = 0; r < k; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c <= k; c++) M[r][c] -= f * M[i][c]; } }
    const d = M.map((r, i) => r[k] / r[i]); b = b.map((v, i) => v + d[i]);
    if (d.every((v) => Math.abs(v) < 1e-9)) break;
  }
  return b;
}
rows.sort((a, b) => a.date.localeCompare(b.date));
const FEATS = ["b2b", "rest", "wk", "lastStarted", "home", "share"];
const X = (r) => [1, ...FEATS.map((k) => r[k])];
const mid = rows[Math.floor(rows.length / 2)].date, A = rows.filter((r) => r.date < mid), B = rows.filter((r) => r.date >= mid);
const b = logit(A.map(X), A.map((r) => r.y));
const ll = (p, y) => { p = Math.min(1 - 1e-6, Math.max(1e-6, p)); return -(y ? Math.log(p) : Math.log(1 - p)); };
const pm = (r) => 1 / (1 + Math.exp(-X(r).reduce((s, v, j) => s + v * b[j], 0))), pr = (r) => (r.b2b ? 0.37 : 0.633);
const dm = B.map((r) => ll(pm(r), r.y)), dr = B.map((r) => ll(pr(r), r.y)), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
let seed = 3; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const d = dm.map((v, i) => v - dr[i]), bs = []; for (let k = 0; k < 2000; k++) { let s = 0; for (let i = 0; i < d.length; i++) s += d[Math.floor(rand() * d.length)]; bs.push(s / d.length); } bs.sort((x, y) => x - y);
const out = { model: "Starting goalie", season, builtAt: new Date().toISOString(), teamGames: rows.length, testTeamGames: B.length, splitDate: mid, features: FEATS, coef: Object.fromEntries(["intercept", ...FEATS].map((k, i) => [k, +b[i].toFixed(4)])),
  logLoss: { model: +mean(dm).toFixed(5), fixedRule: +mean(dr).toFixed(5) }, modelVsRule95: [+bs[50].toFixed(5), +bs[1949].toFixed(5)], mainStartRate: +mean(rows.map((r) => r.y)).toFixed(3) };
out.decision = out.modelVsRule95[1] < 0 ? "promote: the context model forecasts starters better than the fixed rule (roster-aware simulation)" : "keep the fixed rule";
console.log(JSON.stringify(out, null, 1));
if (out.modelVsRule95[1] < 0) { const all = logit(rows.map(X), rows.map((r) => r.y)); await writeFile("model/starterModel.json", JSON.stringify({ builtAt: out.builtAt, season, features: FEATS, coef: all.map((v) => +v.toFixed(5)) })); }
const sc = JSON.parse(await readFile("model/scorecards.json", "utf8")); sc.starters = out; await writeFile("model/scorecards.json", JSON.stringify(sc));
