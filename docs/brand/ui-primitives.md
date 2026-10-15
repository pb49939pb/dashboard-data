# Current UI primitives (Phase 0 inventory, 2026-10-14)

Hockey Lab is one page, `hockey-web/index.html`, plus `lab.js` (an ES module that renders every tab as HTML strings) and `lab.css` (about 1,150 lines). There's no component framework. A "component" is a function in `lab.js` that returns markup with CSS classes. Brand work changes these primitives in place, one at a time.

| Primitive | Where | Markup / class | Notes for the rebrand |
|---|---|---|---|
| Header / masthead | `index.html` `header.top` | `p.eyebrow#season`, `h1` (gradient text), `p.sub#updated`, `#account` | `h1` uses a team-tinted gradient (`lab.css` `h1`, overridden per team theme). Phase 2's masthead goes here. Keep `#season`/`#updated` (filled by `loadDataInner`). |
| Team switch | `#teamSwitch` | rendered by lab.js | Leave as is. |
| Navigation | `nav.tabs#tabs` (sticky) | buttons with `data-tab`; selected = gradient pill | Phase 1 rule: never rename or reorder tabs. Hash routes (`#overview`, `#teams`…) are the deep links. |
| Card | everywhere | `.card` (16px pad, 22px radius, translucent fill, stroke) with `.card-head` (title + action) and `h3`, `h4` (uppercase section label) | The main visual unit; the brand plan prefers rules and rows over more cards. |
| Section intro text | inside cards | `p.muted` (14px, dim) | The Phase 1 copy pass edits these strings. |
| Table | `table(id, rows, cols, defSort, rowClass)` in lab.js | `.table-wrap > table.tbl`, sortable `th[data-sort]` | Keep `tabular-nums`; sorting state lives in `state.sorts`. |
| Stat tile | `tile(label, value, sub, tone)` | `.tile` / `.tiles` | Used on Cap and Teams. |
| Badge / chip | inline | `.chip` (+ `.ok`, `.bad`, `.you`, `.req`) | Status colors: `.ok` green, `.bad` red. Don't remap to frost/coral silently. |
| Value bars | `valueBars`, `tug()` (recap) | `.tvb`, war bars | Team colors on recap bars (`--L`/`--R`). |
| Chart | inline SVG per feature | `.spine`, `.qotd-line`, rink SVG `.rink`, heat maps | No chart library. Tooltips are SVG `<title>`, so hover-only on desktop; Phase 4/6 must add tap-friendly labels. |
| Explainer (ⓘ) | `addInfoButtons()`, `openInfo(key)` with `INFO` | dialog `#card` | Holds the "how we measure" text; the methods dossier is generated from it. |
| Modal / sheet | `openDialog(d)` | `dialog.sheet` with a pinned `.sheet-x` close; back gesture closes it | Recap is `dialog#recap`; Question of the day and the explainers use `#card`. |
| Source attribution | `src([name, when], …)` | `p.src` ("Source … (date)") | 11px, 45% white. The plan asks for "slightly easier to discover"; keep it on every card. |
| Footer | `index.html` | `footer.foot` with the Question of the day link | |
| Skeleton / loading | various | `.skeleton` | The text of loading and empty states is a Phase 1 item. |

## Theme mechanics
- `:root` tokens in `lab.css`: `--bg`, `--card`, `--stroke`, `--fg`, `--dim`, `--ice` and `--violet` (team accents, set per team by `applyTheme`), `--team`, `--tint`, `--good`, `--bad`, `--font` (system rounded stack).
- Team themes re-color the accents. That's identity, not performance. Keep it.
- **Where a scoped brand token layer goes (Phase 2, not yet active):** a new block at the **end** of `lab.css`, scoped to an opt-in class (`.tos-surface { --tos-ink: #0D1822; … }`), applied first only to the header element `header.top` (the masthead) and later to the Today module. Because it's scoped and appended, no existing selector changes and the rollback is deleting one block and one class attribute. Don't touch `:root`.

## Fonts and bytes
No web fonts are loaded today (the system stack only). Any new font is a measured Phase 2+ decision (see `baseline/…/metrics.json` for bytes).
