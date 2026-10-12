// Red Wings shots for the dashboard's shot maps, scored with our own xG model.
// The parsing and features mirror hockey-models/hockey/shots.py and xg.py exactly; the model
// published model is gradient boosting (model/xg_gbm.json, attached as model.gbm), with shooter handedness from the NHL
// stats API bios attached as model.hands; model/xg_logit.json is the simpler companion (and the fallback).
// Incremental: games already in the last published file are reused, so only new games are fetched.
import { readFile } from "node:fs/promises";

const NET_X = 89;
const SHOT_TYPES = ["goal", "shot-on-goal", "missed-shot", "blocked-shot"];
const PREV_TYPES = ["faceoff", "hit", "giveaway", "takeaway", "shot"];

const secs = (t) => { const [m, s] = t.split(":").map(Number); return m * 60 + s; };

function strength(code, shooterHome) {
  if (!code || code.length !== 4) return { state: "unknown", empty: false };
  const [awayG, awaySk, homeSk, homeG] = code.split("").map(Number);
  const [own, opp] = shooterHome ? [homeSk, awaySk] : [awaySk, homeSk];
  const state = own === opp ? `${own}v${opp}` : own > opp ? "PP" : "SH";
  return { state, empty: (shooterHome ? awayG : homeG) === 0 };
}

/** Same rows as shots.py game_shots(), limited to the fields the model and map need. */
export function gameShots(pbp) {
  const homeId = pbp.homeTeam.id, awayId = pbp.awayTeam.id;
  const abbrev = { [homeId]: pbp.homeTeam.abbrev, [awayId]: pbp.awayTeam.abbrev };
  const names = Object.fromEntries((pbp.rosterSpots || []).map((p) => [p.playerId, `${p.firstName.default} ${p.lastName.default}`]));
  const rows = [];
  let prev = null, homeScore = 0, awayScore = 0;
  const plays = [...pbp.plays].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  for (const p of plays) {
    const period = p.periodDescriptor;
    if (period.periodType === "SO") break;
    const d = p.details || {};
    const t = p.timeInPeriod ? secs(p.timeInPeriod) : 0;
    const typ = p.typeDescKey;
    if (SHOT_TYPES.includes(typ) && d.xCoord !== undefined && d.yCoord !== undefined && abbrev[d.eventOwnerTeamId]) {
      let team = d.eventOwnerTeamId;
      if (typ === "blocked-shot") team = team === homeId ? awayId : homeId;
      const home = team === homeId;
      let x = d.xCoord, y = d.yCoord;
      const side = p.homeTeamDefendingSide;
      let right = home ? side === "left" : side === "right";
      if (side == null) right = typ !== "blocked-shot" ? x >= 0 : x < 0;
      if (!right) { x = -x; y = -y; }
      const dx = NET_X - x;
      const dist = Math.hypot(dx, y);
      const angle = dx !== 0 ? (Math.atan2(Math.abs(y), dx) * 180) / Math.PI : 90;
      const st = strength(p.situationCode || "", home);
      const shooter = d.scoringPlayerId || d.shootingPlayerId;
      const row = {
        eventId: p.eventId, period: period.number, periodType: period.periodType, t, type: typ, isGoal: typ === "goal", unblocked: typ !== "blocked-shot",
        team: abbrev[team], home, x, y, dist, angle, shotType: d.shotType || "unknown", shooter: names[shooter] || null,
        shooterId: shooter ?? null, goalieId: d.goalieInNetId ?? null,
        strength: st.state, emptyNet: st.empty, scoreDiff: home ? homeScore - awayScore : awayScore - homeScore,
      };
      if (prev) {
        const gap = prev.period === period.number ? t - prev.t : 999;
        row.prevType = prev.type; row.prevGap = gap;
        row.prevDist = prev.x !== null ? Math.hypot(x - prev.x, y - prev.y) : null;
        row.prevY = prev.x !== null ? prev.y : null;
        row.prevAngle = prev.x !== null ? (NET_X - prev.x !== 0 ? (Math.atan2(Math.abs(prev.y), NET_X - prev.x) * 180) / Math.PI : 90) : null;
        row.rebound = gap <= 3 && SHOT_TYPES.includes(prev.type) && prev.team === team && prev.type !== "goal" ? 1 : 0;
        row.rush = gap <= 4 && ["N", "D"].includes(prev.zone) ? 1 : 0;
      } else Object.assign(row, { prevType: null, prevGap: 999, prevDist: null, prevY: null, prevAngle: null, rebound: 0, rush: 0 });
      rows.push(row);
    }
    if (typ === "goal") { homeScore = d.homeScore ?? homeScore; awayScore = d.awayScore ?? awayScore; }
    const owner = d.eventOwnerTeamId;
    if (SHOT_TYPES.includes(typ) || ["faceoff", "hit", "giveaway", "takeaway"].includes(typ)) {
      const evTeam = typ !== "blocked-shot" ? owner : owner === homeId ? awayId : homeId;
      prev = { type: typ, t, period: period.number, team: evTeam, x: null, y: null, zone: null };
      if (d.xCoord !== undefined && d.yCoord !== undefined && abbrev[owner]) {
        const side = p.homeTeamDefendingSide;
        const ar = evTeam === homeId ? side === "left" : side === "right";
        [prev.x, prev.y] = ar ? [d.xCoord, d.yCoord] : [-d.xCoord, -d.yCoord];
        let zone = d.zoneCode;
        if (zone && owner !== evTeam) zone = { O: "D", D: "O" }[zone] || zone;
        prev.zone = zone || null;
      }
    } else if (["stoppage", "period-start", "period-end", "penalty", "delayed-penalty"].includes(typ)) prev = null;
  }
  return rows;
}

