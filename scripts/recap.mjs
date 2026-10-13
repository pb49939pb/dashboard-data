// Game recaps for Hockey Lab: everything about one game, built from the NHL's play-by-play, shift charts, box score
// and game summary, scored with the same xG model as the rest of the site. Saved to Firestore hockey/recaps/{gameId}.
//
//   periods and totals (goals, xG, shots, attempts, high-danger chances), special teams, team stats
//   "deserved to win": the game's chances replayed 10,000 times
//   game flow (every shot with its time) and the shot map
//   game score for every player (formula below), three stars by the numbers next to the NHL's official stars
//   who had a great game and who struggled, in plain English
//   goalie duel (goals saved above expected, high-danger chances), line matchups at 5-on-5
//   turning point (the goal that swung the win odds most) and the best five-minute stretch for each team
//   season context from earlier recaps (best game of the season, point streaks...)
//   pre-game predictions (Hockey Lab model vs Polymarket) and which was closer
import { scoreGame } from "./league.mjs";

const NHL = "https://api-web.nhle.com/v1";
const UA = { "User-Agent": "hockey-lab/1.0 (personal, non-commercial)" };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: UA }).catch(() => null);
    if (r?.ok) return r.json();
    await pause(3000 * (i + 1));
  }
  throw new Error(`fetch failed: ${url}`);
}
const secs = (s) => (s ? s.split(":").reduce((m, x) => m * 60 + Number(x), 0) : 0);
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const isPP = (st) => st === "PP"; // shots.mjs labels strength from the shooter's side: "5v5", "4v4", "PP", "SH"
const isEV = (st) => /^(\d)v\1$/.test(st || "");
// seconds since puck drop (regular-season OT is 5 minutes; playoff OT periods are 20)
const clock = (period, t) => (period - 1) * 1200 + t;

/**
 * Game score: one number for a player's night (in goals, roughly). Built on Dom Luszczyszyn's public Game Score,
 * with expected goals and on-ice chance share in place of shot attempts, plus the puck-management stats fans watch.
 */
export const GS = { g: 0.75, a1: 0.7, a2: 0.55, ixg: 0.2, sog: 0.075, blk: 0.05, hit: 0.03, tk: 0.08, gv: -0.08, pd: 0.15, pt: -0.15,
  fow: 0.01, fol: -0.01, xpm: 0.3, oiGoalDiffEV: 0.15, goalieGsax: 1, goalieSave: 0.02 };
// Bump when the recap's numbers change; scores.mjs then rebuilds every recap with the new version.
export const RECAP_VERSION = 2; // 2: expected plus/minus (even strength) replaces all-situations on-ice xG in game score

/** Home team's chance to win from here: score difference and seconds left (Poisson scoring, ties go to overtime). */
function winProb(diff, left, rate = 3.05 / 3600, homeEdge = 1.04) {
  if (left <= 0) return diff > 0 ? 1 : diff < 0 ? 0 : 0.52;
  const lh = rate * homeEdge * left, la = (rate / homeEdge) * left;
  const pois = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
  let win = 0, tie = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const p = pois(lh, i) * pois(la, j), d = diff + i - j;
    if (d > 0) win += p; else if (d === 0) tie += p;
  }
  return win + tie * 0.52;
}

/** Chance each team wins on the night's chances: every unblocked shot (empty nets excluded) replayed 10,000 times. */
function deserved(shots) {
  const h = shots.filter((s) => s.side === 0).map((s) => s.xg), a = shots.filter((s) => s.side === 1).map((s) => s.xg);
  const xh = h.reduce((x, y) => x + y, 0), xa = a.reduce((x, y) => x + y, 0);
  let seed = 7, win = 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const N = 10000;
  for (let n = 0; n < N; n++) {
    let gh = 0, ga = 0;
    for (const p of h) if (rnd() < p) gh++;
    for (const p of a) if (rnd() < p) ga++;
    if (gh > ga) win++; else if (gh === ga) win += xh + xa ? xh / (xh + xa) : 0.5;
  }
  return r3(win / N);
}

