// League-wide data for Hockey Lab: every regular-season game of the current season scored with our xG model.
// Publishes public/hockey/league.json (leaderboards) and public/hockey/teams/{TEAM}.json (shots for shot maps).
// Incremental: last night's games (restored from Firestore) are the cache; only newly finished games are fetched from the NHL.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { gameShots, xg } from "./shots.mjs";
import { shiftIndex } from "./lines.mjs";

const KIND = { goal: "g", "shot-on-goal": "s", "missed-shot": "m", "blocked-shot": "b" };
const FORMAT = 4; // bump when the compact shot record changes, so cached games are rebuilt
const STYPE = { wrist: "w", snap: "n", slap: "s", backhand: "b", "tip-in": "t", deflected: "d", "wrap-around": "r", bat: "o", poke: "o", "between-legs": "o", cradle: "o" };

/** Compact, model-scored record of one game (stored in both teams' files). */
function scoreGame(pbp, model, shifts = null) {
  const rows = gameShots(pbp).filter((r) => r.periodType !== "SO");
  const ix = shifts ? shiftIndex(shifts, pbp) : null;
  // faceoffs with who was on the ice: [zone from the home team's view, winner side, home skaters, away skaters]
  const fo = [];
  if (ix) for (const p of pbp.plays || []) {
    if (p.typeDescKey !== "faceoff" || !p.details?.zoneCode || p.periodDescriptor?.periodType === "SO") continue;
    const t = p.timeInPeriod ? p.timeInPeriod.split(":").reduce((m, s) => m * 60 + Number(s), 0) : 0, per = p.periodDescriptor.number;
    const win = p.details.eventOwnerTeamId === pbp.homeTeam.id ? 0 : 1;
    const zoneHome = win === 0 ? p.details.zoneCode : ({ O: "D", D: "O" }[p.details.zoneCode] || p.details.zoneCode);
    fo.push([zoneHome, win, ix.onIce(per, t, 0, "faceoff"), ix.onIce(per, t, 1, "faceoff")]);
  }
  const players = {};
  for (const p of pbp.rosterSpots || []) players[p.playerId] = [`${p.firstName.default} ${p.lastName.default}`, p.positionCode, p.teamId === pbp.homeTeam.id ? 0 : 1];
  // Pressure and puck management by zone, per team (for style fingerprints): [hits O,N,D, takeaways O,N,D, giveaways O,N,D]
  // Zones are from the acting team's point of view (O = its offensive zone).
  const ev = [new Array(9).fill(0), new Array(9).fill(0)];
  const ZI = { O: 0, N: 1, D: 2 };
  for (const p of pbp.plays || []) {
    const base = { hit: 0, takeaway: 3, giveaway: 6 }[p.typeDescKey];
    const d = p.details || {};
    if (base === undefined || ZI[d.zoneCode] === undefined || !d.eventOwnerTeamId) continue;
    ev[d.eventOwnerTeamId === pbp.homeTeam.id ? 0 : 1][base + ZI[d.zoneCode]]++;
  }
  return {
    id: pbp.id, format: FORMAT, date: pbp.gameDate, home: pbp.homeTeam.abbrev, away: pbp.awayTeam.abbrev,
    hs: pbp.homeTeam.score, as: pbp.awayTeam.score, end: pbp.gameOutcome?.lastPeriodType || "REG", players, ev,
    ...(ix ? { fo, u5: ix.u5, toi: [0, 1].map((sd) => Object.fromEntries(Object.entries(ix.toi).filter(([id]) => players[id]?.[2] === sd))) } : {}),
    // [x, y, kind, side (0 home shooter / 1 away), xG, shooterId, goalieId, strength, period, shot type,
    //  flags (1 rebound, 2 rush, 4 crossed the middle within 5 s, 8 quick follow-up within 5 s), on-ice [home, away],
    //  seconds into the period, empty net (1/0)]
    shots: rows.map((r) => {
      const v = xg(r, model);
      const quick = (r.prevGap ?? 999) <= 5;
      const cross = quick && r.prevY != null && Math.sign(r.prevY) * Math.sign(r.y) < 0 && Math.abs(r.prevY - r.y) >= 15;
      return [Math.round(r.x), Math.round(r.y), KIND[r.type], r.home ? 0 : 1, v === null ? null : Math.round(v * 1000) / 1000,
        r.shooterId ?? null, r.goalieId ?? null, r.strength, r.period, STYPE[r.shotType] || "o", (r.rebound ? 1 : 0) | (r.rush ? 2 : 0) | (cross ? 4 : 0) | (quick ? 8 : 0),
        ix ? [ix.onIce(r.period, r.t, 0, "shot"), ix.onIce(r.period, r.t, 1, "shot")] : null, r.t, r.emptyNet ? 1 : 0];
    }),
  };
}

