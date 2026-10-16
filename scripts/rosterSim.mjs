// Roster-aware season simulation (audit: simulator with lineups, starting goalies, injuries). Runs after the injury
// build, next to the team-only simulation from redwings.mjs, on the same team ratings, schedule and standings.
// Each simulated season draws:
//   injuries: every player out now gets a return game, drawn from how long absences that had already lasted as long
//     ran in 2025-26 (model/rosterModel.json survival); until then the next-best player on the roster takes his slot
//   starting goalie: a context model (model/starterModel.json, scripts/starterTest.mjs: rest, back-to-backs, his starts
//     in the last week, whether he started the last game, home, his share so far) tracked game by game in each simulated
//     season; without the model file, the fixed rule (main goalie 63%, 37% on back-to-backs)
// and moves each game's expected goals by how far the expected lineup (best 12 forwards + 6 defensemen on the roster,
// by WAR-lite per 82, plus the starter's WAR per 82 starts) sits from the lineups behind the team's ratings (this
// season's dressed lineups, plus last season's counted like the ratings' 12-game prior), with the league-wide gap
// between "best 18 on the roster" and "who actually dressed" taken out:
//   goal margin = k × (home gap − away gap) × goals per win / 82, k = 0.5 (walk-forward fit, scripts/rosterTest.mjs)
// Shadow mode by default: published as projections.roster next to the team-only numbers, and its pre-game odds are
// logged for every game. The Admin switch (hockey/config simModel, default model/config.json) makes it primary.
//   node scripts/rosterSim.mjs
import { readFile, writeFile } from "node:fs/promises";
import { simulate, winProbability } from "./sim.mjs";
import { openStore } from "./store.mjs";

const read = (p) => readFile(p, "utf8").then(JSON.parse, () => null);
const [proj, inj, pv, M, fileCfg] = await Promise.all(["public/hockey/projections.json", "public/hockey/injuries.json", "model/playerValue.json", "model/rosterModel.json", "model/config.json"].map(read));
// the Admin switch (hockey/config in the database) wins over the repo default
const store = await openStore().catch(() => null);
const cfg = { ...(fileCfg || {}), ...((await store?.read("hockey/config").catch(() => null)) || {}) };
if (!proj?.ratings || !proj.schedule || !proj.standingsRows || !inj?.current?.rosters || !pv || !M) {
  console.log("roster sim: inputs missing (ratings, schedule, rosters, player values or roster model); skipped");
  process.exit(0);
}
const PRIOR_GAMES = 12; // sim.mjs: last season counts like 12 games of this one
const pvById = new Map(pv.players.map((p) => [String(p.id), p]));
const skVal = (id) => pvById.get(String(id))?.war82 ?? 0; // unknown = replacement
const gVal = (id) => { const p = pvById.get(String(id)); return p ? p.war82 / Math.max(0.2, p.startShare || 0.5) : 0; }; // per 82 starts
const grp = (pos) => (pos === "D" ? "D" : pos === "G" ? "G" : "F");
const R = proj.ratings, GPW = M.goalsPerWin || 6;
const teams = Object.keys(inj.current.rosters).filter((t) => R.teams[t]);

// this season's dressed lineups and starters, per team
async function thisSeason(t) {
  const d = await read(`public/hockey/teams/${t}.json`);
  const gs = (d?.games || []).filter((g) => g.players && g.shots && String(g.id).slice(4, 6) === "02");
  const dressed = {}, starts = {}, log = [];
  for (const g of [...gs].sort((a, b) => a.date.localeCompare(b.date))) {
    const side = g.home === t ? 0 : 1;
    for (const [id, p] of Object.entries(g.players)) if (p[2] === side && p[1] !== "G") dressed[id] = (dressed[id] || 0) + 1;
    const s = g.shots.find((x) => x[3] === 1 - side && x[6]);
    if (s) { starts[s[6]] = (starts[s[6]] || 0) + 1; log.push({ date: g.date, st: String(s[6]) }); }
  }
  return { games: gs.length, dressed, starts, log };
}
const perGame = (counts, games, f) => (games ? Object.entries(counts).reduce((a, [id, n]) => a + f(id) * n, 0) / games : 0);
const pStart = (b2b) => (b2b ? M.starts.primaryBackToBack : M.starts.primary);
// context starter model (scripts/starterTest.mjs: beat the fixed rule out of sample), else the fixed rule
const SM = await read("model/starterModel.json");
const dayN = (d) => new Date(d + "T12:00:00Z").getTime() / 864e5;
function pMain(st, x, i) {
  if (!SM) return pStart(x.b2b[i]);
  const d = dayN(x.dates[i]), last = st.primDates.length ? st.primDates[st.primDates.length - 1] : null;
  const f = { b2b: x.b2b[i] ? 1 : 0, rest: last == null ? 7 : Math.min(7, d - last), wk: st.primDates.filter((q) => d - q <= 7 && d > q).length, lastStarted: st.lastWasPrim ? 1 : 0, home: x.home[i] ? 1 : 0, share: x.mainShare };
  const z = SM.coef[0] + SM.features.reduce((a, k, j) => a + SM.coef[j + 1] * f[k], 0);
  return 1 / (1 + Math.exp(-z));
}

