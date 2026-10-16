// Nightly 5v5 competition summaries; cached overlap seconds stay independent of changing player values.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const round = (x,n=2) => Number(x.toFixed(n));
export function buildCompetition(games, values, players) {
  const V = new Map(values.map(p=>[Number(p.id),p]));
  const totals = new Map(), names = new Map();
  for (const g of new Map(games.map(g=>[g.id,g])).values()) {
    for (const [id,p] of Object.entries(g.players || {})) names.set(Number(id),p[0]);
    const dressed = [0,1].map(sd=>Object.entries(g.players || {}).filter(([,p])=>p[2]===sd && p[1]!=='G').map(([id])=>Number(id)));
    const top = dressed.map(ids=>new Set(['F','D'].flatMap(group=>ids.filter(id=>(g.players[id][1]==='D'?'D':'F')===group).sort((a,b)=>(V.get(b)?.war82??0)-(V.get(a)?.war82??0)).slice(0,group==='D'?4:6))));
    // Expected games comes from the dressed roster, even when usable shifts are missing.
    for(const id of dressed.flat()) { const t=totals.get(id)||{games:0,coveredGames:new Set(),seconds:0,weighted:0,known:0,top:0,opponents:new Map()};t.games++;totals.set(id,t); }
    for(const [H,A,secs] of g.competition || []) {
      if(H.length!==5 || A.length!==5 || !Number.isFinite(secs) || secs<=0) continue;
      for(const [sd,own,opp] of [[0,H,A],[1,A,H]]) for(const id of own) {
        const t=totals.get(id); if(!t)continue;
        t.coveredGames.add(g.id);t.seconds+=secs;
        if(opp.filter(o=>top[1-sd].has(o)).length>=3)t.top+=secs;
        for(const o of opp){const v=V.get(o)?.war82; t.weighted+=(Number.isFinite(v)?v:0)*secs; if(Number.isFinite(v))t.known+=secs;t.opponents.set(o,(t.opponents.get(o)||0)+secs);}
      }
    }
  }
  const out=players.map(p=>{const t=totals.get(p.id);if(!t?.seconds)return {...p,competition:null};return {...p,competition:{opponentWar82:round(t.weighted/(5*t.seconds)),minutes:round(t.seconds/60,1),topMinutes:round(t.top/60,1),topPercent:round(t.top/t.seconds*100,1),games:t.coveredGames.size,totalGames:t.games,knownValuePercent:round(t.known/(5*t.seconds)*100,1),percentile:null,peerCount:0,mostFaced:[...t.opponents].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,3).map(([id,seconds])=>({id,name:names.get(id)||V.get(id)?.name||String(id),minutes:round(seconds/60,1)}))}};});
  for(const pos of ['F','D']){
    const peers=out.filter(p=>p.pos===pos&&p.competition?.minutes>=60&&p.competition.knownValuePercent>=80);
    for(const p of peers){const q=p.competition,below=peers.filter(x=>x.competition.opponentWar82<q.opponentWar82).length,equal=peers.filter(x=>x.competition.opponentWar82===q.opponentWar82).length;
      q.peerCount=peers.length;q.percentile=peers.length>=2?Math.round(100*(below+(equal-1)/2)/(peers.length-1)):null;}
  }
  return out;
}
export async function enrichCompetition(dir='public/hockey') {
  const read=async f=>JSON.parse(await readFile(f,'utf8'));
  const doc = await read(`${dir}/players.json`).catch(e => { if(e.code === 'ENOENT') return null; throw e; });
  if(!doc){console.log('competition: skipped; no new player ratings to enrich');return null;}
  const [values,league]=await Promise.all([read('model/playerValue.json'),read(`${dir}/league.json`)]);
  if(String(doc.season)!==String(league.season))throw Error('Competition season mismatch');
  const games=[];for(const f of await readdir(`${dir}/teams`)){if(!f.endsWith('.json'))continue;const t=await read(`${dir}/teams/${f}`);if(String(t.season)!==String(doc.season))continue;games.push(...(t.games||[]));}
  doc.players=buildCompetition(games,values.players,doc.players);
  doc.competitionMeta={updatedAt:new Date().toISOString(),throughDate:league.throughDate,valueBuiltAt:values.builtAt,valueSeason:values.season,minimumMinutes:60,minimumKnownValuePercent:80,source:'NHL shift charts; WAR-lite opponent values',unknownValue:0};
  const encoded=JSON.stringify(doc);
  if(Buffer.byteLength(encoded)>1_000_000)throw Error('Competition-enriched player document exceeds publication size limit');
  await writeFile(`${dir}/players.json`,encoded);
  console.log(`competition: ${doc.players.filter(p=>p.competition).length} players; ${doc.players.filter(p=>p.competition?.percentile!=null).length} ranked`);
  return doc;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)await enrichCompetition(process.argv[2]);
