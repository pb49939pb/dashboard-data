// Copies tonight's build (public/*.json from redwings.mjs) into Firestore, merging over what's stored so nothing
// already known is lost. Runs after redwings.mjs in GitHub Actions; does nothing without FIREBASE_SERVICE_ACCOUNT.
//   node scripts/publish.mjs
import { readFile, readdir } from "node:fs/promises";
import { openStore } from "./store.mjs";
import { CATALOG } from "./catalog.mjs";

const only = process.argv.slice(2); // e.g. `node scripts/publish.mjs contracts` publishes just that
const want = (name) => !only.length || only.includes(name);
const store = await openStore();
if (!store) { console.log("FIREBASE_SERVICE_ACCOUNT not set; skipping the Firestore publish"); process.exit(0); }
const t0 = Date.now();

/** Admin panel: every job's latest run, latest success and a run history, plus the catalog (owner-only in the rules). */
async function publishAdmin(extra = []) {
  const logs = [...extra];
  for (const f of await readdir("public/admin").catch(() => [])) if (f.startsWith("run-")) { const l = await load(`public/admin/${f}`); if (l) logs.push(l); }
  const offline = await load("model/runs.json"); // offline model runs, logged on the Mac by hockey-models
  for (const l of offline?.runs || []) logs.push({ ...l, job: "models", model: l.job });
  for (const l of logs) {
    const id = l.model ? `models-${l.model}` : l.job;
    const before = await store.read(`admin/jobs/latest/${id}`).catch(() => null);
    const sum = (x, k) => Object.values(x.sources || {}).reduce((n, v) => n + (v[k] || 0), 0);
    const brief = (x) => ({ startedAt: x.startedAt, ok: x.ok, seconds: x.seconds, requests: sum(x, "requests"), recovered: sum(x, "recovered"), gaveUp: sum(x, "gaveUp"),
      issues: (x.health || []).filter((h) => !h.ok).length });
    const history = [brief(l), ...(before?.history || []).filter((h) => h.startedAt !== l.startedAt)].slice(0, 30);
    await store.put(`admin/jobs/latest/${id}`, { ...l, history }, { job: l.job }, { replace: true });
    if (l.ok) await store.put(`admin/jobs/success/${id}`, l, { job: l.job }, { replace: true });
    await store.put(`admin/jobs/runs/${id}-${l.startedAt}`, l, { job: id, startedAt: l.startedAt }, { replace: true });
  }
  await store.put("admin/catalog", CATALOG, {}, { replace: true });
}
if (only.includes("admin")) { await publishAdmin(); console.log("admin logs published"); process.exit(0); }
const load = (p) => readFile(p, "utf8").then(JSON.parse, () => null);
const publishLog = () => ({ job: "publish", ok: true, error: null, startedAt: new Date(t0).toISOString(), finishedAt: new Date().toISOString(),
  seconds: Math.round((Date.now() - t0) / 100) / 10, sources: { firestore: { requests: store.writes, cached: 0, failed: 0 } }, notes: { documentsWritten: store.writes, only: only.join(",") || "all" },
  github: process.env.GITHUB_RUN_ID ? { run: process.env.GITHUB_RUN_ID, url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` } : { local: true } });

// Contracts: merged like everything else, so a source that fails a week never wipes a known cap hit
if (want("contracts")) {
  const c = await load("public/hockey/contracts.json");
  if (c) await store.put("hockey/contracts", c);
}
if (only.length && !only.some((n) => n !== "contracts")) {
  await publishAdmin([publishLog()]);
  console.log(`Firestore: ${store.writes} documents written`); process.exit(0);
}

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
const players = await load("public/hockey/players.json");
if (players) await store.put("hockey/players", players, {}, { replace: true }); // rebuilt in full each night (only written when MoneyPuck answered)
const heat = await load("public/hockey/heat.json");
if (heat) await store.put("hockey/heat", heat, {}, { replace: true }); // rebuilt from every stored game each night
for (const name of ["model", "age", "gm", "heatPrior"]) {
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
await publishAdmin([publishLog()]);
console.log(`Firestore: ${store.writes} documents written${process.env.STORE_DRY_RUN ? " (dry run, in memory)" : ""}`);
