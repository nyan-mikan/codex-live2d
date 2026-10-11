import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CDP,targets,isCodexMain} from './cdp.mjs';
import {findEndpoint} from './endpoint.mjs';
import {FishHost} from './fish-host.mjs';
import {modelStatus,sampleModel,retryDelay} from './model-health.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
let port=19335;
const watch=args.includes('--watch'),remove=args.includes('--remove'),verify=args.includes('--verify'),show=args.includes('--show'),reload=args.includes('--reload');
const modelDir=path.join(root,'model');
const types={'.json':'application/json','.png':'image/png','.moc':'application/octet-stream','.mtn':'text/plain','.wav':'audio/wav'};
export async function assets() {
  const result={};
  async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())await walk(p);else if(types[path.extname(p)])result[path.relative(modelDir,p).split(path.sep).join('/')]={type:types[path.extname(p)],data:(await fs.readFile(p)).toString('base64')};}}
  await walk(modelDir);return result;
}
export async function payload() {
  const libraries=await Promise.all(['vendor/pixi.min.js','vendor/unsafe-eval.min.js','vendor/live2d.min.js','vendor/cubism2.min.js','vendor/marked.umd.js','speech-text.js','i18n.js','fish-client.js','model-profile.js','view-state.js','renderer.js'].map(p=>fs.readFile(path.join(root,p),'utf8')));
  return libraries.join('\n;\n')+'\n;globalThis.mountCompanion('+JSON.stringify(await assets())+');';
}
if (process.argv[1]===fileURLToPath(import.meta.url)) {
  const portIndex=args.indexOf('--port');
  port=portIndex>=0?Number(args[portIndex+1]):(await findEndpoint())?.port??19335;
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid CDP port');
  await fs.mkdir(path.join(root,'state'),{recursive:true});
  const stopFile=path.join(root,'state','stop');
  const code=remove||verify?null:await payload();
  const bridgeCode=remove||verify?null:(await Promise.all(['view-state.js','page-bridge.js','answer-bridge.js'].map(file=>fs.readFile(path.join(root,file),'utf8')))).join('\n;\n');
  let announced=false, lastError='', noTargets=true;
  const attempts=new Map(),progress=new Map();
  async function heartbeat(reports){
    const file=path.join(root,'state','watcher-health.json');
    await fs.writeFile(file+'.tmp',JSON.stringify({pid:process.pid,checkedAt:new Date().toISOString(),targets:reports})+'\n',{mode:0o600});
    await fs.rename(file+'.tmp',file);
  }
  const fish=remove||verify?null:new FishHost(),connections=new Map();
  process.on('SIGTERM',()=>process.exit(0));process.on('SIGINT',()=>process.exit(0));
  do {
    if(watch){try{await fs.access(stopFile);break;}catch{}}
    const pages=(await targets(port)).filter(isCodexMain);noTargets=pages.length===0;
    const reports=[];
    for(const id of attempts.keys())if(!pages.some(page=>page.id===id)){attempts.delete(id);progress.delete(id);}
    for(const [id,c] of connections)if(!pages.some(p=>p.id===id)||c.session.closed){c.detach?.();c.session.close();connections.delete(id);}
    for(const target of pages){let session;
      try{
        let connection=connections.get(target.id);
        if(!connection){session=new CDP(target,{timeoutMs:10000});await session.open();connection={session};if(watch)connections.set(target.id,connection);}else session=connection.session;
        const world=await session.world();
        if(fish&&connection.world!==world){connection.detach?.();connection.detach=await fish.attach(session,world);connection.world=world;await fish.loading;await session.evaluate('globalThis.__codexCompanion?.speechHostReady?.('+JSON.stringify(fish.publicConfig())+');true',world);}
        const health=await session.evaluate('globalThis.__codexCompanion?.closed ? {ready:false,closed:true} : globalThis.__codexCompanion?.health() ?? null',world);
        const snapshot=await sampleModel(session,world,{apiName:'__codexCompanion',pixels:verify});
        let status=modelStatus(snapshot,progress.get(target.id));
        progress.set(target.id,status.progress);
        const attempt=attempts.get(target.id)||{count:0,nextAt:0};
        if(watch&&status.healthy&&Date.now()-(connection.pixelCheckedAt||0)>15000){
          connection.pixelCheckedAt=Date.now();
          const pixelSample=await sampleModel(session,world,{apiName:'__codexCompanion',pixels:true});
          status=modelStatus(pixelSample,progress.get(target.id));progress.set(target.id,status.progress);
        }
        if(remove){await session.evaluate('globalThis.__codexCompanion?.destroy();true',world);await session.evaluate('globalThis.__codexCompanionAnswerBridge?.stop();globalThis.__codexCompanionPageBridge?.stop();true');console.log('Removed from',target.id);}
        else if(verify){console.log(JSON.stringify({target:target.id,health,answerBridge:await session.evaluate('globalThis.__codexCompanionAnswerBridge?.health() ?? null'),pixels:await session.evaluate('globalThis.__codexCompanion?.pixels() ?? null',world)}));if(!status.healthy)process.exitCode=1;}
        else if(reload||(!status.healthy&&Date.now()>=attempt.nextAt)){
          if(watch)await heartbeat([...reports,{id:target.id,healthy:false,reason:'loading',loadingUntil:Date.now()+60000}]);
          if(health)await session.evaluate('globalThis.__codexCompanion?.destroy()',world);const mounted=await session.evaluate(code,world,{timeoutMs:60000});console.log(JSON.stringify({mounted,target:target.id}));announced=true;
          const checked=await sampleModel(session,world,{apiName:'__codexCompanion',pixels:true});
          status=modelStatus(checked,{},Date.now());progress.set(target.id,status.progress);
          if(!status.healthy)throw new Error('Model verification failed: '+status.reason);}
        else if(show&&health.collapsed){await session.evaluate('globalThis.__codexCompanion.setVisible(true)',world);console.log(JSON.stringify({target:target.id,health:await session.evaluate('globalThis.__codexCompanion.health()',world)}));}
        else if(!watch)console.log(JSON.stringify({target:target.id,health}));
        if(!remove&&!verify){const bridge=await session.evaluate('globalThis.__codexCompanionAnswerBridge?.health() ?? null');const pageBridge=await session.evaluate('globalThis.__codexCompanionPageBridge?.health() ?? null');if(!bridge||bridge.stopped||!pageBridge||pageBridge.stopped)await session.evaluate(bridgeCode);}
        if(status.healthy){attempts.delete(target.id);}
        reports.push({id:target.id,healthy:status.healthy,reason:status.reason,frames:status.progress.frames});
        if(health?.ready&&!announced){console.log('Companion watcher connected');announced=true;}
      }catch(error){
        const previous=attempts.get(target.id)||{count:0};const count=previous.count+1;
        attempts.set(target.id,{count,nextAt:Date.now()+retryDelay(count)});
        reports.push({id:target.id,healthy:false,reason:'injection-failed',retryInMs:retryDelay(count)});
        const message=error.message;if(message!==lastError){console.error(message);lastError=message;}
        const connection=connections.get(target.id);connection?.detach?.();connections.delete(target.id);session?.close();
        if(!watch)process.exitCode=1;
      }finally{if(!watch)session?.close();}
    }
    if(!watch&&noTargets){console.error(`No Codex main renderer on loopback port ${port}. Start with Start.command.`);process.exitCode=1;}
    if(watch){
      await heartbeat(reports);
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
  }while(watch);
  for(const c of connections.values()){c.detach?.();c.session.close();}
}
