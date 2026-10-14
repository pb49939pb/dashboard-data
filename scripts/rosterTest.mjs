// Does knowing who dresses improve the pre-game odds? (audit: roster-aware simulator). Walk-forward over a finished
// season with the production rating code (sim.mjs, as in backtest.mjs: neutral priors, earlier games only), then each
// game's expected goals are moved by how far tonight's lineup is from the lineup the team has iced so far:
//   lineup value  = WAR-lite per 82 of the 18 skaters who dressed + the starting goalie's WAR per 82 starts
//                   (unknown players = replacement, 0)
//   gap           = tonight's lineup value − the team's average lineup value in its earlier games (needs 3)
//   goal margin   = k × (home gap − away gap) × goals per win / 82, split evenly between the two sides' expected goals
// Player values are point in time: built from seasons up to the one BEFORE the test season (hockey-models
// player_value.build(through)), passed as argv[3]. Lineups are the realized ones (known at puck drop: projected lines
// and confirmed starters are public that morning). k is fit on the first half of the season and scored on the second;
// k = 1 (the value scale taken at face value, nothing fit) is scored on every game. Ablations: skaters only, goalie only.
//   node scripts/rosterTest.mjs 20252026 /path/pv_through_20242025.json   → model/scorecards.json (roster part)
import { readFile, writeFile, readdir } from "node:fs/promises";
import { teamRatings, winProbability } from "./sim.mjs";

const season = process.argv[2] || "20252026";
const pv = JSON.parse(await readFile(process.argv[3], "utf8"));
const val = new Map(pv.players.map((p) => [String(p.id), p.group === "G" ? p.war82 / Math.max(0.2, p.startShare || 0.5) : p.war82]));
const GPW = pv.goalsPerWin || 6;
const dir = `public/hockey/seasons/${season}/teams`;
const byId = new Map();
for (const f of await readdir(dir)) {
  const d = JSON.parse(await readFile(`${dir}/${f}`, "utf8"));
  for (const g of d.games || []) if (String(g.id).slice(4, 6) === "02" && g.shots && g.players) byId.set(g.id, g);
}
const games = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
const ratingsFile = JSON.parse(await readFile("model/ratings.json", "utf8"));
const teams = [...new Set(games.flatMap((g) => [g.home, g.away]))];
const neutral = Object.fromEntries(teams.map((t) => [t, { off: 1, def: 1, fin: 1, gk: 1 }]));
const goalsOnly = (g) => ({ ...g, shots: g.shots.map((s) => { const r = [...s]; if (r[2] !== "b" && r[4] !== null) r[4] = r[2] === "g" ? 1 : 0; return r; }) });

/** [skater value, starting goalie value] for one side (0 home, 1 away). */
function lineup(g, side) {
  let sk = 0;
  for (const [id, p] of Object.entries(g.players)) if (p[2] === side && p[1] !== "G") sk += val.get(id) ?? 0;
  const first = g.shots.find((s) => s[3] === 1 - side && s[6]); // the goalie facing the opponent's first shot
  const gid = first ? String(first[6]) : Object.entries(g.players).find(([, p]) => p[2] === side && p[1] === "G")?.[0];
  return [sk, gid ? val.get(gid) ?? 0 : 0];
}

