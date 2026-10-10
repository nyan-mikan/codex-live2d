import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
// The same text-only sanitization runs on both sides of the isolated binding.
const textContext=vm.createContext({});
vm.runInContext(await fs.readFile(new URL('./vendor/marked.umd.js',import.meta.url),'utf8'),textContext);
vm.runInContext(await fs.readFile(new URL('./speech-text.js',import.meta.url),'utf8'),textContext);
const clean=text=>textContext.CompanionSpeechText.cleanMarkdown(text);
const binding='__codexCompanionFishSend';
const modelDefault='s2.1-pro-free';
class FishError extends Error {constructor(message){super(message);this.name='FishError';}}
export class FishHost {
  constructor({configPath=fileURLToPath(new URL('./state/fish-config.json',import.meta.url)),fetchImpl=fetch}={}){
    this.configPath=configPath;this.fetch=fetchImpl;this.config={enabled:false,model:modelDefault,referenceId:'',apiKey:'',rememberKey:false};this.controllers=new Map();this.loading=this.load();
  }
  async load(){
    try{const c=JSON.parse(await fs.readFile(this.configPath,'utf8'));this.config={enabled:c.enabled===true,model:typeof c.model==='string'?c.model:modelDefault,referenceId:typeof c.referenceId==='string'?c.referenceId:'',rememberKey:c.rememberKey===true,apiKey:c.rememberKey&&typeof c.apiKey==='string'?c.apiKey:''};}catch(e){if(e.code!=='ENOENT')this.config.enabled=false;}
  }
  publicConfig(){const c=this.config;return {enabled:c.enabled,model:c.model,referenceId:c.referenceId,hasKey:!!c.apiKey,rememberKey:c.rememberKey,configured:!!(c.apiKey&&c.referenceId&&c.model)};}
  async save(input){
    await this.loading;
    const c={...this.config,enabled:input.enabled===true,rememberKey:input.rememberKey===true,referenceId:String(input.referenceId||'').trim(),model:String(input.model||'').trim()};
    if(input.apiKey)c.apiKey=String(input.apiKey).trim();
    if(input.clearKey)c.apiKey='';
    if(!/^[A-Za-z0-9._-]{1,80}$/.test(c.model))throw new FishError('请填写有效的语音模型名称。');
    if(c.referenceId&&!/^[A-Za-z0-9_-]{1,200}$/.test(c.referenceId))throw new FishError('reference_id 只能包含字母、数字、下划线和短横线。');
    if(/[\r\n\u0000]/.test(c.apiKey)||c.apiKey.length>16384)throw new FishError('API Key 格式无效。');
    if(c.enabled&&!(c.apiKey&&c.referenceId))throw new FishError('启用朗读前，请填写 API Key 和 reference_id。');
    const persisted={enabled:c.enabled,model:c.model,referenceId:c.referenceId,rememberKey:c.rememberKey,...(c.rememberKey?{apiKey:c.apiKey}:{})};
    // Never include secrets in watcher logs, verification, or responses to the renderer.
    const temp=this.configPath+'.tmp';await fs.writeFile(temp,JSON.stringify(persisted,null,2)+'\n',{mode:0o600});await fs.chmod(temp,0o600);await fs.rename(temp,this.configPath);
    this.cancelAll();this.config=c;return this.publicConfig();
  }
  cancel(owner,id){this.controllers.get(owner+':'+id)?.abort();}
  cancelAll(owner){for(const [key,c] of this.controllers)if(!owner||key.startsWith(owner+':'))c.abort();}
  async tts(text,owner,id){
    await this.loading;
    const c={...this.config};if(!c.enabled)throw new FishError('朗读已关闭。');if(!(c.apiKey&&c.referenceId&&c.model))throw new FishError('请先保存完整的 Fish Audio 配置。');
    text=clean(text);if(!/[\p{L}\p{N}]/u.test(text))throw new FishError('没有可以朗读的文字。');
    if(text.length>8000)throw new FishError('这句文字超过 8,000 字符，请缩短后再试。');
    const controller=new AbortController(),key=owner+':'+id;this.controllers.set(key,controller);
    const timeout=setTimeout(()=>controller.abort(),45000);
    try{
      const response=await this.fetch('https://api.fish.audio/v1/tts',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+c.apiKey,'Content-Type':'application/json',model:c.model},body:JSON.stringify({text,reference_id:c.referenceId,format:'mp3',latency:'balanced',normalize:true}),signal:controller.signal});
      if(!response.ok){const errors={401:'API Key 无效或已过期。',402:'Fish Audio 余额不足或当前模型不可用。',403:'此 Key 无权使用当前声音或模型。',404:'未找到声音或接口，请检查 reference_id。',422:'参数无效，请检查声音和模型名称。',429:'Fish Audio 请求过于频繁，请稍后再试。'};throw new FishError(errors[response.status]||`Fish Audio 暂时无法合成语音（HTTP ${response.status}）。`);}
      const chunks=[];let bytes=0;
      for await(const chunk of response.body){bytes+=chunk.length;if(bytes>16*1024*1024){controller.abort();throw new FishError('这句音频过大，已停止接收。');}chunks.push(chunk);}
      if(!bytes)throw new FishError('Fish Audio 返回了空音频。');
      return {audio:Buffer.concat(chunks).toString('base64'),type:'audio/mpeg'};
    }catch(e){if(e instanceof FishError)throw e;if(controller.signal.aborted)throw new FishError('语音请求已取消或超时。');throw new FishError('连接 Fish Audio 失败，请检查网络后重试。');}finally{clearTimeout(timeout);this.controllers.delete(key);}
  }
  async attach(session,world){
    const owner=session.target.id+':'+world;
    await session.send('Runtime.addBinding',{name:binding,executionContextId:world});
    const remove=session.on('Runtime.bindingCalled',event=>{
      if(event.name!==binding||event.executionContextId!==world)return;
      let request;try{if(event.payload.length>120000)return;request=JSON.parse(event.payload);}catch{return;}
      if(typeof request.id!=='string'||request.id.length>100)return;
      const reply=async result=>{if(session.closed)return;try{await session.evaluate('globalThis.__codexCompanionFishReply?.('+JSON.stringify({id:request.id,...result})+');true',world);}catch{}};
      void (async()=>{
        try{
          let result;
          if(request.op==='config')result=await this.loading.then(()=>this.publicConfig());
          else if(request.op==='save')result=await this.save(request.config??{});
          else if(request.op==='tts')result=await this.tts(request.text,owner,request.id);
          else if(request.op==='cancel'){this.cancel(owner,request.target);result={cancelled:true};}
          else throw new FishError('未知的语音操作。');
          await reply({ok:true,result});
        }catch(e){await reply({ok:false,error:e instanceof FishError?e.message:'无法处理语音配置，请重试。'});}
      })();
    });
    return ()=>{remove();this.cancelAll(owner);};
  }
}
