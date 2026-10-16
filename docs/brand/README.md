# The Other Score: gradual rebrand of Hockey Lab

The plan is `rollout.md`: the owner's phased plan, copied verbatim. The creative direction is in `the-other-score.md`, the voice and labels in `voice.md`, the current building blocks in `ui-primitives.md`, and the per-change checklist (with the agent guardrails) in `ui-review-checklist.md`.

## Phase status
| Phase | Focus | Status |
|---|---|---|
| 0 | Baseline & guardrails | **Done 2026-10-14**, approved by the owner 2026-10-15 |
| 1 | Editorial voice (copy only) | **Done 2026-10-15** (`phase1-copy.md`), approved by the owner 2026-10-16 |
| 2 | Brand signature (scoped masthead) | **Done 2026-10-16 on Center ice, owner preview** (`phase2-masthead.md`): masthead, section header, tabular figures; public switch-over waits for Phase 7 |
| 3 | Today as flagship | Next, when the owner says go (optionally after the five-fan test, `fan-test.md`) |
| 4 | "After the Horn" recap | After Phase 3 review |
| 5 | Teams → Skaters → Goalies → Model | One page family at a time |
| 6 | Charts, shared primitives, owner Workbench | Last |
| 7 | Optional public rename | Owner go/no-go after brand, domain and trademark clearance |

Each phase stops for the owner's review before the next one starts (plan, section 5).

## Phase 0 baseline (2026-10-14)
- **Screenshots and load metrics:** `baseline/2026-10-14/` (screenshots are local only) has every public tab at 320, 360, 390, 430 and 1280 px, signed out, plus `metrics.json` (throttled mobile profile, median of 3 cold loads). They were made with `node docs/brand/tools/baseline.mjs` (local Google Chrome over its DevTools protocol, no new dependencies). Rerun the same command after any brand change and compare it with this folder on the same machine.
- **Mobile load metrics (lab, this Mac; median of 3 cold loads at 390x844, 1.6 Mbps / 150 ms, CPU slowed 4x):**

  | Tab | LCP | CLS | Requests | Transfer |
  |---|---|---|---|---|
  | Overview | 5.3 s | 0.15 | 68 | 563 KB |
  | Teams | 0.6 s | 0.15 | 26 | 443 KB |
  | Skaters | 0.7 s | 0.15 | 24 | 444 KB |
  | Goalies | 5.4 s | 0.37 | 65 | 649 KB |
  | Coaches | 5.3 s | 0.37 | 66 | 563 KB |
  | Shot maps | 5.4 s | 0.37 | 37 | 444 KB |
  | Front office | 5.3 s | 0.44 | 56 | 496 KB |
  | Model | 5.3 s | 0.37 | 37 | 444 KB |

  What they tell us before any brand work:
  - Most tabs show their largest element only after about 5.3 s on a slow phone connection (the plan's target is 2.5 s).
  - The layout shifts while data arrives (0.15–0.44 against a target of 0.1).
  - A cold visit moves 440–650 KB.

  These are the numbers no brand change may make worse. Fixing them is a separate performance task, not brand work. The screenshots stay on this Mac (`.gitignore`, about 18 MB); `metrics.json` is kept in the repo.
- **Permissions (signed out, Firestore REST):** `hockey/contracts`, `hockey/teamCap`, `hockey/tradeMoves`, `admin/catalog`, `admin/owner` and `apps/hockey/bugAccess/check` all return **403**. `hockey/league`, `hockey/qotd`, `hockey/playerValue` and `hockey/config` return **200**. Rerun the check below after any change near data loading.
- **Owner view, checked by hand at 390 px (Cap & trades):** it renders fully. One observation for Phase 2: on a phone, the header, the team/season switcher and the tab row take about 430 px (half the first screen) before the first card. The masthead work should shrink this, never add to it.
- **Deep links:** hash routes `#overview`, `#teams`, `#skaters`, `#goalies`, `#coaches`, `#shots`, `#cap`, `#office`, `#model`, `#ideas` and `#admin`; recaps and pop-ups close on the back gesture.

## After the first-load fix (2026-10-15, same profile, live site; `baseline/2026-10-15-after-perf/`)
| Tab | Main content (LCP) | Layout shift (CLS) | Requests | Transfer |
|---|---|---|---|---|
| Overview | 5.3 s → **0.8 s** | 0.15 → **0** | 68 → 24 | 563 → 454 KB |
| Teams | 0.6 s* → 5.7 s | 0.15 → **0** | 26 → 76 | 443 → 684 KB |
| Goalies | 5.4 s → 5.5 s | 0.37 → **0.02** | 65 → 72 | 649 → 687 KB |

\* Teams' 0.6 s in the baseline measured the footer, which used to be the largest thing on screen early. With space now reserved for the header and loading placeholder, the footer is off-screen, so the number is the real content, which on Teams still waits for the large documents (player value, ratings, lines, styles, assets, injuries). Teams also loads more since 2026-10-14: the public GM moves, contract terms and trade block (about 240 KB). Next step: split the large documents or load them per card (queued). Layout shift is fixed everywhere measured.

## How to test the three kinds of visitor
1. **Signed out:** a private window, or `baseline.mjs`. Expect the public tabs; no Cap & trades, Admin or Ideas & bugs; GM moves from the public search; no contract or cap figures anywhere.
2. **Allowed tester** (the account allowed in the Firestore rules; don't put its address in public files): expect an extra "Report a bug" tab and nothing else private.
3. **Owner** (verified owner account): expect Cap & trades, Admin, Ideas & bugs, the war room, buyers and sellers, and GM moves "from the overnight trade search".

Permission check, signed out:
```bash
B="https://firestore.googleapis.com/v1/projects/pat-dashboard-eb494/databases/(default)/documents"; for d in hockey/contracts hockey/teamCap hockey/tradeMoves admin/catalog hockey/league; do echo "$d $(curl -s -o /dev/null -w '%{http_code}' "$B/$d")"; done
```

## Where brand styling will go
A scoped token block appended to `hockey-web/lab.css` and an opt-in class (`.tos-surface`), first on `header.top` only (see `ui-primitives.md`). `:root` and the team themes stay untouched until a later phase proves a wider use.
