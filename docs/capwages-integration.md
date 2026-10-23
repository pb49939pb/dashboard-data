# CapWages API integration: bring the full cap picture into The Other Score

Audience: the coding agent building this. Everything below was verified by live calls against the API on Oct 16, 2026. Sample payloads are in ./fixtures/.

## Goal
The Other Score's Trade Explorer currently labels its results "cap compliance unverified" (known bug B27) because the app has no contract data. This integration adds a nightly CapWages import so the app can verify cap compliance for real: current cap hits, contract term, clauses, retained salary, and buyout charges, per player, per team, per season.

## Credentials (read this first)
- API username (client id): `<CAPWAGES_API_USER>` (placeholder; Patrick holds the real value)
- API key: `<CAPWAGES_API_KEY>` (placeholder; Patrick holds the real value)
- The real values are deliberately NOT in this file. Patrick: paste them into a GitHub Actions secret named CAPWAGES_API_KEY (and CAPWAGES_API_USER if wanted) and into your local secret store. The import job reads them from environment variables only. Never commit them, never log them, never put them in Firestore or client side code.
- Note: the gateway ignores the username in testing; only the key matters today. Store both anyway in case that changes.

## API facts (verified live)
- Base URL: https://capwages.com/api/gateway/v1 ; responses report apiVersion 1.1.
- Auth: HTTP header `Authorization: ApiKey <key>`. Bearer tokens, HTTP Basic, X-API-Key headers, and query parameters all return 401 {"error":"Missing API Key"}. Do not waste time rediscovering this.
- Envelope: { apiVersion, success, data, meta }. meta.lastUpdated is present on list and detail responses; meta.source on lineups is "game_day".
- Fair use (their published terms, and we have written permission for this use): at most one full import per day, at most 4 requests per second, cache responses. Attribution: the site already promised to credit CapWages as a data source; add it to the Model page source list and anywhere contract data is displayed.

## Endpoints
### GET /players?limit=100&page=N
- 7,958 total players (the whole CapWages database: all leagues, prospects, and history). Pagination via meta.pagination (page, limit, total, totalPages, links).
- List item: { slug, name, note, pos, current_team_slug }. Team slugs here use underscores (anaheim_ducks).
### GET /players/:slug   (slug format: connor-mcdavid)
- Profile fields include: name, slug, team, position, leagueStatus (e.g. "NHL"), acquisition, nhlId (the NHL API player id; this is the join key to the data the app already has), jerseyNumber, personalInfo, physicalAttributes, ageLimits.
- contracts[]: { contractType, contractLength, contractValue, expiryStatus (UFA or RFA), signingTeam, signingDate, signedBy, seasons[] }.
- Each season: { season ("2026-27"), clause ("NMC", "NTC", "M-NTC", or null), capHit, aav, performanceBonuses, signingBonuses, baseSalary, totalSalary, minorsSalary } and optionally:
  - buyout: { teamName, teamSlug, cost, earning, savings, capHit }
  - retention: { "<Team Name>": { capHit, retainedPct } }
### GET /lineups/:teamSlug   (slug format: detroit-red-wings, HYPHENS here; underscores and abbreviations return 404)
- data: { teamSlug, players: [ { playerSlug, line (e.g. "d1"), position (e.g. "ld") } ] }, 23 players on a game day roster.

## Fixtures (real payloads, use them for tests)
- fixtures/player-connor-mcdavid.json: standard contracts with NMC, large signing bonuses.
- fixtures/player-oliver-ekman-larsson.json: the hard case. Multiple contracts, a Vancouver buyout with per season buyout cap hits, and retention entries.
- fixtures/lineup-detroit-red-wings.json: lineup shape.

