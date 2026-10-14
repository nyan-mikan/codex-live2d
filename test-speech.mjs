import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {FishHost} from './fish-host.mjs';
vm.runInThisContext(await fs.readFile(new URL('./vendor/marked.umd.js',import.meta.url),'utf8'));
await import('./speech-text.js');await import('./fish-client.js');
const {cleanMarkdown,SentenceTracker}=CompanionSpeechText;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const message=(text,completed=false,id='one',initial=false)=>({phase:'final',text,completed,id,conversationId:'test',initial});
const cfg={enabled:true,configured:true,hasKey:true,rememberKey:false,referenceId:'test_voice',model:'s2.1-pro-free'};
test('Markdown, tables, references, HTML and complex emoji become inert plain speech',()=>{
  assert.equal(cleanMarkdown('# **你好**，*世界*！😊\n\n> 引用 `代码`。\n- [x] ~~已经~~完成。\n\n[文档][r]\n\n[r]: https://example.com\n\n![图示](https://example.com/img.png)'), '你好，世界！\n引用 代码。\n\n已经完成。\n\n文档\n\n图示');
  assert.equal(cleanMarkdown('第1句👨‍👩‍👧‍👦🇯🇵1️⃣✌🏽❤️完成。'), '第1句完成。');
  assert.equal(cleanMarkdown('<script>alert(1)</script><strong>安全</strong>&amp;纯文字。'), '安全&纯文字。');
  assert.equal(cleanMarkdown('| 名称 | 值 |\n| --- | --- |\n| **声音** | `live2d` |'), '名称，值\n声音，live2d');
  assert.equal(cleanMarkdown('```js\nconst x = 1;\n```\n后面的正文。'), 'const x = 1;\n后面的正文。');
});
test('Streaming source sentences are emitted once; unfinished Markdown is buffered',()=>{
  const t=new SentenceTracker();assert.deepEqual(t.feed(message('**第一')),[]);
  assert.deepEqual(t.feed(message('**第一句**😊。第二')),['第一句。']);
  assert.deepEqual(t.feed(message('**第一句**😊。第二句！尾段')),['第二句！']);
  assert.deepEqual(t.feed(message('**第一句**😊。第二句！尾段',true)),['尾段']);
  assert.deepEqual(t.feed(message('**第一句**😊。第二句！尾段',true)),[]);
  const link=new SentenceTracker();assert.deepEqual(link.feed(message('请查看[文档。](https://exa')),[]);
  assert.deepEqual(link.feed(message('请查看[文档。](https://example.com)然后继续。')),['请查看文档。','然后继续。']);
  const code=new SentenceTracker();assert.deepEqual(code.feed(message('开始。\n```js\n代码。')),['开始。']);
  assert.deepEqual(code.feed(message('开始。\n```js\n代码。\n```\n结束。')),['代码。','结束。']);
});
test('Roleplay laughter is omitted while URL hosts, paths, query values and ordinary words remain intact',()=>{
  assert.equal(cleanMarkdown('真有意思www！**好啦wwwww**。ｗｗｗ\nwww'), '真有意思！好啦。');
  assert.equal(cleanMarkdown('哈哈www，打开 https://www.example.com/path/www?q=www#www。'), '哈哈，打开 https://www.example.com/path/www?q=www#www。');
  assert.equal(cleanMarkdown('www.example.com docs.example.com/www www.example.com:8080/www\n[www.example.com](https://www.example.com)\n[网站](https://www.example.com/www)'), 'www.example.com docs.example.com/www www.example.com:8080/www\nwww.example.com\n网站');
  assert.equal(cleanMarkdown('awww www2 wwword mywwwname WWW World Wide Web'), 'awww www2 wwword mywwwname WWW World Wide Web');
  assert.equal(cleanMarkdown('https://example.com/?q=www&next=www.example.com www'), 'https://example.com/?q=www&next=www.example.com');
});
test('Decorative sentence tails are removed while normal stops, interior punctuation and URLs are preserved',()=>{
  for(const tail of ['——','～','〜','–','―','……','⋯','·','•','﹏','--','—— ～ ……']){
    assert.equal(cleanMarkdown('你好'+tail),'你好');
    assert.equal(cleanMarkdown('你好'+tail+'！再见'+tail+'。'),'你好！再见。');
  }
  assert.equal(cleanMarkdown('Hello～. Next——!'), 'Hello. Next!');
  assert.equal(cleanMarkdown('“你好——。”\n再见～'),'“你好。”\n再见');
  assert.equal(cleanMarkdown('这是——补充说明；范围 1～5，波浪～线。'),'这是——补充说明；范围 1～5，波浪～线。');
  assert.equal(cleanMarkdown('请看—— https://example.com/~user?q=~。'),'请看—— https://example.com/~user?q=~。');
  assert.equal(cleanMarkdown('https://example.com/path——\nwww.example.com/path～'),'https://example.com/path——\nwww.example.com/path～');
  assert.equal(cleanMarkdown('你好……😊:chatgpt-content-reference{index="0"}'),'你好');
});
test('Streaming decorative tails do not submit extra sentences or replay prior speech',()=>{
  const tracker=new SentenceTracker();
  assert.deepEqual(tracker.feed(message('第一句～！第二句—')),['第一句！']);
  assert.deepEqual(tracker.feed(message('第一句～！第二句——')),[]);
  assert.deepEqual(tracker.feed(message('第一句～！第二句——。')),['第二句。']);
  assert.deepEqual(tracker.feed(message('第一句～！第二句——。～……',true)),[]);
});
test('Fish API receives cleaned sentence tails and never sends a symbols-only tail',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'live2d-fish-tails-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const requests=[];
  const host=new FishHost({configPath:path.join(dir,'config.json'),fetchImpl:async(url,options)=>{requests.push(JSON.parse(options.body));return new Response(Uint8Array.of(1,2,3));}});
  await host.save({enabled:true,apiKey:'test-only-not-real-key',referenceId:'test_voice',model:'s2.1-pro-free'});
  await host.tts('**你好**—— ～ 😊','owner','tails');await host.tts('来看看～！','owner','stop');
  await host.tts('https://example.com/~user?q=~','owner','url');
  assert.deepEqual(requests.map(r=>r.text),['你好','来看看！','https://example.com/~user?q=~']);
  await assert.rejects(host.tts('—— ～ ……','owner','only-tails'),/没有可以朗读的文字/);assert.equal(requests.length,3);
});
test('Incremental laughter creates no speech or duplicate sentences, and a growing URL retains its www',()=>{
  const t=new SentenceTracker();assert.deepEqual(t.feed(message('第一句www。第二句w')),['第一句。']);
  assert.deepEqual(t.feed(message('第一句www。第二句ww')),[]);
  assert.deepEqual(t.feed(message('第一句www。第二句www！www\n')),['第二句！']);
  assert.deepEqual(t.feed(message('第一句www。第二句www！www\n',true)),[]);
  const u=new SentenceTracker();assert.deepEqual(u.feed(message('打开 www')),[]);
  assert.deepEqual(u.feed(message('打开 www.example')),[]);
  assert.deepEqual(u.feed(message('打开 www.example.com/www。')),['打开 www.example.com/www。']);
});
test('The final Fish request removes laughter without corrupting an included URL',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'live2d-fish-laughter-'));const requests=[];
  const host=new FishHost({configPath:path.join(dir,'config.json'),fetchImpl:async(url,options)=>{requests.push(JSON.parse(options.body));return new Response(Uint8Array.of(1,2,3));}});
  await host.save({enabled:true,apiKey:'test-only-not-real-key',referenceId:'test_voice',model:'s2.1-pro-free'});
  await host.tts('来看看www：https://www.example.com/www?q=www。','owner','laughter');
  assert.equal(requests[0].text,'来看看：https://www.example.com/www?q=www。');
  assert.equal(requests[0].reference_id,'test_voice');
  await assert.rejects(host.tts('www','owner','only-laughter'),/没有可以朗读的文字/);assert.equal(requests.length,1);
});
test('History, duplicate snapshots, edits, decimals and English abbreviations do not cause replay',()=>{
  const t=new SentenceTracker();assert.deepEqual(t.feed(message('历史回答。',true,'old',true)),[]);
  assert.deepEqual(t.feed(message('历史回答。',true,'old')),[]);
  assert.deepEqual(t.feed(message('价格 3.14 元。 Dr. Smith is here. Next! 未完',false,'new')),['价格 3.14 元。','Dr. Smith is here.','Next!']);
  assert.deepEqual(t.feed(message('价格 3.14 元。 Dr. Smith is here. Next! 未完',false,'new')),[]);
  assert.deepEqual(t.feed(message('**价格 3.14 元。** Dr. Smith is here. Next! 未完',true,'new')),['未完']);
});
test('Controller submits one sentence at a time, plays in order, and excludes non-final phases',async()=>{
  const calls=[],played=[];let inFlight=0,maxFlight=0;
  const transport=async(op,data)=>{if(op==='config')return cfg;if(op==='save')return {...cfg,...data.config};inFlight++;maxFlight=Math.max(maxFlight,inFlight);calls.push(data.text);await wait(8);inFlight--;return {audio:data.text};};
  const player={ready:()=>true,unlock:async()=>true,mouth:()=>.5,stop(){},dispose(){},async play(r){played.push(r.audio);await wait(5);}};
  const c=CompanionFish.createController({transport,player});await c.init();c.feed({...message('不可转发。'),phase:'analysis'});c.feed({...message('不可转发。'),phase:'commentary'});
  c.feed(message('**第一句**🙂。第二句！尾段',false));await wait(50);assert.deepEqual(calls,['第一句。','第二句！']);
  c.feed(message('**第一句**🙂。第二句！尾段',true));await wait(25);assert.deepEqual(calls,['第一句。','第二句！','尾段']);assert.deepEqual(played,calls);assert.equal(maxFlight,1);assert.equal(c.health().played,3);c.dispose();
});
test('Stop aborts a pending API request and prevents remaining text in that answer from being sent',async()=>{
  const calls=[];
  const transport=async(op,data,signal)=>{if(op==='config')return cfg;calls.push(data.text);return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});});};
  const player={ready:()=>true,unlock:async()=>true,mouth:()=>0,stop(){},dispose(){},async play(){}};
  const c=CompanionFish.createController({transport,player});await c.init();c.feed(message('第一句。第二句。'));await wait(1);c.stop();await wait(1);c.feed(message('第一句。第二句。第三句。',true));await wait(5);assert.deepEqual(calls,['第一句。']);assert.equal(c.health().pending,0);c.dispose();
});
test('Local API transport uses exact header/body schema and does not persist or return Key by default',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'live2d-fish-test-')),configPath=path.join(dir,'config.json');const requests=[];
  const host=new FishHost({configPath,fetchImpl:async(url,options)=>{requests.push({url,options});return new Response(Uint8Array.of(1,2,3),{headers:{'content-type':'audio/mpeg'}});}});
  const pub=await host.save({enabled:true,apiKey:'test-only-not-real-key',referenceId:'test_voice',model:'s2.1-pro-free',rememberKey:false});
  assert.equal(pub.hasKey,true);assert.equal(pub.apiKey,undefined);assert(!JSON.stringify(pub).includes('test-only-not-real-key'));
  assert(!await fs.readFile(configPath,'utf8').then(s=>s.includes('test-only-not-real-key')));assert.equal((await fs.stat(configPath)).mode&0o777,0o600);
  const audio=await host.tts('**你好** 😊。','owner','request');assert.equal(audio.audio,'AQID');
  assert.equal(requests[0].url,'https://api.fish.audio/v1/tts');assert.equal(requests[0].options.headers.model,'s2.1-pro-free');assert.equal(requests[0].options.headers.Authorization,'Bearer test-only-not-real-key');
  assert.deepEqual(JSON.parse(requests[0].options.body),{text:'你好。',reference_id:'test_voice',format:'mp3',latency:'balanced',normalize:true});
  await host.save({enabled:true,referenceId:'test_voice',model:'s2.1-pro-free',rememberKey:true});assert((await fs.readFile(configPath,'utf8')).includes('test-only-not-real-key'));
  await host.save({enabled:false,referenceId:'test_voice',model:'s2.1-pro-free',rememberKey:false,clearKey:true});assert(!host.publicConfig().hasKey);assert(!(await fs.readFile(configPath,'utf8')).includes('test-only-not-real-key'));
});
test('API errors do not echo response bodies or credentials',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'live2d-fish-errors-'));
  const host=new FishHost({configPath:path.join(dir,'config.json'),fetchImpl:async()=>new Response('echoed-secret',{status:401})});await host.save({enabled:true,apiKey:'test-secret',referenceId:'voice',model:'s2.1-pro-free'});
  await assert.rejects(host.tts('你好。','owner','error'),e=>e.message==='API Key 无效或已过期。');
});

