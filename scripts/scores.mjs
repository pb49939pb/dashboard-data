// Recent games for Hockey Lab's Overview: yesterday's and today's NHL games with scores, saved to Firestore
// public/scores. Runs every 10 minutes with dispatch.yml (the NHL API can't be read from a browser on another site),
// but only calls the NHL when a game is live or about to start (see want()). Also:
//   - pre-game win odds for today's games: Hockey Lab's model (nightly, hockey/projections.upcoming) and Polymarket's
//     moneyline price (read-only public market data), frozen at puck drop so the recap can say which was closer
//   - game recaps (scripts/recap.mjs) for live and finished games, plus a backfill of the season's earlier games
//   node scripts/scores.mjs            (STORE_DRY_RUN=1 to run without saving)
import { readFile } from "node:fs/promises";
import { openStore } from "./store.mjs";
import { buildRecap } from "./recap.mjs";

const UA = { "User-Agent": "hockey-lab/1.0 (personal, non-commercial)" };
// The NHL's day runs on Eastern time: a 10 PM Pacific game is still "today" there
const eastern = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const today = eastern(new Date()), yesterday = eastern(new Date(Date.now() - 864e5));
const BACKFILL_PER_RUN = 12;

const side = (t) => ({ team: t.abbrev, score: t.score ?? null, sog: t.sog ?? null });
async function day(date) {
  const r = await fetch(`https://api-web.nhle.com/v1/score/${date}`, { headers: UA });
  if (!r.ok) throw new Error(`score ${date}: HTTP ${r.status}`);
  const d = await r.json();
  return (d.games || []).filter((g) => g.gameType === 2 || g.gameType === 3).map((g) => ({
    id: g.id, start: g.startTimeUTC, state: g.gameState, season: String(g.season || ""), // FUT/PRE scheduled, LIVE/CRIT in progress, FINAL/OFF over
    away: side(g.awayTeam), home: side(g.homeTeam),
    period: g.periodDescriptor?.number ?? null, periodType: g.periodDescriptor?.periodType ?? null,
    clock: g.clock?.timeRemaining ?? null, intermission: !!g.clock?.inIntermission,
    ended: g.gameOutcome?.lastPeriodType ?? null, // REG / OT / SO
  }));
}

/* ---------- Polymarket: moneyline price per game (public, read-only Gamma API) ---------- */
const NICK = { ANA: "Ducks", BOS: "Bruins", BUF: "Sabres", CGY: "Flames", CAR: "Hurricanes", CHI: "Blackhawks", COL: "Avalanche", CBJ: "Blue Jackets",
  DAL: "Stars", DET: "Red Wings", EDM: "Oilers", FLA: "Panthers", LAK: "Kings", MIN: "Wild", MTL: "Canadiens", NSH: "Predators", NJD: "Devils",
  NYI: "Islanders", NYR: "Rangers", OTT: "Senators", PHI: "Flyers", PIT: "Penguins", SJS: "Sharks", SEA: "Kraken", STL: "Blues", TBL: "Lightning",
  TOR: "Maple Leafs", UTA: "Mammoth", VAN: "Canucks", VGK: "Golden Knights", WSH: "Capitals", WPG: "Jets" };
async function polymarket() {
  try {
    const r = await fetch("https://gamma-api.polymarket.com/events?series_id=10346&closed=false&limit=100&order=startDate&ascending=true", { headers: UA });
    if (!r.ok) return [];
    const out = [];
    for (const e of await r.json()) {
      const m = (e.markets || []).find((x) => x.sportsMarketType === "moneyline");
      if (!m) continue;
      const names = JSON.parse(m.outcomes || "[]"), prices = JSON.parse(m.outcomePrices || "[]").map(Number);
      if (names.length !== 2 || prices.some((p) => !Number.isFinite(p))) continue;
      out.push({ start: e.startTime || m.gameStartTime, names, prices, slug: e.slug });
    }
    return out;
  } catch { return []; }
}
function marketFor(markets, g) {
  const alias = { UTA: ["Mammoth", "Utah"] }; // Polymarket calls Utah "Utah"
  const nm = (t, names) => [NICK[t], ...(alias[t] || [])].find((n) => names.includes(n));
  const m = markets.find((x) => nm(g.home.team, x.names) && nm(g.away.team, x.names) && Math.abs(new Date(x.start) - new Date(g.start)) < 6 * 3600e3);
  if (!m) return null;
  const ph = m.prices[m.names.indexOf(nm(g.home.team, m.names))], pa = m.prices[m.names.indexOf(nm(g.away.team, m.names))];
  return ph + pa > 0 ? { pHome: Math.round((ph / (ph + pa)) * 1000) / 1000, slug: m.slug } : null;
}

// Game-aware: only ask the NHL when something can have changed. Yesterday: until every game is final. Today: every run
// (10 minutes) while a game is live or starts within 30 minutes, otherwise once an hour for schedule changes.
const store = await openStore();
const prev = store ? await store.read("public/scores").catch(() => null) : null;
const now = Date.now(), HOUR = 36e5;
const done = (g) => ["FINAL", "OFF"].includes(g.state);
const live = (g) => ["LIVE", "CRIT"].includes(g.state);
const busy = (g) => live(g) || (!done(g) && g.state !== "PPD" && new Date(g.start).getTime() - now < 30 * 60e3);
let fetched = 0;
async function want(date, isToday) {
  const old = prev?.days?.find((d) => d.date === date);
  const stale = !old?.checkedAt || now - new Date(old.checkedAt).getTime() > HOUR;
  const need = !old || old.games.some(busy) || (isToday ? stale : old.games.some((g) => !done(g) && g.state !== "PPD"));
  if (!need) return old;
  fetched++;
  const games = await day(date);
  // keep what we knew: predictions (frozen at puck drop) and recap status
  for (const g of games) { const o = old?.games.find((x) => x.id === g.id); if (o) for (const k of ["pred", "recapAt", "recapFinal"]) if (o[k] !== undefined) g[k] = o[k]; }
  return { date, checkedAt: new Date().toISOString(), games };
}
const days = [await want(yesterday, false), await want(today, true)];