/** Feature vector in the model's column order (mirrors xg.py features()). */
export function featureVector(r, model) {
  const d = Math.min(Math.max(r.dist, 1), 200), a = Math.min(Math.max(r.angle, 0), 180);
  const gap = Math.min(Math.max(r.prevGap ?? 999, 0), 60);
  const prevKind = r.prevType && SHOT_TYPES.includes(r.prevType) ? "shot" : r.prevType;
  const f = {
    dist: d, log_dist: Math.log(d), angle: a, angle_sq: (a / 10) ** 2, dist_x_angle: (d * a) / 100, behind_net: r.x > 89 ? 1 : 0,
    rebound: r.rebound, rush: r.rush, quick_follow: gap <= 5 ? 1 : 0,
    prev_dist: gap <= 10 ? Math.min(Math.max(r.prevDist ?? 0, 0), 200) : 0,
    pp: r.strength === "PP" ? 1 : 0, sh: r.strength === "SH" ? 1 : 0, open_ice: ["4v4", "3v3"].includes(r.strength) ? 1 : 0,
    leading: r.scoreDiff > 0 ? 1 : 0, trailing: r.scoreDiff < 0 ? 1 : 0, home: r.home ? 1 : 0, late: r.period >= 3 ? 1 : 0,
  };
  // movement before the shot, and handedness (mirrors xg.py)
  const quick = gap <= 5;
  f.speed = quick ? Math.min(Math.max((r.prevDist ?? 0) / Math.max(gap, 1), 0), 80) : 0;
  f.cross_middle = quick && r.prevY !== null && r.prevY !== undefined && Math.sign(r.prevY) * Math.sign(r.y) < 0 && Math.abs(r.prevY - r.y) >= 15 ? 1 : 0;
  f.angle_change = gap <= 3 ? Math.min(Math.max(Math.abs(a - (r.prevAngle ?? a)), 0), 180) : 0;
  const hand = model.hands?.[r.shooterId];
  f.off_wing = (hand === "L" && r.y < -5) || (hand === "R" && r.y > 5) ? 1 : 0;
  f.x = r.x; f.y = Math.abs(r.y);
  for (const t of model.shot_types) f[`type_${t}`] = r.shotType === t ? 1 : 0;
  for (const t of PREV_TYPES) f[`prev_${t}`] = prevKind === t && gap <= 10 ? 1 : 0;
  // rounded to 6 decimals exactly like xg.py, so both languages walk the trees identically
  return (model.gbm ? model.gbm.features : model.features).map((k) => Math.round(f[k] * 1e6) / 1e6);
}

/** Gradient-boosted trees exported by hockey-models (xg_gbm.json): walk each tree, add its leaf, then sigmoid. */
function gbmXg(v, g) {
  let raw = g.baseline;
  for (const t of g.trees) {
    let n = 0;
    while (!t.leaf[n]) n = v[t.f[n]] <= t.t[n] ? t.l[n] : t.r[n];
    raw += t.v[n];
  }
  return 1 / (1 + Math.exp(-raw));
}

export function xg(r, model) {
  if (!r.unblocked) return null;
  if (r.emptyNet) return 0.9;
  const v = featureVector(r, model);
  if (model.gbm) return gbmXg(v, model.gbm);
  let z = model.intercept;
  for (let i = 0; i < v.length; i++) z += model.coef[i] * ((v[i] - model.mean[i]) / model.scale[i]);
  return 1 / (1 + Math.exp(-z));
}

/**
 * Build the shots file. `games`: finished DET games from the schedule; `previous`: last published file (or null);
 * `getPbp(id)`: fetch play-by-play. Returns { file, fetched }.
 */
export async function buildShots({ team, games, previous, getPbp, modelPath }) {
  const model = typeof modelPath === "string" ? JSON.parse(await readFile(modelPath, "utf8")) : modelPath;
  const reuse = new Map((previous?.model?.trained_on === model.trained_on ? previous.games : []).map((g) => [g.id, g]));
  const out = [];
  let fetched = 0;
  for (const g of games) {
    if (reuse.has(g.id)) { out.push(reuse.get(g.id)); continue; }
    const pbp = await getPbp(g.id);
    fetched++;
    const rows = gameShots(pbp).filter((r) => r.periodType !== "SO");
    const shooters = [...new Set(rows.map((r) => r.shooter).filter(Boolean))];
    const home = pbp.homeTeam.abbrev === team;
    out.push({
      id: g.id, date: pbp.gameDate, home, opp: home ? pbp.awayTeam.abbrev : pbp.homeTeam.abbrev,
      us: home ? pbp.homeTeam.score : pbp.awayTeam.score, them: home ? pbp.awayTeam.score : pbp.homeTeam.score,
      shooters,
      // [x, y, kind (g goal, s on net, m missed, b blocked), ours (1/0), xG (3 dp or null), shooter index, strength, period]
      shots: rows.map((r) => [Math.round(r.x), Math.round(r.y), { goal: "g", "shot-on-goal": "s", "missed-shot": "m", "blocked-shot": "b" }[r.type],
        r.team === team ? 1 : 0, (() => { const v = xg(r, model); return v === null ? null : Math.round(v * 1000) / 1000; })(),
        shooters.indexOf(r.shooter), r.strength, r.period]),
    });
  }
  return {
    fetched,
    file: { updatedAt: new Date().toISOString(), team, model: { trained_on: model.trained_on, auc: model.test?.auc ?? null, log_loss: model.test?.log_loss ?? null }, games: out },
  };
}
