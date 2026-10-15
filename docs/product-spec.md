# Hockey Lab: product spec

A living spec for patrickreidbaldwin.com/hockey. It covers who the site is for, everything it does, and where every number comes from. It's maintained by hand next to the code and updated with every feature change. When the page opens it, the appendices are generated from the running code: recent changes, the model list and (for the owner) the data-jobs catalog. How the models work is in the companion **Methods dossier**, and each model's scorecard is on the Model tab.

Last reviewed: 2026-10-14

## 1. What it is

Hockey Lab is an NHL analytics site built on public data. It has expected goals, player and team ratings, season projections, live win odds, game recaps, shot maps, front-office grades and an owner-only GM workbench (contracts, cap, trade valuation and recommended moves).

Its promise is that every number names its source and date, and every model is tested out of sample before it goes live. A new or changed model is promoted only if it beats the current one (or a simple baseline) on held-out data, with an interval that excludes zero. Otherwise it's published as a test result, run in shadow, or held for the owner's decision.

## 2. Who it's for

| Audience | What they come for | Access |
|---|---|---|
| **The owner** (a hockey fan acting as an armchair GM) | Everything below, plus the GM workbench: contracts, cap space, the trade explorer, recommended GM moves, scouting notes, forecasts, model switches, data health, ideas and bug triage | Signed in, verified owner account |
| **Curious fans / readers** | Who's actually good (xG, ratings), standings and playoff odds, recaps of last night's games, shot maps, coach and GM report cards, the question of the day | Anyone can read; signing in adds saved preferences |
| **Stats-minded reviewers** | How the models work and whether they hold up: scorecards, calibration, the methods dossier, this spec | The Model tab (public); the methods dossier and this spec are on the Admin tab, and their files are public under /hockey/ |
| **Allowed testers** | Filing bug reports | An account allowed by the database rules ("Report a bug" tab) |

**Not for:** betting advice (market odds are shown only as a comparator), real-time scouting, and private or paywalled data. No PuckPedia or CapWages scraping, and no X/Twitter.

## 3. Principles

- **Sources and dates on every card.** If a number can't be traced, it doesn't ship.
- **Tested before trusted.** There are out-of-sample scorecards for every model, a prospective prediction log from 2026-10-13, nightly drift alarms, and versioned, content-hashed model artifacts.
- **Honest labels.** Estimates are called estimates, associations aren't presented as causes, and a heuristic verdict isn't called a probability.
- **Private stays private.** Contracts, cap tables, the trade search and the owner's edits are owner-only by database rule. Allow-lists live in the rules, never in public code. The public data repo never logs contract-derived values.
- **Light on the reader's device.** Heavy work runs server-side (nightly jobs, including the trade search), and the page does what's left in small slices so it never freezes.

## 4. Features

### Overview
- **Recent games:** scores with pre-game model odds vs the Polymarket moneyline. On game nights, live win odds update every 5 minutes. Each game opens a full **game recap**.
- **Projected final standings:** 10,000 simulated seasons, with playoff, division and Cup odds (with simulation errors), the projected playoff bracket and strength of schedule. Past seasons show the final standings and bracket instead.
- **Current standings, Team stats and division strength.**
- **Who's controlling play:** xG share.
- **Leaderboards:** best goaltending (GSAx), hot finishers, the snakebitten, most dangerous shooters, best forwards, defensemen and top defenders.
- **Question of the day** (footer link): a pop-up answering one hockey question from our data each day (rotating, screenshot-friendly). Being built; the first question is scheduled for Oct 15, 2026.

### Game recaps
- **Deserved-to-win odds:** every shot replayed 10,000 times.
- **Game flow:** xG flow, the turning point (the goal that moved win odds most) and three stars by game score.
- **Lines and storylines:** who was on the ice for each goal, matchup difficulty from shift charts, storylines (including "rough nights" judged by expected ±), and box scores with an expected ± column.

### Teams (pick any of 32)
- **Team breakdowns:** where the team wins and loses (a goal-differential ledger: 5v5 chances, finishing, goaltending, special teams), team phase (inferred, or the owner's objective) with Polymarket as a comparator, and playoff odds.
- **Player strength:** core players, the team's best players, and strength by position (C, LW, RW, LD, RD, G) ranked league-wide.
- **Absences:** man-games lost, an absence proxy weighted by lost points and wins, with current absences tagged.
- **Assets:** draft picks (next three drafts, including traded and conditional picks) and prospects, valued in wins.
- **Lines and pairs:** most-used units, their minutes and on-ice results.
- **Style:** style fingerprint and archetype, matchups (descriptive only) and player types that fit the system.
- **Owner only: Recommended GM moves.** The three best deals that could all be made (no shared player), with a plain-English why, playoff odds before → after and a feasibility chip. They're searched server-side nightly and re-checked on the page.
- **Explore trades** (owner gets the full version): build any deal (players, picks, prospects, from several teams) and see:
  - wins this season and long-term value by each team's window;
  - the other team's verdict and EA-style value bars;
  - the "How?" sheet with every input (projection ranges, roster fit, contract bonus, cap shadow price, availability and premium);
  - cap compliance, a feasibility checklist, a real-trade comparison and playoff odds before and after.
  
  Best trades for a team are also listed.

### Skaters
- **Ratings and stats:** ratings (offense, defense, usage, overall, 40–99 within position) and stats (xG, goals above expected, expected ±, ice time).
- **Player cards:** ratings, WAR-lite value, system fit and the owner's private scouting note.

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
- **Cap space:** every team's cap space (from the owner's PuckPedia cap table, pasted by hand) and cap projections.
- **Trade block:** from news feeds that allow it, plus the owner's edits.

