(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const proof=document.querySelector('#proof'),events=[];
  const check=(value,message)=>{if(!value)throw new Error(message);};
  function fixture(type,phase,text,final=false,chat=false,id=Math.random().toString(36)){
    const root=document.createElement('section');root.className=final?'':'excluded';
    if(final)root.setAttribute('data-local-conversation-final-assistant','true');
    if(chat){root.setAttribute('data-chatgpt-selection-message-id',id);root.setAttribute('data-chatgpt-selection-conversation-id','preview-chat');}
    const body=document.createElement('div');body.setAttribute('data-markdown-text-style','assistant-message');body.textContent=text;
    const item={type,phase,completed:false,messageId:id};
    body.__reactFiber$preview={memoizedProps:{item,conversationId:chat?'preview-chat':'preview-codex'},return:null};
    root.append(body);document.querySelector('#fixtures').append(root);return {root,body,item};
  }
  const snapshot=()=>({health:__codexCompanion.health(),bridge:__codexCompanionAnswerBridge.health(),text:events.at(-1)?.text||''});
  try{
    await mountCompanion(await(await fetch('/assets.json')).json());__codexCompanion.setVisible(true);
    const thought=fixture('assistant-message','analysis','思考_SENTINEL');
    const commentary=fixture('assistant-message','commentary','过程更新_SENTINEL');
    fixture('mcp-tool-call',null,'工具输出_SENTINEL');
    fixture('user-message',null,'用户输入_SENTINEL');
    fixture('assistant-message','final_answer','非正文容器_SENTINEL');
    fixture('reasoning',null,'错误标记的思考_SENTINEL',true);
    const answer=fixture('assistant-message','final_answer','',true,false,'final-1');
    document.addEventListener('codex-live2d-answer',e=>events.push(JSON.parse(e.detail)));
    const script=document.createElement('script');script.src='answer-bridge.js';document.head.append(script);await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject;});
    answer.body.textContent='正文测试：';const citation=document.createElement('a');citation.setAttribute('data-testid','chatgpt-citation');citation.textContent='Air Index Today';answer.body.append(citation);await wait(250);const first=snapshot();
    check(first.text==='正文测试：','First increment reaches background listener');check(!first.text.includes('Air Index Today'),'DOM source citation pill is excluded');
    thought.body.append('新思考_SENTINEL');commentary.body.append('新过程_SENTINEL');await wait(200);
    check(snapshot().text==='正文测试：','Reasoning and commentary do not alter body');
    answer.body.append('我会跟着回答逐步显示。');await wait(250);const second=snapshot();
    check(second.text==='正文测试：我会跟着回答逐步显示。','Second increment reaches background listener');
    check(events.at(-1).delta==='我会跟着回答逐步显示。','Delta contains only appended text');
    answer.body.textContent='正文测试：\n我会跟着回答逐步显示。\n这段文字来自正文，思考和工具日志不会进入气泡。';await wait(250);
    check(events.at(-1).reset,'Markdown reflow replaces prior text safely');
    answer.item.completed=true;await wait(850);const completed=snapshot();check(completed.health.answer.completed,'Completion without a DOM change is detected');
    check(!events.some(e=>e.text?.includes('SENTINEL')),'Excluded content is never forwarded');
    const chat=fixture('assistant-message',undefined,'Chat 正文测试：',false,true,'chat-final-1');await wait(250);
    chat.body.append('普通回答也能逐步显示。');await wait(250);chat.item.completed=true;await wait(850);
    check(snapshot().text==='Chat 正文测试：普通回答也能逐步显示。','Chat answer wrapper is supported');
    const painted=fixture('assistant-message',undefined,'',false,true,'painted-final');painted.item.content='# 绘制正文\n**可读取的正文**';painted.body.append(document.createElement('dil-renderer'));await wait(250);
    check(snapshot().text==='# 绘制正文\n**可读取的正文**','Painted answer uses accepted body metadata');painted.root.remove();await wait(250);
    chat.root.remove();await wait(250);
    __codexCompanionAnswerBridge.refresh();await wait(150);
    const final=snapshot();check(!final.health.answer.visible&&!__codexCompanion.host.shadowRoot.querySelector('.speech'),'Body bubble is absent while background streaming remains active');
    // The actual regression: model data changes before Markdown is rendered.
    answer.item.content='数据先到：';await wait(180);
    check(snapshot().text==='数据先到：','Source content takes priority over frozen Markdown');
    answer.item.content+='第一段';await wait(180);
    check(events.at(-1).delta==='第一段','Frozen DOM still streams source increments');
    const scope=document.createElement('section');scope.setAttribute('data-thread-find-target','conversation');scope.textContent='正文渲染尚未挂载';document.querySelector('#fixtures').append(scope);
    const turn={turnId:'stream-turn',status:'inProgress',agentMessageCompletedAtMsById:{},items:[]};
    const raw={type:'agentMessage',id:'raw-final',phase:'final_answer',text:''};
    const excluded=['reasoning','commandExecution','userMessage'].map(type=>({type,id:type,phase:'final_answer',get text(){throw new Error('Excluded text was read');},get content(){throw new Error('Excluded content was read');}}));
    const progress={type:'agentMessage',id:'progress',phase:'commentary',get text(){throw new Error('Commentary text was read');}};
    turn.items=[...excluded,progress,raw];
    const root={stateNode:{current:null},return:null};
    const stale={memoizedProps:{conversationId:'preview-stream'},return:root,child:{memoizedProps:{turn:{...turn,status:'completed',items:[{...raw,text:'旧分支_SENTINEL'}]}}}};
    const fresh={memoizedProps:{conversationId:'preview-stream'},return:root,child:{memoizedProps:{turn},child:null,sibling:null}};
    stale.alternate=fresh;fresh.alternate=stale;
    root.stateNode.current={};scope.__reactFiber$preview=stale;
    raw.text='实时正文：';await wait(180);const dataFirst=snapshot();
    check(dataFirst.text==='实时正文：'&&!dataFirst.health.answer.completed,'Current branch streams before answer DOM exists');
    raw.text+='从消息数据';await wait(180);const dataSecond=snapshot();
    check(events.at(-1).delta==='从消息数据','Raw agent text sends a true append-only delta');
    raw.text+='增量显示。';await wait(180);
    check(scope.textContent==='正文渲染尚未挂载','DOM remained frozen throughout streaming');
    turn.agentMessageCompletedAtMsById[raw.id]=Date.now();await wait(180);
    check(snapshot().health.answer.completed,'Message completion is independent of turn completion');
    check(!events.some(e=>e.text?.includes('SENTINEL')),'Stale alternate and excluded phases never enter body');
    const hidden=document.createElement('section');hidden.hidden=true;hidden.setAttribute('data-thread-find-target','conversation');hidden.__reactFiber$preview={memoizedProps:{conversationId:'background'},child:{memoizedProps:{turn:{status:'completed',items:[{...raw,text:'后台_SENTINEL'}]}}}};document.body.append(hidden);await wait(180);
    check(snapshot().text==='实时正文：从消息数据增量显示。','Hidden conversations are excluded');
    check(__codexCompanionAnswerBridge.health().streamingEvents>=3,'Multiple non-completed data increments were delivered');
    check(final.health.answer.events>=5,'Multiple increments were delivered');
    const result={phase:'answer-preview',passed:true,checks:['incremental-body','reasoning-excluded','commentary-excluded','tool-and-user-excluded','non-body-container-excluded','markdown-reset','completion','chat-wrapper','painted-body','no-body-bubble','source-citation-pill-excluded','frozen-markdown-source','no-answer-dom','current-react-branch','raw-agent-delta','phase-gated-getters','message-completion-before-turn','hidden-conversation'],dataFirst,dataSecond,first,second,completed,final};
    proof.textContent='验证通过：后台正文增量、内容过滤和完成状态正常，模型不显示正文弹窗。';
    await fetch('/report',{method:'POST',body:JSON.stringify(result)});
  }catch(error){proof.textContent='验证失败：'+String(error.stack||error);await fetch('/report',{method:'POST',body:JSON.stringify({phase:'answer-preview',passed:false,error:String(error.stack||error)})});}
})();
