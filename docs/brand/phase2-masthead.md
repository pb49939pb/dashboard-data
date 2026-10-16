# Phase 2: masthead prototype (two variants) — 2026-10-16

Scope (rollout.md, Slice 2): an opt-in masthead on `header.top` with the candidate ink/paper/frost tokens and a thin double-rule signature. **Owner-only preview** (rollout naming caveat): the variants apply only to the owner's own header, chosen on Admin → "Brand preview: masthead (Phase 2)", stored per device (`localStorage` `hl-mast`). Everyone else sees the current header.

## The variants
| | What it shows | h1 text |
|---|---|---|
| Current | gradient "Hockey Lab" | Hockey Lab |
| **A** (typographic) | THE OTHER SCORE as one uppercase wordmark (existing font, weight 900, letterspaced) over the double rule | The Other Score |
| **B** (transitional) | "THE OTHER SCORE /" kicker in frost (coral slash) over "Hockey Lab" in paper, double rule under the name | The Other Score Hockey Lab |

Both sit in an ink (`#0D1822`) band with a 1 px steel rule outline. The band bleeds into the page gutter (negative margin equal to its padding), so it adds no height and keeps the text column the same width. `#season`, `#updated`, the account link, team switch, tabs and every route are untouched.

## Measurements (live site and local preview, owner header, Overview)
Top of the tab row, CSS px (lower = content higher on screen):

| Width | Current | A | B |
|---|---|---|---|
| 320 | 405 | 404 | 418 |
| 360 | 394 | 393 | 407 |
| 390 | 390 | 389 | 404 |
| 430 | 393 | 392 | 407 |
| 1024 | 286 | 283 | 298 |

A is 1–3 px shorter than today at every width; B adds 12–14 px (its kicker line). No horizontal overflow at any width.

**Bytes:** +1.1 KB (lab.js) and +0.9 KB (lab.css) gzipped; no fonts, images or new requests.

**Contrast on ink (WCAG AA needs 4.5:1 for text):** paper 15.7:1, frost 11.4:1, steel 9.1:1, coral 6.8:1 (the coral slash is decorative).

## Unchanged
Tab names and order, nav, routes and deep links, every number, model, data path and permission, team themes, `:root` tokens, fonts. Signed-out visitors and testers get the current header (`applyMasthead()` is a no-op without the owner catalog).

## Not done in this slice (rollout Patch B/C)
The shared section-header primitive (eyebrow, heading, timestamp, link) and the condensed display-font test. Both wait until a masthead is picked.

## Rollback
Delete the "The Other Score, Phase 2" block at the end of `hockey-web/lab.css`, and in `hockey-web/lab.js` the masthead block (`MAST`, `mastPref`, `applyMasthead`, `brandCard`), `brandCard() +` in `adminView`, the `act === "mast"` handler and the `applyMasthead()` call in `render()`.


## Round 2 (2026-10-16): three new designs, no box
Owner feedback on round 1: A was acceptable, but neither looked good and the ink "card" around the header looked odd. Round 1 (A typographic, B transitional) is retired. Round 2 drops the band entirely; the name sits on the page like a publication's nameplate, in the brand colors:

| | Design | Notes |
|---|---|---|
| **A · Broadsheet** | "The Other Score" in the device's own serif (ui-serif / New York / Georgia), paper color, over a thick-and-thin rule | Reads as a publication; no font download |
| **B · Center ice** | THE OTHER SCORE in caps, OTHER in frost, over a frost center line with a coral faceoff dot | Hockey motif; one line at every width (nowrap, 18 px minimum) |
| **C · Score bug** | THE / OTHER stacked small beside a big SCORE, split by a frost bar, coral dot after SCORE | TV score-bug lockup; the shortest |

Top of the tab row, CSS px (owner header, Overview):

| Width | Current | Broadsheet | Center ice | Score bug |
|---|---|---|---|---|
| 320 | 405 | 402 | 397 | 396 |
| 390 | 390 | 390 | 387 | 384 |
| 1280 | 286 | 285 | 281 | 275 |

None is taller than today's header; no horizontal overflow at 320–1280. Contrast on the page background is at least as high as on ink (paper, frost, steel and coral all pass AA). Bytes since before Phase 2: about +1.6 KB lab.js and +1.1 KB lab.css gzipped, no fonts, images or requests.

**Owner decision needed:** pick Broadsheet, Center ice or Score bug (or ask for another round).

## Round 1 decision (superseded)
Pick **A**, **B** or **neither** (or ask for changes). After that: Patch B/C on the chosen masthead, then the five-fan qualitative test (rollout section 7) and Phase 3 (Today) per the plan. A public switch-over still waits for the Phase 7 name go/no-go.