// predictions for games that haven't started: our model (nightly) and Polymarket (now); frozen once the puck drops
const upcoming = days.flatMap((d) => d.games).filter((g) => !done(g) && !live(g) && g.state !== "PPD");
if (fetched && upcoming.length && store) {
  const proj = await store.read("hockey/projections").catch(() => null);
  const markets = await polymarket();
  for (const g of upcoming) {
    const m = proj?.upcoming?.[g.id], mk = marketFor(markets, g);
    g.pred = { model: m?.pHome ?? g.pred?.model ?? null, market: mk?.pHome ?? g.pred?.market ?? null, at: new Date().toISOString(),
      modelAt: proj?.updatedAt || null, slug: mk?.slug || g.pred?.slug || null };
  }
}

/* ---------- recaps ---------- */
let model = null;
async function loadModel() {
  if (model) return model;
  const m = JSON.parse(await readFile("model/xg_logit.json", "utf8"));
  m.gbm = await readFile("model/xg_gbm.json", "utf8").then(JSON.parse, () => null);
  m.hands = {};
  const season = days.flatMap((d) => d.games).find((g) => g.season)?.season || "20262027";
  for (const s of [String(Number(season.slice(0, 4)) - 1) + season.slice(0, 4), season]) {
    const r = await fetch(`https://api.nhle.com/stats/rest/en/skater/bios?isAggregate=false&isGame=false&limit=-1&cayenneExp=seasonId=${s}`, { headers: UA }).then((x) => x.json()).catch(() => null);
    for (const p of r?.data || []) if (p.shootsCatches) m.hands[p.playerId] = p.shootsCatches;
  }
  return (model = m);
}
const recapPath = (season, id) => `hockey/recaps/${season}/${id}`;
const indexPath = (season, team) => `hockey/recapIndex/${season}/${team}`;
async function makeRecap(id, season, preds) {
  const meta = await fetch(`https://api-web.nhle.com/v1/gamecenter/${id}/boxscore`, { headers: UA }).then((r) => r.json()).catch(() => null);
  const teams = meta ? [meta.homeTeam.abbrev, meta.awayTeam.abbrev] : null;
  const index = teams && store ? await Promise.all(teams.map((t) => store.read(indexPath(season, t)).catch(() => null))) : [{}, {}];
  const { recap, lines } = await buildRecap(id, { model: await loadModel(), preds, index: index.map((x) => x || {}) });
  if (!store) { console.log(`recap ${id}: ${recap.home.team} ${recap.home.score}-${recap.away.score} ${recap.away.team}, ${JSON.stringify(recap).length} bytes`); return recap; }
  await store.put(recapPath(season, id), recap, { date: recap.date, home: recap.home.team, away: recap.away.team, final: recap.final }, { replace: true });
  if (recap.final && teams) { // season context for later games: each player's line from this game
    for (const [i, t] of teams.entries()) {
      const doc = index[i] || { season, team: t, players: {} };
      for (const [pid, row] of Object.entries(lines[i])) doc.players[pid] = [...(doc.players[pid] || []).filter((r) => r[1] !== id), row];
      await store.put(indexPath(season, t), doc, {}, { replace: true });
    }
  }
  return recap;
}
let recaps = 0;
for (const d of days) for (const g of d.games) {
  const needs = (live(g) && fetched) || (done(g) && !g.recapFinal);
  if (!needs) continue;
  try {
    const r = await makeRecap(g.id, g.season || "20262027", g.pred || null);
    g.recapAt = r.updatedAt; g.recapFinal = r.final; recaps++;
  } catch (e) { console.log(`recap ${g.id} failed: ${e.message}`); }
}
// backfill: this season's earlier games, oldest first, a few per run (season context needs them in order)
let backfilled = 0;
if (store) {
  const metaDoc = (await store.read("hockey/recapMeta").catch(() => null)) || { done: [] };
  const doneIds = new Set([...metaDoc.done, ...days.flatMap((d) => d.games).filter((g) => g.recapFinal).map((g) => g.id)]);
  const league = await store.read("hockey/league").catch(() => null);
  const todo = (league?.gameIds || []).filter((id) => !doneIds.has(id)).sort((a, b) => a - b).slice(0, BACKFILL_PER_RUN);
  for (const id of todo) {
    try { const r = await makeRecap(id, String(league.season), null); if (r.final) { doneIds.add(id); backfilled++; } }
    catch (e) { console.log(`backfill ${id} failed: ${e.message}`); }
  }
  if (backfilled || recaps) await store.put("hockey/recapMeta", { done: [...doneIds].sort((a, b) => a - b), updatedAt: new Date().toISOString() }, {}, { replace: true });
}

if (!fetched && !recaps && !backfilled) { console.log("scores: nothing live or starting soon; no NHL call"); process.exit(0); }
const doc = { updatedAt: new Date().toISOString(), days };
if (!store) { console.log(JSON.stringify(doc).slice(0, 600)); process.exit(0); }
await store.put("public/scores", doc, {}, { replace: true });
console.log(`scores: fetched ${fetched} day(s); ${days.map((d) => `${d.date} ${d.games.length} games`).join(", ")}; recaps ${recaps}, backfilled ${backfilled}`);
