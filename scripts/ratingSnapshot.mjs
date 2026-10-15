// Rating history (F14): keep what the player ratings said, so aging curves become possible as seasons accumulate.
// Write-once documents (never edited after the first write):
//   hockey/ratingHistory/{season}/{YYYY-MM}   the first nightly run of each month (Eastern), during the season
//   hockey/ratingHistory/{season}/final       a finished season's published ratings (backfilled from seasons/{season})
// Each row: id -> [name, team, pos, born, gp, toiGp, ovr, off, def, use, war82] (war82 only in monthly snapshots: today's
// player value isn't what it was in a past season, so backfilled finals leave it null). `blendedWith` records that in-season
// ratings blend in last season at half weight (the published ratings), so later analysis can tell them apart.
// Public data only (no contracts).   node scripts/ratingSnapshot.mjs   (STORE_DRY_RUN=1 to check without writing)
import { readFile, readdir } from "node:fs/promises";
import { openStore } from "./store.mjs";

const read = (p) => readFile(p, "utf8").then(JSON.parse, () => null);
const born = new Map(((await read("public/hockey/playerValue.json"))?.players || []).map((p) => [p.id, p]));
function rows(doc, withWar) {
  return Object.fromEntries(doc.players.filter((p) => p.ratings).map((p) => {
    const v = born.get(p.id), r = p.ratings;
    return [p.id, [p.name, p.team, p.pos, v?.born ?? null, p.season?.gp ?? null, p.season?.toiGp ?? p.toiGp ?? null, r.ovr, r.off, r.def, r.use, withWar && v ? Number(v.war82.toFixed(3)) : null]];
  }));
}
const snap = (doc, key, withWar = false) => ({ season: String(doc.season), key, ratingsUpdatedAt: doc.updatedAt || null, blendedWith: doc.blendedWith ?? null, observedAt: new Date().toISOString(),
  columns: ["name", "team", "pos", "born", "gp", "toiGp", "ovr", "off", "def", "use", "war82"], players: rows(doc, withWar) });

const store = await openStore();
if (!store) { console.log("no Firestore credentials; nothing saved"); process.exit(0); }
let wrote = 0, kept = 0;
async function writeOnce(path, data) {
  if (await store.read(path).catch(() => null)) { kept++; return; }
  await store.put(path, data, { season: data.season, key: data.key }, { replace: true }); wrote++;
}
// this month's in-season snapshot
const cur = await read("public/hockey/players.json");
if (cur?.players?.length) {
  const month = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7);
  await writeOnce(`hockey/ratingHistory/${cur.season}/${month}`, snap(cur, month, true)); // player value as of tonight
}
// finished seasons' final ratings (backfill; a no-op once written): local season files, else the published season
// documents (hockey/seasons/{season}/players), since CI only restores the current season
const local = await readdir("public/hockey/seasons").catch(() => []);
const done = new Set();
for (const s of local) {
  const doc = await read(`public/hockey/seasons/${s}/players.json`);
  if (doc?.players?.length && String(doc.season) !== String(cur?.season)) { await writeOnce(`hockey/ratingHistory/${doc.season}/final`, snap(doc, "final")); done.add(String(doc.season)); }
}
for (const s of ["20242025", "20252026"]) {
  if (done.has(s) || s === String(cur?.season)) continue;
  const doc = await store.read(`hockey/seasons/${s}/players`).catch(() => null);
  if (doc?.players?.length) await writeOnce(`hockey/ratingHistory/${s}/final`, snap({ season: s, ...doc }, "final"));
}
console.log(`rating history: ${wrote} written, ${kept} already kept`);
