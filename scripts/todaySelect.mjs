// Hockey Lab / Today: pure, deterministic editorial selection (spec: hockey-lab-today-feature-spec.md, owner 2026-10-14).
// No wall clock and no I/O in here: everything comes in through `ctx`, so the same inputs always give the same edition.
// Thresholds are editorial gates (named config, unit-tested), not statistical tests; review them after the season.

export const TODAY_CONFIG = {
  surprise: 0.40,          // winner's shot-replay chance at or below this = "the scoreboard and the chances disagreed"
  lookbackHours: 72,       // no games yesterday: the latest completed date within this window, labelled as such
  minGp: 15,               // no team is called out before every team has this many games
  teamPts: 0.550,          // points% at or above…
  teamXg: 0.480,           // …while 5v5 xG share at or below this = results ahead of the chances
  minRecapVersion: 3,
};
export const RULES = { game: "today_game_v1", team: "today_team_v1", question: "today_question_v1" };

const dayNum = (d) => Date.parse(`${d}T12:00:00Z`) / 864e5;
export const addDays = (d, n) => new Date((dayNum(d) + n) * 864e5).toISOString().slice(0, 10);

/** Recap -> candidate, or { reject } with why (kept in the generation log, never published). */
export function gameCandidate(r, cfg = TODAY_CONFIG) {
  if (!r || r.id == null) return { reject: "missing game id" };
  if (!r.final) return { reject: "not final" };
  if (!r.home?.team || !r.away?.team || r.home.score == null || r.away.score == null) return { reject: "missing teams or score" };
  if (r.home.score === r.away.score) return { reject: "no resolved winner" };
  if ((r.version ?? 0) < cfg.minRecapVersion) return { reject: "old recap version" };
  if (r.end === "SO") return { reject: "decided in a shootout (excluded in v1)" };
  const d = r.deserved;
  if (typeof d !== "number" || !Number.isFinite(d) || d < 0 || d > 1) return { reject: "invalid shot-replay probability" };
  const homeWon = r.home.score > r.away.score, p = homeWon ? d : 1 - d;
  const xg = (r.totals?.xg || []).reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0);
  return { id: r.id, season: String(r.season), date: r.date, winner: homeWon ? r.home.team : r.away.team, loser: homeWon ? r.away.team : r.home.team,
    score: homeWon ? `${r.home.score}–${r.away.score}` : `${r.away.score}–${r.home.score}`, end: r.end || "REG", p, xgTotal: Math.round(xg * 100) / 100,
    teams: `${r.away.team} at ${r.home.team}`, updatedAt: r.updatedAt || null };
}

/** The game item: yesterday's (Eastern) games, else the latest completed date within the lookback, else null. */
export function selectGameStory(ctx, cfg = TODAY_CONFIG) {
  const log = [];
  const cands = [];
  for (const r of ctx.recaps || []) { const c = gameCandidate(r, cfg); if (c.reject) log.push({ id: r?.id ?? null, reject: c.reject }); else cands.push(c); }
  const yesterday = addDays(ctx.editionDateET, -1);
  let pool = cands.filter((c) => c.date === yesterday), label = "Last night / Shot quality", lastNight = true;
  if (!pool.length) {
    const earliest = addDays(ctx.editionDateET, -Math.ceil(cfg.lookbackHours / 24));
    const dates = [...new Set(cands.map((c) => c.date))].filter((d) => d >= earliest && d < ctx.editionDateET).sort();
    if (!dates.length) return { item: null, log };
    pool = cands.filter((c) => c.date === dates.at(-1)); label = "From the latest games"; lastNight = false;
  }
  const byP = [...pool].sort((a, b) => a.p - b.p || b.xgTotal - a.xgTotal || a.id - b.id);
  const s = byP[0];
  const base = { kind: "game", label, lastNight, asOf: s.date, rule: RULES.game, destination: { type: "recap", gameId: s.id, season: s.season }, scope: "unblocked non-empty-net shots, whole game (shootout excluded)" };
  if (s.p <= cfg.surprise) return { item: { ...base, id: `game-surprise:${s.id}`, template: "game_surprise_v1",
    facts: { winner: s.winner, loser: s.loser, score: s.score, end: s.end, winnerReplayP: Math.round(s.p * 1000) / 1000, teams: s.teams }, sourceUpdatedAt: s.updatedAt }, log };
  // nothing qualifies: a neutral item about the game with the most chances, never an "upset"
  const n = [...pool].sort((a, b) => b.xgTotal - a.xgTotal || a.id - b.id)[0];
  return { item: { ...base, id: `game-neutral:${n.id}`, template: "game_neutral_v1", destination: { type: "recap", gameId: n.id, season: n.season },
    facts: { teams: n.teams, winner: n.winner, score: n.score, end: n.end, xgTotal: n.xgTotal }, sourceUpdatedAt: n.updatedAt }, log };
}

