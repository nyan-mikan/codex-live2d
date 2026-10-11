import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryDecision as decide} from './recovery-policy.mjs';
import {agentPlist} from './install-recovery.mjs';
import {appPids} from './app-process.mjs';
const baseline={lastDebugVersion:'26.1002.52244'};
const observed={running:true,version:'26.1007.21159',debugReady:false,watcherAlive:true,disabled:false,now:1000};
test('Full executable paths exclude helpers and similarly named applications',()=>{
  const exe='/Applications/ChatGPT.app/Contents/MacOS/ChatGPT';
  assert.deepEqual(appPids(` 123 ${exe}\n 124 ${exe} Helper\n 125 ${exe}-other\n`,exe),[123]);
});
test('Every ordinary launch is restarted once after startup grace, including same-version launches',()=>{
  for(const version of [baseline.lastDebugVersion,observed.version]){
    let state=baseline;
    for(const [pid,now,action] of [[123,1000,'wait-for-startup'],[123,10999,'wait-for-startup'],[123,11000,'restart-app'],[123,300000,'already-attempted'],[456,400000,'wait-for-startup'],[456,410000,'restart-app']]){
      const result=decide(state,{...observed,version,pid,now});
      assert.equal(result.action,action);state=result.state;
    }
  }
  assert.equal(decide({},observed).action,'wait-for-startup');
});
test('A failed attempt is not repeated against the same live process',()=>{
  const old={...baseline,missingSince:1,missingVersion:observed.version,lastAttemptedVersion:observed.version,failure:{reason:'waiting'}};
  const result=decide(old,{...observed,now:999999});assert.equal(result.action,'already-attempted');
  assert.equal(result.state.failure.reason,'waiting');
});
test('User quit and disabling recovery suppress all watcher and startup actions',()=>{
  for(const debugReady of [true,false])for(const stop of [{running:false},{disabled:true}]){
    const result=decide({...baseline,modelMissingSince:1},{...observed,debugReady,watcherAlive:false,now:100000,...stop});
    assert.equal(result.action,'idle');assert.equal(result.state.modelMissingSince,undefined);
  }
});
test('Prepared launch starts a missing watcher after ten seconds without restarting the application',()=>{
  const ready={...observed,debugReady:true,watcherAlive:false};
  const first=decide(baseline,ready);assert.equal(first.action,'wait-for-model');
  assert.equal(decide(first.state,{...ready,now:10999}).action,'wait-for-model');
  const start=decide(first.state,{...ready,now:11000});assert.equal(start.action,'start-watcher');
  assert.equal(decide(start.state,{...ready,watcherAlive:true,modelHealthy:true}).action,'idle');
});
test('A healthy endpoint appearing after an unprepared launch attaches normally',()=>{
  const waiting=decide(baseline,observed).state;
  const first=decide(waiting,{...observed,debugReady:true,watcherAlive:false,now:50000});
  assert.equal(first.action,'wait-for-model');
  assert.equal(decide(first.state,{...observed,debugReady:true,watcherAlive:false,now:60000}).action,'start-watcher');
});
test('A living watcher with no healthy model is repaired with backoff, without restarting the app',()=>{
  const bad={...observed,debugReady:true,modelHealthy:false,pid:42};
  const first=decide(baseline,bad);assert.equal(first.action,'wait-for-model');
  const repair=decide(first.state,{...bad,now:11000});assert.equal(repair.action,'repair-watcher');
  assert.equal(decide(repair.state,{...bad,now:12000}).action,'wait-for-retry');
  const retry=decide(repair.state,{...bad,now:16000});assert.equal(retry.action,'repair-watcher');
  assert(retry.state.nextRepairAt>repair.state.nextRepairAt);
  const healthy=decide(retry.state,{...bad,modelHealthy:true,now:17000});assert.equal(healthy.action,'idle');assert.equal(healthy.state.repairAttempts,undefined);
});
test('Bounded model loading is not killed by the recovery monitor',()=>{
  const loading={...observed,debugReady:true,modelHealthy:false,modelLoading:true};
  const first=decide(baseline,loading);
  const later=decide(first.state,{...loading,now:40000});assert.equal(later.action,'wait-for-model');
  assert.equal(decide(later.state,{...loading,modelLoading:false,now:50000}).action,'repair-watcher');
});
test('Login service keeps recovery alive and safely escapes paths',()=>{
  const plist=agentPlist('/Node & Tools/node','/Workspace <Companion>');
  assert(plist.includes('/Node &amp; Tools/node'));assert(plist.includes('/Workspace &lt;Companion&gt;/recovery.mjs'));
  assert(plist.includes('<key>RunAtLoad</key><true/>'));assert(plist.includes('<key>KeepAlive</key><true/>'));
  assert(!plist.includes('apiKey'));
});

test('A live bounded launcher activation is not interrupted by a second watcher repair',()=>{
  const busy={...observed,debugReady:true,watcherAlive:false,modelHealthy:false,launcherBusy:true};
  const first=decide(baseline,busy);assert.equal(first.action,'wait-for-model');
  assert.equal(decide(first.state,{...busy,now:60000}).action,'wait-for-model');
  const released=decide(first.state,{...busy,launcherBusy:false,now:121000});
  assert.equal(released.action,'wait-for-model');
  assert.equal(decide(released.state,{...busy,launcherBusy:false,now:131000}).action,'start-watcher');
});
test('A declared debugging port still starting or a live launcher is never interrupted by another app restart',()=>{
  for(const fields of [{debugDeclared:true},{launcherBusy:true}]){
    let state=baseline;
    for(const now of [1000,100000,1000000]){const result=decide(state,{...observed,...fields,now});assert.equal(result.action,fields.debugDeclared?'wait-for-endpoint':'wait-for-launcher');state=result.state;}
  }
});
test('A completed restart is idle when healthy, and subsequent renderer failure only repairs its watcher',()=>{
  const waiting=decide(baseline,{...observed,pid:123}).state;
  const restart=decide(waiting,{...observed,pid:123,now:11000});assert.equal(restart.action,'restart-app');
  const healthy=decide({...restart.state,lastSeenPid:456},{...observed,pid:456,debugReady:true,modelHealthy:true,now:15000});assert.equal(healthy.action,'idle');
  const bad={...observed,pid:456,debugReady:true,modelHealthy:false,now:16000};const missing=decide(healthy.state,bad);
  assert.equal(decide(missing.state,{...bad,now:26000}).action,'repair-watcher');
});
