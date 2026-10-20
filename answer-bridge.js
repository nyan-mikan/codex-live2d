/* Read-only body adapter. Response text is never evaluated or persisted. */
(() => {
  globalThis.__codexCompanionAnswerBridge?.stop();
  const finalPhases=new Set(['final','final_answer']),maxChars=100000;
  let stopped=false,last=null,sequence=0,interval;
  const stats={version:4,events:0,streamingEvents:0,characters:0,finalCandidates:0,ignoredCommentary:0,ignoredUnknown:0,active:false,lastPhase:null,source:null,error:null,samples:[]};
  const fiberOf=node=>node?.[Object.keys(node).find(k=>k.startsWith('__reactFiber$'))];
  function currentFiber(fiber){
    if(!fiber)return null;
    let root=fiber;while(root.return)root=root.return;
    // A DOM node can retain the other React branch after a commit. Never merge its stale completion flag.
    return root.stateNode?.current&&root.stateNode.current!==root?fiber.alternate:fiber;
  }
  const visible=node=>!node.closest('#codex-live2d-companion,[hidden],[aria-hidden="true"],[inert]')&&node.getClientRects().length>0;
  function itemInfo(item,conversationId,adapter,completed){
    if(item?.type!=='assistant-message'&&item?.type!=='agentMessage')return null;
    if(!finalPhases.has(item.phase))return null;
    const id=item.id??item.searchItemId??item.messageId??item.responseAnnotationTargetId;
    if(typeof id!=='string'||typeof conversationId!=='string'||!conversationId)return null;
    // Inspect body content only after the explicit assistant + final-phase checks.
    const text=item.type==='agentMessage'?item.text:item.content;
    if(typeof text!=='string')return null;
    return {id,conversationId,adapter,phase:'final',completed:completed??item.completed===true,text:text.slice(0,maxChars)};
  }
  function timelineAnswer(){
    const scopes=[...document.querySelectorAll('[data-thread-find-target="conversation"]')].filter(visible);
    const scope=scopes.at(-1);if(!scope)return null;
    let base=currentFiber(fiberOf(scope));if(!base)return null;
    let conversationId=null;
    for(let f=base;f&&!conversationId;f=f.return)if(typeof f.memoizedProps?.conversationId==='string')conversationId=f.memoizedProps.conversationId;
    if(!conversationId)return null;
    const raw=new Map(),normalized=new Map();let visited=0;
    function add(item,conv,adapter,completed){const info=itemInfo(item,conv,adapter,completed);if(info)(adapter==='turn-data'?raw:normalized).set(info.id,info);}
    function walk(f,conv){
      if(!f||++visited>30000)return;
      const p=f.memoizedProps;
      if(typeof p?.conversationId==='string')conv=p.conversationId;
      if(conv!==conversationId)return; // Never pick an embedded or background chat.
      if(f.stateNode?.nodeType===1&&f.stateNode!==scope&&f.stateNode.closest('[hidden],[aria-hidden="true"],[inert]'))return;
      if(p?.item&&['reasoning','dil-reasoning','analysis','tool-call','mcp-tool-call','exec'].includes(p.item.type))return;
      const turn=p?.turn;
      if(Array.isArray(turn?.items)){
        for(const item of turn.items){
          if(item.type==='agentMessage'){
            const completed=['completed','failed','interrupted'].includes(turn.status)||turn.agentMessageCompletedAtMsById?.[item.id]!=null;
            add(item,conv,'turn-data',completed);
          }else add(item,conv,'message-data');
        }
      }
      if(Array.isArray(p?.items))for(const item of p.items)add(item,conv,'message-data');
      if(p?.item)add(p.item,conv,'message-data');
      for(let c=f.child;c;c=c.sibling)walk(c,conv);
    }
    walk(base,conversationId);
    const candidates=raw.size?[...raw.values()]:[...normalized.values()];
    stats.finalCandidates=candidates.length;
    return {scoped:true,scope,answer:candidates.at(-1)??null};
  }
  function renderedBody(node){
    const clone=node.cloneNode(true);
    // DIL source pills and interactive widgets are controls, not spoken prose.
    for(const n of clone.querySelectorAll('script,style,template,button,[role="button"],input,select,textarea,[role="radiogroup"],[data-testid="chatgpt-citation"],[hidden],[aria-hidden="true"],[role="status"],[role="alert"],.sr-only,[data-thread-find-skip]'))n.remove();
    for(const br of clone.querySelectorAll('br'))br.replaceWith('\n');
    for(const block of clone.querySelectorAll('p,pre,li,h1,h2,h3,h4,h5,h6,blockquote,tr,[data-d-component="list-item"],[data-d-component="table-row"]'))block.append('\n');
    return (clone.textContent||'').trim().slice(0,maxChars);
  }
  function domAnswer(target=null,scope=document){
    const candidates=[];let commentary=0,unknown=0;
    for(const node of scope.querySelectorAll('[data-markdown-text-style="assistant-message"]')){
      if(!visible(node))continue;
      const finalRoot=node.closest('[data-local-conversation-final-assistant]');
      const chatRoot=node.closest('[data-chatgpt-selection-message-id][data-chatgpt-selection-conversation-id]');
      if(!finalRoot&&!chatRoot)continue;
      let item=null,conversationId=chatRoot?.getAttribute('data-chatgpt-selection-conversation-id');
      for(let f=currentFiber(fiberOf(node)),d=0;f&&d<80;f=f.return,d++){
        const p=f.memoizedProps;
        conversationId??=typeof p?.conversationId==='string'?p.conversationId:null;
        if(!item&&p?.item){item=p.item;if(item.type!=='assistant-message')break;}
        if(item&&conversationId)break;
      }
      if(item?.phase==='commentary'){commentary++;continue;}
      // Ordinary Chat has no phase in some versions; only its dedicated answer wrapper qualifies.
      if(item?.type!=='assistant-message'||!(finalPhases.has(item.phase)||(chatRoot&&item.phase==null&&typeof item.completed==='boolean'))){unknown++;continue;}
      const id=item.id??item.searchItemId??item.messageId??item.responseAnnotationTargetId??chatRoot?.getAttribute('data-chatgpt-selection-message-id');
      if(!id||!conversationId){unknown++;continue;}
      if(target&&(target.id!==id||target.conversationId!==conversationId))continue;
      // Recent Chat builds store a reference directive here while streaming the
      // actual answer inside its DIL renderer. Never read a different message.
      const rendered=typeof item.content==='string'&&item.content.includes('::chatgpt-content-reference{')&&node.querySelector('[data-dil-source-message-id]');
      const text=typeof item.content==='string'&&!rendered?item.content.slice(0,maxChars):renderedBody(node);
      candidates.push({id,conversationId,adapter:rendered?'rendered-answer':'answer-data',phase:'final',completed:item.completed===true,text});
    }
    stats.finalCandidates=candidates.length;stats.ignoredCommentary=commentary;stats.ignoredUnknown=unknown;
    return candidates.at(-1)??null;
  }
  function send(payload){
    stats.events++;stats.lastPhase=payload.phase;stats.characters+=payload.delta?.length||0;
    if(payload.phase==='final'){
      if(!payload.completed)stats.streamingEvents++;
      stats.samples.push({at:Date.now(),characters:payload.text.length,deltaCharacters:payload.delta.length,completed:payload.completed,source:payload.adapter});
      if(stats.samples.length>60)stats.samples.shift();
    }
    document.dispatchEvent(new CustomEvent('codex-live2d-answer',{detail:JSON.stringify({...payload,sequence:++sequence})}));
  }
  function scan(){
    if(stopped||document.hidden)return;
    try{
      const timeline=timelineAnswer();let answer=timeline?.scoped?timeline.answer:domAnswer();
      if(timeline?.answer?.text.includes('::chatgpt-content-reference{')){
        const rendered=domAnswer(answer,timeline.scope);
        if(rendered?.adapter==='rendered-answer')answer={...answer,text:rendered.text,adapter:rendered.adapter};
      }
      // An unresolved body reference is not a text baseline. Sending it first
      // would make a newly mounted answer look like a non-prefix edit forever.
      if(answer?.text.includes('::chatgpt-content-reference{')&&!answer.text.replace(/::chatgpt-content-reference\{[^}\n]*\}/g,'').trim())answer={...answer,text:'',adapter:'pending-rendered-answer'};
      if(!answer){stats.active=false;if(last){last=null;send({phase:'reset'});}return;}
      stats.active=true;stats.source=answer.adapter;
      const key=answer.conversationId+':'+answer.id,text=answer.text;
      if(last?.key===key&&last.text===text&&last.completed===answer.completed)return;
      const newMessage=last?.key!==key,reset=newMessage||!text.startsWith(last?.text||'');
      const delta=reset?text:text.slice(last.text.length);
      last={key,text,completed:answer.completed};
      send({...answer,delta,reset,newMessage,initial:sequence===0});
    }catch(error){stats.error=String(error.message||error);}
  }
  // Sampling committed data catches increments even while Markdown is frozen or not mounted.
  // Fixed cadence prevents a stream of DOM mutations from continually postponing delivery.
  interval=setInterval(scan,80);
  document.addEventListener('visibilitychange',scan);window.addEventListener('popstate',scan);
  function control(event){try{const action=JSON.parse(event.detail).action;if(action==='refresh')globalThis.__codexCompanionAnswerBridge.refresh();if(action==='stop')globalThis.__codexCompanionAnswerBridge.stop();}catch{}}
  document.addEventListener('codex-live2d-answer-control',control);
  globalThis.__codexCompanionAnswerBridge={
    health(){return {...stats,samples:stats.samples.map(s=>({...s})),stopped};},
    refresh(){last=null;scan();},
    stop(){if(stopped)return;stopped=true;clearInterval(interval);document.removeEventListener('visibilitychange',scan);document.removeEventListener('codex-live2d-answer-control',control);window.removeEventListener('popstate',scan);last=null;}
  };
  scan();
})();
