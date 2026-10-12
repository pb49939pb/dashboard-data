// League-wide data for Hockey Lab: every regular-season game of the current season scored with our xG model.
// Publishes public/hockey/league.json (leaderboards) and public/hockey/teams/{TEAM}.json (shots for shot maps).
// Incremental: the previously published team files are the cache; only newly finished games are fetched from the NHL.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { gameShots, xg } from "./shots.mjs";

const KIND = { goal: "g", "shot-on-goal": "s", "missed-shot": "m", "blocked-shot": "b" };

/** Compact, model-scored record of one game (stored in both teams' files). */
function scoreGame(pbp, model) {
  const rows = gameShots(pbp).filter((r) => r.periodType !== "SO");
  const players = {};
  for (const p of pbp.rosterSpots || []) players[p.playerId] = [`${p.firstName.default} ${p.lastName.default}`, p.positionCode, p.teamId === pbp.homeTeam.id ? 0 : 1];
  return {
    id: pbp.id, date: pbp.gameDate, home: pbp.homeTeam.abbrev, away: pbp.awayTeam.abbrev,
    hs: pbp.homeTeam.score, as: pbp.awayTeam.score, end: pbp.gameOutcome?.lastPeriodType || "REG", players,
    // [x, y, kind, side (0 home shooter / 1 away), xG, shooterId, goalieId, strength, period]
    shots: rows.map((r) => {
      const v = xg(r, model);
      return [Math.round(r.x), Math.round(r.y), KIND[r.type], r.home ? 0 : 1, v === null ? null : Math.round(v * 1000) / 1000,
        r.shooterId ?? null, r.goalieId ?? null, r.strength, r.period];
    }),
  };
}

function aggregate(games) {
  const teams = {}, skaters = {}, goalies = {};
  const T = (a) => (teams[a] ??= { team: a, gp: 0, w: 0, l: 0, otl: 0, gf: 0, ga: 0, sf: 0, sa: 0, xgf: 0, xga: 0, xgf5: 0, xga5: 0 });
  for (const g of games) {
    const sides = [g.home, g.away], score = [g.hs, g.as];
    sides.forEach((a, i) => {
      const t = T(a), won = score[i] > score[1 - i];
      t.gp++; t.gf += score[i]; t.ga += score[1 - i];
      if (won) t.w++; else if (g.end !== "REG") t.otl++; else t.l++;
    });
    for (const s of g.shots) {
      const [, , kind, side, v, shooter, goalie, strength] = s;
      if (kind === "b") continue;
      const own = T(sides[side]), opp = T(sides[1 - side]);
      const x = v ?? 0, five = strength === "5v5";
      own.sf++; opp.sa++; own.xgf += x; opp.xga += x;
      if (five) { own.xgf5 += x; opp.xga5 += x; }
      if (shooter) {
        const p = g.players[shooter];
        const k = (skaters[shooter] ??= { id: shooter, name: p?.[0] || "Unknown", pos: p?.[1] || "", team: sides[side], shots: 0, goals: 0, xg: 0, xg5: 0, g5: 0, games: new Set() });
        k.team = sides[side]; k.shots++; k.xg += x; k.games.add(g.id);
        if (kind === "g") k.goals++;
        if (five) { k.xg5 += x; if (kind === "g") k.g5++; }
      }
      // Goalie: unblocked shots faced, excluding empty-net (no goalie) chances
      if (goalie && v !== 0.9) {
        const p = g.players[goalie];
        const k = (goalies[goalie] ??= { id: goalie, name: p?.[0] || "Unknown", team: sides[1 - side], shots: 0, ga: 0, xga: 0, games: new Set() });
        k.team = sides[1 - side]; k.shots++; k.xga += x; k.games.add(g.id);
        if (kind === "g") k.ga++;
      }
    }
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    teams: Object.values(teams).map((t) => ({ ...t, pts: t.w * 2 + t.otl, xgf: r2(t.xgf), xga: r2(t.xga), xgf5: r2(t.xgf5), xga5: r2(t.xga5),
      xgPct: t.xgf + t.xga ? r2((t.xgf / (t.xgf + t.xga)) * 100) : null })),
    skaters: Object.values(skaters).map(({ games, ...k }) => ({ ...k, gp: games.size, xg: r2(k.xg), xg5: r2(k.xg5), gax: r2(k.goals - k.xg) })),
    goalies: Object.values(goalies).map(({ games, ...k }) => ({ ...k, gp: games.size, xga: r2(k.xga), gsax: r2(k.xga - k.ga),
      svPct: k.shots ? Math.round(((k.shots - k.ga) / k.shots) * 1000) / 1000 : null })),
  };
}

/**
 * season: e.g. "20262027". get(url): fetch JSON. previousBase: URL of the published hockey/ folder (or null).
 * cacheDir: optional folder of cached play-by-play (.json.gz) to avoid refetching locally.
 */
export async function buildLeague({ season, get, nhl, model, previousBase, cacheDir, teams }) {
  // 1) Reuse games from the previously published team files (only if scored with the same model)
  const known = new Map();
  if (previousBase) {
    const prevLeague = await get(`${previousBase}/league.json`).catch(() => null);
    if (prevLeague && prevLeague.model?.trained_on === model.trained_on && prevLeague.season === season) {
      for (const t of teams) {
        const f = await get(`${previousBase}/teams/${t}.json`).catch(() => null);
        for (const g of f?.games || []) known.set(g.id, g);
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
  } else {
    for (const t of teams) {
      const sched = await get(`${nhl}/club-schedule-season/${t}/${season}`);
      for (const g of sched.games || []) if (g.gameType === 2 && ["FINAL", "OFF"].includes(g.gameState)) finished.set(g.id, true);
    }
  }
  // 3) Score new games
  let fetched = 0;
  for (const id of [...finished.keys()].sort()) {
    if (known.has(id)) continue;
    let pbp = null;
    if (cacheDir) pbp = await readFile(`${cacheDir}/${id}.json.gz`).then((b) => JSON.parse(gunzipSync(b))).catch(() => null);
    if (!pbp) { await new Promise((r) => setTimeout(r, 1000)); pbp = await get(`${nhl}/gamecenter/${id}/play-by-play`); fetched++; }
    known.set(id, scoreGame(pbp, model));
  }
  const games = [...known.values()].sort((a, b) => a.id - b.id);
  const agg = aggregate(games);
  const stamp = new Date().toISOString();
  await mkdir("public/hockey/teams", { recursive: true });
  for (const t of teams) {
    const mine = games.filter((g) => g.home === t || g.away === t);
    await writeFile(`public/hockey/teams/${t}.json`, JSON.stringify({ updatedAt: stamp, season, team: t, model: { trained_on: model.trained_on }, games: mine }));
  }
  const league = { updatedAt: stamp, season, games: games.length, model: { trained_on: model.trained_on, test: model.test }, ...agg };
  await writeFile("public/hockey/league.json", JSON.stringify(league));
  return { games: games.length, fetched };
}
