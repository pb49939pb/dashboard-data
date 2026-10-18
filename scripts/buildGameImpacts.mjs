// Nightly only: no external API calls. Read the already scored games and projection inputs.
import { readFile,writeFile,readdir } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {shooterAware} from './league.mjs';
import {teamRatings,simulate} from './sim.mjs';
import {gameImpact,validateInputs,IMPACT_VERSION} from './gameImpact.mjs';
const read=p=>readFile(p,'utf8').then(JSON.parse,()=>null);
const root=process.env.IMPACT_INPUT_DIR||'public/hockey';
const [proj,ratings,prior]=await Promise.all([read(`${root}/projections.json`),read('model/ratings.json'),read(`${process.env.PREV_DIR||'prev'}/hockey/impactMeta.json`)]);
if(!proj?.standingsRows||!ratings)throw Error('Projection inputs missing');
if(proj.simModel&&proj.simModel!=='team')throw Error('Game impacts currently require the team simulation; skip rather than mix model bases');
const map=new Map();for(const f of await readdir(`${root}/teams`)){const d=await read(`${root}/teams/${f}`);if(String(d?.season)!==String(proj.season))continue;for(const g of d.games||[])if(String(g.id).slice(4,6)==='02')map.set(g.id,g);}
const played=[...map.values()].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id),standings=proj.standingsRows,remaining=proj.schedule;
validateInputs({standings,played,remaining});
const old=String(prior?.season)===String(proj.season)&&prior?.version===IMPACT_VERSION?prior:{hashes:{},recent:{}};
const hash=g=>createHash('sha256').update(JSON.stringify(g)).digest('hex');
const hashes={...old.hashes};
// Latest nights first; progressively fill older recaps using the cached games, with a bounded nightly budget.
const pending=played.filter(g=>hashes[g.id]!==hash(g));
const limit=process.argv.includes('--all')?pending.length:32;
const saModel=await read("model/xg_sa.json");
const R=teamRatings(played,ratings,shooterAware(played,saModel)),afterOdds=simulate({R,standings,remaining,paired:true});
const docs={};for(const g of pending.slice(0,limit)){
  docs[g.id]=gameImpact({game:g,played,remaining,standings,ratings,saModel,afterR:R,afterOdds,at:proj.updatedAt});
  hashes[g.id]=hash(g);console.log(`game impact ${g.id}: ${g.away} ${docs[g.id].teams[g.away].delta.points}, ${g.home} ${docs[g.id].teams[g.home].delta.points} pts`);
}
const cutoff=new Date(`${played[0].date}T12:00:00Z`);cutoff.setUTCDate(cutoff.getUTCDate()-7);
const recent=Object.fromEntries(Object.entries({...old.recent,...docs}).filter(([,v])=>v.date>=cutoff.toISOString().slice(0,10)));
await writeFile('public/hockey/gameImpacts.json',JSON.stringify({season:proj.season,docs}));
await writeFile('public/hockey/impactMeta.json',JSON.stringify({season:proj.season,version:IMPACT_VERSION,hashes,recent}));
// Recent per-game data travels with projections; historical recaps use their own small document.
proj.gameImpacts=recent;
await writeFile('public/hockey/projections.json',JSON.stringify(proj));
console.log(`game impacts: ${Object.keys(docs).length} built; ${pending.length-Object.keys(docs).length} older games queued; zero external API calls`);
