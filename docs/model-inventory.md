# Hockey Lab model inventory (A1)

Every production metric, its units and sign, where its inputs come from, when it's available, how it's versioned,
who consumes it, and whether its on-site explanation is generated from code. All current outputs are **`legacy_v1`**:
they stay in place until a replacement passes a chronological holdout (see the audit, section 2). Updated 2026-10-13.

Columns: **class** = observed (descriptive) · estimate (latent ability) · forecast · counterfactual · market · decision.
"Explainer" = where the site text lives: `INFO` (lab.js, hand-written next to the code), `MODELS` (lab.js), or the
methods dossier (generated from `INFO`, `MODELS` and the live constants).

## Shots and goals

| Metric | Class | Units / sign | Inputs and source | Horizon / available | Version / schedule | Consumers | Explainer |
|---|---|---|---|---|---|---|---|
| xG per shot | estimate | probability 0–1 a shot is a goal | NHL play-by-play (api-web); features in `hockey-models/hockey/xg.py`; HistGradientBoosting 500 trees, logistic companion | trained on the two previous full seasons; scored nightly (league.mjs) and every 5 min live (scores.mjs) | `model/xg_gbm.json` (+ `xg_logit.json`); retrained by hand | every xG number on the site | INFO.xgModel |
| Shooter-aware xG | estimate | probability, shot logit adjusted by shooter finishing (goals+k)/(xG+k) before that game | xG + shooter priors (`model/xg_sa.json`, career through last season) + this season's earlier games | nightly | `xg_sa.json`, by hand | goalie SA-GSAx, goalie ratings, goalie diagnostic on Teams | INFO.goalieRatings |
| Team GF/GA/xGF/xGA (all, 5v5, PP/PK) | observed | goals / expected goals per team | league.mjs from play-by-play | nightly | league.json `format` | Teams, Overview, tables | INFO.teamStats |
| **Goal-differential ledger** (create, prevent, finish, goalie, pp, pk, other) | observed | goals per game vs league average; + = good for the team | team totals above; **one shot-neutral xG universe**; parts reconcile exactly to GF−GA per game (checked in code; residual ≤ 1e-9) | nightly | `teamFactors()` (lab.js) | Teams "Where … win and lose", team grades, Red Wings summary | INFO.winLose |
| Shooter-aware goaltending (team) | observed diagnostic | goals per game vs average | goalie splits (SA-xGA − GA, 5v5) | nightly | `teamFactors().goalieSA` | Teams (separate line, **not** in the ledger) | INFO.winLose |

## Players and goalies

