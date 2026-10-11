import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {checkAssets} from './setup.mjs';

const execute=promisify(execFile),root=path.dirname(fileURLToPath(import.meta.url));
export async function installDesktop({run=execute,validate=checkAssets,platform=process.platform,nodeMajor=Number(process.versions.node.split('.')[0])}={}){
  if(platform!=='darwin')throw new Error('Desktop installation supports macOS only.');
  if(nodeMajor<22)throw new Error('Node.js 22 or later is required.');
  // The login service observes ordinary official-app launches from any entry point.
  await validate();
  const result=await run(process.execPath,[path.join(root,'install-recovery.mjs')],{maxBuffer:1024*1024});
  const status=JSON.parse(result.stdout.trim());
  if(!status.installed||!status.registered)throw new Error('Automatic recovery registration was not confirmed.');
  return {...status,automaticRestart:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    const status=await installDesktop();
    console.log('Automatic startup recovery installed. / 已安装自动启动恢复。');
    console.log('Open the original Codex from Dock, Finder, Spotlight or a link. Without a model connection, it will normally restart once after ten seconds. / 照常打开原 Codex；缺少模型连接时，启动约十秒后会正常重启一次并挂载。');
  }catch(error){console.error('Installation incomplete / 安装未完成:',error.message);process.exitCode=1;}
}
