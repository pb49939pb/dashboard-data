// Game night: keep Hockey Lab's Recent games, live scores and recaps current while games are on. GitHub runs frequent
// schedules (dispatch.yml's every 10 minutes) only when it has capacity, which can mean hours apart, so this job starts
// once before games (live.yml) and stays up: scores.mjs every 5 minutes while a game is live or about to start, a sleep
// until the next puck drop otherwise, and it ends when the day's last game is final. GitHub stops a job at 6 hours, so
// past ~5h30m it starts a fresh run of itself (gh workflow run) if games are still to come or under way.
//   node scripts/live.mjs        (needs FIREBASE_SERVICE_ACCOUNT for scores.mjs; GH_TOKEN to hand off)
import { spawnSync } from "node:child_process";

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

function runScores() {
  const r = spawnSync("node", ["scripts/scores.mjs"], { stdio: "inherit", env: process.env, timeout: 8 * 60e3 });
  if (r.status !== 0) console.log("scores.mjs failed this round; trying again next round");
}

let rounds = 0;
for (;;) {
  const gs = await games(), now = Date.now();
  const live = gs.filter((g) => ["LIVE", "CRIT"].includes(g.state));
  // still to finish: not final and started within the last 6 hours or starting later (yesterday's stale entries drop out)
  const pending = gs.filter((g) => !["FINAL", "OFF"].includes(g.state) && g.start > now - 6 * 3600e3);
  const next = pending.filter((g) => g.start > now).sort((a, b) => a.start - b.start)[0];
  const elapsed = now - started;
  if (!pending.length) { if (rounds === 0) runScores(); console.log(`No games left to play or finish today; done after ${rounds} rounds.`); break; }
  if (elapsed > BUDGET) {
    console.log(`${pending.length} games still to finish; handing off to a fresh run.`);
    const h = spawnSync("gh", ["workflow", "run", "live.yml", "--ref", process.env.GITHUB_REF_NAME || "main"], { stdio: "inherit", env: process.env });
    if (h.status !== 0) console.log("Couldn't start the next run; the 10-minute job will carry on.");
    break;
  }
  if (live.length || (next && next.start - now <= SOON) || pending.some((g) => g.start <= now)) {
    console.log(`${new Date().toISOString()}: ${live.length} live, ${pending.length} to finish; updating scores.`);
    runScores(); rounds++;
    await sleep(EVERY);
  } else {
    const wait = Math.min(next.start - now - SOON + 1000, BUDGET - elapsed);
    console.log(`Next puck drop ${new Date(next.start).toISOString()}; waking in ${Math.round(wait / 60e3)} minutes.`);
    await sleep(Math.max(60e3, wait));
  }
}
