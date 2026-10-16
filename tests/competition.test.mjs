import test from 'node:test';
import assert from 'node:assert/strict';
import {shiftIndex} from '../scripts/lines.mjs';
import {buildCompetition} from '../scripts/competition.mjs';
const H=[1,2,3,4,5], A=[11,12,13,14,15];
const roster=[...H,...A,6,16].map(id=>({playerId:id,teamId:id<10?100:200,positionCode:[6,16].includes(id)?'G':[4,5,14,15].includes(id)?'D':'C'}));
const pbp={homeTeam:{id:100},rosterSpots:roster};
const players=Object.fromEntries(roster.map(p=>[p.playerId,[`Player ${p.playerId}`,p.positionCode,p.teamId===100?0:1]]));
const shifts=roster.map(p=>({playerId:p.playerId,typeCode:517,period:1,startTime:'00:00',endTime:'20:00'}));
const values=[...H,...A].map(id=>({id,war82:id<10?1:3}));
const rows=[...H,...A].map(id=>({id,pos:players[id][1]==='D'?'D':'F'}));
test('shift overlaps deduplicate shifts and require both goalies',()=>{
 const a=shiftIndex(shifts,pbp),b=shiftIndex([...shifts,shifts[0]],pbp);
 assert.deepEqual(a.competition,b.competition);assert.equal(a.competition[0][2],1200);
 assert.deepEqual(shiftIndex(shifts.filter(s=>s.playerId!==16),pbp).competition,[]);
 assert.deepEqual(shiftIndex(shifts.filter(s=>s.playerId!==15),pbp).competition,[]);
});
test('weighted opponent strength, minutes, top assignments, coverage and duplicate games',()=>{
 const g={id:1,players,competition:[[H,A,1200]]};
 const r=buildCompetition([g,g,{id:2,players,competition:null}],values,rows)[0].competition;
 assert.equal(r.opponentWar82,3);assert.equal(r.minutes,20);assert.equal(r.topMinutes,20);assert.equal(r.topPercent,100);
 assert.equal(r.games,1);assert.equal(r.totalGames,2);assert.equal(r.knownValuePercent,100);assert.equal(r.percentile,null);assert.equal(r.mostFaced[0].minutes,20);
});
test('percentiles compare positions and use midranks for ties',()=>{
 const result=buildCompetition([{id:1,players,competition:[[H,A,3600]]}],values,rows);
 assert.equal(result.find(p=>p.id===1).competition.percentile,80);
 assert.equal(result.find(p=>p.id===11).competition.percentile,20);
 assert.equal(result.find(p=>p.id===4).competition.peerCount,4);
});
test('unknown values use replacement level and suppress low-coverage ranks',()=>{
 const r=buildCompetition([{id:1,players,competition:[[H,A,3600]]}],values.filter(p=>p.id!==11&&p.id!==12),rows)[0].competition;
 assert.equal(r.opponentWar82,1.8);assert.equal(r.knownValuePercent,60);assert.equal(r.percentile,null);
 assert.equal(buildCompetition([{id:2,players}],values,rows)[0].competition,null);
});

test('different opponent stints are weighted by seconds, not number of games',()=>{
 const weak=values.map(v=>({...v,war82:v.id===15?9:v.war82}));
 weak.push({id:21,war82:1});
 const changed=[11,12,13,14,21];
 const r=buildCompetition([{id:1,players:{...players,21:['Player 21','D',1]},competition:[[H,A,60],[H,changed,180]]}],weak,rows).find(p=>p.id===2).competition;
 assert.equal(r.opponentWar82,3);assert.equal(r.minutes,4);
});
