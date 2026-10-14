// Recent games for Hockey Lab's Overview: yesterday's and today's NHL games with scores, saved to Firestore
// public/scores. Runs every 5 minutes on game nights (live.yml) and with dispatch.yml (the NHL API can't be read from a browser on another site),
// but only calls the NHL when a game is live or about to start (see want()). Also:
//   - pre-game win odds for today's games: Hockey Lab's model (nightly, hockey/projections.upcoming) and Polymarket's
//     moneyline price (read-only public market data), frozen at puck drop so the recap can say which was closer
//   - game recaps (scripts/recap.mjs) for live and finished games, plus a backfill of the season's earlier games
//   node scripts/scores.mjs            (STORE_DRY_RUN=1 to run without saving)
import { readFile } from "node:fs/promises";
import { openStore } from "./store.mjs";
import { buildRecap, RECAP_VERSION } from "./recap.mjs";

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
  for (const g of games) { const o = old?.games.find((x) => x.id === g.id); if (o) for (const k of ["pred", "recapAt", "recapFinal", "recapV", "live", "trail", "logged"]) if (o[k] !== undefined) g[k] = o[k]; }
  return { date, checkedAt: new Date().toISOString(), games };
}
const days = [await want(yesterday, false), await want(today, true)];

// predictions for games that haven't started: our model (nightly) and Polymarket (now); frozen once the puck drops
const upcoming = days.flatMap((d) => d.games).filter((g) => !done(g) && !live(g) && g.state !== "PPD");
let predsFilled = 0;
if (store && upcoming.length && (fetched || upcoming.some((g) => g.pred?.model == null || g.pred?.market == null))) {
  const proj = await store.read("hockey/projections").catch(() => null);
  const markets = await polymarket();
  for (const g of upcoming) {
    const m = proj?.upcoming?.[g.id], mk = marketFor(markets, g);
    if ((m && g.pred?.model == null) || (mk && g.pred?.market == null)) predsFilled++;
    g.pred = { model: m?.pHome ?? g.pred?.model ?? null, market: mk?.pHome ?? g.pred?.market ?? null, at: new Date().toISOString(),
      modelAt: proj?.updatedAt || null, slug: mk?.slug || g.pred?.slug || null };
  }
}

/* ---------- live win odds ----------
   Our model: each team's scoring rate is worked back from our pre-game win odds (league goals per team-game, split so
   that a full game reproduces those odds); then the goals still to come are random arrivals at those rates over the
   regulation time left, on top of the current score. A tie after regulation goes to overtime (3-on-3, then a near
   coin-flip shootout; playoffs: sudden death until someone scores), with the goalie pulled late in 1-2 goal games. Polymarket: its moneyline's current price, which
   keeps trading during the game. A trail of both through the game feeds the recap's chart. */
const pois = (l) => { const out = [Math.exp(-l)]; for (let k = 1; k <= 15; k++) out.push(out[k - 1] * l / k); return out; };
function winProb(lh, la, diff, frac, playoff, inOT) {
  const share = lh / (lh + la), pOT = playoff ? share : 0.6 * share + 0.4 * 0.5;
  if (inOT) return diff > 0 ? 1 : diff < 0 ? 0 : pOT;
  // pulled goalie: in the last 3 minutes of a 1-2 goal game the trailing team scores ~2.5× as often and the leading
  // team ~3.5× (into the empty net)
  if (frac <= 3 / 60 && Math.abs(diff) >= 1 && Math.abs(diff) <= 2) { const lead = diff > 0; lh *= lead ? 3.5 : 2.5; la *= lead ? 2.5 : 3.5; }
  const ph = pois(lh * frac), pa = pois(la * frac);
  let win = 0, tie = 0;
  for (let x = 0; x < ph.length; x++) for (let y = 0; y < pa.length; y++) { const d = diff + x - y, p = ph[x] * pa[y]; if (d > 0) win += p; else if (d === 0) tie += p; }
  return win + tie * pOT;
}
/** Scoring rates (per regulation game) that reproduce a pre-game home win probability, around `mu` goals per team. */
function ratesFor(pHome, mu, playoff) {
  let lo = -1.5, hi = 1.5;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (winProb(mu * Math.exp(m), mu * Math.exp(-m), 0, 1, playoff, false) < pHome) lo = m; else hi = m; }
  const d = (lo + hi) / 2;
  return [mu * Math.exp(d), mu * Math.exp(-d)];
}
const regLeft = (g) => { // regulation minutes left, from the period and clock
  if (g.period == null) return 60;
  if (g.period > 3) return 0;
  const [mm, ss] = String(g.clock || "20:00").split(":").map(Number);
  // in an intermission the clock counts down the break, not the period: only the periods still to play are left
  return Math.max(0, (3 - g.period) * 20 + (g.intermission ? 0 : mm + (ss || 0) / 60));
};
const inPlay = days.flatMap((d) => d.games).filter((g) => live(g) || (done(g) && g.live && g.live.final !== true));
if (inPlay.length) {
  const proj = store ? await store.read("hockey/projections").catch(() => null) : null;
  const mu = proj?.mu || 3.0, markets = await polymarket(), at = new Date().toISOString();
  for (const g of inPlay) {
    const playoff = String(g.id).slice(4, 6) === "03", diff = (g.home.score ?? 0) - (g.away.score ?? 0);
    const pre = g.pred?.model ?? g.pred?.market ?? 0.5;
    const [lh, la] = ratesFor(pre, mu, playoff);
    const left = regLeft(g), inOT = (g.period ?? 0) > 3, so = g.periodType === "SO";
    let model = so ? (diff > 0 ? 1 : diff < 0 ? 0 : 0.5) : winProb(lh, la, diff, left / 60, playoff, inOT);
    if (done(g)) model = diff > 0 ? 1 : 0;
    const mk = done(g) ? null : marketFor(markets, g);
    const market = done(g) ? (diff > 0 ? 1 : 0) : mk?.pHome ?? null;
    g.live = { model: Math.round(model * 1000) / 1000, market, at, final: done(g) };
    const minute = Math.round((inOT ? 60 + (g.period - 3) * 5 : 60 - left) * 10) / 10;
    const trail = g.trail || (g.pred ? [[0, g.pred.model ?? null, g.pred.market ?? null, 0, 0]] : []);
    const last = trail[trail.length - 1];
    const point = [minute, g.live.model, market, g.home.score ?? 0, g.away.score ?? 0];
    if (!last || last[0] !== minute || last[1] !== point[1] || last[2] !== point[2]) trail.push(point);
    g.trail = trail.slice(-120);
  }
}

