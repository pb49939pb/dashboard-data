# F03 goalie-pull advisor: research (2026-10-14)

Owner decision: "research first; five-minute live refresh is inadequate". This note answers two questions: can we get a fast enough live feed, and what should the advisor compute? Nothing is built yet.

## 1. How fresh can the live data be? (measured tonight)
Two live games were polled every 5 s for 4 minutes (MTL at WSH and DAL at COL, Oct 14), plus header checks on three NHL endpoints.

| Finding | Evidence |
|---|---|
| The NHL's game clock in the feed moves in steps of about **15–30 s** | The play-by-play `clock.timeRemaining` changed at ~20 s intervals (e.g. 19:42 → 19:27 → 19:15) |
| The CDN caches responses for **2–19 s** | `cache-control: max-age=19` on play-by-play at first, later `max-age=3`; `age` headers up to 15 s |
| New events appear within one poll of the clock moving | play count rose 95 → 97 → 99 alongside the clock |
| Goalie state is in the feed | `situationCode` (e.g. `1451`; a pulled goalie shows as `0` in the goalie digit, as used by our pulled-goalie rates) |
| **Browsers can't call the NHL directly** | no `Access-Control-Allow-Origin` header on `score/now`, play-by-play or landing, so a page can't poll them itself |
| Payload sizes (gzip, transferred) | score/now ~11 KB, landing ~6 KB, play-by-play ~49 KB |

So **20–30 s freshness** is available upstream. Today we get **5 minutes** (live.yml on a GitHub cron, and GitHub crons often start late).

## 2. Options for a faster feed
| Option | Freshness | Cost / setup | Notes |
|---|---|---|---|
| A. Keep live.yml every 5 min | 5–10 min | none | Too slow for a pull decision (it's the reason for this research) |
| **B. One long-running "game night" GitHub job** that starts at the first puck drop and loops every ~20 s until the last game ends, writing one small `hockey/live` doc (score, clock, situation, advisor numbers) to Firestore | ~20–45 s behind real time (CDN cache + poll interval + Firestore push) | free (the public repo has unlimited Actions minutes; jobs can run up to 6 h, so a 4–5 h night fits); about 600–900 Firestore writes a night, well inside the free tier | No new accounts or credentials. The page listens to that one doc (Firestore pushes changes in under a second). **Recommended.** |
| C. A Cloud Function proxy the browser polls | ~20 s | needs the Firebase Blaze (billing) plan | a billing decision for you |
| D. A Cloudflare Worker proxy | ~20 s | a new Cloudflare account | new account and credentials, so you'd set it up |

Is 20–45 s of lag good enough? Mostly yes. Tonight's Question of the Day model showed the best pull window is **wide and flat**: down one, anything from about 2:20 to 4:40 left gives nearly the same chance, about 42%. The advisor's job is to say "you're in the window" or "you're past it", not to call a precise second. It must still show "as of 19:15 in the 3rd, 30 s ago" so nobody mistakes it for a real-time call.

## 3. What the advisor should compute
- **Rates:** reuse the measured 2024-26 rates from `hockey-models/hockey/qotd.py` (5v5 and 6v5 goals for and against for teams trailing by one and two in the third).
- **Inputs:** for the trailing team, the deficit (1 or 2), time left, and whether the goalie is already pulled.
- **Outputs:**
  - the chance to tie if they pull now vs keep waiting;
  - the best-pull window for that deficit (the plateau, not one second);
  - the status: *in the window*, *early* or *late*.
- **Later, a separate modeling change:** adjust the rates by the two teams' strength (our team ratings). That would need its own test under the promotion rule; v1 uses league rates and says so.
- **Labels:** a "decision aid from league-wide rates". It's not a prediction of the game and not what any coach should do. Power plays, delayed penalties and 4-on-4 are excluded, and the aid hides in those states rather than guessing.

## 4. Recommendation
Build B (game-night job + `hockey/live`) and the window advisor in the Recent games live cards. Sizing: a day of work; nothing changes outside the live path. **Needs your go-ahead.** It adds a long-running workflow and turns the live path from every 5 minutes into continuous during games. That would also make our existing live win odds about 10 times fresher.
