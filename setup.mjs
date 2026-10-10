import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import './model-profile.js';
export const root=path.dirname(fileURLToPath(import.meta.url));
export function assetPath(value){
  if(typeof value!=='string'||!value||value.includes('\\')||value.includes('\0')||path.posix.isAbsolute(value)||value.split('/').includes('..')||/^[a-z]+:/i.test(value))throw new Error('Model assets must use relative paths inside the model folder.');
  return value;
}
export async function inspectModel(folder,entry='model.model.json'){
  folder=await fs.realpath(folder);assetPath(entry);
  const settings=JSON.parse(await fs.readFile(path.join(folder,entry),'utf8'));
  if(typeof settings.model!=='string'||!settings.model.toLowerCase().endsWith('.moc'))throw new Error('A Cubism 2.1 .model.json/.moc model is required; .model3.json/.moc3 is not supported.');
  if(!Array.isArray(settings.textures)||!settings.textures.length)throw new Error('Model textures are missing.');
  const names=new Set([entry,settings.model,...settings.textures]);
  for(const key of ['physics','pose'])if(settings[key])names.add(settings[key]);
  for(const expression of settings.expressions??[])names.add(expression.file);
  for(const group of Object.values(settings.motions??{}))for(const motion of group){names.add(motion.file);if(motion.sound)names.add(motion.sound);}
  for(const name of names){
    assetPath(name);const actual=await fs.realpath(path.join(folder,name));
    const relative=path.relative(folder,actual);
    if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw new Error('Model asset escapes the model folder.');
    if(!(await fs.stat(actual)).isFile())throw new Error('Model asset is not a file: '+name);
  }
  return {settings,files:[...names],folder,entry};
}
export async function importModel(folder,entry,destination){
  const inspected=await inspectModel(folder,entry);
  for(const name of inspected.files){
    const target=path.join(destination,name===entry?'model.model.json':name);
    await fs.mkdir(path.dirname(target),{recursive:true});
    if(path.resolve(path.join(inspected.folder,name))!==path.resolve(target))await fs.copyFile(path.join(inspected.folder,name),target);
  }
  return inspected.files.length;
}
export async function checkRuntime(file){
  const data=await fs.readFile(file);
  if(data.length>32*1024*1024||!data.toString('utf8').includes('Live2DModelWebGL'))throw new Error('Use the Cubism 2.1 live2d.min.js runtime, not live2dcubismcore.min.js.');
  return data;
}
export async function checkAssets(directory=root){
  await inspectModel(path.join(directory,'model'));
  await checkRuntime(path.join(directory,'vendor/live2d.min.js'));
  const profile=await fs.readFile(path.join(directory,'model/profile.json'),'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
  if(profile!==null)globalThis.Live2DProfile.readProfile(JSON.parse(profile));
  for(const file of ['pixi.min.js','unsafe-eval.min.js','cubism2.min.js','marked.umd.js'])await fs.access(path.join(directory,'vendor',file));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),get=key=>{const i=args.indexOf(key);if(i<0)return null;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing value: '+key);return args[i+1];};
  if(args.includes('--help')){console.log('node setup.mjs --model-dir /path/to/model --runtime /path/to/live2d.min.js [--model-entry custom.model.json] [--profile /path/to/profile.json]\nnode setup.mjs --check');process.exit(0);}
  const model=get('--model-dir'),runtime=get('--runtime'),profile=get('--profile');
  if(model){const entry=get('--model-entry')||'model.model.json';const count=await importModel(path.resolve(model),entry,path.join(root,'model'));console.log('Imported model files:',count);}
  if(runtime){const data=await checkRuntime(path.resolve(runtime));await fs.mkdir(path.join(root,'vendor'),{recursive:true});await fs.writeFile(path.join(root,'vendor/live2d.min.js'),data);console.log('Imported Cubism 2.1 runtime.');}
  if(profile){const input=JSON.parse(await fs.readFile(path.resolve(profile),'utf8'));globalThis.Live2DProfile.readProfile(input);await fs.mkdir(path.join(root,'model'),{recursive:true});await fs.writeFile(path.join(root,'model/profile.json'),JSON.stringify(input,null,2)+'\n');console.log('Imported local model profile.');}
  await fs.mkdir(path.join(root,'state'),{recursive:true,mode:0o700});
  try{await checkAssets();console.log('Assets ready. Run npm start to load the companion, or npm run install:recovery to enable update recovery.');}
  catch(error){console.error('Setup incomplete:',error.message,'\nSee README.md / README.zh-CN.md for the model/runtime import steps.');process.exitCode=1;}
}
