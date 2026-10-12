// Copies tonight's build (public/*.json from redwings.mjs) into Firestore, merging over what's stored so nothing
// already known is lost. Runs after redwings.mjs in GitHub Actions; does nothing without FIREBASE_SERVICE_ACCOUNT.
//   node scripts/publish.mjs
import { readFile, readdir } from "node:fs/promises";
import { openStore } from "./store.mjs";

const store = await openStore();
if (!store) { console.log("FIREBASE_SERVICE_ACCOUNT not set; skipping the Firestore publish"); process.exit(0); }
const load = (p) => readFile(p, "utf8").then(JSON.parse, () => null);

// Red Wings widget (public)
const rw = await load("public/redwings.json");
if (rw) await store.put("public/redwings", rw);
const rwShots = await load("public/redwings-shots.json");
if (rwShots) await store.put("public/redwingsShots", rwShots);

// Hockey Lab (signed-in users)
const league = await load("public/hockey/league.json");
if (league) {
  await store.put("hockey/league", league);
  // one document per game, from the per-team files (each game is in two of them)
  const games = new Map();
  for (const f of await readdir("public/hockey/teams").catch(() => [])) {
    const t = await load(`public/hockey/teams/${f}`);
    for (const g of t?.games || []) games.set(g.id, g);
  }
  const n = await store.putMany([...games.values()].map((g) => ({
    path: `hockey/games/${league.season}/${g.id}`, data: g, fields: { teams: [g.home, g.away], date: g.date },
  })));
  console.log(`games: ${games.size} (${n} written)`);
}
const proj = await load("public/hockey/projections.json");
if (proj) {
  await store.put("hockey/projections", proj);
  // a small nightly snapshot for "odds over time" charts
  const day = proj.updatedAt.slice(0, 10);
  await store.put(`hockey/history/${proj.season}/${day}`, { date: day, teams: proj.teams.map((t) => ({ team: t.team, pts: t.pts, gp: t.gp, projPts: t.projPts, playoffs: t.playoffs, cup: t.cup })) }, { date: day });
}
for (const name of ["model", "contracts", "age", "gm"]) {
  const d = await load(`public/hockey/${name}.json`);
  if (d) await store.put(`hockey/${name}`, d, {}, { replace: true });
}

// Front office: too big for one document each, so a league summary plus one document per team
const [draft, scouting, trades] = await Promise.all(["draft", "scouting", "trades"].map((n) => load(`public/hockey/${n}.json`)));
if (draft && scouting && trades) {
  const { picks, ...draftSum } = draft, { acquisitions, ...scoutSum } = scouting, { trades: list, ...tradeSum } = trades;
  await store.put("hockey/frontOffice", { draft: draftSum, scouting: scoutSum, trades: tradeSum }, {}, { replace: true });
  const teams = new Set([...picks.map((p) => p.team), ...acquisitions.map((a) => a.team), ...list.flatMap((t) => t.sides.map((s) => s.team))]);
  for (const team of teams) {
    await store.put(`hockey/frontOffice/teams/${team}`, {
      picks: picks.filter((p) => p.team === team), acquisitions: acquisitions.filter((a) => a.team === team),
      trades: list.filter((t) => t.sides.some((s) => s.team === team)),
    }, {}, { replace: true });
  }
}
console.log(`Firestore: ${store.writes} documents written${process.env.STORE_DRY_RUN ? " (dry run, in memory)" : ""}`);
