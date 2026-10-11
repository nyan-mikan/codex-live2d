// Only renderer metadata is sampled. Conversation text and speech credentials are excluded.
export function modelStatus(snapshot,previous={},now=Date.now(),stallMs=15000){
  const progress={frames:snapshot?.frames??0,lastProgressAt:previous.lastProgressAt??now};
  if(snapshot?.frames!==previous.frames)progress.lastProgressAt=now;
  const result=(healthy,reason)=>({healthy,reason,progress});
  if(!snapshot)return result(false,'missing');
  if(snapshot.closed)return result(false,'closed');
  if(snapshot.error)return result(false,'render-error');
  if(!snapshot.ready)return result(false,'not-ready');
  if(snapshot.webglLost)return result(false,'webgl-lost');
  if(snapshot.connected===false)return result(false,'detached');
  for(const [key,reason] of [['hidden','hidden-by-setting'],['collapsed','collapsed'],['pageHidden','background']]){
    if(snapshot[key]){progress.lastProgressAt=now;return result(true,reason);}
  }
  if(Object.hasOwn(snapshot,'pixels')&&(!snapshot.pixels||!Number.isFinite(snapshot.pixels.opaque)||snapshot.pixels.opaque<=0))return result(false,'blank-canvas');
  if(!Number.isFinite(snapshot.frames))return result(false,'missing-frame-counter');
  if(snapshot.paused){progress.lastProgressAt=now;return result(true,'paused');}
  if(now-progress.lastProgressAt>=stallMs)return result(false,'render-stalled');
  return result(true,'rendering');
}
export async function sampleModel(session,world,{apiName='__codexCompanion',pixels=false}={}){
  return session.evaluate(`(()=>{const api=globalThis[${JSON.stringify(apiName)}];if(!api)return null;const h=api.health();return {ready:h.ready,closed:h.closed,error:!!h.error,frames:h.frames,webglLost:h.webglLost,hidden:h.hidden,collapsed:h.collapsed,paused:h.paused,pageHidden:document.hidden,connected:!!api.host?.isConnected,...(${pixels}&&!h.hidden&&!h.collapsed&&!document.hidden?{pixels:api.pixels()}: {})};})()`,world);
}
export function watcherStatus(heartbeat,pid,now=Date.now()){
  if(!heartbeat||heartbeat.pid!==pid)return {healthy:false,reason:'missing-heartbeat'};
  const timestamp=Date.parse(heartbeat.checkedAt);
  if(!Number.isFinite(timestamp)||timestamp>now+5000)return {healthy:false,reason:'stale-heartbeat'};
  if(!Array.isArray(heartbeat.targets)||!heartbeat.targets.length)return {healthy:false,reason:'no-renderer'};
  // Large models may need more than a poll interval to load; a finite deadline prevents hangs.
  if(now-timestamp<=65000&&heartbeat.targets.some(target=>target.reason==='loading'&&Number.isFinite(target.loadingUntil)&&target.loadingUntil>now&&target.loadingUntil<=timestamp+65000))return {healthy:false,reason:'loading',loading:true};
  if(now-timestamp>15000)return {healthy:false,reason:'stale-heartbeat'};
  const failed=heartbeat.targets.find(target=>target.healthy!==true);
  return failed?{healthy:false,reason:failed.reason||'model-unhealthy'}:{healthy:true,reason:'verified'};
}
export const retryDelay=attempt=>Math.min(60000,2000*2**Math.min(Math.max(attempt-1,0),5));