### Front office
- **GM grades:** grades by GM era.
- **Draft:** draft yield vs expected by pick, best draft picks and what a pick slot is worth (outcome ranges).
- **Trades and pickups:** best pickups (pro scouting), and best and worst trades (realized WAR for the acquiring team).
- **Age of scoring.**

### Model (public)
- **Explainers:** "How Hockey Lab works", and each model's when, inputs, what it does and where it's used.
- **Scorecards:**
  - xG folds, calibration and walk-forward game odds;
  - RAPM vs WAR-lite, the WAR ledger, goalie forecasts, styles and fatigue;
  - season simulation at frozen dates;
  - "How good are the forecasts?" from the prospective log.

### Admin (owner only)
- **Model switches:** player value WAR-lite vs RAPM, and team-only vs roster-aware simulation.
- **Health and versions:** drift alarms, model artifacts (versions and hashes, with a field dictionary), nightly data checks, and the roster-aware simulation in shadow.
- **Documents:** the methods dossier (Markdown for expert review) and this product spec, each with Copy and Download.
- **Jobs:** data jobs with run history and "Run now" (nightly build, contracts, contract news, trade search, models).
- **Your forecasts** and the trade-engine self-tests.

### Ideas & bugs (owner; testers see "Report a bug")
- **Ideas:** the owner files ideas, and Claude answers each one by building it, asking a question or declining with a reason. Statuses: new, in progress, needs input, needs approval, done, won't do.
- **Bug reports:** from allowed accounts, triaged with statuses. A sweep every 2 hours (while the Claude app is open) works through new items. Big or direction-changing items wait for owner approval.

### Elsewhere
- **Red Wings widget:** on the personal dashboard, with xG and shots.
- **Usability:** remembered picks per browser, deep links per tab and a back gesture that closes pop-ups. Works on phones.

## 5. Data sources

| Source | What we take | How | Terms |
|---|---|---|---|
| NHL web API (api-web.nhle.com) | Play-by-play, standings, schedules, rosters, club stats, scores, prospects, player pages (injured reserve) | Nightly and every 5 min on game nights | Public endpoints |
| NHL stats API (api.nhle.com) | Shift charts, goalie game logs, skater bios and handedness | Nightly | Public endpoints |
| NHL HTML game reports | Shift reports when the API's shift charts are missing or partial | Nightly fallback | Public pages |
| MoneyPuck | Season files: on-ice xG, ice time, zone starts; goalie seasons since 2008-09 | Nightly and by hand | Their published data files, credited |
| Wikipedia (CC BY-SA) | Draft history and traded picks, transactions and trades, contracts, coaching records | Nightly, weekly and by hand | Attributed |
| ProHockeyRumors, NHL Trade Rumors, Daily Faceoff (RSS) | Trade block and signing news | Nightly | RSS feeds that permit it |
| NHL.com team releases | Contract terms and cap hits | Weekly | Public releases |
| Polymarket Gamma API | Moneylines, playoff and Cup futures | Nightly and live | A comparator only, never an input to our odds |
| PuckPedia cap table | Each team's cap space | Pasted by the owner on the site (no scraping) | Owner only |
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
- **Waiting on owner approval:** 16 filed requests (F01–F16): franchise mode, deserved standings, goalie-pull math, fantasy edge, game story viewer, expansion draft, luck board, award races, deadline war room, buyer/seller index, matchup previews, milestones, rest and travel, aging curves, all-time lineups, and the Edge board.
- **Needs an owner answer:** offensive zone time per period (proposal: a labelled territory estimate).
- **In progress:** Question of the day; a learned-weights retest of the "tested, not adopted" model ideas with more seasons of data.

## 8. How this spec stays current

Every feature change updates this file, along with the changelog, the methods dossier, the model inventory and the architecture diagram. The source is `dashboard-data/docs/product-spec.md`, and each site deploy copies it to `/hockey/product-spec.md`. The "Product spec" button on the Admin tab's Models card shows it with generated appendices. The raw file is public at that URL.
