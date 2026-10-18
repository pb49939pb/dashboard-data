// One-time bootstrap or repair; nightly builds reuse their existing quality-starts request instead.
import{openStore}from'./store.mjs';import{officialGoalieRates}from'./goalieRates.mjs';
const store=await openStore();if(!store)throw Error('Server credentials required');
for(const path of ['hockey/league','hockey/seasons/20252026/league']){
 const league=await store.read(path);if(!league)continue;
 const response=await fetch(`https://api.nhle.com/stats/rest/en/goalie/summary?isAggregate=false&isGame=true&limit=-1&cayenneExp=seasonId=${league.season}%20and%20gameTypeId=2`);
 if(!response.ok)throw Error(`NHL goalie logs: ${response.status}`);
 const rows=(await response.json()).data;if(!rows?.length)throw Error('No official goalie logs');
 const rates=officialGoalieRates(rows);let updated=0;
 for(const g of league.goalies){const r=rates[g.id];if(r&&r.officialGp>=g.gp){Object.assign(g,r);updated++;}}
 if(!updated)throw Error('Official goalie logs do not cover the saved league');
 await store.put(path,{goalies:league.goalies,goalieRatesAt:new Date().toISOString()});console.log(`${league.season}: published standard SV% and GAA for ${updated} goalies`);
}
// Publish the updated question bank and keep the embedded Today headline bank in sync.
const {readFile}=await import('node:fs/promises');
const bank=JSON.parse(await readFile('model/qotd.json','utf8'));
await store.put('hockey/qotd',bank);
const today=await store.read('hockey/today');
if(today)await store.put('hockey/today',{qotd:{start:bank.start,questions:bank.questions.map(({id,q})=>({id,q}))}});
console.log(`Published rotating question bank: ${bank.questions.length} questions`);
