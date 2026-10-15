// Shot-quality standings (F02): the points each team would have earned if every game's shots had gone in at their
// expected rate, holding the shots themselves fixed. Same idea as the recap's "deserved to win" replay, computed exactly:
// each side's regulation goals are a Poisson-binomial over its unblocked, non-empty-net shots' xG, so P(regulation win),
// P(loss) and P(tied after regulation) come out exactly (no simulation noise, deterministic). A tie is worth 1 point plus
// a coin flip for the second (regular-season overtime/shootout ~ coin flip, as in sim.mjs).
// Not "deserved" points: finishing and goaltending are partly real skills, and teams play differently with a lead.
// Each team also gets the spread of points the replay allows (sd), so gaps inside normal variation aren't called out.
// Check: does the first half's shot-quality points% predict the second half's actual points% better than the first
// half's actual points% does? (published as `test`, per finished season)
//   node scripts/xgStandings.mjs  -> public/hockey/xgStandings.json
import { readFile, readdir, writeFile } from "node:fs/promises";

const read = (p) => readFile(p, "utf8").then(JSON.parse, () => null);
async function gamesOf(dir) {
  const byId = new Map();
  for (const f of await readdir(dir).catch(() => [])) {
    const d = await read(`${dir}/${f}`);
    for (const g of d?.games || []) if (g.shots?.length && Number(String(g.id).slice(4, 6)) === 2) byId.set(g.id, g);
  }
  return [...byId.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}
/** Distribution of goals from independent shots (Poisson-binomial). */
function goalsDist(ps) {
  let d = [1];
  for (const p of ps) { const n = new Array(d.length + 1).fill(0); for (let k = 0; k < d.length; k++) { n[k] += d[k] * (1 - p); n[k + 1] += d[k] * p; } d = n; }
  return d;
}
function replay(g) {
  const reg = g.shots.filter((s) => s[4] != null && !s[13] && s[8] <= 3);
  const dh = goalsDist(reg.filter((s) => s[3] === 0).map((s) => s[4])), da = goalsDist(reg.filter((s) => s[3] === 1).map((s) => s[4]));
  let hw = 0, tie = 0;
  for (let i = 0; i < dh.length; i++) for (let j = 0; j < da.length; j++) { const p = dh[i] * da[j]; if (i > j) hw += p; else if (i === j) tie += p; }
  const aw = 1 - hw - tie;
  const pts = (w) => 2 * w + 1.5 * tie, sq = (w) => 4 * w + 2.5 * tie; // tie: 1 point, plus 1 more half the time
  const xg = [0, 1].map((sd) => reg.filter((s) => s[3] === sd).reduce((a, s) => a + s[4], 0));
  return { home: { x: pts(hw), v: sq(hw) - pts(hw) ** 2 }, away: { x: pts(aw), v: sq(aw) - pts(aw) ** 2 }, xg, n: reg.length };
}
/** 5v5 for/against for one side of a game: goals, shots on goal, unblocked xG (empty nets left out). */
function five(g, side) {
  const o = { gf: 0, ga: 0, sf: 0, sa: 0, xf: 0, xa: 0 };
  for (const s of g.shots) {
    if (s[7] !== "5v5" || s[13]) continue;
    const mine = s[3] === side;
    if (s[2] === "g" || s[2] === "s") { if (mine) o.sf++; else o.sa++; }
    if (s[2] === "g") { if (mine) o.gf++; else o.ga++; }
    if (s[4] != null) { if (mine) o.xf += s[4]; else o.xa += s[4]; }
  }
  return o;
}
const addFive = (a, b) => { for (const k of Object.keys(b)) a[k] = (a[k] || 0) + b[k]; return a; };
const actual = (g, side) => { const mine = side === 0 ? g.hs : g.as, theirs = side === 0 ? g.as : g.hs; return mine > theirs ? 2 : g.end && g.end !== "REG" ? 1 : 0; };

function table(games) {
  const T = {};
  for (const g of games) {
    const r = replay(g);
    for (const [side, team, rr] of [[0, g.home, r.home], [1, g.away, r.away]]) {
      const t = (T[team] ??= { team, gp: 0, pts: 0, xPts: 0, v: 0, xgf: 0, xga: 0, f5: {} });
      addFive(t.f5, five(g, side));
      t.gp++; t.pts += actual(g, side); t.xPts += rr.x; t.v += rr.v; t.xgf += r.xg[side]; t.xga += r.xg[1 - side];
    }
  }
  return Object.values(T).map((t) => {
    const sd = Math.sqrt(t.v), diff = t.pts - t.xPts;
    return { team: t.team, gp: t.gp, pts: t.pts, xPts: +t.xPts.toFixed(1), sd: +sd.toFixed(1), diff: +diff.toFixed(1), z: +(sd ? diff / sd : 0).toFixed(2),
      ptsPct: +(t.pts / (2 * t.gp)).toFixed(3), xPtsPct: +(t.xPts / (2 * t.gp)).toFixed(3), xgPctReg: +(t.xgf / (t.xgf + t.xga)).toFixed(3),
      // 5v5: goals, shots on goal and xG for/against (shooting and save luck, F07)
      five: { gf: t.f5.gf, ga: t.f5.ga, sf: t.f5.sf, sa: t.f5.sa, xf: +t.f5.xf.toFixed(2), xa: +t.f5.xa.toFixed(2) } };
  }).sort((a, b) => b.xPts - a.xPts);
}
/** First half -> second half: which predicts actual points% better, actual or shot-quality points%? */
function test(games) {
  const half = (g) => g.slice(0, Math.floor(g.length / 2));
  const teams = [...new Set(games.flatMap((g) => [g.home, g.away]))];
  const byTeam = Object.fromEntries(teams.map((t) => [t, games.filter((g) => g.home === t || g.away === t)]));
  const rows = teams.map((t) => {
    const gs = byTeam[t], a = half(gs), b = gs.slice(a.length);
    const pp = (list) => list.reduce((s, g) => s + actual(g, g.home === t ? 0 : 1), 0) / (2 * list.length);
    const xp = (list) => list.reduce((s, g) => { const r = replay(g); return s + (g.home === t ? r.home.x : r.away.x); }, 0) / (2 * list.length);
    return { a: pp(a), ax: xp(a), b: pp(b) };
  });
  const corr = (x, y) => { const mx = x.reduce((a, v) => a + v, 0) / x.length, my = y.reduce((a, v) => a + v, 0) / y.length;
    const c = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0), sx = Math.sqrt(x.reduce((a, v) => a + (v - mx) ** 2, 0)), sy = Math.sqrt(y.reduce((a, v) => a + (v - my) ** 2, 0)); return c / (sx * sy); };
  // how much repeats from the first half to the second at 5v5 (F07): chance share vs finishing, goaltending and PDO
  const fiveOf = (t, list) => list.reduce((a, g) => addFive(a, five(g, g.home === t ? 0 : 1)), {});
  const m = teams.map((t) => { const gs = byTeam[t], a = fiveOf(t, half(gs)), b = fiveOf(t, gs.slice(half(gs).length));
    const st = (o) => ({ xgPct: o.xf / (o.xf + o.xa), finish: (o.gf - o.xf) / o.sf, save: (o.xa - o.ga) / o.sa, pdo: o.gf / o.sf + 1 - o.ga / o.sa });
    return [st(a), st(b)]; });
  const rr = (k) => +corr(m.map((x) => x[0][k]), m.map((x) => x[1][k])).toFixed(3);
  return { teams: rows.length, rActual: +corr(rows.map((r) => r.a), rows.map((r) => r.b)).toFixed(3), rShotQuality: +corr(rows.map((r) => r.ax), rows.map((r) => r.b)).toFixed(3),
    repeat5v5: { xgPct: rr("xgPct"), finishing: rr("finish"), goaltending: rr("save"), pdo: rr("pdo") } };
}

const league = await read("public/hockey/league.json");
const out = { builtAt: new Date().toISOString(), season: String(league?.season || ""), method: "exact shot replay of regulation unblocked, non-empty-net shots; tie = 1 point + coin flip", seasons: {} };
const cur = await gamesOf("public/hockey/teams");
out.seasons[out.season] = { games: cur.length, teams: table(cur) };
for (const s of await readdir("public/hockey/seasons").catch(() => [])) {
  const gs = await gamesOf(`public/hockey/seasons/${s}/teams`);
  if (gs.length > 600) out.seasons[s] = { games: gs.length, teams: table(gs), test: test(gs) };
}
await writeFile("public/hockey/xgStandings.json", JSON.stringify(out));
console.log(Object.entries(out.seasons).map(([s, v]) => `${s}: ${v.games} games${v.test ? `, half-season test r(actual) ${v.test.rActual} vs r(shot quality) ${v.test.rShotQuality}` : ""}`).join("\n"));
