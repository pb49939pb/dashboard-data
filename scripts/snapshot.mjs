// Nightly point-in-time snapshot of what the trade and team models could see (audit A4). One compact document per day,
// written once, never edited: admin/snapshots/days/{YYYY-MM-DD} (owner only: it includes contracts). A backtest of trade
// values, phases or player projections "as of" a date reads that day's snapshot instead of today's corrected data.
//   observedAt = when this pipeline recorded it; each source keeps its own built/updated time.
//   node scripts/snapshot.mjs     (needs FIREBASE_SERVICE_ACCOUNT; STORE_DRY_RUN=1 prints the size instead)
import { readFile } from "node:fs/promises";
import { openStore } from "./store.mjs";

const read = (n) => readFile(`public/hockey/${n}.json`, "utf8").then(JSON.parse, () => null);
const [pv, contracts, assets, proj, injuries] = await Promise.all(["playerValue", "contracts", "assets", "projections", "injuries"].map(read));
const day = new Date().toISOString().slice(0, 10);
const snap = {
  date: day, observedAt: new Date().toISOString(), version: 1,
  sources: { playerValue: pv?.builtAt || null, contracts: contracts?.builtAt || contracts?.asOf || null, assets: assets?.builtAt || null,
    projections: proj?.updatedAt || null, injuries: injuries?.builtAt || null },
  // id -> [team, war82, gp3, curGp]
  playerValue: pv ? Object.fromEntries(pv.players.map((p) => [p.id, [p.team, p.war82, p.gp3, p.curGp]])) : null,
  // id -> [team, status, aav, start, end, elc, next aav, next start, next end, firstObservedAt]
  contracts: contracts ? Object.fromEntries((contracts.players || []).map((r) => [r.id, [r.team, r.status, r.aav ?? null, r.start ?? null, r.end ?? null, !!r.elc,
    r.next?.aav ?? null, r.next?.start ?? null, r.next?.end ?? null, r.firstObservedAt || null]])) : null,
  block: contracts?.block ? contracts.block.map((b) => [b.id ?? null, b.name, b.team, b.status, b.firstSeen || b.since || null, b.lastSeen || null]) : null,
  market: assets?.market ? { asOf: assets.market.asOf, playoffs: assets.market.playoffs, cup: assets.market.cup } : null,
  standings: proj ? Object.fromEntries(proj.teams.map((t) => [t.team, [t.gp, t.pts, t.playoffs, t.cup]])) : null,
};
const json = JSON.stringify(snap);
const store = await openStore();
if (!store) { console.log(`snapshot ${day}: ${(json.length / 1024).toFixed(0)} KB (not saved: no Firestore credentials)`); process.exit(0); }
const path = `admin/snapshots/days/${day}`;
const existing = await store.read(path).catch(() => null);
if (existing) console.log(`snapshot ${day} already exists; kept as first written (point-in-time)`);
else { await store.put(path, snap, { date: day }, { replace: true }); console.log(`snapshot ${day}: ${(json.length / 1024).toFixed(0)} KB saved`); }
