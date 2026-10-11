import test from 'node:test';
import assert from 'node:assert/strict';
import {modelStatus,sampleModel,watcherStatus,retryDelay} from './model-health.mjs';
const good={ready:true,frames:100,connected:true,pixels:{opaque:50}};
test('Presence alone is insufficient: errors, closed models, lost GL and blank pixels fail verification',()=>{
  assert.equal(modelStatus(good,{},1000).healthy,true);
  for(const [snapshot,reason] of [[null,'missing'],[{...good,closed:true},'closed'],[{...good,error:true},'render-error'],[{...good,ready:false},'not-ready'],[{...good,webglLost:true},'webgl-lost'],[{...good,connected:false},'detached'],[{...good,pixels:{opaque:0}},'blank-canvas'],[{...good,pixels:null},'blank-canvas'],[{...good,frames:undefined},'missing-frame-counter']]){
    assert.deepEqual([modelStatus(snapshot,{},1000).healthy,modelStatus(snapshot,{},1000).reason],[false,reason]);
  }
});
test('No rendered frames for fifteen seconds triggers a repair; ongoing rendering resets the clock',()=>{
  const first=modelStatus(good,{},1000);
  assert.equal(modelStatus(good,first.progress,15999).healthy,true);
  assert.equal(modelStatus(good,first.progress,16000).reason,'render-stalled');
  assert.equal(modelStatus({...good,frames:101},first.progress,16000).healthy,true);
});
test('Chat-only hiding, collapse, background windows and paused animation are intentional',()=>{
  for(const key of ['hidden','collapsed','pageHidden','paused']){
    const snapshot={...good,[key]:true};
    assert.equal(modelStatus(snapshot,{frames:100,lastProgressAt:1000},100000).healthy,true,key);
  }
  for(const key of ['hidden','collapsed','pageHidden'])assert.equal(modelStatus({...good,[key]:true,pixels:{opaque:0}}, {},1000).healthy,true,key);
});
test('Only a fresh heartbeat from the current watcher with all models verified counts as loaded',()=>{
  const heartbeat={pid:123,checkedAt:new Date(100000).toISOString(),targets:[{healthy:true,reason:'hidden-by-setting'},{healthy:true,reason:'rendering'}]};
  assert.equal(watcherStatus(heartbeat,123,110000).healthy,true);
  for(const bad of [null,{...heartbeat,pid:456},{...heartbeat,checkedAt:'invalid'},{...heartbeat,checkedAt:new Date(80000).toISOString()},{...heartbeat,targets:[]},{...heartbeat,targets:[{healthy:false,reason:'render-error'}]}])assert.equal(watcherStatus(bad,123,110000).healthy,false);
});
test('Transient failure retries back off to a bounded one-minute interval',()=>{
  assert.deepEqual([1,2,3,4,5,6,20].map(retryDelay),[2000,4000,8000,16000,32000,60000,60000]);
});
test('Health sampling sends only explicit renderer metadata, without answer text or credentials',async()=>{
  const fake={health:()=>({...good,voice:{apiKey:'never persist'},answer:{text:'private'}}),host:{isConnected:true},pixels:()=>({opaque:50})};
  const session={evaluate:async expression=>{
    const run=new Function('globalThis','document','return '+expression);
    return run({__codexCompanion:fake},{hidden:false});
  }};
  const snapshot=await sampleModel(session,1,{pixels:true});
  assert(snapshot.ready);assert.equal(snapshot.pixels.opaque,50);
  assert(!JSON.stringify(snapshot).includes('private'));assert(!JSON.stringify(snapshot).includes('apiKey'));
});

test('Slow model loads have a finite grace deadline, then become unhealthy if they hang',()=>{
  const heartbeat={pid:123,checkedAt:new Date(100000).toISOString(),targets:[{healthy:false,reason:'loading',loadingUntil:160000}]};
  assert.equal(watcherStatus(heartbeat,123,140000).loading,true);
  assert.equal(watcherStatus(heartbeat,123,160001).healthy,false);
  assert.equal(watcherStatus(heartbeat,123,160001).loading,undefined);
});