/* ---------- prediction log (audit A5): every finished game's frozen pre-game odds and result, kept for scorecards ----------
   Prospective, so it can't leak: the odds were saved before puck drop and the row is written once the game is final. */
const toLog = days.flatMap((d) => d.games).filter((g) => done(g) && g.pred && (g.pred.model != null || g.pred.market != null) && !g.logged);
if (store && toLog.length) {
  const bySeason = {};
  for (const g of toLog) (bySeason[g.season || "20262027"] ??= []).push(g);
  for (const [season, gs] of Object.entries(bySeason)) {
    const path = `hockey/predLog/seasons/${season}`;
    const doc = (await store.read(path).catch(() => null)) || { season, rows: [] };
    const have = new Set(doc.rows.map((r) => r.id));
    for (const g of gs) {
      if (!have.has(g.id)) doc.rows.push({ id: g.id, date: g.start?.slice(0, 10) || null, home: g.home.team, away: g.away.team, model: g.pred.model ?? null,
        market: g.pred.market ?? null, modelAt: g.pred.modelAt || null, marketAt: g.pred.at || null, homeWon: (g.home.score ?? 0) > (g.away.score ?? 0) ? 1 : 0, ended: g.ended || "REG" });
      g.logged = true;
    }
    doc.updatedAt = new Date().toISOString();
    await store.put(path, doc, {}, { replace: true });
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
  const needs = (live(g) && fetched) || (done(g) && (!g.recapFinal || g.recapV !== RECAP_VERSION));
  if (!needs) continue;
  try {
    const r = await makeRecap(g.id, g.season || "20262027", g.pred || null);
    g.recapAt = r.updatedAt; g.recapFinal = r.final; g.recapV = RECAP_VERSION; recaps++;
  } catch (e) { console.log(`recap ${g.id} failed: ${e.message}`); }
}
// backfill: this season's earlier games, oldest first, a few per run (season context needs them in order)
let backfilled = 0;
if (store) {
  let metaDoc = (await store.read("hockey/recapMeta").catch(() => null)) || { done: [] };
  if (metaDoc.version !== RECAP_VERSION) metaDoc = { done: [], version: RECAP_VERSION }; // the recap changed: rebuild every game, oldest first
  const doneIds = new Set([...metaDoc.done, ...days.flatMap((d) => d.games).filter((g) => g.recapFinal && g.recapV === RECAP_VERSION).map((g) => g.id)]);
  const league = await store.read("hockey/league").catch(() => null);
  const todo = (league?.gameIds || []).filter((id) => !doneIds.has(id)).sort((a, b) => a - b).slice(0, BACKFILL_PER_RUN);
  for (const id of todo) {
    try { const r = await makeRecap(id, String(league.season), null); if (r.final) { doneIds.add(id); backfilled++; } }
    catch (e) { console.log(`backfill ${id} failed: ${e.message}`); }
  }
  if (backfilled || recaps || metaDoc.done.length === 0) await store.put("hockey/recapMeta", { done: [...doneIds].sort((a, b) => a - b), version: RECAP_VERSION, updatedAt: new Date().toISOString() }, {}, { replace: true });
}

if (!fetched && !recaps && !backfilled && !predsFilled) { console.log("scores: nothing live or starting soon; no NHL call"); process.exit(0); }
const doc = { updatedAt: new Date().toISOString(), days };
if (!store) { console.log(JSON.stringify(doc).slice(0, 600)); process.exit(0); }
await store.put("public/scores", doc, {}, { replace: true });
console.log(`scores: fetched ${fetched} day(s); ${days.map((d) => `${d.date} ${d.games.length} games`).join(", ")}; recaps ${recaps}, backfilled ${backfilled}`);
