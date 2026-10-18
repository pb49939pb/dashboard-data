// Isolated game attribution, using only cached scored games and the nightly schedule.
import {shooterAware} from './league.mjs';
import { teamRatings, simulate, winProbability } from './sim.mjs';
export const IMPACT_VERSION = 1;
const round=(v,n=2)=>Number(v.toFixed(n));
export function undoGame(standings,g){
  const won=g.hs>g.as?g.home:g.away,ot=g.end!=='REG';
  return standings.map(s=>{
    const t=s.teamAbbrev.default;if(t!==g.home&&t!==g.away)return {...s};
    const win=t===won;
    const row={...s,points:s.points-(win?2:ot?1:0),gamesPlayed:s.gamesPlayed-1,wins:s.wins-(win?1:0),regulationWins:(s.regulationWins??0)-(win&&!ot?1:0),regulationPlusOtWins:(s.regulationPlusOtWins??0)-(win&&g.end!=='SO'?1:0)};
    if(['points','gamesPlayed','wins','regulationWins','regulationPlusOtWins'].some(k=>row[k]<0))throw Error('Cannot reverse game from standings');
    return row;
  });
}
// Exact season means: no Monte Carlo noise in the points/wins/scoring changes.
export function seasonMeans(R,standings,remaining,played){
  const out=Object.fromEntries(standings.map(s=>[s.teamAbbrev.default,{points:s.points,wins:s.wins,xg:0,xga:0,goals:0,ga:0}]));
  for(const g of played){out[g.home].goals+=g.hs-(g.end==='SO'&&g.hs>g.as?1:0);out[g.away].goals+=g.as-(g.end==='SO'&&g.as>g.hs?1:0);
    out[g.home].ga+=g.as-(g.end==='SO'&&g.as>g.hs?1:0);out[g.away].ga+=g.hs-(g.end==='SO'&&g.hs>g.as?1:0);
    for(const s of g.shots){if(s[2]==='b'||s[4]==null)continue;const t=s[3]===0?g.home:g.away,o=t===g.home?g.away:g.home;out[t].xg+=s[4];out[o].xga+=s[4];}}
  for(const g of remaining){const p=winProbability(R,g.home,g.away);if(!p)throw Error('Missing team ratings');
    for(const [t,o,home] of [[g.home,g.away,true],[g.away,g.home,false]]){const q=home?p.home:1-p.home;
      out[t].points+=2*q+p.overtime*.5;out[t].wins+=q;
      const a=R.teams[t],b=R.teams[o],venue=home?R.home:1/R.home;
      out[t].xg+=R.mu*a.off*b.def*venue;out[t].xga+=R.mu*b.off*a.def/venue;
      out[t].goals+=home?p.xgHome:p.xgAway;out[t].ga+=home?p.xgAway:p.xgHome;
    }}return out;
}
export function validateInputs({standings,played,remaining}){
  if(standings.length!==32||new Set(standings.map(s=>s.teamAbbrev.default)).size!==32)throw Error('Need all 32 standings rows');
  const ids=[...played,...remaining].map(g=>g.id);if(new Set(ids).size!==ids.length)throw Error('Duplicate/overlapping games');
  for(const s of standings){const t=s.teamAbbrev.default,gs=played.filter(g=>g.home===t||g.away===t),left=remaining.filter(g=>g.home===t||g.away===t);
    if(gs.length!==s.gamesPlayed||gs.length+left.length!==82)throw Error(`Incomplete model/schedule for ${t}`);
    const pts=gs.reduce((n,g)=>n+((g.hs>g.as?g.home:g.away)===t?2:g.end!=='REG'?1:0),0);
    if(pts!==s.points)throw Error(`Standings/model points mismatch for ${t}`);
  }
}
export function gameImpact({game,played,remaining,standings,ratings,saModel,afterR,afterOdds,at=new Date().toISOString()}){
  const beforeGames=played.filter(g=>g.id!==game.id),beforeRows=undoGame(standings,game),beforeSchedule=[...remaining,{id:game.id,date:game.date,home:game.home,away:game.away}];
  const R0=teamRatings(beforeGames,ratings,shooterAware(beforeGames,saModel)),R1=afterR||teamRatings(played,ratings,shooterAware(played,saModel));
  const before=seasonMeans(R0,beforeRows,beforeSchedule,beforeGames),after=seasonMeans(R1,standings,remaining,played);
  const odds0=simulate({R:R0,standings:beforeRows,remaining:beforeSchedule,paired:true}),odds1=afterOdds||simulate({R:R1,standings,remaining,paired:true});
  const teams={};for(const t of [game.away,game.home]){
    const a=odds0.teams.find(r=>r.team===t),b=odds1.teams.find(r=>r.team===t);
    const pick=(means,odds)=>({...Object.fromEntries(Object.entries(means[t]).map(([k,v])=>[k,round(v)])),playoffs:odds.playoffs,cup:odds.cup,division:odds.division,final:odds.final});
    const v0=pick(before,a),v1=pick(after,b);
    teams[t]={before:v0,after:v1,delta:Object.fromEntries(Object.keys(v0).map(k=>[k,round(v1[k]-v0[k])])),playoffsSe:round(Math.hypot(a.playoffsSe,b.playoffsSe)),cupSe:round(Math.hypot(a.cupSe,b.cupSe))};
  }
  return {version:IMPACT_VERSION,id:game.id,date:game.date,home:game.home,away:game.away,at,basis:'team',method:'isolated-game',sims:odds0.sims,teams};
}
