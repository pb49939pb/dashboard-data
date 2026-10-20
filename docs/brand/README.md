# The Other Score: gradual rebrand of Hockey Lab

The plan is `rollout.md`: the owner's phased plan, copied verbatim. The creative direction is in `the-other-score.md`, the voice and labels in `voice.md`, the current building blocks in `ui-primitives.md`, and the per-change checklist (with the agent guardrails) in `ui-review-checklist.md`.

## Phase status
| Phase | Focus | Status |
|---|---|---|
| 0 | Baseline & guardrails | **Done 2026-10-14**, approved by the owner 2026-10-15 |
| 1 | Editorial voice (copy only) | **Done 2026-10-15** (`phase1-copy.md`), approved by the owner 2026-10-16 |
| 2 | Brand signature (scoped masthead) | **Done 2026-10-16 on Center ice** (`phase2-masthead.md`). The masthead is public since 2026-10-18 (Phase 7); section headers and tabular figures stay an owner preview |
| 3 | Today as flagship | **Done 2026-10-16, owner preview** (`phase3-today.md`), approved by the owner ("Phase 3 looks good"); public switch-over not yet decided |
| 4 | "After the Horn" recap | **Built on branch `phase4-recap`** (hockey-web worktree `../hw-recap`), not merged: waits for the owner's test on real recaps. main's recap layout changed since (2026-10-17), so the branch needs a rebase |
| 5 | Teams → Skaters → Goalies → Model | One page family at a time |
| 6 | Charts, shared primitives, owner Workbench | Last |
| 7 | Public rename | **Name public since 2026-10-18, on the owner's go**: masthead (in index.html, so there's no Hockey Lab flash), page title, app manifest, attributions and labels; same `/hockey/` routes. Still open: domain and trademark check (owner), a domain move (separate project), social-preview metadata, a brand-colored icon |

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

## Rebaseline (2026-10-19, live site after the bug-triage deploy; `baseline/2026-10-19/`)
Same profile and machine as above (390x844, 1.6 Mbps / 150 ms, CPU 4x, median of 3 cold loads), current tabs only (Skaters and Goalies are now Players; Shot maps and Cap & trades live inside Teams). Screenshots at 320, 360, 390, 430 and 1280 px, signed out.

| Tab | Content ready | LCP | CLS | Requests | Transfer |
|---|---|---|---|---|---|
| Overview | 10.7 s | 10.5 s | **1.53** | 85 | 1,315 KB |
| Teams | 39.5 s* | 10.1 s | 0.07 | 77 | 1,413 KB |
| Players | 8.6 s | 8.7 s | 0.07 | 59 | 2,327 KB |
| Coaches | 9.1 s | 8.7 s | 0.49 | 50 | 1,210 KB |
| Front office | 11.6 s | 8.7 s | 0.42 | 57 | 1,587 KB |
| Model | 9.0 s | 8.8 s | 0.07 | 47 | 1,170 KB |

\* Teams hit the tool's 40 s cap: a lazily filled section keeps a loading placeholder, so "no skeleton left" never comes true. Treat its LCP as the useful number.

**Compared with 2026-10-15:** first loads are much slower. Overview LCP went 0.8 s → 10.5 s, its layout shift 0 → 1.53, and transfer roughly doubled on every tab (lab.js is now about 1 MB, plus more documents loaded up front). The cause is mostly script size and parse time under the 4x CPU slowdown: the page's first content waits for the whole script. This confirms the open queue item (Overview CLS regression, lab.js size) and should be the next performance step.

**Tool change:** "content ready" is now one test for every tab (#view has 800+ characters and no loading skeleton), and the tool waits up to 40 s for it before reading metrics. Before this change, a quiet network ended the measurement while the throttled CPU was still running the script, so every non-Overview tab reported about 1.0 s with no content. Numbers before 2026-10-19 used per-tab selectors that no longer exist for the redesigned pages, so compare LCP, CLS and transfer only, not "ready".

## After perf steps D and C1 (2026-10-19, live; `baseline/2026-10-19-after-d-c1/`)
| Tab | Layout shift (rebaseline → now) | LCP |
|---|---|---|
| Overview | 1.53 → **0.07** | 10.1 s |
| Teams | 0.07 → **0.03** | 9.3 s |
| Players | 0.07 → **0.03** | 8.6 s |
| Coaches | 0.49 → **0.03** | 8.6 s |
| Front office | 0.42 → **0.03** | 8.8 s |
| Model | 0.07 → **0.03** | 8.7 s |

Layout shift now meets the ≤ 0.1 target everywhere. Load time is unchanged, as expected: it is dominated by public data waiting for App Check (steps A and B of `docs/perf/first-load-proposal.md`, awaiting the owner's go). `lab.js` went from 1.05 MB to 0.90 MB; the long text (`lab-docs.js`, about 157 KB) loads in the background after the page is up, so it still shows in this tool's transfer total.

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