const clip = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const ll = (p, y) => -(y ? Math.log(clip(p)) : Math.log(1 - clip(p)));
const KS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const rows = []; // {date, y, half, base: {goals, xg}, gap: {all, sk, g}: [home, away]}
const hist = {}; // team -> [[sk, g], ...] earlier games
const dates = [...new Set(games.map((g) => g.date))];
let before = [];
for (const d of dates) {
  const today = games.filter((g) => g.date === d);
  if (before.length >= 32) {
    const teamGames = before.length * 2;
    const mu = before.reduce((a, g) => a + g.shots.filter((s) => s[2] !== "b" && s[4] !== null && s[4] !== 0.9).reduce((x, s) => x + s[4], 0), 0) / teamGames;
    const muG = before.reduce((a, g) => a + g.shots.filter((s) => s[2] === "g").length, 0) / teamGames;
    const homeWins = before.filter((g) => g.hs > g.as).length / before.length;
    const h = Math.sqrt(Math.max(0.8, Math.min(1.25, homeWins / (1 - homeWins)))) ** 0.5;
    const base = { weights: ratingsFile.weights, prior: neutral, home: h };
    const R = { xg: teamRatings(before, { ...base, mu }, null), goals: teamRatings(before.map(goalsOnly), { ...base, mu: muG }, null) };
    for (const g of today) {
      const gap = { all: [0, 0], sk: [0, 0], g: [0, 0] };
      [g.home, g.away].forEach((t, side) => {
        const hs = hist[t] || [];
        if (hs.length < 3) return;
        const [sk, gv] = lineup(g, side), msk = hs.reduce((a, x) => a + x[0], 0) / hs.length, mg = hs.reduce((a, x) => a + x[1], 0) / hs.length;
        gap.sk[side] = sk - msk; gap.g[side] = gv - mg; gap.all[side] = gap.sk[side] + gap.g[side];
      });
      const b = {};
      for (const m of ["xg", "goals"]) { const r = winProbability(R[m], g.home, g.away); if (!r) continue; b[m] = { xh: r.xgHome, xa: r.xgAway }; }
      if (!b.xg || !b.goals) continue;
      rows.push({ date: d, y: g.hs > g.as ? 1 : 0, base: b, gap, n: before.length });
    }
  }
  for (const g of today) [g.home, g.away].forEach((t, side) => (hist[t] ??= []).push(lineup(g, side)));
  before = before.concat(today);
}
const mid = rows[Math.floor(rows.length / 2)].date;
rows.forEach((r) => (r.half = r.date < mid ? 1 : 2));

/** home win probability for a row under rating variant m, gap kind, scale k. */
const Rmini = { mu: 1, home: 1, teams: { H: { off: 1, def: 1, fin: 1, gk: 1 }, A: { off: 1, def: 1, fin: 1, gk: 1 } } };
function pOf(r, m, kind, k) {
  const { xh, xa } = r.base[m], margin = k * (r.gap[kind][0] - r.gap[kind][1]) * GPW / 82;
  const lh = Math.max(0.5, xh + margin / 2), la = Math.max(0.5, xa - margin / 2);
  return winProbability(Rmini, "H", "A", { home: lh, away: la }).home; // same game model, given expected goals
}
const LL = (idx, f) => idx.reduce((a, i) => a + ll(f(rows[i]), rows[i].y), 0) / idx.length;
const all = rows.map((_, i) => i), h1 = all.filter((i) => rows[i].half === 1), h2 = all.filter((i) => rows[i].half === 2);
let seed = 20261014; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const ci = (idx, f, g0) => { const d = idx.map((i) => ll(f(rows[i]), rows[i].y) - ll(g0(rows[i]), rows[i].y)), out = []; for (let b = 0; b < 2000; b++) { let s = 0; for (let j = 0; j < d.length; j++) s += d[Math.floor(rand() * d.length)]; out.push(s / d.length); } out.sort((a, b) => a - b); return [+out[50].toFixed(5), +out[1949].toFixed(5)]; };

const result = { model: "Lineup adjustment to pre-game odds", season, builtAt: new Date().toISOString(), games: rows.length, splitDate: mid,
  playerValues: `WAR-lite built through ${pv.season} only (point in time)`, goalsPerWin: GPW,
  method: "walk-forward ratings (earlier games only, neutral priors) + k × (tonight's lineup value − the team's average so far) × goals per win / 82 as a goal margin",
  caveats: ["lineups are the realized ones (public by puck drop)", "score-state weights and archived xG include the test season (xG variant optimistic; goals variant clean)"],
  variants: {} };
