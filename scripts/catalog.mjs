// What every data job does, where it gets data, and which pages use it. Published to Firestore admin/catalog
// for the admin panel (owner only). Keep this in step with the scripts and workflows.
export const CATALOG = {
  jobs: [
    {
      id: "nightly-build", name: "Nightly build", schedule: "Every night, 3 AM Eastern, after the last West Coast games (GitHub Actions: update.yml)", script: "scripts/redwings.mjs",
      sources: [
        { name: "NHL web API", host: "api-web.nhle.com", what: "standings, schedules, rosters, club stats, play-by-play for every game" },
        { name: "NHL stats API", host: "api.nhle.com", what: "goalie game logs (quality starts), shift charts (who was on the ice: lines, pairs, on-ice results)" },
        { name: "MoneyPuck", host: "moneypuck.com", what: "every skater's on-ice expected goals, ice time, zone starts, blocks, takeaways (player ratings); Red Wings xG (widget)" },
        { name: "Firestore (last night)", host: "firestore", what: "games already scored, so only new games are fetched" },
      ],
      outputs: [
        { doc: "public/redwings", pages: ["Dashboard · Red Wings widget"] },
        { doc: "public/redwingsShots", pages: ["Dashboard · Red Wings detail · Shots"] },
        { doc: "hockey/league", pages: ["Hockey Lab · Overview", "Teams", "Skaters", "Goalies"] },
        { doc: "hockey/players", pages: ["Hockey Lab · Skaters (ratings: offense, defense, usage)", "player cards"] },
        { doc: "hockey/playersLite", pages: ["Hockey Lab · first paint of Teams, Goalies, Overview (ratings and player types; built by lite.mjs)"] },
        { doc: "hockey/games/{season}/*", pages: ["Hockey Lab · Shot maps (every shot)"] },
        { doc: "hockey/heat", pages: ["Hockey Lab · Shot maps (heat map)"] },
        { doc: "hockey/lines", pages: ["Hockey Lab · Teams (lines and defense pairs)"] },
        { doc: "hockey/styles", pages: ["Hockey Lab · Teams (style, matchups, fits)", "player and goalie cards (system fits)"] },
        { doc: "hockey/projections", pages: ["Hockey Lab · Teams (projections, bracket)", "Overview"] },
        { doc: "hockey/history/{season}/*", pages: ["(nightly projection snapshots for odds-over-time)"] },
      ],
    },
    {
      id: "contracts", name: "Contracts (full refresh)", schedule: "Weekly, Sunday morning (GitHub Actions: contracts.yml)", script: "scripts/contracts.py",
      sources: [
        { name: "NHL.com team releases", host: "www.nhl.com", what: "term and cap hit (priority 2)" },
        { name: "ProHockeyRumors", host: "www.prohockeyrumors.com", what: "term and cap hit from signing news (priority 3)" },
        { name: "Wikipedia player articles", host: "en.wikipedia.org", what: "term and cap hit (priority 4)" },
        { name: "Wikipedia team season pages", host: "en.wikipedia.org", what: "term, signing date, links to team releases (priority 5)" },
        { name: "NHL web API", host: "api-web.nhle.com", what: "current rosters" },
      ],
      outputs: [{ doc: "hockey/contracts", pages: ["Hockey Lab · Cap & trades"] }],
    },
    {
      id: "contracts-news", name: "Contract news", schedule: "Every night, after the build (update.yml)", script: "scripts/contracts.py --recent",
      sources: [
        { name: "ProHockeyRumors news feeds", host: "www.prohockeyrumors.com", what: "new signings and extensions" },
        { name: "NHL web API", host: "api-web.nhle.com", what: "current rosters (trades move players' teams)" },
      ],
      outputs: [{ doc: "hockey/contracts", pages: ["Hockey Lab · Cap & trades"] }],
    },
    {
      id: "capwages", name: "CapWages contracts and cap", schedule: "Every night, after contract news (update.yml); at most once a day", script: "scripts/capwages.mjs",
      sources: [
        { name: "CapWages API (licensed)", host: "capwages.com", what: "cap hits, terms, clauses, buyouts and retained salary for every NHL player; game-day lineups" },
      ],
      outputs: [{ doc: "capwages/live/teams/* (owner-only)", pages: ["Hockey Lab · Trade explorer cap check (pending)"] }],
    },
    {
      id: "trade-block", name: "Trade block from the news", schedule: "Every night, after contract news (update.yml)", script: "scripts/block.py",
      sources: [
        { name: "ProHockeyRumors league and team feeds", host: "www.prohockeyrumors.com", what: "trade requests and players being shopped" },
        { name: "NHL Trade Rumors", host: "www.nhltraderumors.me", what: "insider reports (Friedman, LeBrun, Seravalli, Pagnotta...) quoted from X and TV" },
        { name: "Daily Faceoff", host: "www.dailyfaceoff.com", what: "news and insider notes" },
        { name: "NHL web API", host: "api-web.nhle.com", what: "current rosters (a traded player drops off)" },
      ],
      outputs: [{ doc: "hockey/contracts (block)", pages: ["Hockey Lab · Cap & trades (trade block)"] }],
    },
    {
      id: "assets", name: "Team assets (picks and prospects)", schedule: "Every night, after the trade block (update.yml)", script: "scripts/assets.mjs",
      sources: [
        { name: "Wikipedia NHL entry draft articles", host: "en.wikipedia.org", what: "who owns each traded pick in the next three drafts, with conditions (CC BY-SA)" },
        { name: "NHL prospects", host: "api-web.nhle.com", what: "each team's prospect list" },
        { name: "Hockey Lab draft model", host: "local", what: "draft slots for prospects, expected value by slot, fallback prospect lists" },
        { name: "NHL player pages", host: "api-web.nhle.com", what: "prospects' season totals in every league (shared cache with milestone watch, about weekly)" },
        { name: "Hockey Lab prospect model", host: "local", what: "league equivalency factors and slot + scoring coefficients (model/prospects.json)" },
      ],
      outputs: [{ doc: "hockey/assets", pages: ["Hockey Lab · Teams (assets card, trade explorer)"] }],
    },
    {
      id: "trade-moves", name: "Trade search", schedule: "Every night, after the nightly build (GitHub Actions: trades.yml); Run now after big edits", script: "scripts/tradeMoves.mjs",
      sources: [
        { name: "Hockey Lab page code", host: "patrickreidbaldwin.com", what: "the deployed trade engine (lab.js), run headlessly so the search matches the page exactly" },
        { name: "Firestore", host: "firestore", what: "tonight's league, projections, player value, projections, assets, contracts, cap table and the owner's saved edits" },
      ],
      outputs: [{ doc: "hockey/tradeMoves", pages: ["Hockey Lab · Teams (recommended GM moves)", "Trade explorer (best trades)"] }],
    },
    {
      id: "publish", name: "Publish to Firestore", schedule: "After each job", script: "scripts/publish.mjs",
      sources: [{ name: "This run's files", host: "local", what: "merged into Firestore; nothing stored is ever dropped" }],
      outputs: [{ doc: "(all of the above)", pages: [] }],
    },
    {
      id: "models", name: "Offline models", schedule: "By hand on the Mac (hockey-models), then committed to dashboard-data/model", script: "python -m hockey.<model>",
      sources: [
        { name: "NHL stats API", host: "api.nhle.com", what: "player seasons since 2005, draft picks, bios" },
        { name: "NHL web API", host: "api-web.nhle.com", what: "play-by-play for model training" },
        { name: "Wikipedia NHL transactions pages", host: "en.wikipedia.org", what: "every trade, free-agent signing and waiver claim" },
        { name: "Wikipedia GM lists", host: "en.wikipedia.org", what: "GM eras by team" },
        { name: "NHL records site", host: "records.nhl.com", what: "every head coach's run with each franchise (coach model)" },
        { name: "MoneyPuck team files", host: "moneypuck.com", what: "team 5v5 and special-teams expected goals since 2008-09 (coach model)" },
        { name: "MoneyPuck skater files", host: "moneypuck.com", what: "skater ice time, shot attempts, on-ice attempts and blocks by situation since 2008-09 (WAR-lite on-ice parts, career curves)" },
      ],
      outputs: [
        { doc: "hockey/model", pages: ["Hockey Lab · Model", "Overview"] },
        { doc: "hockey/frontOffice", pages: ["Hockey Lab · Front office (trades, drafting, pro scouting)"] },
        { doc: "hockey/gm", pages: ["Hockey Lab · Front office (GM eras)"] },
        { doc: "hockey/age", pages: ["Hockey Lab · Front office (age of scoring)"] },
        { doc: "hockey-web career-data/ (static bundle, career.py --export)", pages: ["Skater cards (Career outlook)"] },
        { doc: "hockey/coaches", pages: ["Hockey Lab · Coaches", "team cards (coach line)"] },
        { doc: "hockey/playerValue", pages: ["Hockey Lab · Teams (trade explorer: expected wins per player)"] },
        { doc: "hockey/teamCap", pages: ["Hockey Lab · Cap & trades (official team cap space from PuckPedia, entered by you on the site; owner-only, never in this public repo)"] },
        { doc: "hockey/heatPrior", pages: ["Hockey Lab · Shot maps (early-season blend)"] },
        { doc: "model/ratings.json", pages: ["Hockey Lab · Teams (projections prior)"] },
        { doc: "model/stylePrior.json", pages: ["Hockey Lab · Teams (style archetypes and matchup effects; scripts/stylePrior.mjs, yearly)"] },
      ],
    },
  ],
};
