import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);

// Match the actual app executable, excluding helpers and commands mentioning it.
export function appPids(processList,executable){
  return processList.split('\n').flatMap(line=>{
    const match=/^\s*(\d+)\s+(.+)$/.exec(line);if(!match)return [];
    return match[2].trim()===executable?[Number(match[1])]:[];
  });
}
export async function appProcessIds(executable){
  const {stdout}=await execute('/bin/ps',['-ww','-axo','pid=,comm='],{maxBuffer:8*1024*1024});
  return appPids(stdout,executable);
}
export async function appRunning(executable){return (await appProcessIds(executable)).length>0;}

// Match only this project's watcher, regardless of the selected debug port.
export function watcherPids(processList,node,entry){
  const prefix=node+' '+entry+' --watch --port ';
  return processList.split('\n').flatMap(line=>{
    const match=/^\s*(\d+)\s+(.+)$/.exec(line);
    if(!match||!match[2].startsWith(prefix))return [];
    const suffix=match[2].slice(prefix.length);
    return /^\d+$/.test(suffix)&&Number(suffix)>=1024&&Number(suffix)<=65535?[Number(match[1])]:[];
  });
}
