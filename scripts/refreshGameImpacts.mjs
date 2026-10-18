// Manual recovery/backfill: refresh just impacts from the saved nightly inputs, without NHL/data-source fetches.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {openStore} from './store.mjs';
const store=await openStore();if(!store)throw Error('Server storage credentials are required');
const [league,proj,meta]=await Promise.all(['hockey/league','hockey/projections','hockey/impactMeta'].map(p=>store.read(p)));
if(!league||!proj||String(league.season)!==String(proj.season))throw Error('Saved league and projections do not match');
const games=await store.readAll(`hockey/games/${league.season}`),byTeam={};
for(const g of games)for(const t of [g.home,g.away])(byTeam[t]??=[]).push(g);
await mkdir('public/hockey/teams',{recursive:true});await mkdir('prev/hockey',{recursive:true});
for(const [team,list] of Object.entries(byTeam))await writeFile(`public/hockey/teams/${team}.json`,JSON.stringify({season:league.season,games:list}));
// Stored projections merge schedule rows across builds; remove past/stale rows using the actual scored IDs.
const playedIds=new Set(games.map(g=>g.id));proj.schedule=proj.schedule.filter(g=>!g._stale&&!playedIds.has(g.id));
await writeFile('public/hockey/projections.json',JSON.stringify(proj));
if(meta)await writeFile('prev/hockey/impactMeta.json',JSON.stringify(meta));
execFileSync(process.execPath,['scripts/buildGameImpacts.mjs'],{stdio:'inherit'});
const result=JSON.parse(await readFile('public/hockey/gameImpacts.json','utf8')),index=JSON.parse(await readFile('public/hockey/impactMeta.json','utf8'));
const n=await store.putMany(Object.values(result.docs).map(d=>({path:`hockey/impacts/${result.season}/${d.id}`,data:d})),{replace:true});
await store.put('hockey/impactMeta',index,{}, {replace:true});
await store.put('hockey/projections',{gameImpacts:index.recent});
console.log(`Published ${n} per-game impact records; preview window ${Object.keys(index.recent).length}. No NHL calls.`);
