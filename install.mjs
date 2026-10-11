import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {checkAssets} from './setup.mjs';

const execute=promisify(execFile),root=path.dirname(fileURLToPath(import.meta.url));
export async function installDesktop({run=execute,validate=checkAssets,platform=process.platform,nodeMajor=Number(process.versions.node.split('.')[0])}={}){
  if(platform!=='darwin')throw new Error('Desktop installation supports macOS only.');
  if(nodeMajor<22)throw new Error('Node.js 22 or later is required.');
  // Validate before requesting any app quit; register recovery only after a verified activation.
  await validate();
  await run(process.execPath,[path.join(root,'control.mjs'),'start','--restart'],{maxBuffer:1024*1024});
  const result=await run(process.execPath,[path.join(root,'install-recovery.mjs')],{maxBuffer:1024*1024});
  const status=JSON.parse(result.stdout.trim());
  if(!status.installed||!status.registered)throw new Error('Automatic recovery registration was not confirmed.');
  return status;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    await installDesktop();
    console.log('Installed: companion activated and automatic recovery registered. / 安装完成：模型已启用，自动恢复服务已注册。');
    console.log('Open Codex through Dock, Finder, Spotlight, a terminal, or a link. / 以后可从 Dock、Finder、Spotlight、终端或链接打开 Codex。');
    console.log('If startup flags are missing, recovery begins after about 10–15 seconds and normally reopens the app once; rendering checks and remount retries continue afterward. Wait for the model before starting work. / 若加载参数缺失，约10–15秒后开始恢复并正常重开一次，之后持续验证渲染并重试挂载；请等模型出现再开始工作。');
  }catch(error){console.error('Installation incomplete / 安装未完成:',error.message);process.exitCode=1;}
}
