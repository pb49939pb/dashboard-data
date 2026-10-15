<!-- Copied from the-other-score-gradual-rebrand-rollout-plan.md (owner, 2026-10-14). Phase status is tracked in README.md here. -->
# The Other Score — Gradual Brand & Theme Rollout Plan

**Status:** Proposed implementation plan; no changes to production implied  
**Prepared:** October 14, 2026  
**Current product:** Hockey Lab (`patrickreidbaldwin.com/hockey`)  
**Intended identity:** **The Other Score**  
**Audience:** A small group of passionate NHL fans, predominantly on phones/cellular, plus an owner-only GM workbench  
**Guiding decision:** **Evolve the existing product in small, reversible changes. Do not redesign or rename the entire site in one pass.**

## 0. Executive decision

**We're not launching a new website. We're teaching a working website to speak and look more like itself.**

Hockey Lab already has substantial data, valuable models, and established navigation. The rebrand should increase editorial personality and visual coherence **without reducing speed, usability, correctness, or familiarity**. It should not replace useful analytical density with branding ornamentation.

The destination is an independent hockey publication with an analytical workbench inside it:

- **Emotional premise:** *The game is over; the conversation isn't.*
- **Intellectual premise:** *A final score is a fact. An explanation remains open to evidence.*
- **Voice:** A perceptive hockey fan with a research habit.
- **Design:** **Ink, ice, and evidence**—editorial hierarchy, cool restraint, data as the distinctive visual language.
- **Working strapline:** *The game has a final score. It doesn't have a final explanation.*
- **Short descriptor:** *Independent NHL analysis, projections, and game stories.*

**Critical constraint:** The source brand thesis is a creative direction, not a requirement to enforce a specific shade, font, or layout before seeing them on actual phone screens. Validate choices as the rollout progresses.

### Definition of success

After the final phase, a returning fan should think: *"It still does everything I use, but it now feels like a distinctive, thoughtful hockey site."* They should **not** wonder where the standings went, have to relearn navigation, or wait longer to see scores.

---

## 1. What we're preserving

The current product specification makes these existing capabilities and promises non-negotiable:

1. **Overview:** recent games, current standings, projected standings, playoff/Cup odds, team comparisons, and leaderboards.
2. **Game recaps:** official final score, game flow, turning point, line matchups, player performances, and a shot-quality counterfactual explicitly labeled as such.
3. **Teams / Skaters / Goalies / Coaches / Shot maps / Front office / Model:** existing analysis remains findable and useful.
4. **Owner-only workbench:** contracts, cap, trade explorer, recommended moves, research switches, system health, ideas and bugs remain private, functional, and information-dense.
5. **Evidence:** underlying source, as-of date, time window, model/version, and caveats must remain available after every presentation change.
6. **Speed:** expensive computations remain off the mobile main thread where practical; avoid introducing new heavy libraries for cosmetic purposes.
7. **Methodological humility:** expected goals are not literal goals; trade feasibility is not a real team's acceptance probability; model outputs do not overwrite observed results.
8. **Existing URLs, bookmarks, deep links, accessible controls, and back navigation** continue working.

**Out of scope for the rebrand:** new hockey models; model weight changes; standings rule changes; a brand-new router; redesigning all data tables; rewriting the trade engine; changing Firestore structure; rewriting the site from scratch.

**Brand clearance gate:** Until domain/trademark screening and an explicit go decision, use **The Other Score** as an approved *working design direction*, not necessarily an irreversible public rename, domain migration, or replacement of external account identities.

---

## 2. Operating model: how to make a gentle change

### Small-patch rule

Each implementation pull request should have **one primary visible change** and a rollback path. Prefer editing a known component over creating an entirely new design architecture. A phase may have multiple small PRs; it is not one giant commit.

Do not let a coding agent make a broad site-wide design sweep based on a prompt like “make it look more premium.” That nearly guarantees inconsistent styling and accidental regressions.

Every PR must declare:

- **Changed surfaces** and screenshots, especially at 390 CSS px.
- **Explicitly unchanged surfaces** (e.g. nav order, methodology, trade math).
- **Mobile and desktop before/after screenshots.**
- **Performance and accessibility impact**, including newly loaded fonts/assets.
- **Data-correctness and permission checks** if an existing data component moved.
- **How to revert** without reverting unrelated features.

