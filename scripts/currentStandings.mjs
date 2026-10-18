// A small official standings companion for the existing shared score feed, independent of model builds.
export function normalizeStandings(payload, fetchedAt = new Date().toISOString()) {
  const input=payload?.standings;
  if(!Array.isArray(input)||input.length!==32)throw new Error('standings: expected 32 teams');
  const season=String(input[0].seasonId),seen=new Set();
  const teams=input.map(t=>{
    const team=t.teamAbbrev?.default;
    if(!/^[A-Z]{3}$/.test(team||'')||seen.has(team)||String(t.seasonId)!==season)throw new Error('standings: invalid team/season');
    seen.add(team);
    const row={team,gp:t.gamesPlayed,w:t.wins,l:t.losses,otl:t.otLosses,pts:t.points,rw:t.regulationWins,gf:t.goalFor,ga:t.goalAgainst,gd:t.goalDifferential};
    if(Object.entries(row).some(([k,v])=>k!=='team'&&(!Number.isInteger(v)||(k!=='gd'&&v<0)))||row.gp!==row.w+row.l+row.otl||row.pts!==2*row.w+row.otl||row.rw>row.w||row.gd!==row.gf-row.ga)throw new Error('standings: inconsistent record');
    return row;
  });
  const asOf=payload.standingsDateTimeUtc;
  if(!Number.isFinite(Date.parse(asOf))||!/^\d{8}$/.test(season))throw new Error('standings: missing timestamp/season');
  return {season,asOf,fetchedAt,teams};
}
export async function refreshStandings(previous, {fetcher=fetch,now=new Date().toISOString()}={}) {
  try {
    const response=await fetcher('https://api-web.nhle.com/v1/standings/now',{headers:{'User-Agent':'hockey-lab/1.0 (personal, non-commercial)'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const snapshot=normalizeStandings(await response.json(),now);
    if(previous&&Date.parse(snapshot.asOf)<Date.parse(previous.asOf))return previous;
    return snapshot;
  }catch(e){console.log(`standings refresh failed; keeping last good snapshot: ${e.message}`);return previous||null;}
}
