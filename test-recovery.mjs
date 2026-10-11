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
test('Every unprepared launch waits for the launcher and never restarts, including updates and new processes',()=>{
  for(const version of [baseline.lastDebugVersion,observed.version]){
    let state=baseline;
    for(const [pid,now] of [[123,1000],[123,30000],[123,300000],[456,400000]]){
      const result=decide(state,{...observed,version,pid,now});
      assert.equal(result.action,'waiting-for-launcher');state=result.state;
    }
  }
  assert.equal(decide({},observed).action,'waiting-for-launcher');
});
test('Old scheduled restart and failure state cannot cause a quit after migration',()=>{
  const old={...baseline,missingSince:1,missingVersion:observed.version,lastAttemptedVersion:observed.version,failure:{reason:'waiting'}};
  const result=decide(old,{...observed,now:999999});assert.equal(result.action,'waiting-for-launcher');
  assert.equal(result.state.failure,undefined);assert.equal(result.state.missingSince,undefined);
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
