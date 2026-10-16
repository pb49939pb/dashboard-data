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

## Final: Center ice (owner pick, 2026-10-16) — Phase 2 complete, owner preview
Round 2's other two designs are retired; Center ice is the masthead. While the name decision (Phase 7) is open, everything below shows **only on the owner's header** (on by default; Admin → "Brand preview" turns it off on that device). Scoped by `body.tos`.

- **Patch A, masthead:** THE OTHER SCORE in caps (existing font, weight 900, .045em tracking, one line at every width, 18 px minimum), OTHER in frost, over a frost center line with a coral faceoff dot. Tab row at 390 px: 387 vs 390 today.
- **Patch B, editorial signature:** `sectionHead({ eyebrow, title, when, link })` in lab.js: a voice.md eyebrow label, the heading (ⓘ explainer still attached), an optional timestamp and one contextual link, over the same center line (the motif's second and last place). Used once, on Overview → Projected final standings ("Projected" · "Simulated <time>" · "How well it has held up →" to the Model tab). Off the preview it returns the plain h3, and the card's text keeps its "Projected." label.
- **Patch C, type:** tabular figures for every table cell and the remaining stat chips and ranks (Overview standings tables, Teams position ranks, man-games tiles, GM-move ranks) that weren't already tabular.
- **Condensed type test:** measured "THE OTHER SCORE" at 24 px/900: current font 238 px; Avenir Next Condensed 178 px and Arial Narrow 189 px exist on Apple/Windows-with-Office devices only, so Android and most Windows phones would fall back to the full width; a downloaded condensed face would cost ~15–20 KB. The wordmark already fits on one line at 320 px, so **not adopted**: no font request.
- **Bytes vs before Phase 2:** +1.9 KB lab.js, +0.9 KB lab.css gzipped; no fonts, images or requests.
- **Acceptance gate:** header doesn't obscure navigation or add height (checked 320–1280 px, no overflow); contrast AA everywhere (paper 15.7, frost 11.4, steel 9.1, coral 6.8 to 1 on ink, higher on the page background); no load regression (CSS/markup only, signed-out visitors get the unchanged site); reads as a publication, not a betting app.

**Next (needs Pat):** run the five-fan test (`fan-test.md`) on the preview if you want feedback before Phase 3, or go straight to Phase 3 (Today as the flagship). Turning the masthead on for everyone waits for the Phase 7 name go/no-go.
