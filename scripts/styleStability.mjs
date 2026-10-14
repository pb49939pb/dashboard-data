// Style-cluster stability (audit: team style and system fit). The archetypes come from k-means on 64 team-seasons;
// before their matchup effects move any odds, check that they are real:
//   1. bootstrap: resample team-seasons, re-cluster, compare with the full-sample clustering on the same teams
//      (adjusted Rand index; 1 = identical, 0 = chance), for k = 2..7 offense and 2..6 defense
//   2. year to year: does a team keep its archetype from 2024-25 to 2025-26 (vs chance), and how well does each
//      fingerprint feature repeat (correlation)?
//   3. out of season: matchup effects estimated on one season's games predict the other season's game-level xG
//      residuals? Compared with predicting no matchup effect, at full and at the site's half weight, against a null of
//      200 label permutations (effects from shuffled archetypes).
//   HOCKEY_CACHE=../hockey-models/data/raw/pbp node scripts/styleStability.mjs 20242025 20252026  -> model/styleStability.json
import { readFile, readdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { scoreGame } from "./league.mjs";
import { fingerprints, kmeans, OFF, DEF } from "./style.mjs";

const dir = process.env.HOCKEY_CACHE, seasons = process.argv.slice(2);
const model = JSON.parse(await readFile("model/xg_logit.json", "utf8"));
model.gbm = JSON.parse(await readFile("model/xg_gbm.json", "utf8"));
model.hands = {};
for (const s of seasons) {
  const r = await fetch(`https://api.nhle.com/stats/rest/en/skater/bios?isAggregate=false&isGame=false&limit=-1&cayenneExp=seasonId=${s}`, { headers: { "user-agent": "pat-dashboard (personal, low volume)" } }).then((x) => x.json());
  for (const p of r.data || []) if (p.shootsCatches) model.hands[p.playerId] = p.shootsCatches;
}
const bySeason = {}, files = await readdir(dir);
for (const s of seasons) {
  bySeason[s] = [];
  for (const f of files.filter((f) => f.startsWith(s.slice(0, 4)))) {
    const pbp = JSON.parse(gunzipSync(await readFile(`${dir}/${f}`)));
    if (String(pbp.season) !== s || pbp.gameType !== 2) continue;
    bySeason[s].push(scoreGame(pbp, model));
  }
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2))) || 1;
const corr = (a, b) => { const ma = mean(a), mb = mean(b); return a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0) / Math.sqrt(a.reduce((s, v) => s + (v - ma) ** 2, 0) * b.reduce((s, v) => s + (v - mb) ** 2, 0)); };
let seed = 20261014; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const rows = [];
for (const [season, games] of Object.entries(bySeason)) for (const [team, fp] of Object.entries(fingerprints(games))) rows.push({ season, team, fp });
const Z = (feats) => { const st = feats.map(([k]) => [mean(rows.map((r) => r.fp[k])), sd(rows.map((r) => r.fp[k]))]); return rows.map((r) => feats.map(([k], i) => (r.fp[k] - st[i][0]) / st[i][1])); };
const Zo = Z(OFF), Zd = Z(DEF);
const assign = (X, C) => X.map((x) => C.map((c) => c.reduce((s, v, i) => s + (v - x[i]) ** 2, 0)).reduce((bi, v, i, a) => (v < a[bi] ? i : bi), 0));
function ari(a, b) {
  const n = a.length, key = (x, y) => `${x}|${y}`, nij = {}, ai = {}, bj = {};
  a.forEach((x, i) => { nij[key(x, b[i])] = (nij[key(x, b[i])] || 0) + 1; ai[x] = (ai[x] || 0) + 1; bj[b[i]] = (bj[b[i]] || 0) + 1; });
  const c2 = (m) => (m * (m - 1)) / 2, sij = Object.values(nij).reduce((s, v) => s + c2(v), 0), sa = Object.values(ai).reduce((s, v) => s + c2(v), 0), sb = Object.values(bj).reduce((s, v) => s + c2(v), 0);
  const exp = (sa * sb) / c2(n), max = (sa + sb) / 2;
  return max === exp ? 1 : (sij - exp) / (max - exp);
}
// 1. bootstrap stability
const boot = (X, k, B = 100) => {
  const full = assign(X, kmeans(X, k, 11, 10)), scores = [];
  for (let b = 0; b < B; b++) {
    const idx = Array.from({ length: X.length }, () => Math.floor(rand() * X.length));
    const C = kmeans(idx.map((i) => X[i]), k, 100 + b, 5);
    const lab = assign(X, C);
    scores.push(ari(full, lab));
  }
  scores.sort((a, b) => a - b);
  return { meanARI: +mean(scores).toFixed(3), p10: +scores[Math.floor(B * 0.1)].toFixed(3), p90: +scores[Math.floor(B * 0.9)].toFixed(3) };
};
const bootstrap = { off: {}, def: {} };
for (let k = 2; k <= 7; k++) bootstrap.off[k] = boot(Zo, k);
for (let k = 2; k <= 6; k++) bootstrap.def[k] = boot(Zd, k);
// 2. year to year
const [A, B] = seasons;
const labO = assign(Zo, kmeans(Zo, 5, 11)), labD = assign(Zd, kmeans(Zd, 4, 13));
const idx = (s, t) => rows.findIndex((r) => r.season === s && r.team === t);
const both = rows.filter((r) => r.season === A).map((r) => r.team).filter((t) => idx(B, t) >= 0);
const keep = (lab) => { const same = mean(both.map((t) => (lab[idx(A, t)] === lab[idx(B, t)] ? 1 : 0))); const share = {}; lab.forEach((l) => (share[l] = (share[l] || 0) + 1 / lab.length)); return { kept: +same.toFixed(3), chance: +Object.values(share).reduce((s, p) => s + p * p, 0).toFixed(3) }; };
const featureR = Object.fromEntries([...OFF, ...DEF].map(([k, l]) => [l, +corr(both.map((t) => rows[idx(A, t)].fp[k]), both.map((t) => rows[idx(B, t)].fp[k])).toFixed(3)]));
// 3. out-of-season matchup test: residual r = game xGF / (team's season xGF/g x opponent's season xGA/g / league) - 1
const lgx = mean(rows.map((r) => r.fp.xgfPg));
function obs(season, lo, ld) {
  const out = [];
  for (const g of bySeason[season]) {
    const one = fingerprints([g]);
    for (const [a, b] of [[g.home, g.away], [g.away, g.home]]) {
      const ia = idx(season, a), ib = idx(season, b);
      if (ia < 0 || ib < 0 || !one[a]) continue;
      const exp = (rows[ia].fp.xgfPg * rows[ib].fp.xgaPg) / lgx;
      out.push({ o: lo[ia], d: ld[ib], r: one[a].xgfPg / exp - 1 });
    }
  }
  return out;
}
const effects = (o) => { const m = {}; for (const x of o) { const k = `${x.o}|${x.d}`; (m[k] ??= []).push(x.r); } return Object.fromEntries(Object.entries(m).filter(([, v]) => v.length >= 30).map(([k, v]) => [k, mean(v)])); };
const score = (train, test, w) => { const E = effects(train); return mean(test.map((x) => (x.r - w * (E[`${x.o}|${x.d}`] ?? 0)) ** 2)); };
const test = {};
for (const [tr, te] of [[A, B], [B, A]]) {
  const oTr = obs(tr, labO, labD), oTe = obs(te, labO, labD), none = mean(oTe.map((x) => x.r ** 2));
  const full = score(oTr, oTe, 1), half = score(oTr, oTe, 0.5);
  const nulls = [];
  for (let p = 0; p < 200; p++) {
    const perm = (lab) => { const L = [...lab]; for (let i = L.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [L[i], L[j]] = [L[j], L[i]]; } return L; };
    const po = perm(labO), pd = perm(labD);
    nulls.push(none - score(obs(tr, po, pd), oTe, 0.5));
  }
  nulls.sort((a, b) => a - b);
  const gain = none - half;
  test[`${tr}->${te}`] = { games: oTe.length, mseNone: +none.toFixed(5), mseFull: +full.toFixed(5), mseHalf: +half.toFixed(5), gainHalf: +gain.toFixed(6),
    nullP: +(nulls.filter((v) => v >= gain).length / nulls.length).toFixed(3), null90: +nulls[179].toFixed(6) };
}
const out = { model: "Team style stability", builtAt: new Date().toISOString(), seasons, teamSeasons: rows.length, bootstrap, yearToYear: { off: keep(labO), def: keep(labD), featureR }, matchupOutOfSeason: test };
const helpful = Object.values(test).every((t) => t.gainHalf > 0 && t.nullP < 0.1);
out.decision = helpful ? "Matchup effects carry over between seasons beyond chance: keep at half weight." : "Matchup effects don't beat the no-matchup baseline out of season beyond chance (label-permutation null): drop them from game odds; keep archetypes as descriptions only.";
await writeFile("model/styleStability.json", JSON.stringify(out));
console.log(JSON.stringify(out, null, 1));