const T = {};
for (const t of teams) {
  const cur = await thisSeason(t), last = M.lastSeason[t] || { games: 0, dressed: {}, starts: {} };
  const blend = (f) => {
    const c = perGame(cur.dressed, cur.games, f), l = perGame(last.dressed, last.games, f);
    return last.games ? (cur.games * c + PRIOR_GAMES * l) / (cur.games + PRIOR_GAMES) : c;
  };
  const sumStarts = (s) => Object.values(s).reduce((a, b) => a + b, 0);
  const gl = (s) => perGame(s, sumStarts(s), gVal), gc = sumStarts(cur.starts), lg = sumStarts(last.starts);
  const baseG = lg ? (gc * (gc ? gl(cur.starts) : 0) + PRIOR_GAMES * gl(last.starts)) / (gc + PRIOR_GAMES) : gl(cur.starts);
  // a player who's out because he's in the minors (CapWages status) isn't an injury that heals: leave him off the NHL roster
  const minors = new Set((inj.current.teams[t]?.players || []).filter((p) => p.out && p.reason === "in the minors").map((p) => String(p.id)));
  const roster = inj.current.rosters[t].filter(([id]) => !minors.has(String(id))).map(([id, pos]) => ({ id: String(id), g: grp(pos), name: pvById.get(String(id))?.name || String(id) }));
  const outRows = new Map((inj.current.teams[t]?.players || []).filter((p) => p.out).map((p) => [String(p.id), p.stretches[p.stretches.length - 1].games]));
  const sk = roster.filter((p) => p.g !== "G").map((p) => ({ ...p, v: skVal(p.id), missed: outRows.get(p.id) ?? null })).sort((a, b) => b.v - a.v);
  const gk = roster.filter((p) => p.g === "G").map((p) => ({ ...p, v: gVal(p.id), share: pvById.get(p.id)?.startShare ?? 0, missed: outRows.get(p.id) ?? null })).sort((a, b) => b.share - a.share || b.v - a.v);
  const out = [...sk, ...gk].filter((p) => p.missed != null);
  out.forEach((p, i) => (p.bit = 1 << i));
  // remaining schedule: this team's game index and back-to-back flag per game
  const mine = proj.schedule.filter((g) => g.home === t || g.away === t).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const idx = new Map(mine.map((g, i) => [g.id, i])), b2b = mine.map((g, i) => i > 0 && new Date(g.date) - new Date(mine[i - 1].date) === 864e5);
  const dates = mine.map((g) => g.date), home = mine.map((g) => g.home === t);
  const mainId = gk[0]?.id, nStarts = Object.values(cur.starts).reduce((a, b) => a + b, 0);
  const mainShare = nStarts >= 5 ? (cur.starts[mainId] || 0) / nStarts : gk[0]?.share || 0.6; // his share of starts so far
  T[t] = { baseSk: blend(skVal), baseG, sk, gk, out, idx, b2b, dates, home, log: cur.log, mainShare, curGames: cur.games, lastGames: last.games };
}
/** Best 12 forwards + 6 defensemen among skaters not out (mask = bits of players still out). */
function lineupValue(x, mask) {
  let f = 0, d = 0, v = 0;
  for (const p of x.sk) {
    if (p.bit && mask & p.bit) continue;
    if (p.g === "F" && f < 12) { v += p.v; f++; } else if (p.g === "D" && d < 6) { v += p.v; d++; }
    if (f === 12 && d === 6) break;
  }
  return v;
}
/** Expected starter value: main goalie pStart, the next one the rest (a third goalie gets a tenth of that). */
function goalieChoices(x, mask, b2b, pMainStart = null) {
  const ok = x.gk.filter((p) => !(p.bit && mask & p.bit));
  if (!ok.length) return [[0, 1]];
  if (ok.length === 1) return [[ok[0].v, 1]];
  const p = pMainStart ?? pStart(b2b), rest = 1 - p;
  return ok.length === 2 ? [[ok[0].v, p], [ok[1].v, rest]] : [[ok[0].v, p], [ok[1].v, rest * 0.9], [ok[2].v, rest * 0.1]];
}
const fullMask = (x) => x.out.reduce((a, p) => a | p.bit, 0);
// league-wide gap between the roster formula and who actually dressed, measured with everyone healthy
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const cSk = mean(teams.map((t) => lineupValue(T[t], 0) - T[t].baseSk));
const cG = mean(teams.map((t) => goalieChoices(T[t], 0, false).reduce((a, [v, p]) => a + v * p, 0) - T[t].baseG));

