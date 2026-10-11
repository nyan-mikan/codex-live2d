import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {installDesktop} from './install.mjs';
const options={platform:'darwin',nodeMajor:22};
test('Default installation builds the launcher, activates without restart, and confirms recovery registration',async()=>{
  const calls=[];
  const result=await installDesktop({...options,validate:async()=>calls.push('assets'),run:async(node,args)=>{
    calls.push([path.basename(args[0]),...args.slice(1)]);
    return {stdout:JSON.stringify({installed:true,registered:true,launcherPath:'/Applications/Codex Live2D.app'})};
  }});
  assert.deepEqual(calls,['assets',['install-launcher.mjs'],['control.mjs','start'],['install-recovery.mjs']]);
  assert.equal(result.registered,true);
});
test('Invalid assets and failed activation cannot install a recovery service for an unready model',async()=>{
  let calls=0;
  await assert.rejects(installDesktop({...options,validate:async()=>{throw new Error('Missing texture');},run:async()=>calls++}),/Missing texture/);
  assert.equal(calls,0);
  await assert.rejects(installDesktop({...options,validate:async()=>{},run:async()=>{calls++;throw new Error('Quit declined');}}),/Quit declined/);
  assert.equal(calls,1);
});
test('Unconfirmed service registration is reported as incomplete installation',async()=>{
  await assert.rejects(installDesktop({...options,validate:async()=>{},run:async()=>({stdout:JSON.stringify({installed:true,registered:false})})}),/registration was not confirmed/);
});

test('Installation can register recovery without quitting an already running unprepared app',async()=>{
  const result=await installDesktop({...options,validate:async()=>{},run:async(node,args)=>({stdout:args[0].endsWith('control.mjs')?'Next time, open Codex Live2D.app.':JSON.stringify({installed:true,registered:true,launcherPath:'/Applications/Codex Live2D.app'})})});
  assert.equal(result.pending,true);assert.equal(result.registered,true);
});