/**
 * Shooter-aware xG: each unblocked shot's xG adjusted for the shooter's finishing record before that game
 * (priors through last season from hockey-models, plus this season's earlier games). Returns a per-shot lookup.
 */
function shooterAware(games, sa) {
  if (!sa) return null;
  const totals = new Map(Object.entries(sa.priors).map(([id, [g, x]]) => [Number(id), { g, x }]));
  const out = new Map();
  const sig = (z) => 1 / (1 + Math.exp(-z));
  for (const g of [...games].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))) {
    const add = new Map();
    g.shots.forEach((s, i) => {
      const [, , kind, , v, shooter] = s;
      if (kind === "b" || v === null || !shooter) return;
      const t = totals.get(shooter) || { g: 0, x: 0 };
      if (v !== 0.9) { // empty net stays 0.9
        const p = Math.min(Math.max(v, 1e-4), 1 - 1e-4);
        const talent = (t.g + sa.k) / (t.x + sa.k);
        out.set(`${g.id}:${i}`, sig(sa.a + sa.b * Math.log(p / (1 - p)) + sa.c * Math.log(talent)));
      }
      const a = add.get(shooter) || { g: 0, x: 0 };
      a.g += kind === "g" ? 1 : 0; a.x += v; add.set(shooter, a);
    });
    for (const [id, a] of add) { const t = totals.get(id) || { g: 0, x: 0 }; totals.set(id, { g: t.g + a.g, x: t.x + a.x }); }
  }
  return out;
}

/** Heat map grid over the offensive zone (every team shoots to the right; the net is at x = 89). 5 ft cells. */
export const GRID = { x0: 25, dx: 5, nx: 15, y0: -42.5, dy: 5, ny: 17 };
export function cell(x, y) {
  if (x < GRID.x0 || x >= GRID.x0 + GRID.dx * GRID.nx) return null;
  const xi = Math.floor((x - GRID.x0) / GRID.dx), yi = Math.min(GRID.ny - 1, Math.max(0, Math.floor((y - GRID.y0) / GRID.dy)));
  return xi * GRID.ny + yi;
}
/** Where a shot came from, for "what kind of shooter" profiles. */
export function zone(x, y) {
  const dist = Math.hypot(NET - x, y);
  if (dist < 15) return "nf";                       // net front
  if (dist < 32 && Math.abs(y) <= 18 && x < NET) return "slot";
  if (dist < 48) return "flank";                    // circles / half walls
  return "point";
}

/** Shot categories for goalie profiles (a shot can be in several). */
const NET = 89;
export function categories(s) {
  const [x, y, , , , , , strength, , st, flags] = s;
  const dist = Math.hypot(NET - x, y), angle = NET - x > 0 ? (Math.atan2(Math.abs(y), NET - x) * 180) / Math.PI : 90;
  const out = [dist < 15 ? "close" : dist < 35 ? "mid" : "long"];
  if (angle > 45) out.push("sharp");
  const typ = { w: "wrist", n: "snap", s: "slap", b: "backhand", t: "tip", d: "tip", r: "wrap" }[st];
  if (typ) out.push(typ);
  if (flags & 1) out.push("rebound");
  if (flags & 2) out.push("rush");
  if (strength === "5v5") out.push("ev5");
  else if (strength === "PP") out.push("pk"); // shooter on the power play = goalie killing a penalty
  return out;
}

