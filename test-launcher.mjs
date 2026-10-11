import test from 'node:test';
import assert from 'node:assert/strict';
import {launchCompanion} from './launch.mjs';
import {launcherHeader,launcherPlist} from './install-launcher.mjs';
import {appPath} from './app-config.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
test('Existing app is focused and activation never asks for restart or another instance',async()=>{
  const calls=[];
  await launchCompanion({info:async()=>({executable:'/Applications/Codex.app/Contents/MacOS/Codex'}),running:async()=>true,run:async(command,args)=>{calls.push({command,args});return {stdout:''};}});
  assert.deepEqual(calls[0],{command:'/usr/bin/open',args:['-a',appPath]});
  assert.equal(calls.length,2);assert(calls[1].args.includes('--focus'));
  assert(!calls.some(c=>c.args.includes('--restart')||c.args.includes('-na')));
});
test('First launch starts through the controller without an extra plain app launch',async()=>{
  const calls=[];
  await launchCompanion({info:async()=>({executable:'/Applications/Codex.app/Contents/MacOS/Codex'}),running:async()=>false,run:async(command,args)=>{calls.push({command,args});return {stdout:''};}});
  assert.equal(calls.length,1);assert(calls[0].args.includes('--focus'));assert(!calls[0].args.includes('--restart'));
});
test('Compiled launcher handles spaces, quotes, unicode and shell substitutions as literal paths',()=>{
  const node='/Node "Tools"/node',entry='/项目/$(touch foo)/launch.mjs';
  const header=launcherHeader(node,entry,'/Applications/Codex.app');
  assert(header.includes(JSON.stringify(node)));assert(header.includes(JSON.stringify(entry)));
  for(const invalid of ['relative/node','/path\ncommand','/path\0'])assert.throws(()=>launcherHeader(invalid,entry,'/Applications/Codex.app'));
});
test('Launcher has its own identifier, no duplicate Dock icon and no default URL associations',()=>{
  const plist=launcherPlist();assert(plist.includes('com.codex-live2d.launcher'));
  assert(plist.includes('<key>LSUIElement</key><true/>'));assert(!plist.includes('CFBundleURLTypes'));
});

test('Controller waits without restart authorization and cancels a stale recovery process',async()=>{
  const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'companion-controller-'));
  try{
    await fs.copyFile(new URL('./control.mjs',import.meta.url),path.join(fixture,'control.mjs'));
    const stubs={
      'cdp.mjs':'export const targets=async()=>[];export const isCodexMain=()=>false;',
      'app-process.mjs':'export const appRunning=async()=>true;export const appProcessIds=async()=>[123];export const watcherPids=()=>[];',
      'endpoint.mjs':'export const findEndpoint=async()=>null;',
      'app-config.mjs':`export const appPath='/Applications/ChatGPT.app';export const appInfo=async()=>({executable:appPath+'/Contents/MacOS/ChatGPT',bundleId:'com.openai.codex'});`,
      'setup.mjs':'export const checkAssets=async()=>{};'
    };
    for(const [name,source] of Object.entries(stubs))await fs.writeFile(path.join(fixture,name),source);
    for(const flags of [[],['--from-recovery']]){
      const result=await execute(process.execPath,[path.join(fixture,'control.mjs'),'start',...flags]);
      assert(result.stdout.includes('automatic recovery'));
      const state=JSON.parse(await fs.readFile(path.join(fixture,'state','launcher-status.json'),'utf8'));
      assert.equal(state.phase,'waiting-for-user-launch');
      await assert.rejects(fs.access(path.join(fixture,'state','watcher.json')));
    }
    await execute(process.execPath,[path.join(fixture,'control.mjs'),'start','--from-recovery','--restart','--expected-pid','999']);
    const cancelled=JSON.parse(await fs.readFile(path.join(fixture,'state','launcher-status.json'),'utf8'));
    assert.equal(cancelled.phase,'cancelled-user-quit');
  }finally{await fs.rm(fixture,{recursive:true,force:true});}
});

test('Authorized background recovery normally quits once, opens with local flags and verifies the model',async()=>{
  const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'companion-restart-'));
  try{
    const controller=(await fs.readFile(new URL('./control.mjs',import.meta.url),'utf8')).replace("from 'node:child_process'","from './fake-process.mjs'");
    await fs.writeFile(path.join(fixture,'control.mjs'),controller);
    const stubs={
      'cdp.mjs':'export const targets=async()=>[];export const isCodexMain=()=>false;',
      'app-process.mjs':`import fs from 'node:fs/promises';const flag=new URL('./opened',import.meta.url);export const appRunning=async()=>!(await fs.access(new URL('./quit',import.meta.url)).then(()=>true,()=>false))||(await fs.access(flag).then(()=>true,()=>false));export const appProcessIds=async()=>[123];export const watcherPids=()=>[];`,
      'endpoint.mjs':`import fs from 'node:fs/promises';export const findEndpoint=async()=>await fs.access(new URL('./opened',import.meta.url)).then(()=>({port:19335,pages:[{id:'main'}]}),()=>null);`,
      'app-config.mjs':`export const appPath='/Applications/ChatGPT.app';export const appInfo=async()=>({version:'test',executable:appPath+'/Contents/MacOS/ChatGPT',bundleId:'com.openai.codex'});`,
      'setup.mjs':'export const checkAssets=async()=>{};',
      'fake-process.mjs':`import fs from 'node:fs/promises';import {promisify} from 'node:util';export function execFile(){};execFile[promisify.custom]=async(command,args)=>{await fs.appendFile(new URL('./calls.jsonl',import.meta.url),JSON.stringify({command,args})+'\\n');if(command==='/usr/bin/osascript')await fs.writeFile(new URL('./quit',import.meta.url),'true');if(command==='/usr/bin/open')await fs.writeFile(new URL('./opened',import.meta.url),'true');return {stdout:'',stderr:''};};export const spawn=()=>({pid:888,unref(){}});`
    };
    for(const [name,source] of Object.entries(stubs))await fs.writeFile(path.join(fixture,name),source);
    await execute(process.execPath,[path.join(fixture,'control.mjs'),'start','--from-recovery','--restart','--expected-pid','123']);
    const calls=(await fs.readFile(path.join(fixture,'calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(calls.filter(c=>c.command==='/usr/bin/osascript').length,1);
    const opens=calls.filter(c=>c.command==='/usr/bin/open');assert.equal(opens.length,1);
    assert(opens[0].args.includes('--remote-debugging-port=19335'));assert(opens[0].args.includes('--remote-debugging-address=127.0.0.1'));
    assert(calls.some(c=>c.args.includes('--verify')));
    const status=JSON.parse(await fs.readFile(path.join(fixture,'state/launcher-status.json'),'utf8'));assert.equal(status.phase,'ready');
  }finally{await fs.rm(fixture,{recursive:true,force:true});}
});
