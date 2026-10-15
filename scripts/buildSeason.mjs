// Freeze a finished season for Hockey Lab's season picker (run once per season, on the Mac with the caches):
//   HOCKEY_CACHE=../hockey-models/data/raw/pbp SHIFT_CACHE=../hockey-models/data/raw/shifts node scripts/buildSeason.mjs 20252026
// Writes public/hockey/seasons/{season}/: league, teams/*, heat, players, styles, lines, and "projections" holding the
// final standings, the real playoff bracket, strength of schedule and division strength. publish.mjs puts them in
// Firestore under hockey/seasons/{season}/ (and the games under hockey/games/{season}/).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { buildLeague } from "./league.mjs";
import { buildPlayers } from "./players.mjs";
import { buildStyles } from "./style.mjs";
import { buildLines } from "./lines.mjs";
import { teamRatings, schedulesAndDivisions } from "./sim.mjs";

const season = process.argv[2];
const y0 = Number(season.slice(0, 4)), out = `public/hockey/seasons/${season}`;
const NHL = "https://api-web.nhle.com/v1", MP = "https://moneypuck.com/moneypuck/playerData/seasonSummary";
const get = async (url, as = "json") => { await new Promise((r) => setTimeout(r, 400)); const r = await fetch(url, { headers: { "user-agent": "pat-dashboard (personal, low volume)" } }); if (!r.ok) throw new Error(`${r.status} ${url}`); return as === "json" ? r.json() : r.text(); };

// final standings on the league's last regular-season day (not one team's: DET finished a day early in 2025-26 and
// 12 teams were frozen at 81 games)
const lastDay = (await get(`${NHL}/standings-season`)).seasons.find((x) => String(x.id) === season)?.standingsEnd;
if (!lastDay) throw new Error(`no standingsEnd for ${season}`);
const standings = (await get(`${NHL}/standings/${lastDay}`)).standings;
const teams = standings.map((t) => t.teamAbbrev.default).sort();

const model = JSON.parse(await readFile("model/xg_logit.json", "utf8"));
model.gbm = JSON.parse(await readFile("model/xg_gbm.json", "utf8"));
model.trained_on = model.gbm.trained_on; model.test = model.gbm.test;
model.hands = {};
for (const s of [`${y0 - 1}${y0}`, season]) for (const p of (await get(`https://api.nhle.com/stats/rest/en/skater/bios?isAggregate=false&isGame=false&limit=-1&cayenneExp=seasonId=${s}`)).data || []) if (p.shootsCatches) model.hands[p.playerId] = p.shootsCatches;
const saModel = JSON.parse(await readFile("model/xg_sa.json", "utf8"));

await mkdir(out, { recursive: true });
const r = await buildLeague({ season, get, nhl: NHL, model, teams, saModel, cacheDir: process.env.HOCKEY_CACHE, outDir: out });
console.log(`${season}: ${r.games} games, ${r.missingShifts.length} without shifts`);

const [cur, prev] = await Promise.all([get(`${MP}/${y0}/regular/skaters.csv`, "text"), get(`${MP}/${y0 - 1}/regular/skaters.csv`, "text").catch(() => null)]);
await writeFile(`${out}/players.json`, JSON.stringify({ updatedAt: new Date().toISOString(), season, blendedWith: prev ? `${y0 - 1}` : null, source: "MoneyPuck.com season files", players: buildPlayers(cur, prev) }));
const prior = JSON.parse(await readFile("model/stylePrior.json", "utf8"));
await writeFile(`${out}/styles.json`, JSON.stringify(buildStyles(r.list, prior, season)));
await writeFile(`${out}/lines.json`, JSON.stringify({ updatedAt: new Date().toISOString(), season, throughDate: r.list.map((g) => g.date).sort().pop(), teams: buildLines(r.list, teams) }));

// "projections" for a finished season = what actually happened
const ratings = JSON.parse(await readFile("model/ratings.json", "utf8"));
const R = teamRatings(r.list, ratings, r.sa);
const sd = schedulesAndDivisions({ R, standings, played: r.list, remaining: [] });
const br = await get(`${NHL}/playoff-bracket/${y0 + 1}`);
const S = Object.fromEntries((br.series || []).map((x) => [x.seriesLetter, x]));
const ser = (x) => x && ({ hi: x.topSeedTeam.abbrev, lo: x.bottomSeedTeam.abbrev, winsHi: x.topSeedWins, winsLo: x.bottomSeedWins,
  fav: x.winningTeamId === x.topSeedTeam.id ? x.topSeedTeam.abbrev : x.winningTeamId === x.bottomSeedTeam.id ? x.bottomSeedTeam.abbrev : null, seedHi: x.topSeedRankAbbrev, seedLo: x.bottomSeedRankAbbrev });
const bracket = { actual: true, E: { divisions: [], r1: ["A", "B", "C", "D"].map((k) => ser(S[k])), r2: ["I", "J"].map((k) => ser(S[k])), cf: ser(S.M) },
  W: { divisions: [], r1: ["E", "F", "G", "H"].map((k) => ser(S[k])), r2: ["K", "L"].map((k) => ser(S[k])), cf: ser(S.N) }, final: ser(S.O) };
const reached = {};
for (const x of br.series || []) for (const t of [x.topSeedTeam.abbrev, x.bottomSeedTeam.abbrev]) reached[t] = Math.max(reached[t] || 0, x.playoffRound);
const champ = bracket.final?.fav;
const result = (t) => (t === champ ? "Won the Stanley Cup" : reached[t] === 4 ? "Lost in the Final" : reached[t] === 3 ? "Lost in the conference final" : reached[t] === 2 ? "Lost in the second round" : reached[t] === 1 ? "Lost in the first round" : "Missed the playoffs");
const finalTeams = standings.map((s) => { const t = s.teamAbbrev.default, R0 = R.teams[t];
  return { team: t, name: s.teamCommonName?.default || t, conf: s.conferenceAbbrev, div: s.divisionAbbrev, pts: s.points, gp: s.gamesPlayed, w: s.wins, l: s.losses, otl: s.otLosses,
    projPts: s.points, lo: s.points, hi: s.points, playoffs: reached[t] ? 100 : 0, cup: t === champ ? 100 : 0, result: result(t), round: reached[t] || 0,
    rating: R0 ? { off: +R0.off.toFixed(3), def: +R0.def.toFixed(3), gf: +R0.gf.toFixed(2), ga: +R0.ga.toFixed(2), fin: +R0.fin.toFixed(3), gk: +R0.gk.toFixed(3), gp: R0.gp } : null }; })
  .sort((a, b) => b.pts - a.pts);
const short = finalTeams.filter((t) => t.gp !== 82).map((t) => `${t.team} ${t.gp}`);
if (short.length) throw new Error(`final standings as of ${lastDay} aren't complete: ${short.join(", ")}`);
await writeFile(`${out}/projections.json`, JSON.stringify({ final: true, updatedAt: new Date().toISOString(), season, standingsAsOf: lastDay, mu: R.mu, remaining: 0, sims: 0, teams: finalTeams, bracket, ...sd }));
console.log("champion:", champ, "| DET:", finalTeams.find((t) => t.team === "DET")?.pts, "pts,", result("DET"));