### The maturity ladder

Move progressively through four levels, rather than applying the final design everywhere:

| Level | Name | What changes | Risk |
|---|---|---|---|
| 1 | **Editorial nudge** | Labels, headings, helpful summaries, timestamps | Very low |
| 2 | **Brand signature** | Masthead, restrained accent, typography hierarchy | Low |
| 3 | **Signature experience** | Carefully composed Today and recap surfaces | Medium |
| 4 | **System-wide coherence** | Consistent components/charts across the site | Higher; do last |

**Important:** A page can stay on Level 1 while another advances to Level 3. Total uniformity is *not* a launch prerequisite. Transitional consistency is more important than completeness.

---

## 3. Target visual and editorial system (exploratory, not hard-coded site-wide)

### Theme primitives

From the brand thesis, initial *candidate* colors:

| Role | Candidate | Use | Rollout rule |
|---|---|---|---|
| Arena ink | `#0D1822` | Deep background | First use locally on masthead / branded modules |
| Slate panel | `#243747` | Secondary surfaces | Do not wrap every section in a card |
| Scorebook paper | `#F2F0E9` | Foreground and optional long-form treatment | Test contrast at normal body size |
| Rink frost | `#A3D8D4` | Editorial links, secondary analytical accent | Not a universal success color |
| Steel | `#A8BCC9` | Secondary labels and metadata | Verify contrast on every surface |
| Signal coral | `#F08065` | Sparing highlights and critical narrative annotations | Not a generic loss/badness color |

Do **not** immediately replace the application's current CSS variables. Introduce an additive brand token layer in a scoped component or class, then migrate proven uses gradually.

Suggested conceptual token names (map them to your real design system rather than copy-pasting blindly):

```css
/* Candidate brand tokens. Only activate in opted-in sections initially. */
.tos-surface {
  --tos-ink: #0D1822;
  --tos-slate: #243747;
  --tos-paper: #F2F0E9;
  --tos-frost: #A3D8D4;
  --tos-steel: #A8BCC9;
  --tos-coral: #F08065;
  --tos-rule: rgba(168,188,201,.25);
}
```

**Do not:** map every existing green/red chart to frost/coral, change team identity colors, or silently alter chart interpretation during aesthetic refactoring.

### Typography

- **Early phases:** Use existing fonts. Get contrast from size, weight, letterspacing, numeric alignment, and whitespace first.
- **Later controlled test:** Trial a condensed display face for mastheads/score headings and a legible reading font, as suggested by the brand thesis (e.g. Barlow Condensed and Source Sans 3). These are *candidates*, not a mandatory download.
- Load new typefaces **only if** they outperform existing typography on actual phones and justify their bytes. Use fallbacks and avoid loading multiple weights unnecessarily.
- Keep `font-variant-numeric: tabular-nums` for data tables and score columns.
- Body readability and small provenance text must take precedence over stylized display faces.

### Layout and graphic language

- Make one **headline insight or task** dominant, not every card equally loud.
- Prefer editorial **rules and rows** over additional raised cards and decorative icon boxes.
- Use real hockey data as the visual motif: chance comparisons, shot locations, game-flow charts, and annotations.
- If using the “two readings” concept, identify the **official result** first and the **interpretation** second.
- Reuse semantic status colors only after verifying accessible contrast; team color is not performance score.
- Motion should explain an interaction, not advertise the theme. Respect reduced-motion preference.

### Writing contract

**Preferred sequence:** *What happened → What's noteworthy → What supports it → What it does **not** establish → Explore.*

Examples (copy direction, not claims to publish without data):

| Existing/generic copy | Proposed direction |
|---|---|
| “Explore comprehensive hockey analytics” | “There's more to the game than the final score.” |
| “Leverage advanced analytics to evaluate…” | “See what the chances, matchups, and minutes say.” |
| “Our model predicts the real winner” | **Never ship**—the result is the result |
| “The team is due for a bounce-back” | “Its recent results trail its shot quality; that isn't a guarantee of what comes next.” |
| “Trade accepted” | “This package passes Hockey Lab's pricing rule; real-world acceptance is unknown.” |
| “AI-powered insights” | “Independent NHL analysis, with methods and scorecards you can inspect.” |

