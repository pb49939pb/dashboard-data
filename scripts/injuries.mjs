// Man-games lost for Hockey Lab: games an established player missed while he belonged to a team, weighted by what
// he'd have produced (points and wins). There's no public injury feed we can use, so absences are inferred from who
// dressed in every game (the play-by-play roster of each game we've scored):
//   belonging: from the season's start (or his first game with the team if he arrived by trade / call-up) to its
//     latest game (or his last game there if he left; a player on the team's current NHL roster still belongs)
//   established: played 40+ games the season before (goalies 20+), or holds a lineup spot on talent (WAR-lite
//     0.3+ wins per 82 for skaters; 35%+ of starts for goalies). Depth players and call-ups are left out: their
//     absences are mostly healthy scratches or the AHL.
//   counted: every stretch of 2+ straight games missed; a single missed game only for a top player (1+ wins per 82),
//     who isn't scratched
//   weights: points per game from the season files (this season blended with last), else estimated from WAR-lite;
//     wins per game = WAR-lite per 82 / 82 (goalies' already carries their share of starts)
//   node scripts/injuries.mjs                  → public/hockey/injuries.json (this season + last season's frozen file)
//   node scripts/injuries.mjs --season 20252026 → model/injuries-20252026.json (run once locally for a finished season)
import { readFile, writeFile } from "node:fs/promises";

const UA = { "User-Agent": "hockey-lab/1.0 (+https://patrickreidbaldwin.com/hockey; personal, non-commercial)" };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p) => readFile(p, "utf8").then(JSON.parse, () => null);
const arg = process.argv.indexOf("--season"), only = arg > 0 ? process.argv[arg + 1] : null;

const league = await readJson("public/hockey/league.json");
const pv = (await readJson("model/playerValue.json")) || { players: [] };
// CapWages roster status (public capwages/live, nightly): tells injured reserve from the minors for players who are out
// now (the NHL roster feed can't). Missing = the older "off-roster" label stands.
const cwStatus = await fetch("https://firestore.googleapis.com/v1/projects/pat-dashboard-eb494/databases/(default)/documents/capwages/live")
  .then((r) => (r.ok ? r.json() : null)).then((d) => (d ? new Map(JSON.parse(d.fields.json.stringValue).players.map((x) => [Number(x.id), x.hits?.[0] == null && x.lastDeal ? "Unsigned" : x.s])) : null)).catch(() => null);
const REASON = { IR: "injured reserve", LTIR: "long-term injured reserve", SOIR: "injured reserve", SEIR: "injured reserve", Minor: "in the minors", Loan: "on loan", Suspended: "suspended", Unsigned: "unsigned (no contract this season)" };
const pvById = new Map(pv.players.map((p) => [p.id, p]));
const current = String(league.season), season = only || current;
const prevOf = (s) => `${Number(s.slice(0, 4)) - 1}${s.slice(0, 4)}`;
const teams = league.teams.map((t) => t.team);

// points per game: the season files where we have them, else a fit on WAR-lite by position group
const sf = (await readJson("public/hockey/players.json"))?.players || [];
const ppgSeen = new Map(sf.filter((x) => x.toiGp && x.pts60 != null).map((x) => [x.id, (x.pts60 * x.toiGp) / 60]));
const fit = {};
for (const g of ["F", "D"]) {
  const xs = sf.map((r) => [pvById.get(r.id), ppgSeen.get(r.id)]).filter(([p, y]) => p && p.group === g && y != null && p.gp3 >= 60).map(([p, y]) => [p.war82, y]);
  const n = xs.length || 1, mx = xs.reduce((a, [v]) => a + v, 0) / n, my = xs.reduce((a, [, y]) => a + y, 0) / n;
  const b = xs.reduce((a, [v, y]) => a + (v - mx) * (y - my), 0) / (xs.reduce((a, [v]) => a + (v - mx) ** 2, 0) || 1);
  fit[g] = { a: my - b * mx, b, n: xs.length };
}
const ppgOf = (p) => (p.group === "G" ? 0 : ppgSeen.get(p.id) ?? Math.max(0.05, fit[p.group].a + fit[p.group].b * p.war82));

