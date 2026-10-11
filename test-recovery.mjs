import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryDecision} from './recovery-policy.mjs';
import {agentPlist} from './install-recovery.mjs';
import {appPids} from './app-process.mjs';
const baseline={lastDebugVersion:'26.1002.52244'};
const updated={running:true,version:'26.1007.21159',debugReady:false,watcherAlive:true,disabled:false,now:1000};
test('Full executable paths identify the main application and exclude helpers and similarly named executables',()=>{
  const exe='/Applications/ChatGPT.app/Contents/MacOS/ChatGPT';
  const list=` 47896 ${exe}\n 22 ${exe}\n 23 ${exe} Helper\n 24 /bin/echo\n 25 ${exe}-other\n`;
  assert.deepEqual(appPids(list,exe),[47896,22]);assert.deepEqual(appPids(' 9 /bin/zsh',exe),[]);
});
test('A lost debug endpoint after update waits for stable startup then restores exactly once',()=>{
  const first=recoveryDecision(baseline,updated);assert.equal(first.action,'wait-for-update');
  const waiting=recoveryDecision(first.state,{...updated,now:45999});assert.equal(waiting.action,'wait-for-update');
  const restore=recoveryDecision(waiting.state,{...updated,now:46000});assert.equal(restore.action,'restore-update');
  assert.equal(recoveryDecision(restore.state,{...updated,now:120000}).action,'already-attempted');
});
test('Quitting the application resets the grace period and never launches it',()=>{
  const waiting=recoveryDecision(baseline,updated).state;
  const quit=recoveryDecision(waiting,{...updated,running:false,now:20000});assert.equal(quit.action,'idle');assert.equal(quit.state.missingSince,undefined);
  const opened=recoveryDecision(quit.state,{...updated,now:90000});assert.equal(opened.action,'wait-for-update');assert.equal(opened.state.missingSince,90000);
});
test('After a declined quit, a later user launch permits one fresh recovery attempt',()=>{
  const failed={...baseline,lastAttemptedVersion:updated.version,failure:{version:updated.version,reason:'waiting'}};
  assert.equal(recoveryDecision(failed,updated).action,'already-attempted');
  const quit=recoveryDecision(failed,{...updated,running:false});assert.equal(quit.action,'idle');assert.equal(quit.state.failure,undefined);
  const reopened=recoveryDecision(quit.state,{...updated,now:100000});assert.equal(reopened.action,'wait-for-update');
  assert.equal(recoveryDecision(reopened.state,{...updated,now:145000}).action,'restore-update');
});
test('Dock starts on the same version wait for stable startup and recover once per app run',()=>{
  const dock={...updated,version:baseline.lastDebugVersion,pid:1234,now:100000};
  const first=recoveryDecision(baseline,dock);assert.equal(first.action,'wait-for-startup');
  assert.equal(recoveryDecision(first.state,{...dock,now:144999}).action,'wait-for-startup');
  const restore=recoveryDecision(first.state,{...dock,now:145000});assert.equal(restore.action,'restore-startup');
  assert.equal(recoveryDecision(restore.state,{...dock,now:300000}).action,'already-attempted');
  assert.equal(recoveryDecision({},dock).action,'idle');
});
test('Dock recovery respects deliberate quits, disabled recovery and a later new launch',()=>{
  const dock={...updated,version:baseline.lastDebugVersion,pid:1234};
  const pending=recoveryDecision(baseline,dock).state;
  assert.equal(recoveryDecision(pending,{...dock,disabled:true,now:100000}).action,'idle');
  const quit=recoveryDecision(pending,{...dock,running:false,now:100000});assert.equal(quit.action,'idle');
  const opened=recoveryDecision(quit.state,{...dock,pid:5678,now:200000});assert.equal(opened.action,'wait-for-startup');
  assert.equal(recoveryDecision(opened.state,{...dock,pid:5678,now:245000}).action,'restore-startup');
});
test('A debug endpoint appearing during Dock startup cancels the scheduled restart',()=>{
  const dock={...updated,version:baseline.lastDebugVersion,pid:1234};
  const waiting=recoveryDecision(baseline,dock).state;
  const ready=recoveryDecision(waiting,{...dock,debugReady:true,now:30000});
  assert.equal(ready.action,'idle');assert.equal(ready.state.missingSince,undefined);
});
test('Recording the launcher PID prevents retry loops if the relaunch still lacks debugging',()=>{
  const dock={...updated,version:baseline.lastDebugVersion,pid:1234};
  const pending=recoveryDecision(baseline,dock).state;
  const attempted=recoveryDecision(pending,{...dock,now:46000}).state;
  // The service records the result of its own launch on both success and failure.
  attempted.lastSeenPid=5678;
  assert.equal(recoveryDecision(attempted,{...dock,pid:5678,now:100000}).action,'already-attempted');
  assert.equal(recoveryDecision(attempted,{...dock,pid:9876,now:200000}).action,'wait-for-startup');
});
test('A quick user quit and reopen between polls resets the attempt when the app process changes',()=>{
  const old={...baseline,lastSeenPid:47896,lastAttemptedVersion:updated.version,failure:{reason:'waiting'}};
  const same=recoveryDecision(old,{...updated,pid:47896});assert.equal(same.action,'already-attempted');
  const reopened=recoveryDecision(old,{...updated,pid:60000,now:100000});assert.equal(reopened.action,'wait-for-update');assert.equal(reopened.state.failure,undefined);
  assert.equal(recoveryDecision(reopened.state,{...updated,pid:60000,now:145000}).action,'restore-update');
});
test('A second version change restarts the stability timer',()=>{
  const first=recoveryDecision(baseline,updated).state;
  const next=recoveryDecision(first,{...updated,version:'26.1010.1',now:40000});assert.equal(next.action,'wait-for-update');
  assert.equal(next.state.missingSince,40000);assert.equal(recoveryDecision(next.state,{...updated,version:'26.1010.1',now:85000}).action,'restore-update');
});
test('An existing debug endpoint starts a missing watcher without restarting the application',()=>{
  const found=recoveryDecision(baseline,{...updated,debugReady:true,watcherAlive:false});assert.equal(found.action,'start-watcher');
  assert.equal(recoveryDecision(found.state,{...updated,debugReady:true,watcherAlive:true}).action,'idle');
});
test('An intentional remove disables both update restoration and watcher resurrection',()=>{
  const waiting=recoveryDecision(baseline,updated).state;
  for(const debugReady of [false,true])assert.equal(recoveryDecision(waiting,{...updated,disabled:true,debugReady,watcherAlive:false,now:100000}).action,'idle');
});
test('Successful recovery uses the new baseline and later updates can still recover',()=>{
  const first=recoveryDecision(baseline,updated).state;
  const attempted=recoveryDecision(first,{...updated,now:46000}).state;
  const recovered=recoveryDecision(attempted,{...updated,debugReady:true,now:70000});assert.equal(recovered.state.lastDebugVersion,updated.version);
  assert.equal(recoveryDecision(recovered.state,{...updated,debugReady:false,now:100000}).action,'already-attempted');
  assert.equal(recoveryDecision(recovered.state,{...updated,version:'26.1011.1',now:100000}).action,'wait-for-update');
});
test('The login agent uses the independent workspace and safely escapes paths',()=>{
  const plist=agentPlist('/Node & Tools/node','/Workspace <Companion>');
  assert(plist.includes('/Node &amp; Tools/node'));assert(plist.includes('/Workspace &lt;Companion&gt;/recovery.mjs'));
  assert(plist.includes('<key>RunAtLoad</key><true/>'));assert(plist.includes('<key>KeepAlive</key><true/>'));
  assert(!plist.includes('remote-debugging-address=0.0.0.0'));assert(!plist.includes('apiKey'));
});
