// Read-only diagnostic: public model output only, never credentials.
import {openStore} from './store.mjs';
const store=await openStore();if(!store)throw Error('Store unavailable');
const proj=await store.read('hockey/projections');
const matches=Object.values(proj.gameImpacts||{}).filter(g=>g.teams?.DET&&g.teams?.SJS).sort((a,b)=>b.date.localeCompare(a.date));
if(!matches.length)throw Error('No DET/SJS game in recent impact window');
const impact=matches[0],game=await store.read(`hockey/games/${proj.season}/${impact.id}`);
const xg=[0,0];for(const s of game.shots)if(s[2]!=='b'&&s[4]!=null)xg[s[3]]+=s[4];
console.log(JSON.stringify({impact,game:{id:game.id,home:game.home,away:game.away,hs:game.hs,as:game.as,end:game.end,xg}},null,2));