**No invented quotes, false bylines, forced contrarianism, fake certainty, or unsupported daily headlines.**

---

## 4. Phase-by-phase rollout

This is a **sequence of independent releases**, not a commitment to calendar dates. Each phase includes small implementation patches and an explicit stop/go gate.

| Phase | Focus | User-visible size | Primary surfaces | Risk |
|---|---|---|---|---|
| **0** | Baseline & guardrails | None | Shared infrastructure/docs | Low |
| **1** | Copy/voice | Very small | Overview + common empty states | Low |
| **2** | Small brand signature | Small | Header, titles, shared metadata | Low–medium |
| **3** | First signature feature | Medium, localized | Overview / Today | Medium |
| **4** | First signature recap | Medium, localized | Game recap | Medium |
| **5** | Gradual adoption | Small per page | Teams, skaters, goalies, Model | Medium |
| **6** | Owner tools & consistency | Minimal externally | GM Workbench, shared charts/components | Medium |
| **7** | Optional full naming rollout | Small visible change, operationally sensitive | Brand metadata, links, assets | Medium |

### Phase 0 — Establish a baseline and codify the direction

**Objective:** Make later visual changes safe, testable, and limited in scope.

**Ship:** No significant new production UI.

**Tasks**

1. Add `docs/brand/the-other-score.md` (adapt the existing brand thesis) and `docs/brand/rollout.md` (this plan).
2. Document the current UI primitives: header, nav, section title, card, table, stat number, badge, chart tooltip, modal, data-source attribution.
3. Capture reference screenshots of Overview, a game recap, Teams, Skaters, Goalies, Model, and the owner-only workbench, at 390 px and desktop; also check 360 and 430 px.
4. Establish test runs for signed-out fan, signed-in fan/tester, and owner permissions.
5. Record current mobile performance on a throttled/cellular-like connection using a repeatable procedure and a mid-range phone profile; store results as **baseline**, not invented scores.
6. Identify the smallest safe point to insert a scoped brand token layer without modifying every legacy component.
7. Write an editorial dictionary: observed / expected / projected / hypothetical / inferred / reported, with display rules.
8. Add a lightweight visual-regression mechanism if one already fits the repo; do **not** add an elaborate test platform solely for branding.

**Acceptance gate**

- Screenshots and current behavior are reproducible.
- Existing public/private boundaries and deep links have been checked.
- Agent instructions explicitly forbid statistical-model or data-path changes in styling PRs.

**Reject:** replacing global colors, changing the navigation structure, adding a design framework, or migrating routes in this phase.

### Phase 1 — A warmer editorial voice (no layout redesign)

**Objective:** Make the site sound more like The Other Score before changing how it looks.

**Patch A — Overview microcopy**

- Rewrite the current Overview's introductory heading/subheading and up to five generic section descriptions.
- Keep familiar stat names (`xG`, `GSAx`, `WAR-lite`, `Projected standings`) visible. The brand should never replace precise nomenclature with poetry.
- Add a compact contextual one-liner *only when* a verified fact supports it; otherwise use neutral explanatory copy.

**Patch B — Trust-oriented labels**

- Harmonize the labels for **official**, **observed**, **estimated**, **projected**, **experimental**, and **hypothetical** in the most-trafficked views.
- Make source/date information slightly easier to discover. Do not make it gigantic or hide it behind hover on mobile.
- Rewrite 404, loading, and no-data messages in the new voice: concise, concrete, free of marketing filler.

**Patch C — Navigation helper text**

- Add an optional one-line description inside existing page introductions, e.g. `Game recaps — What happened beneath the result.`
- Do **not** rename familiar navigation tabs in this phase.

**Acceptance gate**

- All claims are accurate and correctly qualified.
- No new JS bundle, data dependencies, or network calls.
- Existing feature discoverability unchanged or improved.
- A fan can still identify what a metric measures without opening an explainer.

**Rollback:** revert isolated copy file(s) or string changes.

### Phase 2 — Add one recognizable brand signature

**Objective:** Introduce the identity without repainting every component.

