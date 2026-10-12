# dashboard-data

Small JSON files for the personal dashboard at https://patrickreidbaldwin.com, rebuilt every 15 minutes by
GitHub Actions (`.github/workflows/update.yml`) and served by GitHub Pages, which lets the dashboard read them.

- `redwings.json`: Detroit Red Wings record, standings, schedule (with TV), skater and goalie stats
  (NHL api-web.nhle.com) plus expected-goals data from MoneyPuck.com.

Run locally: `node scripts/redwings.mjs` (writes `public/redwings.json`).
