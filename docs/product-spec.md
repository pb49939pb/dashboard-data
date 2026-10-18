# Hockey Lab: product spec

A living spec for patrickreidbaldwin.com/hockey. It covers who the site is for, everything it does, and where every number comes from. It's maintained by hand next to the code and updated with every feature change. When the page opens it, the appendices are generated from the running code: recent changes, the model list and (for the owner) the data-jobs catalog. How the models work is in the companion **Methods dossier**, and each model's scorecard is on the Model tab.

Last reviewed: 2026-10-16 (CapWages)

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
- **Hockey Lab / Today** (top of Overview): "What do the numbers say?", up to three short rows built nightly by fixed, tested rules:
  - last night's biggest scoreboard-vs-chances surprise;
  - a team winning more than its 5-on-5 chances suggest, or an honest "too early" note;
  - the Question of the day.
  
  Each row links to the evidence. Never generated text, never a prediction.
- **Recent games:** scores with pre-game model odds vs the Polymarket moneyline. During games:
  - the clock, score and strength update about every 20 seconds;
  - live win odds update every 5 minutes;
  - a **goalie-pull advisor** appears for a team down one or two late in the third: too early, in the window, or past it, with the chance to tie. It's a decision aid from league-wide rates, not a prediction.

  Each game opens a full **game recap**.
- **Projected final standings:** 10,000 simulated seasons, with playoff, division and Cup odds (with simulation errors), the projected playoff bracket and strength of schedule. Past seasons show the final standings and bracket instead.
- **Current standings, Team stats and division strength.**
- **Points from the chances** (shot-quality standings): each team's points if every shot had gone in at its expected rate, with the shots held fixed.
  - Shows a 90% range and a plain read (in line, ahead of or behind the chances).
  - Deliberately not "deserved" and not a forecast; the half-season test is published on the card.
- **Shooting and save luck at 5-on-5:** PDO, finishing and goaltending vs expected for every team, next to 5v5 chance share.
  - Read as running hot, normal or running cold.
  - Shows how much each piece repeated from the first half of a season to the second, instead of "who's due" claims.
- **Who's controlling play:** xG share.
- **Award races:** the leaderboards each award is argued on (Hart, Norris, Vezina, Calder). Leaderboards only; no award predictions.
- **Milestone watch:** the next round-number career milestones in reach (500 goals, 1,000 points, 300 wins, 1,000 games…) with the projected game at each player's pace, plus milestones reached this season.
- **Leaderboards:** best goaltending (GSAx), hot finishers, the snakebitten, most dangerous shooters, best forwards, defensemen and top defenders.
- **Question of the day** (footer link, every tab): a pop-up answering one hockey question a day from our own play-by-play, starting Oct 15, 2026. Ten questions rotate in order: pulling the goalie, faceoffs, fights, two-goal leads, back-to-backs, scoring first, leads after two, the most dangerous shots, goalie luck, power-play timing. Each shows a headline, one chart, a few sentences, the method and the sample. It's built to screenshot, and earlier questions can be paged back.

### Game recaps
- **Deserved-to-win odds:** every shot replayed 10,000 times.
- **Game flow:** xG flow, the turning point (the goal that moved win odds most) and three stars by game score.
- **The story of the game** (tap to open): the game in order, mobile-first.
  - Every goal, with the score, scorer and assists, power play or shorthanded, the scoring team's win odds before → after, and both teams' five skaters on the ice.
  - Each team's best five-minute stretch and a line at the end of each period.
  - The on-ice data loads only when the section is opened.
- **Lines and storylines:** who was on the ice for each goal, matchup difficulty from shift charts, storylines (including "rough nights" judged by expected ±), and box scores with an expected ± column.

### Teams (pick any of 32)
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
- **Explore trades** (owner gets the full version): build any deal (players, picks, prospects, from several teams) and see:
  - wins this season and long-term value by each team's window;
  - the other team's verdict and EA-style value bars;
  - the "How?" sheet with every input (projection ranges, roster fit, contract bonus, cap shadow price, availability and premium);
  - a real cap check from CapWages (compliant with each team's room left, over the ceiling by how much, or unverified with the reason), a feasibility checklist (contract rights, no-move and no-trade clauses from CapWages, the CBA's retained-salary limits, conditional picks, reported availability, price), a real-trade comparison and playoff odds before and after.
  
  Best trades for a team are also listed.

- **My franchise (prototype):** make any deal the trade checker passes, then see your moves, the combined wins this season and playoff odds before and after for you and your partners.
  - Saved in your browser.
  - Each deal is valued against today's rosters; free agents and lines aren't built yet.

### Skaters
- **Ratings and stats:** ratings (offense, defense, usage, overall, 40–99 within position) and stats (xG, goals above expected, expected ±, ice time).
- **Contracts in lists:** every player list shows his current contract beside him (cap hit, final season, clause, extension; "Contract data: CapWages"): Teams (best players, core players, strength by position, style fits, GM moves), the trade explorer's player lists, and sortable Cap hit / Thru columns on the Skaters and Goalies tables.
- **Player cards:** ratings, WAR-lite value, system fit, the contract line (cap hit, years left, UFA/RFA, clause; "Contract data: CapWages") and the owner's private scouting note. Goalie profiles carry the same contract line.

### Goalies
- **Goalie stats:** GSAx and shooter-aware GSAx, ratings by shot type, with fewer-than-100-shot cells faded and 90% intervals.
- **Profiles:** goalie profiles and the all-goalies-by-shot-type grid.

### Coaches
- **Coach report cards:** results vs roster talent (shrunk, with bootstrap ranges), labelled as coach-associated residuals.
- **Coaching-change tests:** coaching changes and carry-over tests.