/** Games still out, drawn from the absence survival curve given `m` games missed so far. */
function drawOut(m, rand) {
  const S = M.survival, s0 = S[Math.min(m, S.length - 1)] || 1e-6, u = rand();
  let r = 0;
  while (m + r + 1 < S.length && S[m + r + 1] / s0 >= u) r++;
  return m + r + 1 >= S.length ? 999 : r; // past the curve: out for the season
}
const roster = {
  start(rand) {
    const back = {}; // team -> [return index per out player]
    for (const t of teams) back[t] = T[t].out.map((p) => drawOut(p.missed, rand));
    const cache = {}, gst = {}; // per team: the main goalie's start dates and whether he started the last game (this sim)
    for (const t of teams) { const x = T[t], main = x.gk[0]?.id; gst[t] = { primDates: x.log.filter((l) => l.st === main).map((l) => dayN(l.date)), lastWasPrim: x.log.length ? x.log[x.log.length - 1].st === main : true }; }
    const gap = (t, gid, rand) => {
      const x = T[t], i = x.idx.get(gid);
      if (i == null) return 0;
      let mask = 0;
      x.out.forEach((p, j) => { if (i < back[t][j]) mask |= p.bit; });
      const key = `${t}|${mask}`;
      const sk = cache[key] ??= lineupValue(x, mask) - x.baseSk - cSk;
      const mainOut = x.gk[0]?.bit && mask & x.gk[0].bit;
      const ch = goalieChoices(x, mask, x.b2b[i], mainOut ? null : pMain(gst[t], x, i));
      let u = rand(), v = ch[ch.length - 1][0], pick = ch.length - 1;
      for (let j = 0; j < ch.length; j++) { if (u < ch[j][1]) { v = ch[j][0]; pick = j; break; } u -= ch[j][1]; }
      const wasMain = !mainOut && pick === 0;
      if (wasMain) gst[t].primDates.push(dayN(x.dates[i]));
      gst[t].lastWasPrim = wasMain;
      return sk + v - x.baseG - cG;
    };
    return { margin: (g, rand) => M.k * (gap(g.home, g.id, rand) - gap(g.away, g.id, rand)) * GPW / 82 };
  },
};

const otShare = M.otShare;
const sim = simulate({ R, standings: proj.standingsRows, remaining: [...proj.schedule].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id), otShare, roster }); // date order: goalie usage state advances game by game
// pre-game odds for the next three days: expected over who's back and who starts (2,000 draws)
let seed = 20261014; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const upcoming = {};
for (const [id, u] of Object.entries(proj.upcoming || {})) {
  const b = winProbability(R, u.home, u.away);
  if (!b) continue;
  let s = 0;
  for (let n = 0; n < 2000; n++) {
    const m = roster.start(rand).margin({ id: Number(id), home: u.home, away: u.away }, rand);
    s += winProbability(R, u.home, u.away, { home: Math.max(0.5, b.xgHome + m / 2) / b.xgHome, away: Math.max(0.5, b.xgAway - m / 2) / b.xgAway }).home;
  }
  upcoming[id] = Math.round((s / 2000) * 1000) / 1000;
}
const lineups = Object.fromEntries(teams.map((t) => {
  const x = T[t], ev = goalieChoices(x, fullMask(x), false).reduce((a, [v, p]) => a + v * p, 0);
  return [t, { skaterGap: +(lineupValue(x, fullMask(x)) - x.baseSk - cSk).toFixed(2), skaterGapHealthy: +(lineupValue(x, 0) - x.baseSk - cSk).toFixed(2), goalieGap: +(ev - x.baseG - cG).toFixed(2),
    out: x.out.map((p) => ({ id: Number(p.id), name: p.name, missed: p.missed, value: +p.v.toFixed(2) })), starter: x.gk[0]?.name || null }];
}));
const primary = cfg?.simModel === "roster" ? "roster" : "team";
const rosterBlock = { model: "Roster-aware season simulation", primary: primary === "roster", k: M.k, otShare, starts: M.starts, calibration: { skaters: +cSk.toFixed(2), goalie: +cG.toFixed(2) },
  builtAt: new Date().toISOString(), teams: sim.teams, bracket: sim.bracket, lineups, upcoming };
for (const [id, p] of Object.entries(upcoming)) if (proj.upcoming[id]) proj.upcoming[id].pHomeRoster = p;
if (primary === "roster") {
  proj.alt = { model: "Team-only season simulation", teams: proj.teams, bracket: proj.bracket };
  Object.assign(proj, { teams: sim.teams.map((r) => ({ ...r, rating: proj.teams.find((x) => x.team === r.team)?.rating })), bracket: sim.bracket });
  for (const [id, p] of Object.entries(upcoming)) if (proj.upcoming[id]) { proj.upcoming[id].pHomeTeam = proj.upcoming[id].pHome; proj.upcoming[id].pHome = p; }
}
proj.simModel = primary;
proj.roster = { ...rosterBlock, teams: rosterBlock.teams.map(({ rating, ...r }) => r) };
await writeFile("public/hockey/projections.json", JSON.stringify(proj));
const diff = sim.teams.map((r) => [r.team, r.playoffs - (proj.alt?.teams || proj.teams).find((x) => x.team === r.team).playoffs]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);
console.log(`roster sim (${primary} is primary): calibration skaters ${cSk.toFixed(2)}, goalie ${cG.toFixed(2)}; biggest playoff-odds moves vs team-only: ${diff.map(([t, d]) => `${t} ${d > 0 ? "+" : ""}${d.toFixed(1)}`).join(", ")}`);
