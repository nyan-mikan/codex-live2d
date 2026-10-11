import test from 'node:test';
import assert from 'node:assert/strict';
import {CDP} from './cdp.mjs';
function socketClass(connect){return class extends EventTarget{
  constructor(){super();if(connect)queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
  send(){}
  close(){this.dispatchEvent(new Event('close'));}
};}
test('A debugger connection that never opens fails within its configured deadline',async t=>{
  const original=globalThis.WebSocket;globalThis.WebSocket=socketClass(false);t.after(()=>{globalThis.WebSocket=original;});
  const session=new CDP({webSocketDebuggerUrl:'ws://fixture'},{timeoutMs:20});
  const start=Date.now();
  await assert.rejects(session.open(),/connection timeout/);
  assert(Date.now()-start<1000);session.close();assert.equal(session.pending.size,0);
});
test('An open debugger that stops replying times out and releases pending requests',async t=>{
  const original=globalThis.WebSocket;globalThis.WebSocket=socketClass(true);t.after(()=>{globalThis.WebSocket=original;});
  const session=new CDP({webSocketDebuggerUrl:'ws://fixture'},{timeoutMs:20});
  await assert.rejects(session.open(),/CDP timeout: Runtime.enable/);
  session.close();assert.equal(session.pending.size,0);assert(session.closed);
});
