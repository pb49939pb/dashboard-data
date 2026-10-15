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