**Patch A — Masthead experiment**

- Prototype two small header variants: a typographic **THE OTHER SCORE** masthead and a transitional **THE OTHER SCORE / HOCKEY LAB** treatment.
- Preserve current route, page title structure, nav locations, and logo click behavior.
- Keep masthead compact. On a phone, it must not push the live games or first meaningful content materially farther below the fold.
- Use the candidate ink/paper/frost palette *inside this small region only*, contingent on contrast testing.

**Patch B — Editorial signature**

- Introduce a thin solid/secondary baseline motif in exactly one or two controlled places (masthead rule, major heading underline).
- Rework a single shared section header primitive to support a small eyebrow, clear heading, optional timestamp and one contextual link.
- Avoid applying the new component globally until the example is approved.

**Patch C — Type tuning**

- Improve scores' and statistics' numeric alignment with existing fonts.
- Test condensed type in the masthead only, then decide whether it earns a wider role. Avoid a new font request until measured.

**Acceptance gate**

- Mobile header does not obscure navigation or require scrolling past a brand hero.
- No dark-on-dark or faint-frost accessibility failures.
- No significant bundle/font-load regression relative to Phase 0 baseline.
- The design reads as independent hockey analysis, not a gambling app or generic SaaS product.

**Rollback:** remove the scoped masthead treatment/opt-in class; retain all previous components.

**Naming caveat:** A full public rename waits until the Phase 7 go/no-go decision; a small brand-preview treatment can be kept owner-only if clearance is incomplete.

### Phase 3 — Make *Today* the first flagship expression

**Objective:** Show what this identity *means* in an experience people return to.

**Dependency:** Use `hockey-lab-today-feature-spec.md` as the feature's authoritative behavioral spec. This phase focuses on brand presentation; **do not invent a second editorial selector or rewrite its rules**.

**Patch A — Integrate Today near the top of Overview**

- Branded eyebrow: `THE OTHER SCORE / TODAY` (or transitional `HOCKEY LAB / TODAY` until brand clearance).
- Lead with the existing spec's `What do the numbers say?` idea.
- Show **at most three** compact discoveries: a verified interesting result, a justified season-level team observation, and the existing Question of the Day; fewer if qualifiers aren't met.
- Respect live-game priority: never replace or bury critical scores with editorial prose.

**Patch B — Establish the editorial row**

- One line of observation, one supporting measure, one destination link.
- Use simple horizontal rules and typographic hierarchy, not three identical raised cards with generic icons.
- The user should reach an existing recap/team/question destination with one tap; preserve browser back behavior.

**Patch C — Honest empty state**

- If no candidate qualifies, show a short neutral note or the existing question—not a made-up “shocking result.”
- The module must still work during early-season small samples and nights without NHL games.

**Acceptance gate**

- Story selection, source, thresholds, and timestamps follow the Today spec.
- Module renders from precomputed data and does not start new large browser calculations.
- No privileged owner-only data leaks into public payloads.
- Useful content remains available quickly on cellular; no page-jumping while loading.
- A new visitor can explain what the featured statistic means without seeing a methodology wall.

**Rollback:** hide/remove the Today presentation; the underlying standings and recaps remain unchanged.

### Phase 4 — Give one game recap the *After the Horn* treatment

**Objective:** Validate the most distinctive editorial pattern without rebuilding the recaps system.

**Patch A — The opening hierarchy**

1. **Official score and result** first.
2. A concise evidence-backed lead: e.g. what the 5v5 chances, special teams, or goaltending added to the story.
3. One meaningful graphic: existing xG flow or shot-quality comparison.
4. A clearly labeled route to full box scores, line matchups, shot maps and detailed model information.

**Patch B — Two readings, correctly labeled**

- Name the first section `The final score` and the supporting interpretation `Beyond the result` or `What the numbers saw`.
- Never introduce an “actual score vs real score” frame.
- If xG and the final score tell similar stories, acknowledge that. Do not force a disagreement.
- Preserve important game context and sample-size caveats.

**Patch C — Mobile readability**

- Keep the first view small enough to convey the score plus one clear reading.
- Avoid a huge chart legend or table ahead of the main takeaway.
- Ensure chart information does not rely on hover; add tappable data points and accessible labels.

