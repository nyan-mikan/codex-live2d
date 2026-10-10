import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
export const appPath=process.env.CODEX_APP_PATH||['/Applications/ChatGPT.app','/Applications/Codex.app'].find(p=>fs.existsSync(p))||'/Applications/ChatGPT.app';
export async function appInfo(){
  if(!path.isAbsolute(appPath))throw new Error('CODEX_APP_PATH must be an absolute application path.');
  const plist=path.join(appPath,'Contents/Info.plist');
  const read=async key=>(await execute('/usr/libexec/PlistBuddy',['-c','Print :'+key,plist])).stdout.trim();
  const [version,name,bundleId]=await Promise.all([read('CFBundleShortVersionString'),read('CFBundleExecutable'),read('CFBundleIdentifier')]);
  if(!/^[A-Za-z0-9.-]+$/.test(bundleId))throw new Error('Invalid app bundle identifier.');
  return {version,bundleId,executable:path.join(appPath,'Contents/MacOS',name)};
}
