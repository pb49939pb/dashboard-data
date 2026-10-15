// Rest and travel (F13): for every game in the next two weeks, each team's days of rest, whether it's the second night of
// a back-to-back, games in the last week and miles from its previous game's arena. Effects come from
// model/restEffect.json (hockey-models rest_travel.py, 2015-26): only effects whose 90% range excludes zero are shown
// as effects (so far only back-to-backs); travel is context. Not an input to any odds.
//   node scripts/restTravel.mjs  -> public/hockey/restTravel.json
import { readFile, readdir, writeFile } from "node:fs/promises";

const read = (p) => readFile(p, "utf8").then(JSON.parse, () => null);
const eff = await read("model/restEffect.json"), proj = await read("public/hockey/projections.json");
if (!eff?.arenas || !proj?.schedule) { console.log("missing restEffect.json or projections; skipped"); process.exit(0); }
const A = eff.arenas;
const miles = (a, b) => { if (!A[a] || !A[b]) return null; const r = Math.PI / 180, [la1, lo1] = A[a], [la2, lo2] = A[b];
  const c = Math.sin(la1 * r) * Math.sin(la2 * r) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r); return Math.round(3958.8 * Math.acos(Math.max(-1, Math.min(1, c)))); };
// every game this season: played (per-team files) + remaining (projections schedule)
const all = new Map();
for (const f of await readdir("public/hockey/teams").catch(() => [])) for (const g of (await read(`public/hockey/teams/${f}`))?.games || []) all.set(g.id, { id: g.id, date: g.date, home: g.home, away: g.away });
for (const g of proj.schedule) if (!all.has(g.id)) all.set(g.id, { id: g.id, date: g.date, home: g.home, away: g.away });
const games = [...all.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
const byTeam = {};
for (const g of games) for (const t of [g.home, g.away]) (byTeam[t] ??= []).push(g);
const day = (d) => Date.parse(`${d}T12:00:00Z`) / 864e5;
function side(g, t) {
  const list = byTeam[t], i = list.indexOf(g), prev = i > 0 ? list[i - 1] : null;
  const rest = prev ? day(g.date) - day(prev.date) - 1 : null;
  const week = list.filter((x) => day(x.date) < day(g.date) && day(x.date) >= day(g.date) - 7).length;
  return { rest, b2b: rest === 0, week, miles: prev ? miles(prev.home, g.home) : null, from: prev?.home ?? null };
}
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const upcoming = games.filter((g) => day(g.date) >= day(today) && day(g.date) < day(today) + 14).map((g) => {
  const h = side(g, g.home), a = side(g, g.away);
  return { id: g.id, date: g.date, home: g.home, away: g.away, h, a, edge: h.b2b && !a.b2b ? "away" : a.b2b && !h.b2b ? "home" : null };
});
const out = { builtAt: new Date().toISOString(), today, effects: eff.effects, measured: { seasons: eff.seasons, games: eff.games }, games: upcoming };
await writeFile("public/hockey/restTravel.json", JSON.stringify(out));
console.log(`rest and travel: ${upcoming.length} games in the next 14 days, ${upcoming.filter((g) => g.edge).length} with a back-to-back edge`);
