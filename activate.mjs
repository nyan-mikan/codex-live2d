/* Detach before the app restarts so activation survives the current app closing. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
await fs.mkdir(path.join(root,'state'),{recursive:true});
const log=await fs.open(path.join(root,'state','activation.log'),'a');
const child=spawn(process.execPath,[path.join(root,'control.mjs'),'start','--restart','--delayed'],{detached:true,stdio:['ignore',log.fd,log.fd]});
child.unref();await log.close();
console.log(JSON.stringify({activationPid:child.pid,log:path.join(root,'state','activation.log'),message:'Activation helper is queued; app will restart in four seconds.'}));
