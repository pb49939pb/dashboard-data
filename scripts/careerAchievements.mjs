// A series win requires an actual game appearance for the winning team; not mere roster membership.
export function seriesParticipation({series,teams,skaters,goalies}){
 const games=new Map(series.filter(s=>s.playoffRound>0&&s.playoffRound<=4&&s.gamesNeededToWin>0&&s.lengthOfSeries>1).map(s=>[s.gameId,s]));
 const teamGames=new Map();for(const row of teams)(teamGames.get(row.gameId)||teamGames.set(row.gameId,[]).get(row.gameId)).push(row);
 const groups=new Map();
 for(const row of teams){const s=games.get(row.gameId);if(!s)continue;const key=`${s.seasonId}:${s.playoffRound}:${s.playoffSeriesLetter}`;let g=groups.get(key);if(!g){g={key,season:s.seasonId,round:s.playoffRound,needed:s.gamesNeededToWin,games:new Set(),wins:{}};groups.set(key,g);}g.games.add(row.gameId);const peers=teamGames.get(row.gameId);if(peers.length!==2)throw Error("Incomplete team game logs");const team=row.teamAbbrev||peers.find(p=>p.teamId!==row.teamId)?.opponentTeamAbbrev;if(!team)throw Error("Missing team identity");g.wins[team]=(g.wins[team]||0)+(row.wins||0);}
 const winners=new Map(),by={};
 for(const g of groups.values()){const winning=Object.entries(g.wins).filter(([,wins])=>wins>=g.needed);if(winning.length>1)throw Error('Conflicting series winners');if(winning.length===1)for(const id of g.games)winners.set(id,{key:g.key,team:winning[0][0],season:g.season,round:g.round});}
 for(const r of [...skaters,...goalies]){const w=winners.get(r.gameId);if(!w||r.teamAbbrev!==w.team||!(r.gamesPlayed>0))continue;(by[r.playerId]??=new Map()).set(w.key,{season:w.season,round:w.round,team:w.team});}
 return Object.fromEntries(Object.entries(by).map(([id,wins])=>[id,[...wins.values()]]));
}
export function careerRecord(player,seasonResults){
 if(player.schema!==2)return null;
 const covered=player.playoffSeasons.every(s=>seasonResults[s]);
 const series=covered?player.playoffSeasons.flatMap(s=>seasonResults[s].players[player.id]||[]):null;
 const cups=player.awards.find(a=>a.name==='Stanley Cup')?.seasons||[];
 return {id:player.id,name:player.name,pos:player.pos,awards:player.awards.filter(a=>a.name!=='Stanley Cup'),cups,seriesWins:series?.length??null,series,career:totals(player.career),playoffs:totals(player.playoffs),fetchedAt:player.fetchedAt};
}

function totals(row){if(!row)return null;return Object.fromEntries(["gamesPlayed","goals","assists","points","wins","shutouts"].filter(k=>Number.isFinite(row[k])).map(k=>[k,row[k]]));}
