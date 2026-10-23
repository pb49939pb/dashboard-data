// Shared with milestone watch and team assets: one cached NHL player-page request supplies career achievements, milestones
// and prospects' scoring in every league (`leagues`, regular seasons; prospects have no NHL career totals yet).
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
export const readJson=p=>readFile(p,'utf8').then(JSON.parse,()=>null);
export async function nhlJson(url){
 const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (The Other Score; personal hockey research)'},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error(`NHL ${r.status}: ${url}`);return r.json();
}
export function slimLanding(d){
 if(!d.playerId||!d.firstName?.default||!d.seasonTotals)throw Error('Incomplete NHL player landing');
 const seen=new Set(),leagues=[];
 for(const s of d.seasonTotals){if(s.gameTypeId!==2||!s.gamesPlayed)continue;const key=`${s.season}|${s.leagueAbbrev}|${s.gamesPlayed}|${s.points}`;
  if(seen.has(key))continue;seen.add(key);leagues.push({season:s.season,league:s.leagueAbbrev,gp:s.gamesPlayed,pts:s.points??0});} // the same season can be listed twice under a renamed team
 return {schema:2,id:d.playerId,name:`${d.firstName.default} ${d.lastName?.default||''}`.trim(),team:d.currentTeamAbbrev,pos:d.position,birthDate:d.birthDate||null,career:d.careerTotals?.regularSeason||null,playoffs:d.careerTotals?.playoffs||null,leagues,
 awards:(d.awards||[]).map(a=>({name:a.trophy?.default,seasons:[...new Set((a.seasons||[]).map(s=>s.seasonId))].sort()})).filter(a=>a.name),
 playoffSeasons:[...new Set((d.seasonTotals||[]).filter(s=>s.leagueAbbrev==='NHL'&&s.gameTypeId===3&&s.gamesPlayed>0).map(s=>s.season))].sort(),
 seasons:(d.seasonTotals||[]).filter(s=>s.leagueAbbrev==='NHL'&&s.gameTypeId===2).slice(-3).map(s=>({season:s.season,gp:s.gamesPlayed,g:s.goals??0,a:s.assists??0,w:s.wins??0,so:s.shutouts??0,gs:s.gamesStarted??null})),fetchedAt:new Date().toISOString()};
}
export async function careerLanding(id,{fresh=false,migrate=false,leagues=false}={}){
 await mkdir('.cache/careers',{recursive:true});const file=`.cache/careers/${id}.json`,old=await readJson(file),age=await stat(file).then(s=>Date.now()-s.mtimeMs,()=>Infinity);
 if(old&&age<(fresh?20:144)*3600e3&&(!migrate||old.schema===2)&&(!leagues||old.leagues))return old;
 for(let i=0;i<3;i++){try{const d=slimLanding(await nhlJson(`https://api-web.nhle.com/v1/player/${id}/landing`));await writeFile(file,JSON.stringify(d));return d;}catch(e){if(i===2){console.warn(`Career ${id}: ${e.message}; retaining cache`);return old;}await new Promise(r=>setTimeout(r,500*(i+1)));}}
}
