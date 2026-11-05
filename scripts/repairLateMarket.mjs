// One-off repair for B230 (2026-11-04): until scores.mjs stopped at the scheduled start, a game in the NHL's "OVER"
// state (last horn to FINAL) still counted as upcoming, so its "pre-game" Polymarket price was overwritten with the
// late-game or settled price (0%/100%). This clears every market price whose capture time (pred.at / marketAt) is at or
// after the game's scheduled start, in the prediction log and the stored recaps, so the scorecards and recaps no longer
// treat it as a pre-game price. The true pre-game price wasn't kept, so it stays empty ("no market price").
//   node scripts/repairLateMarket.mjs            dry run: lists what would change
//   node scripts/repairLateMarket.mjs --write    writes (needs FIREBASE_SERVICE_ACCOUNT; Pat's OK first)
import { openStore } from "./store.mjs";
const WRITE = process.argv.includes("--write"), SEASON = "20262027";
const UA = { "User-Agent": "hockey-lab/1.0 (personal, non-commercial)" };
const store = await openStore();
if (!store) { console.log("no Firestore (FIREBASE_SERVICE_ACCOUNT unset or budget cutoff)"); process.exit(1); }
const log = await store.read(`hockey/predLog/seasons/${SEASON}`);
const starts = new Map();
for (const date of [...new Set(log.rows.map((r) => r.date))]) {
  const prev = new Date(Date.parse(date) - 864e5).toISOString().slice(0, 10); // the row's date is the UTC start day; the NHL's is Eastern
  for (const d of [prev, date]) {
    const j = await (await fetch(`https://api-web.nhle.com/v1/score/${d}`, { headers: UA })).json();
    for (const g of j.games || []) starts.set(g.id, g.startTimeUTC);
  }
}
const late = log.rows.filter((r) => r.market != null && r.marketAt && starts.get(r.id) && Date.parse(r.marketAt) >= Date.parse(starts.get(r.id)));
console.log(`${late.length} of ${log.rows.length} logged games have a market price taken after the scheduled start:`);
for (const r of late) console.log(`  ${r.id} ${r.away}@${r.home} start ${starts.get(r.id)} price ${r.market} at ${r.marketAt}`);
if (!WRITE) process.exit(0);
for (const r of late) { r.marketLate = r.market; r.market = null; }
log.updatedAt = new Date().toISOString();
await store.put(`hockey/predLog/seasons/${SEASON}`, log, {}, { replace: true });
for (const r of late) {
  const path = `hockey/recaps/${SEASON}/${r.id}`, rc = await store.read(path).catch(() => null);
  if (!rc?.pred) continue;
  rc.pred = { ...rc.pred, market: null, marketGave: null, closer: null };
  if (!rc.start) rc.start = starts.get(r.id);
  await store.put(path, rc, {}, { replace: true });
}
console.log(`cleared ${late.length} late market prices (predLog + recaps)`);
