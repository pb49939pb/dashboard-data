# Docket: expand cached training history through 2023–24

Status: requested; not implemented as part of opponent difficulty.

Current xG production artifacts already train on 2024–25 and 2025–26 and evaluate on 2026–27. WAR-lite also includes 2024–25. The next expansion is 2023–24. Confirm whether “back to 2023” additionally means the 2022–23 season.

Plan:
- Audit existing local and durable caches, then run a resumable one-time fetch for missing 2023–24 play-by-play, shifts and required season summaries.
- Store immutable raw inputs, derived features and a completeness manifest in durable storage. Keep incomplete shift coverage explicit.
- Offline retraining reads only cached history. Preserve chronological training/validation/test splits; never train on a held-out season or use future player values in historical validation.
- Compare existing and expanded-history artifacts on identical held-out seasons using calibration, log loss/Brier score and the task-specific metrics. Adopt only supported improvements and retain rollback artifacts.
- Proposed operating constraint: no increase in external NHL/MoneyPuck API calls in nightly jobs; historical downloads and refreshes are explicit offline work. The owner's latest message literally said “does increase”; a clarification is pending before treating this constraint as confirmed.

This is a research/backfill docket item, not authorization to change production model coefficients now.
