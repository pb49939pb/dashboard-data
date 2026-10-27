# The Other Score: product spec

A living spec for patrickreidbaldwin.com/hockey. It covers who the site is for, everything it does, and where every number comes from. It's maintained by hand next to the code and updated with every feature change. When the page opens it, the appendices are generated from the running code: recent changes, the model list and (for the owner) the data-jobs catalog. How the models work is in the companion **Methods dossier**, and each model's scorecard is on the Model tab.

Last reviewed: 2026-10-26 (tab-switch speed; Oct 26 bug sweep)

## 1. What it is

The Other Score (formerly Hockey Lab; renamed publicly 2026-10-18, same address `/hockey/`) is an NHL analytics site built on public data. It has expected goals, player and team ratings, season projections, live win odds, game recaps, shot maps, front-office grades and an owner-only GM workbench (contracts, cap, trade valuation and recommended moves).

Its promise is that every number names its source and date, and every model is tested out of sample before it goes live. A new or changed model is promoted only if it beats the current one (or a simple baseline) on held-out data, with an interval that excludes zero. Otherwise it's published as a test result, run in shadow, or held for the owner's decision.

## 2. Who it's for

| Audience | What they come for | Access |
|---|---|---|
| **The owner** (a hockey fan acting as an armchair GM) | Everything below, plus the GM workbench: contracts, cap space, the trade explorer, recommended GM moves, scouting notes, forecasts, model switches, data health, ideas and bug triage | Signed in, verified owner account |
| **Curious fans / readers** | Who's actually good (xG, ratings), standings and playoff odds, recaps of last night's games, shot maps, coach and GM report cards, the question of the day | Anyone can read; signing in adds saved preferences |
| **Stats-minded reviewers** | How the models work and whether they hold up: scorecards, calibration, the methods dossier, this spec | The Model tab (public); the methods dossier and this spec are on the Admin tab, and their files are public under /hockey/ |
| **Allowed testers** | Filing bug reports | An account allowed by the database rules ("Report a bug" tab) |

**Not for:** betting advice (market odds are shown only as a comparator), real-time scouting, and private or paywalled data. No scraping of PuckPedia, CapWages or X/Twitter (CapWages data comes from its licensed API).

## 3. Principles

- **Sources and dates on every card.** If a number can't be traced, it doesn't ship.
- **Tested before trusted.** There are out-of-sample scorecards for every model, a prospective prediction log from 2026-10-13, nightly drift alarms, and versioned, content-hashed model artifacts.
- **Honest labels.** Estimates are called estimates, associations aren't presented as causes, and a heuristic verdict isn't called a probability.
- **Private stays private.** Salaries and bonuses, the owner's pasted cap table, the owner's trade search and edits are owner-only by database rule. Cap hits, terms, clauses, buyouts and retained salary from CapWages are public by the owner's decision (2026-10-16). Allow-lists live in the rules, never in public code. The public data repo never logs contract-derived values.
- **Light on the reader's device.** Heavy work runs server-side (nightly jobs, including the trade search), and the page does what's left in small slices so it never freezes.

## 4. Features

