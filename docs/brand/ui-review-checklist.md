# Brand change checklist (every rebrand change, phone first)

## Guardrails (agents and humans)
- **No statistical-model, data-path, Firestore, permission or routing changes in a styling or copy change.** If a brand change seems to need one, stop. It becomes a separate modeling change under the promotion rule, with its own dossier entry and scorecard.
- **Existing numbers must not change.** Compare a few values (a team's points, a player's xG, a recap's deserved-to-win %) before and after.
- One primary visible change per release. Small and reversible.
- Don't rename or reorder tabs, remove a source line, or hide anything behind hover on mobile.
- No global palette replacement, gradients, decorative icon grids or new libraries. New fonts only after measuring them (see the Phase 0 baseline).
- No invented facts, quotes or bylines. Use the labels in `voice.md` (official / observed / expected / projected / hypothetical / inferred / reported / experimental).
- Stop after each approved slice for the owner's review. Never advance a phase on your own.

## Before shipping
- [ ] Changed surfaces listed; explicitly unchanged surfaces listed (nav order, methods, trade math…).
- [ ] Screenshots before and after at **390 px**, plus 360 and 430, plus desktop (`node docs/brand/tools/baseline.mjs` makes all of them).
- [ ] Mobile load metrics compared with the Phase 0 baseline (same machine and profile); no material regression.
- [ ] Contrast checked (WCAG AA: 4.5:1 for body text, 3:1 for large text and UI), heading order, focus states, reduced motion.
- [ ] Signed-out, allowed tester and owner checked (see README); private data still 403 when signed out.
- [ ] Deep links (`#tab`), the back button and the dialogs still work.
- [ ] Docs: brand docs and the changelog; the product spec if a feature or navigation changed.
- [ ] Rollback written down: which strings, block or class to revert.
