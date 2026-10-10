// Bounded, local verification of the next answer. Saves counts only, never body text.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {CDP,targets,isCodexMain} from './cdp.mjs';
const output=fileURLToPath(new URL('./state/live-stream-verification.json',import.meta.url));
const started=Date.now(),deadline=started+120000;
let s,observations=[],lastAt=started,error=null;
const save=async status=>{
  const streaming=observations.filter(x=>!x.completed&&x.characters>0);
  const growing=streaming.some((x,i)=>i>0&&x.characters>streaming[i-1].characters);
  await fs.writeFile(output,JSON.stringify({checkedAt:new Date().toISOString(),status,realStreamingObserved:growing,streamingUpdates:streaming.length,observations,error},null,2));
  return growing;
};
try{
  s=await new CDP((await targets(19335)).find(isCodexMain)).open();
  await save('monitoring');console.log('本机正文增量计数验证已启动（最多 120 秒，不保存正文）。');
  while(Date.now()<deadline){
    const h=await s.evaluate('globalThis.__codexCompanionAnswerBridge?.health()');
    for(const sample of h?.samples??[])if(sample.at>lastAt)observations.push(sample);
    if(observations.length)lastAt=observations.at(-1).at;
    const growing=await save('monitoring');
    if(growing&&observations.at(-1)?.completed){await save('complete');break;}
    await new Promise(r=>setTimeout(r,200));
  }
  if(Date.now()>=deadline)await save('timeout');
}catch(e){error=e.message;await save('error');}finally{s?.close();}
