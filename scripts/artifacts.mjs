// Versioned model artifacts (audit: reproducible, authoritative values; principle 3, "new fields must have an explicit
// model version and as_of date"). Every night, for each model output the site reads:
//   hash      sha256 of the published JSON (first 16 hex): the artifact's identity
//   version / builtAt / asOf, and the code commit that produced the night's build (GITHUB_SHA)
// written to public/hockey/artifacts.json (published as hockey/artifacts), plus a write-once copy of each artifact
// version at hockey/artifactVersions/versions/{name}_{hash} the first time that hash is seen. The site stamps every trade
// valuation with the hashes it used, so any number it shows can be recomputed from the exact inputs.
//   node scripts/artifacts.mjs     (FIREBASE_SERVICE_ACCOUNT for the versioned copies; without it, the manifest only)
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { openStore } from "./store.mjs";

// Field-level metadata (audit section 10): what each key published number is. class = observed | estimate | forecast |
// counterfactual | market | decision; interval = the field holding its uncertainty (or why there isn't one); flags =
// known quality limits. as_of / data_version / model_version are filled from the artifact each night.
const FIELDS = [
  { artifact: "playerValue", field: "players[].war82", class: "estimate", units: "wins above replacement per 82 games (goalies: per 82 team games at their start share)", interval: "none (point estimate; see playerProjections p10/p90)", flags: ["WAR-lite: production + on/off, not teammate-adjusted", "goalie saves above average shrunk by shots/(shots+14,000)"] },
  { artifact: "playerValue", field: "players[].war82Rapm", class: "estimate", units: "wins per 82 on WAR-lite's scale (RAPM order, quantile-mapped)", interval: "none", flags: ["challenger model, not used unless the Admin switch says so", "raw scale in war82RapmRaw"] },
  { artifact: "playerProjections", field: "players[].years[].p50", class: "forecast", units: "wins per 82 in that season", interval: "p10 / p90 (80% range, coverage 0.76-0.82 in tests)", flags: ["goalies excluded in the trade engine (projections predate the goalie shrinkage)"] },
  { artifact: "playerProjections", field: "players[].years[].pActive", class: "forecast", units: "probability of 20+ NHL games that season", interval: "none", flags: [] },
  { artifact: "careerCurves", field: "players/<id>.forecast[].{war,goals,points,gp}", class: "forecast", units: "season totals (unconditional: missed seasons count as zero); war82 = wins per 82 if playing", interval: "q = 10th/50th/90th percentile of 4,000 simulated careers (test coverage 0.75-0.78)", flags: ["experimental: skater cards only, not used in trade values", "static hockey-web bundle (career-data/), not in Firestore", "goalies and players without 2025-26 games not covered; no forecasts past age 40"] },
  { artifact: "careerCurves", field: "players/<id>.forecast[].{pAny,p20,pDone}", class: "forecast", units: "P(any NHL game), P(20+ GP), P(no further NHL games within the 7-season window)", interval: "none (probabilities from the same simulated careers)", flags: [] },
  { artifact: "projections", field: "teams[].playoffs", class: "forecast", units: "% of 10,000 simulated seasons", interval: "playoffsSe (Monte Carlo SE, pp); model uncertainty larger", flags: ["season-long team risk off (not significant in backtest)", "regulation ties under-predicted (23% vs 17%)"] },
  { artifact: "projections", field: "teams[].projPts", class: "forecast", units: "standings points", interval: "lo / hi (10th-90th percentile)", flags: [] },
  { artifact: "projections", field: "upcoming[].pHome", class: "forecast", units: "P(home team wins, incl. OT/SO)", interval: "none", flags: ["frozen at puck drop in the prediction log", "pHomeRoster: shadow roster-aware version"] },
  { artifact: "projections", field: "roster.teams[].playoffs", class: "forecast", units: "% of simulated seasons (roster-aware)", interval: "playoffsSe", flags: ["shadow model unless simModel = roster"] },
  { artifact: "injuries", field: "current.teams[].players[].missed", class: "observed", units: "games missed while with the team (absence proxy)", interval: "n/a", flags: ["not confirmed injuries; status = off-roster / not-dressing / unknown"] },
  { artifact: "tradePricing", field: "summary.sellerReturnRatio", class: "market", units: "seller's return ÷ face value given (ex-ante WAR-lite)", interval: "percentiles p10-p90", flags: ["no contracts in historical values", "not an acceptance probability"] },
  { artifact: "capwages", field: "teams[T][y].all", class: "observed", units: "$ counted against the cap (roster/injured full, minors above min + $375K, buyouts, retained)", interval: "none", flags: ["LTIR relief not modelled (ltir shown)", "overlapAlt: duplicate-contract difference in the source data", "CapWages, licensed; validated nightly before publish"] },
  { artifact: "capwages", field: "players[].hits[]", class: "observed", units: "cap hit $ per season (this season + 5)", interval: "none", flags: ["anomaly: retention record that doesn't add up (verdicts unverified)"] },
  { artifact: "scorecards", field: "*", class: "observed", units: "out-of-sample test results", interval: "95% bootstrap intervals in each test", flags: ["each test states its leakage notes"] },
  { artifact: "assets", field: "market.*", class: "market", units: "Polymarket prices as probabilities", interval: "none", flags: ["comparator only; not mixed into our odds"] },
  { artifact: "xgStandings", field: "seasons[s].teams[].xPts", class: "counterfactual", units: "standings points if every regulation shot went in at its xG (shots held fixed; tie = 1 + coin flip)", interval: "sd (replay spread); UI shows ±1.64 sd", flags: ["not 'deserved' points", "not a forecast: half-season test mixed (seasons[s].test)"] },
  { artifact: "xgStandings", field: "seasons[s].teams[].five / seasons[s].test.repeat5v5", class: "observed", units: "5v5 goals, shots on goal, xG for/against; first-to-second-half team correlations", interval: "none (correlations over 32 teams; two seasons shown)", flags: ["descriptive: PDO and goals vs expected describe games played, not a forecast"] },
  { artifact: "restTravel", field: "games[].h / a (rest, b2b, week, miles), effects", class: "observed + estimate", units: "days, games, miles; effects in win-probability points at an even matchup", interval: "effects[].range (90% bootstrap)", flags: ["display only, not an input to odds", "only back_to_back is clear; others shown as no measurable effect"] },
  { artifact: "milestones", field: "upcoming[].date / gamesNeeded", class: "forecast", units: "projected game for a career milestone at the player's pace", interval: "none (point projection; 'if he keeps his pace and plays')", flags: ["pace = this season x2 + last season, per game", "games = team schedule x his share of team games"] },
  { artifact: "live", field: "games[].advisor", class: "decision", units: "status early/window/late/pulled; pNow, pNever = chance to tie", interval: "none (league-wide rates)", flags: ["~20-45 s behind real time", "not a prediction of the game"] },
  { artifact: "contractTerms", field: "players[]", class: "observed", units: "contract years, status, entry-level, signing date, extension years", interval: "n/a", flags: ["public; no salaries, sources or owner edits"] },
  { artifact: "qotd", field: "questions[]", class: "observed", units: "per question: headline, body, chart (x/y with unit), method, sample", interval: "bootstrap 90% ranges where stated (fights, back-to-backs); otherwise sample sizes", flags: ["descriptive, 2024-25 and 2025-26 regular seasons", "pull timing is a model on measured rates (assumes constant rates)"] },
  { artifact: "tradeMoves", field: "teams[T][].send / get / gain", class: "decision", units: "player/pick ids and long-term value gained (wins)", interval: "none (pricing heuristic)", flags: ["owner-only; not versioned here (contract-derived)", "used only when the page's tradeKey matches"] },
  { artifact: "browser", field: "trade value / market value / How? sheet", class: "counterfactual + decision", units: "wins, phase-weighted, discounted", interval: "none (pricing heuristic)", flags: ["computed in the browser from the versioned artifacts above; stamped with their hashes", "feasibility checks list what isn't verified"] },
];
const NAMES = ["playerValue", "playerProjections", "tradePricing", "scorecards", "projections", "injuries", "assets", "qotd", "xgStandings", "restTravel"];
const commit = process.env.GITHUB_SHA || (() => { try { return execSync("git rev-parse HEAD").toString().trim(); } catch { return null; } })();
const store = await openStore().catch(() => null);
const prev = await readFile("public/hockey/artifacts.json", "utf8").then(JSON.parse, () => null);
const out = { builtAt: new Date().toISOString(), commit, artifacts: {} };
let stored = 0;
for (const name of NAMES) {
  const text = await readFile(`public/hockey/${name}.json`, "utf8").catch(() => null);
  if (!text) continue;
  const d = JSON.parse(text), hash = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const path = `hockey/artifactVersions/versions/${name}_${hash}`;
  const seen = prev?.artifacts?.[name]?.hash === hash ? prev.artifacts[name] : null;
  out.artifacts[name] = { hash, bytes: text.length, model: d.model || null, version: d.version || null, builtAt: d.builtAt || d.updatedAt || null,
    asOf: d.throughDate || d.through || d.season || null, firstPublishedAt: seen?.firstPublishedAt || out.builtAt, commit: seen?.commit || commit, path };
  if (store && text.length < 900000 && !(await store.read(path).catch(() => null))) { await store.put(path, d, { name, hash }, { replace: true }); stored++; }
}
out.fields = FIELDS.map((f) => { const a = out.artifacts[f.artifact]; return { ...f, as_of: a?.asOf ?? null, data_version: a?.hash ?? null, model_version: a ? [a.model, a.version].filter(Boolean).join(" ") || null : null, built: a?.builtAt ?? null }; });
await writeFile("public/hockey/artifacts.json", JSON.stringify(out));
console.log(`artifacts: ${Object.keys(out.artifacts).length} in the manifest, ${stored} new versions stored${store ? "" : " (no Firestore credentials: manifest only)"}`);