## Importer design
1. Schedule: extend the existing nightly job. Run once per day, off peak.
2. Discovery: page through /players at limit=100. Keep players where leagueStatus is "NHL" or current_team_slug is not null (expect roughly 700 to 900 detail fetches). Throttle to at most 4 requests per second.
3. Detail fetch: GET /players/:slug for each kept player. Retry transient 5xx with backoff; never retry 401 or 403 (403 means fair use violation or suspended key; stop the run and alert).
4. Freshness: store meta.lastUpdated per run. If it has not changed since the last successful import, skip the write phase.
5. Normalize into Firestore alongside the existing collections, keyed by nhlId where present, falling back to slug:
   - capPlayers/{nhlId or slug}: profile subset plus current team.
   - capContracts/{playerSlug}/{contractIndex}: contract level fields.
   - capSeasons/{playerSlug}/{season}: one document per player season with capHit, aav, clause, bonuses, salaries, and normalized buyout and retention (below). This is the collection the Trade Explorer reads.
   - capLineups/{teamSlug}: latest lineup payload with its lastUpdated.
   Keep the raw payload of the last successful import in a staging collection for diffing; publish to the live collections only after validation passes. On validation failure, keep serving the previous import and report the failure.
6. Retention normalization (important): retention entries are keyed by team name with { capHit, retainedPct }. The encoding is inconsistent in the wild: the OEL record lists two teams at retainedPct 88 with identical capHit in early seasons, and Utah at 12 percent (the historically correct retained share) in later ones. Rules:
   - Do not guess silently. Normalize to a list of { team, retainedPct, retainedCapHit } per season.
   - Flag a season as retention_anomaly when retainedPct values across teams sum to more than 100, or when the same percentage appears for two teams, and exclude flagged seasons from compliance verdicts (treat them as unverified, not as zero) until reviewed.
   - The buyout object, by contrast, spot checked clean against known real schedules; trust it after the team total validation below.
7. Validation gates before publishing (fail closed):
   - Contract spot checks: McDavid current capHit 12,500,000 with clause NMC; Matthews capHit 13,250,000; OEL buyout cap hits by season (146,667 / 2,346,667 / 4,766,667 / 4,766,667 / 2,126,667 for 2027-28 through 2030-31).
   - Per team contract count between 1 and 50 for every NHL team; total imported NHL players within 5 percent of the previous run.
   - Per team sum of current season capHits for rostered players should land in a sane band relative to the $104,000,000 ceiling for 2026-27 (report the per team totals in the run log; warn, do not fail, on outliers, because roster counting rules differ).
   - Error rate: fail the run if more than 1 percent of detail fetches error.

## App changes
- Trade Explorer: replace "cap compliance unverified" with a real check. For a proposed trade, compute each team's post trade cap total from capSeasons for the current season: sum of capHit for the team's players after the swap, plus that team's buyout cap charges and retained salary cap hits for the season. Verdict states: cap compliant, over the ceiling (show by how much), or unverified (only when retention_anomaly flags or missing contracts touch the involved players; say which).
- Player and team pages: show cap hit, term remaining, expiry status, and clause from capSeasons where available, labeled "Contract data: CapWages".
- Model page: add CapWages to the data source list with the credit line.
- Close B27 in the registry once the verified verdict ships behind these validation gates, not before.

## Testing
- Unit tests from the fixtures: McDavid payload parses to 2 seasons of NMC at 12.5M on the current extension; OEL payload yields buyout objects on the bought out contract's seasons and retention entries that trigger the anomaly rule on the early seasons; DET lineup parses to 23 players.
- Integration test: run the importer against the live API in dry run mode (staging collections only) and diff team totals against the previous run.

## Operations
- Subscription: monthly trial started Oct 16, 2026 (pricing and the renewal decision are kept out of this public repo).
- Key handling: the key is shown once at creation. If it is lost, generate a new one in CapWages Settings and update the GitHub secret.
- If the subscription ever ends, CapWages terms require deleting cached API data within 14 days of access ending. Build the collections so they can be dropped in one operation.

---

