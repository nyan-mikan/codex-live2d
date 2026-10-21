import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

vm.runInThisContext(await fs.readFile(new URL('./vendor/marked.umd.js',import.meta.url),'utf8'));
await import('./speech-text.js');
const source=await fs.readFile(new URL('./fish-client.js',import.meta.url),'utf8');
function load(AudioContext){const context=vm.createContext({AudioContext,CompanionSpeechText,AbortController});vm.runInContext(source,context);return context.CompanionFish;}
function gestures(){
  const listeners=new Map();
  return {listeners,addEventListener(type,fn,options){assert.equal(options.capture,true);assert.equal(options.passive,true);listeners.set(type,fn);options.signal?.addEventListener('abort',()=>listeners.delete(type),{once:true});},fire(type,isTrusted=true){listeners.get(type)?.({isTrusted});}};
}
test('Real chat gestures resume enabled speech; synthetic events, mute, hidden models and disposed listeners do not',()=>{
  const target=gestures(),abort=new AbortController();let calls=0,active=true;
  const h={enabled:true,configured:true,audioReady:false};
  const controller={health:()=>h,unlock(){calls++;}};
  load().bindAudioActivation(controller,{target,signal:abort.signal,shouldActivate:()=>active});
  target.fire('pointerdown',false);assert.equal(calls,0);
  h.enabled=false;target.fire('pointerdown');assert.equal(calls,0);
  h.enabled=true;active=false;target.fire('keydown');assert.equal(calls,0);
  active=true;target.fire('keydown');assert.equal(calls,1);
  h.audioReady=true;target.fire('pointerdown');assert.equal(calls,1);
  h.audioReady=false;abort.abort();target.fire('keydown');assert.equal(calls,1);assert.equal(target.listeners.size,0);
});
test('A suspended startup attempt can be resumed by a later gesture, and a closed audio context can be recreated',async()=>{
  const contexts=[];let permitted=false;
  class AudioContext {
    constructor(){this.state='suspended';this.waiters=[];contexts.push(this);}
    resume(){if(permitted){this.state='running';this.waiters.splice(0).forEach(resolve=>resolve());return Promise.resolve();}return new Promise(resolve=>this.waiters.push(resolve));}
    close(){this.state='closed';return Promise.resolve();}
    createAnalyser(){return {owner:this,connect(){}};}
    createBufferSource(){const owner=this;return {connect(node){assert.equal(node.owner,owner);},disconnect(){},start(){queueMicrotask(()=>this.onended?.());},stop(){}};}
  }
  const player=load(AudioContext).audioPlayer();
  assert.equal(player.state(),'uninitialized');
  const startup=player.unlock();assert.equal(player.ready(),false);assert.equal(player.state(),'suspended');
  permitted=true;await player.unlock();await startup;assert.equal(player.ready(),true);assert.equal(contexts.length,1);
  await player.play({},new AbortController().signal);
  contexts[0].state='closed';assert.equal(player.ready(),false);await player.unlock();assert.equal(player.ready(),true);assert.equal(contexts.length,2);
  await player.play({},new AbortController().signal);
  player.dispose();assert.equal(player.state(),'closed');
});
test('Queued streaming sentences wait without API requests, then drain in order after an ordinary chat gesture',async()=>{
  const target=gestures(),abort=new AbortController(),requests=[],played=[];let ready=false;
  const player={ready:()=>ready,unlock:async()=>{ready=true;return true;},mouth:()=>0,stop(){},dispose(){},async play(r){played.push(r.audio);}};
  const transport=async(op,data)=>op==='config'?{enabled:true,configured:true,hasKey:true,model:'test',referenceId:'voice'}:(requests.push(data.text),{audio:data.text});
  const Fish=load(),controller=Fish.createController({player,transport});await controller.init();
  Fish.bindAudioActivation(controller,{target,signal:abort.signal});
  controller.feed({id:'live',conversationId:'chat',phase:'final',text:'第一句。第二句！',completed:false});
  assert.equal(controller.health().phase,'locked');assert.equal(requests.length,0);
  target.fire('keydown');
  for(let i=0;i<20&&played.length<2;i++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.deepEqual(requests,['第一句。','第二句！']);assert.deepEqual(played,requests);assert.equal(controller.health().audioReady,true);
  abort.abort();controller.dispose();
});
