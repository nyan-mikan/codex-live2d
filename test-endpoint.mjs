import test from 'node:test';
import assert from 'node:assert/strict';
import {processDebugPorts,findEndpoint,isLocalCodexTarget} from './endpoint.mjs';
import {watcherPids} from './app-process.mjs';
const target=(port,overrides={})=>({id:'page-'+port,type:'page',url:'app://-/index.html',webSocketDebuggerUrl:`ws://127.0.0.1:${port}/devtools/page/page-${port}`,...overrides});
test('Only the exact main process IDs contribute ports; helpers and stale unrelated processes are excluded',()=>{
  const result=processDebugPorts(' 10 /Applications/ChatGPT --remote-debugging-port=9229\n 11 Helper --remote-debugging-port=9999\n 12 Other --remote-debugging-port=19335',[10]);
  assert.deepEqual(result,[{pid:10,port:9229}]);
});
test('Last command line port wins, including invalid overrides',()=>{
  assert.deepEqual(processDebugPorts(' 10 app --remote-debugging-port=9229 --remote-debugging-port 19335',[10]),[{pid:10,port:19335}]);
  for(const value of ['0','80','65536','abc','9229x'])assert.deepEqual(processDebugPorts('10 app --remote-debugging-port=9229 --remote-debugging-port='+value,[10]),[]);
});
test('A Codex++ port is reused without launching or altering the official app',async()=>{
  const probed=[];
  const endpoint=await findEndpoint({executable:'/official/app',read:async()=>[{pid:10,port:9229}],list:async port=>{probed.push(port);return [target(port)];}});
  assert.equal(endpoint.port,9229);assert.equal(endpoint.pid,10);assert.deepEqual(probed,[9229]);
});
test('Unrelated listening ports and nonlocal websocket targets are never selected',async()=>{
  const probed=[];
  assert.equal(await findEndpoint({executable:'/official/app',read:async()=>[],list:async port=>{probed.push(port);return [target(port)];}}),null);
  assert.deepEqual(probed,[]);
  for(const url of ['ws://evil.example:9229/page','ws://127.0.0.1:9999/page','wss://127.0.0.1:9229/page'])assert.equal(isLocalCodexTarget(target(9229,{webSocketDebuggerUrl:url}),9229),false);
  assert.equal(isLocalCodexTarget(target(9229,{url:'https://chatgpt.com'}),9229),false);
  assert.equal(isLocalCodexTarget(target(9229,{url:'app://-/index.html?initialRoute=/settings'}),9229),false);
  assert.equal(isLocalCodexTarget(target(9229,{webSocketDebuggerUrl:'ws://[::1]:9229/page'}),9229),true);
});
test('Unavailable targets do not mask another live Codex main process and duplicates are probed once',async()=>{
  const probed=[];
  const endpoint=await findEndpoint({executable:'/official/app',read:async()=>[{pid:10,port:19335},{pid:11,port:19335},{pid:12,port:9229}],list:async port=>{probed.push(port);return port===9229?[target(port)]:[];}});
  assert.equal(endpoint.port,9229);assert.deepEqual(probed,[19335,9229]);
});
test('Watcher replacement matches this project on every port and never another checkout or extra commands',()=>{
  const node='/node/bin/node',entry='/My Project/inject.mjs';
  const list=` 1 ${node} ${entry} --watch --port 9229\n 2 ${node} ${entry} --watch --port 19335\n 3 ${node} /Other Project/inject.mjs --watch --port 9229\n 4 ${node} ${entry} --watch --port 9229 --other\n 5 /bin/echo ${node} ${entry} --watch --port 9229`;
  assert.deepEqual(watcherPids(list,node,entry),[1,2]);
});

test('A malformed or failing endpoint response does not prevent discovery on another owned port',async()=>{
  for(const invalid of [null,{},'invalid',new Error('Connection lost')]){
    const endpoint=await findEndpoint({executable:'/official/app',read:async()=>[{pid:10,port:19335},{pid:11,port:9229}],list:async port=>{if(port===9229)return [target(port)];if(invalid instanceof Error)throw invalid;return invalid;}});
    assert.equal(endpoint.port,9229);
  }
});
