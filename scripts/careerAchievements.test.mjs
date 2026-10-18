import test from 'node:test';import assert from 'node:assert/strict';
import {seriesParticipation,careerRecord} from './careerAchievements.mjs';
import {slimLanding} from './careerLanding.mjs';
test('series credit requires appearance for winner, deduplicates games, excludes qualifier and incomplete series',()=>{
 const series=[1,2,3,4].map(n=>({gameId:n,seasonId:20242025,playoffRound:1,playoffSeriesLetter:'A',gamesNeededToWin:4,lengthOfSeries:7}));series.push({gameId:5,seasonId:20242025,playoffRound:0,playoffSeriesLetter:'Q',gamesNeededToWin:3,lengthOfSeries:5});
 const teams=[1,2,3,4,5].flatMap(gameId=>[{gameId,teamId:1,opponentTeamAbbrev:'BOS',wins:1},{gameId,teamId:2,opponentTeamAbbrev:'DET',wins:0}]);
 const skaters=[{playerId:10,gameId:1,teamAbbrev:'DET',gamesPlayed:1},{playerId:10,gameId:2,teamAbbrev:'DET',gamesPlayed:1},{playerId:11,gameId:1,teamAbbrev:'BOS',gamesPlayed:1},{playerId:12,gameId:5,teamAbbrev:'DET',gamesPlayed:1}];
 const goalies=[{playerId:20,gameId:1,teamAbbrev:'DET',gamesPlayed:1},{playerId:21,gameId:1,teamAbbrev:'DET',gamesPlayed:0}];
 const out=seriesParticipation({series,teams,skaters,goalies});assert.equal(out[10].length,1);assert.equal(out[20].length,1);assert.equal(out[11],undefined);assert.equal(out[12],undefined);assert.equal(out[21],undefined);
 assert.deepEqual(seriesParticipation({series,teams:teams.filter(r=>r.gameId!==4),skaters,goalies}),{});
});
test('unknown historical coverage stays null, Cups separate from individual awards',()=>{
 const p={schema:2,id:10,awards:[{name:'Stanley Cup',seasons:[20242025]},{name:'Hart Memorial Trophy',seasons:[20242025]}],playoffSeasons:[20242025]};
 assert.equal(careerRecord(p,{}).seriesWins,null);const r=careerRecord(p,{20242025:{players:{10:[{season:20242025,round:4,team:'FLA'}]}}});assert.equal(r.seriesWins,1);assert.equal(r.cups.length,1);assert.equal(r.awards.length,1);assert.equal(careerRecord({...p,playoffSeasons:[]},{}).seriesWins,0);
});
test('landing extraction retains every honor and full playoff history, but keeps milestone fields',()=>{
 const d={playerId:1,firstName:{default:'Test'},lastName:{default:'Player'},careerTotals:{regularSeason:{gamesPlayed:30}},awards:[{trophy:{default:'Hart'},seasons:[{seasonId:20242025},{seasonId:20242025}]}],seasonTotals:[{leagueAbbrev:'NHL',gameTypeId:3,season:20052006,gamesPlayed:2},{leagueAbbrev:'AHL',gameTypeId:3,season:20242025,gamesPlayed:2}]};
 const p=slimLanding(d);assert.deepEqual(p.awards[0].seasons,[20242025]);assert.deepEqual(p.playoffSeasons,[20052006]);assert.equal(p.career.gamesPlayed,30);
});
