// Chronological backtest of Hockey Lab's pre-game win odds (audit A5). For every day of a finished season, team ratings
// are rebuilt from ONLY the games played before that day (sim.mjs teamRatings, the production code), then that day's
// games are predicted (sim.mjs winProbability) and scored against the result.
//   Leakage controls: neutral team priors (last season's ratings weren't archived as of then); league scoring rate and
//   home edge estimated from earlier games only. Two flagged leaks remain: the score-state weights in model/ratings.json
//   were fit on seasons that include the test season, and the archived shots' xG comes from a model trained on it too.
//   So the "goals" variant (ratings from goals, no xG) is the clean one and the "xG" variant is optimistic.
//   Baselines: coin flip, home win rate so far, and log5 of points % so far with that home edge.
//   node scripts/backtest.mjs [season]      → model/scorecards.json (games part, plus model/xgScorecard.json from
//   hockey-models' `python -m hockey.scorecard`); copied to public/hockey and published nightly
import { readFile, writeFile, readdir } from "node:fs/promises";
import { teamRatings, winProbability } from "./sim.mjs";

const season = process.argv[2] || "20252026";
const dir = `public/hockey/seasons/${season}/teams`;
const byId = new Map();
for (const f of await readdir(dir)) {
  const d = JSON.parse(await readFile(`${dir}/${f}`, "utf8"));
  for (const g of d.games || []) if (String(g.id).slice(4, 6) === "02" && g.shots) byId.set(g.id, g);
}
const games = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
const ratingsFile = JSON.parse(await readFile("model/ratings.json", "utf8"));
const teams = [...new Set(games.flatMap((g) => [g.home, g.away]))];
const neutral = Object.fromEntries(teams.map((t) => [t, { off: 1, def: 1, fin: 1, gk: 1 }]));
const goalsOnly = (g) => ({ ...g, shots: g.shots.map((s) => { const r = [...s]; if (r[2] !== "b" && r[4] !== null) r[4] = r[2] === "g" ? 1 : 0; return r; }) });

const clip = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const ll = (p, y) => -(y ? Math.log(clip(p)) : Math.log(1 - clip(p)));
const preds = { coin: [], home: [], log5: [], goals: [], xg: [] }, ys = [], meta = [];
const dates = [...new Set(games.map((g) => g.date))];
let before = [];
for (const d of dates) {
  const today = games.filter((g) => g.date === d);
  if (before.length >= 32) { // need some history: about one game per team
    const teamGames = before.length * 2;
    const mu = before.reduce((a, g) => a + g.shots.filter((s) => s[2] !== "b" && s[4] !== null && s[4] !== 0.9).reduce((x, s) => x + s[4], 0), 0) / teamGames;
    const muG = before.reduce((a, g) => a + g.shots.filter((s) => s[2] === "g").length, 0) / teamGames;
    const homeWins = before.filter((g) => g.hs > g.as).length / before.length;
    const h = Math.sqrt(Math.max(0.8, Math.min(1.25, homeWins / (1 - homeWins)))) ** 0.5; // goal-rate edge from the win edge (dampened)
    const base = { weights: ratingsFile.weights, prior: neutral, home: h };
    const Rx = teamRatings(before, { ...base, mu }, null);
    const Rg = teamRatings(before.map(goalsOnly), { ...base, mu: muG }, null);
    const rec = {};
    for (const g of before) for (const [t, w] of [[g.home, g.hs > g.as], [g.away, g.as > g.hs]]) { const r = (rec[t] ??= { w: 0, n: 0 }); r.n++; r.w += w ? 1 : 0; }
    const pct = (t) => ((rec[t]?.w ?? 0) + 5) / ((rec[t]?.n ?? 0) + 10); // 10 games of .500 mixed in
    for (const g of today) {
      const y = g.hs > g.as ? 1 : 0;
      const a = pct(g.home), b = pct(g.away), l5 = (a * (1 - b)) / (a * (1 - b) + b * (1 - a));
      const hOdds = homeWins / (1 - homeWins), l5h = (l5 * hOdds) / (l5 * hOdds + (1 - l5));
      const px = winProbability(Rx, g.home, g.away)?.home, pg = winProbability(Rg, g.home, g.away)?.home;
      if (px == null || pg == null) continue;
      preds.coin.push(0.5); preds.home.push(homeWins); preds.log5.push(l5h); preds.goals.push(pg); preds.xg.push(px);
      ys.push(y); meta.push({ id: g.id, date: d, n: before.length });
    }
  }
  before = before.concat(today);
}

