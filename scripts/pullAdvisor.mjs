// Goalie-pull advisor (F03): a decision aid from league-wide rates, not a prediction of any game.
// Rates (per second, trailing team's goals for / against, by deficit and goalie in or pulled) come from hockey-models
// qotd.py over 2024-26 third periods. The chance of tying is a second-by-second race: before the pull at 5v5 rates,
// after it at 6v5 rates; a goal against ends the chase (same model as the Question of the day answer).
// Only for a team trailing by one or two in the third period of regulation, at 5-on-5 or with its goalie pulled.

/** P(trailing team ties before time runs out) with `left` seconds to go, pulling the goalie at `pullAt` seconds left. */
export function pTie(deficit, pullAt, left, rates) {
  let V = [1, 0, 0];
  for (let s = 1; s <= left; s++) {
    const nv = [1, 0, 0];
    for (const d of [1, 2]) { const [f, a] = rates[`${d}_${s <= pullAt ? "out" : "in"}`]; nv[d] = f * V[d - 1] + (1 - f - a) * V[d]; }
    V = nv;
  }
  return V[deficit];
}
const cache = new Map();
/** The best-pull window for a deficit (time left when pulling is within `tol` of the best), from a full third period. */
export function pullWindow(deficit, rates, tol = 0.002) {
  const key = `${deficit}|${JSON.stringify(rates)}`;
  if (cache.has(key)) return cache.get(key);
  const pts = [];
  for (let p = 0; p <= 720; p += 10) pts.push([p, pTie(deficit, p, 1200, rates)]);
  const best = Math.max(...pts.map((x) => x[1])), near = pts.filter((x) => x[1] >= best - tol).map((x) => x[0]);
  const w = { lo: Math.min(...near), hi: Math.max(...near), best };
  cache.set(key, w);
  return w;
}
/** Situation code "AGASHSHG" digits: away goalie, away skaters, home skaters, home goalie. */
export function parseSituation(code) { const c = String(code || "1551").padStart(4, "1"); return { ag: +c[0], as: +c[1], hs: +c[2], hg: +c[3] }; }

/** Advice for one live game, or null when it doesn't apply. */
export function advise({ period, periodType, secondsLeft, inIntermission, homeScore, awayScore, situationCode, home, away }, rates) {
  if (!rates || inIntermission || period !== 3 || (periodType && periodType !== "REG") || !(secondsLeft > 0)) return null;
  const diff = homeScore - awayScore, deficit = Math.abs(diff);
  if (deficit < 1 || deficit > 2) return null;
  const trailHome = diff < 0, s = parseSituation(situationCode);
  const mine = trailHome ? { g: s.hg, sk: s.hs } : { g: s.ag, sk: s.as }, theirs = trailHome ? { g: s.ag, sk: s.as } : { g: s.hg, sk: s.hs };
  const even = mine.g === 1 && mine.sk === 5 && theirs.sk === 5 && theirs.g === 1, pulled = mine.g === 0 && mine.sk === 6 && theirs.sk === 5;
  if (!even && !pulled) return null; // power plays, 4-on-4 and the like: the advisor stays quiet rather than guess
  const w = pullWindow(deficit, rates), left = Math.round(secondsLeft);
  const pNow = pTie(deficit, left, left, rates), pNever = pTie(deficit, 0, left, rates);
  const status = pulled ? "pulled" : left > w.hi ? "early" : left >= w.lo ? "window" : "late";
  return { team: trailHome ? home : away, deficit, secondsLeft: left, status, window: [w.lo, w.hi], pNow: +pNow.toFixed(4), pNever: +pNever.toFixed(4) };
}