function aggregate(games, saLookup) {
  const teams = {}, skaters = {}, goalies = {};
  const N = GRID.nx * GRID.ny, blank = () => ({ n: new Array(N).fill(0), x: new Array(N).fill(0) });
  const heat = {}; // team -> { all: {f, a}, ev5: {f, a} }
  const H = (t) => (heat[t] ??= { all: { f: blank(), a: blank() }, ev5: { f: blank(), a: blank() } });
  const T = (a) => (teams[a] ??= { team: a, gp: 0, w: 0, l: 0, otl: 0, gf: 0, ga: 0, sf: 0, sa: 0, xgf: 0, xga: 0, xgf5: 0, xga5: 0, gf5: 0, ga5: 0, gfPP: 0, xgfPP: 0, gaPK: 0, xgaPK: 0 });
  for (const g of games) {
    const sides = [g.home, g.away], score = [g.hs, g.as];
    sides.forEach((a, i) => {
      const t = T(a), won = score[i] > score[1 - i];
      t.gp++; t.gf += score[i]; t.ga += score[1 - i];
      if (won) t.w++; else if (g.end !== "REG") t.otl++; else t.l++;
    });
    g.shots.forEach((s, i) => {
      const [, , kind, side, v, shooter, goalie, strength] = s;
      if (kind === "b") return;
      const own = T(sides[side]), opp = T(sides[1 - side]);
      if (v !== 0.9 && v !== null) { // heat maps: unblocked, not into an empty net
        const c = cell(s[0], s[1]);
        if (c !== null) for (const k of strength === "5v5" ? ["all", "ev5"] : ["all"]) {
          const hf = H(sides[side])[k].f, ha = H(sides[1 - side])[k].a;
          hf.n[c]++; hf.x[c] += v; ha.n[c]++; ha.x[c] += v;
        }
      }
      const x = v ?? 0, five = strength === "5v5";
      own.sf++; opp.sa++; own.xgf += x; opp.xga += x;
      const goal = kind === "g" ? 1 : 0;
      if (five) { own.xgf5 += x; opp.xga5 += x; own.gf5 += goal; opp.ga5 += goal; }
      if (strength === "PP") { own.xgfPP += x; own.gfPP += goal; opp.xgaPK += x; opp.gaPK += goal; }
      if (shooter) {
        const p = g.players[shooter];
        const k = (skaters[shooter] ??= { id: shooter, name: p?.[0] || "Unknown", pos: p?.[1] || "", team: sides[side], shots: 0, goals: 0, xg: 0, xg5: 0, g5: 0, games: new Set(), zones: { nf: [0, 0, 0], slot: [0, 0, 0], flank: [0, 0, 0], point: [0, 0, 0] } });
        if (v !== 0.9) { const z = k.zones[zone(s[0], s[1])]; z[0]++; z[1] += kind === "g" ? 1 : 0; z[2] += x; }
        k.team = sides[side]; k.shots++; k.xg += x; k.games.add(g.id);
        if (kind === "g") k.goals++;
        if (five) { k.xg5 += x; if (kind === "g") k.g5++; }
      }
      // Goalie: unblocked shots faced, excluding empty-net (no goalie) chances
      if (goalie && v !== 0.9) {
        const p = g.players[goalie];
        const k = (goalies[goalie] ??= { id: goalie, name: p?.[0] || "Unknown", team: sides[1 - side], shots: 0, ga: 0, xga: 0, saxga: 0, games: new Set(), split: {} });
        k.team = sides[1 - side]; k.shots++; k.xga += x; k.games.add(g.id);
        const sx = saLookup?.get(`${g.id}:${i}`) ?? x;
        k.saxga += sx;
        if (kind === "g") k.ga++;
        for (const c of categories(s)) { const b = (k.split[c] ??= [0, 0, 0]); b[0]++; b[1] += kind === "g" ? 1 : 0; b[2] += sx; }
      }
    });
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    teams: Object.values(teams).map((t) => ({ ...t, pts: t.w * 2 + t.otl, xgf: r2(t.xgf), xga: r2(t.xga), xgf5: r2(t.xgf5), xga5: r2(t.xga5), xgfPP: r2(t.xgfPP), xgaPK: r2(t.xgaPK),
      xgPct: t.xgf + t.xga ? r2((t.xgf / (t.xgf + t.xga)) * 100) : null })),
    skaters: Object.values(skaters).map(({ games, ...k }) => ({ ...k, gp: games.size, xg: r2(k.xg), xg5: r2(k.xg5), gax: r2(k.goals - k.xg),
      zones: Object.fromEntries(Object.entries(k.zones).map(([z, [n, g, x]]) => [z, [n, g, r2(x)]])) })),
    heat: Object.fromEntries(Object.entries(heat).map(([t, h]) => [t, Object.fromEntries(Object.entries(h).map(([k, fa]) => [k,
      Object.fromEntries(Object.entries(fa).map(([w, g]) => [w, { n: g.n, x: g.x.map((v) => Math.round(v * 100) / 100) }]))]))])),
    goalies: Object.values(goalies).map(({ games, split, ...k }) => ({ ...k, gp: games.size,
      split: Object.fromEntries(Object.entries(split).map(([c, [n, ga, x]]) => [c, [n, ga, r2(x)]])), xga: r2(k.xga), gsax: r2(k.xga - k.ga),
      saxga: r2(k.saxga), sa_gsax: r2(k.saxga - k.ga),
      svPct: k.shots ? Math.round(((k.shots - k.ga) / k.shots) * 1000) / 1000 : null })),
  };
}

