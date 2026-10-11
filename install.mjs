import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {checkAssets} from './setup.mjs';

const execute=promisify(execFile),root=path.dirname(fileURLToPath(import.meta.url));
export async function installDesktop({run=execute,validate=checkAssets,platform=process.platform,nodeMajor=Number(process.versions.node.split('.')[0])}={}){
  if(platform!=='darwin')throw new Error('Desktop installation supports macOS only.');
  if(nodeMajor<22)throw new Error('Node.js 22 or later is required.');
  // Build the launch entry and activate without interrupting a running application.
  await validate();
  const launcher=JSON.parse((await run(process.execPath,[path.join(root,'install-launcher.mjs')],{maxBuffer:1024*1024})).stdout.trim());
  if(!launcher.installed)throw new Error('Desktop launcher installation was not confirmed.');
  const activation=await run(process.execPath,[path.join(root,'control.mjs'),'start'],{maxBuffer:1024*1024});
  const result=await run(process.execPath,[path.join(root,'install-recovery.mjs')],{maxBuffer:1024*1024});
  const status=JSON.parse(result.stdout.trim());
  if(!status.installed||!status.registered)throw new Error('Automatic recovery registration was not confirmed.');
  return {...status,launcherPath:launcher.launcherPath,pending:activation.stdout.includes('Next time, open Codex Live2D.app.')};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    const status=await installDesktop();
    console.log('Installed without automatically quitting Codex. / 安装完成，未自动退出 Codex。');
    console.log('Pin this launcher to Dock: / 请把这个启动器固定到 Dock:',status.launcherPath);
    if(status.pending)console.log('The current app has no model connection. Finish your work, quit it yourself, then open the new launcher. / 当前应用缺少模型入口，请结束工作后手动退出，再使用新启动器打开。');
  }catch(error){console.error('Installation incomplete / 安装未完成:',error.message);process.exitCode=1;}
}
