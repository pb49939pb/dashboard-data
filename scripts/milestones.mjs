// Milestone watch (F12): active players approaching round-number career milestones (500 goals, 1,000 points, 300 wins…)
// and when they'd get there at their pace. Career totals come from the NHL player pages (api-web.nhle.com/v1/player/{id}/
// landing), cached in .cache/careers for a week; players within reach of a milestone are refreshed every night.
// Pace = per game over this season and last (this season counted double), games = his team's remaining schedule (he
// plays every game unless he's been missing them; a goalie by his share of starts). Projection only: "if he keeps his
// pace and plays", never a promise.   node scripts/milestones.mjs  -> public/hockey/milestones.json
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {careerLanding} from "./careerLanding.mjs";

const UA = { "User-Agent": "hockey-lab/1.0 (personal, non-commercial)" };
const read = (p) => readFile(p, "utf8").then(JSON.parse, () => null);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const league = await read("public/hockey/league.json"), proj = await read("public/hockey/projections.json");
if (!league || !proj) { console.log("missing league or projections; skipped"); process.exit(0); }
const SK = { goals: [200, 300, 400, 500, 600, 700, 800, 900, 1000], assists: [300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200],
  points: [500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900], gamesPlayed: [800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600] };
const GK = { wins: [200, 250, 300, 350, 400, 450, 500, 550], shutouts: [40, 50, 60, 70], gamesPlayed: [500, 600, 700, 800, 900, 1000] };
const LABEL = { goals: "goals", assists: "assists", points: "points", gamesPlayed: "games", wins: "wins", shutouts: "shutouts" };
await mkdir(".cache/careers", { recursive: true });
async function landing(id,fresh){return careerLanding(id,{fresh});}
const near = (v, list) => list.some((m) => v < m && v >= m * 0.8);
const season = Number(String(league.season));
const left = Object.fromEntries(proj.teams.map((t) => [t.team, proj.schedule.filter((g) => g.home === t.team || g.away === t.team).sort((a, b) => (a.date < b.date ? -1 : 1))]));
const players = [...league.skaters.map((s) => ({ id: s.id, team: s.team, kind: "skater" })), ...league.goalies.map((g) => ({ id: g.id, team: g.team, kind: "goalie" }))];
const rows = [], reached = [];
for (const p of players) {
  let L = await landing(p.id, false);
  if (!L?.career) continue;
  const M = p.kind === "goalie" ? GK : SK;
  if (Object.entries(M).some(([k, list]) => near(L.career[k] ?? 0, list))) L = (await landing(p.id, true)) || L;
  const cur = L.seasons.find((s) => s.season === season), prev = L.seasons.find((s) => s.season === season - 10001);
  const teamGames = left[p.team] || [], teamPlayed = (league.teams.find((t) => t.team === p.team)?.gp) || 0;
  // games he'll play: every remaining game at his share of his team's games so far (goalies: share of starts)
  const share = cur && teamPlayed ? Math.min(1, (p.kind === "goalie" ? (cur.gs ?? cur.gp) : cur.gp) / teamPlayed) : 0;
  for (const [k, list] of Object.entries(M)) {
    const have = L.career[k] ?? 0, next = list.find((m) => m > have);
    const startOfSeason = have - (k === "gamesPlayed" ? cur?.gp ?? 0 : k === "goals" ? cur?.g ?? 0 : k === "assists" ? cur?.a ?? 0 : k === "points" ? (cur?.g ?? 0) + (cur?.a ?? 0) : k === "wins" ? cur?.w ?? 0 : cur?.so ?? 0);
    const crossed = list.filter((m) => startOfSeason < m && have >= m).pop();
    if (crossed) reached.push({ id: p.id, name: L.name, team: p.team, stat: LABEL[k], milestone: crossed, have });
    if (!next) continue;
    const per = (s) => (!s?.gp ? null : k === "gamesPlayed" ? 1 : (k === "goals" ? s.g : k === "assists" ? s.a : k === "points" ? s.g + s.a : k === "wins" ? s.w : s.so) / s.gp);
    const pc = per(cur), pp = per(prev), rate = k === "gamesPlayed" ? 1 : pc != null && pp != null ? (2 * pc * cur.gp + pp * prev.gp) / (2 * cur.gp + prev.gp) : pc ?? pp;
    if (!rate || !share) continue;
    const need = next - have, gamesNeeded = Math.ceil(need / rate), teamGamesNeeded = Math.ceil(gamesNeeded / share);
    if (teamGamesNeeded > teamGames.length) continue; // not this season at his pace
    const g = teamGames[teamGamesNeeded - 1];
    rows.push({ id: p.id, name: L.name, team: p.team, kind: p.kind, stat: LABEL[k], milestone: next, have, need, rate: +rate.toFixed(3), share: +share.toFixed(2), gamesNeeded, date: g.date, opp: g.home === p.team ? g.away : g.home, home: g.home === p.team });
  }
}
rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.need - b.need));
await writeFile("public/hockey/milestones.json", JSON.stringify({ builtAt: new Date().toISOString(), season: String(league.season), upcoming: rows.slice(0, 40), reached }));
console.log(`milestones: ${rows.length} within reach this season, ${reached.length} reached this season; shared cached player pages`);