/** Greedy units: the trio (or pair) with the most time together, then the next with none of the same players. */
function pick(counts, n) {
  const used = new Set(), out = [];
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    const ids = k.split("-").map(Number);
    if (ids.some((i) => used.has(i))) continue;
    ids.forEach((i) => used.add(i)); out.push({ key: k, ids, secs: v });
    if (out.length === n) break;
  }
  return out;
}

/** 5-on-5 line matchups from the shift charts: who played against whom, and who won those minutes on chances. */
function matchups(shifts, pbp, shots, pos) {
  const side = {};
  for (const p of pbp.rosterSpots || []) side[p.playerId] = p.teamId === pbp.homeTeam.id ? 0 : 1;
  const per = {};
  for (const s of shifts || []) {
    if (s.typeCode !== 517 || side[s.playerId] === undefined) continue;
    const a = secs(s.startTime), b = secs(s.endTime);
    if (b <= a) continue;
    const P = (per[s.period] ??= [[], []]);
    for (let t = a; t < b; t++) (P[side[s.playerId]][t] ??= []).push(s.playerId);
  }
  const fKey = (ids) => ids.filter((i) => pos[i] && pos[i] !== "D" && pos[i] !== "G").sort((x, y) => x - y);
  const dKey = (ids) => ids.filter((i) => pos[i] === "D").sort((x, y) => x - y);
  const F = [{}, {}], D = [{}, {}], vs = {};
  const sec5 = [];
  for (const [p, P] of Object.entries(per)) {
    const len = Math.max(P[0].length, P[1].length);
    for (let t = 0; t < len; t++) {
      const h = P[0][t] || [], a = P[1][t] || [];
      const hs = h.filter((i) => pos[i] !== "G"), as = a.filter((i) => pos[i] !== "G");
      if (hs.length !== 5 || as.length !== 5 || !h.some((i) => pos[i] === "G") || !a.some((i) => pos[i] === "G")) continue;
      const hf = fKey(hs), af = fKey(as), hd = dKey(hs), ad = dKey(as);
      if (hf.length === 3) F[0][hf.join("-")] = (F[0][hf.join("-")] || 0) + 1;
      if (af.length === 3) F[1][af.join("-")] = (F[1][af.join("-")] || 0) + 1;
      if (hd.length === 2) D[0][hd.join("-")] = (D[0][hd.join("-")] || 0) + 1;
      if (ad.length === 2) D[1][ad.join("-")] = (D[1][ad.join("-")] || 0) + 1;
      sec5.push([hf.join("-"), af.join("-"), hd.join("-"), ad.join("-")]);
    }
  }
  const lines = [pick(F[0], 4), pick(F[1], 4)], pairs = [pick(D[0], 3), pick(D[1], 3)];
  // time each home unit spent against each away forward line
  const face = (homeUnits, idx) => homeUnits.map(() => lines[1].map(() => 0));
  const fl = face(lines[0]), dl = face(pairs[0]);
  const flA = lines[1].map(() => pairs[0].map(() => 0));
  for (const [hf, af, hd] of sec5) {
    const i = lines[0].findIndex((u) => u.key === hf), j = lines[1].findIndex((u) => u.key === af), k = pairs[0].findIndex((u) => u.key === hd);
    if (i >= 0 && j >= 0) fl[i][j]++;
    if (k >= 0 && j >= 0) dl[k][j]++;
  }
  // chances while a home line and an away line were both on (5v5 shots only)
  const xgFor = (a, b) => {
    let f = 0, g = 0;
    for (const s of shots) {
      if (s.strength !== "5v5" || !s.oi || s.en) continue;
      if (a.ids.every((i) => s.oi[0].includes(i)) && b.ids.every((i) => s.oi[1].includes(i))) { if (s.side === 0) f += s.xg; else g += s.xg; }
    }
    return [r2(f), r2(g)];
  };
  const grid = [];
  lines[0].forEach((u, i) => lines[1].forEach((v, j) => { if (fl[i][j] >= 30) grid.push({ home: i, away: j, secs: fl[i][j], xg: xgFor(u, v) }); }));
  const pairVs = pairs[0].map((u, k) => { const j = dl[k].indexOf(Math.max(...dl[k])); return { pair: k, line: j, secs: dl[k][j] || 0 }; });
  return { lines: lines.map((L) => L.map((u) => ({ ids: u.ids, secs: u.secs }))), pairs: pairs.map((L) => L.map((u) => ({ ids: u.ids, secs: u.secs }))), grid, pairVs, secs5: sec5.length };
}

