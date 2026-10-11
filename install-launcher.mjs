import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {appPath,appInfo} from './app-config.mjs';
const execute=promisify(execFile),root=path.dirname(fileURLToPath(import.meta.url));
export const launcherPath=path.join(os.homedir(),'Applications','Codex Live2D.app');
const label='com.codex-live2d.launcher';
export function launcherPlist(){return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${label}</string><key>CFBundleName</key><string>Codex Live2D</string><key>CFBundleDisplayName</key><string>Codex Live2D</string><key>CFBundleExecutable</key><string>CompanionLauncher</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>CFBundleIconFile</key><string>Codex.icns</string><key>LSUIElement</key><true/><key>LSMultipleInstancesProhibited</key><true/><key>NSHighResolutionCapable</key><true/></dict></plist>\n`;}
export function launcherHeader(node,entry,application){
  for(const value of [node,entry,application])if(!path.isAbsolute(value)||/[\r\n\0]/.test(value))throw new Error('Launcher paths must be absolute and contain no newlines.');
  return [['COMPANION_NODE',node],['COMPANION_ENTRY',entry],['COMPANION_APPLICATION',application]].map(([name,value])=>'#define '+name+' '+JSON.stringify(value)).join('\n')+'\n';
}
async function ownLauncher(p){
  const plist=path.join(p,'Contents','Info.plist');
  try{return (await execute('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',plist])).stdout.trim()===label;}catch{return false;}
}
export async function installLauncher(){
  if(process.platform!=='darwin')throw new Error('Launcher installation supports macOS only.');
  await appInfo();
  await fs.mkdir(path.dirname(launcherPath),{recursive:true});
  if(await fs.access(launcherPath).then(()=>true,()=>false)&&!await ownLauncher(launcherPath))throw new Error('Refusing to replace an unrelated application at '+launcherPath);
  const staging=await fs.mkdtemp(path.join(os.tmpdir(),'codex-live2d-launcher-'));
  try{
    const bundle=path.join(staging,'Codex Live2D.app'),contents=path.join(bundle,'Contents'),macos=path.join(contents,'MacOS'),resources=path.join(contents,'Resources');
    await fs.mkdir(macos,{recursive:true});await fs.mkdir(resources,{recursive:true});
    await fs.writeFile(path.join(contents,'Info.plist'),launcherPlist());
    await fs.writeFile(path.join(staging,'launcher-config.h'),launcherHeader(process.execPath,path.join(root,'launch.mjs'),appPath));
    const iconName=(await execute('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIconFile',path.join(appPath,'Contents','Info.plist')])).stdout.trim();
    if(!iconName||path.basename(iconName)!==iconName)throw new Error('Invalid application icon name.');
    await fs.copyFile(path.join(appPath,'Contents','Resources',iconName.endsWith('.icns')?iconName:iconName+'.icns'),path.join(resources,'Codex.icns'));
    // Compile a tiny local executable; the official application remains signed and unmodified.
    await execute('/usr/bin/xcrun',['clang','-Os','-I',staging,path.join(root,'native','launcher.c'),'-o',path.join(macos,'CompanionLauncher')]);
    await execute('/usr/bin/codesign',['--force','--sign','-','--timestamp=none',bundle]);
    await execute('/usr/bin/codesign',['--verify','--strict',bundle]);
    await execute('/usr/bin/plutil',['-lint',path.join(contents,'Info.plist')]);
    const backup=launcherPath+'.previous';
    if(await fs.access(backup).then(()=>true,()=>false))throw new Error('Previous launcher backup exists; inspect '+backup+' before reinstalling.');
    const exists=await fs.access(launcherPath).then(()=>true,()=>false);
    if(exists)await fs.rename(launcherPath,backup);
    try{await fs.cp(bundle,launcherPath,{recursive:true,errorOnExist:true,force:false});}
    catch(error){await fs.rm(launcherPath,{recursive:true,force:true});if(exists)await fs.rename(backup,launcherPath);throw error;}
    if(exists)await fs.rm(backup,{recursive:true});
    await fs.mkdir(path.join(root,'state'),{recursive:true});
    await fs.writeFile(path.join(root,'state','desktop-launcher.json'),JSON.stringify({path:launcherPath,node:process.execPath,project:root,application:appPath},null,2)+'\n',{mode:0o600});
    return {installed:true,launcherPath};
  }finally{await fs.rm(staging,{recursive:true,force:true});}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--uninstall')){
    if(await fs.access(launcherPath).then(()=>true,()=>false)){
      if(!await ownLauncher(launcherPath))throw new Error('Refusing to remove an unrelated application.');
      await fs.rm(launcherPath,{recursive:true});
    }
    console.log(JSON.stringify({uninstalled:true,launcherPath}));
  }else console.log(JSON.stringify(await installLauncher()));
}