test('Switching chats skips completed history and cancels the previous sentence queue',async()=>{
  const calls=[];
  const transport=async(op,data)=>{if(op==='config')return cfg;calls.push(data.text);return {audio:data.text};};
  const player={ready:()=>true,unlock:async()=>true,mouth:()=>0,stop(){},dispose(){},async play(){}};
  const c=CompanionFish.createController({transport,player});await c.init();
  c.feed(message('首次打开的历史回答。',true,'history'));await wait(5);assert.deepEqual(calls,[]);
  c.feed(message('新正文。',false,'new'));await wait(5);assert.deepEqual(calls,['新正文。']);
  c.feed({...message('另一个聊天的历史回答。',true,'other'),conversationId:'other-chat'});await wait(5);assert.deepEqual(calls,['新正文。']);
  c.feed({...message('另一个聊天的新正文。',false,'live'),conversationId:'other-chat'});await wait(5);assert.deepEqual(calls,['新正文。','另一个聊天的新正文。']);c.dispose();
});

test('Collapsed or occluded companion does not send future answers to the API',async()=>{
  const calls=[];
  const transport=async(op,data)=>op==='config'?cfg:(calls.push(data.text),{audio:data.text});
  const player={ready:()=>true,unlock:async()=>true,mouth:()=>0,stop(){},dispose(){},async play(){}};
  const c=CompanionFish.createController({transport,player});await c.init();
  c.feed({...message('模型隐藏期间的新正文。',false,'hidden'),suppressVoice:true});await wait(5);assert.deepEqual(calls,[]);
  c.feed({...message('模型隐藏期间的新正文。第二句。',true,'hidden'),suppressVoice:true});await wait(5);assert.deepEqual(calls,[]);
  c.feed(message('打开后下一条正文。',false,'open'));await wait(5);assert.deepEqual(calls,['打开后下一条正文。']);c.dispose();
});

