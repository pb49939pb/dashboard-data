// Before the nightly build: pull last night's games and shots out of Firestore into prev/, in the same shape the
// build used to read from the published files, so only newly finished games are fetched from the NHL.
//   node scripts/restore.mjs        (does nothing without FIREBASE_SERVICE_ACCOUNT; the build then fetches everything)
import { mkdir, writeFile } from "node:fs/promises";
import { openStore } from "./store.mjs";

const store = await openStore();
if (!store) { console.log("FIREBASE_SERVICE_ACCOUNT not set; nothing to restore"); process.exit(0); }
const out = process.env.PREV_DIR || "prev";
await mkdir(`${out}/hockey/teams`, { recursive: true });

const shots = await store.read("public/redwingsShots");
if (shots) await writeFile(`${out}/redwings-shots.json`, JSON.stringify(shots));
const contracts = await store.read("hockey/contracts");
if (contracts) await writeFile(`${out}/hockey/contracts.json`, JSON.stringify(contracts));
const league = await store.read("hockey/league");
if (league) {
  await writeFile(`${out}/hockey/league.json`, JSON.stringify(league));
  const games = await store.readAll(`hockey/games/${league.season}`);
  const byTeam = {};
  for (const g of games) for (const t of [g.home, g.away]) (byTeam[t] ??= []).push(g);
  for (const [t, gs] of Object.entries(byTeam)) {
    await writeFile(`${out}/hockey/teams/${t}.json`, JSON.stringify({ season: league.season, team: t, model: league.model, games: gs.sort((a, b) => a.id - b.id) }));
  }
  console.log(`restored ${games.length} games for ${Object.keys(byTeam).length} teams`);
}

const impactMeta=await store.read("hockey/impactMeta");
if(impactMeta)await writeFile(`${out}/hockey/impactMeta.json`,JSON.stringify(impactMeta));
