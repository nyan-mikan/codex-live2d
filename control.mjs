import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {targets,isCodexMain} from './cdp.mjs';
import {appRunning,watcherPids} from './app-process.mjs';
import {appPath,appInfo} from './app-config.mjs';
import {findEndpoint} from './endpoint.mjs';
import {checkAssets} from './setup.mjs';
const execute=promisify(execFile);
const root=path.dirname(fileURLToPath(import.meta.url)), stateDir=path.join(root,'state');
const command=process.argv[2]||'start', restart=process.argv.includes('--restart');
const fromRecovery=process.argv.includes('--from-recovery');
if(process.argv.includes('--delayed'))await new Promise(resolve=>setTimeout(resolve,4000));
const app=appPath;
const endpoint=await findEndpoint();
let port=endpoint?.port??19335;
await fs.mkdir(stateDir,{recursive:true});
const stopFile=path.join(stateDir,'stop'),pidFile=path.join(stateDir,'watcher.json');
async function stopWatcher(){
  await fs.writeFile(stopFile,'stop\n');
  const {stdout}=await execute('/bin/ps',['-ww','-axo','pid=,args='],{maxBuffer:8*1024*1024});
  const pids=watcherPids(stdout,process.execPath,path.join(root,'inject.mjs'));
  // Stop only watchers belonging to this checkout; a blocked CDP request must not leave duplicates.
  for(const pid of pids)try{process.kill(pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
  for(let attempt=0;attempt<20;attempt++){
    const alive=pids.some(pid=>{try{process.kill(pid,0);return true;}catch{return false;}});
    if(!alive)return;await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Previous model watcher did not stop; another watcher was not started.');
}
async function checkRecovery(){if(fromRecovery&&await fs.access(path.join(stateDir,'recovery-disabled')).then(()=>true,()=>false))throw new Error('自动恢复已关闭。');}
async function launchPhase(phase){await fs.writeFile(path.join(stateDir,'launcher-status.json'),JSON.stringify({phase,checkedAt:new Date().toISOString()},null,2)+'\n');}
if(command==='remove'){
  await fs.writeFile(path.join(stateDir,'recovery-disabled'),'disabled\n');
  await stopWatcher();
  try{const r=await execute(process.execPath,[path.join(root,'inject.mjs'),'--remove','--port',String(port)]);console.log(r.stdout);}catch(error){console.log(error.stderr||error.message);}
  console.log('已关闭角色并停止守护进程。正常退出后再打开 ChatGPT，可关闭临时调试接口。');
}else if(command==='start'){
  if(process.argv.includes('--focus')&&endpoint){
    await fs.unlink(path.join(stateDir,'recovery-disabled')).catch(()=>{});
    const saved=await fs.readFile(pidFile,'utf8').then(JSON.parse,()=>null);
    if(saved?.pid&&saved.port===port){const {stdout}=await execute('/bin/ps',['-p',String(saved.pid),'-o','args=']).catch(()=>({stdout:''}));if(stdout.trim()===process.execPath+' '+path.join(root,'inject.mjs')+' --watch --port '+port){await launchPhase('ready');process.exit(0);}}
  }
  if(process.platform!=='darwin')throw new Error('Desktop activation supports macOS only.');
  await checkAssets();
  await launchPhase('checking');
  await checkRecovery();
  if(!fromRecovery)await fs.unlink(path.join(stateDir,'recovery-disabled')).catch(()=>{});
  let pages=endpoint?.pages??[];
  if(!pages.length){
    const {executable,bundleId}=await appInfo();
    const running=await appRunning(executable);
    if(fromRecovery&&!running){await launchPhase('cancelled-user-quit');process.exit(0);}
    if(running&&(!restart||fromRecovery)){
      await launchPhase('waiting-for-user-launch');
      console.log('Codex is already running without the model connection. It was left running. Next time, open Codex Live2D.app. / Codex 正在运行，已保留当前窗口；下次请从 Codex Live2D.app 打开。');
      process.exit(0);
    }
    if(running){
      await checkRecovery();
      console.log('正在正常退出 ChatGPT，以启用仅本机可用的调试接口…');
      await launchPhase('requesting-quit');
      await execute('/usr/bin/osascript',['-e',`tell application id "${bundleId}" to quit`]);
      await launchPhase('waiting-for-quit');
      let exited=false;
      for(let i=0;i<180;i++){if(!await appRunning(executable)){exited=true;break;}await new Promise(r=>setTimeout(r,500));}
      if(!exited){await launchPhase('quit-blocked');throw new Error('ChatGPT 尚未正常退出；没有强制终止。请保存工作并手动退出后再次启动。');}
    }
    await checkRecovery();
    await launchPhase('opening');
    await execute('/usr/bin/open',['-a',app,'--args',`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1']);
    for(let i=0;i<60;i++){const found=await findEndpoint({preferredPort:port});if(found){port=found.port;pages=found.pages;break;}await new Promise(r=>setTimeout(r,500));}
    if(!pages.length)throw new Error('应用已启动，但未发现可连接的 Codex 主界面调试入口。');
  }
  await launchPhase('injecting');
  await stopWatcher();
  await fs.unlink(stopFile).catch(()=>{});
  await execute(process.execPath,[path.join(root,'inject.mjs'),process.argv.includes('--reload')?'--reload':fromRecovery?'--ensure':'--show','--port',String(port)]);
  const log=await fs.open(path.join(stateDir,'watcher.log'),'a');
  const watcher=spawn(process.execPath,[path.join(root,'inject.mjs'),'--watch','--port',String(port)],{detached:true,stdio:['ignore',log.fd,log.fd]});
  watcher.unref();await log.close();
  await fs.writeFile(pidFile,JSON.stringify({pid:watcher.pid,port,startedAt:new Date().toISOString()},null,2)+'\n');
  const result=await execute(process.execPath,[path.join(root,'inject.mjs'),'--verify','--port',String(port)]);
  await fs.writeFile(path.join(stateDir,'activation.json'),JSON.stringify({activatedAt:new Date().toISOString(),verification:result.stdout.trim()},null,2)+'\n');
  const {version}=await appInfo();
  await fs.writeFile(path.join(stateDir,'debug-version.json'),JSON.stringify({version,confirmedAt:new Date().toISOString()},null,2)+'\n');
  await launchPhase('ready');
  console.log(result.stdout);console.log('角色入口已在主界面右下角启用。点击可打开模型或调整设置；收起后保留打开入口。');
}else throw new Error('Usage: node control.mjs start [--restart] | remove');