const until=async predicate=>{for(let n=0;n<200;n++){if(predicate())return;await wait(2);}assert.fail('Timed out waiting for controller');};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('Playback prefetches and decodes the next three sentences before the current sentence ends',async()=>{
  const calls=[],prepared=[],played=[],releases=[];let playing=0,maxPlaying=0;
  const transport=async(op,data)=>op==='config'?cfg:(calls.push(data.text),{audio:data.text});
  const player={ready:()=>true,unlock:async()=>true,mouth:()=>.5,stop(){releases.at(-1)?.resolve();},dispose(){},
    async prepare(r){prepared.push(r.audio);return {decoded:r.audio};},
    async play(r){played.push(r.decoded);playing++;maxPlaying=Math.max(maxPlaying,playing);const release=deferred();releases.push(release);await release.promise;playing--;}};
  const c=CompanionFish.createController({transport,player});await c.init();
  const sentences=Array.from({length:8},(_,i)=>`第${i+1}句。`);c.feed(message(sentences.join('')));
  await until(()=>c.health().cached===3);
  assert.deepEqual(calls,sentences.slice(0,4));assert.deepEqual(prepared,calls);assert.deepEqual(played,[sentences[0]]);
  assert.equal(c.health().speaking,true);assert.equal(c.health().preparing,0);assert.equal(c.health().pending,7);
  // The remaining text stays unsent until a playback slot becomes available.
  for(let i=0;i<8;i++){await until(()=>played.length===i+1);releases[i].resolve();}
  await until(()=>c.health().played===8);assert.deepEqual(played,sentences);assert.equal(maxPlaying,1);assert.equal(c.health().cached,0);c.dispose();
});
test('Streaming newly completed sentences prefetches during playback and a chat switch discards late audio',async()=>{
  const oldFuture=deferred(),currentEnd=deferred(),calls=[],played=[],signals=[];let stopped=0;
  const transport=async(op,data,signal)=>{if(op==='config')return cfg;calls.push(data.text);signals.push(signal);if(data.text==='旧第二句。')return oldFuture.promise;return {audio:data.text};};
  const player={ready:()=>true,unlock:async()=>true,mouth:()=>.5,stop(){stopped++;if(played.length)currentEnd.resolve();},dispose(){},async play(r){played.push(r.audio);if(r.audio==='旧第一句。')await currentEnd.promise;}};
  const c=CompanionFish.createController({transport,player});await c.init();
  // Only the first complete sentence is available initially.
  c.feed(message('旧第一句。旧第二'));await until(()=>played.length===1);
  c.feed(message('旧第一句。旧第二句。'));
  await until(()=>calls.length===2);assert.equal(c.health().speaking,true);
  c.feed({...message('新聊天第一句。',false,'new'),conversationId:'new-chat'});
  await until(()=>calls.length===3);assert(signals[1].aborted);assert(stopped>=2);
  oldFuture.resolve({audio:'旧第二句。'});await wait(5);
  assert.deepEqual(played,['旧第一句。','新聊天第一句。']);assert.equal(c.health().cached,0);assert.equal(c.health().pending,0);c.dispose();
});
test('Stop cancels playback and in-flight prefetch, clears ready cache and ignores late failures',async()=>{
  const request=deferred(),playEnd=deferred(),calls=[],signals=[];
  const transport=async(op,data,signal)=>{if(op==='config')return cfg;calls.push(data.text);signals.push(signal);return calls.length===3?request.promise:{audio:data.text};};
  const player={ready:()=>true,unlock:async()=>true,mouth:()=>.5,stop(){},dispose(){},async play(){await playEnd.promise;}};
  const c=CompanionFish.createController({transport,player});await c.init();c.feed(message('第一句。第二句。第三句。第四句。'));
  await until(()=>calls.length===3&&c.health().cached===1);assert.equal(c.health().speaking,true);
  c.stop();assert(signals.every(s=>s.aborted));assert.equal(c.health().cached,0);assert.equal(c.health().pending,0);assert.equal(c.mouth(),0);
  request.reject(new Error('late request failed'));playEnd.resolve();await wait(5);assert.notEqual(c.health().phase,'error');
  c.feed(message('第一句。第二句。第三句。第四句。第五句。',true));await wait(5);assert.equal(calls.length,3);c.dispose();
});
test('Prefetch failure cancels remaining requests and playback instead of leaving a hanging cache',async()=>{
  let calls=0,aborted=false,running=false;const end=deferred();
  const transport=async(op,data)=>{if(op==='config')return cfg;if(++calls===2){await wait(2);throw new Error('mock synthesis failure');}return {audio:data.text};};
  const player={ready:()=>true,unlock:async()=>true,mouth:()=>.5,stop(){if(running)end.resolve();},dispose(){},async play(r,signal){running=true;signal.addEventListener('abort',()=>{aborted=true;});await end.promise;}};
  const c=CompanionFish.createController({transport,player});await c.init();c.feed(message('第一句。第二句。第三句。'));
  await until(()=>c.health().phase==='error');assert.equal(c.health().cached,0);assert.equal(c.health().pending,0);assert.equal(c.health().speaking,false);assert.equal(calls,2);assert(aborted);c.dispose();
});


