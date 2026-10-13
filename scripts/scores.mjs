// Recent games for Hockey Lab's Overview: yesterday's and today's NHL games with scores, saved to Firestore
// public/scores. Runs every 10 minutes with dispatch.yml (the NHL API can't be read from a browser on another site).
//   node scripts/scores.mjs            (STORE_DRY_RUN=1 to print instead of saving)
import { openStore } from "./store.mjs";

const UA = { "User-Agent": "hockey-lab/1.0 (personal, non-commercial)" };
// The NHL's day runs on Eastern time: a 10 PM Pacific game is still "today" there
const eastern = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const today = eastern(new Date()), yesterday = eastern(new Date(Date.now() - 864e5));

const side = (t) => ({ team: t.abbrev, score: t.score ?? null, sog: t.sog ?? null });
async function day(date) {
  const r = await fetch(`https://api-web.nhle.com/v1/score/${date}`, { headers: UA });
  if (!r.ok) throw new Error(`score ${date}: HTTP ${r.status}`);
  const d = await r.json();
  return (d.games || []).filter((g) => g.gameType === 2 || g.gameType === 3).map((g) => ({
    id: g.id, start: g.startTimeUTC, state: g.gameState, // FUT/PRE scheduled, LIVE/CRIT in progress, FINAL/OFF over
    away: side(g.awayTeam), home: side(g.homeTeam),
    period: g.periodDescriptor?.number ?? null, periodType: g.periodDescriptor?.periodType ?? null,
    clock: g.clock?.timeRemaining ?? null, intermission: !!g.clock?.inIntermission,
    ended: g.gameOutcome?.lastPeriodType ?? null, // REG / OT / SO
  }));
}

const days = [];
for (const date of [yesterday, today]) days.push({ date, games: await day(date) });
const doc = { updatedAt: new Date().toISOString(), days };
const store = await openStore();
if (!store) { console.log(JSON.stringify(doc, null, 1).slice(0, 1500)); process.exit(0); }
await store.put("public/scores", doc, {}, { replace: true });
console.log(`scores: ${days.map((d) => `${d.date} ${d.games.length} games`).join(", ")}`);
