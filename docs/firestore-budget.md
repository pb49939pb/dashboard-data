# Firestore budget guard

Added 2026-10-16, when a busy day passed the free read quota and the project moved to the Blaze plan with a $5/month
budget. The owner's rule: never spend more than $5 a month on Firestore.

## What runs
- `scripts/budget.mjs`, every 10 minutes from `budget.yml` and `dispatch.yml`, and every 10 minutes inside the
  game-night job (`live.mjs`), because GitHub can delay or drop frequent schedules.
- It reads today's document reads, writes and deletes for the whole project from Cloud Monitoring
  (`firestore.googleapis.com/document/{read,write,delete}_count`), from midnight Pacific. That covers Hockey Lab
  visitors, the dashboard apps and every data job. Monitoring trails by a few minutes.
- It prices what is past the free daily quota (50k reads, 20k writes, 20k deletes) at the database location's rate.
  The database is **nam5** (multi-region US): $0.06 reads, $0.18 writes, $0.02 deletes per 100k. Unknown locations get
  the multi-region price.
- It writes `admin/budget` (owner-only), which Admin › Usage shows.

## The cutoff
- Past **$5/30 ≈ $0.167 in a day**, or $5 in the month: it saves the name of the live ruleset and releases a lockdown
  ruleset (everything denied except the owner's verified sign-in) through the Firebase Rules API.
- Data jobs use the service account, which bypasses rules, so they check `admin/budget` themselves:
  `store.openStore()` returns null (the same path as "no credentials"), and `dispatch.mjs`, `today.mjs` and
  `tradeMoves.mjs` check `budgetCutoff()`. The site falls back to its published files.
- At the next Pacific day it releases the saved ruleset again, but only if the lockdown is still the live one. If
  someone deployed rules in the meantime, theirs stay.
- At nam5 prices the daily cap allows roughly 280k reads past the free 50k, so normal traffic never gets near it.
  The cap guards against a runaway loop or someone hammering the public config.

## What it needs
- The data service account (GitHub secret `FIREBASE_SERVICE_ACCOUNT`) needs the **Monitoring Viewer** role
  (`roles/monitoring.viewer`) to read the counts. Until it has it, the counts read "–" and Usage shows a warning.
- Rules access was checked on 2026-10-16: `budget.yml` with `test_rules` creates and deletes the lockdown ruleset
  without releasing it, and that test passed.

## Not guaranteed
- Measurement is up to ~10 minutes behind, plus Monitoring's lag. A very fast runaway can overshoot the daily cap by
  what it does in that window.
- Anyone can call Firestore with the site's public config, and that is how web Firebase works; the security rules
  decide what they get. App Check (reCAPTCHA Enterprise) would limit requests to the real site. It is not set up yet.
- Storage (about 0.76 GiB, 1 GiB free) and Hosting downloads (360 MB/day free) are billed separately and aren't
  metered here.

## Cheaper reads and writes
- `store.putMany(docs, { index })` keeps a hash of each document's incoming data in one index document. The nightly
  games write (`admin/storeIndex/games/{season}`) skips unchanged games without reading them: about one read instead
  of ~1,300.
- Run logs (`admin/jobs/*`) carry each job's own `firestore: { reads, writes, deletes }`.
- Code-only pushes don't trigger the nightly build (`update.yml` paths-ignore, and `[skip ci]`).
