// Team styles for Hockey Lab: an offensive and defensive "fingerprint" per team, archetypes found by clustering two
// full seasons of team-seasons, style-vs-style matchup effects, and the kinds of shots each defense allows.
// Systems themselves (forecheck shapes, zone vs man coverage) need tracking data; these are the measurable
// footprints of them in play-by-play.
import { zone, categories } from "./league.mjs";

export const OFF = [
  ["o_volume", "Shot volume", "unblocked 5v5 shot attempts per game"],
  ["o_quality", "Shot quality", "expected goals per 5v5 shot"],
  ["o_inner", "Inside shots", "share of 5v5 shots from the net front and slot"],
  ["o_point", "Point shots", "share of 5v5 shots from 48+ ft"],
  ["o_rush", "Rush chances", "share of 5v5 shots off the rush"],
  ["o_rebound", "Rebounds", "share of 5v5 shots that are rebounds"],
  ["o_cross", "East-west passing", "share of 5v5 shots right after the puck crossed the middle"],
  ["o_dshare", "Defense joining", "share of 5v5 shots by defensemen"],
  ["o_forecheck", "Forecheck", "hits + takeaways in the offensive zone per road game"],
];
export const DEF = [
  ["d_volume", "Shots allowed", "unblocked 5v5 shot attempts allowed per game"],
  ["d_quality", "Danger allowed", "expected goals per 5v5 shot allowed"],
  ["d_inner", "Inside shots allowed", "share of shots allowed from the net front and slot"],
  ["d_rush", "Rush chances allowed", "share of shots allowed off the rush"],
  ["d_rebound", "Rebounds allowed", "share of shots allowed that are rebounds"],
  ["d_block", "Shot blocking", "share of opponents' 5v5 attempts blocked"],
  ["d_pressure", "Pressure", "hits + takeaways in the neutral and defensive zones per road game"],
  ["d_give", "Own-zone giveaways", "giveaways in the defensive zone per road game"],
];
const CATS = ["close", "mid", "long", "sharp", "wrist", "snap", "slap", "backhand", "tip", "wrap", "rebound", "rush"];

/** Raw fingerprint per team from compact game records. */
export function fingerprints(games) {
  const T = {};
  const t = (a) => (T[a] ??= { gp: 0, road: 0, f: { n: 0, att: 0, x: 0, inner: 0, point: 0, rush: 0, reb: 0, cross: 0, d: 0 },
    a: { n: 0, att: 0, x: 0, inner: 0, rush: 0, reb: 0, blocked: 0 }, ev: new Array(9).fill(0), mix: Object.fromEntries(CATS.map((c) => [c, 0])), mixN: 0,
    mixF: Object.fromEntries(CATS.map((c) => [c, 0])), mixFN: 0 });
  for (const g of games) {
    const sides = [g.home, g.away];
    // hits / takeaways / giveaways are counted by the home arena's scorekeepers, whose habits differ a lot,
    // so each team's event rates use its road games only (many different scorekeepers average out)
    sides.forEach((s, i) => { const x = t(s); x.gp++; if (g.ev && i === 1) { x.road++; g.ev[i].forEach((v, k) => (x.ev[k] += v)); } });
    for (const s of g.shots) {
      const [x, y, kind, side, v, shooter, , strength, , , flags = 0] = s;
      if (strength !== "5v5" || v === 0.9) continue;
      const own = t(sides[side]), opp = t(sides[1 - side]);
      own.f.att++; opp.a.att++;
      if (kind === "b") { opp.a.blocked++; continue; }
      if (v === null) continue;
      const z = zone(x, y), inner = z === "nf" || z === "slot";
      own.f.n++; own.f.x += v; own.f.inner += inner; own.f.point += z === "point"; own.f.rush += !!(flags & 2); own.f.reb += !!(flags & 1); own.f.cross += !!(flags & 4);
      if (g.players?.[shooter]?.[1] === "D") own.f.d++;
      opp.a.n++; opp.a.x += v; opp.a.inner += inner; opp.a.rush += !!(flags & 2); opp.a.reb += !!(flags & 1);
      for (const c of categories(s)) if (c in opp.mix) { opp.mix[c]++; own.mixF[c]++; }
      opp.mixN++; own.mixFN++;
    }
  }
  const out = {};
  for (const [team, x] of Object.entries(T)) {
    if (!x.gp || !x.f.n || !x.a.n) continue;
    const e = x.ev, gp = x.gp, rd = Math.max(1, x.road);
    out[team] = { gp,
      o_volume: x.f.n / gp, o_quality: x.f.x / x.f.n, o_inner: x.f.inner / x.f.n, o_point: x.f.point / x.f.n, o_rush: x.f.rush / x.f.n,
      o_rebound: x.f.reb / x.f.n, o_cross: x.f.cross / x.f.n, o_dshare: x.f.d / x.f.n, o_forecheck: (e[0] + e[3]) / rd,
      d_volume: x.a.n / gp, d_quality: x.a.x / x.a.n, d_inner: x.a.inner / x.a.n, d_rush: x.a.rush / x.a.n, d_rebound: x.a.reb / x.a.n,
      d_block: x.a.att ? x.a.blocked / x.a.att : 0, d_pressure: (e[1] + e[2] + e[4] + e[5]) / rd, d_give: e[8] / rd,
      mix: Object.fromEntries(CATS.map((c) => [c, x.mixN ? x.mix[c] / x.mixN : 0])), mixF: Object.fromEntries(CATS.map((c) => [c, x.mixFN ? x.mixF[c] / x.mixFN : 0])), xgfPg: x.f.x / gp, xgaPg: x.a.x / gp };
  }
  return out;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2))) || 1;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