/**
 * season: e.g. "20262027". get(url): fetch JSON. loadPrevious(name): last night's league.json / teams/{T}.json, or null.
 * cacheDir: optional folder of cached play-by-play (.json.gz) to avoid refetching locally.
 */
/** Quality starts from game logs: a start with save % at least the league average (or ≥ .885 on 20 shots or fewer).
 * Really bad starts: save % under .850. */
async function qualityStarts(season, get) {
  const url = `https://api.nhle.com/stats/rest/en/goalie/summary?isAggregate=false&isGame=true&limit=-1&cayenneExp=seasonId=${season}%20and%20gameTypeId=2`;
  const rows = (await get(url).catch(() => null))?.data || [];
  if (!rows.length) return null; // the stats API failed: leave quality starts out so stored values are kept
  const sa = rows.reduce((n, r) => n + (r.shotsAgainst || 0), 0), ga = rows.reduce((n, r) => n + (r.goalsAgainst || 0), 0);
  const lg = sa ? 1 - ga / sa : 0.9;
  const by = {};
  for (const r of rows) {
    if (!r.gamesStarted) continue;
    const sv = r.shotsAgainst ? 1 - r.goalsAgainst / r.shotsAgainst : 1;
    const b = (by[r.playerId] ??= { gs: 0, qs: 0, rbs: 0 });
    b.gs++;
    if (sv >= lg || (r.shotsAgainst <= 20 && sv >= 0.885)) b.qs++;
    if (sv < 0.85) b.rbs++;
  }
  return { leagueSv: Math.round(lg * 1000) / 1000, by };
}

