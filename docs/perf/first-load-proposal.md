# First-load performance: findings and proposal (2026-10-14)

From the rebrand's Phase 0 baseline (`docs/brand/baseline/2026-10-14/metrics.json`): on a throttled phone profile, most tabs paint their main content after about **5.3 s** (target ≤ 2.5 s), and the layout shifts by **0.15–0.44** (target ≤ 0.1). This is a proposal only. Changing the load order touches how every tab starts, so it waits for the owner's go-ahead.

## What causes it (measured in the browser)
1. **The first render waits for ten documents.** `loadDataInner()` loads the league document, then `model`, `projections`, `players`, `styles`, `lines`, `playerValue`, `assets`, `injuries` and `config` together, and only then calls `render()`. Uncompressed, that's about **1.65 MB** of JSON: players 414 KB, playerValue 287 KB, league 221 KB, injuries 220 KB, assets 179 KB, lines 155 KB, projections 136 KB, and so on. Overview needs mainly the league and projections; most of the rest serves other tabs or later cards.
2. **The largest paint is whatever big text block appears after the data.** Before that it's the footer (painted at about 70 ms). So the "largest contentful paint" time is really "data arrived" time.
3. **Two layout shifts:**
   - at about 60 ms, when the loading skeleton is inserted into `#view`, it pushes the footer and the "How we measure" buttons down (0.15);
   - at about 700 ms (more on a slow connection), the header's "Loading…" line becomes a four-line status, the team switcher appears, and the view swaps skeleton for content (0.21).

## Proposal (three small, separately revertible changes)
1. **Render Overview after league and projections only**, then load the other documents in the background. Each tab or card that needs one shows a small skeleton until it arrives; most already handle a missing doc, so this is mostly reordering. Expected: the main content paints when the ~360 KB league + projections arrive instead of ~1.65 MB. That's an estimate, to be confirmed by rerunning `baseline.mjs`.
2. **Reserve the header's space:** a minimum height for the status line (`#updated`, four lines on a phone) and for the team switcher, so data arriving doesn't push the page down.
3. **Put the loading skeleton in `index.html`** inside `#view`, so the first paint already has it and the footer doesn't jump when JavaScript inserts one.

## Not proposed
- Splitting the published documents or changing what the nightly job writes. That's bigger; do it only if step 1 isn't enough.
- A service worker. Its earlier cache problems are why the site removes old ones.

## How to check
Rerun `node docs/brand/tools/baseline.mjs` and compare `metrics.json` with the 2026-10-14 baseline on the same Mac. Also check that every tab still loads its data (signed out and as the owner) and that deep links work.

## Result of steps 1-3 (approved and shipped 2026-10-15)
Overview's main content dropped from 5.3 s to 0.8 s; layout shift went to ~0 on every tab measured (see `docs/brand/README.md`). Teams and Goalies still show their main content after about 5.5 s on the slow profile, because they need the large documents.

## Step 2 proposal (for the owner's decision; nothing built)
The large documents and why they're large (uncompressed):
- `players` (~480 KB): every skater's per-60 stats for the ratings; most tabs need only `id, name, team, pos, ratings`.
- `playerValue` (~330 KB): fine-grained, but every field is used by the trade engine.
- `injuries` (~250 KB): includes the full previous season; only the Teams card needs it.
- `assets` (~200 KB): includes `wikiPages` and the draft curve; used by the Assets card and trades.
- `lines` (~180 KB): every unit's details; used by one Teams card.

Options, cheapest first:
1. **Load per card, not per tab:** Teams draws its first cards (record, win/lose, strength by position) from `league`, `projections` and `playerValue`, and loads `lines`, `injuries`, `styles` and `assets` behind their own skeletons. It's a client change only, similar to step 1. Expected: Teams' main content after about the player-value download (~1.5–2.5 s on this profile, to be measured).
2. **Publish slim companions nightly:** `playersLite` (id, name, team, pos, ratings: about a quarter of the size) and `injuries` without the previous season, and keep the full documents for the cards that need them. It's a pipeline change, so the dossier and artifacts need updating too.
3. Both.

Recommendation: 1 first, measure, then decide on 2.

