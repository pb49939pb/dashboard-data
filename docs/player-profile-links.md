# Recap opponent difficulty and Teams player links

Recap skater cards display the existing server-computed 5-on-5 matchup measure on compact phone cards and expanded/full cards. The 0–100 score ranks opponents faced within that game, not within a season. Expanded cards retain minutes against top opposing players. Missing matchup data is labeled unavailable. No new NHL requests or nightly computations are introduced.

Teams core players, strength-by-position entries, absence names, prospects, rostered style-fit goalies, franchise moves and recommended GM-move player names open profile modals. Existing skater and goalie rows on Teams also open profiles in place. Skaters with current game data use their full player profile; goalies show available season statistics and contracts. Prospects or players without game data show identity, available draft/contract context and a clear missing-stats message. Draft picks retain their existing behavior.

Browser verification covered Alex DeBrincat (core), Dylan Larkin (position strength), John Gibson (goalie), Simon Edvinsson (absence) and Carter Bear (prospect). Closing each modal preserved the Teams route. Recap difficulty appeared on both compact and expanded cards. No modal overflow at 320px and no JavaScript errors.