export { scoreGame };
export async function buildLeague({ season, get, nhl, model, loadPrevious, cacheDir, teams, saModel, outDir = "public/hockey" }) {
  // 1) Reuse last night's games (only if scored with the same model)
  const known = new Map(), stale = new Set();
  // a stored game is reused only if it was scored in the current record format: each game carries its own format
  // (games stored before that stamp existed count as current only if every shot row has all 14 fields)
  const current = (g) => (g.format ? g.format === FORMAT : g.shots?.length > 0 && g.shots.every((s) => s.length >= 14));
  if (loadPrevious) {
    const prevLeague = await loadPrevious("league.json");
    if (prevLeague && prevLeague.model?.trained_on === model.trained_on && prevLeague.season === season && prevLeague.format === FORMAT) {
      for (const t of teams) {
        const f = await loadPrevious(`teams/${t}.json`);
        for (const g of f?.games || []) { if (current(g)) known.set(g.id, g); else stale.add(g.id); }
      }
    }
  }
  // 2) Which games are finished? Scoreboards for recent days when we have a cache, full schedules otherwise.
  const finished = new Map();
  if (known.size) {
    const last = [...known.values()].map((g) => g.date).sort().pop();
    for (let d = new Date(last + "T12:00:00Z"); d <= new Date(); d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      const sb = await get(`${nhl}/score/${day}`).catch(() => null);
      for (const g of sb?.games || []) if (g.gameType === 2 && ["FINAL", "OFF"].includes(g.gameState)) finished.set(g.id, day);
    }
    for (const [id] of known) finished.set(id, true);
    for (const id of stale) finished.set(id, true); // rescored below in the current format
  } else {
    for (const t of teams) {
      const sched = await get(`${nhl}/club-schedule-season/${t}/${season}`);
      for (const g of sched.games || []) if (g.gameType === 2 && ["FINAL", "OFF"].includes(g.gameState)) finished.set(g.id, true);
    }
  }
  // 3) Score new games
  let fetched = 0, fromDisk = 0;
  const missing = [], missingShifts = [];
  const reused = known.size;
  for (const id of [...finished.keys()].sort()) {
    if (known.has(id) && known.get(id).ev && known.get(id).u5) continue;
    let pbp = null;
    if (cacheDir) pbp = await readFile(`${cacheDir}/${id}.json.gz`).then((b) => JSON.parse(gunzipSync(b))).catch(() => null);
    if (pbp) fromDisk++;
    if (!pbp) {
      await new Promise((r) => setTimeout(r, 1000));
      pbp = await get(`${nhl}/gamecenter/${id}/play-by-play`).catch(() => null);
      if (!pbp) { missing.push(id); continue; } // left out tonight; not stored, so tomorrow's run tries it again
      fetched++;
    }
    // shift charts (who was on the ice): local cache when available, else one request
    let shifts = null;
    const shiftCache = process.env.SHIFT_CACHE;
    if (shiftCache) shifts = await readFile(`${shiftCache}/${id}.json.gz`).then((b) => JSON.parse(gunzipSync(b)), () => null);
    if (!shifts) {
      await new Promise((r) => setTimeout(r, 500));
      shifts = (await get(`https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=${id}`).catch(() => null))?.data || null;
      if (shifts && shiftCache) { const { gzipSync } = await import("node:zlib"); await (await import("node:fs/promises")).mkdir(shiftCache, { recursive: true }); await writeFile(`${shiftCache}/${id}.json.gz`, gzipSync(JSON.stringify(shifts))); }
      if (!shifts) missingShifts.push(id);
    }
    known.set(id, scoreGame(pbp, model, shifts));
  }
  const games = [...known.values()].sort((a, b) => a.id - b.id);
  // official scoring (goals, assists, points) for every skater, from the NHL stats API
  const summ = (await get(`https://api.nhle.com/stats/rest/en/skater/summary?isAggregate=true&isGame=false&limit=-1&cayenneExp=seasonId=${season}%20and%20gameTypeId=2`).catch(() => null))?.data || [];
  const scoring = new Map(summ.map((r) => [r.playerId, { g: r.goals, a: r.assists, pts: r.points, pm: r.plusMinus, ppp: r.ppPoints, toi: r.timeOnIcePerGame, gpOff: r.gamesPlayed }]));
  const sa = shooterAware(games, saModel);
  const agg = aggregate(games, sa);
  const qs = await qualityStarts(season, get);
  for (const k of agg.skaters) { const x = scoring.get(k.id); if (x) Object.assign(k, { assists: x.a, points: x.pts, plusMinus: x.pm, ppPoints: x.ppp, toiGp: x.toi ? Math.round(x.toi / 6) / 10 : null, gpOfficial: x.gpOff }); }
  for (const gk of qs ? agg.goalies : []) {
    const q = qs.by[gk.id];
    Object.assign(gk, q ? { gs: q.gs, qs: q.qs, qsPct: q.gs ? Math.round((q.qs / q.gs) * 1000) / 1000 : null, rbs: q.rbs } : { gs: 0, qs: 0, qsPct: null, rbs: 0 });
  }
  const stamp = new Date().toISOString();
  await mkdir(`${outDir}/teams`, { recursive: true });
  for (const t of teams) {
    const mine = games.filter((g) => g.home === t || g.away === t);
    await writeFile(`${outDir}/teams/${t}.json`, JSON.stringify({ updatedAt: stamp, season, team: t, model: { trained_on: model.trained_on }, games: mine }));
  }
  const { heat, ...aggLean } = agg;
  await writeFile(`${outDir}/heat.json`, JSON.stringify({ updatedAt: stamp, season, grid: GRID,
    gp: Object.fromEntries(agg.teams.map((t) => [t.team, t.gp])), teams: heat, throughDate: games.map((g) => g.date).sort().pop() || null }));
  const league = { format: FORMAT, updatedAt: stamp, season, games: games.length, gameIds: games.map((g) => g.id).sort((a, b) => a - b), model: { trained_on: model.trained_on, test: model.test },
    saModel: saModel ? { k: saModel.k, c: saModel.c, test: saModel.test } : null, leagueSv: qs?.leagueSv ?? null, qsFetchedAt: qs ? new Date().toISOString() : null,
    throughDate: games.map((g) => g.date).sort().pop() || null, ...aggLean };
  await writeFile(`${outDir}/league.json`, JSON.stringify(league));
  return { games: games.length, fetched, fromDisk, reused, missing, missingShifts, qsOk: !!qs, list: games, sa };
}