test('Source citation badges are excluded from speech while ordinary link labels and body references remain',()=>{
  assert.equal(cleanMarkdown('空气不健康。\uE200cite\uE202turn0search0\uE202turn0search1\uE201 今天注意防护。'), '空气不健康。 今天注意防护。');
  assert.equal(cleanMarkdown('正文\uE200filecite\uE202turn1file0\uE201。'), '正文。');
  assert.equal(cleanMarkdown('事实【turn0search0†Air Index Today】。'), '事实。');
  assert.equal(cleanMarkdown('请看[普通链接](https://example.com)，正文提到 reference_id。'), '请看普通链接，正文提到 referenceid。');
  assert.equal(cleanMarkdown('完整正文。\uE200cite\uE202turn0search'), '完整正文。');
});
test('Citations split across streaming increments do not create API sentences or replay the body',()=>{
  const tracker=new SentenceTracker();
  for(const tail of ['\uE200','\uE200c','\uE200ci','\uE200cit','\uE200cite','\uE200cite\uE202turn0search0']){
    assert.deepEqual(tracker.feed(message('第一句。'+tail)),tail==='\uE200'?['第一句。']:[]);
  }
  assert.deepEqual(tracker.feed(message('第一句。\uE200cite\uE202turn0search0\uE201第二句。')),['第二句。']);
  assert.deepEqual(tracker.feed(message('第一句。\uE200cite\uE202turn0search0\uE201第二句。',true)),[]);
  const embedded=new SentenceTracker();assert.deepEqual(embedded.feed(message('空气质量\uE200cite\uE202turn0search0')),[]);
  assert.deepEqual(embedded.feed(message('空气质量\uE200cite\uE202turn0search0\uE201不健康。')),['空气质量不健康。']);
});
test('Local Fish request strips citations without altering voice reference_id',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'live2d-fish-citation-'));let body;
  const host=new FishHost({configPath:path.join(dir,'config.json'),fetchImpl:async(url,options)=>{body=JSON.parse(options.body);return new Response(Uint8Array.of(1,2,3));}});
  await host.save({enabled:true,apiKey:'test-only-not-real-key',referenceId:'test_voice',model:'s2.1-pro-free'});
  await host.tts('天气提示\uE200cite\uE202turn0search0\uE201：注意防护。','owner','citation');
  assert.equal(body.text,'天气提示：注意防护。');assert.equal(body.reference_id,'test_voice');
});


