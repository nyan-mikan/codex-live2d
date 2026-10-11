import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {appInfo} from './app-config.mjs';
import {appProcessIds} from './app-process.mjs';
import {targets,isCodexMain} from './cdp.mjs';
const execute=promisify(execFile);
export function processDebugPorts(processList,allowedPids){
  const allowed=new Set(allowedPids);
  return processList.split('\n').flatMap(line=>{
    const match=/^\s*(\d+)\s+(.+)$/.exec(line);
    if(!match||!allowed.has(Number(match[1])))return [];
    // Duplicate switches are resolved by Chromium using the last value.
    const switches=[...match[2].matchAll(/(?:^|\s)--remote-debugging-port(?:=|\s+)([^\s]+)/g)];
    const value=switches.at(-1)?.[1];
    if(!value||!/^\d+$/.test(value))return [];
    const port=Number(value);
    return port>=1024&&port<=65535?[{pid:Number(match[1]),port}]:[];
  });
}
export function isLocalCodexTarget(target,port){
  if(!isCodexMain(target))return false;
  try{
    const url=new URL(target.webSocketDebuggerUrl);
    return url.protocol==='ws:'&&['127.0.0.1','[::1]','localhost'].includes(url.hostname)&&Number(url.port)===port;
  }catch{return false;}
}
export async function readDebugProcesses(executable){
  const ids=await appProcessIds(executable);
  if(!ids.length)return [];
  const {stdout}=await execute('/bin/ps',['-ww','-p',ids.join(','),'-o','pid=,args='],{maxBuffer:1024*1024});
  return processDebugPorts(stdout,ids);
}
export async function findEndpoint({executable,preferredPort=19335,read=readDebugProcesses,list=targets}={}){
  if(!executable)executable=(await appInfo()).executable;
  const processes=await read(executable);
  // Probe only ports declared by the actual Codex main process, never a port scan.
  const candidates=[...processes].sort((a,b)=>Number(b.port===preferredPort)-Number(a.port===preferredPort));
  const seen=new Set();
  for(const candidate of candidates){
    if(seen.has(candidate.port))continue;seen.add(candidate.port);
    let pages;
    try{const response=await list(candidate.port);pages=Array.isArray(response)?response.filter(page=>isLocalCodexTarget(page,candidate.port)):[];}catch{continue;}
    if(pages.length)return {...candidate,pages};
  }
  return null;
}