/** k-means with k-means++ starts, several restarts; returns centroids. */
export function kmeans(X, k, seed = 7, restarts = 30) {
  const rand = rng(seed), d2 = (a, b) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
  let best = null;
  for (let r = 0; r < restarts; r++) {
    const C = [X[Math.floor(rand() * X.length)]];
    while (C.length < k) { const w = X.map((x) => Math.min(...C.map((c) => d2(x, c)))); let u = rand() * w.reduce((a, b) => a + b, 0), i = 0; while ((u -= w[i]) > 0) i++; C.push(X[Math.min(i, X.length - 1)]); }
    let lab = [];
    for (let it = 0; it < 100; it++) {
      lab = X.map((x) => C.map((c) => d2(x, c)).reduce((bi, v, i, a) => (v < a[bi] ? i : bi), 0));
      const next = C.map((c, j) => { const m = X.filter((_, i) => lab[i] === j); return m.length ? c.map((_, f) => mean(m.map((x) => x[f]))) : c; });
      if (next.every((c, j) => d2(c, C[j]) < 1e-12)) break;
      C.splice(0, C.length, ...next);
    }
    const cost = X.reduce((s, x, i) => s + d2(x, C[lab[i]]), 0);
    if (!best || cost < best.cost) best = { cost, C: C.map((c) => [...c]) };
  }
  return best.C;
}

// Archetype names: a curated name when a cluster clearly matches it (score >= 1), otherwise a plain description of
// the cluster's two most defining features. Each curated name is used once.
const OFF_NAMES = [
  ["Rush & transition", (z) => z.o_rush + 0.4 * z.o_cross, "Attacks off the rush and in transition, before defenses set."],
  ["Forecheck & cycle", (z) => z.o_forecheck + 0.5 * z.o_rebound + 0.3 * z.o_inner, "Wins pucks back in the offensive zone, cycles low and crashes the net."],
  ["Perimeter volume", (z) => z.o_point + 0.5 * z.o_volume - 0.5 * z.o_quality, "Puts lots of pucks on net from the outside and looks for tips and rebounds."],
  ["Inside & net-front", (z) => z.o_inner + 0.6 * z.o_quality - 0.4 * z.o_point, "Gets to the slot and the net front; fewer shots, but dangerous ones."],
  ["Skill & east-west", (z) => z.o_cross + 0.6 * z.o_quality, "Moves the puck side to side to open the slot."],
  ["Defense-led attack", (z) => z.o_dshare + 0.3 * z.o_point, "Activates defensemen; lots of offense from the blue line."],
  ["Forward-driven", (z) => -z.o_dshare - 0.3 * z.o_point, "Forwards create almost everything; defensemen mostly stay back."],
];
const DEF_NAMES = [
  ["Collapse & block", (z) => z.d_block - 0.4 * z.d_pressure, "Packs the slot and blocks shots; concedes possession and outside shots."],
  ["Aggressive pressure", (z) => z.d_pressure - 0.4 * z.d_volume + 0.3 * z.d_rush, "Pressures the puck all over the ice; when it's beaten, chances against come off the rush."],
  ["Tight structure", (z) => -0.7 * z.d_volume - z.d_quality, "Stays in position and limits both shots and danger."],
  ["Slot protection", (z) => -z.d_inner - 0.5 * z.d_quality + 0.3 * z.d_volume, "Keeps shots to the outside even if it gives up volume."],
  ["Open & loose", (z) => 0.6 * z.d_volume + z.d_quality + 0.4 * z.d_rebound, "Trades chances: gives up volume and danger."],
  ["Patient containment", (z) => -z.d_rush + 0.5 * z.d_volume, "Keeps everything in front and is rarely beaten on the rush, but lets opponents hold the puck and shoot."],
];
function nameClusters(C, feats, names) {
  const zs = C.map((c) => Object.fromEntries(feats.map(([k], i) => [k, c[i]])));
  const pairs = [];
  zs.forEach((z, ci) => names.forEach(([n, f], ni) => pairs.push({ ci, ni, s: f(z) })));
  pairs.sort((a, b) => b.s - a.s);
  const taken = new Set(), used = new Set(), out = [];
  for (const p of pairs) { if (p.s < 0.8 || taken.has(p.ci) || used.has(p.ni)) continue; taken.add(p.ci); used.add(p.ni); out[p.ci] = { name: names[p.ni][0], blurb: names[p.ni][2] }; }
  zs.forEach((z, ci) => {
    if (out[ci]) return;
    const top = feats.map(([k, l]) => ({ l, v: z[k] })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 2);
    out[ci] = { name: top.map((t) => `${t.v > 0 ? "High" : "Low"} ${t.l.toLowerCase()}`).join(", "), blurb: "A mixed style; its two most distinctive traits are its name." };
  });
  zs.forEach((z, ci) => (out[ci].defining = feats.map(([k, l]) => ({ k, l, z: Math.round(z[k] * 100) / 100 })).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 4)));
  return out;
}

