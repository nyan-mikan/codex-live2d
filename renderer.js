/* Runs in a dedicated CDP isolated world; never changes the app's own globals. */
globalThis.mountCompanion = async function mountCompanion(assetMap, options = {}) {
  if (globalThis.__codexCompanion && !globalThis.__codexCompanion.closed) return globalThis.__codexCompanion.health();
  const PIXI = globalThis.PIXI;
  if (!PIXI?.live2d?.Cubism2ModelSettings) throw new Error('Live2D 2.1 runtime is missing');
  const urls = new Map();
  let app, model, observer, resizeObserver, speechController, wasSpeaking=false, disposed = false;
  const abort = new AbortController();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const saved = (() => { try { return JSON.parse(localStorage.getItem('codex-live2d-display-v1') || '{}'); } catch { return {}; } })();
  const i18n = Live2DI18n.create(saved.language, navigator.languages || [navigator.language]);
  const t = i18n.t;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const state = { language: i18n.language, chatOnly:saved.chatOnly===true, hiddenReason:null, collapsed: saved.collapsed ?? false, paused: reducedMotion.matches, interactive: saved.interactive ?? true, follow: saved.follow ?? true, size: clamp(saved.size || 350, 220, 460), lower: clamp(saved.lower ?? 30, 0, 140), frames: 0, hidden: false, error: null, talking:false, expression: 'neutral', expressionRemaining: 0, gaze: {x:0,y:0}, renderedFace: {}, bounds: null };
  let pageState = null;
  const answer = { connected:false, text:'', delta:'', id:null, conversationId:null, completed:true, events:0 };
  const profileAsset=assetMap['profile.json'];
  const profile=Live2DProfile.readProfile(profileAsset?JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(profileAsset.data),ch=>ch.charCodeAt(0)))):{});
  const labels = Object.fromEntries([['neutral', '自然'],...Object.entries(profile.expressions).map(([name,entry])=>[name,entry.label])]);
  const neutral = profile.neutral;
  const expressions = Object.fromEntries(Object.entries(profile.expressions).map(([name,entry])=>[name,entry.parameters]));
  const expressionParameters=[...new Set([...Object.keys(neutral),...Object.values(expressions).flatMap(entry=>Object.keys(entry))])];
  const weights = Object.fromEntries(Object.keys(expressions).map(name=>[name,0]));
  document.getElementById('codex-live2d-companion')?.remove();
  const host = document.createElement('aside');
  host.id = 'codex-live2d-companion';
  host.dataset.live2dCompanion='true';
  host.setAttribute('aria-label', t('Live2D 角色 Live2D'));
  host.style.cssText = 'position:fixed;left:auto;top:auto;right:12px;bottom:0;width:auto;height:auto;margin:0;padding:0;background:transparent;z-index:90;pointer-events:none;contain:layout style;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{--surface:rgba(30,30,33,.96);--ink:#f5f5f7;--line:rgba(255,255,255,.18);font:12px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;color:var(--ink)}
    *{box-sizing:border-box} .stage{position:relative;pointer-events:none} .stage[hidden]{display:none} canvas{display:block;pointer-events:none}
    button{pointer-events:auto;cursor:pointer;background:var(--surface);color:var(--ink);border:1px solid var(--line);font:inherit;min-height:28px;border-radius:6px;padding:4px 8px}
    .controls{z-index:3;position:absolute;right:0;bottom:8px;display:flex;flex-direction:column;gap:8px;pointer-events:none}
    .icon-button{display:flex;align-items:center;justify-content:center;width:44px;height:44px;min-height:44px;padding:0;border-radius:50%;box-shadow:0 3px 12px #0003;flex:none}
    .icon-button svg{width:22px;height:22px;pointer-events:none}.icon-button:disabled{opacity:.5;cursor:default}.speaker[aria-pressed=true]{color:#e89fc2;border-color:#e89fc288}
    button:hover{background:#45454b} button:active{background:#5b4b58} button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #eaa4c9;outline-offset:2px}
    .panel{z-index:2;position:absolute;right:0;bottom:112px;width:310px;max-width:calc(100vw - 24px);max-height:calc(100vh - 128px);overflow:auto;padding:12px;background:var(--surface);border:1px solid var(--line);border-radius:12px;pointer-events:auto;box-shadow:0 6px 24px #0005}
    select{display:block;width:100%;min-height:38px;margin-top:5px;padding:8px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink);font:inherit}
    .panel[hidden]{display:none} .row{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap} label{display:block;margin-top:10px} input{width:100%;accent-color:#eaa4c9}
    .voice-settings{margin-top:14px;border-top:1px solid var(--line);padding-top:10px}.voice-settings summary{cursor:pointer;min-height:32px;display:list-item;font-weight:600}.voice-settings input[type=text],.voice-settings input[type=password]{display:block;margin-top:5px;padding:9px 10px;min-height:38px;border:1px solid var(--line);border-radius:7px;background:transparent;color:var(--ink);font:inherit}.voice-check{display:flex;align-items:center;gap:8px;min-height:38px}.voice-check input{width:auto;flex:none}.voice-help{font-size:11px;opacity:.8;margin:8px 0}.voice-status{margin-top:10px;overflow-wrap:anywhere}.voice-status[data-error=true]{color:#f2a9b6}.voice-settings button{min-height:36px}.voice-settings button:disabled{opacity:.55;cursor:default}.voice-settings input[aria-invalid=true]{border-color:#f2a9b6}
    .status{margin:6px 0;color:#d8d8dd} .error{max-width:220px;background:var(--surface);border-radius:8px;padding:10px;pointer-events:auto}
    @media(prefers-color-scheme:light){:host{--surface:rgba(248,248,250,.96);--ink:#252529;--line:#0003}.status{color:#51515a}button:hover{background:#e4e4eb}button:active{background:#d3c5d0}}
  `;
  shadow.append(style);
  const stage = document.createElement('div'); stage.className = 'stage';
  const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', t('Live2D 角色动态模型')); canvas.setAttribute('role', 'img');
  stage.append(canvas);
  const icon=paths=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const gearIcon=icon('<path d="m9.5 3-.5 2.5-2 .9-2.2-1.2-2.3 4 2 1.6v2.4l-2 1.6 2.3 4 2.2-1.2 2 .9.5 2.5h5l.5-2.5 2-.9 2.2 1.2 2.3-4-2-1.6v-2.4l2-1.6-2.3-4-2.2 1.2-2-.9L14.5 3z"/><circle cx="12" cy="12" r="3"/>');
  const speakerBody='<path d="m11 5-6 4H2v6h3l6 4V5Z"/>';
  const speakerIcons={on:icon(speakerBody+'<path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13"/>'),off:icon(speakerBody+'<path d="m16 9 5 6m0-6-5 6"/>')};
  const controls=document.createElement('div');controls.className='controls';
  const badge=document.createElement('button');badge.className='icon-button badge';badge.innerHTML=gearIcon;badge.setAttribute('aria-label',t('打开角色设置'));badge.title=t('角色设置');badge.setAttribute('aria-expanded','false');
  const speaker=document.createElement('button');speaker.className='icon-button speaker';speaker.innerHTML=speakerIcons.off;speaker.setAttribute('aria-label',t('开启朗读'));speaker.setAttribute('aria-pressed','false');speaker.title=t('朗读已关闭，点击开启');
  controls.append(speaker,badge);
  const panel = document.createElement('section'); panel.className = 'panel'; panel.hidden = true;
  panel.innerHTML = `
    <strong data-i18n="Live2D 角色"></strong>
    <label><span data-i18n="语言"></span><select data-setting="language"><option value="en" lang="en">English</option><option value="zh-CN" lang="zh-CN">中文</option></select></label>
    <label class="voice-check"><input type="checkbox" data-setting="chat-only"><span data-i18n="仅在聊天界面启用"></span></label>
    <p class="voice-help" data-i18n="打开临时侧栏、应用设置或非聊天页面时自动隐藏；常驻聊天列表不影响显示。"></p>
    <p class="status" role="status" data-i18n="正在加载模型…"></p>
    <div class="row"><button data-action="pause"></button><button data-action="follow"></button><button data-action="interaction"></button></div>
    <div class="row" data-expression-row data-i18n-aria="表情"><button data-expression="neutral" data-i18n="自然"></button></div>
    <label><span data-i18n="模型高度"></span><input data-setting="size" data-i18n-aria="模型高度" type="range" min="220" max="460" step="10"></label>
    <label><span data-i18n="下移距离"></span><input data-setting="lower" data-i18n-aria="下移距离" type="range" min="0" max="140" step="5"></label>
    <div class="row"><button data-action="motion" data-i18n="随机动作"></button><button data-action="reset" data-i18n="恢复位置"></button><button data-action="close" data-i18n="收起模型"></button></div>
  `;
  const voice=document.createElement('details');voice.className='voice-settings';
  voice.innerHTML = `
    <summary data-i18n="语音设置 · Fish Audio"></summary><form>
      <label>FISH_API_KEY<input name="apiKey" type="password" autocomplete="off" spellcheck="false"></label>
      <label>reference_id<input name="referenceId" type="text" autocomplete="off" spellcheck="false" data-i18n-placeholder="要使用的声音 ID"></label>
      <label><span data-i18n="语音模型"></span><input name="model" type="text" list="live2d-fish-models" autocomplete="off" spellcheck="false" value="s2.1-pro-free"></label>
      <datalist id="live2d-fish-models"><option value="s2.1-pro-free"></option><option value="s2.1-pro"></option><option value="s2-pro"></option><option value="s1"></option><option value="drama-3-preview"></option></datalist>
      <label class="voice-check"><input name="enabled" type="checkbox"><span data-i18n="自动朗读新正文"></span></label>
      <label class="voice-check"><input name="rememberKey" type="checkbox"><span data-i18n="记住 API Key"></span></label>
      <p class="voice-help" data-i18n="Key 默认仅留在当前运行期间；勾选后以明文保存到本机配置文件。开启后，清理过的正文将逐句发送到 Fish Audio。"></p>
      <div class="row"><button type="submit" data-i18n="保存配置"></button><button type="button" data-voice="test" data-i18n="试听"></button><button type="button" data-voice="stop" data-i18n="停止朗读"></button><button type="button" data-voice="clear" data-i18n="清除 Key"></button></div>
      <p class="voice-status" role="status" aria-live="polite"></p>
    </form>
  `;
  const expressionRow=panel.querySelector('[data-expression-row]');
  for(const [name,label] of Object.entries(labels))if(name!=='neutral'){
    const button=document.createElement('button');button.dataset.expression=name;button.textContent=label;expressionRow.prepend(button);
  }
  panel.append(voice);
  shadow.append(stage, controls, panel);
  document.body.append(host);
  const status = panel.querySelector('.status');
  const slider = panel.querySelector('[data-setting="size"]'); slider.value = String(state.size);
  const lowerSlider = panel.querySelector('[data-setting="lower"]'); lowerSlider.value = String(state.lower);
  const listen = (target, event, fn, extra = {}) => target.addEventListener(event, fn, { ...extra, signal: abort.signal });
  const persist = () => { try { localStorage.setItem('codex-live2d-display-v1', JSON.stringify({language:state.language, chatOnly:state.chatOnly, collapsed:state.collapsed, size: state.size, lower:state.lower, follow:state.follow, interactive:state.interactive})); } catch {} };
  const chatOnlyInput=panel.querySelector('[data-setting=chat-only]');chatOnlyInput.checked=state.chatOnly;
  const languageSelect = panel.querySelector('[data-setting=language]');
  const voiceForm=voice.querySelector('form'),voiceStatus=voice.querySelector('.voice-status');
  const field=name=>voiceForm.elements.namedItem(name);
  let validationMessage=null;
  function refreshSpeaker(h){
    speaker.innerHTML=h.enabled?speakerIcons.on:speakerIcons.off;
    speaker.setAttribute('aria-pressed',String(h.enabled));speaker.setAttribute('aria-label',h.enabled?t('关闭朗读'):t('开启朗读'));
    speaker.title=h.enabled?t('朗读已启用，点击关闭'):t('朗读已关闭，点击开启');speaker.disabled=h.phase==='saving'||h.phase==='loading';
  }
  function syncSpeechFace(h){
    const talking=h.speaking||h.pending>0||h.preparing>0;
    if(state.talking!==talking){state.talking=talking;refreshExpression();}
  }
  speechController=CompanionFish.createController({
    t,
    ...(options.speechTransport?{transport:options.speechTransport}:{}),
    ...(options.speechPlayer?{player:options.speechPlayer}:{}),
    onChange(h){if(disposed)return;validationMessage=null;syncSpeechFace(h);refreshSpeaker(h);voiceStatus.textContent=h.message;voiceStatus.dataset.error=String(h.phase==='error');for(const button of voiceForm.querySelectorAll('button'))if(button.dataset.voice!=='stop')button.disabled=h.phase==='saving'||button.dataset.voice==='test'&&!h.enabled;for(const input of voiceForm.querySelectorAll('input'))input.disabled=h.phase==='saving';},
    onConfig(c){if(disposed)return;field('model').value=c.model;field('referenceId').value=c.referenceId;field('enabled').checked=c.enabled;field('rememberKey').checked=c.rememberKey;field('apiKey').placeholder=c.hasKey?t('已配置（留空保留当前 Key）'):t('输入 Fish Audio API Key');}
  });
  function refreshBadge() {
    badge.setAttribute('aria-label',t(state.collapsed?'打开角色模型和设置':'打开角色设置'));
    badge.title=t(state.collapsed?'打开角色模型和设置':'角色设置');
  }
  function refreshLanguage() {
    host.lang=state.language;
    host.setAttribute('aria-label',t('Live2D 角色 Live2D'));
    canvas.setAttribute('aria-label',t('Live2D 角色动态模型'));
    languageSelect.value=state.language;
    for(const element of panel.querySelectorAll('[data-i18n]'))element.textContent=t(element.dataset.i18n);
    for(const element of panel.querySelectorAll('[data-i18n-aria]'))element.setAttribute('aria-label',t(element.dataset.i18nAria));
    for(const element of panel.querySelectorAll('[data-i18n-placeholder]'))element.placeholder=t(element.dataset.i18nPlaceholder);
    field('apiKey').placeholder=t(speechController.config().hasKey?'已配置（留空保留当前 Key）':'输入 Fish Audio API Key');
    refreshBadge();refreshSpeaker(speechController.health());
    if(validationMessage)voiceStatus.textContent=t(validationMessage);
    else speechController.refreshLanguage();
    if(state.error)status.textContent=t('加载失败：{error}',{error:state.error});
    else refreshExpression();
    refreshRunning();refreshInteraction();
  }
  const voiceInput=()=>({apiKey:field('apiKey').value.trim(),referenceId:field('referenceId').value.trim(),model:field('model').value.trim(),enabled:field('enabled').checked,rememberKey:field('rememberKey').checked});
  async function saveVoice(){
    const input=voiceInput();
    for(const name of ['apiKey','referenceId','model'])field(name).removeAttribute('aria-invalid');
    if(!/^[A-Za-z0-9._-]{1,80}$/.test(input.model)){field('model').setAttribute('aria-invalid','true');field('model').focus();validationMessage='请填写有效的语音模型名称。';voiceStatus.textContent=t(validationMessage);voiceStatus.dataset.error='true';return false;}
    if(input.enabled&&(!(input.apiKey||speechController.config().hasKey)||!input.referenceId)){if(!(input.apiKey||speechController.config().hasKey))field('apiKey').setAttribute('aria-invalid','true');if(!input.referenceId)field('referenceId').setAttribute('aria-invalid','true');validationMessage='启用朗读前，请填写 API Key 和 reference_id。';voiceStatus.textContent=t(validationMessage);voiceStatus.dataset.error='true';return false;}
    void speechController.unlock();
    const saved=await speechController.save(input);if(saved)field('apiKey').value='';return saved;
  }
  listen(voiceForm,'submit',event=>{event.preventDefault();void saveVoice();});
  listen(voiceForm,'click',event=>{
    const action=event.target.closest?.('[data-voice]')?.dataset.voice;
    if(action==='test'){void speechController.unlock();void (async()=>{if(await saveVoice())await speechController.test();})();}
    if(action==='stop')speechController.stop();
    if(action==='clear'){void speechController.save({...voiceInput(),apiKey:'',clearKey:true,enabled:false,rememberKey:false}).then(ok=>{if(ok)field('apiKey').value='';});}
  });
  listen(voiceForm,'keydown',event=>{if(event.key!=='Escape')event.stopPropagation();});
  refreshLanguage();
  function setLanguage(value) {
    if(disposed||!i18n.setLanguage(value))return false;
    state.language=i18n.language;persist();refreshLanguage();return true;
  }
  listen(languageSelect,'change',()=>setLanguage(languageSelect.value));
  listen(languageSelect,'keydown',event=>{if(event.key!=='Escape')event.stopPropagation();});
  await speechController.init();
  if(speechController.config().enabled)void speechController.unlock();
  function receiveAnswer(message) {
    if(disposed||!message||!['final','reset'].includes(message.phase))return false;
    answer.connected=true;
    if(message.phase==='reset'){speechController.feed(message);answer.text='';answer.id=null;answer.conversationId=null;answer.delta='';answer.completed=true;return true;}
    if(typeof message.text!=='string'||typeof message.id!=='string'||typeof message.conversationId!=='string')return false;
    answer.id=message.id;answer.conversationId=message.conversationId;answer.text=message.text.slice(0,100000);answer.delta=typeof message.delta==='string'?message.delta:'';answer.completed=message.completed===true;answer.events++;
    speechController.feed({...message,text:answer.text,suppressVoice:state.collapsed||document.hidden||state.hidden});
    syncSpeechFace(speechController.health());
    return true;
  }
  function refreshInteraction() {
    for (const name of ['follow','interaction']) {
      const enabled=name==='follow'?state.follow:state.interactive, button=panel.querySelector(`[data-action="${name}"]`);
      button.textContent=`${t(name==='follow'?'跟随':'互动')}: ${t(enabled?'开':'关')}`;button.setAttribute('aria-pressed',String(enabled));
    }
    if (!state.interactive || state.paused || state.collapsed) { canvas.style.pointerEvents='none';canvas.style.cursor='default'; }
    if (!state.follow) model?.internalModel.focusController.focus(0,0);
  }
  function refreshExpression() {
    if (!model) return;
    status.textContent=state.talking?t('朗读中 · 自然表情'):t('{expression} · 点击头部或身体会有回应',{expression:state.expression==='neutral'?t('自然'):labels[state.expression]});
    for (const button of panel.querySelectorAll('[data-expression]')){button.disabled=state.talking;button.setAttribute('aria-pressed',String(button.dataset.expression===(state.talking?'neutral':state.expression)));}
    panel.querySelector('[data-action=motion]').disabled=state.talking;
  }
  function layout() {
    if (!app || !model || disposed) return;
    const height = Math.round(Math.min(state.size, innerHeight * .58));
    const width = Math.round(Math.min(height * .7, innerWidth * .26));
    stage.style.width = `${width}px`; stage.style.height = `${height}px`;
    app.renderer.resize(width, height);
    const internal = model.internalModel, transform = internal.localTransform;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const id of internal.getDrawableIDs()) {
      const points = internal.getDrawableVertices(id);
      for (let i = 0; i + 1 < points.length; i += 2) {
        const x = transform.a * points[i] + transform.c * points[i+1] + transform.tx;
        const y = transform.b * points[i] + transform.d * points[i+1] + transform.ty;
        if (Number.isFinite(x) && Number.isFinite(y)) { left=Math.min(left,x); right=Math.max(right,x); top=Math.min(top,y); bottom=Math.max(bottom,y); }
      }
    }
    if (![left,top,right,bottom].every(Number.isFinite) || right<=left || bottom<=top) { left=0; top=0; right=internal.width; bottom=internal.height; }
    const scale = Math.min(width / ((right-left)*1.06), height / ((bottom-top)*1.06));
    model.anchor.set(0,0); model.scale.set(scale);
    const x=(width-(right-left)*scale)/2, y=(height-(bottom-top)*scale)/2+state.lower;
    model.position.set(x-left*scale, y-top*scale);
    state.bounds={x,y,width:(right-left)*scale,height:(bottom-top)*scale};
    app.render();
  }
  function refreshRunning() {
    if (disposed) return;
    if (app) { if (state.paused || document.hidden || state.hidden || state.collapsed) app.stop(); else app.start(); }
    const btn = panel.querySelector('[data-action="pause"]'); btn.textContent = state.paused ? t('继续') : t('暂停'); btn.setAttribute('aria-pressed', String(state.paused));
    refreshInteraction();
  }
  function focusAt(clientX,clientY) {
    if (!model || !state.follow || state.paused || state.collapsed || disposed) return;
    const r=canvas.getBoundingClientRect(), b=state.bounds;
    const headX=r.left+(b?b.x+b.width*.5:r.width*.5), headY=r.top+(b?b.y+b.height*.15:r.height*.2);
    const x=clamp((clientX-headX)/(innerWidth*.6),-.85,.85), y=clamp((headY-clientY)/(innerHeight*.6),-.85,.85);
    state.gaze={x,y}; model.internalModel.focusController.focus(x,y);
  }
  function hitPart(clientX,clientY) {
    if(!model||!state.bounds||state.collapsed||disposed)return null;
    const r=canvas.getBoundingClientRect(), x=clientX-r.left,y=clientY-r.top,b=state.bounds;
    if(x<0||x>r.width||y<0||y>r.height)return null;
    if(((x-b.x-b.width*.5)/(b.width*.25))**2+((y-b.y-b.height*.15)/(b.height*.17))**2<=1)return 'head';
    return model.hitTest(x,y).length?'body':null;
  }
  function updateExpression(delta) {
    if(state.expressionRemaining>0){state.expressionRemaining=Math.max(0,state.expressionRemaining-delta);if(!state.expressionRemaining){state.expression='neutral';void model.motion(profile.idleMotionGroup,0,PIXI.live2d.MotionPriority.FORCE);refreshExpression();}}
    const smoothing=1-Math.exp(-delta/170);
    for(const name of Object.keys(weights))weights[name]+=(Number(name===state.expression)-weights[name])*smoothing;
  }
  function applyExpression() {
    const core=model.internalModel.coreModel;
    const total=Object.values(weights).reduce((a,b)=>a+b,0);
    if(state.talking){
      for(const [id,value] of Object.entries(profile.speechNeutral))core.setParamFloat(id,value);
    }else if(total>.001){
      for(const id of expressionParameters){
        let value=0;for(const [name,weight] of Object.entries(weights))value+=(expressions[name][id]??neutral[id]??0)*weight;
        core.setParamFloat(id,value/total,Math.min(1,total));
      }
    }
    if(state.follow){
      const gaze=model.internalModel.focusController;
      core.setParamFloat('PARAM_EYE_BALL_X',gaze.x);core.setParamFloat('PARAM_EYE_BALL_Y',gaze.y);
      core.setParamFloat('PARAM_ANGLE_X',gaze.x*25,.8);core.setParamFloat('PARAM_ANGLE_Y',gaze.y*20,.8);
      core.setParamFloat('PARAM_BODY_ANGLE_X',gaze.x*7,.6);
    }
    if(speechController?.health().speaking){core.setParamFloat(profile.mouthParameter,speechController.mouth());wasSpeaking=true;}else if(wasSpeaking){core.setParamFloat(profile.mouthParameter,0);wasSpeaking=false;}
    state.renderedFace=Object.fromEntries([...new Set([...expressionParameters,...Object.keys(profile.speechNeutral),profile.mouthParameter,'PARAM_ANGLE_X','PARAM_ANGLE_Y','PARAM_EYE_BALL_X','PARAM_EYE_BALL_Y'])].map(id=>[id,core.getParamFloat(id)]));
  }
  function checkOcclusion() {
    if (disposed) return;
    const wasHidden=state.hidden;
    const current=Live2DView.read();
    const view=pageState?{...current,chat:pageState.chat,settingsOpen:pageState.settingsOpen||current.settingsOpen}:current;
    const decision=Live2DView.decide(view,state.chatOnly);
    state.hidden=decision.hidden;state.hiddenReason=decision.reason;
    if(state.hidden&&!wasHidden)speechController?.stop();
    const visibility=state.hidden?'hidden':'visible';
    if(host.style.visibility!==visibility)host.style.visibility=visibility;
    refreshRunning();
  }
  function destroy() {
    if (disposed) return;
    disposed = true; api.closed = true;
    document.dispatchEvent(new CustomEvent('codex-live2d-answer-control',{detail:JSON.stringify({action:'stop'})}));
    document.dispatchEvent(new CustomEvent('codex-live2d-page-control',{detail:'stop'}));
    speechController?.dispose();
    abort.abort(); observer?.disconnect(); resizeObserver?.disconnect();
    if (app) { app.stop(); app.destroy(true, { children:true, texture:true, baseTexture:true }); }
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear(); host.remove();
  }
  const api = globalThis.__codexCompanion = {
    closed:false, host, state,
    health() { return { version:11, chatOnly:state.chatOnly, hiddenReason:state.hiddenReason, language:state.language, talking:state.talking, effectiveExpression:state.talking?'neutral':state.expression, voice:speechController.health(), answer:{connected:answer.connected,characters:answer.text.length,deltaCharacters:answer.delta.length,events:answer.events,completed:answer.completed,visible:false}, collapsed:state.collapsed, ready:!!model && !disposed, closed:disposed, frames:state.frames, paused:state.paused, hidden:state.hidden, interactive:state.interactive, follow:state.follow, expression:state.expression, lower:state.lower, gaze:{target:state.gaze,current:model&&!disposed?{x:model.internalModel.focusController.x,y:model.internalModel.focusController.y}:null}, renderedFace:state.renderedFace, bounds:state.bounds, viewport:[innerWidth,innerHeight], size:[canvas.clientWidth,canvas.clientHeight], webglLost:!!app?.renderer?.gl?.isContextLost(), error:state.error, motions:model && !disposed ? Object.fromEntries(Object.entries(model.internalModel.motionManager.definitions).map(([k,v])=>[k,v.length])) : null }; },
    pixels() {
      if (!app || !model || disposed) return null;
      app.render(); const gl=app.renderer.gl, w=app.renderer.width,h=app.renderer.height;
      const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let opaque=0,transparent=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]>20)opaque++;if(pixels[i]===0)transparent++;}
      return {opaque,transparent,total:w*h};
    },
    async motion(index=null) {
      if(!model||disposed||state.talking)return false;
      const definitions=model.internalModel.motionManager.definitions;
      const group=definitions[profile.clickMotionGroup]?.length?profile.clickMotionGroup:Object.keys(definitions).find(name=>definitions[name]?.length);
      if(!group)return false;
      const count=definitions[group].length,selected=index===null?Math.floor(Math.random()*count):Number(index);
      if(!Number.isInteger(selected)||selected<0||selected>=count)return false;
      return model.motion(group,selected,PIXI.live2d.MotionPriority.FORCE);
    },
    async react(name='neutral',duration=6500) {
      if(!model||disposed||state.talking||!Object.hasOwn(labels,name))return false;
      state.expression=name;state.expressionRemaining=name==='neutral'?0:Math.max(500,Number(duration)||6500);refreshExpression();
      if(state.paused){updateExpression(1000);model.update(16);app.render();}
      if(!state.paused)return model.motion(profile.idleMotionGroup,0,PIXI.live2d.MotionPriority.FORCE);
      return true;
    },
    receiveAnswer,
    speechHostReady:config=>speechController.hostReady(config),
    setLanguage,
    setChatOnly(value) { state.chatOnly=!!value;chatOnlyInput.checked=state.chatOnly;persist();checkOcclusion(); },
    setSpeechEnabled:value=>speechController.enable(!!value),
    focusAt,
    setFollow(value) { state.follow=!!value;persist();refreshInteraction(); },
    setInteractive(value) { state.interactive=!!value;persist();refreshInteraction(); },
    pause(value=true) { state.paused=!!value;refreshRunning(); },
    setSize(value) { state.size=Math.max(220,Math.min(460,Number(value)||350));slider.value=String(state.size);persist();layout(); },
    setLower(value) { state.lower=clamp(Number(value)||0,0,140);lowerSlider.value=String(state.lower);persist();layout(); },
    setVisible(value=true) {
      if(disposed)return false;
      if(!value)speechController.stop();
      state.collapsed=!value;stage.hidden=state.collapsed;panel.hidden=true;
      badge.setAttribute('aria-label',state.collapsed?t('打开角色模型和设置'):t('打开角色设置'));
      badge.title=state.collapsed?t('打开角色模型和设置'):t('角色设置');
      badge.setAttribute('aria-expanded','false');
      canvas.style.pointerEvents='none';persist();
      if(!state.collapsed){layout();model?.internalModel.focusController.focus(0,0);}
      refreshRunning();return true;
    },
    destroy
  };
  listen(document,'codex-live2d-answer',event=>{if(typeof event.detail==='string'){try{receiveAnswer(JSON.parse(event.detail));}catch{}}});
  listen(chatOnlyInput,'change',()=>api.setChatOnly(chatOnlyInput.checked));
  listen(chatOnlyInput,'keydown',event=>{if(event.key!=='Escape')event.stopPropagation();});
  listen(document,'codex-live2d-page-state',event=>{
    try{const value=JSON.parse(event.detail);if(!['chat','sidebarOpen','settingsOpen','modalOpen'].every(key=>typeof value[key]==='boolean'))return;pageState=value;checkOcclusion();}catch{}
  });
  document.dispatchEvent(new CustomEvent('codex-live2d-page-control',{detail:'refresh'}));
  checkOcclusion();
  listen(badge,'click' ,()=>{if(speechController.config().enabled)void speechController.unlock();if(state.collapsed)api.setVisible(true);panel.hidden=!panel.hidden;badge.setAttribute('aria-expanded',String(!panel.hidden));});
  listen(speaker,'click',async()=>{if(speaker.disabled)return;const value=!speechController.config().enabled;if(value&&!speechController.config().configured){panel.hidden=false;voice.open=true;badge.setAttribute('aria-expanded','true');field('apiKey').focus();}await speechController.enable(value);});
  listen(shadow,'click',async event=>{
    const expression=event.target.closest?.('[data-expression]')?.dataset.expression;
    if(expression)await api.react(expression);
    const action=event.target.closest?.('[data-action]')?.dataset.action;
    if(action==='pause'){state.paused=!state.paused;refreshRunning();}
    if(action==='interaction')api.setInteractive(!state.interactive);
    if(action==='follow')api.setFollow(!state.follow);
    if(action==='motion')await api.motion();
    if(action==='reset'){api.setSize(350);api.setLower(30);}
    if(action==='close')api.setVisible(false);
  });
  listen(slider,'input',()=>api.setSize(slider.value));
  listen(lowerSlider,'input',()=>api.setLower(lowerSlider.value));
  listen(document,'keydown',event=>{if(event.key==='Escape'&&!panel.hidden){panel.hidden=true;badge.setAttribute('aria-expanded','false');}});
  listen(document,'visibilitychange',()=>{if(document.hidden)speechController.stop();refreshRunning();});
  listen(reducedMotion,'change',()=>{state.paused=reducedMotion.matches;refreshRunning();});
  listen(canvas,'click',event=>{if(state.interactive&&!state.paused){const part=hitPart(event.clientX,event.clientY);if(part){const names=Object.keys(expressions);if(names.length)void api.react(names[Math.floor(Math.random()*names.length)]);else void api.motion();}}});
  listen(document,'pointermove',event=>{
    focusAt(event.clientX,event.clientY);
    const hit=state.interactive&&!state.paused&&hitPart(event.clientX,event.clientY);
    canvas.style.pointerEvents=hit?'auto':'none';canvas.style.cursor=hit?'pointer':'default';
  },{passive:true,capture:true});
  listen(document,'pointerleave',()=>{canvas.style.pointerEvents='none';model?.internalModel.focusController.focus(0,0);},{passive:true});
  try {
    for (const [name,asset] of Object.entries(assetMap)) {
      const bytes=Uint8Array.from(atob(asset.data),ch=>ch.charCodeAt(0));
      urls.set(name,URL.createObjectURL(new Blob([bytes],{type:asset.type})));
    }
    const definition=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(assetMap['model.model.json'].data),ch=>ch.charCodeAt(0))));
    definition.url='app://-/codex-live2d/model.model.json';
    const settings=new PIXI.live2d.Cubism2ModelSettings(definition);
    settings.resolveURL = file => {const url=urls.get(file);if(!url)throw new Error(`Missing model asset: ${file}`);return url;};
    PIXI.live2d.config.sound=false;
    app=new PIXI.Application({view:canvas,width:245,height:350,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,backgroundAlpha:0,antialias:true,powerPreference:'low-power',autoStart:false});
    app.ticker.maxFPS=30;
    model=await PIXI.live2d.Live2DModel.from(settings,{autoUpdate:false,autoInteract:false,motionPreload:PIXI.live2d.MotionPreloadStrategy.ALL});
    if(disposed){model.destroy();return {closed:true};}
    app.stage.addChild(model);
    model.internalModel.on('beforeModelUpdate',applyExpression);
    app.ticker.add(()=>{updateExpression(app.ticker.deltaMS);model.update(app.ticker.deltaMS);});
    app.renderer.on('postrender',()=>state.frames++);
    model.update(16);app.render();layout();
    listen(window,'resize',layout,{passive:true});
    observer=new MutationObserver(records=>{if(!host.isConnected&&!disposed)document.body.append(host);if(records.some(record=>record.target!==host))checkOcclusion();});
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-modal','open','aria-expanded','aria-hidden','hidden','inert','data-state','data-slate-sidebar-peeking','data-app-shell-responsive-sidebar','data-app-shell-docking-peek','class','style']});
    refreshExpression();
    host.dataset.ready='true';api.setVisible(!state.collapsed);checkOcclusion();
    console.info('[Codex Companion] mounted',api.health());
    return api.health();
  } catch(error) {
    state.error=String(error?.stack||error);status.textContent=t('加载失败：{error}',{error:error.message||error});panel.hidden=false;badge.setAttribute('aria-expanded','true');console.error('[Codex Companion]',error);
    app?.stop();throw error;
  }
};