**Acceptance gate**

- User can find official score, shot-quality evidence, and detailed box score without hunting.
- No change to recap math or which event is classified as a turning point.
- Comparisons, units and strength states (`5v5` vs all strengths) are explicit.
- A previously saved recap deep link still works.
- No material increase in mobile chart CPU or data transferred.

**Rollback:** switch back to old recap layout using existing data structures.

### Phase 5 — Carry the language into Teams, Skaters, Goalies, and Model

**Objective:** Expand only patterns that worked in Today and recaps. Advance **one page family at a time**.

**Teams (first)**

- Start with actual record/projection, followed by the existing reconciled goal-differential story.
- Introduce one editorial sentence only where metrics support it, and a “where the goals came from” hierarchy.
- Keep roster, lines, injuries, assets and existing shortcuts easy to reach.

**Skaters (second)**

- Improve identity and comparison hierarchy: player → observed production/context → model estimate/uncertainty.
- Keep 40–99 ratings available; don't make them the sole expression of player value.
- Label observed WAR-lite vs future projected value clearly.

**Goalies (third)**

- Give season GSAx, shooter-aware diagnostic, shot sample sizes and intervals coherent spacing and direct labels.
- Don't change shot-type rating thresholds or shrinkage during a visual PR.

**Model / Show Your Work (fourth)**

- Add a recognizable `Show Your Work` editorial title while preserving the existing Model tab's navigation and detailed scorecards.
- Organize cards around: what a model claims, how it was tested, what it failed, and what isn't known.
- Do not replace concrete scores with vague marketing claims about “accuracy.”

**Acceptance gate (per page, not only at end of phase)**

- Existing tables and filters retain full functionality.
- Data labels remain correct at each unit/strength/season selection.
- Page is faster to scan at 390 px and not slower to operate.
- No new top-level tabs or mandatory onboarding.

**Rollback:** restore the old composition for the specific page only; all shared model data continues to work.

### Phase 6 — Harmonize charts and the private Workbench last

**Objective:** Consolidate approved patterns without turning the whole app into one repetitive template.

**Public chart improvements**

- Standardize units, direct labels, provenance, meaningful baseline, legend behavior and responsive annotations for *one chart family at a time*.
- Prefer chart-local improvements over a wholesale visualization-library migration.
- Preserve genuine team colors and league conventions unless clearly labeled alternative colors are beneficial.
- Update shot maps, trend charts, and comparison bars only when each has its own design reason.

**Shared components**

- Move the proven masthead/section-header/editorial-row patterns into shared primitives if duplication now justifies it.
- Deduplicate token usage after individual pages have stabilized.
- Reduce visual noise (unnecessary bordered cards and duplicate labels) without removing useful information.

**Private GM Workbench**

- Share typography, spacing, rule style and provenance conventions with the public brand.
- Preserve dense comparison tables, trade values, constraints, eligibility and admin controls. The workbench's functional efficiency outranks editorial sparseness.
- Keep owner-only data access, cap-table rules and trade evaluation untouched by styling changes.
- If desired, label the section **The Workbench** *inside* the existing owner-only view; do not add a new public tab.

**Acceptance gate**

- A returning owner can complete the same trade scenario with no additional steps.
- A public fan isn't shown privileged data or links to restricted content.
- No source labels or uncertainty markings disappear in component consolidation.
- Chart tooltips, keyboard access and touch behavior remain correct.

**Rollback:** revert only migrated primitive(s), or use legacy components on affected pages.

### Phase 7 — Decide whether and how to complete the rebrand

**Objective:** Switch from a *gradually emerging identity* to a stable product name only after it has been proved in real use.

**Preconditions**

- Brand/domain/trademark checks and explicit approval are complete.
- Tested phone views are accepted by a few actual passionate fans.
- Navigation, accessibility, data correctness, and performance have no unresolved launch-blocking regression.
- Source document names, generated docs, and public claims are aligned, even if some internal repositories continue to use old names.

**Optional launch tasks**

