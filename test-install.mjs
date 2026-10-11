import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {installDesktop} from './install.mjs';
const options={platform:'darwin',nodeMajor:22};
test('Default installation registers recovery without a replacement Dock entry',async()=>{
  const calls=[];
  const result=await installDesktop({...options,validate:async()=>calls.push('assets'),run:async(node,args)=>{calls.push([path.basename(args[0]),...args.slice(1)]);return {stdout:JSON.stringify({installed:true,registered:true})};}});
  assert.deepEqual(calls,['assets',['install-recovery.mjs']]);assert.equal(result.registered,true);assert.equal(result.automaticRestart,true);
});
test('Missing assets prevent registration, and failed service installation is reported',async()=>{
  let calls=0;
  await assert.rejects(installDesktop({...options,validate:async()=>{throw new Error('Missing texture');},run:async()=>calls++}),/Missing texture/);assert.equal(calls,0);
  await assert.rejects(installDesktop({...options,validate:async()=>{},run:async()=>{throw new Error('Registration failed');}}),/Registration failed/);
});
test('Unconfirmed service registration cannot report successful installation',async()=>{
  await assert.rejects(installDesktop({...options,validate:async()=>{},run:async()=>({stdout:JSON.stringify({installed:true,registered:false})})}),/registration was not confirmed/);
});
