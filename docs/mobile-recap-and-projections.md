# Mobile recaps and projected-points chart — 2026-10-16

This is a presentation change; no source data, model, probabilities, or formulas change.

## Recaps
- Below 641px, player cards form a two-column grid. Each compact card shows a headshot (team-logo fallback), name, position, ice time, game score, goals, assists and official plus/minus. Goalies show saves, save percentage and GSAx.
- Tap a compact card to expand the original full hockey card. The expanded entry spans both columns. Tap it again to collapse.
- Filter by either team or show both; sort skaters by game score, points, ice time or matchup difficulty. Goalies remain after skaters.
- Modal section buttons jump to Players, Game flow, Lines and Box score. Missing line data is labelled explicitly.
- Desktop retains horizontal full-card rows and the existing arrows.

## Projected standings
- Mobile defaults to Chart; desktop defaults to the original Table. Either view can be selected without resetting scroll position.
- Each chart row shows the published projected-point mean, the published 80% simulation range and playoff probability. All teams share one points axis; it is not a playoff cutoff.
- Expand a row for numeric range, Cup probability, games played and current points. Team links still open the team page.
- The chart uses exactly `projPts`, `lo`, `hi` and `playoffs` from the table, without recomputation.

## Verification
Browser checks against live data at 320, 390, 430 and 1280px: chart/table switching, 32 chart teams, two-column grid, full-card expansion, team filtering, points sorting, modal overflow, desktop original cards, no JavaScript errors.
