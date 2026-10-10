(async()=>{
  const proof=document.querySelector('#proof'),main=document.querySelector('main'),sidebar=document.querySelector('#app-shell-sidebar'),toggle=document.querySelector('#sidebar-toggle');
  const route={pathname:'/local/visibility-test'};
  main.__reactFiber$fixture={memoizedProps:{value:{location:route}},return:null};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async predicate=>{for(let count=0;count<100;count++){if(predicate())return;await wait(20);}throw new Error('Visibility did not reach the expected state');};
  const check=(value,message)=>{if(!value)throw new Error(message);};
  let playing=false,finish=null,requests=0;
  const config={enabled:true,configured:true,hasKey:true,referenceId:'fixture',model:'s2.1-pro-free'};
  const player={ready:()=>true,unlock:async()=>true,mouth:()=>.5,stop(){playing=false;finish?.();finish=null;},dispose(){},play:async()=>{playing=true;await new Promise(resolve=>{finish=resolve;});playing=false;}};
  // Exercise the real settings/visibility/speech controller with a model-free renderer fixture.
  const focus={x:0,y:0,focus(x,y){this.x=x;this.y=y;}};
  const mockModel={internalModel:{localTransform:{a:1,b:0,c:0,d:1,tx:0,ty:0},width:100,height:200,getDrawableIDs:()=>[],focusController:focus,coreModel:{setParamFloat(){},getParamFloat:()=>0},motionManager:{definitions:{idle:[{}]}},on(){}},anchor:{set(){}},scale:{set(){}},position:{set(){}},update(){},destroy(){},motion:async()=>true,hitTest:()=>[]};
  globalThis.PIXI={Application:class{constructor(){this.renderer={resize(){},on(){},width:245,height:350,gl:{isContextLost:()=>false}};this.stage={addChild(){}};this.ticker={add(){},deltaMS:16};}start(){}stop(){}render(){}destroy(){}},live2d:{Cubism2ModelSettings:class{},Live2DModel:{from:async()=>mockModel},config:{},MotionPreloadStrategy:{ALL:1},MotionPriority:{FORCE:3}}};
  try{
    await mountCompanion({'model.model.json':{type:'application/json',data:btoa('{}')}},{speechPlayer:player,speechTransport:async op=>{if(op==='config')return config;if(op==='tts'){requests++;return {audio:'fixture'};}throw new Error('Unexpected operation');}});
    __codexCompanion.setVisible(true);
    proof.textContent='Ready. Open the gear to test the setting, or run the visibility checks.';
    const setSidebar=open=>{toggle.setAttribute('aria-expanded',String(open));sidebar.hidden=!open;};
    toggle.addEventListener('click',()=>setSidebar(toggle.getAttribute('aria-expanded')!=='true'));
    document.querySelector('#run').addEventListener('click',async()=>{
      try{
        const api=__codexCompanion,checks=[],workspace=document.querySelector('#workspace');
        api.setChatOnly(false);setSidebar(true);await wait(300);check(!api.health().hidden,'Off should preserve normal sidebar behavior');checks.push('off-preserves-sidebar');
        api.setChatOnly(true);await until(()=>api.health().hiddenReason==='sidebar');checks.push('sidebar-hides');
        document.body.setAttribute('data-app-shell-responsive-sidebar','false');await until(()=>!api.health().hidden);checks.push('docked-chat-list-remains-visible');
        document.body.setAttribute('data-app-shell-docking-peek','true');await until(()=>api.health().hiddenReason==='sidebar');checks.push('temporary-docking-peek-hides');
        document.body.setAttribute('data-app-shell-docking-peek','false');await until(()=>!api.health().hidden);
        document.body.setAttribute('data-app-shell-responsive-sidebar','true');await until(()=>api.health().hiddenReason==='sidebar');checks.push('responsive-sidebar-restores-hiding');
        setSidebar(false);await until(()=>!api.health().hidden);checks.push('sidebar-close-restores');
        workspace.hidden=false;await until(()=>api.health().hiddenReason==='sidebar');checks.push('right-workspace-hides');
        workspace.hidden=true;await until(()=>!api.health().hidden);checks.push('right-workspace-close-restores');
        route.pathname='/settings/personalization';await until(()=>api.health().hiddenReason==='settings');checks.push('memory-route-settings-hides');
        route.pathname='/plugins';await until(()=>api.health().hiddenReason==='non-chat');checks.push('other-pages-hide');
        route.pathname='/local/visibility-test';await until(()=>!api.health().hidden);checks.push('chat-restores');
        const modal=document.createElement('section');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.style.visibility='hidden';modal.textContent='Dialog fixture';document.body.append(modal);await wait(300);check(!api.health().hidden,'Invisible dialog should not hide the model');checks.push('invisible-dialog-ignored');
        modal.style.visibility='visible';await until(()=>api.health().hiddenReason==='dialog');modal.remove();await until(()=>!api.health().hidden);checks.push('visible-dialog-hides-and-restores');
        const panel=api.host.shadowRoot.querySelector('.panel');panel.hidden=false;await wait(300);check(!api.health().hidden,'Own settings should remain usable');checks.push('own-settings-remain-usable');panel.hidden=true;
        api.receiveAnswer({phase:'final',conversationId:'visibility-test',id:'speech-'+Date.now(),text:'A test sentence. Next',completed:false,initial:false});await until(()=>playing);check(requests>0,'Mock speech should start');
        setSidebar(true);await until(()=>api.health().hidden);check(!api.health().voice.speaking&&api.health().voice.pending===0,'Hiding should cancel playback and cache');const count=requests;
        api.receiveAnswer({phase:'final',conversationId:'visibility-test',id:'hidden-speech',text:'A hidden sentence.',completed:false,initial:false});await wait(300);check(requests===count,'No synthesis while hidden');checks.push('hidden-cancels-speech-and-requests');
        setSidebar(false);await until(()=>!api.health().hidden);
        api.setVisible(false);setSidebar(true);await until(()=>api.health().hidden);setSidebar(false);await until(()=>!api.health().hidden);check(api.health().collapsed,'Automatic restoration should preserve manual collapse');checks.push('manual-collapse-preserved');api.setVisible(true);
        const saved=JSON.parse(localStorage.getItem('codex-live2d-display-v1'));check(saved.chatOnly===true,'Preference should persist');checks.push('preference-persisted');
        const result={phase:'visibility-preview',passed:true,checks};globalThis.visibilityProof=result;proof.textContent=JSON.stringify(result,null,2);await fetch('/report',{method:'POST',body:JSON.stringify(result)});
      }catch(error){globalThis.visibilityProof={passed:false,error:String(error.stack||error)};proof.textContent=JSON.stringify(visibilityProof,null,2);}
    });
  }catch(error){proof.textContent=String(error.stack||error);}
})();
