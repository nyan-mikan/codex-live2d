export class CDP {
  constructor(target) { this.target=target;this.sequence=0;this.pending=new Map();this.listeners=new Map();this.closed=false;this.socket=new WebSocket(target.webSocketDebuggerUrl); }
  async open() {
    await new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',reject,{once:true});});
    this.socket.addEventListener('message',event=>{const message=JSON.parse(String(event.data));if(message.method){for(const fn of this.listeners.get(message.method)??[])fn(message.params);return;}const p=this.pending.get(message.id);if(p){clearTimeout(p.timer);this.pending.delete(message.id);message.error?p.reject(new Error(message.error.message)):p.resolve(message.result);}});
    this.socket.addEventListener('close',()=>{this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP disconnected'));}this.pending.clear();});
    await this.send('Runtime.enable');await this.send('Page.enable');return this;
  }
  on(method,fn){if(!this.listeners.has(method))this.listeners.set(method,new Set());this.listeners.get(method).add(fn);return ()=>this.listeners.get(method)?.delete(fn);}
  send(method,params={}) { return new Promise((resolve,reject)=>{const id=++this.sequence;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},60000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));}); }
  async evaluate(expression,contextId) {const result=await this.send('Runtime.evaluate',{expression,contextId,awaitPromise:true,returnByValue:true,allowUnsafeEvalBlockedByCSP:false});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;}
  async world() {const {frameTree}=await this.send('Page.getFrameTree');return (await this.send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'codex-live2d-v1',grantUniveralAccess:false})).executionContextId;}
  close(){this.closed=true;this.socket.close();}
}
export async function targets(port) {
  for(const host of ['127.0.0.1','[::1]']){try{const r=await fetch(`http://${host}:${port}/json/list`,{signal:AbortSignal.timeout(1000)});if(r.ok)return await r.json();}catch{}}
  return [];
}
export function isCodexMain(t) {try{const url=new URL(t.url);return t.type==='page'&&url.protocol==='app:'&&url.pathname==='/index.html'&&!url.searchParams.has('initialRoute');}catch{return false;}}