### Shot maps
- **Maps:** a heat map (for or against, by strength, xG or goals) and every shot as dots, by team, player or game.
- **Shot-danger explainers:** "What makes a shot dangerous" and "Distance matters most".

### Cap & trades (owner only)
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
- **Explainers:** "How Hockey Lab works", and each model's when, inputs, what it does and where it's used.
- **Scorecards:**
  - xG folds (train 2023-24 + 2024-25 → test 2025-26; all three → this season), calibration and walk-forward game odds;
  - RAPM vs WAR-lite, the WAR ledger, goalie forecasts, styles and fatigue;
  - season simulation at frozen dates;
  - "How good are the forecasts?" from the prospective log.

### Feed (signed-in readers, 2026-10-18)
The first tab and the default page when signed in (links to a tab still open that tab). It starts empty, with directions.
- **Add anything:** a **+** beside every card's title adds the card; grouped cards (League leaders, Award races, Standings) also have a **+** on each panel; repeated tiles inside a card (a team's box in Do the points match the chances?, a milestone, a goalie's panel) have a small **+** in their corner to add just that piece. ✓ = in the feed; tap again to remove.
- **Live, with context:** a widget is a pointer to a card, saved with the team and settings it had (e.g. Teams · DET), and is drawn from the tab's own code, so it always shows the latest numbers.
- **Watch teams:** pick any number of teams at the top of the Feed; every game card of theirs (yesterday, today, tomorrow; win odds always shown; live scores) appears as one movable block.
- **Watch players:** ☆ Watch this player on a skater's card or a goalie's profile adds a simple season card (rating, G/A/P, expected goals, goals vs expected, ice time; goalies: save %, goals saved above expected, shots, goals).
- **Rearrange:** drag any item by its ⋮⋮ handle, or use ↑ ↓; Remove takes it off. Order and contents are saved per account (`apps/hockey/users/{uid}/feed`).

### Signed-out view (owner only, 2026-10-18)
A **Signed-out view** button under Sign out (only for the owner's account, recognized by the database letting it read the admin documents; nothing about the account is in the site's code) reloads the page as a signed-out visitor sees it: public tabs only, no contract figures, public GM moves and trade search, no saved edits. The owner stays signed in; **Back to my view** returns. Visits made in it still count as the owner's.

### Admin (owner only)
Sub-tabs (since 2026-10-16), the last one used remembered:
- **Visitors:** unique visitors, visits, tab views, time per visit, visits per day, each tab's visits and time (and how many visits landed there), devices, where visits came from, busiest hours and the 25 most recent visits, over 7, 30 or 90 days, with or without your own visits. From our own anonymous visit log (`visits/{id}` in Firestore): a random id per browser (no cookie), tabs and visible time, device class, referring site; no IP address, account or email; Do Not Track honored; readable by the owner only. Counted per browser, so one person on two devices counts twice.
- **Usage:** today's Firestore reads, writes and deletes and Hosting downloads for the whole project, cost per 100 page loads, the cost past the free daily quota (at the nam5 multi-region price), the month so far, cost by day, whether the cutoff is in effect, and each data job's own reads and writes from its last run. From `admin/budget` (scripts/budget.mjs, every 10 minutes; see docs/firestore-budget.md).
- **Data jobs:** every data job with run history, sources and "Run now" (nightly build, contracts, contract news, CapWages, trade search, models).
- **Model health:** model switches (WAR-lite vs RAPM, team-only vs roster-aware simulation), drift alarms, nightly data checks, model artifacts (versions and hashes, with a field dictionary) and the roster-aware simulation in shadow.
- **Forecasts:** your forecasts and the trade-engine self-tests.
- **Docs & models:** the methods dossier and this product spec (Copy and Download) and the model list.
- **Architecture:** the full diagram of sources, jobs, stores, models and pages.
- **Brand preview:** the Center ice masthead preview (Phase 2), on or off for your header.

### Ideas & bugs (owner; testers see "Report a bug")
- **Ideas:** the owner files ideas, and Claude answers each one by building it, asking a question or declining with a reason. Statuses: new, in progress, needs input, needs approval, approved and queued, done, won't do.
- **Bug reports:** from allowed accounts, triaged with statuses. A sweep every 2 hours (while the Claude app is open) works through new items. Big or direction-changing items wait for owner approval.

### Data kept for later
- **Rating history (F14):** every player's ratings are saved write-once each month during the season, plus each finished season's final ratings (from 2024-25). Nothing shows on the site yet. This is the history that aging curves and "when do players peak" questions will need.

### Elsewhere
- **Red Wings widget:** on the personal dashboard, with xG and shots.
- **Usability:** remembered picks per browser, deep links per tab and a back gesture that closes pop-ups. Works on phones.
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
- **Not planned (owner decision):** F04 fantasy edge, F06 expansion draft, F11 matchup previews, F15 all-time lineups, F16 NHL Edge board.
- **Done:** Hockey Lab / Today (spec of 2026-10-14).
- **Done:** a learned-weights retest of the "tested, not adopted" ideas. Learned weights came out at zero, so they stay out. A backfill of earlier seasons for more statistical power is a possible next step.

## 7a. Brand direction
Hockey Lab is gradually becoming **The Other Score**. Phase 0 (baseline and guardrails) and Phase 1 (copy: a helper line on every tab, official/estimated/projected labels) are done; every later phase waits for the owner's review, and the public rename needs a separate go/no-go. The plan, voice, UI inventory, checklist and baseline are in `docs/brand/`. Brand work never changes models, data, permissions or routes.

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
