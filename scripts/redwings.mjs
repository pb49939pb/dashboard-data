// Builds redwings.json for the dashboard from public NHL and MoneyPuck data.
// Runs nightly at 11 PM Eastern in GitHub Actions (see .github/workflows/update.yml); Node 20+, no dependencies.
// Neither source allows browsers on other sites to read it directly, so this republishes what the dashboard needs.
import { writeFile, mkdir, access } from "node:fs/promises";
import { buildShots } from "./shots.mjs";
import { buildLeague } from "./league.mjs";
import { teamRatings, simulate, schedulesAndDivisions, winProbability } from "./sim.mjs";
import { startRun, hostOf } from "./runlog.mjs";
import { buildPlayers } from "./players.mjs";
import { buildStyles } from "./style.mjs";
import { buildLines } from "./lines.mjs";

const run = startRun("nightly-build");
const notes = {};

const TEAM = "DET";
const NHL = "https://api-web.nhle.com/v1";
const MP = "https://moneypuck.com/moneypuck/playerData/seasonSummary";

async function get(url, as = "json") {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "pat-dashboard (personal, low volume)" }, redirect: "follow" });
      run.count(hostOf(url), { ok: res.ok });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const body = as === "json" ? await res.json() : await res.text();
      if (attempt > 1) run.retry(hostOf(url), true); // failed at first, fine on a retry
      return body;
    } catch (e) {
      if (attempt >= 3) { run.retry(hostOf(url), false); throw e; }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

/** Minimal CSV parser for MoneyPuck's files (no quoted commas in the columns we use). */
function csvRows(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => {
    const v = l.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
  });
}
const num = (x) => (x === undefined || x === "" ? null : Number(x));
const round = (x, d = 2) => (x === null || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

const [standings, clubStats, schedule] = await Promise.all([
  get(`${NHL}/standings/now`),
  get(`${NHL}/club-stats/${TEAM}/now`),
  get(`${NHL}/club-schedule-season/${TEAM}/now`),
]);

// Season id like 20262027 -> MoneyPuck uses the starting year (2026).
const season = String(schedule.currentSeason || clubStats.season || "");
const mpYear = season.slice(0, 4);
let mpSkaters = [], mpGoalies = [], mpError = null, mpSkText = null;
try {
  const [sk, gk] = await Promise.all([get(`${MP}/${mpYear}/regular/skaters.csv`, "text"), get(`${MP}/${mpYear}/regular/goalies.csv`, "text")]);
  mpSkText = sk;
  mpSkaters = csvRows(sk).filter((r) => r.team === TEAM);
  mpGoalies = csvRows(gk).filter((r) => r.team === TEAM);
} catch (e) {
  mpError = String(e.message || e); // keep publishing NHL data even if MoneyPuck is down
}
const mp = (rows, id, situation) => rows.find((r) => r.playerId === String(id) && r.situation === situation);

/* ---------- Standings: record, division, conference, wildcard race ---------- */
const rows = standings.standings;
const me = rows.find((t) => t.teamAbbrev.default === TEAM);
const east = rows.filter((t) => t.conferenceAbbrev === me.conferenceAbbrev);
const team = (t) => ({
  abbrev: t.teamAbbrev.default, name: t.teamCommonName?.default || t.teamName.default,
  gp: t.gamesPlayed, w: t.wins, l: t.losses, otl: t.otLosses, pts: t.points, pctg: round(t.pointPctg, 3),
  rw: t.regulationWins, div: t.divisionAbbrev, divSeq: t.divisionSequence, wcSeq: t.wildcardSequence,
  logo: t.teamLogo, streak: t.streakCode ? `${t.streakCode}${t.streakCount}` : null, l10: `${t.l10Wins}-${t.l10Losses}-${t.l10OtLosses}`,
});
// Playoff picture: top 3 in each division are in; the next two best in the conference hold the wildcards.
const wildcardRace = east.filter((t) => t.wildcardSequence > 0).sort((a, b) => a.wildcardSequence - b.wildcardSequence).map(team);
const wc2 = wildcardRace[1];
const inPlayoffs = me.divisionSequence <= 3 || (me.wildcardSequence > 0 && me.wildcardSequence <= 2);
const divisionLeaders = [...new Set(east.map((t) => t.divisionAbbrev))].map((d) =>
  east.filter((t) => t.divisionAbbrev === d).sort((a, b) => a.divisionSequence - b.divisionSequence).slice(0, 3).map(team));

/* ---------- Schedule: next games and last result ---------- */
const games = schedule.games || [];
const upcoming = games.filter((g) => ["FUT", "PRE"].includes(g.gameState) || ["LIVE", "CRIT"].includes(g.gameState)).slice(0, 5);
const finished = games.filter((g) => ["FINAL", "OFF"].includes(g.gameState));
const gameOut = (g) => {
  const home = g.homeTeam.abbrev === TEAM;
  const opp = home ? g.awayTeam : g.homeTeam;
  // Networks a Red Wings fan can watch: national, plus Detroit's own market (home or away side).
  const tv = (g.tvBroadcasts || []).filter((b) => b.market === "N" || b.market === (home ? "H" : "A")).map((b) => b.network);
  return {
    id: g.id, startUTC: g.startTimeUTC, state: g.gameState, home,
    opponent: { abbrev: opp.abbrev, name: opp.commonName?.default || opp.placeName?.default || opp.abbrev, logo: opp.logo || opp.darkLogo },
    venue: g.venue?.default || null, tv,
    score: g.homeTeam.score !== undefined ? { us: home ? g.homeTeam.score : g.awayTeam.score, them: home ? g.awayTeam.score : g.homeTeam.score, ending: g.gameOutcome?.lastPeriodType || null } : null,
  };
};

/* ---------- Players ---------- */
const skaters = (clubStats.skaters || []).map((p) => {
  const a = mp(mpSkaters, p.playerId, "all"), e5 = mp(mpSkaters, p.playerId, "5on5");
  return {
    id: p.playerId, name: `${p.firstName.default} ${p.lastName.default}`, pos: p.positionCode, headshot: p.headshot,
    gp: p.gamesPlayed, g: p.goals, a: p.assists, pts: p.points, pm: p.plusMinus, pim: p.penaltyMinutes,
    ppg: p.powerPlayGoals, shots: p.shots, shPct: round(p.shootingPctg * 100, 1), toi: round(p.avgTimeOnIcePerGame / 60, 1),
    // MoneyPuck expected goals (all situations unless noted)
    ixG: a ? round(num(a.I_F_xGoals)) : null,
    xGF: a ? round(num(a.OnIce_F_xGoals)) : null,
    xGA: a ? round(num(a.OnIce_A_xGoals)) : null,
    xGPct: a ? round(num(a.onIce_xGoalsPercentage) * 100, 1) : null,
    xGF5: e5 ? round(num(e5.OnIce_F_xGoals)) : null,
    xGA5: e5 ? round(num(e5.OnIce_A_xGoals)) : null,
    gameScore: a ? round(num(a.gameScore), 1) : null,
  };
});
const goalies = (clubStats.goalies || []).map((p) => {
  const a = mp(mpGoalies, p.playerId, "all");
  const xGA = a ? num(a.xGoals) : null, ga = a ? num(a.goals) : null;
  return {
    id: p.playerId, name: `${p.firstName.default} ${p.lastName.default}`, headshot: p.headshot,
    gp: p.gamesPlayed, gs: p.gamesStarted, w: p.wins, l: p.losses, otl: p.overtimeLosses,
    gaa: round(p.goalsAgainstAverage), svPct: round(p.savePercentage, 3), sa: p.shotsAgainst, saves: p.saves, ga: p.goalsAgainst, so: p.shutouts,
    xGA: round(xGA), gsax: xGA !== null && ga !== null ? round(xGA - ga) : null,
    hdxGA: a ? round(num(a.highDangerxGoals)) : null, hdGA: a ? num(a.highDangerGoals) : null,
  };
});

const out = {
  updatedAt: new Date().toISOString(),
  season,
  team: team(me),
  standing: {
    division: me.divisionName, divisionSeq: me.divisionSequence,
    conference: me.conferenceName, conferenceSeq: me.conferenceSequence,
    wildcardSeq: me.wildcardSequence, inPlayoffs,
    pointsBackOfWildcard: !inPlayoffs && wc2 ? wc2.pts - me.points : 0,
    gamesInHandOnWildcard: !inPlayoffs && wc2 ? wc2.gp - me.gamesPlayed : 0,
  },
  divisionLeaders, wildcardRace,
  nextGames: upcoming.map(gameOut),
  lastGame: finished.length ? gameOut(finished[finished.length - 1]) : null,
  skaters, goalies,
  sources: { nhl: "api-web.nhle.com", xg: mpError ? null : "MoneyPuck.com", xgError: mpError || "" }, // "" (not null) so a cleared error replaces an old one
  // when each source last answered (stored values keep the last good time when a source fails)
  sourceTimes: { nhl: new Date().toISOString(), moneypuck: mpError ? null : new Date().toISOString() },
};
await mkdir("public", { recursive: true });
await writeFile("public/redwings.json", JSON.stringify(out));

/* ---------- Shots with our xG (incremental) ---------- */
const MODEL = "model/xg_logit.json";
/** The published xG model: gradient-boosted trees + shooter handedness (NHL stats API bios, this and last season). */
async function loadModel() {
  const fs = await import("node:fs/promises");
  const m = JSON.parse(await fs.readFile(MODEL, "utf8"));
  m.gbm = await fs.readFile("model/xg_gbm.json", "utf8").then(JSON.parse, () => null);
  if (m.gbm) { m.trained_on = m.gbm.trained_on; m.test = m.gbm.test; }
  m.hands = {};
  for (const s of [String(Number(season.slice(0, 4)) - 1) + season.slice(0, 4), season]) {
    const r = await get(`https://api.nhle.com/stats/rest/en/skater/bios?isAggregate=false&isGame=false&limit=-1&cayenneExp=seasonId=${s}`).catch(() => null);
    for (const p of r?.data || []) if (p.shootsCatches) m.hands[p.playerId] = p.shootsCatches;
  }
  run.check(Object.keys(m.hands).length > 500, "Shooter handedness (for off-wing shots)", `${Object.keys(m.hands).length} players`);
  return m;
}
let xgModel = null;
// Last night's data, restored from Firestore by scripts/restore.mjs (so only new games are fetched)
const PREV = process.env.PREV_DIR || "prev";
const readPrev = (name) => import("node:fs/promises").then((fs) => fs.readFile(`${PREV}/${name}`, "utf8")).then(JSON.parse, () => null);
let shotsNote = "skipped (no model yet)";
if (await access(MODEL).then(() => true, () => false)) {
  const previous = await readPrev("redwings-shots.json"); // null on the first run
  const done = finished.filter((g) => g.gameType === 2).map((g) => ({ id: g.id }));
  const { file, fetched } = await buildShots({
    team: TEAM, games: done, previous, modelPath: (xgModel ??= await loadModel()),
    getPbp: async (id) => { await new Promise((r) => setTimeout(r, 1000)); return get(`${NHL}/gamecenter/${id}/play-by-play`); },
  });
  await writeFile("public/redwings-shots.json", JSON.stringify(file));
  shotsNote = `${file.games.length} games (${fetched} newly fetched)`;
}
console.log(`redwings.json: ${out.team.w}-${out.team.l}-${out.team.otl}, ${skaters.length} skaters, ${goalies.length} goalies, next: ${out.nextGames[0]?.opponent.abbrev ?? "none"}${mpError ? `, MoneyPuck failed: ${mpError}` : ""}`);
console.log(`redwings-shots.json: ${shotsNote}`);

/* ---------- Hockey Lab: every game league-wide, scored with our model ---------- */
if (await access(MODEL).then(() => true, () => false)) {
  const model = (xgModel ??= await loadModel());
  const allTeams = rows.map((t) => t.teamAbbrev.default).sort();
  const r = await buildLeague({
    season, get, nhl: NHL, model, teams: allTeams,
    saModel: await access("model/xg_sa.json").then(async () => JSON.parse(await (await import("node:fs/promises")).readFile("model/xg_sa.json", "utf8")), () => null),
    loadPrevious: (name) => readPrev(`hockey/${name}`),
    cacheDir: process.env.HOCKEY_CACHE || null, // local runs: reuse hockey-models' downloaded games
  });
  // Static model report card from the last training run
  await writeFile("public/hockey/model.json", await (await import("node:fs/promises")).readFile("model/model_card.json", "utf8"));
  console.log(`hockey/league.json: ${r.games} games (${r.fetched} fetched from the NHL)`);
  Object.assign(notes, { games: r.games, gamesFetched: r.fetched, gamesReusedFromLastNight: r.reused, gamesFromLocalCache: r.fromDisk });
  run.check(!r.missing.length, "Every finished game scored", r.missing.length ? `${r.missing.length} finished game(s) couldn't be fetched (${r.missing.slice(0, 5).join(", ")}); tonight's numbers leave them out and the next run tries again` : `${r.games} games`);
  run.check(r.qsOk, "Quality starts", r.qsOk ? "NHL stats API answered" : "NHL stats API failed; the stored quality-start numbers were kept (they may be a day old)");

  /* ---------- Lines and defense pairs (shift charts) ---------- */
  const lines = buildLines(r.list, allTeams);
  await writeFile("public/hockey/lines.json", JSON.stringify({ updatedAt: new Date().toISOString(), season, throughDate: r.list.map((g) => g.date).sort().pop() || null, teams: lines }));
  run.check(!r.missingShifts.length, "Shift charts (lines and on-ice data)", r.missingShifts.length ? `${r.missingShifts.length} game(s) without shift charts; their lines and on-ice numbers are left out and retried next run` : "every game");

  /* ---------- Team styles (offense / defense fingerprints, archetypes, matchups) ---------- */
  const stylePrior = await (await import("node:fs/promises")).readFile("model/stylePrior.json", "utf8").then(JSON.parse, () => null);
  if (stylePrior) {
    const styles = buildStyles(r.list, stylePrior, season);
    await writeFile("public/hockey/styles.json", JSON.stringify(styles));
    // The widget is public, so the next opponent's style goes into redwings.json as a short summary
    const nx = out.nextGames?.[0], us = styles.teams[TEAM], them = nx && styles.teams[nx.opponent.abbrev];
    if (us && them) {
      const A = styles.archetypes, find = (o, d) => styles.matchups.find((m) => m.off === o && m.def === d);
      const label = (side, t) => (t[`${side}Fit`] >= 58 ? A[side][t[side]].name : `${A[side][t[side]].name} / ${A[side][t[`${side}2`]].name}`);
      const ours = find(us.off, them.def), theirs = find(them.off, us.def);
      const clear = (m) => !!m && (m.lo > 0 || m.hi < 0);
      out.nextOpponentStyle = { opponent: nx.opponent.abbrev, gameId: nx.id, offense: label("off", them), defense: label("def", them),
        ourOffense: ours ? { effect: ours.effect, clear: clear(ours), vs: A.def[them.def].name, ours: A.off[us.off].name } : null,
        theirOffense: theirs ? { effect: theirs.effect, clear: clear(theirs), vs: A.def[us.def].name, theirs: A.off[them.off].name } : null,
        fromSeasons: styles.prior.seasons, updatedAt: styles.updatedAt };
      await writeFile("public/redwings.json", JSON.stringify(out));
    }
    run.check(r.list.every((g) => g.ev), "Zone events for team styles", r.list.every((g) => g.ev) ? "every game has hits/takeaways/giveaways by zone" : "some games lack zone events");
  }

  /* ---------- Projected standings and playoff odds ---------- */
  const fs = await import("node:fs/promises");
  const ratings = await fs.readFile("model/ratings.json", "utf8").then(JSON.parse, () => null);
  if (ratings) {
    const remaining = new Map();
    let schedFails = 0;
    for (const t of allTeams) {
      await new Promise((res) => setTimeout(res, 500));
      const sc = await get(`${NHL}/club-schedule-season/${t}/${season}`).catch(() => { schedFails++; return null; });
      for (const g of sc?.games || []) if (g.gameType === 2 && !["FINAL", "OFF"].includes(g.gameState)) remaining.set(g.id, { id: g.id, date: g.gameDate, home: g.homeTeam.abbrev, away: g.awayTeam.abbrev });
    }
    run.check(!schedFails, "Remaining schedule for projections", schedFails ? `${schedFails} team schedule(s) failed; projections leave out their unplayed games` : `${remaining.size} games left`);
    const R = teamRatings(r.list, ratings, r.sa);
    const sim = simulate({ R, standings: rows, remaining: [...remaining.values()] });
    Object.assign(sim, schedulesAndDivisions({ R, standings: rows, played: r.list, remaining: [...remaining.values()] }));
    // Next game: Detroit's chance to win (team ratings, finishing, goaltending, home ice, style matchup at half weight)
    const nx = out.nextGames?.[0];
    if (nx && R.teams[TEAM] && R.teams[nx.opponent.abbrev]) {
      const opp = nx.opponent.abbrev, [home, away] = nx.home ? [TEAM, opp] : [opp, TEAM];
      const st = out.nextOpponentStyle && out.nextOpponentStyle.gameId === nx.id ? out.nextOpponentStyle : null;
      const ours = 1 + 0.5 * (st?.ourOffense?.effect || 0), theirs = 1 + 0.5 * (st?.theirOffense?.effect || 0);
      const base = winProbability(R, home, away), withStyle = winProbability(R, home, away, nx.home ? { home: ours, away: theirs } : { home: theirs, away: ours });
      const us = (p) => (nx.home ? p.home : 1 - p.home);
      out.nextGameOdds = { gameId: nx.id, opponent: opp, home: nx.home, win: Math.round(us(withStyle) * 1000) / 10, withoutStyle: Math.round(us(base) * 1000) / 10,
        xgFor: Math.round((nx.home ? withStyle.xgHome : withStyle.xgAway) * 100) / 100, xgAgainst: Math.round((nx.home ? withStyle.xgAway : withStyle.xgHome) * 100) / 100,
        overtimeChance: Math.round(withStyle.overtime * 1000) / 10, model: "team ratings (opponent/score/venue-adjusted xG, blended with last season), finishing and goaltending (shrunk), home ice, style matchup at half weight; 10,000-season simulation's game model",
        updatedAt: new Date().toISOString() };
      await writeFile("public/redwings.json", JSON.stringify(out));
      notes.nextGameWin = `${out.nextGameOdds.win}% vs ${opp}`;
    }
    await writeFile("public/hockey/projections.json", JSON.stringify({ updatedAt: new Date().toISOString(), season, throughDate: r.list.map((g) => g.date).sort().pop() || null,
      standingsAsOf: standings.standingsDateTimeUtc || new Date().toISOString(), prior: { season: ratings.season, notes: ratings.notes }, ...sim }));
    Object.assign(notes, { gamesLeftSimulated: sim.remaining, simulations: sim.sims });
    console.log(`hockey/projections.json: ${sim.remaining} games left, top: ${sim.teams.slice(0, 3).map((t) => `${t.team} ${t.projPts}`).join(", ")}, DET ${sim.teams.find((t) => t.team === "DET")?.projPts} (${sim.teams.find((t) => t.team === "DET")?.playoffs}% playoffs)`);
  }
  // Front-office models and the starter contract list, built offline by hockey-models
  for (const f of ["age", "trades", "gm", "draft", "scouting", "heatPrior", "coaches", "teamCap"]) { // contracts come from scripts/contracts.py
    // stamp when the offline model was built (file time), for the "source · updated" lines in the app
    const [text, st] = await Promise.all([fs.readFile(`model/${f}.json`, "utf8"), fs.stat(`model/${f}.json`)]).catch(() => [null, null]);
    if (!text) continue;
    const d = JSON.parse(text);
    const out = Array.isArray(d) ? { items: d } : d;
    out.builtAt ??= st.mtime.toISOString();
    await writeFile(`public/hockey/${f}.json`, JSON.stringify(out));
  }
}
/* ---------- Player ratings (offense, defense, usage) for every skater ---------- */
if (mpSkText) {
  const prevText = await get(`${MP}/${Number(mpYear) - 1}/regular/skaters.csv`, "text").catch(() => null);
  const players = buildPlayers(mpSkText, prevText);
  await (await import("node:fs/promises")).mkdir("public/hockey", { recursive: true });
  await writeFile("public/hockey/players.json", JSON.stringify({ updatedAt: new Date().toISOString(), season, blendedWith: prevText ? String(Number(mpYear) - 1) : null,
    source: "MoneyPuck.com season files (on-ice expected goals, ice time, zone starts, blocks, takeaways, giveaways)", players }));
  notes.playerRatings = players.length;
  run.check(!!prevText, "Last season's numbers for player ratings", prevText ? "blended at half weight" : "MoneyPuck's last-season file failed; ratings use this season only (noisier early on)");
}
run.check(!!mpSkText, "Player ratings (defense, usage)", mpSkText ? "rebuilt" : "MoneyPuck failed; yesterday's player ratings are kept");
notes.moneyPuck = mpError ? `failed: ${mpError}` : "ok";
run.check(!mpError, "MoneyPuck expected goals (widget)", mpError ? `MoneyPuck failed (${mpError}); the widget keeps the last good xG and says how old it is` : "fresh");
run.finish({ ok: true, notes, outputs: ["public/hockey/players.json", "public/redwings.json", "public/redwings-shots.json", "public/hockey/league.json", "public/hockey/teams/*.json", "public/hockey/heat.json", "public/hockey/projections.json"] });
