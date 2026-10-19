import {mkdir,writeFile} from 'node:fs/promises';
import {readJson,careerLanding,nhlJson} from './careerLanding.mjs';
import {seriesParticipation,careerRecord} from './careerAchievements.mjs';
import {openStore} from './store.mjs';
const publish=process.argv.includes('--publish'),bootstrap=process.argv.includes('--bootstrap');
const store=publish?await openStore():null;if(publish&&!store)throw Error('Server storage unavailable');
const league=await readJson('public/hockey/league.json')||await store?.read('hockey/league');if(!league)throw Error('League required');
// players out all season so far (injured, suspended: e.g. Hellebuyck, bug B79) have no league row yet; take them from tonight's absences
const injuries=await readJson('public/hockey/injuries.json')||await store?.read('hockey/injuries');
const absent=injuries?.current?.season===league.season?Object.values(injuries.current.teams||{}).flatMap(t=>t.players||[]):[];
const ids=[...new Set([...league.skaters,...league.goalies,...absent].map(p=>p.id).filter(Boolean))],players=[];
for(let i=0;i<ids.length;i+=4){players.push(...(await Promise.all(ids.slice(i,i+4).map(id=>bootstrap?careerLanding(id,{migrate:true}):readJson(`.cache/careers/${id}.json`).then(c=>c||careerLanding(id))))).filter(p=>p?.schema===2));if(bootstrap&&i%100===0)console.log(`Career pages: ${i}/${ids.length}`);}
await mkdir('.cache/playoff-achievements',{recursive:true});const seasons=[...new Set(players.flatMap(p=>p.playoffSeasons))].sort(),results={};
async function allStats(kind,season){const d=await nhlJson(`https://api.nhle.com/stats/rest/en/${kind}/summary?isAggregate=false&isGame=true&limit=-1&cayenneExp=seasonId=${season}%20and%20gameTypeId=3`);if(!Array.isArray(d.data)||d.data.length!==d.total)throw Error(`Incomplete ${kind} logs ${season}`);return d.data;}
for(const season of seasons){const file=`.cache/playoff-achievements/${season}.json`;let cached=await readJson(file);const finished=Number(String(season).slice(0,4))<Number(String(league.season).slice(0,4));
 if(!cached||(!finished&&Date.now()-Date.parse(cached.builtAt)>864e5)){try{const [records,teams,skaters,goalies]=await Promise.all([nhlJson(`https://records.nhl.com/site/api/playoff-series?cayenneExp=seasonId=${season}`),allStats('team',season),allStats('skater',season),allStats('goalie',season)]);if(!Array.isArray(records.data)||!records.data.length||records.data.length!==records.total||!teams.length)throw Error('No series records');cached={builtAt:new Date().toISOString(),players:seriesParticipation({series:records.data,teams,skaters,goalies})};await writeFile(file,JSON.stringify(cached));console.log(`Cached playoff participation ${season}`);}catch(e){console.warn(`Playoff history ${season}: ${e.message}`);}}
 if(cached)results[season]=cached;
}
const rows=players.map(p=>careerRecord(p,results)).filter(Boolean),doc={builtAt:new Date().toISOString(),players:Object.fromEntries(rows.map(p=>[p.id,p])),coverage:{players:rows.length,expected:ids.length,seasons:Object.keys(results)}};
if(!rows.length)throw Error('No validated careers; retaining previous publication');
if(Buffer.byteLength(JSON.stringify(doc))>950000)throw Error('Career document exceeds safe storage size');
await mkdir('public/hockey',{recursive:true});await writeFile('public/hockey/careerAchievements.json',JSON.stringify(doc));
if(store)await store.put('hockey/careerAchievements',doc,{}, {replace:true});
console.log(`Career achievements: ${rows.length}/${ids.length} players, ${rows.filter(p=>p.seriesWins!=null).length} with complete playoff-series coverage; ${JSON.stringify(doc).length} bytes`);
