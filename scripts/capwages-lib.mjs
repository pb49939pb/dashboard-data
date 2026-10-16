// CapWages import, the pure parts (no network, no Firestore): team names and slugs, player normalization, the
// retention-anomaly rule, the validation gates and the compact per-team documents the site reads.
// The integration brief is docs/capwages-integration.md. Licensed API use (paid subscription, written permission for
// this use); never scrape the CapWages site. Contract money is owner-only: nothing here may be printed to the public
// Actions log, so every function returns data and the caller decides where it goes.

export const SOURCE = "CapWages";
export const CEILING = { 2026: 104_000_000 }; // season start year -> upper limit (SEASON_RULES in hockey-web/lab.js)

/** The 32 NHL teams: abbreviation -> CapWages team name (also used for retention keys). Aliases cover renames. */
export const TEAMS = {
  ANA: "Anaheim Ducks", BOS: "Boston Bruins", BUF: "Buffalo Sabres", CAR: "Carolina Hurricanes", CBJ: "Columbus Blue Jackets",
  CGY: "Calgary Flames", CHI: "Chicago Blackhawks", COL: "Colorado Avalanche", DAL: "Dallas Stars", DET: "Detroit Red Wings",
  EDM: "Edmonton Oilers", FLA: "Florida Panthers", LAK: "Los Angeles Kings", MIN: "Minnesota Wild", MTL: "Montreal Canadiens",
  NJD: "New Jersey Devils", NSH: "Nashville Predators", NYI: "New York Islanders", NYR: "New York Rangers", OTT: "Ottawa Senators",
  PHI: "Philadelphia Flyers", PIT: "Pittsburgh Penguins", SEA: "Seattle Kraken", SJS: "San Jose Sharks", STL: "St. Louis Blues",
  TBL: "Tampa Bay Lightning", TOR: "Toronto Maple Leafs", UTA: "Utah Mammoth", VAN: "Vancouver Canucks", VGK: "Vegas Golden Knights",
  WPG: "Winnipeg Jets", WSH: "Washington Capitals",
};
const ALIASES = { "Utah Hockey Club": "UTA", "Arizona Coyotes": "UTA", "Montréal Canadiens": "MTL", "St Louis Blues": "STL" };
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const BY_NAME = new Map([...Object.entries(TEAMS).map(([a, n]) => [norm(n), a]), ...Object.entries(ALIASES).map(([n, a]) => [norm(n), a])]);
/** Team name or slug in any of CapWages' spellings (anaheim_ducks, detroit-red-wings, "Detroit Red Wings") -> NHL abbreviation, or null. */
export const teamAbbrev = (nameOrSlug) => BY_NAME.get(norm(String(nameOrSlug || "").replace(/[_-]+/g, " "))) ?? null;
/** NHL abbreviation -> the hyphenated slug /lineups/:teamSlug wants (underscores and abbreviations 404 there). */
export const lineupSlug = (abbr) => TEAMS[abbr].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** "2026-27" -> 2026 (the season's start year, which is how the site keys seasons). */
export const seasonStart = (s) => { const m = /^(\d{4})/.exec(String(s || "")); return m ? Number(m[1]) : null; };
const num = (v) => { if (v === null || v === undefined || v === "") return null; const n = Number(String(v).replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : null; };

/** Retention entries are keyed by team name: { "<Team Name>": { capHit, retainedPct } }. The encoding is inconsistent
    in the wild (the brief's OEL case: two teams at 88% with the same cap hit), so normalize to a list and flag, never
    guess: an anomalous season counts as unverified in cap verdicts, not as zero. */
export function normalizeRetention(retention, buyout = null) {
  if (!retention || typeof retention !== "object") return { list: [], anomaly: false, reasons: [] };
  const list = Object.entries(retention).map(([team, r]) => ({ team, abbr: teamAbbrev(team), retainedPct: num(r?.retainedPct), retainedCapHit: num(r?.capHit) }));
  const reasons = [];
  const pcts = list.map((x) => x.retainedPct).filter((p) => p !== null);
  if (pcts.reduce((a, p) => a + p, 0) > 100) reasons.push("retained percentages add up to more than 100");
  if (new Set(pcts).size < pcts.length) reasons.push("the same percentage appears for two teams");
  if (list.some((x) => x.retainedPct === null || x.retainedCapHit === null)) reasons.push("an entry is missing its percentage or cap hit");
  if (list.some((x) => !x.abbr)) reasons.push("an entry names a team we can't match");
  // a team can't retain salary on a player it bought out (OEL 2024-25 lists Vancouver at 88% beside its buyout)
  const bo = buyout && teamAbbrev(buyout.teamSlug || buyout.teamName);
  if (bo && list.some((x) => x.abbr === bo)) reasons.push("the buyout team also appears as retaining salary");
  return { list, anomaly: reasons.length > 0, reasons };
}

/** The buyout object spot-checked clean against real schedules (brief, section 6); keep it, with the charged team. */
export function normalizeBuyout(b) {
  if (!b || typeof b !== "object") return null;
  return { team: b.teamName ?? null, abbr: teamAbbrev(b.teamSlug || b.teamName), capHit: num(b.capHit), cost: num(b.cost), earning: num(b.earning), savings: num(b.savings) };
}

/** One /players/:slug payload (its `data`) -> the normalized player: profile subset, contracts and one entry per season. */
export function normalizePlayer(d) {
  if (!d || !d.slug) throw new Error("player payload without a slug");
  const contracts = (d.contracts || []).map((c, i) => ({
    index: i, type: c.contractType ?? null, length: num(c.contractLength), value: num(c.contractValue), expiry: c.expiryStatus ?? null,
    signingTeam: c.signingTeam ?? null, signingDate: c.signingDate ?? null, signedBy: c.signedBy ?? null,
    seasons: (c.seasons || []).map((s) => s.season),
  }));
  const seasons = {};
  for (const c of d.contracts || []) for (const s of c.seasons || []) {
    const y = seasonStart(s.season); if (y === null) continue;
    const ret = normalizeRetention(s.retention, s.buyout);
    const row = {
      season: s.season, year: y, contract: (d.contracts || []).indexOf(c), clause: s.clause ?? null,
      capHit: num(s.capHit), aav: num(s.aav), baseSalary: num(s.baseSalary), totalSalary: num(s.totalSalary), minorsSalary: num(s.minorsSalary),
      signingBonuses: num(s.signingBonuses), performanceBonuses: num(s.performanceBonuses), expiry: c.expiryStatus ?? null,
      buyout: normalizeBuyout(s.buyout), retention: ret.list, retentionAnomaly: ret.anomaly, retentionWhy: ret.reasons,
    };
    // two contracts covering the same season (an old deal overlapping a new one): keep both, flag it
    if (seasons[y]) { row.overlap = true; seasons[y] = [].concat(seasons[y], row); } else seasons[y] = row;
  }
  return {
    slug: d.slug, nhlId: num(d.nhlId), name: d.name ?? null, team: teamAbbrev(d.team?.slug || d.team?.name || d.team), pos: d.position ?? null,
    leagueStatus: d.leagueStatus ?? null, contracts, seasons,
  };
}

const rowsOf = (p, y) => [].concat(p.seasons?.[y] ?? []);
/** Everything charged to each team's cap for season y: its own players' cap hits (net of retention it receives),
    buyout charges and salary it retains for players now elsewhere. Unverifiable pieces are listed, never zeroed. */
export function teamCharges(players, y) {
  const T = Object.fromEntries(Object.keys(TEAMS).map((a) => [a, { team: a, players: [], buyouts: [], retained: [], unverified: [] }]));
  for (const p of players) for (const r of rowsOf(p, y)) {
    const id = p.nhlId ?? p.slug;
    if (r.retentionAnomaly) { for (const t of new Set([p.team, ...r.retention.map((x) => x.abbr)].filter((a) => T[a]))) T[t].unverified.push({ id, name: p.name, why: r.retentionWhy.join("; ") }); continue; }
    if (r.buyout && T[r.buyout.abbr] && r.buyout.capHit !== null) T[r.buyout.abbr].buyouts.push({ id, name: p.name, capHit: r.buyout.capHit });
    for (const x of r.retention) if (T[x.abbr] && x.abbr !== p.team) T[x.abbr].retained.push({ id, name: p.name, capHit: x.retainedCapHit, pct: x.retainedPct });
    if (!r.buyout && T[p.team] && r.capHit !== null) {
      // his current team carries the cap hit less whatever other teams retained
      const away = r.retention.filter((x) => x.abbr !== p.team).reduce((n, x) => n + (x.retainedCapHit || 0), 0);
      T[p.team].players.push({ id, name: p.name, capHit: r.capHit - away, clause: r.clause, expiry: r.expiry, retainedElsewhere: away > 0 });
    } else if (!r.buyout && T[p.team]) T[p.team].unverified.push({ id, name: p.name, why: "no cap hit for this season" });
  }
  for (const t of Object.values(T)) {
    const sum = (a) => a.reduce((n, x) => n + (x.capHit || 0), 0);
    t.totals = { players: sum(t.players), buyouts: sum(t.buyouts), retained: sum(t.retained) };
    t.totals.all = t.totals.players + t.totals.buyouts + t.totals.retained;
  }
  return T;
}

/** Fail-closed gates before publishing (brief, section 7). `prev` is the last good run's summary (or null).
    Returns { ok, failures, warnings }; failures block the publish, warnings are reported in the owner's run log. */
export function validate({ players, errors, attempted, y, prev }, spot = SPOT_CHECKS) {
  const failures = [], warnings = [];
  const bySlug = new Map(players.map((p) => [p.slug, p]));
  for (const c of spot) {
    const p = bySlug.get(c.slug);
    if (!p) { failures.push(`spot check: ${c.slug} missing`); continue; }
    for (const [yy, want] of Object.entries(c.seasons)) {
      const r = rowsOf(p, Number(yy));
      const got = want.buyoutCapHit !== undefined ? r.find((x) => x.buyout)?.buyout?.capHit : r[0]?.capHit;
      const val = want.buyoutCapHit ?? want.capHit;
      if (got !== val) failures.push(`spot check: ${c.slug} ${yy} ${want.buyoutCapHit !== undefined ? "buyout cap hit" : "cap hit"} doesn't match`);
      if (want.clause && r[0]?.clause !== want.clause) failures.push(`spot check: ${c.slug} ${yy} clause doesn't match`);
    }
  }
  const counts = Object.fromEntries(Object.keys(TEAMS).map((a) => [a, 0]));
  for (const p of players) if (counts[p.team] !== undefined && rowsOf(p, y).length) counts[p.team]++;
  for (const [a, n] of Object.entries(counts)) if (n < 1 || n > 50) failures.push(`${a}: ${n} contracts this season (expected 1-50)`);
  const nhl = players.filter((p) => p.team).length;
  if (prev?.nhlPlayers && Math.abs(nhl - prev.nhlPlayers) / prev.nhlPlayers > 0.05) failures.push(`${nhl} NHL players vs ${prev.nhlPlayers} last run (more than 5% apart)`);
  if (attempted && errors / attempted > 0.01) failures.push(`${errors} of ${attempted} player fetches failed (over 1%)`);
  const ceiling = CEILING[y];
  if (ceiling) for (const t of Object.values(teamCharges(players, y))) {
    const r = t.totals.all / ceiling;
    if (r < 0.6 || r > 1.25) warnings.push(`${t.team}: cap total outside the usual band for its roster count (roster counting rules differ)`);
  }
  return { ok: failures.length === 0, failures, warnings, counts, nhlPlayers: nhl };
}

/** The brief's spot checks (verified against public reporting). Season keys are start years. */
export const SPOT_CHECKS = [
  { slug: "connor-mcdavid", seasons: { 2026: { capHit: 12_500_000, clause: "NMC" } } },
  { slug: "auston-matthews", seasons: { 2026: { capHit: 13_250_000 } } },
  // The brief's amounts, on the seasons CapWages gives them. The brief labelled them "2027-28 through 2030-31" (four
  // seasons for five numbers); Vancouver's buyout was in summer 2023, so the first buyout season is 2023-24.
  { slug: "oliver-ekman-larsson", seasons: { 2023: { buyoutCapHit: 146_667 }, 2024: { buyoutCapHit: 2_346_667 }, 2025: { buyoutCapHit: 4_766_667 }, 2026: { buyoutCapHit: 4_766_667 }, 2027: { buyoutCapHit: 2_126_667 } } },
];

/** The compact per-team document the site reads (owner-only): this season and the next few, per player, plus the
    team's buyout and retained charges and anything unverifiable. */
export function teamDoc(abbr, players, years, meta) {
  const mine = players.filter((p) => p.team === abbr || years.some((y) => rowsOf(p, y).some((r) => r.buyout?.abbr === abbr || r.retention.some((x) => x.abbr === abbr))));
  return {
    team: abbr, source: SOURCE, lastUpdated: meta.lastUpdated ?? null, importedAt: meta.importedAt,
    players: mine.map((p) => ({ id: p.nhlId, slug: p.slug, name: p.name, team: p.team, pos: p.pos,
      seasons: Object.fromEntries(years.filter((y) => p.seasons[y]).map((y) => [y, rowsOf(p, y).map(({ season, contract, ...r }) => r)])) })),
    charges: Object.fromEntries(years.map((y) => { const t = teamCharges(mine, y)[abbr]; return [y, { totals: t.totals, buyouts: t.buyouts, retained: t.retained, unverified: t.unverified }]; })),
  };
}
