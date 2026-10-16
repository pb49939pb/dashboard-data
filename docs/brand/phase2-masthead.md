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

## Owner decision needed
Pick **A**, **B** or **neither** (or ask for changes). After that: Patch B/C on the chosen masthead, then the five-fan qualitative test (rollout section 7) and Phase 3 (Today) per the plan. A public switch-over still waits for the Phase 7 name go/no-go.