async function gamesOf(s, t) {
  const path = s === current ? `public/hockey/teams/${t}.json` : `public/hockey/seasons/${s}/teams/${t}.json`;
  const d = await readJson(path);
  return (d?.games || []).filter((g) => g.players && String(g.id).slice(4, 6) === "02") // regular season only.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((g) => ({ id: g.id, date: g.date, dressed: new Set(Object.entries(g.players).filter(([, v]) => (v[2] === 0) === (g.home === t)).map(([id]) => Number(id))) }));
}

const rosterPos = {}; // team -> [[id, position]] (saved for the roster-aware season simulation)
async function rosters() { // who's on each NHL roster right now (injured players included)
  const out = {};
  for (const t of teams) {
    await pause(400);
    const r = await fetch(`https://api-web.nhle.com/v1/roster/${t}/current`, { headers: UA }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (r) { out[t] = new Set([...(r.forwards || []), ...(r.defensemen || []), ...(r.goalies || [])].map((p) => p.id)); rosterPos[t] = [...(r.forwards || []), ...(r.defensemen || []), ...(r.goalies || [])].map((p) => [p.id, p.positionCode]); }
  }
  // the current-roster feed leaves out injured reserve: an established player whose last team was t, who is on no
  // current roster, counts as t's (out) when his NHL player page still lists him with t
  const onAny = new Set(Object.values(out).flatMap((x) => [...x]));
  for (const p of pv.players) {
    if (onAny.has(p.id) || !out[p.team] || p.lastGp + p.curGp < (p.group === "G" ? 20 : 40)) continue;
    await pause(400);
    const l = await fetch(`https://api-web.nhle.com/v1/player/${p.id}/landing`, { headers: UA }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (l?.isActive && l.currentTeamAbbrev === p.team) { out[p.team].add(p.id); rosterPos[p.team].push([p.id, l.position || p.pos]); offRoster.push(`${p.name} (${p.team})`); offRosterIds.add(p.id); }
  }
  return out;
}
const offRoster = [], offRosterIds = new Set(); // signed players missing from the roster feed (injured reserve or the minors)

async function build(s) {
  const live = s === current, roster = live ? await rosters() : {};
  const G = Object.fromEntries(await Promise.all(teams.map(async (t) => [t, await gamesOf(s, t)])));
  // every team a player dressed for this season, in order (for trades)
  const stints = new Map();
  for (const t of teams) G[t].forEach((g, i) => { for (const id of g.dressed) { const st = stints.get(id) || {}; (st[t] ||= []).push({ i, date: g.date }); stints.set(id, st); } });
  const priorGp = (p) => (s === current ? p.lastGp : Math.max(0, p.gp3 - p.curGp - p.lastGp)); // the season before s
  const out = {};
  for (const t of teams) {
    const games = G[t], n = games.length, rows = [];
    if (!n) { out[t] = { gp: 0, mgl: 0, ptsLost: 0, winsLost: 0, players: [] }; continue; }
    const cands = new Set([...stints.entries()].filter(([, st]) => st[t]).map(([id]) => id));
    for (const id of roster[t] || []) cands.add(id);
    // a regular from before who never dressed for anyone this season and was last with this team (out all year)
    for (const p of pv.players) if (!stints.has(p.id) && p.team === t && priorGp(p) >= (p.group === "G" ? 20 : 40) && (live ? roster[t]?.has(p.id) : true)) cands.add(p.id);
    for (const id of cands) {
      const p = pvById.get(id);
      if (!p) continue;
      const st = stints.get(id) || {}, mine = st[t] || [];
      const established = priorGp(p) >= (p.group === "G" ? 20 : 40) || (p.group === "G" ? (p.startShare || 0) >= 0.35 : p.war82 >= 0.3);
      if (!established) continue;
      const firstHere = mine[0]?.date, lastHere = mine[mine.length - 1]?.date;
      const elsewhere = Object.entries(st).filter(([u]) => u !== t).flatMap(([, xs]) => xs.map((x) => x.date)).sort();
      const cameBefore = elsewhere.some((d) => firstHere && d < firstHere), leftAfter = elsewhere.some((d) => lastHere ? d > lastHere : true);
      const start = mine.length && (cameBefore || priorGp(p) < (p.group === "G" ? 20 : 40)) ? mine[0].i : 0; // newcomers count from their first game
      const stillHere = live ? roster[t]?.has(id) : !leftAfter && (p.team === t || mine.length > 0);
      const end = leftAfter && mine.length ? mine[mine.length - 1].i : stillHere ? n - 1 : mine.length ? mine[mine.length - 1].i : -1;
      if (end < start) continue;
      // stretches of games missed
      const stretches = [];
      let run = null;
      for (let i = start; i <= end; i++) {
        if (games[i].dressed.has(id)) { if (run) { stretches.push(run); run = null; } continue; }
        run ||= { from: games[i].date, to: games[i].date, games: 0, fromI: i };
        run.to = games[i].date; run.games++;
      }
      if (run) stretches.push({ ...run, ongoing: end === n - 1 && live });
      const counted = stretches.filter((r) => r.games >= 2 || p.war82 >= 1).map(({ fromI, ...r }) => r);
      const missed = counted.reduce((a, r) => a + r.games, 0);
      if (!missed) continue;
      const ppg = ppgOf(p), wpg = Math.max(0, p.war82) / 82;
      rows.push({ id, name: p.name, pos: p.pos, group: p.group, missed, of: end - start + 1, ppg: +ppg.toFixed(3), wpg: +wpg.toFixed(4),
        pts: +(missed * ppg).toFixed(1), wins: +(missed * wpg).toFixed(2), out: counted.some((r) => r.ongoing), stretches: counted, ppgEstimated: !ppgSeen.has(id) && p.group !== "G",
        // why he's out now, as far as rosters can tell (no confirmed-injury source): off the NHL roster but still signed
        // = injured reserve or the minors; on the roster but not dressing = scratch, day-to-day or illness
        ...(counted.some((r) => r.ongoing) ? { status: offRosterIds.has(id) ? "off-roster" : roster[t]?.has(id) ? "not-dressing" : "unknown",
          ...(cwStatus?.get(id) && REASON[cwStatus.get(id)] ? { reason: REASON[cwStatus.get(id)], cwStatus: cwStatus.get(id) } : {}) } : {}) });
    }
    rows.sort((a, b) => b.wins - a.wins || b.pts - a.pts);
    out[t] = { gp: n, mgl: rows.reduce((a, r) => a + r.missed, 0), ptsLost: +rows.reduce((a, r) => a + r.pts, 0).toFixed(1), winsLost: +rows.reduce((a, r) => a + r.wins, 0).toFixed(2), players: rows };
  }
  return { season: s, builtAt: new Date().toISOString(), teams: out, ppgFit: fit, rostersChecked: live ? Object.keys(roster).length : null, ...(live ? { rosters: rosterPos, injuredReserve: offRoster } : {}) };
}

if (only) {
  const d = await build(only);
  await writeFile(`model/injuries-${only}.json`, JSON.stringify(d));
  console.log(`injuries ${only}: ` + Object.entries(d.teams).sort((a, b) => b[1].winsLost - a[1].winsLost).slice(0, 6).map(([t, x]) => `${t} ${x.mgl} games, ${x.ptsLost} pts, ${x.winsLost} wins`).join("; "));
} else {
  const now = await build(current), prev = await readJson(`model/injuries-${prevOf(current)}.json`);
  await writeFile("public/hockey/injuries.json", JSON.stringify({ builtAt: now.builtAt, season: current, current: now, previous: prev,
    method: "Inferred from who dressed in each game (NHL play-by-play rosters) and current NHL rosters; weighted by Hockey Lab WAR-lite and points per game." }));
  console.log(`injuries: ${Object.values(now.teams).reduce((a, x) => a + x.mgl, 0)} man-games this season (${now.rostersChecked} rosters); last season ${prev ? "loaded" : "missing"}`);
}
