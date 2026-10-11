import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {appPath,appInfo} from './app-config.mjs';
import {appRunning} from './app-process.mjs';
const execute=promisify(execFile),root=path.dirname(fileURLToPath(import.meta.url));
export async function launchCompanion({run=execute,info=appInfo,running=appRunning}={}){
  const {executable}=await info();
  // Focus an existing app first; never spawn another instance or request a quit.
  if(await running(executable))await run('/usr/bin/open',['-a',appPath]);
  return run(process.execPath,[path.join(root,'control.mjs'),'start','--focus'],{maxBuffer:1024*1024,timeout:120000});
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const state=path.join(root,'state'),lock=path.join(state,'launcher.lock');
  await fs.mkdir(state,{recursive:true});
  let acquired=false;
  try{
    for(let attempt=0;attempt<2;attempt++){
      try{await fs.mkdir(lock);acquired=true;break;}
      catch(error){
        if(error.code!=='EEXIST')throw error;
        // Another click during startup must not race the activation process.
        const entry=await fs.readFile(path.join(lock,'owner.json'),'utf8').then(JSON.parse,()=>null);
        if(!entry){const stat=await fs.stat(lock);if(Date.now()-stat.mtimeMs<5000)process.exit(0);}
        if(entry?.pid){
          const active=await execute('/bin/ps',['-p',String(entry.pid),'-o','args=']).then(result=>result.stdout.trim()===process.execPath+' '+path.join(root,'launch.mjs'),()=>false);
          if(active)process.exit(0);
        }
        await fs.rm(lock,{recursive:true,force:true});
      }
    }
    if(!acquired)throw new Error('Launcher is busy.');
    await fs.writeFile(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid,createdAt:Date.now()}));
    const result=await launchCompanion();
    await fs.writeFile(path.join(state,'desktop-launch.log'),result.stdout+'\n',{mode:0o600});
  }catch(error){
    await fs.writeFile(path.join(state,'desktop-launch.log'),(error.stderr||error.message)+'\n',{mode:0o600});process.exitCode=1;
  }finally{if(acquired)await fs.rm(lock,{recursive:true,force:true});}
}
