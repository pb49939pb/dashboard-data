// Player ratings for Hockey Lab: offense, defense, usage and overall, for every skater, from MoneyPuck's season files
// (on-ice expected goals for/against and off-ice comparisons, ice time by situation, zone starts, blocks, takeaways,
// giveaways, faceoffs). This season blends with last season at half weight, so a few games can't swing a rating.
// Ratings run 40-99 like EA NHL: league average 75, one standard deviation 8 points, compared within position.
//
//   Offense = 35% individual xG/60 + 30% primary assists/60 + 35% on-ice xGF/60 relative to off-ice (5v5)
//   Defense = 45% on-ice xGA/60 relative to off-ice (5v5, lower is better) + 20% defensive-zone start share
//             + 20% penalty-kill minutes per game + 15% (blocks + takeaways - giveaways)/60
//   Usage   = ice time per game (coaches play who they trust)
//   Overall = defensemen 30% offense / 35% defense / 35% usage; forwards 45% / 25% / 30%
const num = (x) => (x === undefined || x === "" ? 0 : Number(x));

function parse(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => { const v = l.split(","); return Object.fromEntries(cols.map((c, i) => [c, v[i]])); });
}

/** One season's per-player numbers from MoneyPuck's skaters.csv. */
function seasonStats(text) {
  const rows = parse(text);
  const by = {};
  for (const r of rows) (by[r.playerId] ??= {})[r.situation] = r;
  const teamT = {}; // team 5v5 time = sum of its skaters' 5v5 time / 5
  for (const p of Object.values(by)) if (p["5on5"]) teamT[p["5on5"].team] = (teamT[p["5on5"].team] || 0) + num(p["5on5"].icetime) / 5;
  const out = {};
  for (const [id, p] of Object.entries(by)) {
    const a = p.all, e = p["5on5"], pk = p["4on5"], pp = p["5on4"];
    if (!a || !e) continue;
    const toi = num(a.icetime) / 60, toi5 = num(e.icetime) / 60, gp = num(a.games_played);
    const off5 = Math.max(1, (teamT[e.team] || 0) / 60 - toi5);
    if (!toi || !toi5) continue;
    out[id] = {
      id: Number(id), name: a.name, team: a.team, pos: a.position === "D" ? "D" : "F", posRaw: a.position, gp, toi, toi5,
      pktoi: pk ? num(pk.icetime) / 60 : 0, pptoi: pp ? num(pp.icetime) / 60 : 0,
      ixg: num(a.I_F_xGoals), pa: num(a.I_F_primaryAssists), pts: num(a.I_F_points),
      onF: num(e.OnIce_F_xGoals), onA: num(e.OnIce_A_xGoals), gf: num(e.OnIce_F_goals), ga: num(e.OnIce_A_goals),
      onF60: (num(e.OnIce_F_xGoals) / toi5) * 60, onA60: (num(e.OnIce_A_xGoals) / toi5) * 60,
      offF60: (num(e.OffIce_F_xGoals) / off5) * 60, offA60: (num(e.OffIce_A_xGoals) / off5) * 60,
      oz: num(a.I_F_oZoneShiftStarts), dz: num(a.I_F_dZoneShiftStarts),
      blk: num(a.shotsBlockedByPlayer), tk: num(a.I_F_takeaways), gv: num(a.I_F_giveaways),
      fow: num(a.faceoffsWon), fol: num(a.faceoffsLost),
    };
  }
  return out;
}

const zer = (vals) => {
  const m = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, vals.length - 1)) || 1;
  return (v) => (v - m) / sd;
};
const rating = (z) => Math.max(40, Math.min(99, Math.round(75 + 8 * z)));

export function buildPlayers(curText, prevText) {
  const cur = seasonStats(curText), prev = prevText ? seasonStats(prevText) : {};
  const players = [];
  for (const id of new Set([...Object.keys(cur), ...Object.keys(prev)])) {
    const c = cur[id], p = prev[id], base = c || p;
    const wc = c ? c.toi : 0, wp = p ? p.toi * 0.5 : 0, W = wc + wp;
    if (W < 60) continue; // about three games of minutes
    const mix = (f) => ((c ? f(c) * wc : 0) + (p ? f(p) * wp : 0)) / W;
    players.push({
      id: base.id, name: base.name, team: (c || p).team, pos: base.pos, posRaw: base.posRaw, minutes: Math.round(W),
      toiGp: mix((r) => r.toi / Math.max(1, r.gp)), pkGp: mix((r) => r.pktoi / Math.max(1, r.gp)), ppGp: mix((r) => r.pptoi / Math.max(1, r.gp)),
      ixg60: mix((r) => (r.ixg / r.toi) * 60), pa60: mix((r) => (r.pa / r.toi) * 60), pts60: mix((r) => (r.pts / r.toi) * 60),
      relF: mix((r) => r.onF60 - r.offF60), relA: mix((r) => r.offA60 - r.onA60), onA60: mix((r) => r.onA60), onF60: mix((r) => r.onF60),
      dzs: mix((r) => r.dz / Math.max(1, r.oz + r.dz)), def60: mix((r) => ((r.blk + r.tk - r.gv) / r.toi) * 60),
      fo: mix((r) => (r.fow + r.fol >= 20 ? r.fow / (r.fow + r.fol) : NaN)),
      // this season only, for display
      season: c ? { gp: c.gp, toiGp: c.toi / Math.max(1, c.gp), xpm: c.onF - c.onA, pm: c.gf - c.ga, xgPct: c.onF + c.onA ? c.onF / (c.onF + c.onA) : null,
        gf: c.gf, ga: c.ga, onF: c.onF, onA: c.onA, dzs: c.dz / Math.max(1, c.oz + c.dz), blk: c.blk, tk: c.tk, gv: c.gv } : null,
    });
  }
  for (const pos of ["D", "F"]) {
    const G = players.filter((x) => x.pos === pos), ref = G.filter((x) => x.minutes >= 200);
    const z = (k) => zer(ref.map((x) => x[k]));
    const [zi, za, zf, zA, zd, zpk, zdef, zt] = ["ixg60", "pa60", "relF", "relA", "dzs", "pkGp", "def60", "toiGp"].map(z);
    const off = (x) => 0.35 * zi(x.ixg60) + 0.3 * za(x.pa60) + 0.35 * zf(x.relF);
    const def = (x) => 0.45 * zA(x.relA) + 0.2 * zd(x.dzs) + 0.2 * zpk(x.pkGp) + 0.15 * zdef(x.def60);
    const use = (x) => zt(x.toiGp);
    const w = pos === "D" ? [0.3, 0.35, 0.35] : [0.45, 0.25, 0.3];
    const comb = (x) => w[0] * off(x) + w[1] * def(x) + w[2] * use(x);
    const [zo, zde, zu, zc] = [off, def, use, comb].map((fn) => zer(ref.map(fn)));
    for (const x of G) x.ratings = { ovr: rating(zc(comb(x))), off: rating(zo(off(x))), def: rating(zde(def(x))), use: rating(zu(use(x))) };
  }
  const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
  return players.map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === "number" ? r3(v) : v && typeof v === "object" && !Array.isArray(v) && k === "season" ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, typeof b === "number" ? r3(b) : b])) : v])));
}