const summary = (p, idx = ys.map((_, i) => i)) => {
  const y = idx.map((i) => ys[i]), q = idx.map((i) => p[i]);
  const L = q.reduce((a, v, i) => a + ll(v, y[i]), 0) / q.length, B = q.reduce((a, v, i) => a + (v - y[i]) ** 2, 0) / q.length;
  const acc = q.reduce((a, v, i) => a + ((v > 0.5) === (y[i] === 1) ? 1 : 0), 0) / q.length;
  return { n: q.length, log_loss: +L.toFixed(5), brier: +B.toFixed(5), accuracy: +acc.toFixed(4) };
};
const bins = (p) => { const out = []; for (let k = 0; k < 10; k++) { const lo = k / 10, hi = (k + 1) / 10; const i = ys.map((_, j) => j).filter((j) => p[j] >= lo && (p[j] < hi || (k === 9 && p[j] <= 1))); if (i.length) out.push({ bin: `${lo.toFixed(1)}-${hi.toFixed(1)}`, pred: +(i.reduce((a, j) => a + p[j], 0) / i.length).toFixed(3), actual: +(i.reduce((a, j) => a + ys[j], 0) / i.length).toFixed(3), n: i.length }); } return out; };
// paired bootstrap over games (each game is one row here) of the log-loss difference vs the home baseline
let seed = 20261013; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const diffCI = (p, q) => { const d = ys.map((y, i) => ll(p[i], y) - ll(q[i], y)), out = []; for (let b = 0; b < 2000; b++) { let s = 0; for (let k = 0; k < d.length; k++) s += d[Math.floor(rand() * d.length)]; out.push(s / d.length); } out.sort((a, b) => a - b); return [+out[50].toFixed(5), +out[1949].toFixed(5)]; };
const early = ys.map((_, i) => i).filter((i) => meta[i].n < 32 * 10), late = ys.map((_, i) => i).filter((i) => meta[i].n >= 32 * 10);
const names = { coin: "Coin flip", home: "Home win rate so far", log5: "Points % head to head (log5) + home edge", goals: "Hockey Lab ratings from goals (clean)", xg: "Hockey Lab ratings from xG (production; optimistic, see leakage)" };
const result = {
  model: "Pre-game win probability", version: "legacy_v1 (sim.mjs teamRatings + winProbability)", season, builtAt: new Date().toISOString(),
  method: "Walk-forward: each day's games predicted from ratings built only on earlier games; neutral team priors; mu and home edge from earlier games.",
  leakage: ["score-state weights (model/ratings.json) were fit including this season", "archived xG comes from a model trained including this season: the xG variant is optimistic; the goals variant avoids it"],
  outcome: "home team wins (including OT and shootout)",
  models: Object.fromEntries(Object.entries(preds).map(([k, p]) => [names[k], { all: summary(p), first10GamesPerTeam: summary(p, early), after: summary(p, late) }])),
  logLossDiffVsHomeRate95: Object.fromEntries(["log5", "goals", "xg"].map((k) => [names[k], diffCI(preds[k], preds.home)])),
  reliability: Object.fromEntries(["goals", "xg", "log5"].map((k) => [names[k], bins(preds[k])])),
};
// one committed file, model/scorecards.json, holds every scorecard (the nightly build copies it out and publishes it)
let out = {};
try { out = JSON.parse(await readFile("model/scorecards.json", "utf8")); } catch {}
out.games = result;
try { out.xg = JSON.parse(await readFile("model/xgScorecard.json", "utf8")); } catch {}
out.builtAt = new Date().toISOString();
await writeFile("model/scorecards.json", JSON.stringify(out));
for (const [k, v] of Object.entries(result.models)) console.log(`${k}: LL ${v.all.log_loss} Brier ${v.all.brier} acc ${v.all.accuracy} (n ${v.all.n}; after 10 GP: LL ${v.after.log_loss})`);
console.log("log-loss diff vs home-rate baseline, 95% CI (negative = better):", JSON.stringify(result.logLossDiffVsHomeRate95));
