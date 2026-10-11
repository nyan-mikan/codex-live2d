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

test('Controller leaves an unprepared running app untouched for normal and recovery launches',async()=>{
  const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'companion-controller-'));
  try{
    await fs.copyFile(new URL('./control.mjs',import.meta.url),path.join(fixture,'control.mjs'));
    const stubs={
      'cdp.mjs':'export const targets=async()=>[];export const isCodexMain=()=>false;',
      'app-process.mjs':'export const appRunning=async()=>true;export const watcherPids=()=>[];',
      'endpoint.mjs':'export const findEndpoint=async()=>null;',
      'app-config.mjs':`export const appPath='/Applications/ChatGPT.app';export const appInfo=async()=>({executable:appPath+'/Contents/MacOS/ChatGPT',bundleId:'com.openai.codex'});`,
      'setup.mjs':'export const checkAssets=async()=>{};'
    };
    for(const [name,source] of Object.entries(stubs))await fs.writeFile(path.join(fixture,name),source);
    for(const flags of [[],['--from-recovery','--restart']]){
      const result=await execute(process.execPath,[path.join(fixture,'control.mjs'),'start',...flags]);
      assert(result.stdout.includes('It was left running.'));
      const state=JSON.parse(await fs.readFile(path.join(fixture,'state','launcher-status.json'),'utf8'));
      assert.equal(state.phase,'waiting-for-user-launch');
      await assert.rejects(fs.access(path.join(fixture,'state','watcher.json')));
    }
  }finally{await fs.rm(fixture,{recursive:true,force:true});}
});
