(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  let config={enabled:false,model:'s2.1-pro-free',referenceId:'',rememberKey:false,hasKey:false,configured:false},playing=false,calls=[],played=[],cancelPlayer=null;
  const transport=async(op,data,signal)=>{
    if(op==='config')return config;
    if(op==='save'){const c=data.config;config={enabled:c.enabled,model:c.model,referenceId:c.referenceId,rememberKey:c.rememberKey,hasKey:c.clearKey?false:!!c.apiKey||config.hasKey};config.configured=!!(config.hasKey&&config.referenceId&&config.model);if(config.enabled&&!config.configured)throw new Error('启用朗读前，请填写 API Key 和 reference_id。');return config;}
    if(op==='tts'){calls.push(data.text);await wait(100);if(signal.aborted)throw new Error('cancelled');return {audio:data.text};}
  };
  const player={ready:()=>true,unlock:async()=>true,mouth:()=>playing?.55:0,stop(){playing=false;cancelPlayer?.();},dispose(){},async play(result,signal){playing=true;played.push(result.audio);const row=document.createElement('div');row.className='sentence';row.textContent='逐句请求：'+result.audio;document.querySelector('#sentences').append(row);await new Promise(resolve=>{cancelPlayer=resolve;setTimeout(resolve,450);});playing=false;cancelPlayer=null;}};
  await mountCompanion(await(await fetch('/assets.json')).json(),{speechTransport:transport,speechPlayer:player});__codexCompanion.setVisible(true);
  document.querySelector('#run').addEventListener('click',async()=>{
    const proof=document.querySelector('#proof');
    if(!config.enabled||!config.configured){proof.textContent='请先填写测试 API Key、reference_id，勾选自动朗读并保存配置。';return;}
    calls=[];played=[];document.querySelector('#sentences').replaceChildren();
    const id='preview-'+Date.now();const send=(text,completed=false,phase='final')=>__codexCompanion.receiveAnswer({id,conversationId:'fish-preview',phase,text,completed,initial:false});

    send('**第一句**🙂。第二');await wait(280);const first=__codexCompanion.health();const interactionBlocked=(await __codexCompanion.react('neutral'))===false;
    send('**第一句**🙂。第二句包含[链接](https://example.com)！还没结束');await wait(170);const prefetched=__codexCompanion.health();await wait(780);
    send('**第一句**🙂。第二句包含[链接](https://example.com)！还没结束',true);await wait(900);
    const afterSpeech=__codexCompanion.health();
    const neutralWhileSpeaking=first.talking&&first.effectiveExpression==='neutral';
    const expected=['第一句。','第二句包含链接！','还没结束'];const passed=neutralWhileSpeaking&&interactionBlocked&&JSON.stringify(calls)===JSON.stringify(expected)&&JSON.stringify(played)===JSON.stringify(expected)&&prefetched.voice.speaking&&prefetched.voice.cached===1&&!prefetched.answer.visible&&!__codexCompanion.host.shadowRoot.querySelector('.speech')&&first.voice.speaking;
    const speaker=__codexCompanion.host.shadowRoot.querySelector('.speaker');
    const waitToggle=async enabled=>{for(let i=0;i<80;i++){if(__codexCompanion.health().voice.enabled===enabled&&__codexCompanion.health().voice.phase!=='saving')return;await wait(10);}throw new Error('Speaker toggle timed out');};
    speaker.click();await waitToggle(false);const requestsBeforeMute=calls.length;
    const muteId='mute-'+Date.now();const muteSend=(text,completed=false)=>__codexCompanion.receiveAnswer({id:muteId,conversationId:'fish-preview',phase:'final',text,completed,initial:false});
    muteSend('禁用期间的正文。');await wait(180);
    const mutedNoRequests=calls.length===requestsBeforeMute&&!__codexCompanion.health().voice.speaking&&speaker.getAttribute('aria-pressed')==='false';
    speaker.click();await waitToggle(true);muteSend('禁用期间的正文。重新开启后的正文。',true);await wait(700);
    const resumeFutureOnly=calls.length===requestsBeforeMute+1&&calls.at(-1)==='重新开启后的正文。'&&speaker.getAttribute('aria-pressed')==='true';
    const result={phase:'fish-preview',passed:passed&&mutedNoRequests&&resumeFutureOnly,mutedNoRequests,resumeFutureOnly,neutralWhileSpeaking,interactionBlocked,calls,played,prefetchedVoice:prefetched.voice,firstVoice:first.voice,final:__codexCompanion.health().voice};
    proof.textContent=result.passed?'验证通过：逐句请求、文字清理、顺序播放、预取、朗读期间暂停互动及扬声器开关正常。':'验证失败：请检查报告。';
    await fetch('/report',{method:'POST',body:JSON.stringify(result)});
  });
})();
