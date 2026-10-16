# Phase 3: Today as the flagship (owner preview) — 2026-10-16

Scope (rollout.md Phase 3 / Slice 3): brand presentation of the existing Today module only. **Unchanged:** selection,
thresholds, templates and copy (Today spec; `todaySelect.mjs`, `today.mjs`), the data (`hockey/today`), placement on
Overview (after the games, never above live scores), destinations (recap, team, Question of the day) and Back behavior.
No new model, no new browser calculation. Shown only on the owner's header preview (`body.tos`, Admin → Brand preview);
everyone else sees the current Today ("HOCKEY LAB / TODAY").

## Patch A — Today as the flagship
- Eyebrow **THE OTHER SCORE / TODAY**, date right, the Center ice rule (frost line, coral faceoff dot) under the head.
- Heading "What do the numbers say?" in paper; at most three items, in the spec's order.

## Patch B — Editorial rows
- No card: an editorial block on the page; rows separated by hairline rules.
- Each row: label · one observation · its **one supporting measure set large** · one destination (a full-width,
  44 px tap target). Measures: the winner's shot-replay chance (surprise result), the game's total expected goals
  (neutral game), points share vs 5-on-5 chance share (team mismatch); none for early-season, "mostly agree" or the question.

## Patch C — Honest empty states
- No edition, or none in the last two days: a one-line dated status ("No edition yet today…", "No new edition since
  Oct 12…") instead of the module vanishing; scores and standings stay current below it.
- One item unavailable (e.g. no games): the others show, no blank placeholder. Early season: the spec's early-season row.

## Review (owner view, live site, 390 px; fixtures via `previewToday()` in lab.js, real edition untouched)
| State | Shown |
|---|---|
| Real edition (Oct 16) — weak story | neutral game (7.5 xG), early-season team row, faceoff question |
| Strong story (fixture values) | "The scoreboard and the chances disagreed." 31% · "Winning more than their chances suggest." 63% vs 46% · question |
| No games | team row + question only |
| No edition / stale | the one-line dated status |
No horizontal overflow at 320 or 390 px; heading order h2 → h3; every destination a focusable button.

## Acceptance gate
Selection, sources, thresholds and timestamps follow the Today spec (unchanged code paths); renders from the precomputed
`hockey/today`; no owner-only data in public payloads (the preview is styling only); reserved space while loading (no jump);
the measure line says what the number is in plain words.

## Rollback
Delete the "Phase 3" block at the end of hockey-web/lab.css and the `tos` branches in `todayCard()` (eyebrow, measure,
status); `previewToday()` can stay (owner tooling).

## Next (needs Pat)
Review the preview; then Phase 4 ("After the Horn" recap) per the rollout plan. The public switch-over of Phases 2–3
still waits for the Phase 7 name decision.
