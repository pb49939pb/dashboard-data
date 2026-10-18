// Standard NHL save percentage and GAA, separate from the model's unblocked-shot save rate.
export function officialGoalieRates(rows){
 const by={},seen=new Set();
 for(const r of rows){const key=`${r.playerId}:${r.gameId}`;if(!r.playerId||seen.has(key))continue;seen.add(key);
  const x=by[r.playerId]??={shots:0,ga:0,seconds:0,gp:0,validShots:true,validTime:true};
  x.gp+=Number(r.gamesPlayed)||0;
  if(!Number.isFinite(r.shotsAgainst)||!Number.isFinite(r.goalsAgainst)||r.shotsAgainst<r.goalsAgainst||r.goalsAgainst<0)x.validShots=false;
  else {x.shots+=r.shotsAgainst;x.ga+=r.goalsAgainst;}
  if(!Number.isFinite(r.timeOnIce)||r.timeOnIce<0)x.validTime=false;else x.seconds+=r.timeOnIce;
 }
 return Object.fromEntries(Object.entries(by).map(([id,x])=>[id,{officialGp:x.gp,officialShots:x.validShots?x.shots:null,officialGa:x.validShots?x.ga:null,officialToi:x.validTime?x.seconds:null,
  officialSvPct:x.validShots&&x.shots>0?Math.round((1-x.ga/x.shots)*1000)/1000:null,
  gaa:x.validShots&&x.validTime&&x.seconds>0?Math.round(x.ga*3600/x.seconds*100)/100:null}]));
}
