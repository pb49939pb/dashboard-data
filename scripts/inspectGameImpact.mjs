// Read-only diagnostic: public model output only, never credentials.
import {openStore} from './store.mjs';
const store=await openStore();if(!store)throw Error('Store unavailable');
const proj=await store.read('hockey/projections');
const matches=Object.values(proj.gameImpacts||{}).filter(g=>g.teams?.DET&&g.teams?.SJS).sort((a,b)=>b.date.localeCompare(a.date));
if(!matches.length)throw Error('No DET/SJS game in recent impact window');
const impact=matches[0],game=await store.read(`hockey/games/${proj.season}/${impact.id}`);
console.log(JSON.stringify({impact,game},null,2));
