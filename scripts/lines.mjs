// Lines and defense pairs from the NHL's shift charts: who was on the ice for every shot and faceoff, how long each
// forward trio and defense pair played together at 5-on-5, and each line's role, usage and results.
const sec = (t) => { if (!t) return null; const [m, s] = t.split(":").map(Number); return m * 60 + s; };

/**
 * Per-game on-ice index from shift charts + play-by-play.
 * Returns { onIce(period, t, side, kind) -> skater ids, u5: [{F:{key:s}, D:{key:s}} per side], toi: {id: [ev5, pp, pk, all]} }.
 */
export function shiftIndex(shifts, pbp) {
  const pos = {}, side = {};
  for (const p of pbp.rosterSpots || []) { pos[p.playerId] = p.positionCode; side[p.playerId] = p.teamId === pbp.homeTeam.id ? 0 : 1; }
  const periods = {}, seen = new Set();
  for (const s of shifts || []) {
    if (s.typeCode !== 517 || side[s.playerId] === undefined) continue;
    const key = `${s.playerId}|${s.period}|${s.startTime}|${s.endTime}`; // the feed sometimes lists a shift twice (doubled ice time)
    if (seen.has(key)) continue;
    seen.add(key);
    const a = sec(s.startTime), b = sec(s.endTime);
    if (a === null || b === null || b <= a) continue;
    const P = (periods[s.period] ??= { len: 0, secs: [[], []] });
    P.len = Math.max(P.len, b);
    const arr = P.secs[side[s.playerId]];
    for (let t = a; t < b; t++) (arr[t] ??= []).push(s.playerId);
  }
  const at = (period, t, sd) => periods[period]?.secs[sd][t] || [];
  const skaters = (ids) => ids.filter((i) => pos[i] !== "G");
  const hasG = (ids) => ids.some((i) => pos[i] === "G");
  const u5 = [{ F: {}, D: {} }, { F: {}, D: {} }], toi = {};
  for (const [, P] of Object.entries(periods)) {
    for (let t = 0; t < P.len; t++) {
      const h = P.secs[0][t] || [], w = P.secs[1][t] || [];
      const hs = skaters(h), ws = skaters(w);
      const even5 = hs.length === 5 && ws.length === 5 && hasG(h) && hasG(w);
      for (const [sd, own, opp] of [[0, hs, ws], [1, ws, hs]]) {
        for (const id of own) {
          const x = (toi[id] ??= [0, 0, 0, 0]);
          x[3]++;
          if (even5) x[0]++; else if (own.length > opp.length) x[1]++; else if (own.length < opp.length) x[2]++;
        }
        if (!even5) continue;
        const F = own.filter((i) => pos[i] !== "D"), D = own.filter((i) => pos[i] === "D");
        if (F.length === 3) { const k = F.sort((a, b) => a - b).join("-"); u5[sd].F[k] = (u5[sd].F[k] || 0) + 1; }
        if (D.length === 2) { const k = D.sort((a, b) => a - b).join("-"); u5[sd].D[k] = (u5[sd].D[k] || 0) + 1; }
      }
    }
  }
  return {
    // skaters on the ice at an event: shots use the second just before (players who were out there), faceoffs the second of the drop
    onIce: (period, t, sd, kind) => skaters(at(period, kind === "faceoff" ? t : Math.max(0, t - 1), sd)),
    u5, toi,
  };
}

/** Greedy line building: the trio (or pair) with the most time together, then the next one with none of those players. */
function pickUnits(counts, n) {
  const used = new Set(), out = [];
  for (const [k, s] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    const ids = k.split("-").map(Number);
    if (ids.some((i) => used.has(i))) continue;
    ids.forEach((i) => used.add(i)); out.push({ ids, key: k, secs: s });
    if (out.length === n) break;
  }
  return out;
}

