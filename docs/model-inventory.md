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
| Game score | observed | goals-equivalent for one game | box score + play-by-play + xG (recap.mjs) | every 5 min live | `RECAP_VERSION` | recaps, three stars | INFO.gameScore |

## Teams, games and seasons

| Metric | Class | Units / sign | Inputs and source | Horizon / available | Version / schedule | Consumers | Explainer |
|---|---|---|---|---|---|---|---|
| Team ratings (off/def/fin/gk) | estimate | multiplicative vs league mu | score/venue-weighted, opponent-adjusted xG; prior = last season regressed 1/3 as 12 games (sim.mjs, ratings.py) | nightly | projections.json | projections, game odds, phases | INFO.projections |
| Pre-game win odds | forecast | P(home win) | team ratings, Poisson, OT 0.6·share+0.2 | nightly; frozen at puck drop | projections `upcoming` | Recent games, recaps | INFO.recap |
| Live win odds | forecast | P(home win) | pre-game odds → per-team rates; Poisson over time left; pulled-goalie multipliers; OT/SO rule | every 5 min (live.yml) | scores.mjs | Recent games, recap chart | — (MODELS) |
| Season simulation (points, playoffs, Cup) | forecast | probabilities, points | 10,000 seeded sims of the real remaining schedule (84 games in 2026-27) | nightly | sim.mjs | Overview standings, bracket, phases, trade odds | INFO.projections |
| Deserved to win | counterfactual (shot replay) | P(team out-scores on its realized shots) | each shot Bernoulli(xG), 10,000 replays | per game | recap.mjs | recaps | INFO.recap |
| Polymarket odds (games, playoffs, Cup) | market | price as probability | Polymarket Gamma API | per run; game odds frozen at puck drop, live during games | scores.mjs, assets.mjs | Recent games, recaps, phases | INFO.recap |
| Team phase | decision heuristic | label + now/future weights | 0.5 market playoff odds + 0.5 (our odds blended with last season); Cup ≥ 5% → contender; core age, youth | in the browser | lab.js `teamPhases()` | phase badge, trade weights | badge text |
| Strength by position | estimate | wins per 82 from lineup slots vs average | war82 (evidence-weighted below 40 GP), positions, shot side | in the browser | lab.js `positionStrength()` | Teams, trade fit | card text |
| Man-games lost | observed proxy | games, points-weighted, wins-weighted | game rosters (who dressed), current rosters | nightly; last season frozen | injuries.mjs | Teams | card text (labelled inferred) |

## Contracts and trades

| Metric | Class | Units / sign | Inputs and source | Horizon / available | Version / schedule | Consumers | Explainer |
|---|---|---|---|---|---|---|---|
| Contracts | observed | AAV $, term, start/end, `next` extension | NHL.com, PHR, Wikipedia, owner's PuckPedia table; post-merge sanity clean | weekly + nightly news | contracts.py | Cap tab, trade engine | INFO.contracts |
| Season rules | config | games, cap ceiling/floor, minimum salary, ELC max, max term (7/6 under the CBA from 2026-09-16) | NHL schedule, NHL/NHLPA payroll release, NHL CBA summary | by hand | lab.js `SEASON_RULES` | games left, cap checks, contract-term data check | — |
| Trade value to a team | counterfactual (heuristic) | wins above replacement, phase-weighted, discounted 0.9/yr | war82, roster fit (marginal lineup wins; year 1 value = marginal, not WAR + marginal), contract bonus, re-sign odds | in the browser | lab.js `valueTo()` | trade explorer, How? sheet | INFO.tradeValue + dossier |
| Market value | market (modelled, not observed) | 75th percentile of value to the other 31 teams | valueTo across teams | in the browser | lab.js `marketValue()` | prices, packages | INFO.tradeValue |
| Acceptance verdict | decision heuristic | "meets the model's asking price" (not a calibrated probability) | price × premium vs package; 65% headliner | in the browser | lab.js `evaluateTrade()` | explorer, How? | verdict text |
| Cap compliance | decision check | ok / over / **unverified** (missing team cap space or estimated cap hits) | owner's cap table + contracts | in the browser | lab.js `capStatus()` | explorer, suggestions, How? | verdict text |

## Evaluation

| Artifact | What it tests | Where | Schedule |
|---|---|---|---|
| xG scorecard | chronological folds (train 2024-25 → test 2025-26; train both → test 2026-27) vs league-average, distance+angle, logistic; log loss, Brier, AUC, calibration, game-bootstrap CIs | hockey-models `scorecard.py` → `model/xgScorecard.json` | by hand after xG changes |
| Game-odds backtest | walk-forward 2025-26 with the production rating code (neutral priors) vs coin, home-rate, log5; leaks flagged | dashboard-data `scripts/backtest.mjs` → `model/scorecards.json` | by hand after rating changes |
| Prediction log | every finished game's frozen pre-game odds (ours, Polymarket) and result, prospective | `hockey/predLog/seasons/{season}` (scores.mjs) | every game |

Shown on the Model tab ("How good are the forecasts?") and in the Admin methods dossier (Appendix F).

## Known gaps (tracked against the audit)
- Scorecards exist for xG and pre-game odds (A5); point-in-time snapshots with first-observed timestamps (A4) are not built yet. xG calibration slope 0.90 on the clean fold (0.82 on the power play): probabilities somewhat too extreme.
- WAR-lite on/off parts are not teammate/opponent adjusted (B2: RAPM pilot).
- `war82` uses an upward-only ice-time lift (audit P0-C): kept as `legacy_v1` until a symmetric, holdout-tested usage effect exists.
- Retained salary, LTIR, bonuses and buried contracts aren't modelled; cap checks say "unverified" instead of "ok".
