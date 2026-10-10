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
