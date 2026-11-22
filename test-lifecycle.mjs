import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {guardedPayload} from './inject.mjs';

const source=await fs.readFile(new URL('./renderer.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const load=()=>{const context=vm.createContext({Event});vm.runInContext(source,context);return context;};
test('Concurrent renderer mounts share one activation while asynchronous setup is pending',async()=>{
  const context=load(),gate=deferred();let calls=0;
  context.__codexCompanion={closed:false,health(){calls++;return gate.promise;}};
  const first=context.mountCompanion({}),second=context.mountCompanion({});
  assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
  // Loading another payload must preserve the in-flight guard.
  vm.runInContext(source,context);assert.equal(context.mountCompanion({}),first);
  gate.resolve({ready:true});assert.equal((await first).ready,true);
});
test('Failed activation releases the guard so a later mount can recover',async()=>{
  const context=load();let calls=0;
  context.__codexCompanion={closed:false,health(){calls++;if(calls===1)throw new Error('failed setup');return {ready:true};}};
  await assert.rejects(context.mountCompanion({}),/failed setup/);
  assert.equal((await context.mountCompanion({})).ready,true);assert.equal(calls,2);
});
test('Overlapping injection payloads reuse activation without reloading the WebGL libraries',async()=>{
  const context=load(),gate=deferred();
  context.__codexCompanion={closed:false,health:()=>gate.promise};
  const payload=guardedPayload(['var testRuntimeLoads=(globalThis.testRuntimeLoads||0)+1;',source],{});
  const first=vm.runInContext(payload,context),second=vm.runInContext(payload,context);
  assert.equal(first,second);assert.equal(context.testRuntimeLoads,1);
  gate.resolve({ready:true});assert.equal((await first).ready,true);
});
function documentFixture(){
  const document={hosts:[],querySelectorAll:()=>document.hosts.filter(h=>h.isConnected)};
  document.body={append(host){host.isConnected=true;if(!document.hosts.includes(host))document.hosts.push(host);}};
  const host=()=>{
    const events=new EventTarget();
    return {ownerDocument:document,isConnected:false,dispatchEvent:event=>events.dispatchEvent(event),addEventListener:(...args)=>events.addEventListener(...args),remove(){this.isConnected=false;}};
  };
  return {document,host};
}
test('Replacing a model invokes its teardown before removing its host',()=>{
  const lifecycle=load().Live2DLifecycle,{document,host}=documentFixture(),old=host();let stopped=false;
  document.body.append(old);old.addEventListener('codex-live2d-dispose',()=>{stopped=true;assert.equal(old.isConnected,true);});
  lifecycle.replace(document);assert.equal(stopped,true);assert.equal(old.isConnected,false);
});
test('A replaced instance retires instead of resurrecting itself; an ordinary detach can recover',()=>{
  const lifecycle=load().Live2DLifecycle,{document,host}=documentFixture(),old=host(),current=host();let retired=0;
  document.body.append(old);document.body.append(current);
  assert.equal(lifecycle.retain(old,()=>{retired++;old.remove();}),false);assert.equal(retired,1);
  assert.equal(lifecycle.retain(current,()=>assert.fail('Newest model was retired')),true);
  old.remove();assert.equal(lifecycle.retain(old,()=>{retired++;}),false);assert.equal(old.isConnected,false);
  current.remove();assert.equal(lifecycle.retain(current,()=>assert.fail('Sole model was retired')),true);assert.equal(current.isConnected,true);
});
