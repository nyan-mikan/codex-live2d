import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
vm.runInThisContext(await fs.readFile(new URL('./vendor/marked.umd.js',import.meta.url),'utf8'));
await import('./speech-text.js');

const code=await fs.readFile(new URL('./answer-bridge.js',import.meta.url),'utf8');
// A small DOM fixture lets the real polling adapter run without the desktop app.
class Element {
  constructor(tag='div',attrs={},children=[]){this.tag=tag;this.attrs=attrs;this.children=[];children.forEach(c=>this.append(c));}
  append(child){if(child instanceof Element)child.parent=this;this.children.push(child);}
  get textContent(){return this.children.map(c=>typeof c==='string'?c:c.textContent).join('');}
  set textContent(value){this.children=[value];}
  getAttribute(key){return this.attrs[key]??null;}
  matches(selector){return selector.split(',').some(s=>{
    s=s.trim();if(s.startsWith('#'))return this.attrs.id===s.slice(1);
    if(s.startsWith('.'))return (this.attrs.class||'').split(' ').includes(s.slice(1));
    if(s.startsWith('['))return [...s.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)].every(([,key,value])=>key in this.attrs&&(value===undefined||this.attrs[key]===value));
    return this.tag===s;
  });}
  closest(selector){for(let n=this;n;n=n.parent)if(n.matches(selector))return n;return null;}
  getClientRects(){return this.closest('[hidden]')?[]:[{}];}
  querySelectorAll(selector){const result=[];for(const child of this.children)if(child instanceof Element){if(child.matches(selector))result.push(child);result.push(...child.querySelectorAll(selector));}return result;}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  cloneNode(){return new Element(this.tag,{...this.attrs},this.children.map(c=>typeof c==='string'?c:c.cloneNode()));}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  replaceWith(text){if(this.parent)this.parent.children[this.parent.children.indexOf(this)]=text;}
}
function fixture({phase='final_answer',content='::chatgpt-content-reference{index="1" source_message_id="source"}',completed=false,id='answer',conversationId='chat',hidden=false}={}){
  const item={type:'assistant-message',messageId:id,phase,completed,content};
  const body=new Element('div',{'data-markdown-text-style':'assistant-message'});
  const source=new Element('div',{'data-dil-source-message-id':'source'});
  body.append(source);
  const wrapper=new Element('section',{'data-chatgpt-selection-message-id':id,'data-chatgpt-selection-conversation-id':conversationId},[body]);
  const scope=new Element('section',{'data-thread-find-target':'conversation',...(hidden?{hidden:''}:{})},[wrapper]);
  const base={memoizedProps:{conversationId},child:{memoizedProps:{item,conversationId}}};
  scope.__reactFiber$test=base;
  body.__reactFiber$test={memoizedProps:{item,conversationId},return:base};
  return {item,body,source,scope,base};
}
function run(...fixtures){
  const doc=new Element('document',{},fixtures.map(f=>f.scope)),events=[],listeners=new Map();let tick;
  doc.addEventListener=(name,fn)=>listeners.set(name,fn);doc.removeEventListener=()=>{};
  doc.dispatchEvent=event=>{events.push(JSON.parse(event.detail));};
  const context=vm.createContext({document:doc,window:{addEventListener(){},removeEventListener(){}},setInterval(fn){tick=fn;return 1;},clearInterval(){},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
  vm.runInContext(code,context);
  return {events,tick:()=>tick(),health:()=>context.__codexCompanionAnswerBridge.health()};
}
test('Reference-backed DIL answers stream real body increments and completion while item content stays fixed',()=>{
  const f=fixture(),paragraph=new Element('p',{},['第一句']);f.source.append(paragraph);const h=run(f);
  assert.equal(h.events.at(-1).text,'第一句');assert.equal(h.events.at(-1).initial,true);
  paragraph.append('。第二句');h.tick();assert.equal(h.events.at(-1).delta,'。第二句');assert.equal(h.events.at(-1).reset,false);
  paragraph.append('！');h.tick();assert.equal(h.events.at(-1).delta,'！');
  f.item.completed=true;h.tick();assert.equal(h.events.at(-1).completed,true);assert.equal(h.events.at(-1).delta,'');
  assert.equal(h.health().source,'rendered-answer');assert.equal(h.health().streamingEvents,3);assert.equal(h.health().error,null);
  h.tick();assert.equal(h.events.length,4);
});
test('An unmounted reference cannot poison the sentence baseline before rendered streaming begins',()=>{
  const f=fixture();f.body.children=[];const h=run(f),tracker=new CompanionSpeechText.SentenceTracker();
  assert.equal(h.events.at(-1).text,'');assert.deepEqual(tracker.feed(h.events.at(-1)),[]);
  f.body.append(f.source);const paragraph=new Element('p',{},['第一句。']);f.source.append(paragraph);h.tick();
  assert.deepEqual(tracker.feed(h.events.at(-1)),['第一句。']);
  paragraph.append('第二句！');h.tick();assert.deepEqual(tracker.feed(h.events.at(-1)),['第二句！']);
  f.item.completed=true;h.tick();assert.deepEqual(tracker.feed(h.events.at(-1)),[]);
});
test('Rendered sources, citation pills and interactive widgets are omitted; plain prose and URL labels remain',()=>{
  const f=fixture();f.source.append(new Element('p',{},['正文 ',new Element('a',{},['https://www.example.com/~user']),new Element('span',{role:'button'},['Air Index Today']),new Element('span',{'data-testid':'chatgpt-citation'},['来源']),new Element('span',{'aria-hidden':'true'},['隐藏'])]));
  f.source.append(new Element('div',{role:'radiogroup'},['不朗读选项']));f.source.append(new Element('button',{},['复制']));
  const h=run(f);assert.equal(h.events.at(-1).text,'正文 https://www.example.com/~user');
});
test('Reasoning, commentary and tool data are rejected before any content getter is read',()=>{
  for(const [type,phase] of [['assistant-message','commentary'],['assistant-message','analysis'],['chatgpt-reasoning-group','final_answer'],['mcp-tool-call','final_answer']]){
    const f=fixture({phase});f.item.type=type;Object.defineProperty(f.item,'content',{get(){throw new Error('Excluded content read');}});f.source.append('EXCLUDED');
    const h=run(f);assert.equal(h.events.length,0);assert.equal(h.health().error,null);
  }
});
test('Hidden conversations and unrelated answer wrappers cannot supply a reference-backed answer',()=>{
  const f=fixture(),old=fixture({id:'old'}),hidden=fixture({hidden:true});old.source.append('OLD');hidden.source.append('HIDDEN');
  // The accepted message is not mounted yet, while an older answer is present.
  f.scope.children=[];f.scope.append(old.scope.children[0]);
  const h=run(hidden,f);assert.equal(h.events.at(-1).text,'');assert(!h.events.some(e=>e.text?.includes('OLD')||e.text?.includes('HIDDEN')));
});
test('Plain source content retains priority over frozen rendered Markdown',()=>{
  const f=fixture({content:'数据先到：'});f.source.append('旧的渲染');const h=run(f);
  assert.equal(h.events.at(-1).text,'数据先到：');f.item.content+='实时正文。';h.tick();assert.equal(h.events.at(-1).delta,'实时正文。');assert.equal(h.health().source,'message-data');
});
test('Visible conversation identity wins over retained ancestors and hidden old chat messages',()=>{
  const f=fixture({conversationId:'current'}),old=fixture({conversationId:'old',id:'old-answer'});
  f.base.memoizedProps={};f.base.return={memoizedProps:{conversationId:'old'}};
  old.scope.attrs.hidden='';f.scope.append(old.scope);f.base.child.sibling=old.base;
  f.source.append('当前聊天正文。');old.source.append('OLD_HISTORY');
  const h=run(f);assert.equal(h.events.at(-1).conversationId,'current');assert.equal(h.events.at(-1).text,'当前聊天正文。');assert.equal(h.health().error,null);
});
test('A retained hidden final turn cannot replace the visible answer from the same conversation',()=>{
  const f=fixture(),old=fixture({id:'old-answer',completed:true});
  old.scope.attrs.hidden='';f.scope.append(old.scope);f.base.child.sibling=old.base;
  f.source.append('当前正文。');old.source.append('OLD_HISTORY');
  const h=run(f);assert.equal(h.events.at(-1).id,'answer');assert.equal(h.events.at(-1).text,'当前正文。');assert.equal(h.events.at(-1).completed,false);
});
