import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {appPath} from './app-config.mjs';

const execute=promisify(execFile),root=path.dirname(fileURLToPath(import.meta.url)),stateDir=path.join(root,'state');
const label='com.codex-live2d.recovery',agentDir=path.join(os.homedir(),'Library','LaunchAgents'),agentPath=path.join(agentDir,label+'.plist');
const xml=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function agentPlist(node,workspace,application=appPath){
  const entry=(key,value)=>`<key>${key}</key><string>${xml(value)}</string>`;
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n'+entry('Label',label)+'\n<key>ProgramArguments</key><array><string>'+xml(node)+'</string><string>'+xml(path.join(workspace,'recovery.mjs'))+'</string></array>\n'+entry('WorkingDirectory',workspace)+'\n<key>EnvironmentVariables</key><dict>'+entry('CODEX_APP_PATH',application)+'</dict>\n<key>RunAtLoad</key><true/>\n<key>KeepAlive</key><true/>\n<key>ThrottleInterval</key><integer>30</integer>\n'+entry('LimitLoadToSessionType','Aqua')+'\n'+entry('StandardOutPath',path.join(workspace,'state','recovery.log'))+'\n'+entry('StandardErrorPath',path.join(workspace,'state','recovery.log'))+'\n</dict></plist>\n';
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--uninstall')){
    await fs.mkdir(stateDir,{recursive:true});await fs.writeFile(path.join(stateDir,'recovery-disabled'),'disabled\n');
    await execute('/bin/launchctl',['bootout',`gui/${process.getuid()}/${label}`]).catch(()=>{});
    await fs.unlink(agentPath).catch(error=>{if(error.code!=='ENOENT')throw error;});
    console.log(JSON.stringify({uninstalled:true,label}));process.exit(0);
  }
  const dry=process.argv.includes('--dry-run');
  await fs.mkdir(stateDir,{recursive:true});
  const plist=agentPlist(process.execPath,root),preview=path.join(stateDir,'recovery-agent.plist');
  await fs.writeFile(preview,plist);await execute('/usr/bin/plutil',['-lint',preview]);
  if(dry){console.log(JSON.stringify({preview,installPath:agentPath,label,behavior:'已启用模型后，从Dock普通启动或更新后调试入口丢失时，等待45秒再正常重启恢复；主动退出不启动应用。'}));}
  else{
    const i=process.argv.indexOf('--previous-version'),previous=i>=0?process.argv[i+1]:null;
    if(previous&&!/^[0-9.]+$/.test(previous))throw new Error('Invalid previous version');
    const baseline=path.join(stateDir,'debug-version.json');
    if(previous)try{await fs.writeFile(baseline,JSON.stringify({version:previous,source:'previous-working-install'},null,2)+'\n',{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
    await fs.mkdir(agentDir,{recursive:true});await fs.writeFile(agentPath,plist,{mode:0o600});
    const service=`gui/${process.getuid()}/${label}`;
    await execute('/bin/launchctl',['bootout',service]).catch(()=>{});
    // launchd may retain the old registration briefly while its process exits.
    for(let attempt=0;attempt<30;attempt++){
      const registered=await execute('/bin/launchctl',['print',service]).then(()=>true,()=>false);
      if(!registered)break;await new Promise(resolve=>setTimeout(resolve,1000));
    }
    await fs.unlink(path.join(stateDir,'recovery-disabled')).catch(()=>{});
    for(let attempt=0;;attempt++){
      try{await execute('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,agentPath]);break;}
      catch(error){if(error.code!==5||attempt>=4)throw error;await new Promise(resolve=>setTimeout(resolve,1000));}
    }
    const status=(await execute('/bin/launchctl',['print',service])).stdout;
    await fs.writeFile(path.join(stateDir,'recovery-installation.json'),JSON.stringify({installedAt:new Date().toISOString(),label,agentPath,node:process.execPath,registered:status.includes(label)},null,2)+'\n');
    console.log(JSON.stringify({installed:true,label,agentPath,registered:status.includes(label)}));
  }
}
