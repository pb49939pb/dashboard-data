// Fallback shift charts from the NHL's official HTML shift reports (TH = home, TV = visitor; nhl.com robots.txt allows
// /scores/htmlreports). Used only when the stats API has no shift chart for a game (it has none for most of the first
// week of 2026-27). Returns records in the API's shape ({playerId, period, startTime, endTime, typeCode: 517}) so the
// rest of the pipeline can't tell the difference; players are matched by team and sweater number from the
// play-by-play roster.
const UA = { "User-Agent": "hockey-lab/1.0 (+https://patrickreidbaldwin.com/hockey; personal, non-commercial)" };

function parse(htmlText) {
  const text = htmlText.replace(/<[^>]+>/g, "|").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'");
  const tok = text.split("|").map((s) => s.trim()).filter(Boolean);
  const out = [];
  let num = null;
  for (let i = 0; i < tok.length; i++) {
    const h = /^(\d{1,2}) [^,]+, .+$/.exec(tok[i]);
    if (h && tok[i + 1] === "Shift #") { num = Number(h[1]); continue; }
    if (num == null || !/^\d+$/.test(tok[i])) continue;
    const per = tok[i + 1], st = /^(\d+:\d\d) \//.exec(tok[i + 2] || ""), en = /^(\d+:\d\d) \//.exec(tok[i + 3] || "");
    if (!st || !en || !/^(\d|OT)$/.test(per)) continue;
    out.push({ num, period: per === "OT" ? 4 : Number(per), startTime: st[1], endTime: en[1] });
    i += 3;
  }
  return out;
}

export async function htmlShifts(id, pbp, get = (u) => fetch(u, { headers: UA }).then((r) => (r.ok ? r.text() : null))) {
  const sid = String(id), season = `${sid.slice(0, 4)}${Number(sid.slice(0, 4)) + 1}`, code = sid.slice(4);
  const roster = {};
  for (const p of pbp.rosterSpots || []) roster[`${p.teamId === pbp.homeTeam.id ? "H" : "V"}${p.sweaterNumber}`] = p.playerId;
  const recs = [];
  for (const [side, kind] of [["H", "TH"], ["V", "TV"]]) {
    await new Promise((r) => setTimeout(r, 1000));
    const html = await get(`https://www.nhl.com/scores/htmlreports/${season}/${kind}${code}.HTM`).catch(() => null);
    if (!html) return null;
    for (const s of parse(html)) {
      const playerId = roster[`${side}${s.num}`];
      if (playerId) recs.push({ playerId, period: s.period, startTime: s.startTime, endTime: s.endTime, typeCode: 517, source: "html" });
    }
  }
  return recs.length > 100 ? recs : null; // a real game has hundreds of shifts
}
