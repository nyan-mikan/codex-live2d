import {checkAssets} from './setup.mjs';
import {appInfo,appPath} from './app-config.mjs';
import {findEndpoint} from './endpoint.mjs';
let failed=false;
if(Number(process.versions.node.split('.')[0])<22){console.error('Node.js 22 or later is required.');failed=true;}
if(process.platform!=='darwin'){console.error('Desktop activation and recovery support macOS only.');failed=true;}
try{await checkAssets();console.log('Model and browser libraries: ready');}catch(e){console.error('Assets:',e.message);failed=true;}
if(process.platform==='darwin')try{const info=await appInfo();console.log('Application:',appPath,'version',info.version);}catch{console.error('Application not found. Set CODEX_APP_PATH if installed elsewhere.');failed=true;}
const endpoint=process.platform==='darwin'?await findEndpoint().catch(()=>null):null;
console.log('Local debug endpoint:',endpoint?'ready on port '+endpoint.port:'not active (open Codex Live2D.app after your next normal quit)');
process.exitCode=failed?1:0;