test('Actual desktop reference directives are removed before Markdown cleanup and sentence splitting',()=>{
  assert.equal(cleanMarkdown('今天空气不健康。:chatgpt-content-reference{index="0"}请戴口罩。'), '今天空气不健康。请戴口罩。');
  assert.equal(cleanMarkdown('这是结论:chatgpt-content-reference{index="1"}。'), '这是结论。');
  assert.equal(cleanMarkdown('正文。:chatgpt-content-reference{index="0"}\n:chatgpt-content-reference{index="2"}'), '正文。');
  assert.equal(cleanMarkdown('普通文本 reference 和 reference_id 仍是正文。'), '普通文本 reference 和 referenceid 仍是正文。');
  const t=new SentenceTracker();
  for(const tail of [':',':c',':chatgpt',':chatgpt-content-ref',':chatgpt-content-reference',':chatgpt-content-reference{',':chatgpt-content-reference{index="']){
    assert.deepEqual(t.feed(message('今天空气不健康。'+tail)),tail===':'?['今天空气不健康。']:[]);
  }
  assert.deepEqual(t.feed(message('今天空气不健康。:chatgpt-content-reference{index="0"}下一句。')),['下一句。']);
  assert.deepEqual(t.feed(message('今天空气不健康。:chatgpt-content-reference{index="0"}下一句。',true)),[]);
});
test('Actual reference directives never enter the Fish API JSON text, including unfinished directives',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'live2d-fish-directive-'));const requests=[];
  const host=new FishHost({configPath:path.join(dir,'config.json'),fetchImpl:async(url,options)=>{requests.push(JSON.parse(options.body));return new Response(Uint8Array.of(1,2,3));}});
  await host.save({enabled:true,apiKey:'test-only-not-real-key',referenceId:'test_voice',model:'s2.1-pro-free'});
  await host.tts('今天预计大部分时间都处于不健康水平。:chatgpt-content-reference{index="1"}','owner','directive');
  await host.tts('需要防护。:chatgpt-content-reference{index="','owner','partial');
  assert.deepEqual(requests.map(r=>r.text),['今天预计大部分时间都处于不健康水平。','需要防护。']);
  assert(requests.every(r=>r.reference_id==='test_voice'));
});