## Implementation notes (2026-10-16, as built)
- **Scripts:** `scripts/capwages-lib.mjs` (pure: team names/slugs, player normalization, retention-anomaly rule, buyout/retention charges per team, validation gates, the per-team document), `scripts/capwages.mjs` (client, discovery, staging, gates, publish, `--dry-run`, `--force`, `--drop`), `scripts/capwages.test.mjs` (node:test; the three real-fixture tests run once the brief's fixtures are copied to `scripts/fixtures/capwages/`). Nightly step in `.github/workflows/update.yml` after contract news; catalog entry `capwages` for the Admin page.
- **Storage, one root** so the 14-day deletion is one operation (`node scripts/capwages.mjs --drop`): `capwages/meta` (last good run), `capwages/live/teams/{ABBR}` (what the site will read: each team's players with per-season cap hit, clause, expiry, bonuses, salaries, buyout and normalized retention, plus the team's buyout/retained charges and unverified items for this season and the next five), `capwages/staging/teams/{ABBR}` and `capwages/raw/players/{slug}` (last import). Per-team documents replace the brief's per-player collections because the site reads whole documents; the normalized content is the same.
- **Access:** there is no Firestore rule for `capwages/`, so no browser can read it (only the nightly service account). Making it readable to the owner is a rules change, held for Pat's decision (see below).
- **Public log:** this repo's Actions logs are public, so the import prints counts and pass/fail only. Per-team totals, gate failures and warnings go to the owner-only run log (Admin → Jobs).
- **Fair use:** ≤ 3.4 requests a second (300 ms spacing), one full import a day (skips if it ran in the last 20 hours; the workflow also runs on pushes), skips the detail phase when `meta.lastUpdated` hasn't changed since the last good import, retries 5xx/429 with backoff, never retries 401/403 (stops the run).
- **Discovery:** the list items have no `leagueStatus`, so players are kept when `current_team_slug` maps to one of the 32 NHL teams.
- **Retention rule as built:** a season is `retentionAnomaly` when retained percentages sum over 100, two teams share a percentage, an entry lacks a percentage or cap hit, or an entry names a team we can't match. Anomalous seasons put the player on every involved team's `unverified` list instead of counting a number.
- **Correction to the brief's premise:** the site does have contract data (Wikipedia/NHL.com/ProHockeyRumors terms and the owner's pasted PuckPedia cap table); "unverified" appears when a cap hit is estimated or a team's cap space is missing. CapWages replaces those estimates for money fields once the app reads it.
- **Standing rule unchanged:** no scraping of CapWages (or X, PuckPedia). This is the licensed API under the subscription and permission described above.

- **Spot-check correction (2026-10-16, first dry run):** the brief's OEL buyout amounts are right but its season labels aren't ("2027-28 through 2030-31" is four seasons for five numbers). CapWages puts them on 2023-24 through 2027-28, consistent with Vancouver's summer-2023 buyout, so the gate checks them there. Utah's 12% "retention" in those seasons is its share of the buyout (Vancouver's figures are exactly 88% of the total), so both are charged, with no double count. One more encoding problem found and ruled: 2024-25 also lists Vancouver retaining 88% of the full cap hit beside its own buyout, so a buyout team appearing as retaining salary flags the season.
- **Freshness:** `meta.lastUpdated` is the response time, not the data's, so the unchanged-data skip never fires; the once-a-day guard is what enforces fair use. `--revalidate` reruns the gates on the stored fetch without any request.

### Pending (needs Pat)
1. GitHub secrets `CAPWAGES_API_KEY` (and `CAPWAGES_API_USER`) on pb49939pb/dashboard-data. Until then the nightly step logs "not configured" and skips.
2. Copy the three fixture files to `scripts/fixtures/capwages/` (they weren't with the brief).
3. Visibility: owner-only (matches the existing rule for salaries and cap tables) or public cap hits on player and team pages (needs CapWages' terms to allow public display). Then the matching Firestore rule and the app changes (Trade Explorer verdict, player/team contract lines, Model source credit), and closing B27 after a validated import.

## Terminated contracts still listed by CapWages (2026-10-22)
`scripts/capwages-lib.mjs` `TERMINATED`: source-backed list of contracts ended early (terminated after unconditional waivers) that CapWages still shows beside the player's new deal. Matching rows (player, cap hit, from season) are dropped instead of flagging the season as an unverified overlap. First entry: Chris Kreider's $6.5M AAV contract, terminated by Anaheim in Sept. 2026 before his one-year $2.15M deal with Montreal (NHL.com). Remove an entry once CapWages corrects its data. Fixes bug "MTL GM moves cite a duplicate CapWages contract".
