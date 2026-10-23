// Every team's future assets for Hockey Lab's trade explorer: draft picks for the next three drafts (own and acquired,
// with conditions) and prospects. Values are computed on the site from these facts (draft model + each team's phase).
//   picks: every team owns rounds 1-7 by default; traded picks come from Wikipedia's "{year} NHL entry draft" articles
//          (CC BY-SA), which list each one as "The [[A]]' first-round pick will go to the [[B]] ..."
//   hands: shoots L/R for every skater (stats API bios); prevStandings: last season's finish (seasons/{prev}/projections.json,
//          from a local build or the site's published copy)
//   market: Polymarket odds to make the playoffs and win the Cup (public Gamma API), for team phases
//   prospects: the NHL's /v1/prospects/{team}; draft slot joined from our draft history (model/draft.json); teams whose
//          list comes back empty fall back to their recent draftees who haven't become NHL regulars
//   production: skaters on the NHL's list with a draft slot get expected wins from their slot plus their scoring since the
//          draft in every league (model/prospects.json from hockey-models prospects.py; scripts/prospectValue.mjs), from
//          their NHL player pages (careerLanding.mjs: the same cache as milestone watch, refreshed about weekly)
//   node scripts/assets.mjs     → public/hockey/assets.json
import { readFile, writeFile } from "node:fs/promises";
import { careerLanding } from "./careerLanding.mjs";
import { prospectExpected } from "./prospectValue.mjs";

const UA = { "User-Agent": "hockey-lab/1.0 (+https://patrickreidbaldwin.com/hockey; personal, non-commercial)" };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const TEAMS = { ANA: "Anaheim Ducks", BOS: "Boston Bruins", BUF: "Buffalo Sabres", CGY: "Calgary Flames", CAR: "Carolina Hurricanes", CHI: "Chicago Blackhawks",
  COL: "Colorado Avalanche", CBJ: "Columbus Blue Jackets", DAL: "Dallas Stars", DET: "Detroit Red Wings", EDM: "Edmonton Oilers", FLA: "Florida Panthers",
  LAK: "Los Angeles Kings", MIN: "Minnesota Wild", MTL: "Montreal Canadiens", NSH: "Nashville Predators", NJD: "New Jersey Devils", NYI: "New York Islanders",
  NYR: "New York Rangers", OTT: "Ottawa Senators", PHI: "Philadelphia Flyers", PIT: "Pittsburgh Penguins", SJS: "San Jose Sharks", SEA: "Seattle Kraken",
  STL: "St. Louis Blues", TBL: "Tampa Bay Lightning", TOR: "Toronto Maple Leafs", UTA: "Utah Mammoth", VAN: "Vancouver Canucks", VGK: "Vegas Golden Knights",
  WSH: "Washington Capitals", WPG: "Winnipeg Jets" };