### Overview
A compact, question-led headlines page (2026-10-17). Every section is a card that can be collapsed to a one-line data summary (favorite-team standings and projections included); Collapse all / Expand all, and each choice, are remembered per device. On phones, grouped cards (League leaders, Award races, Standings divisions) are swipe decks with neighbouring previews, arrows, progress dots and one-card gestures; desktop keeps grids.
- **Games** (first): Yesterday, Today and Tomorrow, with sticky day chips that toggle each day (remembered) and Skip/Back shortcuts on long schedules.
  - Score rows read TEAM score – score TEAM, highlight and lead with your **favorite team** (saved on the device, or to your account when signed in; changed behind a compact Team settings control), and show In models / Not in models yet.
  - Win chances (The Other Score's pre-game model vs the Polymarket moneyline) show for your favorite (and watched) teams; **Show predicted winners** shows them on every game (remembered).
  - **Per-game projection impact:** a finished game shows how many projected season points it moved each team (a cached nightly replay of the team model with that game included vs still unplayed, everything else fixed).
  - During games: the clock, score and strength update about every 20 seconds, live win odds every 5 minutes, and a **goalie-pull advisor** appears for a team down one or two late in the third (too early, in the window, or past it, with the chance to tie): a decision aid from league-wide rates, not a prediction.
  - Each game opens a full **game recap**.
- **Question of the day** has its own card; the other **Today** rows (built nightly by fixed, tested rules: last night's biggest scoreboard-vs-chances surprise; a team winning more than its 5-on-5 chances suggest, or an honest "too early" note) unlock after opening the answer. Never generated text, never a prediction. The daily question is also a footer pop-up on every tab (ten questions rotate from Oct 15, 2026; headline, one chart, method and sample; three seasons of our play-by-play).
- **Standings** (one card, tabs): **Current** (official NHL standings carried by the score feed, refreshed between model builds; one division at a time, favorite's division first, bold division names and an East/West badge), **Projected** (10,000 simulated seasons: projected points with 80% ranges, playoff, division and Cup odds with simulation errors, division seed / wild card / just-out tags; a ten-row chart or table; desktop keeps the complete views), **Play control** (who's controlling play: xG share, adjusted or raw) and **Divisional strength** (four ranked divisions; desktop adds the head-to-head comparison). The **projected playoff bracket** shows both conferences narrowing to the Cup Final. Past seasons show the final standings and bracket instead.
- **League leaders** (one parent card): best defensemen, top defenders, best forwards, controlling play, best goaltending (GSAx), hot finishers, the snakebitten, most dangerous shooters, leakiest defense.
- **Award races:** Hart, Norris (with ice time), Vezina (GSAx with workload, plus official NHL SV% and GAA kept separate from model rates), Calder, Rocket Richard (goals) and William M. Jennings (team goals allowed, 25-GP goalie rule explained). Rows show current totals, per-game rates and season pace (a rate extrapolation, not a forecast), current-season WAR pace with coverage, and last season's actual winner as a benchmark. Leaderboards only; no award predictions.
- **Milestone watch** (after Award races): player-first panels with the next round-number career milestones in reach, the conditional projected date at each player's pace, and milestones reached this season.
- **Do the points match the chances?** (shot-replay points): each team's Actual Pts vs Expected Pts if every shot had gone in at its expected rate, shots held fixed, with a 90% range and a plain read; compact team comparisons lead, the full league is behind a disclosure. Deliberately not "deserved" and not a forecast.
- **Finishing and goaltending:** net goals vs expected at 5-on-5 (finishing and saves on shared-scale signed bars, helped/hurt labels, a team takeaway, the biggest net boost and drag), with how much each piece repeated from one half-season to the next.
- **About the model.** Team stats moved to Teams (2026-10-16).

### Game recaps
A full-screen modal with a pinned close control, section shortcuts (players, flow, lines, box score) and these parts:
- **Deserved-to-win odds:** every shot replayed 10,000 times; the result is explained against the pre-game forecast, and the game's projection impact follows.
- **Who showed up:** compact player cards (goals, assists and points first; plus/minus; game-specific opponent difficulty) with one sticky tab per team (your favorite first), a sort menu, and tap-to-expand full hockey cards.
- **The game breakdown deck** (swipe or arrows, progress dots; every card change opens at the top of the new card): The Battle, Period by period, How it unfolded, Story of the game, Three stars, Goalie duel, 5-on-5 lines, Style & shot map.
  - **How it unfolded:** chances in two-minute buckets pushing out to each side, goals and the turning point; on phones it's drawn at the card's size (goal dots and the ★, no side labels, so swipes move the deck) and lists the scoring with goal videos.
  - **Story of the game:** one timeline: each goal's time and running score, the scorer (power play / shorthanded / empty net / ★ turning point tags), assists, the scoring team's win odds before → after and both teams' skaters on the ice; each team's best five-minute stretch; a line at the end of each period. The on-ice data loads only when opened.
- **Lines and storylines:** who was on the ice for each goal, matchup difficulty from shift charts, storylines (including "rough nights" judged by expected ±), and box scores with an expected ± column.

### Teams (pick any of 32)
Defaults to your favorite team (else Detroit). On phones the team and season picker sits behind a small Change team / season button, and long card explanations move behind ⓘ buttons. Player names anywhere on Teams open the player's profile in a pop-up.
- **Cap space tile:** each team's room under the ceiling from CapWages (roster and injured lists, buried minor-league deals, buyouts, retained salary; LTIR flagged).
- **Team breakdowns:** where the team wins and loses (a goal-differential ledger: 5v5 chances, finishing, goaltending, special teams), team phase (inferred, or the owner's objective) with Polymarket as a comparator, and playoff odds.
- **Player strength:** core players, the team's best players, and strength by position (C, LW, RW, LD, RD, G) ranked league-wide.
- **Absences:** man-games lost, an absence proxy weighted by lost points and wins, with current absences tagged, and why the player is out when CapWages' roster status says (injured reserve, LTIR, minors, loan, suspended).
- **Rest and travel:** the team's next games, with each side's days of rest, back-to-backs and miles from the previous arena, plus the week's back-to-back mismatches.
  - Effects are measured over 11,389 games: back-to-backs cost about 6.7 points of win probability. Travel and extra rest showed no measurable effect.
- **Assets:** draft picks (next three drafts, including traded and conditional picks) and prospects, valued in wins.
- **Lines and pairs:** most-used units, their minutes and on-ice results.
- **Style:** style fingerprint and archetype, matchups (descriptive only) and player types that fit the system.
- **Recommended GM moves** (everyone; the owner's version also uses contracts, cap space and saved edits). The three best deals that could all be made (no shared player), with a plain-English why, playoff odds before → after and a feasibility chip. They're searched server-side nightly and re-checked on the page; when the overnight search is out of date the page searches itself, but only once every input (contracts or public terms, CapWages, the cap table) has loaded, and it redoes the list whenever an input changes, so the card always matches How it's valued.
- **Explore trades** (everyone; the owner's version also uses the private contract list and edits): build any deal (players, picks, prospects, from several teams) and see:
  - wins this season and long-term value by each team's window;
  - the other team's verdict and EA-style value bars;
  - the "How?" sheet with every input (projection ranges, roster fit, contract bonus, cap shadow price, availability and premium);
  - a real cap check from CapWages (compliant with each team's room left, over the ceiling by how much, or unverified with the reason), a feasibility checklist (contract rights, no-move and no-trade clauses from CapWages, the CBA's retained-salary limits, conditional picks, reported availability, price), a real-trade comparison and playoff odds before and after.
  
  Best trades for a team are also listed.

- **My franchise (prototype):** make any deal the trade checker passes, then see your moves, the combined wins this season and playoff odds before and after for you and your partners.
  - Saved in your browser.
  - Each deal is valued against today's rosters; free agents and lines aren't built yet.

### Skaters
- **Players tab team filter (2026-10-22):** a Team picker (All teams plus all 32 clubs by full name, your favorite starred) narrows the skater and goalie lists to one team, ranked within that team. It defaults to your favorite team (device or account preference) when one is set, otherwise All teams; a manual pick is remembered for the browser session and carries across Skaters/Goalies. Clear search and filters resets it to All teams. On phones the picker takes its own row above Position and Sort.
- **Ratings and stats:** ratings (offense, defense, usage, overall, 40–99 within position) and stats (xG, goals above expected, expected ±, ice time).
- **Contracts in lists:** every player list shows his current contract beside him (cap hit, final season, clause, extension; "Contract data: CapWages"): Teams (best players, core players, strength by position, style fits, GM moves), the trade explorer's player lists, and sortable Cap hit / Thru columns on the Skaters and Goalies tables.
- **Player profiles** open in a pop-up wherever a player is named (skaters and goalies alike, without leaving the tab): the contract first (cap hit, years left, UFA/RFA, clause; "Contract data: CapWages"; unsigned players say so), goals, assists and points, ratings, WAR-lite value, cached career achievements, opponent difficulty (time-weighted opponent strength, minutes against top players, most-faced opponents from 5-on-5 shifts), system fit, the owner's private scouting note, and **☆ Watch this player** for signed-in readers.

- **Career outlook (experimental, 2026-10-19)** at the very bottom of every skater profile: seven seasons ahead (to age 40), from 4,000 simulated careers per player (hockey-models career.py). Metric tabs for season WAR, WAR/82 if playing, points, goals and games; actual seasons as a solid line, the median as a dashed line with an 80% band; the chance of 20+ NHL games each season; next-3/5-season totals with ranges; a season-by-season table; how it's built and how it tested (beats the current projection model one season ahead, even at three and five). Goalies and players with no 2025-26 NHL games aren't covered. Trade values keep using the player projection model.

### Goalies
- **Goalie stats:** GSAx and shooter-aware GSAx, ratings by shot type, with fewer-than-100-shot cells faded and 90% intervals.
- **Profiles:** goalie profiles and the all-goalies-by-shot-type grid.

### Coaches
- **Coach report cards:** results vs roster talent (shrunk, with bootstrap ranges), labelled as coach-associated residuals.
- **Coaching-change tests:** coaching changes and carry-over tests.

### Shot maps
- **Maps:** a heat map (for or against, by strength, xG or goals) and every shot as dots, by team, player or game.
- **Shot-danger explainers:** "What makes a shot dangerous" and "Distance matters most".

### Cap & trades (everyone since 2026-10-18; the owner gets the editable list)
For every reader, from CapWages (public cap fields only: cap hits, terms, clauses, roster status, cap space; no salaries or bonuses): the team's cap space today and next season with buyouts, retained salary and LTIR; every contract CapWages lists for the team (cap hit, what counts now, last season, UFA/RFA, clause, roster status, retained by); cap space for every team; the trade block and The Inside Scoop; the deadline war room and buyers and sellers. The trade explorer's best-trades search is open to everyone. The owner's version adds what follows.
- **Contracts:** every contract (term, cap hit, extensions, with provenance), editable on the site. Edits are saved privately and never overwrite the source.
- **Cap space:** every team's cap space from CapWages (since 2026-10-16): today and next season, with buyouts, retained salary and LTIR shown; the owner's pasted PuckPedia table is a fallback, still editable, shown beside CapWages. The contracts list shows CapWages' cap hit and last season beside each row and flags differences.
- **Trade block:** from news feeds that allow it, plus the owner's edits.
- **Deadline war room:** the 15 most useful realistic targets for the team being viewed, ranked by wins added this season, with value, asking price and cap fit.
- **Buyers and sellers:** all 32 teams sorted by likely deadline role, from our odds and team phase or the owner's objective.
  - Buyers show needs and cap space.
  - Sellers show their most valuable movable pieces (pending UFAs, trade-block players, veterans) and their pending UFAs.
  - The thresholds are stated on the card.

### Front office
- **GM grades:** grades by GM era.
- **Draft:** draft yield vs expected by pick, best draft picks and what a pick slot is worth (outcome ranges).
- **Trades and pickups:** best pickups (pro scouting), and best and worst trades (realized WAR for the acquiring team).
- **Age of scoring.**

### Model (public)
- **Explainers:** "How The Other Score works", and each model's when, inputs, what it does and where it's used.
- **Scorecards:**
  - xG folds (train 2023-24 + 2024-25 → test 2025-26; all three → this season), calibration and walk-forward game odds;
  - RAPM vs WAR-lite, the WAR ledger, goalie forecasts, styles and fatigue;
  - season simulation at frozen dates;
  - "How good are the forecasts?" from the prospective log.

### Feed (signed-in readers, 2026-10-18)
The first tab and the default page when signed in (links to a tab still open that tab). It starts empty, with directions.
- **Press and hold to add** (iPhone style): hold any card, panel or tile for about half a second; it shrinks a little, then lifts while the page blurs and dims, and a menu springs out with what applies there: add this tile (a team's box, a milestone, a goalie's panel), this panel (one of League leaders, Award races or Standings divisions) or the whole card; watch the team or player it's about. ✓ in the menu = already in the Feed (choose it to remove). Right-click does the same with a mouse; keyboard and screen-reader users get an Add to Feed button when a card's title is focused. No buttons sit on the cards at rest.
- **Live, with context:** a widget is a pointer to a card, saved with the team and settings it had (e.g. Teams · DET), and is drawn from the tab's own code, so it always shows the latest numbers.
- **Watch teams:** pick any number of teams at the top of the Feed; every game card of theirs (yesterday, today, tomorrow; win odds always shown; live scores) appears as one movable block.
- **Watch players:** ☆ Watch this player in a player's profile (or a hold on his name) adds a simple season card (rating, G/A/P, expected goals, goals vs expected, ice time; goalies: save %, goals saved above expected, shots, goals).
- **Rearrange like the home screen:** hold any item until everything jiggles; keep holding and drag it, and the others slide out of the way; − removes; Done (or a tap outside) finishes. Items show as short previews while rearranging. Each item's ⋯ menu has Move to top, Move up, Move down, Rearrange and Remove. Order and contents are saved per account (`apps/hockey/users/{uid}/feed`). No haptics on iPhone (Safari doesn't allow them); Android gives a short tick.

### The Inside Scoop (2026-10-18)
At the bottom of Overview (under Award races; the latest six, Show all for the rest) and on Cap & trades (all of them, replacing the Trade block card's "Around the league" list). The league's notable trade rumours and updates from the NHL insiders, newest first.
- **Sources and credit:** read nightly from the feeds we're allowed to read: NHL Trade Rumors (which quotes the insiders' posts on X, TV, radio and podcasts), ProHockeyRumors and Daily Faceoff. Each report shows its quote, its date, the insider by name when the report names one (Friedman, LeBrun, Pagnotta, Seravalli, Dreger…), the platform (on X when the quoted post carries an @handle, on TSN, Sportsnet, The Athletic, a podcast or radio) and the outlet, linked. X itself isn't read: its terms forbid scraping and its API is paid.
- **Preview cards:** photo and team, status (Requested a trade / In trade talks), the latest quote with its credit and date, how many reports since when, the teams on his reported list and the teams named in the reporting.
- **Player page** (tap a card): status (injury or roster status from game rosters and CapWages), no-trade / no-move clause, the contract line (CapWages), this season's numbers for his position (forwards: goals, points, expected goals, goals vs expected, ice time; defensemen: points, ice time, on-ice xG%, expected ±; goalies: GP, save %, GAA, GSAx), WAR, WAR pace (his current rate over a full season, not a forecast) and WAR per 82, **contract value over the whole deal** (every season of the current contract: seasons already played with the WAR-lite he actually produced, back to 2008-09 via `hockey/warHistory`; this season and the rest with his projections; each season's market worth from the trade model's WAR → salary fit minus his cap hit, in today's money adjusted for the cap ceiling's growth; shown as whole contract, so far, this season and still to come, with a season table; CapWages supplies the contract's first season and past cap hits), his **reported trade list** (teams on it, teams ruled out, its size; each fact with its quote, date and link; the newest report about a team wins), the teams named in the reporting, and every report on him, newest first. ☆ Watch this player is there too.
- **Three trades to consider** (on his page): for each team on his reported list (else each team he hasn't ruled out), the package of that team's players, prospects and picks that gives his team the most value while the partner still gains (0.3+ wins by its window), his team's asking price is met and the cap check passes; the best three partners, teams named in the reporting first among near-equals. A short list is topped up from teams he hasn't ruled out, marked "not on his list: needs his OK". Each has its feasibility status and opens in the trade explorer. Computed nightly with the trade search (`hockey/scoopTrades`, public inputs) and re-checked on the page; searched on the page when the inputs differ (e.g. signed in as the owner). The nightly trade search and Recommended GM moves skip any deal that sends a player to a team his reported list rules out.
- **Explore trades:** opens the trade explorer for his team with him in the deal and, by default, only the teams on his reported list (e.g. Dylan Larkin: Dallas, Minnesota, Carolina; all seven Canadian teams and Philadelphia ruled out; "up to 12 teams"). "Not ruled out" and "All teams" are one tap away; team chips jump the player search to that team; the best-trades list hides deals with other teams and says how many. The feasibility checklist adds **Reported trade list**: a destination he's ruled out fails, one on his list passes, anything else is "not on his reported list as far as we know".
- **Data:** `scripts/block.py` (nightly) keeps every report per player (up to 40) with insider, platform and teams named, and the trade-list facts; published in `hockey/tradeBlock` by the trade search job.

### Signed-out view (owner only, 2026-10-18)
A **Signed-out view** button under Sign out (only for the owner's account, recognized by the database letting it read the admin documents; nothing about the account is in the site's code) reloads the page as a signed-out visitor sees it: public tabs only, no contract figures, public GM moves and trade search, no saved edits. The owner stays signed in; **Back to my view** returns. Visits made in it still count as the owner's.

### Admin (owner, plus a read-only test account)
Since 2026-10-18 one test account (the muse browsing agent) can also open Admin read-only: the database rules let it read the admin documents and the visit log, but not write them. The site tells the owner apart by the owner-only contract data, so the test account gets every sub-tab, the methods dossier, this spec and Deployments, but no Run now buttons, disabled switches, Report a bug instead of Ideas & bugs, no owner previews of the redesign, and its visits aren't marked as the owner's. Its address can't be checked as verified, so anyone who signs in with that address gets the same read-only view.

Sub-tabs (since 2026-10-16), the last one used remembered:
- **Visitors:** unique visitors, visits, tab views, time per visit, visits per day, each tab's visits and time (and how many visits landed there), devices, where visits came from, busiest hours and the 25 most recent visits, over 7, 30 or 90 days, with or without your own visits. From our own anonymous visit log (`visits/{id}` in Firestore): a random id per browser (no cookie), tabs and visible time, device class, referring site; no IP address, account or email; Do Not Track honored; readable by the owner (and the read-only test account) only. Counted per browser, so one person on two devices counts twice.
- **Usage:** today's Firestore reads, writes and deletes and Hosting downloads for the whole project, cost per 100 page loads, the cost past the free daily quota (at the nam5 multi-region price), the month so far, cost by day, whether the cutoff is in effect, and each data job's own reads and writes from its last run. From `admin/budget` (scripts/budget.mjs, every 10 minutes; see docs/firestore-budget.md).
- **Data jobs:** every data job with run history, sources and "Run now" (nightly build, contracts, contract news, CapWages, trade search, models).
- **Model health:** model switches (WAR-lite vs RAPM, team-only vs roster-aware simulation), drift alarms, nightly data checks, model artifacts (versions and hashes, with a field dictionary) and the roster-aware simulation in shadow.
- **Forecasts:** your forecasts and the trade-engine self-tests.
- **Docs & models:** the methods dossier, this product spec and the **deployments log** (each with Copy and Download .md) and the model list. The deployments log lists every deploy of the last 7 days, newest first: the date and time (Eastern and UTC), who deployed, any notes, and what changed in each repository that shipped since the deploy before it (commit subjects); written automatically by `pat-dashboard/scripts/log-deploy.mjs`, which both deploy scripts run, and published as `/hockey/deployments.md`.
- **Architecture:** the full diagram of sources, jobs, stores, models and pages.
- **Brand preview:** the masthead is public; this switch turns the owner-only later-phase previews (section headers, tabular figures, Today as flagship) on or off.

### Ideas & bugs (owner; testers see "Report a bug")
- **Ideas:** the owner files ideas, and Claude answers each one by building it, asking a question or declining with a reason. Statuses: new, in progress, needs input, needs approval, approved and queued, done, won't do.
- **Bug reports:** from allowed accounts, triaged with statuses. A sweep every 2 hours (while the Claude app is open) works through new items. Big or direction-changing items wait for owner approval.

### Data kept for later
- **Rating history (F14):** every player's ratings are saved write-once each month during the season, plus each finished season's final ratings (from 2024-25). Nothing shows on the site yet. This is the history that aging curves and "when do players peak" questions will need.

### Elsewhere
- **Red Wings widget:** on the personal dashboard, with xG and shots.
- **Usability:** remembered picks per browser, deep links per tab and a back gesture that closes pop-ups. Works on phones: mobile pop-ups keep one always-visible close control; swipe decks share one interaction (220 ms settle, vertical scrolling stays native, reduced motion respected).
- **Name:** The Other Score (formerly Hockey Lab) everywhere since 2026-10-18, from the first paint; same `/hockey/` address. The later redesign phases (editorial section headers, tabular figures, Today as flagship, the After the Horn recap) are owner previews (Admin → Brand preview). The dashboard launcher button was removed from the site (2026-10-18).
- **Spend cap:** Firestore and Hosting spend together are held to $5 a month. Past $5/30 in a Pacific day (or $5 in a month), the whole site shows a one-page "Back tomorrow" notice, the database is cut off to everyone but the owner, and the data jobs skip Firestore until midnight Pacific. A fresh visit costs about 20 reads, ~7 writes and ~0.22 MB: about 0.6¢ per 100 page loads past the free quotas.
- **Speed:** Teams, Goalies and Overview load slim nightly versions of the two largest documents first (playersLite, injuriesLite); the full ones load only for the Skaters tab, player cards and last season's man-games lost.

## 5. Data sources

| Source | What we take | How | Terms |
|---|---|---|---|
| NHL web API (api-web.nhle.com) | Play-by-play, standings, schedules, rosters, club stats, scores, prospects, player pages (injured reserve, career totals) | Nightly and every 5 min on game nights | Public endpoints |
| NHL stats API (api.nhle.com) | Shift charts, goalie game logs, skater bios and handedness | Nightly | Public endpoints |
| NHL HTML game reports | Shift reports when the API's shift charts are missing or partial | Nightly fallback | Public pages |
| MoneyPuck | Season files: on-ice xG, ice time, zone starts; goalie seasons since 2008-09 | Nightly and by hand | Their published data files, credited |
| Wikipedia (CC BY-SA) | Draft history and traded picks, transactions and trades, contracts, coaching records | Nightly, weekly and by hand | Attributed |
| ProHockeyRumors, NHL Trade Rumors, Daily Faceoff (RSS) | Trade block and signing news | Nightly | RSS feeds that permit it |
| NHL.com team releases | Contract terms and cap hits | Weekly | Public releases |
| Polymarket Gamma API | Moneylines, playoff and Cup futures | Nightly and live | A comparator only, never an input to our odds |
| CapWages API (licensed) | Cap hits, terms, expiry, clauses, buyouts, retained salary, roster status, game-day lineups | Nightly, once a day, fail-closed validation, staging before publish (capwages.mjs) | Paid subscription with permission; credited; cap fields public, salaries private; deleted within 14 days if the subscription ends |
| PuckPedia cap table | Each team's cap space | Pasted by the owner on the site (no scraping) | Owner only |
| Contract terms (public subset) | Contract years, status and extensions, with no money | Nightly, from the owner's contract list | Public |
| Our visit log | Anonymous visits: tabs, visible time, device class, referring site | Written by every page as it's used (validated by the database rules) | No cookies, IPs or accounts; owner-only read; footer disclosure |
| The owner's edits | Contract fixes, trade block, objectives, scouting values, forecasts | Saved on the site | Owner only |

**Pipeline:**
- GitHub Actions (dashboard-data) runs nightly at 3 AM Eastern, then the trade search.
- On game nights, odds and recaps update every 5 minutes.
- Contracts get a weekly full refresh.
- The models are refit by hand or monthly (hockey-models, Python).
- Everything is stored in Firestore (project pat-dashboard-eb494), with a snapshot bundled into each deploy as a fallback.
- The architecture diagram (Model tab summary, full version in Admin) shows every job, store and model.

## 6. What it deliberately doesn't do

- **Tracking stats:** no NHL Edge tracking data (no public API).
- **Betting advice:** none.
- **Locker-room knowledge:** no claim to know locker rooms, owner budgets or no-trade lists beyond what the owner enters.
- **Unearned "predictive" claims:** nothing is called predictive without an out-of-sample test. Matchup "edges" are shown as descriptive.
- **Paywalled or forbidden data:** no scraping of paywalled or prohibited sources.

## 7. Open requests and roadmap

Open feature requests and their status live on the Ideas & bugs tab (owner). As of the last review:
- **Needs an owner answer:** offensive zone time per period (proposal: a labelled territory estimate).
- **Approved by the owner (Oct 14), in build order:**
  1. F14 rating snapshots (done: saved nightly from Oct 2026)
  2. F05 game story viewer (done)
  3. F02 deserved standings (done as "Points from the chances", careful definitions)
  4. F10 buyer/seller index (done)
  5. F07 shooting regression board (done, no "who's due" predictions)
  6. F13 rest and travel (done)
  7. F09 deadline war room (done)
  8. F12 milestone watch (done)
  9. F03 goalie-pull advisor (research first)
  10. F01 franchise mode (prototype done)
  11. F08 award races (done, leaderboards only)
- **Long-term roadmap (2026-10-18):** contract value over the whole deal is live (The Inside Scoop); still to come, a fuller **contract value model**: value each contract over its remaining years (projected WAR per season with aging and ranges, the market salary for that production each season, the cap ceiling's growth, the chance he's still an NHL regular, retained salary and buyout options) and summarize it as surplus value over the deal and per season, with a confidence range. Today's contract value (The Inside Scoop, trade values) covers this season only: the WAR per 82 → market salary fit minus his cap hit.
- **Not planned (owner decision):** F04 fantasy edge, F06 expansion draft, F11 matchup previews, F15 all-time lineups, F16 NHL Edge board.
- **Done:** Hockey Lab / Today (spec of 2026-10-14).
- **Done:** a learned-weights retest of the "tested, not adopted" ideas. Learned weights came out at zero, so they stay out. A backfill of earlier seasons for more statistical power is a possible next step.

## 7a. Brand direction
Hockey Lab became **The Other Score** publicly on 2026-10-18 (Phase 7's name switch, on the owner's go: masthead from the first paint, title, app manifest, attributions; same routes). Done: Phase 0 (baseline and guardrails), Phase 1 (copy), Phase 2 (Center ice masthead; now public), Phase 3 (Today as flagship, approved; its layout is still an owner preview). Phase 4 (After the Horn recap) is built on a branch and waits for the owner's test; Phases 5–6 are next; the domain/trademark check and any domain move are separate decisions. The plan, voice, UI inventory, checklist and baseline are in `docs/brand/`. Brand work never changes models, data, permissions or routes.

## 8. How this spec stays current

Every feature change updates this file, along with the changelog, the methods dossier, the model inventory and the architecture diagram. The source is `dashboard-data/docs/product-spec.md`, and each site deploy copies it to `/hockey/product-spec.md`. The "Product spec" button on the Admin tab's Models card shows it with generated appendices. The raw file is public at that URL.


### Three-day game schedule
Overview shows Yesterday, Today and Tomorrow using Eastern calendar dates. The score feed includes tomorrow with hourly schedule refreshes; available pre-game model and market odds use the existing prediction pipeline. Missing schedules are labeled unavailable, distinct from a confirmed day with no games. Projected standings chart rows are numbered 1–32 in projected-points order.


### Nightly player opponent difficulty
Player profiles show current-season, 5v5 shared-ice-time opponent strength, same-position percentile, time against top players, most-faced opponents and data coverage. Computed in the nightly pipeline from cached shift overlaps, published in the existing players document. Percentiles need 60 tracked minutes and at least 80% known opponent values. Missing data stays unavailable. Underlying player ratings are unchanged; model-inventory.md documents the calculation and architecture.

### Historical training expansion (done 2026-10-17)
All of 2023-24 (1,312 games: play-by-play and shift charts) was fetched once and cached. Adding it to xG training improved the held-out 2025-26 season (log loss 0.21779 → 0.21664, 95% CI of the difference −0.0017 to −0.0007; AUC 0.768 → 0.772; calibration slope 0.90 → 0.95) and tied on 2026-27 so far, so production xG now trains on 2023-24 through 2025-26. Shooter-aware xG, the question-of-the-day answers and the goalie-pull rates moved to the same three seasons. 2022-23 was tested on top and made both held-out seasons worse (+0.0009 log loss), so it isn't used; 2020-21 (the COVID season) is excluded. No extra nightly API calls: history is fetched once, offline. Test code: hockey-models `hockey/xg_history.py`; results in `models/xgHistory*.json`; previous artifacts in `models/archive/`.

### Overview presentation cleanup
Team stats moves from Overview to Teams. Milestone Watch leads with four player panels (career target, current count, distance and conditional projected date), with remaining and achieved milestones expandable. Shot-replay points lead with the favorite and largest positive/negative point gaps, using explicit Actual / Shot replay / Difference labels, uncertainty ranges and an expandable full comparison. Finishing and goaltending use goals-versus-expected labels, chance share and expandable full league comparisons. Calculations remain unchanged; hypothetical past-shot replay is clearly distinct from a standings forecast.

### Compact game cards and ten-row projections
Game cards place model-inclusion badges in their top-center gutter and favorite labels at top left; outcomes are centered below the symmetric score. Tighter mobile spacing retains both odds sources. The projected standings chart uses a native vertical scroll region showing ten compact rows with persistent column labels and axis; scrolling chains normally to the page at the edges. A Show all teams control removes the inner scroll area. Team ranks, expandable details, Chart/Table switching and projection values remain available.

### Recap difficulty and Teams player profiles
Game recap skater cards show existing game-specific opponent difficulty on compact and full cards, explicitly distinguished from season percentiles; missing data is labeled. Player names across Teams core, position strength, absences, prospects and recommended moves open profile modals in place. Goalies and players without current NHL stats have appropriate summary profiles. See `docs/player-profile-links.md`.

### Mobile Overview controls
On phones, sticky Yesterday/Today/Tomorrow chips independently toggle visible schedules and remember device preferences across reloads. Default Yesterday+Today; Tomorrow opt-in; all-off is supported. Skip/Back shortcuts let users bypass long schedules without restricting normal scrolling. Today shows the daily question first, with other stories behind More from Today. Question modal padding is consistent. Desktop game days and full Today edition remain visible. See `docs/mobile-overview-controls.md`.

Current standings retain the complete mobile table (RW remains hidden per the existing mobile rule). Cell padding, logo sizes, status-pill spacing and numeric type scale to the division container width, fitting all displayed columns at 320–640px without clipping. Standard text size is retained from typical 360px phone widths upward; smaller screens use a bounded font reduction. Desktop styles and standings calculations are unchanged. Fit verified with current values and synthetic wider late-season numbers.

Current standings now use Atlantic, Metropolitan, Central and Pacific division tabs, displaying one table at a time. The initial division follows the favorite team when available, otherwise Atlantic. A manual choice survives subsequent renders in the session. Tabs support arrow keys, Home and End; hidden panels are removed from the accessible view. Standings and conference-wide wildcard calculations are unchanged. Mobile retains the responsive full-column fit.

### Mobile leaderboards and primary player stats
On phones, Overview leaderboards share a horizontal carousel with a centered card, neighboring-card previews, subtle perspective, native swipe, arrow controls and keyboard navigation. All nine leaderboards retain rankings and player links; desktop retains its grid. No nested vertical scroll is introduced. Goals, Assists and Points lead skater profiles and compact/full recap cards; official plus/minus remains below. Goalies retain goalie-specific stats, and unavailable skater totals show dashes.

### Saved card visibility and scrolling corrections
Content cards have independent Collapse/Expand controls with device preferences persisted in local storage (`hl-collapsed-cards:v1`), restored after reloads and live section refreshes. Mobile leaderboard lists fill the card width; native horizontal scrolling uses stable untransformed geometry without animated perspective. Projected standings always display all 32 teams, with no inner vertical scroller or ten-row mode; users can collapse the whole card instead. This supersedes the prior ten-row scroller and depth effect.

### Mobile leaderboard deck: snapping and alignment
On phones, leaderboard swipes use mandatory centered snap points with one active card and scroll-stop/idle settling, including trackpad input. Expanded cards share a height and measured heading/description rows so the first player aligns across leaderboards; measurements refresh on width, font and collapse changes. Decorative folded edge panels animate around the readable, untransformed cards and respect reduced motion. Saved collapse controls remain available; collapsed cards show only their headings. Desktop keeps the existing grid. This replaces the prior free/proximity scrolling behavior.

### Parent sections for mobile swipe decks
League leaders is a single collapsible parent card; individual leaderboard cards no longer have visibility controls or apply their former per-card saved collapse preferences. Centered snapping, equal heights and aligned first-player rows remain. Decorative accordion edges are removed. Current standings is a collapsible parent whose four divisions swipe and snap on phones, synchronized with division tabs; vertical page scrolling remains native and tables retain their mobile column fit. Desktop standings retains one division selected by tabs and leaders retains the grid inside its parent. Collapse controls across content cards use rotating chevron icons with accessible labels/tooltips and saved device state. This supersedes individual leaderboard collapse and folded edge decoration.

### Unified phone swipe interaction
Player leaderboards and current division standings share the same centered card widths, neighboring previews, arrow/status controls and gesture controller. Mobile division tabs are replaced by the matching carousel controls; desktop division tabs and leaderboard grid remain. A horizontal swipe advances one adjacent card by distance or flick velocity; a small drag returns to the active card. Both use a 220ms cubic ease-out settle, interruptible by a new gesture, with immediate positioning for reduced motion. Native vertical page scrolling and deliberate player taps remain available; short horizontal drags suppress accidental taps. Equal leaderboard heights, aligned first-player rows and persisted parent collapse remain. No decorative side animation. This supersedes the earlier separate/native touch settling implementations.

### Award races mobile carousel
Hart, Norris, Vezina and Calder share the existing mobile swipe controller with leaders and division standings: one-card gestures, small-drag rollback, 220ms ease-out settling, neighboring previews, arrows/status and keyboard navigation. Award panels have equal heights and aligned first-player rows. The Award races parent retains its persisted chevron collapse control and existing rankings, eligibility, explanations and sources. Empty eligible fields are labeled. Desktop retains the four-award grid.

### Division strength placement and mobile swipe deck
Division strength sits immediately below Current standings, before projected standings. On phones its four ranked divisions use the same swipe controller, centered card widths, neighboring previews, arrows/status, one-card gestures and 220ms settle as leaders, awards and current divisions. Expanded strength cards share a height; saved parent collapse, division detail links, rankings, explanations, head-to-head table and sources remain. Desktop retains the division strength grid in the new location.

### Mobile standings headers and division comparisons
Current standings division cards use larger bold division titles and distinct East/West badges above the table on phones, with fit checked at 320, 390 and 430px. Division strength hides its complete Head to head comparison section (heading, explanation and matrix) on phones. Swipe decks, numeric data and desktop presentation remain intact.

### Overview headlines, standings and daily question (2026-10-17)
Overview removes the Stories/Standings/Projections/Leaders jump chips and Back to games button. Collapse all / Expand all sits above Games; per-section visibility remains device-persistent and late-loading sections honor the bulk preference. Each collapsed parent has a single summary row with a compact title, a live-data takeaway and a chevron. Favorite-team standings, points/projections and goal effects use actual data; no-favorite summaries use league context. Summary rows remain one line; full text is available in title tooltips and expanded content. Toggling anchors the header under the thumb, including a temporary scroll buffer near the footer. The 12-section collapsed stack measured 862px at 390px phone width; full page including header/footer fits about two 844px screens.

Question of the day is a dedicated card. Other Today stories become available through More from Today only after the answer has been opened; disclosure remains optional. The question can load from the question bank when no recent Today edition exists.

Current and Projected standings share one parent, defaulting to Current on reload. On phones both use four division swipe cards with the same 220ms gesture controller, neighboring previews, arrows and progress dots. Projected rows show league rank, team, expected final points with the 80% range, playoff chance and Cup chance; all 32 teams remain accessible without an inner vertical scroller. Desktop retains full projection tables/charts inside the Projected tab. Division strength remains directly below the combined standings. Every mobile carousel has selectable progress dots. Mobile bracket series are grouped into First round, Second round, Conference finals and Stanley Cup Final disclosures, with the first round initially open; desktop retains the bracket layout.

### Clearer results versus chances
Milestone watch follows Award races. Points comparison columns say Actual Pts and Expected Pts. On phones the long subtitle, early-season notices, per-row replay context, uncertainty/method details and source footer move behind a tappable info dialog. The help preserves the shot-replay definition, regular-season tie assumption, historical checks, uncertainty ranges and sources; these are expected points for past games, not forecasts or deserved points.

Finishing and goaltending is audited as a signed 5-on-5 goal ledger: finishing = goals scored minus xG for; goaltending = xG against minus goals allowed; the sum equals actual goal differential minus expected goal differential. Highlights and all-team ordering now use that net total instead of PDO, so selection matches the displayed measure. Team cards show a net effect, a plain-language takeaway, separate helped/hurt labels, and signed bars sharing one scale across both components and teams. Zero/near-zero displayed effects are neutral; values are calculated before rounding. Season totals are labeled; shooting/save percentages and chance share remain under Shot context, with full interpretation and historical correlation checks available. This changes presentation and highlight selection, not the underlying xG or expected-points calculations.

Validation: phone widths 320/360/390/430px, desktop views, centered touch swipes and vertical scrolling, player taps, info dialog fit, favorite summaries, bulk/individual persistence, footer/header anchoring, question gating and division/round navigation. Displayed goal totals and highlight choices reconciled with the source season data.

### Projected playoff positions and visual fixes (2026-10-17)
Projected standings use the same position cues as Current: green division seeds, amber WC1/WC2, Just out for the next two teams per conference, Out for the remaining teams, and a dashed cut after the third division team. Positions follow mean projected points under the top-three-per-division plus two conference-wide wildcards format, separately from playoff probabilities. The phone table replaces Cup with Position to retain readable widths; complete desktop projection tables keep Cup and add a sortable Projected spot column. Fitted projected table cells are not sticky, avoiding displaced team labels inside the horizontal swipe deck; WSH/WPG fit at 320px. Seed validation found 12 division seeds and 4 wild cards, with the next two per conference labeled Just out.

The original connected mobile bracket is restored: West rounds narrow toward the Cup Final, with East mirrored below and all 15 series visible together. The round disclosure replacement is removed; parent collapse and the Cup-favorite headline remain. This supersedes the earlier bracket-round disclosure requirement. Award panel titles (Hart/Norris/Vezina/Calder) now use bright header text, 18px sizing and bold weight on phone and desktop. Validated phone table/bracket fit at 320/360/390/430px, stable team labels, carousel navigation, preserved desktop/current standings, and header contrast.


### Overview simplification: standings tabs (2026-10-17)
The Overview2 preview is removed at the owner's request. Its tab, account gate, presentation module and stylesheet are deleted. Old #overview2 links return to the original Overview.

For the current season, the Standings card has three tabs: Current (default), Projected, and Divisional strength. Divisional strength contains the existing division rankings, strength/cross-division record explanations, team links, division detail modal and sources. It replaces the separate current-season strength card, sharing the Standings card's collapse control and favorite-division summary. Phone swipe/snap navigation and progress dots are preserved, with the desktop head-to-head comparison retained and hidden on mobile. Current/projected columns and playoff-position highlights are unchanged. Completed-season division strength remains available in the historical layout.

The three labels fit 320px phones without horizontal overflow. Arrow keys cycle all three tabs; Home/End select the first/last tab. Switching views preserves the tapped tab's vertical position, and the active mode's collapsed headline reflects the favorite division's strength rank when appropriate. Validation covers 320/390/430px and desktop layouts, one shared collapse control, division navigation/details, current/projected switching and removal of the preview route/assets. No data pipelines, model formulas or nightly API calls change.


### Play control tab and reliable mobile modal close (2026-10-17)
Standings now has four views in this order: Current, Projected, Play control, Divisional strength. Play control reuses Who's controlling play's original 32-team scatter chart, Adjusted/Raw controls, interpretation and source information; its separate current-season Overview card is removed. The selected view contributes the collapsed Standings headline. Today links that compare teams open Play control and expand Standings if needed. On narrow phones the fourth label reads Div. strength while its accessible name remains Divisional strength; all four tabs fit at 320px. Historical/no-projection layouts retain their standalone play chart.

Mobile dialogs use a separate, non-scrolling close header and a flexing scroll body. One 44px X remains visible independently of content length; legacy in-content Close controls are hidden only on phones. The shared preparation helper also wraps asynchronously replaced dialog contents. Recap redraws and trade-load resets target the correct scroller, and closing a recap clears replay timers. Desktop retains its existing scroll and close-control presentation. Player/question padding rules accommodate the shared wrapper.

Browser validation: 320/390/430px and desktop; long recap/profile/question/info layouts at top, middle and bottom; one visible mobile close control with unobstructed hit target; actual recap markup and box-score jump; redraw scroll preservation; nested info dialog/Escape; shortened mobile viewport; four-tab fit, chart team count, Adjusted/Raw views, keyboard navigation and division details. These presentation changes add no external API calls or nightly jobs.


### Compact Overview games and optional predictions (2026-10-17)
Overview game cards hide win probabilities by default except when the selected favorite team is playing. A small Show predicted winners switch on the Games card reveals the existing Hockey Lab and Polymarket probabilities for all games, with live/pregame labels unchanged. Its default is off; an explicit choice is saved in browser localStorage and reused after reloads and score refreshes. Changing or removing the favorite updates the exception immediately. With predictions hidden, non-favorite rows remove the odds markup and use tighter spacing while retaining scores, outcomes, model-inclusion badges, live status, recap access and goalie-pull context.

Validation: default off, favorite/no-favorite behavior, switching favorite teams, both probability sources, live labels, toggle reload persistence and 320/390/430px plus desktop fit. Representative mobile final rows shrink from about 125px with probabilities to 64px without them; favorite rows retain their expanded odds layout. No external API calls or nightly jobs are added.


### Daytime standings, result cues and recap navigation (2026-10-18)
Current standings use a validated official NHL standings snapshot attached to the existing public/scores feed. The score job refreshes this server-side companion on its normal runs, including a final refresh when the last game finishes; clients reuse their existing score-document read and update Current in place. The snapshot contains season, NHL as-of timestamp, fetch timestamp and complete team records. Invalid/partial data, different seasons, stale timestamps and games-played regressions fall back safely; historical views use historical snapshots. Records are replaced from official totals, never incremented from individual scores, preventing double counting and handling overtime/shootout points and goal differential correctly. Current rankings, playoff-position cues and collapsed summaries follow these records. Projected, play-control models and division-strength analyses retain their nightly inputs. NHL publishing and score-job timing still determine availability; this is not an instantaneous model rebuild. Failed fetches keep the last good standings snapshot and its original source timestamp.

Completed game previews highlight the winning abbreviation and score, dim the losing score, and explicitly state TEAM won beside Final/OT/SO. Live, postponed, tied or missing-score games receive no winner label. This adds no extra row and keeps the compact Games layout.

Who showed up, who didn't now has two team tabs, including each team's skaters and goalies. The favorite team is selected initially when present; otherwise the away roster is first. The tab bar stays sticky within the player section, below the mobile close header; changing teams returns to the selected roster's start when browsing farther down. Sorting and expanded hockey cards retain the selected team. Native tab semantics, arrow/Home/End navigation and visible counts are provided.

The recap's Game breakdown deck has six panels: The Battle, How it unfolded, Story of the game, Goalie duel, 5-on-5 lines, Style & shot map. It reuses the shared snap controller on phone and desktop, with arrows, progress dots, a small neighboring-panel peek and active-panel height. Inactive panels are inert. Story detail loads on selection; game-flow/line jump links select the relevant panel. The flow chart starts centered and retains its own horizontal panning. Style analysis and shot locations share one panel, with clear unavailable-data messages where needed. Players remain outside the breakdown deck.

Validation: backend snapshot normalization/failure tests; stale/malformed/partial/wrong-season/regression/historical safeguards; mid-session Current record replacement without mutating projections; repeated reads without double counting; phone widths 320/390/430 and desktop; REG/OT/SO result cues; full skater/goalie tab filtering, sticky reachability, sorting and expanded hockey cards; six-panel centered snapping, adaptive height, combined style/map, timeline centering and jump links. Existing score workflow successfully ran from the new backend commit; the long-lived older live run was restarted to prevent old-format writes.


### Compact recap sorting and period panel (2026-10-18)
On phones the four large sort pills are replaced by one native dropdown in the same sticky panel as the team tabs. The label names the selected roster (for example Sort DET players) and updates immediately on a team switch. Choices retain Game score, Points, Ice time and matchup-difficulty sorting; desktop keeps its existing buttons. The smaller control uses a 16px select font to avoid mobile focus zoom and retains the selected team, sort and recap scroll position after redraws.

Period by period is the second breakdown panel, immediately after The Battle. The deck now has seven panels; flow/story handling and game-flow/line jump links identify sections by name so insertion does not misroute them. Validated 320/390/430px sticky controls, selected-team labels, sort/redraw behavior, desktop presentation and all seven snap positions, including active-panel sizing and jump links. No data/model changes or additional API calls.

Mobile modal swipe decks now give the active panel the full horizontal width, with no resting preview of neighboring cards. Overview carousel peeks and desktop modal spacing are unchanged. Validated full-width alignment and seven-panel snapping alongside the compact team-aware sort controls.


### 2026-10-18 — Mobile Teams and recap clarity
- Teams: default to the favorite team (Detroit without a favorite); on phones reveal team/year controls from a compact button. Explicit team links and manual choices remain respected.
- Mobile Teams header descriptions, including inferred phase, move behind tappable info icons. Existing measurement explainers remain available; desktop keeps inline descriptions. Fit the hero ratings within narrow screens.
- Mobile recap How it unfolded shows chronological goals, running scores, assists and available NHL highlight links; desktop retains the chart. Three stars is the third recap panel, after Battle and Period by period.
- Overview final-game winners use bright text, score emphasis and a muted winner label rather than green text.
- Browser checks cover 320/390/430-pixel Teams layouts, favorites/Detroit fallback, manual selection, explainer dialogs and desktop, plus mobile/desktop recap deck navigation and goal links.


### 2026-10-18 — Stable recap carousel height
Recap carousel panels share the tallest natural height at the current screen width. Changing panels keeps the roster below at the same position and no longer automatically scrolls the modal. Content remains fully visible without an added inner vertical scroll area. Verified all eight panels at 320, 390 and 1280 pixels.


### 2026-10-18 — Teams mobile layout audit
Keep collapse controls within Teams header rows so they cannot squeeze following style panels or tables. Move descriptions after tabbed headers into their existing mobile info dialogs, including lazy-loaded cards. Stack core-player metadata and availability labels; use readable absence metrics and a bounded scrolling absence table with room for names and statuses. Desktop layouts remain unchanged. Checked rendered cards and browser behavior at 320, 390 and 430 pixels.


### 2026-10-18 — Revert reserved recap carousel height
Per owner feedback, undo the tallest-panel reserved height: recap panels again size to the active content, avoiding excess blank vertical space. Restore the prior panel-switch scroll behavior. Keep the Teams mobile layout fixes. Supersedes the stable recap carousel height entry above.


### 2026-10-18 — Logo placement and desktop/carousel reading surfaces
- Teams logo moves into the win/lose card headline; metric tiles use the released width.
- Desktop leaders, awards, divisional strength and recap panels have named navigation buttons and previous/next controls. Mobile keeps swipe/snap and progress dots; standings retain their desktop division tabs.
- Recap panels use a tall bounded reading area (65% of viewport, 360–660px). Longer panels scroll vertically with an overflow hint, while horizontal swipes switch panels. The roster position stays stable without reserving the longest story height. Switching panels starts the new panel at its top without scrolling the whole modal.
- Verify phone/desktop dimensions, all recap panels and access to their full content, desktop panel selection, and touch scrolling inside long panels.


### 2026-10-18 — Revert inner recap panel scrolling
Per owner request, recap panels return to their natural active-content height and the modal handles vertical scrolling. Remove the bounded panel height and inner-scroll hint. Preserve the Teams headline logo and named desktop carousel navigation. Supersedes the bounded recap reading surface above.


### 2026-10-18 — Teams logo simplification
Remove the foreground team logo from the Teams win/lose card header. Keep the team background logo and the full-width metrics layout.


### 2026-10-18 — Per-game season projection impact
- Overview: final, model-included games show each team's signed projected season-points change as an absolute-positioned micro-label beneath the team abbreviation. Card dimensions are unchanged, including favorite-team and predictions modes.
- Recap: Projection impact panel shows both teams' before/after season points, wins, shot xG for/against, scoring projection, playoff, division, Cup Final and Stanley Cup chances.
- Attribution is an isolated game replay from one nightly build: remove this game's result and shots, treat it as still unplayed, and hold all other results fixed. This is not a stored pre-game forecast or the entire night's change. A loss can improve ratings enough to raise expected points.
- Points/wins/scoring means are calculated directly from game probabilities. Future scoring/xG uses regulation-time rates; shootout tallies are excluded. Postseason games do not receive regular-season impact values. Odds use 10,000 paired simulations; tiny changes can be Monte Carlo noise.
- Backend uses already cached scored games, model inputs and remaining schedule: no added NHL or other external data-source calls. Reject incomplete schedules or standings mismatches. Team-model basis only; do not silently mix roster-model projections.
- Build up to 32 new/corrected games per nightly run, newest first; older recaps backfill progressively. Save durable per-game comparisons at hockey/impacts/{season}/{id}, with recent comparisons embedded in projections for previews and a compact incremental index restored nightly. Missing comparisons show an explicit pending/unavailable state.

Projection-impact validation uses 84 games per team for 2026–27 onward and 82 for earlier supported seasons. A manual Refresh game projection impacts workflow can recompute/publish from stored nightly inputs only, sharing the nightly concurrency lock and making no NHL calls.


### 2026-10-18 — Award totals, pace, Rocket Richard and Jennings
Award races now include Hart, Norris, Vezina, Calder, Rocket Richard and William M. Jennings. Scoring rows show current points, GP, points per game and point pace; Rocket ranks current goals with goal pace and points context. Vezina shows current GSAx and a pace preserving the goalie's current team-game workload. Jennings ranks teams by current total goals allowed, with GA/game and full-season GA pace; it explains the 25-GP individual goalie eligibility rule without claiming individual qualification.
Skater pace is current production + production per appearance × remaining team games, assuming the player plays every remaining game. The 2026–27 schedule uses 84 games; earlier supported seasons use 82. Prior-season views show Final instead of pace. Pace is a rate extrapolation, not a model forecast or award probability. The info dialog explains the method. Six panels share the existing swipe/snap layout and desktop named controls. Browser checks cover totals/pace math, Jennings ordering, mobile overflow/first-row alignment and desktop navigation. No additional data fetches or nightly work.


### 2026-10-18 — Award context and daily question
Award cards show the actual previous season trophy recipient and relevant totals with NHL source links. These are context, not thresholds for voted awards. WAR pace explicitly extrapolates measured current-season WAR per modeled appearance over 84 games (82 in earlier seasons); its tooltip states measured WAR, coverage and date. Vezina adds standard NHL SV% and GAA per 60 minutes from actual goalie shots and playing seconds, separate from model unblocked-shot rates. Nightly builds reuse the existing quality-starts goalie-log request: no additional nightly external API calls. A one-time refresh seeds official rates.
The First to Three question is next on October 19, 2026, computed offline from 3,936 cached regular-season games: first team to three won 88.1% of 3,450 qualifying games. Shootout attempts and games with neither team reaching three are excluded. The 11-question bank repeats automatically after its last entry.


### 2026-10-18 — Make game impact interpretable
Projection impact is the second recap panel. It explicitly separates earned standings points from the net full-season forecast change; winners whose outlook falls and losers whose outlook rises receive a visible explanation. Ratings changes affect the remaining schedule, so they can outweigh the benefit or cost of the result; actual standings points are never replaced by xG. Lower expected goals against is better. Checked saved DET–SJS 2026020127: DET won 4–3 SO, raw xG DET 3.353 / SJS 4.448, net projected points DET −1.20 / SJS +2.12.


### 2026-10-18 — Norris ice time and goalie WAR pace
Norris rows show average TOI in minutes per game; prior winners use archived season TOI/GP (Werenski 2025–26: 26.6, Makar 2024–25: 25.7). All five individual trophy races show current-season WAR pace where measured WAR and modeled appearances are available. Skaters use a full-season appearance rate; Vezina uses WAR per modeled appearance times projected appearances at the goalie’s current share of team games, capped at season length. Missing WAR stays unavailable. Jennings remains a team goals-allowed race without an invented team WAR. No additional external API calls.


### 2026-10-18 — Player career highlights and contract placement
Player profile modals now put the CapWages contract immediately below identity, before season stats. Career highlights show NHL-listed Stanley Cup honors with seasons, every listed individual trophy grouped by name and season, regular-season career games/points or goalie wins, playoff games, and series wins played in. Extra honors use an inner disclosure on phones. Career totals remain lifetime totals even when viewing an older season.
Server pipeline: extend the existing milestone player-page cache (schema 2) with awards, playoff career totals and all NHL playoff seasons; no second nightly player-page fetch. A one-time career bootstrap populated 745/745 modeled players. Historical NHL team/player game logs plus official playoff-series records are cached per season (2005–06 through 2025–26 on initial import); completed seasons are not re-downloaded nightly. A series win requires a positive game appearance for the winning team, deduplicated per series. Bench-only goalies, 2020 qualifying rounds and round-robin games are excluded. Missing season coverage yields unavailable, never zero. Cups use NHL-listed honors, separately from game-participation counts. Published as hockey/careerAchievements (~305 KB), fetched once on demand by the client; no NHL client requests. Built after milestones and published nightly; historical playoff cache only refreshes while its season is current.
Validation: pure tests for participation, duplicate games, losses, qualifiers, incomplete series and missing coverage; mobile/desktop modal tests and actual published Crosby (3 Cups, 20 series wins) / Vasilevskiy (2 Cups, 16 series wins) checks.


### 2026-10-18 — Compact career badges
Player modals display only icons and ×counts for earned Cups, playoff series wins played in, and individual honors near the identity. Touch/click, keyboard focus and hover reveal labels without adding permanent text. Zero and unavailable achievements add no badge row. The full Career highlights section remains intact, moved to the bottom immediately before footer actions, after stats and analysis. Contract information remains near the top. Async career loading updates both representations.


### 2026-10-18 — Feed controls and deck behavior
Feed omits the global team/year picker entirely. Watched teams start as one compact horizontally scrollable logo row, expanding to reveal team management and the add selector; management stays expanded through add/remove redraws. Feed decks share Overview swipe styling, initialize every instance, scope arrows and division selection to the containing card, and retain active panels per saved widget through redraws. Add/action menus are measured at their final width and centered in the visual viewport, updating on viewport changes; long lists scroll within visible bounds. Lifted previews use the space above the menu without displacing it.


2026-10-18 guided trade and Coaches release: the redesigned Coaches page is now #coaches, with #coaches2 redirecting and a single Coaches tab. Original renderers remain only for saved Feed widget compatibility. All six dimension ratings, measures and 80% ranges are visible in a flat responsive grid; a responsive career-results chart includes tenure bands, accessible/tappable season bars and season explanation dialogs. Results are standings-point pace differences expressed per 82 games, not points already lost or forecasts. In-progress estimates disclose approximate sample size; career shrinkage and tenure weighting are distinguished from raw team-season values. Widgets start expanded on new visits, ignoring previous saved collapsed preferences; current-visit collapse controls remain. Team report data disclosures start open.
Trade explorer opens Guided by default for a new empty deal, with Manual preserving the prior editor and loaded deals. Seven goals cover outgoing/incoming targets, younger roster, current-season improvement, expiring UFAs for futures, positional upgrades and style fit. Goal-driven candidate search returns up to three alternatives, reusing evaluateTrade, availability, market prices, headliner, destination and cap checks. Automatic goals protect unavailable outgoing pieces; explicit move-out permits the owner's chosen piece. Search is bounded and cancellable, shows fewer candidates honestly, exposes cap gaps, invalidates stale inputs, and hands selected IDs to Manual for review. Incoming-player goals offer distinct outgoing packages. UFA goals require known one-year UFA terms and no known extension; public extension years are explicitly checked. Automatic goals permit at most 0.5 wins of long-term value loss to pursue the selected objective, disclosed in the search explanation. Goal ranking does not change player valuations or asking prices. Existing public contractTerms is included in the hosting fallback (no salary or owner edits), enabling guest UFA eligibility.
Verification: focused regression checks cover all seven goal filters, unavailable candidates, unknown/extended UFA exclusions, age/position constraints and annualized coaching explanations. Real-snapshot browser checks returned three alternatives for each goal, exercised Manual handoff, selection preservation, no-match/blocked target, cancellation, searches and route aliases; mobile widths 320–1280px fit without page overflow.
## Teams report (2026-10-18)

The Teams tab now opens the redesigned report; #teams2 redirects to #teams. The header combines identity with compact playoff-odds, projected-points and momentum badges. Momentum opens the detailed game-by-game chart and comparison. At a glance separates the record/points/5v5 share from model ratings. Strength of schedule appears above Behind the record, whose Read reconciles current standings, season chance quality, schedule context and the existing projection.

The roster chapter retains best-player previews with same-season WAR and position-specific production, strength by position, original side-by-side line/player tiles, the selective age-and-tenure core shortlist, and visible man-games lost with NHL ranking on each summary metric. The outlook retains visible draft assets/prospects and recommended GM trades with their explanations, plus rest/travel, the trade explorer and franchise sandbox. The league-wide statistics table and absence bar chart are omitted from the team report. Saved Feed widgets remain compatible.

Core and form are descriptive/editorial presentations documented in the model inventory; trade valuation and availability formulas remain unchanged. Feed cards no longer collapse, and watched-player cards show season totals above pace without G−xG.


## Mobile navigation and Front Office 2 release (2026-10-18)

Players replaces the separate Skaters and Goalies tabs, with internal group controls, prominent name/team search, position filtering, sorting and show-more controls. Phone summaries expose ratings and season production, ice time and measured same-season WAR without horizontal scrolling; desktop keeps a comparison table. Goalies for the globally selected team stay first for every sort and are highlighted. The remaining results preserve the selected ordering; rank labels reflect the sorted result set. Old Skaters and Goalies links select the corresponding Players group.

The compact expandable team/season control is shared across the site. Coaches uses searchable six-dimension summaries on mobile and a comparison table on desktop. Existing coach metrics and profiles are retained.

Teams now groups shot maps beneath Style & strategy after the roster; the standalone Shot maps tab is removed and #shots opens the integrated section. Heat maps and individual shots retain their controls, data sources and definitions. Header classification, playoff odds, projected points and momentum badges open detailed explanations. The age-of-scoring history also appears in the roster section, with NHL comparison and a season-by-season list; historical views exclude later seasons. The redundant Teams helper sentence is removed.

Front Office 2 (#office2) is a separate mobile-first preview; the original Front office remains available. It starts with GM-era selection, separate drafting/pro-scouting/trade grades, and the decisions behind each dimension. It includes bootstrap ranges where published, developing/estimated distinctions, trade-detail modals, coverage/method notes and scoring-age history. It preserves the original grading thresholds and trade-net accounting and does not invent an overall GM grade. Eras without recorded decisions show an empty state.

Front Office 2 follow-up (2026-10-18): default to the rolling five calendar years ending at the trade snapshot date, across GM tenures. GM/all-era selections override the window. Drafts use June 30 of their draft year. Window totals sum individual decisions; published GM-era draft/scouting grades and bootstrap ranges are not reused for this subset. Trade previews identify the principal player (largest absolute estimated/recorded WAR), or highest-round pick when no player moved, before date and partner.

2026-10-18 mobile review release: Teams header badges stay on one horizontally scrollable rail; roster strength is expanded as one card with readable player/value rows, assets alongside it and verified prospect positions. Absences include a header NHL rank. Style uses one offense/defense selector and direct card hierarchy. Rest/travel now has a bundled fallback plus explicit empty/error states. Four forward slots include observed low-usage units or a clearly labeled remaining-forward rotation (no fabricated trio statistics); defense pairs use the busiest player's TOI/GP for the selected view. Lines prefer newer bundled artifacts over stale database copies. Data-builder regression covers twelve- and eleven-forward games; prospect metadata joins official NHL draft year, slot and normalized name.
Players pin the selected team's best two matching skaters for the active sort, preserve league ranks and highlight those rows; goalie pinning remains. Labels use TOI and Save percentage. Front Office uses the new page at #office; #office2 redirects, original renderer remains only for saved Feed widget compatibility, and Explore trades is restored.
Coaches 2 remains a separate #coaches2 mobile preview: selected-coach profile, strongest/lowest dimensions, one dimension selector linking measured value/rating/80% range with recent season rows and ranked comparisons. Search, current/historical scope, coach selection and show-more pagination work at all widths. Existing coach model values remain unchanged; career associations are explicitly distinguished from causal coaching effects.

2026-10-18 guided trade and Coaches release: the redesigned Coaches page is now #coaches, with #coaches2 redirecting and a single Coaches tab. Original renderers remain only for saved Feed widget compatibility. All six dimension ratings, measures and 80% ranges are visible in a flat responsive grid; a responsive career-results chart includes tenure bands, accessible/tappable season bars and season explanation dialogs. Results are standings-point pace differences expressed per 82 games, not points already lost or forecasts. In-progress estimates disclose approximate sample size; career shrinkage and tenure weighting are distinguished from raw team-season values. Widgets start expanded on new visits, ignoring previous saved collapsed preferences; current-visit collapse controls remain. Team report data disclosures start open.
Trade explorer opens Guided by default for a new empty deal, with Manual preserving the prior editor and loaded deals. Seven goals cover outgoing/incoming targets, younger roster, current-season improvement, expiring UFAs for futures, positional upgrades and style fit. Goal-driven candidate search returns up to three alternatives, reusing evaluateTrade, availability, market prices, headliner, destination and cap checks. Automatic goals protect unavailable outgoing pieces; explicit move-out permits the owner's chosen piece. Search is bounded and cancellable, shows fewer candidates honestly, exposes cap gaps, invalidates stale inputs, and hands selected IDs to Manual for review. Incoming-player goals offer distinct outgoing packages. UFA goals require known one-year UFA terms and no known extension; public extension years are explicitly checked. Automatic goals permit at most 0.5 wins of long-term value loss to pursue the selected objective, disclosed in the search explanation. Goal ranking does not change player valuations or asking prices. Existing public contractTerms is included in the hosting fallback (no salary or owner edits), enabling guest UFA eligibility.
Verification: focused regression checks cover all seven goal filters, unavailable candidates, unknown/extended UFA exclusions, age/position constraints and annualized coaching explanations. Real-snapshot browser checks returned three alternatives for each goal, exercised Manual handoff, selection preservation, no-match/blocked target, cancellation, searches and route aliases; mobile widths 320–1280px fit without page overflow.


2026-10-19 Teams cap integration: the standalone Cap & trades navigation entry is removed; #cap redirects to Teams and scrolls to its Cap & trades section. Four focused panels preserve the existing cap outlook, contract fields and source/edit actions, trade block/reporting, asynchronous War Room and buyers/sellers, and league cap comparison/paste tools. Phone layouts render every table field as labeled rows, with sorting and contract search; desktop tables remain. Existing public/private access and valuation/cap rules are unchanged. Current cap space appears in the single-row Teams badge rail, using teamCapOf and the current season ceiling, with a source/date explanation and link to the cap outlook; missing data stays unavailable.
Guided player-specific trades add a package preference step: receive futures, roster players, or a genuine mix for move-out; send those categories for move-in. Candidate construction and final filtering both enforce the preference without changing trade valuations or acceptance checks. Verified all six direction/preference searches on the real public snapshot, selection/back navigation and phone fit. Public/owner fixtures verify preserved contract fields, edit/paste actions, search/sorting, asynchronous market tools, cap badge modal/link and four-panel fit at 320–1280px.

2026-10-19: Front Office defaults to the rolling seven calendar years ending at the decision snapshot date, across GM tenures. Labels and decision cutoff both use seven years; explicit GM/all-era selections still override the window. Regression verifies inclusion of 2020 decisions and exclusion of 2018 at the October 2026 snapshot.

2026-10-19 mobile density follow-up: team header badges form a balanced two-row grid on phones. Contract rows show player/cap hit, position/end/status and a compact Details disclosure; all original fields, player links and owner edit/source controls remain inside. Closed rows are under 105px, roughly one quarter of the previous full-field cards. CapWages remains the primary teamCapOf source; the owner league comparison now also leads and sorts by that primary figure across all available teams. Pasted current and projected values remain explicitly labeled fallback/comparison fields. Mobile widths 320–1280px, disclosure controls and conflicting CapWages/pasted figures verified.

2026-10-19 Feed personalization: labeled Feed teams logo tabs select one active team, retained per device. Team-specific widgets and watched-player cards filter to it; league-wide cards remain. The team list combines explicit follows, the signed-in favorite (always included), saved team cards and watched players’ current teams. Follow teams separately opens management; favorite is labeled and cannot be removed there. Saved items remain intact when filtered. Favorite account-sync changes refresh Feed. Followed-player rows in leaders and trophy races use their own team accent and logo. Team cards in Feed carry scoped team colors and a top-right logo; Teams cards expose visible Feed actions, including scoreboard/model cards whose eyebrow is their stable widget title. Add/remove and legacy widget extraction remain supported.
Contract profiles: Model market cap hit uses the existing marketSalary curve and current multi-year player-value rate, with source date/model. Annual value grades compare actual current hit (CapWages first) to that estimate: A >=25% below, B 10–25% below, C within 10%, D 10–25% above, F >25% above. These are new presentation thresholds, not changes to market pay, trade values or acceptance. Explicitly not a full-term/clauses/future-decline grade or a reported offer. Missing/invalid current hit or player value stays ungraded. Current unsigned contracts cannot borrow an expired deal’s cap hit.
Verification: favorite defaults/guest isolation/grade boundaries and missing values; isolated signed-in browser fixtures exercise logo/team filtering, favorite management, league rows, scoreboard add/remove/re-add, team card branding, estimate method and phone/desktop widths 320–1280px. Existing focused regressions pass; screenshots inspected.

2026-10-19 badge correction: restore small rounded chips with inline label/value and natural wrapping. The prior two-row tile grid is superseded; chips keep their original compact shape and wrap as width requires. Verified 320/390/519px: no badge overflow, chip height under 38px, rounded pill shape.

2026-10-19 Feed controls and freshness follow-up: visible plus buttons on Teams are removed; tap-and-hold remains, with a visually hidden keyboard-accessible action. NHL is an independent toggle for league-wide widgets, alongside zero or one selected team. A team click replaces the prior team or clears itself; NHL toggles without changing the team. Filters persist locally. Adding a team widget selects its team without disabling NHL; adding a global widget enables NHL without clearing the team. Empty filters explain how to select a view; filtered cards remain saved. This supersedes the earlier exclusive Feed-tab behavior.
Optimistic Feed writes reconcile account snapshots rather than being overwritten by older snapshots. Pending additions, removals, following and ordering stay visible until acknowledged; object field order and server editedAt do not affect acknowledgment. Failed saves roll back and show a retry message. The selected filter is updated immediately on add, so opening Feed shows the new widget without refreshing.
The team games block now stacks Last Game first and Next Game second. Both use the exact Overview game preview renderer and recap IDs; rendering supports supplied preview days without changing the shared scores document. Last game selects the latest completed score, falling back to published team game history. Next game skips finished/postponed games and selects the earliest current/future matchup from scores or the published schedule. Missing start time is TBA; missing games and historical-season views are explicit. Schedule/history loads refresh the block in place.
Verification: focused tests cover filter combinations, favorite defaults, stale add/remove snapshots, acknowledgment key ordering, failed-save rollback and last/next selection. Browser fixtures exercise actual pointer hold and immediate Feed navigation without reload, NHL asset loading, both preview markup equality with Overview, recap IDs, and 320–1280px layouts. Existing player/coach/office/team/trade regressions pass.

2026-10-19 Feed audience correction: filtering, logo-tab discovery, item colors/corner logos and source labels now share content-level audience resolution. New hold-to-add saves explicit audienceTeam metadata (team abbreviation or NHL), separate from the renderer’s saved focus. A team/player tile saved from a league card gets its own team; the entire league card stays NHL. Team-specific recommendations retain the viewing team’s context. League cap comparisons, buyers/sellers, Inside Scoop and coach comparisons stay NHL even when saved from a team-oriented tab. Existing saved entries are resolved from stable team/player child IDs, legacy named player tiles, named team titles and known league-card identities; no account migration or re-add is required for these supported legacy records. Rendering old team entries without focus uses their resolved team.
Tile compatibility: transient followed-player styling is excluded from piece identities and normalized on legacy reads/matches. Direct data-player/goalie/team attributes participate in piece IDs; old named IDs remain supported. Isolated saved tiles receive a heading and render without initializing carousel controls absent from their extracted content.
Verification: classification fixtures cover explicit audiences, old Overview team/player tiles, named legacy cards, team-context recommendations and league comparisons with a saved team focus. Browser tests restore and remove/re-add an old highlighted player tile, contrast a DET points-comparison tile with its NHL whole card, audit current page card categories, and verify matching team logos/colors and no missing-card/carousel errors at 320–853px. Existing regressions and independent filter/no-refresh/preview checks pass.


2026-10-19 mobile, account and identity release: the supplied Other Score artwork is the site logo, favicon, manifest icon and Apple touch icon, with new asset filenames to avoid stale icons. Pats Dash uses the same launcher artwork. The account person icon opens personal navigation/preferences and sign-in/out actions; signed-out visitors have a prominent Create account button. Mobile team chips use smaller wrapped pills across the full identity width. Feed no longer reserves the hidden team picker’s loading space. The shared On the scoreboard card adds playoff probability and projected final points; saved Feed versions use the same current renderer. Feed Last/Next Game headings include weekday and published game time in Eastern time; missing start times say Time TBA. Mobile watched-player pace explanations use a tappable About stats tooltip; desktop retains the full note.

Admin Users is restricted to the verified owner, separately from read-only admin access. It includes every Firebase Auth account, including zero-Hockey-activity accounts, with a search, 7/30/90-day visits, visible seconds, session count, last activity and section breakdowns. The sanitized private Auth directory refreshes at Hockey deployment; Hockey sign-ins upsert their own profile. Previous anonymous visits cannot be attributed to accounts. Account activity starts with this release, respects Do Not Track, counts foreground time rather than attention, and is kept separate from anonymous visits. No password hashes/tokens or directory files are published to Hosting.

Installed Hockey supports pull-to-refresh at page top; Safari tabs retain native browser behavior. Dashboard, Cadence, Momentum and Plants use the shared hosting helper, including top-of-panel handling for Cadence/Momentum and service-worker update checks for offline apps. Deploy scripts reinstall the helper after app copies/builds; Plants precache revisions include the changed shell/helper.

Validation: existing focused player/team/coach/office/trade/Feed regressions; isolated browser fixtures at 320–1280px for account menu/signup/preferences, zero-activity user search, owner/read-only access, compact header, saved Feed forecasts, weekday/time and mobile tooltip; emulator checks for private directory/activity reads, self-only profile/activity writes and spoof rejection, plus preserved anonymous logging. Shared refresh tested for top-level/panel scrolling, threshold/release/cancel, horizontal gestures, input/dialog/list exclusions and browser exclusion.


2026-10-19 header/scoreboard follow-up: registration is now available only inside the person-icon account dropdown; no external Create account CTA reserves or overlaps masthead space. The header uses natural grid rows for season/account, logo/title and data freshness, with no status/season loading min-heights. Sign-in leaves data metadata intact, and ordinary renders restore the season/freshness text. Feed’s compact class updates on every tab transition, not only initial load. Feed team logos sit in the source/options row, removing the extra 42px card-top reserve; game block margins no longer add another 28px. All five scoreboard measures use one shared tile grid in Teams and saved Feed cards; normal mobile widths show five across, with a readable wrap on phones at 360px or below. Values scale to actual tile width, including two-column desktop snapshots. Verified sign-in/back round trips, guest menu-only signup, Feed navigation spacing, saved card updates, common-row geometry and overflow at 320/390/519/853/1280px.


2026-10-19 richer Overview previews and exploration: every League leaders category now adds supporting facts. Best forwards show current points, points pace, measured same-season WAR and TOI; defensemen add season impact/workload, defensive specialists show explicitly blended block and PK rates. Goalies distinguish official SV%/GAA when available from model unblocked-shot rates. Shooting cards show goals, xG, volume and labeled model-shot percentages. Team cards show records/points and relevant per-game rates. Desktop lists are centered; mobile facts wrap. Stable piece signatures and bracket widget keys preserve saved Feed cards.

Games has earlier/later arrows paging three-day windows and a Today reset. Past dates use published game records, with static team archives as fallback; future dates use the published remaining schedule. Unknown start times/frozen odds are not fabricated, and archived-data context is disclosed. Standard live dates retain score updates and the shared Overview/Feed preview renderer.

Bracket exploration loads recorded projection dates. Existing historical documents contain team projections but no full bracket odds: their first-round seeds are reconstructed using that date’s projected points and season division membership, with missing odds/later rounds explicitly omitted. Complete archived brackets are displayed when present. Generate a bracket fetches the latest published projections and samples winners from series probabilities while holding projected playoff seeds fixed. Later-round odds use the published ratings and the same playoff Poisson/best-of-seven home-ice order as the model. It is labeled a possible playoff run, not a new season forecast. First/second/conference/final rounds reveal in order; reduced-motion users get immediate results; reset restores the published favorite path. No model data is overwritten.

The resultDrivers card is titled “PDO benders · finishing & saves,” with an explicit distinction between xG-adjusted finishing/goaltending and classic shooting% + save% PDO. Existing methods and values remain unchanged. Tests cover category/pace/season/rate correctness, nine boards and saved pieces, date navigation, historical gaps, probability/winner continuity, reset, animations, desktop centering, and phone/tablet/desktop overflow.

### Contract market scenarios (experimental, October 19, 2026)

Player profiles and Inside Scoop share the comparable-signing market card. Readers can choose term, UFA/RFA-equivalent rights and re-signing/new-team context, inspect up to five actual signings, and see a market discount only for a supported matching-term comparison with known actual cost. Uncovered players and weak scenarios explicitly show unavailable estimates. The card labels its limited retrospective evidence and model/signing dates. This release replaces public fixed-WAR letter grades and the old Inside Scoop lifetime dollar-surplus display; it does not replace the trade engine or add a future contract-quality model.

### Market value never blank (2026-10-22)

Contract sheets always show a market AAV. When the comparable-signing model has too few close comps for the chosen rights/term/club scenario, the card is titled "Modeled market AAV" and shows the league-wide model's price with an 80% range, a sentence explaining why comps weren't used and the typical term for similar players, and "Show the N nearest signings (too few to price on their own)". The stale-comps coverage warning is shown only for comp-based prices. Model and data details report the fallback's out-of-time error against a position-and-term median baseline. The default scenario prefers a comp-supported one when available. Details: model inventory, "Market value fallback: never blank".

### Draft statuses (2026-10-22)

Front office draft lists label each pick: "developing (no penalty yet)", "on pace", or "left the NHL (final)". "Biggest misses" lists only final picks (window complete or left the NHL), so prospects still developing — e.g. defensemen and goalies inside their longer 8- and 9-season windows — never appear as misses. Caveat text explains the windows and the no-penalty rule.

### Defensemen's defense credit (2026-10-22)

WAR-lite counts 50% of a defenseman's 5v5 goals prevented (forwards 30%), after an out-of-season test showed it predicts next-season games better. Every WAR-based view moves with it: player cards, award races, trade values and market comps inputs, strength by position, core players, roster simulation, draft grades (rebuilt now) and the monthly front-office models (next run). WAR explainers and the methods dossier state the split.

### Market card default rights (2026-10-22)

The contract card's market scenario opens on the rights the player will have when his current deal (or signed extension) ends: entry-level → RFA; otherwise CapWages' expiry status; otherwise age at the end of the deal (26 or younger → RFA). Then it prefers re-signing, comp-supported prices, and the term closest to his remaining years. Viewers can switch rights, term and club context.

### Trade explorer player facts (2026-10-22)

Every player piece in the manual trade explorer and in guided trade options shows: age; this season's production and last season's (skaters GP, G, A, P; goalies GP, SV%, GSAx); and the contract — cap hit (CapWages when available, else the contracts list, "(est.)" when estimated), last season of the deal, years left, entry-level, and any signed extension. An expired deal reads "last deal ended … no contract on file". Last season's numbers come from the archived league file, loaded once when the explorer opens. Picks and prospects keep their existing descriptions.

### Star premium in trade value (2026-10-22)

Trade value treats elite players as worth more than their WAR adds up to: each season's WAR above 3 counts 1.5× and above 4.5 counts 2× (owner judgment; on by default). The Admin Model switches card has a Star premium on/off control with a note that it's a judgment rather than a measured result. The How? sheet shows "★ +x star" under projected wins for each season it applies. Playoff odds, expected wins and the cap bonus are unaffected.

### Trade explorer prospect and pick facts (2026-10-22)

Prospects in trade options show position, age, draft year and slot, and their source: on the NHL's official prospect list, or "not on the NHL's prospect list: rights assumed from his draft, he may be unsigned or released". Both say the value comes from the draft slot only (expected wins over a typical pick's first seven seasons, arrival in seasons), with no junior, European or AHL stats or scouting (since later on 2026-10-22, listed skaters are valued from their scoring too: see "Prospects valued from their scoring"). Picks show the projected slot and expected wins. In the manual list the basics stay on the first line and only the source and valuation line is added.

### Guided trades: fair for both sides (2026-10-22)

Guided options must be acceptable to the partner (package ≥ their price, headliner, cap) and fair for the focus team (long-term value ≥ −0.5 wins), including when the user names the player to move or acquire. Moving a player out searches one-, two- and three-piece returns (three from each partner's best five eligible pieces). If no fair deal exists for a named player, the page says "No fair deal found", gives his trade value to the focus team, and shows up to three closest offers, each labelled "Below his value to DET: −x wins long term".

### Prospects valued from their scoring (2026-10-22)

A drafted skater on the NHL's prospect list is valued in trades and on the Teams prospects list from his draft slot plus his scoring since the draft in every league (translated to NHL-equivalent points per game), his age at the draft and position (hockey-models prospects.py; tested against slot only, see the model inventory). Trade options show his last completed season ("2025–26: SHL 52 GP, 40 PTS · 0.38 NHL-equivalent points per game"), the resulting expected wins over his first seven seasons (eight for defensemen) and what his slot alone would give. Goalies, undrafted players and draftees not on the NHL's list keep the slot-only value and the old wording. The How? sheet shows the same line. Data: assets.json `prospects[].prod`, refreshed nightly from NHL player pages cached about a week.

### Feed and Teams speed (2026-10-22)

The Feed keeps each saved card's drawn HTML between visits and redraws it only when something it could show may have changed: a data-change counter goes up on every database answer (reads, listeners incl. live scores, sign-in), every data file loaded, and every redraw that isn't a plain tab switch (edits, settings, data landing); cards also expire after five minutes. Database writes don't count (their effects return through listeners), and a listener counts only when its delivery differs from the last one for the same target (the live-scores listener re-opens on every Overview/Feed visit). `hockeyFeedCache()` in the console lists the last 20 reasons. On a miss, only the first three Feed items are drawn with the page; the rest show a placeholder and are drawn one source tab per idle step, then a redraw from the cache shows them (abandoned if the reader leaves or data changes; waits while a card is held or dragged). Each source tab is drawn and parsed once per Feed redraw and shared by its cards. Teams' goalie shot-type profiles are computed once per goalie list instead of once per goalie. Display is unchanged.

### Players tab: search all teams; rostered players who haven't played (2026-10-22)

A typed search (2+ characters) looks across all teams even when the team filter is set (the filter defaults to the favorite team); a line says the filter applies again when the search is cleared. The list also includes anyone on a current NHL roster or injured list who hasn't played this season (from the nightly NHL rosters in hockey/injuries), marked "hasn't played this season (injured reserve / hasn't dressed yet)" with last season's GP, goals and points (goalies: GP, SV%, GSAx). Players on no NHL roster stay off. The count line notes how many are yet to play.

### Standings when games end (2026-10-23)

The current standings update within about a minute of a game ending: the game-night live job runs the scores job (final score and the NHL's official standings) as soon as a game leaves live play and again ~3 minutes later, and the Overview re-reads them ~45 seconds after the game drops out of the live feed. Projected standings, playoff odds and models still update with the nightly build.

### Traded players' current team (2026-10-24)

A player's team resolves the same way on every view: CapWages (nightly, follows trades the next morning), then the NHL's current rosters (nightly), then game data and player values (which can trail a trade until he plays for his new team or the monthly rebuild). Applies to player values, player details, the Players list, the trade explorer pool and profiles. Profiles of players with no games this season show last season's numbers (skaters GP/G/P; goalies GP/SV%/GSAx).

### Oct 25 QA bug sweep (2026-10-25)

Recap Great game / Rough night tags require a positive / negative game score. The chosen team is remembered across reloads (localStorage tos-focus). Prospects "+ N more" is an expander. Public copy doesn't reference the owner's private lists, edits or analytics. Searches (Players, trade explorer, guided) redraw once typing pauses. GM moves read "for … · ±x wins of trade value"; the Why text speaks of expected wins (a different, unweighted measure). The Front office period persists across team switches. A player's team resolves to CapWages, then NHL rosters, for this season's game rows too, so traded players appear with their new team in strength, best players and shot-map pickers. Players on NHL contracts with no games yet (injured, suspended, waivers) are in the trade explorer pool. Explorer facts use official games played. Rest and travel lists only games still to play. A market AAV at the league maximum (20% of the cap) says so.

### Tab switches (2026-10-26)

The tab you leave keeps its finished page in memory (the page itself, so open panels, carousel positions and drawn charts stay as they were). Coming back shows it again when nothing it shows has changed: same data (every database answer, data file and redraw that isn't a plain tab switch counts as a change), same team, season, account and phone/desktop width, under three minutes old, and not still loading (skeletons, or the Teams GM-move search, which stops when you leave and reruns on return). Live-score updates during games invalidate only Overview and the Feed. A tab is drawn fresh otherwise, exactly as before. Tabs show a pressed state on touch-down. Overview's standings, leaders, award races, Inside Scoop and milestones use `content-visibility: auto` (laid out when near the screen; they remember their height). Teams builds its trade pool once per draw. `hockeyViewCache()` in the console lists the kept pages. The Teams GM-move search yields every ~25 ms (it checked every 128 deals, so a slice could block taps ~470 ms) and keeps running when you switch tabs until the team or an input changes; its result is written into the kept Teams page. Measured locally, laptop: back to Overview 16-24 ms including layout (was 57-85 ms before layout); 26 ms at 375 px; Teams cold 67-71 ms (was 73-84).

### Oct 26 bug sweep (2026-10-26)

Trade block (scripts/block.py): a player drops off when his team changes, using the contracts list's team when he's on no NHL roster (suspended, holdouts: B176, Hellebuyck); a contract with his own team ("signs X to a one-year deal", "holdout ends") or the club refusing ("chose not to fulfill") counts as staying, and a staying or traded report as new as the latest trade report ends the entry (B168, Nikishin). The site also hides a news-only entry whose player's current team differs, until the nightly drops it. Pick notes (scripts/assets.mjs): a comma Wikipedia dropped between a linked name and a pick phrase is restored, and notes over 320 characters end at a word with an ellipsis (B173). Players: yet-to-play rostered players are also named from CapWages, and the list redraws when last season's league file lands (B177). Not reproduced and asked for details: B178 (no EDM-VAN 6-3 game exists), B179 (the season table was retired 2026-10-19); B174 not a leak (signed-out reads are refused; the QA browser was signed in as the test account, which sees its own reports).

### Bracket controls (2026-10-26)

Generate bracket, the snapshot arrows, the snapshot date picker, reset and the snapshot list arriving redraw only the bracket card on Overview (refreshBracket), so the bracket stays where it was; on the Feed the page redraws as before.