1. Choose whether the public header should display just **The Other Score** or a transitional `The Other Score — formerly Hockey Lab` note for a limited period.
2. Update document title, social/link-preview metadata, favicon, alt text, source/publication attribution and app manifest (if present).
3. If adopting a new domain, plan canonical URLs, redirects, analytics continuity, deep-link verification, CSP/auth allow-lists and old-bookmark preservation **as a separate project**. This rollout does not require a domain change.
4. Update public explanation of the brand while keeping model/data provenance independent of the name.
5. Preserve existing `/hockey/` links until a migration is intentionally scheduled and tested.

**Acceptance gate**

- No broken bookmarked deep links, account access regressions, or SEO/metadata confusion.
- Fans understand what the product does from the first screen.
- The brand feels intentional, not like the same app with a large new logo pasted on it.

**Rollback:** Keep the infrastructure and routes stable while reverting brand-facing text/assets if needed.

---

## 5. The first three implementation slices I would authorize

Do not send an agent the entire rollout and ask it to implement every phase. Start with the three smallest independently reviewable changes:

### Slice 1: Editorial copy pass

**Scope:** Current Overview heading/subheading, up to five section descriptions, and a consistent observed/estimated/projected label pattern. **No colors, layout, fonts or model logic.**

**Required output:** changed files, old/new copy diff, screenshot at 390 px, tests passed.

### Slice 2: Scoped masthead/header prototype

**Scope:** Opt-in masthead component and thin dual-rule motif, using local candidate tokens. Keep nav, routes and existing content heights effectively unchanged. **No global palette replacement.**

**Required output:** comparison of old vs two proposed header variants at 390 px; exact extra transferred bytes (if any); contrast check.

### Slice 3: Today presentation using existing feature spec

**Scope:** Implement/integrate the *Today* module from its current feature specification, using the chosen heading/eyebrow. Reuse existing data, source metadata, question content, and deep links. **No new model.**

**Required output:** screenshots for strong-story, weak-story, no-game and early-season states; source/version assertions; permission and mobile tests.

**Pause for human review after each slice.** If the voice or masthead looks wrong, adjusting it now is much cheaper than applying the mistake to nine screens.

---

## 6. QA scorecard and stop-the-line thresholds

### Minimum review matrix

For every user-visible phase, verify:

| Dimension | Check |
|---|---|
| Mobile widths | 320, 360, 390, 430 CSS px |
| Desktop | Existing common desktop viewport |
| Network | Cellular-like throttling; first and repeat visit |
| Data states | Live, final, no games, partial/stale data, failed source |
| Access | Signed-out, signed-in normal user/tester, owner |
| Interactions | Touch, keyboard, back, deep links, dialogs |
| Accessibility | Contrast, heading order, semantic links, reduced motion, labels without hover |
| Charts | Units, baselines, colors, legend, source/date, small samples |
| Data integrity | Existing numerical values and source attribution unchanged by style-only PR |
| Performance | Compare key metrics against actual Phase 0 baseline |

### Proposed performance goals (targets, not observed site measurements)

- Work toward **LCP ≤ 2.5 seconds**, **INP ≤ 200 ms**, and **CLS ≤ 0.1** on representative mobile visits; track lab and eventually field results rather than treating a single test as ground truth.
- No new blocking third-party scripts or decorative animation frameworks.
- Keep new first-viewport brand assets extremely light; text/vector/CSS before image-heavy treatments.
- Prefer zero new fonts in the first four phases; if a later font is adopted, document its cost and demonstrate a readability improvement.
- Avoid large client-side calculations in Today, recap headlines or other purely editorial UI.

### Stop and correct before continuing if…

- Existing numbers change as a side effect of a styling PR.
- A headline confuses shot-quality evidence with actual outcomes.
- Today's editorial slot loads an old/private artifact or cannot show source/date.
- A common task (scores, standings, opening a recap, selecting a team) requires more effort.
- The first mobile viewport is taken over by branding instead of hockey content.
- User-visible text contrast or accessible interactions regress.
- Key mobile metrics materially deteriorate versus the recorded baseline without a justified functional gain.

**Do not use conversion-rate targets or audience-growth claims as a gating mechanism for this small, passionate-fan audience.** Favor comprehension, utility, trust, and repeat-use feedback.

---

## 7. Fast qualitative test with a handful of fans

