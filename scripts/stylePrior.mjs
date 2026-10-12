// Yearly (by hand, on the Mac with hockey-models' play-by-play cache): learn team style archetypes and
// style-vs-style matchup effects from full seasons, scored with the current xG model.
//   HOCKEY_CACHE=../hockey-models/data/raw/pbp node scripts/stylePrior.mjs 20242025 20252026   -> model/stylePrior.json
import { readFile, readdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { scoreGame } from "./league.mjs";
import { buildPrior } from "./style.mjs";

const dir = process.env.HOCKEY_CACHE, seasons = process.argv.slice(2);
const model = JSON.parse(await readFile("model/xg_logit.json", "utf8"));
model.gbm = JSON.parse(await readFile("model/xg_gbm.json", "utf8"));
model.hands = {};
for (const s of seasons) {
  const r = await fetch(`https://api.nhle.com/stats/rest/en/skater/bios?isAggregate=false&isGame=false&limit=-1&cayenneExp=seasonId=${s}`, { headers: { "user-agent": "pat-dashboard (personal, low volume)" } }).then((x) => x.json());
  for (const p of r.data || []) if (p.shootsCatches) model.hands[p.playerId] = p.shootsCatches;
}
const bySeason = {};
const files = await readdir(dir);
for (const s of seasons) {
  bySeason[s] = [];
  for (const f of files.filter((f) => f.startsWith(s.slice(0, 4)))) {
    const pbp = JSON.parse(gunzipSync(await readFile(`${dir}/${f}`)));
    if (String(pbp.season) !== s || pbp.gameType !== 2) continue;
    bySeason[s].push(scoreGame(pbp, model));
  }
  console.log(s, bySeason[s].length, "games");
}
const prior = buildPrior(bySeason);
await writeFile("model/stylePrior.json", JSON.stringify(prior));
console.log("offense:", prior.archetypes.off.map((a) => a.name).join(" | "));
console.log("defense:", prior.archetypes.def.map((a) => a.name).join(" | "));
for (const m of prior.matchups) console.log(prior.archetypes.off[m.off].name.padEnd(20), "vs", prior.archetypes.def[m.def].name.padEnd(20), `${(m.effect * 100).toFixed(1)}%`, `(${(m.lo * 100).toFixed(1)} to ${(m.hi * 100).toFixed(1)})`, m.n);
const cur = prior.teamSeasons.filter((r) => r.season === seasons.at(-1));
for (const r of cur.filter((r) => ["DET", "CAR", "COL", "TBL", "FLA", "VGK", "EDM", "TOR"].includes(r.team))) console.log(r.team, prior.archetypes.off[r.off].name, "/", prior.archetypes.def[r.def].name);
