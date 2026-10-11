import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {installDesktop} from './install.mjs';
const options={platform:'darwin',nodeMajor:22};
test('Default installation validates assets, activates the model, then confirms recovery registration',async()=>{
  const calls=[];
  const result=await installDesktop({...options,validate:async()=>calls.push('assets'),run:async(node,args)=>{
    calls.push([path.basename(args[0]),...args.slice(1)]);
    return {stdout:JSON.stringify({installed:true,registered:true})};
  }});
  assert.deepEqual(calls,['assets',['control.mjs','start','--restart'],['install-recovery.mjs']]);
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
