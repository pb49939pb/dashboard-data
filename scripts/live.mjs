// Game night: keep Hockey Lab's Recent games, live scores and recaps current while games are on. GitHub runs frequent
// schedules (dispatch.yml's every 10 minutes) only when it has capacity, which can mean hours apart, so this job starts
// once before games (live.yml) and stays up: scores.mjs every 5 minutes while a game is live or about to start, a sleep
// until the next puck drop otherwise, and it ends when the day's last game is final. GitHub stops a job at 6 hours, so
// past ~5h30m it starts a fresh run of itself (gh workflow run) if games are still to come or under way. After the
// night's games it also starts the nightly build at 3:15 AM Eastern if GitHub hasn't (startNightly below).
//   node scripts/live.mjs        (needs FIREBASE_SERVICE_ACCOUNT for scores.mjs; GH_TOKEN to hand off)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { openStore } from "./store.mjs";
import { checkBudget } from "./budget.mjs";
import { advise } from "./pullAdvisor.mjs";

const UA = { "User-Agent": "hockey-lab/1.0 (personal, non-commercial)" };
const EVERY = 5 * 60e3, SOON = 20 * 60e3, BUDGET = 5.5 * 3600e3, started = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const eastern = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

async function games() {
  const days = [eastern(new Date(Date.now() - 864e5)), eastern(new Date())];
  const out = [];
  for (const d of days) {
    const r = await fetch(`https://api-web.nhle.com/v1/score/${d}`, { headers: UA }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    for (const g of r?.games || []) if (g.gameType === 2 || g.gameType === 3) out.push({ id: g.id, start: Date.parse(g.startTimeUTC), state: g.gameState });
  }
  return out;
}

/* Between the 5-minute rounds, while a game is live: every 20 s, the NHL scoreboard (one ~11 KB request per day) ->
   hockey/live (public): clock, score, strength and the goalie-pull advisor for each live game. Written only when it
   changes; about 20-45 s behind real time (NHL CDN cache + this interval). */
const FAST = 20e3;
const pullRates = (() => { try { return JSON.parse(readFileSync("model/qotd.json", "utf8")).questions.find((q) => q.id === "pull")?.rates || null; } catch { return null; } })();
let store = null, budgetAt = 0, cut = false;
// Standings as soon as a game ends (2026-10-23): when a game drops out of LIVE/CRIT, run scores.mjs (final score + the
// NHL's official standings) right away, and once more ~3 minutes later because the NHL standings feed can trail the
// final horn. No projections rerun; the page's standings card reads these official standings.
let liveIds = new Set(), recheckAt = 0;
async function liveTick() {
  // Game nights are when the site is busiest, and GitHub's 10-minute schedule (budget.yml) can lag for hours, so the
  // long-running live job checks the Firestore budget itself every 10 minutes and stops writing if it's passed.
  if (Date.now() - budgetAt > 10 * 60e3) {
    budgetAt = Date.now();
    const b = await checkBudget().catch((e) => { console.log("budget check failed:", e.message); return null; });
    cut = !!b?.tripped;
  }
  if (cut) return;
  store ??= await openStore().catch(() => null);
  if (!store) return;
  const days = [eastern(new Date(Date.now() - 864e5)), eastern(new Date())], rows = [];
  for (const d of days) {
    const r = await fetch(`https://api-web.nhle.com/v1/score/${d}`, { headers: UA }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    for (const g of r?.games || []) {
      if (!["LIVE", "CRIT"].includes(g.gameState)) continue;
      const c = g.clock || {}, pd = g.periodDescriptor || {}, sit = g.situation?.situationCode || null;
      const row = { id: g.id, period: pd.number ?? null, periodType: pd.periodType ?? null, clock: c.timeRemaining ?? null, secondsLeft: c.secondsRemaining ?? null, intermission: !!c.inIntermission,
        home: g.homeTeam?.abbrev, away: g.awayTeam?.abbrev, hs: g.homeTeam?.score ?? 0, as: g.awayTeam?.score ?? 0, situation: sit };
      row.advisor = advise({ period: row.period, periodType: row.periodType, secondsLeft: row.secondsLeft, inIntermission: row.intermission, homeScore: row.hs, awayScore: row.as,
        situationCode: sit || "1551", home: row.home, away: row.away }, pullRates);
      rows.push(row);
    }
  }
  await store.put("hockey/live", { games: rows, at: new Date().toISOString() }, {}, { replace: true }).catch((e) => console.log("live write failed:", e.message));
  const now = new Set(rows.map((r) => r.id)), ended = [...liveIds].filter((id) => !now.has(id));
  liveIds = now;
  if (ended.length) { console.log(`${ended.length} game(s) ended (${ended.join(", ")}); refreshing scores and standings now.`); runScores(); recheckAt = Date.now() + 180e3; }
  else if (recheckAt && Date.now() >= recheckAt) { recheckAt = 0; console.log("Re-checking standings after a final."); runScores(); }
}
async function fastUntil(ms) { const end = Date.now() + ms; while (Date.now() < end) { await liveTick(); await sleep(Math.min(FAST, Math.max(0, end - Date.now()))); } }

function runScores() {
  const r = spawnSync("node", ["scripts/scores.mjs"], { stdio: "inherit", env: process.env, timeout: 8 * 60e3 });
  if (r.status !== 0) console.log("scores.mjs failed this round; trying again next round");
}

/* The nightly build (update.yml) is scheduled for 3 AM Eastern, but GitHub starts schedules late (2026-10-27: almost six
   hours, so the morning's pages had no sign of the night's games). Game night is still up then, so once every started
   game is final and it's past 3:15 AM Eastern it starts the nightly itself, unless one is already running or has run
   since 3 AM. update.yml's scheduled run then skips (it looks for a dispatched run since 3 AM). Morning only (to noon). */
const NIGHTLY_AT = 3 * 60 + 15, NIGHTLY_UNTIL = 12 * 60;
let nightlyTried = false;
const easternMinutes = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return +p.hour * 60 + +p.minute;
};
function startNightly() {
  nightlyTried = true;
  const since = Date.now() - (easternMinutes() - 3 * 60 + 5) * 60e3;
  const r = spawnSync("gh", ["run", "list", "--workflow", "update.yml", "--limit", "15", "--json", "status,createdAt,startedAt,updatedAt"], { encoding: "utf8", env: process.env });
  let runs;
  try { runs = JSON.parse(r.stdout); } catch { console.log("Couldn't list nightly runs; leaving it to its schedule."); return; }
  // a run since 3 AM that's still going, or finished after more than 3 minutes (the off-season cron's skip takes seconds)
  const had = runs.filter((x) => Date.parse(x.createdAt) >= since)
    .some((x) => x.status !== "completed" || Date.parse(x.updatedAt) - Date.parse(x.startedAt) > 3 * 60e3);
  if (had) { console.log("The nightly build already ran or is running; not starting another."); return; }
  const h = spawnSync("gh", ["workflow", "run", "update.yml", "--ref", process.env.GITHUB_REF_NAME || "main"], { stdio: "inherit", env: process.env });
  console.log(h.status === 0 ? "Night's games are final; started the nightly build." : "Couldn't start the nightly build; its schedule will.");
}

let rounds = 0, wrapped = false;
for (;;) {
  const gs = await games(), now = Date.now();
  const live = gs.filter((g) => ["LIVE", "CRIT"].includes(g.state));
  // still to finish: not final and started within the last 6 hours or starting later (yesterday's stale entries drop out)
  const pending = gs.filter((g) => !["FINAL", "OFF"].includes(g.state) && g.start > now - 6 * 3600e3);
  const next = pending.filter((g) => g.start > now).sort((a, b) => a.start - b.start)[0];
  const elapsed = now - started, mins = easternMinutes();
  const settled = !pending.some((g) => g.start <= now);
  if (!nightlyTried && settled && mins >= NIGHTLY_AT && mins < NIGHTLY_UNTIL) startNightly();
  if (!pending.length) {
    if (!wrapped) {
      wrapped = true; runScores(); await liveTick(); /* clears hockey/live */
      if (recheckAt) { await sleep(Math.max(0, recheckAt - Date.now())); recheckAt = 0; console.log("Final standings re-check."); runScores(); }
    }
    // the night's games are over before 3:15 AM: stay up to start the nightly (runners are free on this public repo),
    // handing off near the 6-hour limit. Only after a game in the last 10 hours, so a no-game day's run just ends.
    const wait = (NIGHTLY_AT - mins + 1440) % 1440;
    if (!nightlyTried && wait && (mins < NIGHTLY_AT || gs.some((g) => g.start > now - 10 * 3600e3 && g.start <= now))) {
      if (wait * 60e3 > BUDGET - elapsed) {
        console.log("All final; handing off to a fresh run to start the nightly build at 3:15 AM.");
        spawnSync("gh", ["workflow", "run", "live.yml", "--ref", process.env.GITHUB_REF_NAME || "main"], { stdio: "inherit", env: process.env });
        break;
      }
      console.log(`All final; waiting ${wait} minutes to start the nightly build.`); await sleep(wait * 60e3 + 5e3); continue;
    }
    console.log(`No games left to play or finish today; done after ${rounds} rounds.`); break;
  }
  if (elapsed > BUDGET) {
    console.log(`${pending.length} games still to finish; handing off to a fresh run.`);
    const h = spawnSync("gh", ["workflow", "run", "live.yml", "--ref", process.env.GITHUB_REF_NAME || "main"], { stdio: "inherit", env: process.env });
    if (h.status !== 0) console.log("Couldn't start the next run; the 10-minute job will carry on.");
    break;
  }
  if (live.length || (next && next.start - now <= SOON) || pending.some((g) => g.start <= now)) {
    console.log(`${new Date().toISOString()}: ${live.length} live, ${pending.length} to finish; updating scores.`);
    runScores(); rounds++;
    if (live.length) await fastUntil(EVERY); else await sleep(EVERY);
  } else {
    let wait = Math.min(next.start - now - SOON + 1000, BUDGET - elapsed);
    if (!nightlyTried && mins < NIGHTLY_AT) wait = Math.min(wait, (NIGHTLY_AT - mins) * 60e3 + 5e3);
    console.log(`Next puck drop ${new Date(next.start).toISOString()}; waking in ${Math.round(wait / 60e3)} minutes.`);
    await sleep(Math.max(60e3, wait));
  }
}