/** Offline (yearly): archetypes and matchup effects from full seasons. seasons: { "20242025": games[], ... } */
export function buildPrior(seasons) {
  const rows = [];
  for (const [season, games] of Object.entries(seasons)) for (const [team, fp] of Object.entries(fingerprints(games))) rows.push({ season, team, fp });
  const stats = (feats) => Object.fromEntries(feats.map(([k]) => [k, { m: mean(rows.map((r) => r.fp[k])), s: sd(rows.map((r) => r.fp[k])) }]));
  const so = stats(OFF), sdf = stats(DEF);
  const zrow = (fp, feats, st) => feats.map(([k]) => (fp[k] - st[k].m) / st[k].s);
  const Co = kmeans(rows.map((r) => zrow(r.fp, OFF, so)), 5, 11), Cd = kmeans(rows.map((r) => zrow(r.fp, DEF, sdf)), 4, 13);
  const no = nameClusters(Co, OFF, OFF_NAMES), nd = nameClusters(Cd, DEF, DEF_NAMES);
  const near = (z, C) => C.map((c) => c.reduce((s, v, i) => s + (v - z[i]) ** 2, 0)).reduce((bi, v, i, a) => (v < a[bi] ? i : bi), 0);
  for (const r of rows) { r.off = near(zrow(r.fp, OFF, so), Co); r.def = near(zrow(r.fp, DEF, sdf), Cd); }
  const label = Object.fromEntries(rows.map((r) => [`${r.season}|${r.team}`, r]));
  // Matchups: how a team's 5v5 expected goals in a game compare with what both teams' season averages predict,
  // grouped by (its offensive style, the opponent's defensive style). Bootstrap 80% ranges.
  const lgx = mean(rows.map((r) => r.fp.xgfPg));
  const obs = [];
  for (const [season, games] of Object.entries(seasons)) for (const g of games) {
    const one = fingerprints([g]);
    for (const [a, b] of [[g.home, g.away], [g.away, g.home]]) {
      const A = label[`${season}|${a}`], B = label[`${season}|${b}`];
      if (!A || !B || !one[a]) continue;
      const exp = (A.fp.xgfPg * B.fp.xgaPg) / lgx;
      obs.push({ o: A.off, d: B.def, r: one[a].xgfPg / exp - 1 });
    }
  }
  const rand = rng(99);
  const matchups = [];
  for (let o = 0; o < Co.length; o++) for (let d = 0; d < Cd.length; d++) {
    const xs = obs.filter((x) => x.o === o && x.d === d).map((x) => x.r);
    if (xs.length < 30) continue;
    const boots = Array.from({ length: 300 }, () => mean(Array.from({ length: xs.length }, () => xs[Math.floor(rand() * xs.length)]))).sort((a, b) => a - b);
    matchups.push({ off: o, def: d, n: xs.length, effect: mean(xs), lo: boots[30], hi: boots[269] });
  }
  // Which kinds of shots each offensive style generates (vs league), for "goalies it punishes"
  const lgF = Object.fromEntries(CATS.map((c) => [c, mean(rows.map((r) => r.fp.mixF[c]))]));
  const offMix = Co.map((_, o) => { const m = rows.filter((r) => r.off === o); return Object.fromEntries(CATS.map((c) => [c, Math.round((mean(m.map((r) => r.fp.mixF[c])) / lgF[c] - 1) * 1000) / 1000])); });
  return { builtAt: new Date().toISOString(), seasons: Object.keys(seasons), features: { off: OFF, def: DEF }, stats: { off: so, def: sdf },
    centroids: { off: Co, def: Cd }, archetypes: { off: no, def: nd },
    offMix,
    teamSeasons: rows.map((r) => ({ season: r.season, team: r.team, off: r.off, def: r.def,
      fp: Object.fromEntries(Object.entries(r.fp).filter(([k]) => !k.startsWith("mix")).map(([k, v]) => [k, Math.round(v * 10000) / 10000])),
      mix: Object.fromEntries(Object.entries(r.fp.mix).map(([k, v]) => [k, Math.round(v * 10000) / 10000])) })),
    matchups: matchups.map((m) => ({ ...m, effect: Math.round(m.effect * 1000) / 1000, lo: Math.round(m.lo * 1000) / 1000, hi: Math.round(m.hi * 1000) / 1000 })) };
}