/** Lines per team: most common this season and in the last game, each with usage, deployment, results and a role label. */
export function buildLines(games, teams) {
  const out = {};
  for (const team of teams) {
    const tg = games.filter((g) => (g.home === team || g.away === team) && g.u5).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!tg.length) continue;
    const sd = (g) => (g.home === team ? 0 : 1);
    const agg = (kind, list) => { const c = {}; for (const g of list) for (const [k, s] of Object.entries(g.u5[sd(g)][kind])) c[k] = (c[k] || 0) + s; return c; };
    const team5Of = (list) => list.reduce((a, g) => a + Object.values(g.u5[sd(g)].D).reduce((x, y) => x + y, 0), 0) || 1; // ~ team 5v5 seconds
    const names = {}, pos = {};
    for (const g of tg) for (const [id, p] of Object.entries(g.players || {})) { names[id] = p[0]; pos[id] = p[1]; }
    const toi = {};
    for (const g of tg) for (const [id, x] of Object.entries(g.toi?.[sd(g)] || {})) { const t = (toi[id] ??= { ev5: 0, pp: 0, pk: 0, gp: 0 }); t.ev5 += x[0]; t.pp += x[1]; t.pk += x[2]; t.gp++; }
    const describe = (unit, list, team5) => {
      const m = { xgf: 0, xga: 0, gf: 0, ga: 0, oz: 0, dz: 0, nz: 0, gp: 0 };
      for (const g of list) {
        const s = sd(g), together = (ids) => unit.ids.every((i) => ids.includes(i));
        if (unit.ids.length && (g.u5[s][unit.ids.length === 3 ? "F" : "D"][unit.key] || 0) > 0) m.gp++;
        for (const sh of g.shots) {
          const [, , kind, side, v, , , strength, , , , oi] = sh;
          if (strength !== "5v5" || !oi || kind === "b" || v === null || v === 0.9) continue;
          if (side === s && together(oi[s])) { m.xgf += v; if (kind === "g") m.gf++; }
          if (side !== s && together(oi[s])) { m.xga += v; if (kind === "g") m.ga++; }
        }
        for (const [zoneHome, , hIds, aIds] of g.fo || []) {
          const mine = s === 0 ? hIds : aIds;
          if (!together(mine)) continue;
          const z = s === 0 ? zoneHome : ({ O: "D", D: "O" }[zoneHome] || zoneHome);
          if (z === "O") m.oz++; else if (z === "D") m.dz++; else m.nz++;
        }
      }
      const mins = unit.secs / 60;
      const pk = unit.ids.reduce((a, i) => a + (toi[i]?.pk || 0) / 60 / Math.max(1, toi[i]?.gp || 1), 0) / unit.ids.length;
      const pp = unit.ids.reduce((a, i) => a + (toi[i]?.pp || 0) / 60 / Math.max(1, toi[i]?.gp || 1), 0) / unit.ids.length;
      return { ids: unit.ids, names: unit.ids.map((i) => names[i] || String(i)), pos: unit.ids.map((i) => pos[i]), toi5: Math.round(mins * 10) / 10,
        perGame: Math.round((mins / Math.max(1, m.gp)) * 10) / 10, gp: m.gp, share: Math.round((unit.secs / team5) * 1000) / 10,
        xgf: Math.round(m.xgf * 100) / 100, xga: Math.round(m.xga * 100) / 100, gf: m.gf, ga: m.ga, xgf60: mins ? Math.round((m.xgf / mins) * 60 * 100) / 100 : null,
        xga60: mins ? Math.round((m.xga / mins) * 60 * 100) / 100 : null, xgPct: m.xgf + m.xga ? Math.round((m.xgf / (m.xgf + m.xga)) * 1000) / 10 : null,
        oz: m.oz, dz: m.dz, ozPct: m.oz + m.dz ? Math.round((m.oz / (m.oz + m.dz)) * 1000) / 10 : null, pkPerGame: Math.round(pk * 10) / 10, ppPerGame: Math.round(pp * 10) / 10 };
    };
    // usage rank (1st line...) and identity (what it's used for), kept separate
    const label = (units, kind) => units.forEach((u, i) => {
      const oz = u.ozPct ?? 50, few = u.oz + u.dz < 12 || u.toi5 < 20;
      u.rank = kind === "F" ? `${["1st", "2nd", "3rd", "4th"][i]} line` : `${["1st", "2nd", "3rd"][i]} pair`;
      if (kind === "F") {
        const topX = Math.max(...units.map((x) => x.xgf60 ?? 0));
        u.label = oz <= 42 ? "Shutdown" : oz >= 62 ? (i <= 1 ? "Offensive" : "Sheltered offense") : (u.xgf60 ?? 0) >= topX * 0.95 ? "Scoring" : i === units.length - 1 && units.length >= 4 ? "Checking / energy" : (u.xgPct ?? 50) >= 50 ? "Two-way" : "Depth";
      } else {
        u.label = oz >= 58 ? "Offensive" : oz <= 42 ? "Shutdown" : i === units.length - 1 && units.length >= 3 ? "Sheltered" : "Two-way";
      }
      if (u.pkPerGame >= 1.2) u.kills = true;
      if (u.ppPerGame >= 1.5) u.pp = true;
      u.limited = few;
    });
    const build = (list) => {
      const t5 = team5Of(list);
      const F = pickUnits(agg("F", list), 4).map((u) => describe(u, list, t5)), D = pickUnits(agg("D", list), 3).map((u) => describe(u, list, t5));
      label(F, "F"); label(D, "D");
      return { F, D };
    };
    const last = tg.at(-1), season = build(tg), lg = build([last]);
    // last game: a line that also exists over the season keeps its season identity (one game is too little to judge)
    const seasonByKey = Object.fromEntries([...season.F, ...season.D].map((u) => [u.ids.join("-"), u]));
    for (const u of [...lg.F, ...lg.D]) { const s0 = seasonByKey[u.ids.join("-")]; u.together = !!s0; if (s0) u.label = s0.label; else u.label = "New combination"; }
    out[team] = { games: tg.length, season, lastGame: { date: last.date, opponent: last.home === team ? last.away : last.home, home: last.home === team, ...lg } };
  }
  return out;
}
