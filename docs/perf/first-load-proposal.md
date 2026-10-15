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
