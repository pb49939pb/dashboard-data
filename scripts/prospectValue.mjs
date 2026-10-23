// Prospect production (hockey-models/hockey/prospects.py, model/prospects.json): a drafted prospect's expected wins over
// his first window from his draft slot plus what he has scored since, in every league, translated to NHL-equivalent
// points per game. This mirrors the Python features exactly (tests/prospectValue.test.mjs checks it against fixtures).
//   rows: [{season: 20252026, league: "SHL", gp, pts}] regular seasons (careerLanding's `leagues`)
export const ALIAS = {Russia:'KHL','Rus-KHL':'KHL',Sweden:'SHL',NLA:'NL',Swiss:'NL',Finland:'Liiga','SM-liiga':'Liiga',CzRep:'Czechia',Czech:'Czechia',
 Germany:'DEL','Sweden-2':'Allsvenskan',HockeyAllsvenskan:'Allsvenskan',Austria:'ICEHL',EBEL:'ICEHL',WCHA:'NCAA',NCHC:'NCAA','H-East':'NCAA',CCHA:'NCAA',
 'Big Ten':'NCAA',ECAC:'NCAA',Atlantic:'NCAA',AHA:'NCAA',CHA:'NCAA','Hockey-East':'NCAA','Big-Ten':'NCAA','Russia-2':'VHL',
 'Swe-Jr.':'J20 Nationell',SuperElit:'J20 Nationell','J20 SuperElit':'J20 Nationell'};

export function prospectExpected(model, rows, {draftYear, overall, pos, birthDate, curStart}) {
 if (!model?.models || !draftYear || !overall || pos === 'G') return null;
 const k = Math.max(0, Math.min(Math.max(...model.origins), curStart - draftYear)), m = model.models[k];
 if (!m) return null;
 const f = model.factors, lo = draftYear - 1, hi = draftYear + k - 1, seasons = new Map();
 for (const r of rows || []) {
  const start = Math.floor(r.season / 10000), lg = ALIAS[r.league] || r.league;
  if (start < lo || start > hi || start > curStart - 1 || !f[lg] || !r.gp) continue;
  const s = seasons.get(start) || {eqp: 0, gp: 0, nhlGp: 0, lines: []};
  s.eqp += (r.pts || 0) * f[lg]; s.gp += r.gp; if (lg === 'NHL') s.nhlGp += r.gp;
  s.lines.push({league: r.league, gp: r.gp, pts: r.pts || 0});
  seasons.set(start, s);
 }
 const last = seasons.get(hi), nhle = (s) => s.eqp / s.gp;
 const nhleLast = last ? nhle(last) : 0, best = [...seasons.values()].filter((s) => s.gp >= 10).map(nhle);
 const nhlGp = [...seasons.values()].reduce((a, s) => a + s.nhlGp, 0);
 const group = pos === 'D' ? 'D' : 'F', curve = m.curve[group];
 const slot = curve.reduce((b, c) => (Math.abs(c[0] - overall) < Math.abs(b[0] - overall) ? c : b))[1];
 const born = birthDate ? new Date(`${birthDate}T00:00:00Z`) : null;
 const age = born ? (Date.UTC(draftYear, 8, 15) - born.getTime()) / 864e5 / 365.25 : m.ageMedian;
 const x = {slot, nhle_last: nhleLast, nhle_best: best.length ? Math.max(...best) : nhleLast, nhle_last_d: group === 'D' ? nhleLast : 0,
  gp_last: Math.log1p(last ? last.gp : 0), age, is_d: group === 'D' ? 1 : 0};
 const z = model.features.reduce((a, name, i) => a + m.coef[i + 1] * (x[name] - m.mu[i]) / m.sd[i], m.coef[0]);
 return {wins: Math.max(0, z), slotWins: slot, k, nhlGp, nhle: +nhleLast.toFixed(3), season: last ? hi * 10000 + hi + 1 : null, lines: last ? last.lines : []};
}