A small audience is an advantage here. After Phases 2, 3 and 4, ask **three to five** hockey fans to try the mobile site **without explaining the design first**.

Ask them to do three tasks:

1. Find the result of the latest completed game and explain whether The Other Score agrees with the game's final result (the correct answer is that the final result isn't disputed).
2. Find one interesting piece of evidence supporting a Today's headline.
3. Get from a recap to its detailed player or lineup analysis.

Then ask: *"Does this feel like an interesting independent hockey site? Is any part confusing, slow, or too self-important?"*

Record qualitative notes. Look for recurring confusion, not just preference for one aesthetic. **No fake statistical significance from five people.**

---

## 8. Suggested design-system artifacts

Keep artifacts small and actionable:

```text
docs/brand/
  the-other-score.md          # Creative/emotional thesis; source of truth
  rollout.md                  # This phased plan
  voice.md                    # A short vocabulary + copy examples
  ui-review-checklist.md      # Phone-first PR checklist

src/.../styles/
  brand-tokens.css            # Scoped candidate variables; defer global migration

src/.../components/
  EditorialSectionHeader.*    # Add only after prototype proves useful
  StoryRow.*                  # Reusable Today/recap affordance if needed
```

Paths are examples; conform to the actual repository layout. **Do not invent new infrastructure** solely to satisfy a diagram of desired files.

### Document maintenance

The existing product spec says feature changes update the product spec, methods dossier, model inventory and architecture diagram. Apply that discipline proportionally:

- **Pure copy/visual tweak:** brand docs, component references and changelog; no fabricated statistical or architecture changes.
- **New Today data artifact or navigation:** product spec, relevant artifact/architecture docs, generated inventory as appropriate.
- **Changed statistical calculation:** a separate modeling PR, dossier update and scorecard according to the existing model promotion rule—not silently as part of this brand rollout.

---

## 9. Ready-to-paste guardrail for a coding agent

> **Task:** Implement only the specifically approved phase/slice of The Other Score gradual rebrand. Read `docs/brand/the-other-score.md`, this rollout plan, the existing product spec, and the relevant feature spec before editing. Preserve all current data behavior, models, APIs, Firestore permissions, routes, deep links and owner-only boundaries. Design phone-first at 390 px, test 360 and 430 px, and preserve existing desktop use. Make the smallest reversible code change. Do not redesign unrelated pages, introduce gradients/decorative icon grids, change brand colors globally, add new heavy fonts/libraries, invent editorial facts, or turn an estimate into a claim of certainty. Report which pages and files changed, before/after screenshots, contrast and mobile performance checks, unchanged data behavior, and an explicit rollback plan. Stop after this slice for review; do not advance to the next phase autonomously.

---

## 10. Final recommendation

**The order of operations is intentional:**

1. **Get the language right.** A site can feel deeply human before changing its colors.
2. **Give it one recognizable signature.** A restrained masthead and editorial rule are enough to begin.
3. **Prove the identity on a useful feature.** Today earns the branding by saying something worth reading.
4. **Prove it in a game recap.** Official score first; supporting evidence second.
5. **Let the pattern spread gradually.** Don't force a polished editorial layout onto an owner-only analytics workbench.
6. **Only then decide whether to complete the public rename.** Naming, visual design and domain migration are separate decisions.

**The Other Score should feel like Hockey Lab growing into a point of view—not Hockey Lab being replaced by a theme.**

---

## Source materials and interpretation

This plan is grounded in the user's provided project documents:

- `the-other-score-brand-thesis.md` — the intended emotional identity, voice, visual concepts, initial palette, branding and page ideas.
- `hockey-lab-product-spec.md` — current features, users, private/public boundaries, reliability commitments and navigation.
- `hockey-lab-today-feature-spec.md` — proposed deterministic Today feature, mobile constraints, content rules, navigation and provenance.
- `hockey-lab-architecture.pdf` and `hockey-lab-methods (1).md` — data dependencies, model limitations and production/shadow separation.

The phases, sequencing, QA criteria and implementation artifacts are **recommendations**, not statements about what is already deployed or which CSS/component framework the repository uses. Actual colors, fonts, screenshots, network budgets and launch dates must be validated against the running code and target devices.