| Metric | Class | Units / sign | Inputs and source | Horizon / available | Version / schedule | Consumers | Explainer |
|---|---|---|---|---|---|---|---|
| Player ratings 40–99 (OFF/DEF/USE/OVR) | observed (composite) | rating, 75 = average at position, 8 = 1 SD | MoneyPuck season files (this + last at half weight) | nightly | players.mjs | Skaters, player cards, lines, top players | INFO.playerRatings |
| Expected plus/minus | observed | xGF − xGA on ice, 5v5 | MoneyPuck season file | nightly | players.mjs | player cards | INFO.howForwards |
| Goals above expected (GAx) | observed | goals − own xG | league.mjs | nightly | league.json | Skaters, leaderboards | INFO.howForwards |
| Goalie GSAx / SA-GSAx, ratings, shot-type ratings | observed | goals saved vs expected (unblocked attempts) | league.mjs + shooter-aware xG | nightly | league.json | Goalies tab | INFO.goalieRatings, howGoalies |
| WAR-lite (season) | estimate (descriptive) | wins above replacement; 0 = replacement, not average | NHL season totals + MoneyPuck on/off (value.py, defense.py) | monthly / by hand | hockey-models `value.py` | Front office, coaches, draft, trades | INFO.war |
| Player value `war82` | estimate | WAR per 82 games, 3 seasons 1/0.7/0.45 + 25 replacement games; ice-time lift (up only) | WAR-lite + MoneyPuck TOI (player_value.py) | monthly / by hand | `model/playerValue.json` | trade engine, position strength, core players, injuries weights, phases | INFO.war, tradeValue |
| Player projections (future seasons) | forecast | per season to 2030-31: median WAR per 82 with 10/90% range, expected GP, P(20+ NHL games) | ridge (WAR/82, GP) + logistic (active) on 3-season weighted value, age by position, games, draft; ranges from residual percentiles by NHL evidence (hockey-models projections.py) | by hand after player-value rebuilds | `model/playerProjections.json` v1 | trade value seasons after this one (replaces the fixed growth/decline table; table is the fallback) | How? sheet constants |
| RAPM WAR `war82Rapm` (switchable) | estimate | WAR per 82, same combine as war82 (3 seasons 1/0.7/0.45 + 25 replacement games); site value = RAPM order on WAR-lite scale (quantile map by F/D/G); raw kept as `war82RapmRaw` | per season (hockey-models rapm_war.py): 5v5 xG ridge RAPM with an ice-time prior (λ 1e5) + power-play/PK ridge (λ on held-out games) + finishing (goals − xG, shrunk by split-half reliability) + goalie GSAx (shrunk); replacement = fringe players (10-40 GP; goalies 5-20) per game; ÷ 6 goals per win; xG model trained on the same season (last season's while under 800 games) | with player value (monthly / by hand) | `model/playerValue.json` | everything that reads war82, when the Admin switch says "rapm" (hockey/config) | Admin switches card |
| Recap card stats (Corsi/Fenwick on ice, D activations, own-zone TK/GV, goalie rebounds, xSV%, danger splits) | observed | counts / % per game; activations = own attempts from x ≥ 54 (proxy: no pass data) | play-by-play + shift charts (recap.mjs) | every 5 min live | `RECAP_VERSION` 3 | recap player cards | card tooltips |
| Matchup difficulty | observed (context) | mean war82 of opposing 5v5 skaters, 0-100 rank within the game; minutes vs 3+ of opponent's top 10 | shift charts second by second + playerValue (unknown = 0) | every 5 min live | `RECAP_VERSION` 3 | recap player cards | card tooltip |
| Game score | observed | goals-equivalent for one game | box score + play-by-play + xG (recap.mjs) | every 5 min live | `RECAP_VERSION` | recaps, three stars | INFO.gameScore |

## Teams, games and seasons

| Metric | Class | Units / sign | Inputs and source | Horizon / available | Version / schedule | Consumers | Explainer |
|---|---|---|---|---|---|---|---|
| Team ratings (off/def/fin/gk) | estimate | multiplicative vs league mu | score/venue-weighted, opponent-adjusted xG; prior = last season regressed 1/3 as 12 games (sim.mjs, ratings.py) | nightly | projections.json | projections, game odds, phases | INFO.projections |
| Pre-game win odds | forecast | P(home win) | team ratings, Poisson, OT 0.6·share+0.2 | nightly; frozen at puck drop | projections `upcoming` | Recent games, recaps | INFO.recap |
| Live win odds | forecast | P(home win) | pre-game odds → per-team rates; Poisson over time left; pulled-goalie multipliers; OT/SO rule | every 5 min (live.yml) | scores.mjs | Recent games, recap chart | — (MODELS) |
| Season simulation (points, playoffs, Cup) | forecast | probabilities, points | 10,000 seeded sims of the real remaining schedule (84 games in 2026-27); tiebreakers points → RW → ROW (OT share of tied games 0.635, measured) → W → coin | nightly | sim.mjs | Overview standings, bracket, phases, trade odds | INFO.projections |
| Roster-aware season simulation (shadow) | forecast | points, playoff/Cup odds; pre-game P(home) as `pHomeRoster` | same ratings + per-game goal margin = 0.5 × (lineup gap home − away) × 6 / 82; lineup = best 12 F + 6 D on the roster (injured reserve included via NHL player pages) + sampled starter (main goalie 63%, 37% on back-to-back second nights); injured players return per the 2025-26 absence survival curve; gaps vs the team's dressed lineups (this season + last at 12 games), league offset removed | nightly after injuries | rosterSim.mjs, model/rosterModel.json; `model/config.json` simModel switches primary | projections.roster (shadow), prediction log | — |
| Deserved to win | counterfactual (shot replay) | P(team out-scores on its realized shots) | each shot Bernoulli(xG), 10,000 replays | per game | recap.mjs | recaps | INFO.recap |
| Polymarket odds (games, playoffs, Cup) | market | price as probability | Polymarket Gamma API | per run; game odds frozen at puck drop, live during games | scores.mjs, assets.mjs | Recent games, recaps, phases | INFO.recap |
| Team phase / objective | decision heuristic (hypothesis) | inferred label + now/future weights, or the owner's objective per team (Cup push 2 seasons 1.6/0.6, balanced 1/1, build 5-year 0.6/1.3) | our playoff odds (blended with last season early), our Cup odds ≥ 5% → contender; core age, youth; Polymarket shown as comparator only (no longer mixed in) | in the browser; objectives saved per owner | lab.js `teamPhases()`, `OBJECTIVES`, `teamWindow()` | phase badge (objective selector), trade weights | badge text |
| Strength by position | estimate | wins per 82 from lineup slots vs average | war82 (evidence-weighted below 40 GP), positions, shot side | in the browser | lab.js `positionStrength()` | Teams, trade fit | card text |
| Man-games lost | observed proxy | games, points-weighted, wins-weighted | game rosters (who dressed), current rosters | nightly; last season frozen | injuries.mjs | Teams | card text (labelled inferred) |

## Contracts and trades

| Metric | Class | Units / sign | Inputs and source | Horizon / available | Version / schedule | Consumers | Explainer |
|---|---|---|---|---|---|---|---|
| Contracts | observed | AAV $, term, start/end, `next` extension (`reported` when insiders report it before it's official) | NHL.com, PHR, Wikipedia, owner's PuckPedia table; post-merge sanity clean | weekly + nightly news (same job queue; publish skips a list built on an older base) | contracts.py | Cap tab, trade engine | INFO.contracts |
| Season rules | config | games, cap ceiling/floor, minimum salary, ELC max, max term (7/6 under the CBA from 2026-09-16) | NHL schedule, NHL/NHLPA payroll release, NHL CBA summary | by hand | lab.js `SEASON_RULES` | games left, cap checks, contract-term data check | — |
| Trade value to a team | counterfactual (heuristic) | wins above replacement, phase-weighted, discounted 0.9/yr | war82 this season, player projections after (median × expected games × P(active)), roster fit (marginal lineup wins; year 1 value = marginal, not WAR + marginal), contract bonus, re-sign odds | in the browser | lab.js `valueTo()` | trade explorer, How? sheet | INFO.tradeValue + dossier |
| Cap shadow price | decision heuristic (constraint) | 0..1 per team-season: 1 at/over the ceiling → 0 with $8M+ of room | room: owner's cap table this season and next; later from known contracts + 23-man roster at $1.5M open spots; unknown 0.5 | in the browser | lab.js `capShadow()` | contract bonus in trade value (replaces the unconditional 0.5 × savings) | How? sheet (×cap note) |
| Market value | market (modelled, not observed) | 75th percentile of value to the other 31 teams | valueTo across teams | in the browser | lab.js `marketValue()` | prices, packages | INFO.tradeValue |
| Recommended GM moves | decision heuristic | top 3 of the trade search for a team, with tradeNarrative() English | same as trade value + playoff odds shift | in the browser | lab.js `gmMovesCard()` | Teams page (owner) | card text |
| Trade playoff odds | counterfactual (simulation) | playoff % before → after for every team in the deal | 2,000 seasons without and with the deal on the same random draws (common random numbers), each team's change in wins this season as a goal margin over its remaining games; shift added to the published odds; falls back to a 2-points-per-win shift without published sim inputs | in the browser | lab.js `tradeOdds()` / `simPlayoffs()` | How? sheet, GM moves | text in both |
| Acceptance verdict | decision heuristic | "meets the model's asking price" (not a calibrated probability) | price × premium vs package; 65% headliner | in the browser | lab.js `evaluateTrade()` | explorer, How? | verdict text |
| Feasibility gate | decision check | per deal: hockey benefit, cap compliance, asset ownership (conditional picks unknown), contract rights, no-trade/no-move (owner's contract table; unknown if not on file), reported availability vs inferred, asking price → clear / needs checks / not feasible | contracts, owner edits, trade block, cap table | in the browser | lab.js `feasibility()` | How? sheet, GM moves chip | checklist text |
| Cap compliance | decision check | ok / over / **unverified** (missing team cap space or estimated cap hits) | owner's cap table + contracts | in the browser | lab.js `capStatus()` | explorer, suggestions, How? | verdict text |

## Evaluation

| Artifact | What it tests | Where | Schedule |
|---|---|---|---|
| xG scorecard | chronological folds (train 2024-25 → test 2025-26; train both → test 2026-27) vs league-average, distance+angle, logistic; log loss, Brier, AUC, calibration, game-bootstrap CIs | hockey-models `scorecard.py` → `model/xgScorecard.json` | by hand after xG changes |
| Game-odds backtest | walk-forward 2025-26 with the production rating code (neutral priors) vs coin, home-rate, log5; leaks flagged | dashboard-data `scripts/backtest.mjs` → `model/scorecards.json` | by hand after rating changes |
| RAPM pilot | 5v5 xG RAPM from shift-chart stints vs raw on/off and on/off + context; first half -> second half of 2025-26 | hockey-models `rapm.py` → `models/rapm.json` (test copied into `model/scorecards.json`) | by hand |
| Player projections | rolling origin 2022-23 … 2025-26 vs the site's old growth/decline rule: games-weighted MSE of next-season WAR/82 (model lower every year; pooled difference 95% CI −0.33 to −0.11), 80% interval coverage (0.76–0.82, by age band too), active Brier | hockey-models `projections.py` → `models/projections.json` (`tests`) | by hand |
| Lineup adjustment test | walk-forward 2025-26 with WAR-lite frozen through 2024-25: tonight's dressed lineup + starter vs the team's average so far; k fit on first half (0.5), scored on second half: log loss −0.0023 (95% CI −0.0066 to +0.0019); goalie part helps most, skaters alone don't | dashboard-data `scripts/rosterTest.mjs` → `model/scorecards.json` (roster) | by hand |
| WAR-lite vs RAPM WAR | values from one season (both models) → every next-season game from the dressed lineups: logistic win model and goal-differential regression fit on the first half, scored on the second; vs home edge; both together; year-to-year stability. 2024-25 → 2025-26: WAR-lite 0.6845 vs RAPM 0.6860 log loss (difference CI −0.0033 to +0.0062), both together 0.6841; stability r 0.71 vs 0.55 → WAR-lite stays default | hockey-models `value_compare.py` → `models/valueCompare.json` (in `model/scorecards.json`) | each season / by hand |
| Prediction log | every finished game's frozen pre-game odds (ours, Polymarket) and result, prospective | `hockey/predLog/seasons/{season}` (scores.mjs) | every game |

Shown on the Model tab ("How good are the forecasts?") and in the Admin methods dossier (Appendix F).

## Point-in-time data (A4)

| Record | What it keeps | Where |
|---|---|---|
| Contract provenance | `firstObservedAt` (tracking began 2026-10-14; older rows marked reconstructed), `lastSeenAt`, `lastChangedAt`, `history` of replaced values with `currentFrom`/`replacedOn` | contracts.py `provenance()`; in `hockey/contracts` |
| Nightly input snapshot | player values, contracts (incl. first observed), trade block, Polymarket odds, standings; each source's own build time; written once per day, never edited | `admin/snapshots/days/{date}` (owner only), scripts/snapshot.mjs |
| Projection history | nightly playoff/Cup odds per team | `hockey/history/{season}/{day}` |
| Prediction log | frozen pre-game odds and result per game | `hockey/predLog/seasons/{season}` |

Backtests before 2026-10-14 are reconstructed (no archive of what was known then) and say so.

## Known gaps (tracked against the audit)
- Scorecards exist for xG and pre-game odds (A5); point-in-time records start 2026-10-14 (A4): earlier history is reconstructed. xG recalibration (B1) tested 2026-10-14: Platt scaling fit on out-of-fold predictions helps a model trained on one season (slope 0.90 -> 1.02, log loss CI excludes 0) but not the production two-season model (slope 0.985; CI spans 0), so it is not promoted; re-test at each retrain.
- WAR-lite on/off parts are not teammate/opponent adjusted. RAPM pilot (B2) tested 2026-10-14: ties on/off with the same context controls, so not promoted; context adjustment (score state, zone starts, home) helps within a season at the stint level; the season-level version from MoneyPuck's score-and-venue-adjusted aggregates was tested 2026-10-14 and is less stable year to year (r 0.32-0.36 vs 0.37-0.42), so WAR-lite is unchanged.
- `war82` upward-only ice-time lift (audit P0-C): tested 2026-10-14 against none / both-ways / down-only on next-season WAR; up-only is the only version that improves prediction (CIs exclude 0 for F and D), so it stays.
- Retained salary, LTIR, bonuses and buried contracts aren't modelled; cap checks say "unverified" instead of "ok". Cap savings are weighted by a team cap shadow price (constraint, audit 8.1); the $8M slack and 0.5 conversion are not yet validated against real transactions.
