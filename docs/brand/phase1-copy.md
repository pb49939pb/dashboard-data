# Phase 1: editorial voice (copy only) — 2026-10-15

Scope (rollout.md, Slice 1): Overview opening line, five section descriptions with the voice.md labels, loading/empty messages, and a one-line helper on each tab. **Unchanged:** tab names and order, layout and colors, fonts, every number, model, data path, permission and route.

## Changed copy (old → new)

**Tab helper lines (new):**
- overview: There's more to the game than the final score: results, chances and odds across the league.
- teams: One team at a time: what's driving its results, who it leans on, and what it could do next.
- skaters: What every skater produces, and what the chances say about it.
- goalies: Saves measured against the shots each goalie actually faced, with sample sizes and ranges.
- coaches: How teams have done against their rosters' talent under each coach: associations, not verdicts.
- shots: Where the shots come from, and which ones go in.
- cap: Contracts, cap space and the trade market. Private to you.
- office: How each front office's drafts, trades and pickups have worked out.
- model: How every number on the site is made, and how well each model has held up on games it never saw.

**Who's controlling play description**
- old: ? "Expected goals for vs against per game against an average opponent: adjusted for who they played, home/road, and score (trailing teams pile up chances), and blended with last season early on." : "Raw expected goals for vs against per game, with no adjustment for opponents, venue or score."} Bottom-right is best (create a lot, allow little); top-left is worst.
- new: ? "Estimated. Chances created vs allowed per game (expected goals) against an average opponent: adjusted for who they played, home ice and score (trailing teams pile up chances), and blended with last season early on." : "Estimated. Chances created vs allowed per game (expected goals), with no adjustment for opponents, venue or score."} Bottom-right is where you want to be: lots created, little al

**Current standings description**
- old: As of ${fmtTime(proj.standingsAsOf || proj.updatedAt)}. In
- new: Official. The NHL standings as of ${fmtTime(proj.standingsAsOf || proj.updatedAt)}. In

**Projected final standings description**
- old: The rest of the ${proj.teams[0].gp + proj.remaining * 2 / 32 > 83 ? "84" : "82"}-game season simulated ${proj.sims.toLocaleString()} times from team ratings
- new: Projected. The rest of the ${proj.teams[0].gp + proj.remaining * 2 / 32 > 83 ? "84" : "82"}-game season played out ${proj.sims.toLocaleString()} times from team ratings

**Points from the chances description**
- old: The points each team would have if every shot in its games had gone in at its expected rate
- new: Hypothetical. The points each team would have if every shot in its games had gone in at its expected rate

**Shooting and save luck description**
- old: PDO = shooting % + save % at 5-on-5 (about 1.000 for the league).
- new: Observed. PDO = shooting % + save % at 5-on-5 (about 1.000 for the league).

**scores loading/empty**
- old: "Scores aren't available right now; they update every 5 minutes while games are on." : "Loading scores…"
- new: "Scores aren't coming through right now. They update every few minutes while games are on." : "Pulling the latest scores…"

**slow-load message**
- old: loadTrouble("Taking longer than usual to load"); }, 20000);
- new: loadTrouble("This is taking longer than usual"); }, 20000);

**load-error message**
- old: loadTrouble("Something went wrong loading Hockey Lab"); }
- new: loadTrouble("Hockey Lab didn't load properly"); }

**league-missing message**
- old: $("#updated").textContent = "Couldn't load league data. Try again later."; return; }
- new: $("#updated").textContent = "The league numbers didn't come through. Try again in a minute."; return; }

**header status while loading (index.html)**
- old: Loading…
- new: Pulling the latest numbers…

## Labels used (voice.md)
Official (current standings) · Estimated (who's controlling play) · Projected (projected final standings) · Hypothetical (points from the chances) · Observed (shooting and save luck). Today's rows already follow the same vocabulary.

## Not changed / not present
- There's no 404 page: unknown hash routes fall back to Overview, so there was nothing to rewrite.
- The game recap's not-ready message was already concrete; it's kept.

## Checks
- 390 px screenshot reviewed (helper line under the tabs; labels lead the descriptions); no new requests, scripts or fonts.
- Numbers unchanged: copy strings only.

## Rollback
Revert the strings listed above in `hockey-web/lab.js` and `index.html`, delete `TAB_HELP` and its use in `render()`, and remove `.tab-helper` from `lab.css`.
