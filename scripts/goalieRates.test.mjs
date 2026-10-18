import test from 'node:test';import assert from 'node:assert/strict';import{officialGoalieRates}from'./goalieRates.mjs';
test('SV% and GAA combine actual shots and seconds, including relief appearances',()=>{
 const rows=[{playerId:1,gameId:1,gamesPlayed:1,gamesStarted:1,shotsAgainst:30,goalsAgainst:3,timeOnIce:3600},{playerId:1,gameId:2,gamesPlayed:1,gamesStarted:0,shotsAgainst:10,goalsAgainst:1,timeOnIce:1200}];
 const r=officialGoalieRates([...rows,rows[1]])[1];assert.equal(r.officialSvPct,.9);assert.equal(r.gaa,3);assert.equal(r.officialGp,2);assert.equal(r.officialShots,40);assert.equal(r.officialToi,4800);
});
test('missing minutes do not become fake GAA and zero-shot appearances are handled',()=>{
 const r=officialGoalieRates([{playerId:1,gameId:1,gamesPlayed:1,shotsAgainst:10,goalsAgainst:1}])[1];assert.equal(r.gaa,null);assert.equal(r.officialSvPct,.9);
 const z=officialGoalieRates([{playerId:2,gameId:1,gamesPlayed:1,shotsAgainst:0,goalsAgainst:0,timeOnIce:60}])[2];assert.equal(z.officialSvPct,null);assert.equal(z.gaa,0);
});
