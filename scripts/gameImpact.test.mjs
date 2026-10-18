import test from 'node:test';
import assert from 'node:assert/strict';
import {undoGame,seasonMeans,validateInputs,gameImpact} from './gameImpact.mjs';
import {teamRatings,simulate,winProbability} from './sim.mjs';
const teams=Array.from({length:32},(_,i)=>`T${String(i).padStart(2,'0')}`);
const ratings={weights:{},mu:3,home:1.04,prior:Object.fromEntries(teams.map(t=>[t,{off:1,def:1,fin:1,gk:1}]))};
const standings=teams.map((t,i)=>({teamAbbrev:{default:t},teamCommonName:{default:t},conferenceAbbrev:i<16?'E':'W',divisionAbbrev:['A','M','C','P'][Math.floor(i/8)],divisionName:['Atlantic','Metro','Central','Pacific'][Math.floor(i/8)],points:0,gamesPlayed:0,wins:0,regulationWins:0,regulationPlusOtWins:0}));
const schedule=[];for(let day=0;day<82;day++)for(let i=0;i<16;i++)schedule.push({id:2026020000+schedule.length+1,date:'2026-10-10',home:teams[i],away:teams[31-i]});
const played=schedule.slice(0,16).map((g,i)=>({...g,hs:1,as:2,end:'REG',shots:[...Array.from({length:40},()=>[50,0,'s',0,i===0?.2:.075]),...Array.from({length:20},()=>[50,0,'s',1,.1])]}));
for(const g of played){for(const t of [g.home,g.away]){const s=standings.find(s=>s.teamAbbrev.default===t);s.gamesPlayed++;if(t===g.away){s.points+=2;s.wins++;s.regulationWins++;s.regulationPlusOtWins++;}}}
const remaining=schedule.slice(16);
test('undo regulation, overtime and shootout points and tiebreakers without mutating rows',()=>{
 for(const end of ['REG','OT','SO']){const rows=structuredClone(standings),g={...played[0],end};if(end!=='REG')rows[0].points=1;if(end==='OT')rows[31].regulationWins=0;if(end==='SO'){rows[31].regulationWins=0;rows[31].regulationPlusOtWins=0;}
 const snap=JSON.stringify(rows),before=undoGame(rows,g);assert.equal(before[0].points,0);assert.equal(before[31].points,0);assert.equal(before[31].wins,0);assert.equal(before[31].regulationWins,0);assert.equal(before[31].regulationPlusOtWins,0);assert.equal(JSON.stringify(rows),snap);}
});
test('reject partial builds, duplicate games and standings mismatches',()=>{
 validateInputs({standings,played,remaining});assert.throws(()=>validateInputs({standings,played:played.slice(1),remaining}));assert.throws(()=>validateInputs({standings,played,remaining:[...remaining,played[0]]}));const rows=structuredClone(standings);rows[0].points=1;assert.throws(()=>validateInputs({standings:rows,played,remaining}));
});
test('exact expected points include overtime loser points; shot xG excludes blocks',()=>{
 const R=teamRatings([],ratings),g=remaining[0],p=winProbability(R,g.home,g.away),means=seasonMeans(R,standings,[g],[]);assert.ok(Math.abs(means[g.home].points-(standings[0].points+2*p.home+p.overtime/2))<1e-9);assert.ok(Math.abs(means[g.home].wins-p.home)<1e-9);
});
test('isolates a game, reports finite changes and permits a positive points effect in a loss',()=>{
 const input=JSON.stringify({played,standings,remaining});const result=gameImpact({game:played[0],played,remaining,standings,ratings,at:'2026-10-11T08:00:00Z'});
 assert.equal(result.method,'isolated-game');assert.equal(result.sims,10000);assert.ok(result.teams[played[0].home].delta.points>0,'strong shot performance in a loss can lift forecast');
 for(const t of [played[0].home,played[0].away])for(const k of Object.keys(result.teams[t].before)){const x=result.teams[t];assert.ok(Number.isFinite(x.delta[k]));assert.ok(Math.abs(x.delta[k]-(x.after[k]-x.before[k]))<.011);}
 assert.equal(JSON.stringify({played,standings,remaining}),input);
});
test('paired simulations are reproducible and schedule ordering does not shift random draws',()=>{
 const R=teamRatings(played,ratings);const a=simulate({R,standings,remaining:remaining.slice(0,16),paired:true});const b=simulate({R,standings,remaining:remaining.slice(0,16).reverse(),paired:true});assert.deepEqual(a.teams,b.teams);
});

test('publication replaces the rolling impact window rather than accumulating old games',async()=>{
 const {merge}=await import('./store.mjs');
 assert.deepEqual(merge({gameImpacts:{old:{id:1}},other:'keep'},{gameImpacts:{recent:{id:2}}}),{gameImpacts:{recent:{id:2}},other:'keep'});
 assert.deepEqual(merge({gameImpacts:{old:{id:1}}},{gameImpacts:{}}).gameImpacts,{});
});

test('2026–27 validation uses the expanded 84-game schedule',()=>{
 const extra=remaining.slice(0,32).map((g,i)=>({...g,id:2026022000+i}));
 validateInputs({standings,played,remaining:[...remaining,...extra],season:'20262027'});
 assert.throws(()=>validateInputs({standings,played,remaining,season:'20262027'}),/expected 84/);
});