for (const m of ["goals", "xg"]) {
  const base = (r) => pOf(r, m, "all", 0), v = {};
  v.baselineLogLoss = { all: +LL(all, base).toFixed(5), secondHalf: +LL(h2, base).toFixed(5) };
  for (const kind of ["all", "sk", "g"]) {
    const grid = KS.map((k) => ({ k, firstHalf: +LL(h1, (r) => pOf(r, m, kind, k)).toFixed(5) }));
    const kFit = grid.reduce((a, b) => (b.firstHalf < a.firstHalf ? b : a)).k;
    v[kind] = { grid, kFitFirstHalf: kFit,
      secondHalfAtFit: { logLoss: +LL(h2, (r) => pOf(r, m, kind, kFit)).toFixed(5), diffVsBaseline95: ci(h2, (r) => pOf(r, m, kind, kFit), base) },
      allAtK1: { logLoss: +LL(all, (r) => pOf(r, m, kind, 1)).toFixed(5), diffVsBaseline95: ci(all, (r) => pOf(r, m, kind, 1), base) } };
  }
  result.variants[m] = v;
}
const gaps = rows.flatMap((r) => r.gap.all), sd = Math.sqrt(gaps.reduce((a, x) => a + x * x, 0) / gaps.length);
result.gapSd = +sd.toFixed(3);
console.log(JSON.stringify(result, null, 1));
let out = {};
try { out = JSON.parse(await readFile("model/scorecards.json", "utf8")); } catch {}
out.roster = result; out.builtAt = new Date().toISOString();
await writeFile("model/scorecards.json", JSON.stringify(out));

// Inputs for the roster-aware season simulation (scripts/rosterSim.mjs), all measured on this finished season:
//   k: the lineup scale fit above (goals variant, skaters + goalie)
//   otShare: tied games decided in overtime rather than a shootout (for the regulation + OT wins tiebreaker)
//   starts: how often a team's main goalie starts, on the second night of a back-to-back and otherwise
//   survival[n]: share of absences (2+ straight games out, or 1 for a top player; injuries.mjs) lasting n+ games
//   lastSeason: who dressed and who started in goal for each team, so the nightly job can value last season's lineups
//     with current player values (the team ratings lean on last season early on)
{
  const starter = (g, side) => { const s = g.shots.find((x) => x[3] === 1 - side && x[6]); return s ? String(s[6]) : null; };
  const T = {};
  for (const g of games) [g.home, g.away].forEach((t, side) => (T[t] ??= []).push({ g, side, date: g.date, st: starter(g, side) }));
  const b2b = [0, 0], other = [0, 0], lastSeason = {};
  for (const [t, xs] of Object.entries(T)) {
    const c = {}; xs.forEach((x) => (c[x.st] = (c[x.st] || 0) + 1));
    const prim = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
    xs.forEach((x, i) => { const p = xs[i - 1], back = p && new Date(x.date) - new Date(p.date) === 864e5, a = back ? b2b : other; a[0] += x.st === prim ? 1 : 0; a[1]++; });
    const dressed = {};
    for (const x of xs) for (const [id, p] of Object.entries(x.g.players)) if (p[2] === x.side && p[1] !== "G") dressed[id] = (dressed[id] || 0) + 1;
    lastSeason[t] = { games: xs.length, dressed, starts: Object.fromEntries(Object.entries(c).filter(([k]) => k !== "null")) };
  }
  let ot = 0, so = 0; for (const g of games) { if (g.end === "OT") ot++; else if (g.end === "SO") so++; }
  const inj = JSON.parse(await readFile(`model/injuries-${season}.json`, "utf8"));
  const L = Object.values(inj.teams).flatMap((t) => t.players.flatMap((p) => p.stretches.map((s) => s.games)));
  const survival = Array.from({ length: 83 }, (_, n) => +(L.filter((x) => x >= n).length / L.length).toFixed(4));
  const model = { builtAt: new Date().toISOString(), season, k: result.variants.goals.all.kFitFirstHalf, goalsPerWin: GPW,
    otShare: +(ot / (ot + so)).toFixed(3), starts: { primary: +(other[0] / other[1]).toFixed(3), primaryBackToBack: +(b2b[0] / b2b[1]).toFixed(3), n: other[1], nBackToBack: b2b[1] },
    absences: L.length, survival, lastSeason };
  await writeFile("model/rosterModel.json", JSON.stringify(model));
  console.log(`rosterModel: k ${model.k}, OT share ${model.otShare}, main goalie starts ${model.starts.primary} (back-to-back ${model.starts.primaryBackToBack}), ${L.length} absences`);
}