/** The team item: a standings/chance mismatch, or the honest early-season / "mostly agree" alternates. */
export function selectTeamStory(ctx, cfg = TODAY_CONFIG) {
  const teams = (ctx.teams || []).filter((t) => t.team && Number.isFinite(t.gp) && t.gp > 0);
  if (!teams.length) return { item: null, log: [{ reject: "no team data" }] };
  const base = { kind: "team", label: "Teams / Season watch", rule: RULES.team, scope: "points% (official standings) vs 5v5 expected-goals share", asOf: ctx.teamsAsOf || null };
  if (Math.min(...teams.map((t) => t.gp)) < cfg.minGp) return { item: { ...base, id: "team-early", template: "team_early_v1", destination: { type: "overview_section", section: "playChart" }, facts: { minGp: cfg.minGp } }, log: [] };
  const rows = teams.map((t) => ({ team: t.team, gp: t.gp, ptsPct: t.pts / (2 * t.gp), xgPct: t.xgf5 + t.xga5 > 0 ? t.xgf5 / (t.xgf5 + t.xga5) : null })).filter((r) => r.xgPct != null);
  const elig = rows.filter((r) => r.ptsPct >= cfg.teamPts && r.xgPct <= cfg.teamXg).sort((a, b) => a.xgPct - b.xgPct || b.ptsPct - a.ptsPct || (a.team < b.team ? -1 : 1));
  if (!elig.length) return { item: { ...base, id: "team-agree", template: "team_agree_v1", destination: { type: "overview_section", section: "playChart" }, facts: {} }, log: [] };
  const t = elig[0];
  return { item: { ...base, id: `team-mismatch:${t.team}`, template: "team_mismatch_v1", destination: { type: "team", team: t.team },
    facts: { team: t.team, gp: t.gp, ptsPct: Math.round(t.ptsPct * 1000) / 1000, xgPct: Math.round(t.xgPct * 1000) / 1000 } }, log: [] };
}

/** Question of the day: the same bank and day rule as the footer (doc.start, Eastern dates, in order, repeating). */
/** Index into the bank for an Eastern date. A question with a `date` shows on that day only and the rotation of the
 *  undated ones pauses that day, so every other day keeps its question (2026-10-28; same rule as lab.js qotdOn).
 *  `questions` may also be a count (an undated bank). */
export function questionIndex(start, questions, dateET) {
  const list = typeof questions === "number" ? Array.from({ length: questions }, () => ({})) : questions;
  const d = Math.max(0, Math.floor(dayNum(dateET) - dayNum(start))), iso = addDays(start, d);
  const pinned = list.findIndex((q) => q.date === iso);
  if (pinned >= 0) return pinned;
  const free = list.map((q, i) => (q.date ? -1 : i)).filter((i) => i >= 0);
  if (!free.length) return 0;
  const paused = new Set(list.filter((q) => q.date && q.date >= start && q.date < iso).map((q) => q.date)).size;
  return free[(d - paused) % free.length];
}
export function selectQuestionStory(ctx) {
  const Q = ctx.qotd;
  if (!Q?.questions?.length || !Q.start) return { item: null, log: [{ reject: "no published question bank" }] };
  const i = questionIndex(Q.start, Q.questions, ctx.editionDateET);
  return { item: { kind: "question", id: `question:${Q.questions[i].id}`, label: "Question of the day", template: "question_v1", rule: RULES.question,
    destination: { type: "qotd", index: i }, facts: { questionId: Q.questions[i].id, question: Q.questions[i].q } }, log: [] };
}

export function buildTodayEdition(ctx, cfg = TODAY_CONFIG) {
  const g = selectGameStory(ctx, cfg), t = selectTeamStory(ctx, cfg), q = selectQuestionStory(ctx);
  const items = [g.item, t.item, q.item].filter(Boolean);
  return { edition: { schemaVersion: 1, editionDateET: ctx.editionDateET, generatedAt: ctx.generatedAt, inputVersions: ctx.inputVersions || {}, status: items.length ? "ready" : "empty",
    items, qotd: ctx.qotd?.questions?.length ? { start: ctx.qotd.start, questions: ctx.qotd.questions.map((x) => ({ id: x.id, q: x.q, ...(x.date ? { date: x.date } : {}) })) } : null },
    log: { game: g.log, team: t.log, question: q.log } };
}

/** Publication gate: block placeholder facts, non-finite numbers, missing destinations or private-looking fields. */
export function validateEdition(ed) {
  const errs = [];
  const PRIVATE = /contract|aav|capHit|cap_|teamCap|uid|email|owner|scout/i;
  const walk = (o, path) => { if (o == null) return; if (typeof o === "number" && !Number.isFinite(o)) errs.push(`${path}: non-finite`);
    if (typeof o === "string" && /GAME_ID|TEAM_ID|example|PLACEHOLDER/.test(o)) errs.push(`${path}: placeholder text`);
    if (typeof o === "object") for (const [k, v] of Object.entries(o)) { if (PRIVATE.test(k)) errs.push(`${path}.${k}: private-looking field`); walk(v, `${path}.${k}`); } };
  walk(ed, "edition");
  for (const it of ed.items || []) { if (!it.destination?.type) errs.push(`${it.id}: no destination`); if (!it.template || !it.rule) errs.push(`${it.id}: no template/rule`); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ed.editionDateET || "")) errs.push("bad editionDateET");
  return errs;
}
