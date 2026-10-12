// Projected standings and playoff odds for Hockey Lab: team ratings from this season's score/venue-adjusted,
// opponent-adjusted xG (blended with last season's priors), then the rest of the season simulated many times,
// then the playoffs under the NHL format (top 3 per division + 2 wildcards per conference).
const SIMS = 10000;
const PRIOR_GAMES = 12;   // last season counts like this many games of this season's evidence
const SHRINK_SHOTS = 2500;

/** Seeded random numbers so tonight's numbers are reproducible. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Per-team ratings from this season's games plus last season's prior. */
export function teamRatings(games, ratings, saLookup) {
  const w = ratings.weights;
  const rows = []; // per game per team: adjusted xG for
  const fin = {}, gk = {};
  for (const g of games) {
    let hs = 0, as = 0;
    const xgf = [0, 0];
    g.shots.forEach((s, i) => {
      const [, , kind, side, v] = s;
      if (kind === "b" || v === null) return;
      const empty = v === 0.9;
      const diff = side === 0 ? hs - as : as - hs;
      if (!empty) {
        const key = `${Math.max(-2, Math.min(2, diff))}|${side === 0 ? 1 : 0}`;
        xgf[side] += v * (w[key] ?? 1);
        const shooterTeam = side === 0 ? g.home : g.away, oppTeam = side === 0 ? g.away : g.home;
        const f = (fin[shooterTeam] ??= { g: 0, x: 0 }); f.x += v; if (kind === "g") f.g++;
        const k = (gk[oppTeam] ??= { g: 0, x: 0 }); k.x += saLookup?.get(`${g.id}:${i}`) ?? v; if (kind === "g") k.g++;
      }
      if (kind === "g") side === 0 ? hs++ : as++;
    });
    rows.push({ team: g.home, opp: g.away, home: 1, xgf: xgf[0] }, { team: g.away, opp: g.home, home: 0, xgf: xgf[1] });
  }
  const teams = Object.keys(ratings.prior);
  const off = {}, de = {};
  for (const t of teams) { off[t] = ratings.prior[t].off; de[t] = ratings.prior[t].def; }
  const mu = ratings.mu, h = ratings.home;
  for (let it = 0; it < 40; it++) {
    for (const t of teams) { // offense: actual xG for vs what average opponents' defense implies, plus prior pseudo-games
      const g = rows.filter((r) => r.team === t);
      const num = g.reduce((n, r) => n + r.xgf, 0) + PRIOR_GAMES * mu * ratings.prior[t].off;
      const den = g.reduce((n, r) => n + mu * de[r.opp] * (r.home ? h : 1 / h), 0) + PRIOR_GAMES * mu;
      off[t] = num / den;
    }
    for (const t of teams) {
      const g = rows.filter((r) => r.opp === t);
      const num = g.reduce((n, r) => n + r.xgf, 0) + PRIOR_GAMES * mu * ratings.prior[t].def;
      const den = g.reduce((n, r) => n + mu * off[r.team] * (r.home ? h : 1 / h), 0) + PRIOR_GAMES * mu;
      de[t] = num / den;
    }
  }
  const shrink = (o, p) => (o ? (o.g + SHRINK_SHOTS * 0.07 * p) / (o.x + SHRINK_SHOTS * 0.07) : p);
  const out = {};
  for (const t of teams) {
    const gp = rows.filter((r) => r.team === t).length;
    out[t] = { off: off[t], def: de[t], fin: shrink(fin[t], ratings.prior[t].fin), gk: shrink(gk[t], ratings.prior[t].gk), gp,
      // goals for / against per game against an average opponent
      gf: mu * off[t] * shrink(fin[t], ratings.prior[t].fin), ga: mu * de[t] * shrink(gk[t], ratings.prior[t].gk) };
  }
  return { teams: out, mu, home: h };
}

