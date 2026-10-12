// Builds redwings.json for the dashboard from public NHL and MoneyPuck data.
// Runs on a schedule in GitHub Actions (see .github/workflows/update.yml); Node 20+, no dependencies.
// Neither source allows browsers on other sites to read it directly, so this republishes what the dashboard needs.
import { writeFile, mkdir } from "node:fs/promises";

const TEAM = "DET";
const NHL = "https://api-web.nhle.com/v1";
const MP = "https://moneypuck.com/moneypuck/playerData/seasonSummary";

async function get(url, as = "json") {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "pat-dashboard (personal, low volume)" }, redirect: "follow" });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return as === "json" ? await res.json() : await res.text();
    } catch (e) {
      if (attempt >= 3) throw e;
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
let mpSkaters = [], mpGoalies = [], mpError = null;
try {
  const [sk, gk] = await Promise.all([get(`${MP}/${mpYear}/regular/skaters.csv`, "text"), get(`${MP}/${mpYear}/regular/goalies.csv`, "text")]);
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
  sources: { nhl: "api-web.nhle.com", xg: mpError ? null : "MoneyPuck.com", xgError: mpError },
};
await mkdir("public", { recursive: true });
await writeFile("public/redwings.json", JSON.stringify(out));
console.log(`redwings.json: ${out.team.w}-${out.team.l}-${out.team.otl}, ${skaters.length} skaters, ${goalies.length} goalies, next: ${out.nextGames[0]?.opponent.abbrev ?? "none"}${mpError ? `, MoneyPuck failed: ${mpError}` : ""}`);
