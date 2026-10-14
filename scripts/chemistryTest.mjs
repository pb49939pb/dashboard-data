// Line chemistry test (audit section 9: lineup and partner chemistry). For every forward trio and defense pair with an
// hour or more together at 5v5 in BOTH halves of a season: chemistry = the unit's 5v5 xG share together minus the
// average of its members' xG shares when on the ice without that unit. Does a unit's chemistry in the first half
// predict its second half? Correlation (and the implied shrinkage: reliability r means keep r of an observed number).
// Also the raw xG share of the unit, which carries the members' own quality and should repeat more.
//   node scripts/chemistryTest.mjs 20252026     -> model/scorecards.json (chemistry)
import { readFile, writeFile, readdir } from "node:fs/promises";

const season = process.argv[2] || "20252026";
const dir = `public/hockey/seasons/${season}/teams`, by = new Map();
for (const f of await readdir(dir)) for (const g of JSON.parse(await readFile(`${dir}/${f}`, "utf8")).games || []) if (String(g.id).slice(4, 6) === "02" && g.shots && g.u5 && g.players) by.set(g.id, g);
const games = [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
const mid = games[Math.floor(games.length / 2)].date;
const H = [{}, {}]; // half -> { unit key: {t, f, a} , "p:"+id: {f, a} }
for (const g of games) {
  const h = g.date < mid ? 0 : 1, S = H[h];
  for (const side of [0, 1]) for (const kind of ["F", "D"]) for (const [k, sec] of Object.entries(g.u5[side][kind])) { const u = (S[`${kind}:${k}`] ??= { t: 0, f: 0, a: 0 }); u.t += sec; }
  for (const s of g.shots) {
    if (s[7] !== "5v5" || s[2] === "b" || s[4] == null || s[13] === 1 || !Array.isArray(s[11])) continue;
    const att = s[3], v = s[4];
    for (const side of [0, 1]) {
      const on = s[11][side] || [], F = on.filter((i) => g.players[i]?.[1] !== "D").sort((a, b) => a - b), D = on.filter((i) => g.players[i]?.[1] === "D").sort((a, b) => a - b);
      const keys = [...(F.length === 3 ? [`F:${F.join("-")}`] : []), ...(D.length === 2 ? [`D:${D.join("-")}`] : [])];
      for (const k of keys) { const u = (S[k] ??= { t: 0, f: 0, a: 0 }); if (side === att) u.f += v; else u.a += v; }
      for (const i of on) { const p = (S[`p:${i}`] ??= { f: 0, a: 0, units: {} }); if (side === att) p.f += v; else p.a += v; for (const k of keys) { const pu = (p.units[k] ??= { f: 0, a: 0 }); if (side === att) pu.f += v; else pu.a += v; } }
    }
  }
}
function chem(S, k) {
  const u = S[k]; if (!u || u.f + u.a < 1) return null;
  const share = u.f / (u.f + u.a), ids = k.slice(2).split("-");
  const apart = ids.map((i) => { const p = S[`p:${i}`], pu = p?.units[k] || { f: 0, a: 0 }; const f = (p?.f || 0) - pu.f, a = (p?.a || 0) - pu.a; return f + a > 0.5 ? f / (f + a) : null; }).filter((x) => x != null);
  return apart.length ? { share, chem: share - apart.reduce((s, x) => s + x, 0) / apart.length } : null;
}
const corr = (x, y) => { const m = (a) => a.reduce((s, v) => s + v, 0) / a.length, mx = m(x), my = m(y); return x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) * y.reduce((s, v) => s + (v - my) ** 2, 0)); };
const out = { model: "Line chemistry", season, builtAt: new Date().toISOString(), splitDate: mid, minMinutesEachHalf: 60, units: {} };
for (const kind of ["F", "D"]) {
  const keys = Object.keys(H[0]).filter((k) => k.startsWith(`${kind}:`) && H[0][k].t >= 3600 && H[1][k]?.t >= 3600);
  const pairs = keys.map((k) => [chem(H[0], k), chem(H[1], k)]).filter(([a, b]) => a && b);
  let seed = 4; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ci = (fa, fb) => { const bs = []; for (let i = 0; i < 2000; i++) { const s = pairs.map(() => pairs[Math.floor(rand() * pairs.length)]); bs.push(corr(s.map(fa), s.map(fb))); } bs.sort((a, b) => a - b); return [+bs[50].toFixed(3), +bs[1949].toFixed(3)]; };
  out.units[kind === "F" ? "forward trios" : "defense pairs"] = { units: pairs.length, chemistryR: +corr(pairs.map(([a]) => a.chem), pairs.map(([, b]) => b.chem)).toFixed(3), chemistryCI: ci(([a]) => a.chem, ([, b]) => b.chem),
    xgShareR: +corr(pairs.map(([a]) => a.share), pairs.map(([, b]) => b.share)).toFixed(3), xgShareCI: ci(([a]) => a.share, ([, b]) => b.share) };
}
const real = Object.values(out.units).some((u) => u.chemistryCI[0] > 0);
out.decision = real ? "Some chemistry carries over: show it, shrunk by its reliability" : "Chemistry (a unit beyond its members) doesn't carry over from one half to the next: lines are shown as deployment and results, never as chemistry";
console.log(JSON.stringify(out, null, 1));
const sc = JSON.parse(await readFile("model/scorecards.json", "utf8")); sc.chemistry = out; await writeFile("model/scorecards.json", JSON.stringify(sc));