## Step 2 result (option 2 approved and shipped 2026-10-16)
**Built:** `scripts/lite.mjs` publishes two slim companions each night, before `publish.mjs`:
- `hockey/playersLite`: the ratings and the per-60 rates the Teams, Goalies and Overview cards read (ratings, player types, style fits, the trade explorer's production line), rounded to 3 decimals, without the nested season and competition blocks. 60 KB gzip instead of 95.
- `hockey/injuriesLite`: this season's man-games lost only, without the server-only roster lists. 5 KB gzip instead of 34.

The site loads them first and fetches the full documents only for the Skaters tab, a player card, or last season's man-games lost (and for past seasons, which have no slim versions).

**Measured, provisional** (Firestore's daily read quota ran out on 2026-10-16 around these runs, so the "after" column may reflect the deploy-snapshot fallback rather than the slim documents; re-measured after the quota reset, see below) (live site, same Mac and profile: 390×844, 1.6 Mbps / 150 ms, CPU 4×, cold cache, median of 3). The baseline tool now also reports `readyMs`, when the tab's main content is in the page, because LCP turned out to be the header's loading text on Teams (0.7 s, not content):

| Tab | Main content before | After |
|---|---|---|
| Teams (team header) | 5.7 s | 5.3 s |
| Goalies (goalie table) | 6.0 s | 5.4 s |
| Overview (standings table) | 6.3 s | 5.8 s |

**What's left, and why** (request timeline from the same runs): `lab.js` is 684 KB (179 KB gzip) and finishes downloading at about 1.4 s; parsing it and starting Firebase takes until about 3.0 s, when the first data request goes out. Data then arrives in two or three waves (Goalies: ~4.2 s, ~6.1 s, ~7.4 s). So about half of the remaining time is the page script itself. Next steps worth weighing, biggest first:
1. Start the public data requests before Firebase starts (plain REST or the deploy snapshot), so they overlap with script parsing.
2. Split `lab.js` so a tab loads only its own code (owner-only Cap, Admin and trade tools are a large share).
3. Fetch each tab's documents in one wave.

Also seen in the before run: Overview's layout shift is 1.10 (it was ~0 on 2026-10-15), likely from the new games/favorites header; worth a look.

## Step 3 proposal (2026-10-19)

Written 2026-10-19 after the rebaseline (`docs/brand/README.md`).

### The problem
Same Mac and profile as every baseline: 390×844, 1.6 Mbps / 150 ms, CPU slowed 4×, cold cache, signed out.

| Tab | Main content, Oct 15 | Main content, Oct 19 | Layout shift, Oct 19 |
|---|---|---|---|
| Overview | 0.8 s | 10.5 s | 1.53 |
| Teams | 5.7 s | 10.1 s | 0.07 |
| Players (was Skaters/Goalies) | 0.7 / 5.5 s | 8.7 s | 0.07 |
| Coaches, Front office, Model | – | 8.7–8.8 s | 0.07–0.49 |

Target: main content ≤ 2.5 s and layout shift ≤ 0.1 on this profile.

### What causes it (request timeline of one cold Overview load, ms after navigation)
| When | What |
|---|---|
| 0.4 → 2.3 s | `lab.js` downloads: **275 KB compressed (1.07 MB)**, up from 179 KB on Oct 16. DOMContentLoaded at 2.4 s. |
| 2.4 → 4.0 s | `cloud.js`, then the Firebase SDKs (app, auth, Firestore, App Check). |
| 4.1 s | The public league snapshot arrives (34 KB). The games header is inserted: **layout shift 0.69**. |
| 4.3 → 6.3 s | **reCAPTCHA Enterprise script for App Check: 355 KB compressed**, competing for the same slow connection. |
| 6.4 → 8.2 s | reCAPTCHA anchor, then App Check token exchange. |
| 8.3 s | First Firestore request. |
| 9.0 → 10.0 s | The other ten public documents (players, value, lines, assets, projections…), **about 160 KB compressed, finally requested**. |
| 10.1 s | Content replaces the skeleton: **layout shift 0.79**. Main content ready at 10.7 s. |

So the three causes, biggest first:

1. **Every public document waits for App Check (new since Oct 16, about 5 s).** `getData()` asks Firestore first, with an 8-second timeout, and only falls back to the public `/data/hockey/*.json` files when that fails. Since App Check is enforced on Firestore, that first request can't go out until reCAPTCHA has downloaded (355 KB), run and swapped a token. Those files are public and could have arrived at about 3 s.
2. **`lab.js` has grown to 1.07 MB** (275 KB compressed, about 2 s on this profile), and every visitor downloads all of it. By section (uncompressed):
   - Owner/Admin-only: methods dossier and changelog 100 KB, visitor analytics 32 KB, scorecards 27 KB, trade-engine self-tests 24 KB, architecture 21 KB, model list 20 KB, buyers/sellers 16 KB, war room 6 KB, bug inbox 11 KB: **about 255 KB**.
   - Explainer text opened on tap: "ⓘ How it's measured" 65 KB, "How a trade is valued" sheet 68 KB: **about 135 KB**.
   - Trade engine and its cards (search, explorer, cards, Inside Scoop): about 190 KB. It's needed on Teams, but not to draw Overview.
3. **Two big layout shifts on Overview (1.53 in total), plus 0.42–0.49 on Coaches and Front office.** The footer and the "How we measure" bar sit right under a short `#view`, so the games header (at 4.1 s) and then the real content (at 10.1 s) push them down.

**A separate root cause behind the stale data in B78:** the public `/data/hockey/*.json` files are only rebuilt when someone runs `deploy.sh` on a laptop. The nightly job writes only to Firestore. So those files can be days old, or built from an out-of-date checkout (which is what happened on Oct 19). They're also the files that would make the site fast. Fixing their freshness is what makes step A safe.

### Proposal (separately approvable, in order)

#### A. Fresh public data that doesn't need App Check (pipeline + rules) — recommended first
The nightly job (and the 10-minute game-night job for scores) also writes each public document as JSON to **Firebase Storage under `public/hockey/`**. Storage isn't under App Check enforcement: the Oct 16 rollout enforced it on Firestore only. I'll confirm that in the console before building. It needs one rule, `allow read: if true` for that path only, and a CORS setting on the bucket.
- The site reads these files first (one request each, compressed, cacheable for a few minutes) and keeps Firestore for private data, live scores and anything signed in.
- **Details to handle:**
  - The bucket's rules currently come from `plants-web/firebase/storage.rules`, which `deploy.sh` copies, so the new rule goes into that file.
  - `budget.mjs` meters Firestore and Hosting but not Storage, so I'd add Storage egress to the same $5/month budget and the cutoff.
- **Cost:** Storage download about $0.12/GB, so about 0.3 GB (≈ 4¢) per 1,000 cold page loads. Firestore reads go down at the same time.
- **Alternative considered:** have the nightly job publish a new Hosting version containing fresh `/data` (`budget.mjs` already talks to the Hosting API). That keeps the same origin, but any laptop deploy would overwrite the fresh data with the laptop's copy. Not recommended unless the deploy scripts change too.

#### B. Fetch public data in parallel, and don't wait for Firebase (client)
- **In `index.html`:** preload the current tab's first documents (league and projections for Overview; league, value and lite players for Teams), so they download alongside `lab.js` instead of after it.
- **In `getData()`:** read the fresh public copy from step A first. Use Firestore only for private documents, past seasons not mirrored yet, and as a fallback if the public copy is missing or older.
- **For signed-out visitors:** start Firebase and App Check after the first render, so the 355 KB reCAPTCHA download doesn't compete with data. Signed-in visitors (Feed is their home tab) keep starting it early.
- **Expected** (an estimate to be measured): the data that draws Overview arrives by about 2.5–3 s instead of about 10 s; Teams by about 3.5–4 s.
- **Without A:** B on its own would show possibly days-old numbers first and then swap. That's why A comes first.

#### C. Split `lab.js` (client, no change to the numbers)
1. **First, with no build step:** move the explainer text (INFO, "How a trade is valued", CHANGELOG, dossier text) into separate modules loaded when someone opens them, about 200 KB. It's pure text, so the risk is low.
2. **Then:** move the owner/Admin-only code (about 255 KB) into an `admin.js` module loaded only when an owner opens Admin, war room, buyers/sellers or the bug inbox. That code reads the page's shared state (league, contracts…), so it needs a small shared-state module or a bundler.
   - **Recommendation:** add esbuild with code splitting to `deploy-hockey.sh`, rather than hand-threading state through. It's one dev dependency, and the source files stay as they are.
3. **Expected:** about 45% less script for public visitors (275 → about 150 KB compressed, roughly 0.7 s saved on this profile, plus less parsing).

#### D. Stop the layout shifts (client, small)
- Give `#view` a minimum height of one screen while loading, so the footer and the "How we measure" bar start below the fold.
- Reserve a fixed height for the games header.
- Check Coaches and Front office for the same pattern (0.42–0.49).
- **Target:** under 0.1 everywhere. It's independent of A–C and could ship first.

#### E. Small cleanups found on the way
- **Signed out, one Teams section keeps its loading skeleton forever** (the baseline's 40 s "ready"). Find it and show an empty state.
- **The 32 team-logo SVGs** load on every Overview visit. They're cached after the first visit; leave them unless they show up as a problem.

### Recommendation
- **Order:** D (quick, no risk) together with C1, then A + B together, then C2.
- **After each step:** rerun `node docs/brand/tools/baseline.mjs` and compare with `baseline/2026-10-19`.
- **What I need from you to start:**
  1. Go-ahead on D and C1 (client only).
  2. Go-ahead on A: a new public Storage path and rule, a CORS setting on the bucket (one command, which I can prepare), and adding Storage to the budget guard.
  3. Go-ahead on esbuild for C2 (it adds a build step to `deploy-hockey.sh`).

### Not proposed
- **Removing or loosening App Check.** It protects Firestore writes and the budget. The fix is to stop putting public reads behind it.
- **A service worker.** Same reason as before: earlier cache problems.


### Step 3 result so far (D and C1 approved and shipped 2026-10-19; A, B and C2 waiting for the owner)
- **D:** the header lines, account button, tab bar and team switcher reserve their final sizes (measured at 375 and 1280 px), and `#view` stays at least a screen tall while booting or while it shows a loading skeleton. A tiny inline script in `index.html` sets the starting tab's layout class (`games-home` / `feed-home`) at first paint. Layout shift: Overview 1.53 → 0.07; all other tabs 0.03.
- **C1:** `lab-docs.js` holds the explainer text (`INFO_TEXT`), `MODELS`, `METHODS_INTRO` and `CHANGELOG`; `lab.js` keeps each explainer's live sources (`INFO`) and loads the text when an explainer, the Models card, the spec or the dossier opens, and in the background after the first full render. `lab.js` 1.05 → 0.90 MB.