/**
 * Build one recap. ctx: { model, preds: {model, market}, index: { home: {...}, away: {...} } } where index holds
 * earlier recaps' per-player lines for season context. Returns { recap, lines } (lines = this game's rows for the index).
 */
export async function buildRecap(id, ctx) {
  const pbp = await get(`${NHL}/gamecenter/${id}/play-by-play`); await pause(800);
  const box = await get(`${NHL}/gamecenter/${id}/boxscore`); await pause(800);
  const land = await get(`${NHL}/gamecenter/${id}/landing`); await pause(800);
  const rail = await get(`${NHL}/gamecenter/${id}/right-rail`).catch(() => null); await pause(800);
  const shiftsRes = await fetch(`https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=${id}`, { headers: UA }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const shifts = shiftsRes?.data?.length ? shiftsRes.data : null;
  const g = scoreGame(pbp, ctx.model, shifts);
  const final = ["FINAL", "OFF"].includes(pbp.gameState);
  const H = pbp.homeTeam, A = pbp.awayTeam, teams = [H.abbrev, A.abbrev];

  const pos = {}, name = {};
  for (const p of pbp.rosterSpots || []) { pos[p.playerId] = p.positionCode; name[p.playerId] = `${p.firstName.default} ${p.lastName.default}`; }
  // shots as objects: [x, y, kind, side, xG, shooter, goalie, strength, period, type, flags, onIce, t, emptyNet]
  const shots = g.shots.map((s) => ({ x: s[0], y: s[1], kind: s[2], side: s[3], xg: s[4], shooter: s[5], goalie: s[6], strength: s[7], period: s[8], type: s[9], flags: s[10], oi: s[11], t: s[12], en: s[13] === 1 }));
  const unb = shots.filter((s) => s.xg !== null && !s.en); // unblocked, not into an empty net

  /* ---------- periods and totals ---------- */
  const periods = [];
  const maxP = Math.max(3, ...shots.map((s) => s.period), ...(pbp.plays || []).map((p) => p.periodDescriptor?.number || 0).filter((n) => n < 5));
  for (let p = 1; p <= maxP; p++) {
    const S = shots.filter((s) => s.period === p);
    const goals = [0, 1].map((sd) => S.filter((s) => s.side === sd && s.kind === "g").length);
    periods.push({ p, label: p <= 3 ? ["1st", "2nd", "3rd"][p - 1] : p === 4 ? "OT" : `${p - 3}OT`, goals,
      xg: [0, 1].map((sd) => r2(S.filter((s) => s.side === sd && s.xg !== null && !s.en).reduce((a, s) => a + s.xg, 0))),
      sog: [0, 1].map((sd) => S.filter((s) => s.side === sd && (s.kind === "s" || s.kind === "g")).length) });
  }
  const sum = (f, sd) => r2(unb.filter((s) => s.side === sd && f(s)).reduce((a, s) => a + s.xg, 0));
  const count = (f, sd) => shots.filter((s) => s.side === sd && f(s)).length;
  const all = () => true, ev5 = (s) => s.strength === "5v5";
  const totals = {
    xg: [0, 1].map((sd) => sum(all, sd)), xg5: [0, 1].map((sd) => sum(ev5, sd)),
    attempts: [0, 1].map((sd) => count(all, sd)), attempts5: [0, 1].map((sd) => count(ev5, sd)),
    sog: [0, 1].map((sd) => count((s) => s.kind === "s" || s.kind === "g", sd)),
    hdc: [0, 1].map((sd) => unb.filter((s) => s.side === sd && s.xg >= 0.15).length),
    ppXg: [0, 1].map((sd) => sum((s) => isPP(s.strength), sd)),
  };
  const stat = (cat) => rail?.teamGameStats?.find((x) => x.category === cat);
  const ppStr = stat("powerPlay");
  const pp = ppStr ? [ppStr.homeValue, ppStr.awayValue].map((v, sd) => { const [gl, op] = String(v).split("/").map(Number); return { goals: gl, opps: op, xg: totals.ppXg[sd] }; }) : null;
  const teamStats = (rail?.teamGameStats || []).map((x) => ({ k: x.category, home: x.homeValue, away: x.awayValue }));

  /* ---------- goals, penalties, win odds through the game ---------- */
  const clips = {};
  for (const per of land?.summary?.scoring || []) for (const gl of per.goals || []) clips[`${per.periodDescriptor?.number}-${gl.timeInPeriod}`] = gl.highlightClipSharingUrl || null;
  const goals = [];
  let hs = 0, as = 0;
  const pd = {}, pt = {};
  for (const p of pbp.plays || []) {
    const per = p.periodDescriptor?.number, d = p.details || {};
    if (p.typeDescKey === "penalty") {
      if (d.committedByPlayerId) pt[d.committedByPlayerId] = (pt[d.committedByPlayerId] || 0) + 1;
      if (d.drawnByPlayerId) pd[d.drawnByPlayerId] = (pd[d.drawnByPlayerId] || 0) + 1;
    }
    if (p.typeDescKey !== "goal" || p.periodDescriptor?.periodType === "SO") continue;
    const side = d.eventOwnerTeamId === H.id ? 0 : 1, t = secs(p.timeInPeriod), at = clock(per, t);
    const left = per <= 3 ? 3600 - at : 0;
    const before = winProb(hs - as, left);
    if (side === 0) hs++; else as++;
    const after = per <= 3 ? winProb(hs - as, left) : side === 0 ? 1 : 0;
    goals.push({ period: per, t: p.timeInPeriod, at, side, scorer: d.scoringPlayerId, a1: d.assist1PlayerId || null, a2: d.assist2PlayerId || null,
      ...(() => { const sh = shots.find((s) => s.period === per && s.t === t && s.kind === "g" && s.side === side); return { strength: sh?.strength === "PP" ? "PP" : sh?.strength === "SH" ? "SH" : "", en: !!sh?.en }; })(),
      score: [hs, as], wp: [r3(before), r3(after)], clip: clips[`${per}-${p.timeInPeriod}`] || null });
  }
  const turning = goals.length ? goals.reduce((b, x) => (Math.abs(x.wp[1] - x.wp[0]) > Math.abs(b.wp[1] - b.wp[0]) ? x : b), goals[0]) : null;
  // best five-minute stretch for each team (5v5 and all, by xG difference)
  const swing = [0, 1].map((sd) => {
    let best = null;
    const end = Math.max(...unb.map((s) => clock(s.period, s.t)), 3600);
    for (let st = 0; st + 300 <= end; st += 30) {
      const w = unb.filter((s) => { const c = clock(s.period, s.t); return c >= st && c < st + 300; });
      const d = w.filter((s) => s.side === sd).reduce((a, s) => a + s.xg, 0) - w.filter((s) => s.side !== sd).reduce((a, s) => a + s.xg, 0);
      if (!best || d > best.diff) best = { from: st, to: st + 300, diff: r2(d), shots: w.filter((s) => s.side === sd).length };
    }
    return best;
  });

  /* ---------- players ---------- */
  const players = [], goalies = [];
  const a1 = {}, a2 = {};
  for (const x of goals) { if (x.a1) a1[x.a1] = (a1[x.a1] || 0) + 1; if (x.a2) a2[x.a2] = (a2[x.a2] || 0) + 1; }
  const fo = {};
  for (const p of pbp.plays || []) if (p.typeDescKey === "faceoff") { const d = p.details || {}; if (d.winningPlayerId) (fo[d.winningPlayerId] ??= [0, 0])[0]++; if (d.losingPlayerId) (fo[d.losingPlayerId] ??= [0, 0])[1]++; }
  for (const [sd, key] of [[0, "homeTeam"], [1, "awayTeam"]]) {
    const pb = box.playerByGameStats?.[key] || {};
    for (const b of [...(pb.forwards || []), ...(pb.defense || [])]) {
      const id = b.playerId, on = (s) => s.oi && s.oi[sd].includes(id);
      const ixg = unb.filter((s) => s.shooter === id).reduce((a, s) => a + s.xg, 0);
      const oiF = unb.filter((s) => on(s) && s.side === sd).reduce((a, s) => a + s.xg, 0), oiA = unb.filter((s) => on(s) && s.side !== sd).reduce((a, s) => a + s.xg, 0);
      const oiF5 = unb.filter((s) => on(s) && s.side === sd && ev5(s)).reduce((a, s) => a + s.xg, 0), oiA5 = unb.filter((s) => on(s) && s.side !== sd && ev5(s)).reduce((a, s) => a + s.xg, 0);
      // expected plus/minus: on-ice expected goals for minus against at even strength (5v5, 4v4, 3v3), like plus/minus
      const xpm = unb.filter((s) => on(s) && isEV(s.strength)).reduce((a, s) => a + (s.side === sd ? s.xg : -s.xg), 0);
      const gEV = shots.filter((s) => s.kind === "g" && on(s) && isEV(s.strength));
      const gf = gEV.filter((s) => s.side === sd).length, ga = gEV.length - gf;
      const toi = g.toi?.[sd]?.[id] || null;
      const row = { id, name: name[id] || b.name?.default, pos: b.position, side: sd, num: b.sweaterNumber, g: b.goals, a: b.assists, a1: a1[id] || 0, a2: a2[id] || 0, pts: b.points,
        pm: b.plusMinus, pim: b.pim, hits: b.hits, sog: b.sog, blk: b.blockedShots, gv: b.giveaways, tk: b.takeaways, toi: b.toi, shifts: b.shifts,
        fow: fo[id]?.[0] || 0, fol: fo[id]?.[1] || 0, ixg: r2(ixg), xpm: r2(xpm), oiXgf: r2(oiF), oiXga: r2(oiA), oiXgf5: r2(oiF5), oiXga5: r2(oiA5), oiGf: gf, oiGa: ga,
        pd: pd[id] || 0, pt: pt[id] || 0, toi5: toi ? Math.round(toi[0] / 6) / 10 : null, toiPP: toi ? Math.round(toi[1] / 6) / 10 : null, toiPK: toi ? Math.round(toi[2] / 6) / 10 : null };
      row.gs = r2(GS.g * row.g + GS.a1 * row.a1 + GS.a2 * row.a2 + GS.ixg * ixg + GS.sog * row.sog + GS.blk * row.blk + GS.hit * row.hits + GS.tk * row.tk + GS.gv * row.gv
        + GS.pd * row.pd + GS.pt * row.pt + GS.fow * row.fow + GS.fol * row.fol + GS.xpm * xpm + GS.oiGoalDiffEV * (gf - ga));
      players.push(row);
    }
    for (const b of pb.goalies || []) {
      if (!b.toi || b.toi === "00:00") continue;
      const id = b.playerId, faced = unb.filter((s) => s.goalie === id && s.side !== sd);
      const xga = faced.reduce((a, s) => a + s.xg, 0), hd = faced.filter((s) => s.xg >= 0.15);
      const ga = b.goalsAgainst ?? faced.filter((s) => s.kind === "g").length, sv = b.saves ?? 0;
      const row = { id, name: name[id] || b.name?.default, side: sd, num: b.sweaterNumber, toi: b.toi, sa: b.shotsAgainst, sv, ga, xga: r2(xga), gsax: r2(xga - ga),
        hd: hd.length, hdGa: hd.filter((s) => s.kind === "g").length, decision: b.decision || null, starter: !!b.starter };
      row.gs = r2(GS.goalieGsax * row.gsax + GS.goalieSave * sv);
      goalies.push(row);
    }
  }

  /* ---------- stars, storylines, season context ---------- */
  const everyone = [...players.map((p) => ({ ...p, kind: "skater" })), ...goalies.map((p) => ({ ...p, kind: "goalie" }))].sort((a, b) => b.gs - a.gs);
  const why = (p) => p.kind === "goalie"
    ? `${p.sv} saves on ${p.sa} shots, ${p.gsax >= 0 ? `${p.gsax.toFixed(1)} goals saved above expected` : `${Math.abs(p.gsax).toFixed(1)} goals allowed above expected`}${p.hd ? `, ${p.hd - p.hdGa} of ${p.hd} high-danger chances stopped` : ""}`
    : [p.g ? `${p.g} goal${p.g > 1 ? "s" : ""}` : "", p.a ? `${p.a} assist${p.a > 1 ? "s" : ""}` : "", `${p.ixg.toFixed(1)} xG`, p.toi ? `${p.toi} TOI` : "",
      `expected ± ${p.xpm >= 0 ? "+" : ""}${p.xpm.toFixed(1)}`, p.hits >= 3 ? `${p.hits} hits` : "", p.blk >= 3 ? `${p.blk} blocks` : "", p.tk >= 2 ? `${p.tk} takeaways` : ""].filter(Boolean).join(", ");
  const stars = everyone.slice(0, 3).map((p, i) => ({ star: i + 1, id: p.id, side: p.side, gs: p.gs, why: why(p) }));
  const official = (land?.summary?.threeStars || []).map((s) => ({ star: s.star, id: s.playerId, team: s.teamAbbrev }));

  const story = { great: [], struggled: [] };
  for (const sd of [0, 1]) {
    const mine = everyone.filter((p) => p.side === sd);
    for (const p of mine.slice(0, 2)) story.great.push({ id: p.id, side: sd, gs: p.gs, text: why(p) });
    const sk = players.filter((p) => p.side === sd);
    const def = sk.filter((p) => p.toi5 >= 12).sort((a, b) => a.oiXga5 / a.toi5 - b.oiXga5 / b.toi5)[0];
    if (def && !story.great.some((x) => x.id === def.id)) story.great.push({ id: def.id, side: sd, gs: def.gs, text: `shut things down: ${def.toi5} minutes at 5-on-5 and only ${def.oiXga5.toFixed(2)} xG against with him on${def.blk ? `, ${def.blk} block${def.blk > 1 ? "s" : ""}` : ""}${def.tk ? `, ${def.tk} takeaway${def.tk > 1 ? "s" : ""}` : ""}` });
    const worst = [...mine].sort((a, b) => a.gs - b.gs).slice(0, 2);
    for (const p of worst) {
      if (p.gs > 0.15) continue;
      const bits = p.kind === "goalie" ? [`${p.ga} goals on ${p.sa} shots`, `${Math.abs(p.gsax).toFixed(1)} more than expected`] :
        [p.xpm <= -0.5 ? `expected ± ${p.xpm.toFixed(1)}${p.pm ? ` (actual ${p.pm > 0 ? "+" : ""}${p.pm})` : ""}` : p.pm <= -2 ? `${p.pm} on the night, though the chances were closer (expected ± ${p.xpm >= 0 ? "+" : ""}${p.xpm.toFixed(1)})` : "", p.gv >= 2 ? `${p.gv} giveaways` : "", p.pt ? `${p.pt} penalt${p.pt > 1 ? "ies" : "y"} taken` : "", !p.sog && p.pos !== "D" ? "no shots on goal" : ""].filter(Boolean);
      if (bits.length) story.struggled.push({ id: p.id, side: sd, gs: p.gs, text: bits.join(", ") });
    }
  }

  // season context: this game against the player's earlier recaps this season (index rows: [date, gameId, gs, pts, g, a])
  const context = {};
  const idx = ctx.index || [{}, {}];
  const date = pbp.gameDate;
  for (const p of everyone) {
    const prev = (idx[p.side]?.players?.[p.id] || []).filter((r) => r[0] < date).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const notes = [];
    if (prev.length >= 3 && p.gs > Math.max(...prev.map((r) => r[2])) && p.gs > 1) notes.push(`best game score of his season (${prev.length + 1} games)`);
    if (p.kind === "skater") {
      let streak = p.pts > 0 ? 1 : 0;
      for (let i = prev.length - 1; i >= 0 && streak && prev[i][3] > 0; i--) streak++;
      if (streak >= 3) notes.push(`${streak}-game point streak`);
      let gstreak = p.g > 0 ? 1 : 0;
      for (let i = prev.length - 1; i >= 0 && gstreak && prev[i][4] > 0; i--) gstreak++;
      if (gstreak >= 3) notes.push(`goals in ${gstreak} straight games`);
      if (p.pts >= 2) { const last = [...prev].reverse().find((r) => r[3] >= 2); notes.push(last ? `first multi-point game since ${last[0]}` : prev.length >= 2 ? "first multi-point game of the season" : ""); }
      if (p.g && !prev.some((r) => r[4] > 0) && prev.length >= 3) notes.push("first goal of the season");
    } else {
      if (p.ga === 0 && p.sa >= 15) notes.push("shutout");
      if (prev.length >= 2 && p.gsax > Math.max(...prev.map((r) => r[2]))) notes.push("his best goaltending game of the season");
    }
    if (notes.filter(Boolean).length) context[p.id] = notes.filter(Boolean);
  }
  const lines = [0, 1].map((sd) => Object.fromEntries(everyone.filter((p) => p.side === sd).map((p) => [p.id, [date, id, p.kind === "goalie" ? p.gsax : p.gs, p.pts ?? 0, p.g ?? 0, p.a ?? 0]])));

  /* ---------- predictions: who was closer ---------- */
  let pred = null;
  if (ctx.preds && (ctx.preds.model != null || ctx.preds.market != null)) {
    pred = { ...ctx.preds };
    if (final) {
      const homeWon = H.score > A.score;
      const score = (p) => (p == null ? null : r3(homeWon ? p : 1 - p)); // the chance each gave the actual winner
      pred.winner = homeWon ? 0 : 1;
      pred.modelGave = score(pred.model); pred.marketGave = score(pred.market);
      pred.closer = pred.modelGave == null || pred.marketGave == null ? null : Math.abs(pred.modelGave - pred.marketGave) < 0.005 ? "tie" : pred.modelGave > pred.marketGave ? "model" : "market";
    }
  }

  const shotList = shots.filter((s) => s.kind !== "b" || true).map((s) => [s.x, s.y, s.kind, s.side, s.xg, s.shooter, s.period, s.t, s.strength, s.en ? 1 : 0]);
  const recap = {
    id, date, season: String(pbp.season), state: pbp.gameState, final, updatedAt: new Date().toISOString(), venue: pbp.venue?.default || null,
    end: pbp.gameOutcome?.lastPeriodType || null,
    home: { team: H.abbrev, name: H.commonName?.default || H.abbrev, score: H.score, sog: H.sog }, away: { team: A.abbrev, name: A.commonName?.default || A.abbrev, score: A.score, sog: A.sog },
    periods, totals, pp, teamStats, deserved: unb.length ? deserved(unb) : null, goals, turning: turning ? goals.indexOf(turning) : null, swing,
    players: players.sort((a, b) => b.gs - a.gs), goalies, stars, official, story, context, pred,
    matchups: shifts ? matchups(shifts, pbp, unb, pos) : null, shots: shotList, names: name, gsWeights: GS, version: RECAP_VERSION,
    hasShifts: !!shifts,
  };
  return { recap, lines };
}
