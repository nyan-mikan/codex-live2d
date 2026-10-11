import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {targets,isCodexMain} from './cdp.mjs';
import {recoveryDecision} from './recovery-policy.mjs';
import {watcherStatus} from './model-health.mjs';
import {appProcessIds} from './app-process.mjs';
import {appInfo as readAppInfo} from './app-config.mjs';

const execute=promisify(execFile),root=path.dirname(fileURLToPath(import.meta.url));
const stateDir=path.join(root,'state');
const readJSON=async name=>{try{return JSON.parse(await fs.readFile(path.join(stateDir,name),'utf8'));}catch{return {};}};
const exists=async name=>fs.access(path.join(stateDir,name)).then(()=>true,()=>false);
const writeJSON=async(name,value)=>{const file=path.join(stateDir,name);await fs.writeFile(file+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});await fs.rename(file+'.tmp',file);};
async function appInfo(){
  try{
    const {version,executable}=await readAppInfo();
    const pids=await appProcessIds(executable);
    return {version,running:pids.length>0,pid:pids[0]??null};
  }catch{return {version:null,running:false};}
}
async function watcherAlive(){
  const {pid}=await readJSON('watcher.json');if(!Number.isInteger(pid))return false;
  try{
    const {stdout}=await execute('/bin/ps',['-p',String(pid),'-o','command=']);
    return stdout.includes(path.join(root,'inject.mjs'))&&stdout.includes('--watch')?pid:false;
  }catch{return false;}
}
await fs.mkdir(stateDir,{recursive:true});
let stopping=false,lastAction='';
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
while(!stopping){
  try{
    const info=await appInfo(),baseline=await readJSON('debug-version.json');
    const state=await readJSON('recovery-state.json');
    if(baseline.version)state.lastDebugVersion=baseline.version;
    const watcherPid=await watcherAlive(),heartbeat=await readJSON('watcher-health.json');
    const model=watcherStatus(heartbeat,watcherPid);
    const launchLock=await readJSON('launcher.lock/owner.json');
    const lockRecent=Number.isInteger(launchLock.pid)&&Date.now()-launchLock.createdAt>=0&&Date.now()-launchLock.createdAt<120000;
    const launcherBusy=lockRecent&&(await execute('/bin/ps',['-p',String(launchLock.pid),'-o','args=']).then(result=>result.stdout.trim()===process.execPath+' '+path.join(root,'launch.mjs'),()=>false));
    const observation={...info,launcherBusy,disabled:await exists('recovery-disabled'),debugReady:info.running&&(await targets(19335)).some(isCodexMain),watcherAlive:!!watcherPid,modelHealthy:model.healthy,modelLoading:model.loading===true,now:Date.now()};
    const decision=recoveryDecision(state,observation);
    await writeJSON('recovery-state.json',decision.state);
    const failure=decision.state.failure?.version===info.version?decision.state.failure:null;
    await writeJSON('recovery-status.json',{checkedAt:new Date().toISOString(),version:info.version,running:info.running,debugReady:observation.debugReady,modelHealthy:model.healthy,modelReason:model.reason,disabled:observation.disabled,action:failure&&decision.action==='already-attempted'?'waiting-for-user-quit':decision.action,...(failure?{reason:failure.reason}: {})});
    if(decision.action!==lastAction){console.log(new Date().toISOString(),decision.action,info.version??'app-unavailable');lastAction=decision.action;}
    if(['start-watcher','repair-watcher'].includes(decision.action)){
      // Recovery only reattaches the model. It never quits or reopens the application.
      const args=[path.join(root,'control.mjs'),'start','--from-recovery'];
      try{
        await execute(process.execPath,args,{timeout:180000,maxBuffer:1024*1024});
        // Record the launcher's resulting PID so our own relaunch cannot reset the retry guard.
        const current=await appInfo();
        if(current.pid)decision.state.lastSeenPid=current.pid;
        delete decision.state.failure;
        await writeJSON('recovery-state.json',decision.state);
        const {phase}=await readJSON('launcher-status.json');
        console.log(new Date().toISOString(),phase==='cancelled-user-quit'?'recovery-cancelled':'recovery-complete',info.version);
      }catch(error){
        const current=await appInfo();
        if(current.pid)decision.state.lastSeenPid=current.pid;
        const {phase}=await readJSON('launcher-status.json');
        const reason=phase==='cancelled-user-quit'?'用户已退出应用，恢复已取消。':phase==='waiting-for-quit'||phase==='quit-blocked'?'Codex 未完成正常退出；请结束任务，并确认 Codex 的退出提示，然后重新打开应用。':phase==='requesting-quit'?'macOS 未完成退出请求；请手动运行Start.command，并允许控制应用。':phase==='opening'?'应用未出现可连接的调试入口；请手动运行Start.command。':'模型挂载未完成；请手动运行Start.command。';
        decision.state.failure={version:info.version,reason,phase,failedAt:new Date().toISOString()};
        await writeJSON('recovery-state.json',decision.state);
        console.error(new Date().toISOString(),'recovery-failed',error.code??'launcher-error',phase??'unknown');
        await writeJSON('recovery-status.json',{checkedAt:new Date().toISOString(),version:info.version,action:'failed',reason});
      }
    }
  }catch(error){console.error(new Date().toISOString(),'monitor-error',error.code??'state-error');}
  if(!stopping)await new Promise(resolve=>setTimeout(resolve,2000));
}
