import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import './i18n.js';
const {create,resolveLanguage}=Live2DI18n;

test('Saved language wins over system language; Chinese locales and fallback resolve safely',()=>{
  assert.equal(resolveLanguage('en',['zh-CN']),'en');
  assert.equal(resolveLanguage('zh-CN',['en-US']),'zh-CN');
  for(const locale of ['zh','zh-CN','zh-TW','zh-Hant'])assert.equal(resolveLanguage(null,[locale]),'zh-CN');
  for(const locale of ['en-US','ja-JP',undefined])assert.equal(resolveLanguage(null,[locale]),'en');
  assert.equal(resolveLanguage('invalid',['zh-TW']),'zh-CN');
});

test('Language switches preserve user text and interpolate progress and host errors',()=>{
  const i18n=create('en');
  assert.equal(i18n.t('自然'),'Neutral');
  assert.equal(i18n.t('正在朗读 · 已缓存 3 句'),'Speaking · 3 sentence(s) cached');
  assert.equal(i18n.t('Fish Audio 暂时无法合成语音（HTTP 503）。'),'Fish Audio could not synthesize speech (HTTP 503).');
  assert.equal(i18n.t('加载失败：{error}',{error:'missing texture'}),'Failed to load: missing texture');
  assert.equal(i18n.t('My custom expression'),'My custom expression');
  assert.equal(i18n.setLanguage('fr'),false);assert.equal(i18n.language,'en');
  i18n.setLanguage('zh-CN');
  assert.equal(i18n.t('正在朗读 · 已缓存 3 句'),'正在朗读 · 已缓存 3 句');
  assert.equal(i18n.t('Fish Audio 暂时无法合成语音（HTTP 503）。'),'Fish Audio 暂时无法合成语音（HTTP 503）。');
});

test('All fixed Chinese controller/host messages and declarative UI labels have English translations',async()=>{
  const i18n=create('en');
  for(const file of ['fish-client.js','fish-host.mjs','renderer.js']){
    const source=await fs.readFile(new URL(file,import.meta.url),'utf8');
    const fixed=[...source.matchAll(/'([^'\n]*)'/g)].map(m=>m[1]).filter(text=>/[\p{Script=Han}]/u.test(text)&&!text.startsWith(' · '));
    const attributes=[...source.matchAll(/data-i18n(?:-aria|-placeholder)?="([^"]+)"/g)].map(m=>m[1]);
    for(const text of [...fixed,...attributes])assert.notEqual(i18n.t(text),text,`${file}: ${text}`);
  }
});

test('Retranslating during playback preserves pending audio and does not send extra requests',async()=>{
  const context=vm.createContext({setTimeout,clearTimeout,AbortController,structuredClone});
  for(const file of ['vendor/marked.umd.js','speech-text.js','fish-client.js'])vm.runInContext(await fs.readFile(new URL(file,import.meta.url),'utf8'),context);
  const i18n=create('en'),calls=[],updates=[];
  let endPlayback,playing=false;
  const held=new Promise(resolve=>{endPlayback=resolve;});
  const config={enabled:true,configured:true,hasKey:true,referenceId:'test',model:'s2.1-pro-free'};
  const player={ready:()=>true,unlock:async()=>true,mouth:()=>.5,stop(){if(playing)endPlayback();},dispose(){},play(){playing=true;return held;}};
  const controller=context.CompanionFish.createController({t:i18n.t,player,onChange:h=>updates.push(h),transport:async(op,data)=>{
    if(op==='config')return config;calls.push(data.text);return {audio:data.text};
  }});
  await controller.init();
  controller.feed({phase:'final',id:'test',conversationId:'test',text:'第一句。第二句。',completed:false});
  await new Promise(resolve=>setTimeout(resolve,10));
  const before=controller.health();assert(before.speaking,JSON.stringify(before));assert.equal(before.cached,1);assert.equal(calls.length,2);
  i18n.setLanguage('zh-CN');controller.refreshLanguage();
  const after=controller.health();
  for(const key of ['speaking','pending','cached','submitted','played','enabled'])assert.equal(after[key],before[key]);
  assert.equal(updates.at(-1).message,'正在朗读 · 已缓存 1 句');assert.equal(calls.length,2);
  i18n.setLanguage('en');controller.refreshLanguage();assert.equal(updates.at(-1).message,'Speaking · 1 sentence(s) cached');
  controller.dispose();
});