test('Speaker disable immediately aborts playback and prefetch, sends nothing while muted, resumes only future text',async()=>{
  let saved={...cfg},playing=false;const requests=[],signals=[],saveGate=deferred(),future=deferred(),audioEnd=deferred();
  const transport=async(op,data,signal)=>{
    if(op==='config')return saved;
    if(op==='save'){if(!data.config.enabled)await saveGate.promise;saved={...saved,...data.config};return saved;}
    requests.push(data.text);signals.push(signal);return requests.length===2?future.promise:{audio:data.text};
  };
  const player={ready:()=>true,unlock:async()=>true,mouth:()=>playing?.5:0,stop(){if(playing)audioEnd.resolve();playing=false;},dispose(){},async play(){playing=true;await audioEnd.promise;playing=false;}};
  const c=CompanionFish.createController({transport,player});await c.init();c.feed(message('第一句。第二句。第三句。'));
  await until(()=>playing&&requests.length===2);
  const muting=c.enable(false);assert.equal(c.health().enabled,false);assert.equal(c.health().speaking,false);assert.equal(c.health().pending,0);assert(signals.every(s=>s.aborted));
  c.feed(message('第一句。第二句。第三句。禁用期间的句子。'));await wait(5);assert.equal(requests.length,2);
  saveGate.resolve();assert(await muting);future.resolve({audio:'第二句。'});await wait(5);assert.equal(c.health().cached,0);
  await c.test();c.feed(message('第一句。第二句。第三句。禁用期间的句子。更多禁用正文。'));await wait(5);assert.equal(requests.length,2);assert.equal(saved.enabled,false);
  assert(await c.enable(true));c.feed(message('第一句。第二句。第三句。禁用期间的句子。更多禁用正文。重新启用后的正文。',true));
  await until(()=>requests.length===3);assert.deepEqual(requests,['第一句。','第二句。','重新启用后的正文。']);assert.equal(saved.enabled,true);c.dispose();
});
test('Mute remains effective on a failed preference save; enabling without configuration sends no requests',async()=>{
  const requests=[];
  const player={ready:()=>true,unlock:async()=>true,mouth:()=>0,stop(){},dispose(){},async play(){}};
  const transport=async(op,data)=>{if(op==='config')return cfg;if(op==='save')throw new Error('save failed');requests.push(data.text);return {audio:data.text};};
  const c=CompanionFish.createController({transport,player});await c.init();assert.equal(await c.enable(false),false);assert.equal(c.health().enabled,false);
  c.feed(message('必须保持禁用。'));await c.test();await wait(5);assert.deepEqual(requests,[]);c.dispose();
  const unconfigured=CompanionFish.createController({player,transport:async(op,data)=>op==='config'?{...cfg,enabled:false,configured:false,hasKey:false}:(requests.push(op),{})});
  await unconfigured.init();assert.equal(await unconfigured.enable(true),false);unconfigured.feed(message('未配置时不请求。'));assert.equal(unconfigured.health().enabled,false);assert.deepEqual(requests,[]);unconfigured.dispose();
});
test('Local Fish service rejects synthesis while disabled and remembers the toggle across reload',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'live2d-fish-toggle-'));let requests=0;const configPath=path.join(dir,'config.json');
  const fetchImpl=async()=>{requests++;return new Response(Uint8Array.of(1,2,3));};
  const host=new FishHost({configPath,fetchImpl});await host.save({enabled:false,apiKey:'test-only-not-real-key',referenceId:'test_voice',model:'s2.1-pro-free',rememberKey:true});
  await assert.rejects(host.tts('禁用时不请求。','owner','disabled'),/朗读已关闭/);assert.equal(requests,0);
  const reload=new FishHost({configPath,fetchImpl});await reload.loading;assert.equal(reload.publicConfig().enabled,false);assert.equal(reload.publicConfig().configured,true);
  await assert.rejects(reload.tts('重载后仍禁用。','owner','disabled'),/朗读已关闭/);assert.equal(requests,0);
  await reload.save({...reload.publicConfig(),enabled:true});await reload.tts('启用后正常。','owner','enabled');assert.equal(requests,1);
});