function poisson(lambda, k) { let p = Math.exp(-lambda); for (let i = 1; i <= k; i++) p *= lambda / i; return p; }
/** Regulation win / tie probabilities from expected goals (Poisson, capped at 12 goals). */
function gameProbs(lh, la) {
  let ph = 0, pa = 0, pt = 0;
  for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
    const p = poisson(lh, i) * poisson(la, j);
    if (i > j) ph += p; else if (j > i) pa += p; else pt += p;
  }
  const s = ph + pa + pt;
  return { h: ph / s, a: pa / s, t: pt / s, otH: lh / (lh + la) * 0.6 + 0.2 }; // OT/shootout: closer to a coin flip
}
function lambdas(R, home, away) {
  const a = R.teams[home], b = R.teams[away];
  return [R.mu * a.off * b.def * a.fin * b.gk * R.home, R.mu * b.off * a.def * b.fin * a.gk / R.home];
}

/**
 * standings: current NHL standings rows; remaining: [{id, home, away}] future games.
 * Returns projected table + playoff odds + most likely bracket.
 */
export function simulate({ R, standings, remaining, seed = 20261012 }) {
  const rand = rng(seed);
  const info = {};
  for (const s of standings) {
    const t = s.teamAbbrev.default;
    info[t] = { team: t, name: s.teamCommonName?.default || t, conf: s.conferenceAbbrev, div: s.divisionAbbrev, divName: s.divisionName,
      pts: s.points, gp: s.gamesPlayed, w: s.wins, rw: s.regulationWins ?? 0, logo: s.teamLogo };
  }
  const games = remaining.filter((g) => info[g.home] && info[g.away] && R.teams[g.home] && R.teams[g.away]).map((g) => {
    const [lh, la] = lambdas(R, g.home, g.away);
    return { ...g, ...gameProbs(lh, la) };
  });
  const teams = Object.keys(info);
  const acc = Object.fromEntries(teams.map((t) => [t, { pts: [], playoffs: 0, div: 0, pres: 0, r2: 0, r3: 0, final: 0, cup: 0 }]));
  const seriesProb = (hi, lo) => { // best-of-7, higher seed has home ice in games 1,2,5,7
    const ph = (x, y) => { const p = gameProbs(...lambdas(R, x, y)); return p.h + p.t * p.otH; };
    const pHomeHi = ph(hi, lo), pAwayHi = 1 - ph(lo, hi);
    const order = [1, 1, 0, 0, 1, 0, 1];
    const memo = new Map();
    const f = (gi, wh, wl) => {
      if (wh === 4) return 1; if (wl === 4) return 0;
      const k = `${gi}|${wh}|${wl}`; if (memo.has(k)) return memo.get(k);
      const p = order[gi] ? pHomeHi : pAwayHi;
      const v = p * f(gi + 1, wh + 1, wl) + (1 - p) * f(gi + 1, wh, wl + 1);
      memo.set(k, v); return v;
    };
    return f(0, 0, 0);
  };
  const seriesCache = new Map();
  const sp = (a, b) => { const k = `${a}|${b}`; if (!seriesCache.has(k)) seriesCache.set(k, seriesProb(a, b)); return seriesCache.get(k); };

  const bracketFrom = (table) => {
    const byConf = {};
    for (const conf of [...new Set(teams.map((t) => info[t].conf))]) {
      const inConf = table.filter((r) => info[r.team].conf === conf);
      const divs = [...new Set(inConf.map((r) => info[r.team].div))];
      const top = Object.fromEntries(divs.map((d) => [d, inConf.filter((r) => info[r.team].div === d).slice(0, 3)]));
      const taken = new Set(Object.values(top).flat().map((r) => r.team));
      const wc = inConf.filter((r) => !taken.has(r.team)).slice(0, 2);
      const leaders = divs.map((d) => top[d][0]).sort((a, b) => b.pts - a.pts || b.rw - a.rw);
      const firstDiv = info[leaders[0].team].div, secondDiv = info[leaders[1].team].div;
      byConf[conf] = { // division winner with more points plays the second wildcard
        [firstDiv]: [[top[firstDiv][0].team, wc[1].team], [top[firstDiv][1].team, top[firstDiv][2].team]],
        [secondDiv]: [[top[secondDiv][0].team, wc[0].team], [top[secondDiv][1].team, top[secondDiv][2].team]],
        order: [firstDiv, secondDiv],
      };
    }
    return byConf;
  };
  const playSeries = (a, b, rank) => { // a, b by seeding; home ice to more points
    const [hi, lo] = rank[a] >= rank[b] ? [a, b] : [b, a];
    return rand() < sp(hi, lo) ? hi : lo;
  };

  for (let n = 0; n < SIMS; n++) {
    const pts = {}, rw = {};
    for (const t of teams) { pts[t] = info[t].pts; rw[t] = info[t].rw; }
    for (const g of games) {
      const r = rand();
      if (r < g.h) { pts[g.home] += 2; rw[g.home]++; }
      else if (r < g.h + g.a) { pts[g.away] += 2; rw[g.away]++; }
      else { const ot = rand() < g.otH ? g.home : g.away; pts[ot] += 2; pts[ot === g.home ? g.away : g.home] += 1; }
    }
    const table = teams.map((t) => ({ team: t, pts: pts[t], rw: rw[t] + rand() * 0.01 })).sort((a, b) => b.pts - a.pts || b.rw - a.rw);
    table.forEach((r) => acc[r.team].pts.push(r.pts));
    acc[table[0].team].pres++;
    const rank = Object.fromEntries(table.map((r) => [r.team, r.pts + r.rw / 1000]));
    const br = bracketFrom(table);
    const confChamps = [];
    for (const conf of Object.keys(br)) {
      const c = br[conf];
      const sides = c.order.map((d) => {
        c[d][0].concat(c[d][1]).forEach((t) => { acc[t].playoffs++; });
        acc[c[d][0][0]].div++;
        const w1 = playSeries(c[d][0][0], c[d][0][1], rank), w2 = playSeries(c[d][1][0], c[d][1][1], rank);
        acc[w1].r2++; acc[w2].r2++;
        return playSeries(w1, w2, rank);
      });
      sides.forEach((t) => acc[t].r3++);
      const champ = playSeries(sides[0], sides[1], rank);
      acc[champ].final++; confChamps.push(champ);
    }
    acc[playSeries(confChamps[0], confChamps[1], rank)].cup++;
  }
  const pct = (x) => Math.round((x / SIMS) * 1000) / 10;
  const proj = teams.map((t) => {
    const p = acc[t].pts.sort((a, b) => a - b);
    const R0 = R.teams[t];
    return { ...info[t], projPts: Math.round(p.reduce((a, b) => a + b, 0) / SIMS * 10) / 10, lo: p[Math.floor(SIMS * 0.1)], hi: p[Math.floor(SIMS * 0.9)],
      playoffs: pct(acc[t].playoffs), division: pct(acc[t].div), presidents: pct(acc[t].pres), r2: pct(acc[t].r2), r3: pct(acc[t].r3), final: pct(acc[t].final), cup: pct(acc[t].cup),
      rating: { off: +R0.off.toFixed(3), def: +R0.def.toFixed(3), gf: +R0.gf.toFixed(2), ga: +R0.ga.toFixed(2), fin: +R0.fin.toFixed(3), gk: +R0.gk.toFixed(3), gp: R0.gp } };
  }).sort((a, b) => b.projPts - a.projPts);
  // Most likely bracket: seed from projected points, show each series' win probability
  const projTable = proj.map((r) => ({ team: r.team, pts: r.projPts, rw: 0 }));
  const rankProj = Object.fromEntries(proj.map((r) => [r.team, r.projPts]));
  const br = bracketFrom(projTable);
  const series = (a, b) => { const [hi, lo] = rankProj[a] >= rankProj[b] ? [a, b] : [b, a]; const p = sp(hi, lo); return { hi, lo, pHi: Math.round(p * 1000) / 10, fav: p >= 0.5 ? hi : lo }; };
  const bracket = {};
  for (const conf of Object.keys(br)) {
    const c = br[conf];
    const r1 = c.order.flatMap((d) => [series(...c[d][0]), series(...c[d][1])]);
    const r2 = [series(r1[0].fav, r1[1].fav), series(r1[2].fav, r1[3].fav)];
    const cf = series(r2[0].fav, r2[1].fav);
    bracket[conf] = { divisions: c.order, r1, r2, cf };
  }
  const confs = Object.keys(bracket);
  bracket.final = series(bracket[confs[0]].cf.fav, bracket[confs[1]].cf.fav);
  return { sims: SIMS, mu: R.mu, remaining: games.length, teams: proj, bracket };
}