/** Nightly: this season's fingerprints blended with last season's, archetypes, tradeoffs and allowed shot mix. */
export function buildStyles(games, prior, season) {
  const cur = fingerprints(games);
  const last = String(Number(season.slice(0, 4)) - 1) + season.slice(0, 4);
  const prevRows = prior.teamSeasons.filter((r) => r.season === last);
  const prevBy = Object.fromEntries(prevRows.map((r) => [r.team, r.fp])), prevMix = Object.fromEntries(prevRows.map((r) => [r.team, r.mix]));
  const zrow = (fp, feats, st) => feats.map(([k]) => (fp[k] - st[k].m) / st[k].s);
  const dist = (z, c) => c.reduce((s, v, i) => s + (v - z[i]) ** 2, 0);
  // kinds of shots allowed: this season's mix blended with last season's (shots-weighted, last season ~ 20 games)
  const mixOf = (team) => { const c = cur[team], p = prevMix[team]; if (!c && !p) return null; const w = c ? c.gp / (c.gp + 20) : 0;
    return Object.fromEntries(CATS.map((k) => [k, c && p ? w * c.mix[k] + (1 - w) * p[k] : (c ? c.mix[k] : p[k])])); };
  const allMix = Object.keys({ ...cur, ...prevMix }).map(mixOf).filter(Boolean);
  const lgMix = Object.fromEntries(CATS.map((c) => [c, mean(allMix.map((x) => x[c]))]));
  const teams = {};
  for (const team of new Set([...Object.keys(cur), ...Object.keys(prevBy)])) {
    const c = cur[team], p = prevBy[team], w = c ? c.gp / (c.gp + 20) : 0; // last season counts like 20 games
    const blend = (k) => (c && p ? w * c[k] + (1 - w) * p[k] : (c || p)[k]);
    const fp = Object.fromEntries([...OFF, ...DEF].map(([k]) => [k, blend(k)]));
    const zo = zrow(fp, OFF, prior.stats.off), zd = zrow(fp, DEF, prior.stats.def);
    const ro = prior.centroids.off.map((ce) => dist(zo, ce)), rd = prior.centroids.def.map((ce) => dist(zd, ce));
    const rank = (a) => a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    const [o1, o2] = rank(ro), [d1, d2] = rank(rd);
    teams[team] = { gp: c?.gp || 0, weightThisSeason: Math.round(w * 100) / 100,
      off: o1, off2: o2, offFit: Math.round((ro[o2] / (ro[o1] + ro[o2])) * 100), def: d1, def2: d2, defFit: Math.round((rd[d2] / (rd[d1] + rd[d2])) * 100),
      z: Object.fromEntries([...OFF.map(([k], i) => [k, Math.round(zo[i] * 100) / 100]), ...DEF.map(([k], i) => [k, Math.round(zd[i] * 100) / 100])]),
      raw: Object.fromEntries(Object.entries(fp).map(([k, v]) => [k, Math.round(v * 10000) / 10000])),
      allowedMix: (() => { const m = mixOf(team); return m ? Object.fromEntries(CATS.map((k) => [k, lgMix[k] ? Math.round((m[k] / lgMix[k] - 1) * 1000) / 1000 : 0])) : null; })() };
  }
  return { updatedAt: new Date().toISOString(), season, prior: { seasons: prior.seasons, builtAt: prior.builtAt }, features: prior.features,
    archetypes: prior.archetypes, matchups: prior.matchups, offMix: prior.offMix, teams };
}
