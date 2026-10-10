/* Lives only in the companion's isolated world. Credentials remain in the local host. */
(() => {
  function nativeTransport(){
    const pending=new Map();let serial=0;
    globalThis.__codexCompanionFishReply=reply=>{const p=pending.get(reply.id);if(!p)return;clearTimeout(p.timer);pending.delete(reply.id);reply.ok?p.resolve(reply.result):p.reject(new Error(reply.error||'语音操作失败。'));};
    function send(op,data={},signal){
      const id='fish-'+Date.now().toString(36)+'-'+(++serial);
      return new Promise((resolve,reject)=>{
        if(typeof globalThis.__codexCompanionFishSend!=='function'){reject(new Error('语音服务未连接，请运行“Start.command”脚本。'));return;}
        if(signal?.aborted){reject(new Error('已停止朗读。'));return;}
        const timer=setTimeout(()=>{pending.delete(id);reject(new Error('语音服务没有响应，请重新启动角色。'));},op==='tts'?55000:8000);
        const done=fn=>value=>{signal?.removeEventListener('abort',cancel);fn(value);};
        const cancel=()=>{const p=pending.get(id);if(!p)return;clearTimeout(timer);pending.delete(id);try{globalThis.__codexCompanionFishSend(JSON.stringify({id:id+'-cancel',op:'cancel',target:id}));}catch{}reject(new Error('已停止朗读。'));};
        pending.set(id,{resolve:done(resolve),reject:done(reject),timer});signal?.addEventListener('abort',cancel,{once:true});
        try{globalThis.__codexCompanionFishSend(JSON.stringify({id,op,...data}));}catch{clearTimeout(timer);pending.delete(id);signal?.removeEventListener('abort',cancel);reject(new Error('语音服务未连接，请重新启动角色。'));}
      });
    }
    send.dispose=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('语音服务已关闭。'));}pending.clear();globalThis.__codexCompanionFishReply=undefined;};
    return send;
  }
  function audioPlayer(){
    let context=null,source=null,analyser=null,levels=null,finish=null;
    function stop(){if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();source=null;}finish?.();finish=null;}
    return {
      async unlock(){context??=new AudioContext();if(context.state!=='running')await context.resume();return context.state==='running';},
      ready(){return context?.state==='running';},
      mouth(){if(!source||!analyser)return 0;analyser.getByteTimeDomainData(levels);let sum=0;for(const v of levels)sum+=((v-128)/128)**2;return Math.min(1,Math.sqrt(sum/levels.length)*5);},
      async prepare(result,signal){
        if(!context||context.state!=='running')throw new Error('请点“试听”或重新启用朗读，允许播放声音。');
        const bytes=Uint8Array.from(atob(result.audio),c=>c.charCodeAt(0));
        let buffer;try{buffer=await context.decodeAudioData(bytes.buffer);}catch{throw new Error('收到的音频无法播放，请检查模型配置。');}
        return signal.aborted?null:buffer;
      },
      async play(buffer,signal){
        if(signal.aborted)return;
        await new Promise((resolve,reject)=>{
          analyser??=context.createAnalyser();analyser.fftSize=256;levels??=new Uint8Array(analyser.fftSize);
          source=context.createBufferSource();source.buffer=buffer;source.connect(analyser);analyser.connect(context.destination);
          const done=()=>{signal.removeEventListener('abort',stop);if(source){source.disconnect();source=null;}finish=null;resolve();};
          source.onended=done;finish=done;signal.addEventListener('abort',stop,{once:true});
          try{source.start();}catch{done();reject(new Error('音频播放失败，请再点一次试听。'));}
        });
      },stop,
      dispose(){stop();void context?.close();}
    };
  }
  function createController({transport=nativeTransport(),player=audioPlayer(),onChange=()=>{},onConfig=()=>{}}={}){
    const tracker=new CompanionSpeechText.SentenceTracker();
    let config={enabled:false,configured:false,hasKey:false,rememberKey:false,referenceId:'',model:'s2.1-pro-free'},lastMessage=null,queue=[],slots=[],producer=null,current=null,epoch=0,disposed=false,mutedKey=null,failed=false,saving=false;
    // Keep at most three future sentences in memory, including the in-flight request.
    const prefetchLimit=3;
    const stats={submitted:0,played:0,phase:'loading',message:'正在连接 Fish Audio 设置…',speaking:false};
    const keyOf=m=>m?m.conversationId+':'+m.id:null;
    const health=()=>({...stats,enabled:config.enabled,configured:config.configured,hasKey:config.hasKey,pending:queue.length+slots.length,cached:slots.filter(j=>j.ready).length,preparing:producer?1:0,prefetchLimit,audioReady:player.ready()});
    const notify=(phase,message)=>{stats.phase=phase;stats.message=message;onChange(health());};
    function cancel(skipCurrent=false,silent=false){
      epoch++;queue=[];
      for(const job of new Set([...slots,producer,current]))if(job){job.abort.abort();job.result=null;}
      slots=[];producer=null;current=null;player.stop();stats.speaking=false;
      if(skipCurrent)mutedKey=keyOf(lastMessage);
      if(!silent)notify(saving?'saving':'idle',saving?'正在保存配置；已停止当前朗读。':config.enabled?'已停止当前朗读。':'自动朗读已关闭。');
    }
    function acceptConfig(c){
      config={...config,...c};failed=false;onConfig({...config});
      notify(config.configured?'idle':'unconfigured',config.configured?(config.enabled?(player.ready()?'已启用，等待新正文。':'已启用；点一下角色或试听，允许播放声音。'):'配置已保存，自动朗读已关闭。'):'请填写 API Key、reference_id 和语音模型。');
    }
    function refreshProgress(){
      const cached=slots.filter(j=>j.ready).length;
      if(current)notify('playing',`正在朗读${cached?` · 已缓存 ${cached} 句`:producer?' · 正在预取下一句':''}`);
      else if(slots.length||producer)notify('synthesizing','正在合成一句语音…');
      else notify('idle',config.enabled?'等待下一句正文。':'试听完成。');
    }
    function fail(error,run){
      if(run!==epoch||disposed)return;
      cancel(false,true);failed=true;notify('error',error.message||'语音合成失败。');
    }
    function drain(){
      if(disposed||failed||saving||!config.enabled||!player.ready()||!config.configured)return;
      const run=epoch;
      // One API request at a time; synthesis is independent of audio playback.
      if(!producer&&queue.length&&slots.length<prefetchLimit){
        const job={text:queue.shift(),abort:new AbortController(),ready:false,result:null};
        slots.push(job);producer=job;stats.submitted++;
        void (async()=>{
          try{
            const result=await transport('tts',{text:job.text},job.abort.signal);
            if(run!==epoch||job.abort.signal.aborted)return;
            const prepared=player.prepare?await player.prepare(result,job.abort.signal):result;
            if(run!==epoch||job.abort.signal.aborted)return;
            job.result=prepared;job.ready=true;producer=null;drain();
          }catch(error){fail(error,run);}
        })();
      }
      if(!current&&slots[0]?.ready){
        const job=slots.shift();current=job;stats.speaking=true;
        void (async()=>{
          try{
            await player.play(job.result,job.abort.signal);job.result=null;
            if(run!==epoch||job.abort.signal.aborted)return;
            current=null;stats.speaking=false;stats.played++;drain();
          }catch(error){fail(error,run);}
        })();
        // Consuming a cached sentence frees one look-ahead slot immediately.
        drain();return;
      }
      refreshProgress();
    }
    const controller={
      health,config:()=>({...config}),mouth:()=>stats.speaking?player.mouth():0,
      async init(){try{acceptConfig(await transport('config'));}catch(e){notify('error',e.message);}return health();},
      hostReady:acceptConfig,
      async unlock(){try{if(await player.unlock()){if(config.enabled)notify('idle','声音播放已允许，等待新正文。');void drain();}}catch{notify('error','无法启用音频播放，请点试听重试。');}},
      async save(input){
        cancel();saving=true;notify('saving','正在保存语音配置…');
        try{const c=await transport('save',{config:input});saving=false;acceptConfig(c);tracker.skip(lastMessage);mutedKey=null;return true;}catch(e){saving=false;notify('error',e.message);return false;}
      },
      async enable(value){
        if(disposed||saving)return false;
        if(value&&!config.configured){notify('error','请先在设置中保存 API Key、reference_id 和语音模型。');return false;}
        // Gate requests immediately, even if writing the preference later fails.
        config={...config,enabled:false};onConfig({...config});
        if(value)void controller.unlock();
        return controller.save({...config,enabled:!!value});
      },
      feed(message){
        if(disposed)return;
        if(message.phase==='reset'){cancel();tracker.reset();lastMessage=null;mutedKey=null;return;}
        if(message.phase!=='final')return;
        const baseline=!lastMessage||lastMessage.conversationId!==message.conversationId;
        const changed=keyOf(lastMessage)!==keyOf(message);if(changed){cancel(false,true);mutedKey=null;}
        lastMessage=message;
        if(baseline&&message.completed){tracker.skip(message);return;}
        if(message.suppressVoice||saving||!config.enabled||!config.configured||mutedKey===keyOf(message)||failed){tracker.skip(message);return;}
        const fresh=tracker.feed(message);
        queue.push(...fresh);if(fresh.length){if(!player.ready())notify('locked','点一下角色或试听，允许播放声音。');void drain();}
      },
      async test(){
        if(!config.enabled||saving){notify('idle','朗读已关闭，请先启用朗读。');return;}
        cancel(true);failed=false;await controller.unlock();
        if(!config.configured){notify('error','请先保存 API Key、reference_id 和语音模型。');return;}
        queue.push('你好，这是语音测试。');void drain();
      },
      stop(){cancel(true);},
      dispose(){if(disposed)return;disposed=true;cancel();transport.dispose?.();player.dispose();}
    };
    return controller;
  }
  globalThis.CompanionFish={createController,nativeTransport,audioPlayer};
})();