const ALIASES = { "Montréal Canadiens": "MTL", "Utah Hockey Club": "UTA", "Utah": "UTA", "Utah Mammoth": "UTA", "St Louis Blues": "STL" };
const abbrevOf = (name) => Object.entries(TEAMS).find(([, n]) => n === name)?.[0] || ALIASES[name] || null;
const ROUNDS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7 };
const plain = (w) => w.replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, "").replace(/\{\{efn[\s\S]*?\}\}/g, "").replace(/\{\{[^{}]*\}\}/g, "")
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/'''?/g, "").replace(/\s+/g, " ").trim();

async function wikiDraft(year) {
  const page = `${year}_NHL_entry_draft`, api = "https://en.wikipedia.org/w/api.php";
  const secs = await fetch(`${api}?action=parse&page=${page}&prop=sections&format=json&formatversion=2`, { headers: UA }).then((r) => r.json()).catch(() => null);
  if (!secs?.parse) return { page, traded: [] };
  const want = secs.parse.sections.filter((s) => /^Traded picks$|^Unresolved conditional/i.test(s.line));
  const traded = [];
  for (const sec of want) {
    await pause(1500);
    const w = await fetch(`${api}?action=parse&page=${page}&prop=wikitext&section=${sec.index}&format=json&formatversion=2`, { headers: UA }).then((r) => r.json()).catch(() => null);
    const text = w?.parse?.wikitext || "";
    const unresolved = /Unresolved/i.test(sec.line);
    for (const item of text.split(/\n(?=#)/)) {
      const m = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]'s?\s+(first|second|third|fourth|fifth|sixth|seventh)-round pick (will|may) go to the \[\[([^\]|]+)/.exec(item);
      if (!m) continue;
      const original = abbrevOf(m[1].trim()), owner = abbrevOf(m[4].trim());
      if (!original || !owner) continue;
      const converted = /was converted|were converted|condition was met|became unconditional/i.test(item);
      const conditional = unresolved || (m[3] === "may" && !converted) || (/condition/i.test(item) && !converted && /will be|would|if /i.test(item.split("The condition")[1] || ""));
      const sentence = plain(item.replace(/^#\s*/, "")).split(/(?<=\.)\s/)[0];
      traded.push({ year, round: ROUNDS[m[2]], original, owner, conditional, note: sentence.replace(/\b(\w+s)'s\b/g, "$1'").slice(0, 260) }); // "Panthers's" -> "Panthers'"
    }
  }
  return { page, traded };
}

const league = JSON.parse(await readFile("public/hockey/league.json", "utf8"));
const draft = JSON.parse(await readFile("model/draft.json", "utf8"));
const values = JSON.parse(await readFile("model/playerValue.json", "utf8").catch(() => '{"players":[]}'));
const season = String(league.season), firstDraft = Number(season.slice(4)); // 2026-27 season → 2027 draft
const years = [firstDraft, firstDraft + 1, firstDraft + 2];

// picks
const picks = [];
for (const y of years) for (const t of Object.keys(TEAMS)) for (let r = 1; r <= 7; r++) picks.push({ year: y, round: r, original: t, owner: t, conditional: false, note: null });
const pages = [];
for (const y of years) {
  const { page, traded } = await wikiDraft(y);
  pages.push({ year: y, page: `https://en.wikipedia.org/wiki/${page}`, traded: traded.length });
  for (const tp of traded) {
    const p = picks.find((x) => x.year === tp.year && x.round === tp.round && x.original === tp.original);
    if (p) Object.assign(p, { owner: tp.owner, conditional: tp.conditional, note: tp.note });
  }
  await pause(1500);
}

// prospects
const draftOf = new Map(draft.picks.filter((p) => p.id).map((p) => [Number(p.id), { year: p.year, overall: p.overall, round: p.round, by: p.team }]));
// draftees without an NHL id in our draft history yet: match by name (latest draft wins)
const normName = (n) => String(n || "").normalize("NFD").replace(/[^a-zA-Z ]/g, "").toLowerCase().trim();
const draftByName = new Map(draft.picks.filter((p) => p.name).sort((a, b) => a.year - b.year).map((p) => [normName(p.name), { year: p.year, overall: p.overall, round: p.round, by: p.team }]));
const thisYear = Number(String(values.season || new Date().getFullYear()).slice(0, 4)) || new Date().getFullYear();
const established = new Set(values.players.filter((p) => p.gp3 >= 60 || p.curGp > 0).map((p) => p.id)); // NHL regulars and anyone playing NHL games now
const prospects = [];
const empty = [];
for (const t of Object.keys(TEAMS)) {
  await pause(600);
  const r = await fetch(`https://api-web.nhle.com/v1/prospects/${t}`, { headers: UA }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  const list = r ? [...(r.forwards || []), ...(r.defensemen || []), ...(r.goalies || [])] : [];
  if (!list.length) { empty.push(t); continue; }
  for (const p of list) {
    if (established.has(p.id)) continue;
    const born = Number(String(p.birthDate || "").slice(0, 4)) || null;
    if (born && thisYear - born >= 25) continue; // 25+ and not an NHL regular: a minor-league veteran, not a prospect
    const d = draftOf.get(p.id) || draftByName.get(normName(`${p.firstName.default} ${p.lastName.default}`));
    prospects.push({ id: p.id, name: `${p.firstName.default} ${p.lastName.default}`, team: t, pos: p.positionCode, born: Number(String(p.birthDate || "").slice(0, 4)) || null,
      draftYear: d?.year ?? null, draftOverall: d?.overall ?? null, draftedBy: d?.by ?? null, source: "nhl" });
  }
}
// fallback: a team's recent draftees who haven't become NHL regulars (rights assumed still held)
const taken = new Set(prospects.map((p) => p.id));
for (const t of empty) {
  // recent draftees who haven't played in the NHL; unplayed picks have no NHL id yet, so they get a draft-based one
  // (unsigned rights lapse after a few years, so only the last four drafts for those)
  for (const p of draft.picks.filter((x) => x.team === t && x.year >= firstDraft - 5)) {
    const id = p.id ? Number(p.id) : null;
    if (id && (established.has(id) || taken.has(id))) continue;
    if (!id && p.year < firstDraft - 4) continue;
    prospects.push({ id: id ?? `d${p.year}-${p.overall}`, name: p.name, team: t, pos: null, born: null, draftYear: p.year, draftOverall: p.overall, draftedBy: t, source: "draft history (rights assumed)" });
  }
}

// production: slot + scoring since the draft (skaters on the NHL's list with a draft slot)
const prospectModel = JSON.parse(await readFile("model/prospects.json", "utf8").catch(() => "null"));
let scored = 0;
if (prospectModel?.status === "promoted") {
  const curStart = Number(season.slice(0, 4));
  for (const p of prospects.filter((x) => x.source === "nhl" && x.draftOverall && x.pos !== "G")) {
    const L = await careerLanding(p.id, { leagues: true });
    if (!L?.leagues) continue;
    if (Date.now() - Date.parse(L.fetchedAt) < 5000) await pause(300); // just fetched: space out requests
    const r = prospectExpected(prospectModel, L.leagues, { draftYear: p.draftYear, overall: p.draftOverall, pos: p.pos, birthDate: L.birthDate, curStart });
    if (!r) continue;
    p.prod = { wins: +r.wins.toFixed(3), slotWins: +r.slotWins.toFixed(3), k: r.k, nhle: r.nhle, season: r.season, lines: r.lines };
    scored++;
  }
}

// Fill positions missing from fallback draftees with official draft metadata.
// Require draft slot AND normalized name so a changed feed cannot attach another player's position.
for(const year of [...new Set(prospects.filter(p=>!p.pos&&p.draftYear).map(p=>p.draftYear))]) {
  const data=await fetch(`https://api-web.nhle.com/v1/draft/picks/${year}/all`,{headers:UA}).then(r=>r.ok?r.json():null).catch(()=>null);
  for(const p of prospects.filter(p=>!p.pos&&p.draftYear===year)) {
    const pick=data?.picks?.find(x=>x.overallPick===p.draftOverall&&normName(`${x.firstName?.default} ${x.lastName?.default}`)===normName(p.name));
    if(pick?.positionCode){p.pos=pick.positionCode;p.positionSource="NHL draft picks";}
  }
}

// handedness (left / right D for positional depth) from the NHL stats API's skater bios, this season and last
const hands = {};
const prevSeason = `${Number(season.slice(0, 4)) - 1}${season.slice(0, 4)}`;
for (const s of [prevSeason, season]) {
  await pause(600);
  const r = await fetch(`https://api.nhle.com/stats/rest/en/skater/bios?isAggregate=false&isGame=false&limit=-1&cayenneExp=seasonId=${s}`, { headers: UA }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  for (const p of r?.data || []) if (p.shootsCatches) hands[p.playerId] = p.shootsCatches;
}
// last season's finish (for team phases early in a season, when this season's projection is mostly a prior)
// (a local build, else the site's published copy of that frozen season)
const prev = JSON.parse(await readFile(`public/hockey/seasons/${prevSeason}/projections.json`, "utf8").catch(() => "null"))
  ?? await fetch(`https://patrickreidbaldwin.com/data/hockey/seasons/${prevSeason}/projections.json`, { headers: UA }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
// round = the furthest round a team REACHED (buildSeason.mjs); rounds won = one less, or 4 for the champion
const prevStandings = prev ? Object.fromEntries(prev.teams.map((t) => [t.team, { pts: t.projPts, playoffs: t.playoffs, round: t.round ?? 0,
  roundsWon: t.cup >= 100 ? 4 : Math.max(0, (t.round ?? 0) - 1), result: t.result || null }])) : null;

// the betting market's view of every team (Polymarket's public Gamma API): odds to make the playoffs and to win the Cup.
// It knows what our models don't (who's healthy, offseason moves), so team phases lean on it.
async function marketOdds() {
  const label = `${season.slice(0, 4)}-${season.slice(6)}`, cupYear = season.slice(4);
  const search = async (q) => (await fetch(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(q)}&limit_per_type=10`, { headers: UA }).then((r) => (r.ok ? r.json() : null)).catch(() => null))?.events || [];
  const read = (e) => e ? Object.fromEntries(e.markets.filter((m) => !m.closed).map((m) => [abbrevOf(m.groupItemTitle), Number(JSON.parse(m.outcomePrices || "[0]")[0])]).filter(([t]) => t)) : null;
  const playoffs = (await search(`make the nhl playoffs ${label}`)).find((e) => !e.closed && /make the NHL Playoffs/i.test(e.title) && e.slug.includes(label));
  await pause(800);
  const cup = (await search(`nhl ${cupYear} champion`)).find((e) => !e.closed && new RegExp(`^NHL: ${cupYear} Champion$`).test(e.title));
  const out = { playoffs: read(playoffs), cup: read(cup), urls: [playoffs, cup].filter(Boolean).map((e) => `https://polymarket.com/event/${e.slug}`), asOf: new Date().toISOString() };
  return out.playoffs && Object.keys(out.playoffs).length >= 30 ? out : null;
}
const market = await marketOdds().catch(() => null);

const out = { builtAt: new Date().toISOString(), season, draftYears: years, picks, prospects, wikiPages: pages, prospectFallback: empty, hands, prevSeason, prevStandings, market,
  curve: draft.curve.map((c) => [c.overall, c.war]), curveWindow: draft.window,
  sources: { picks: "Wikipedia NHL entry draft articles (CC BY-SA), traded picks", prospects: "NHL prospects (api-web.nhle.com) + Hockey Lab draft history" } };
await writeFile("public/hockey/assets.json", JSON.stringify(out));
console.log(`assets: ${Object.keys(hands).length} skater hands, last season ${prevStandings ? "found" : "missing"}, market odds ${market ? `${Object.keys(market.playoffs).length} teams` : "missing"}; ${picks.filter((p) => p.owner !== p.original).length} traded picks (${pages.map((p) => `${p.year}: ${p.traded}`).join(", ")}), ${prospects.length} prospects (${scored} valued with scoring since the draft); fallback for ${empty.join(", ") || "none"}`);
