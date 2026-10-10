import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assets} from './inject.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)), port=Number(process.env.LIVE2D_PREVIEW_PORT)||19436;
const reports=[];
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='POST'&&url.pathname==='/report'){let body='';for await(const chunk of req){body+=chunk;if(body.length>100000)throw new Error('report too large');}reports.push(JSON.parse(body));res.writeHead(200).end('ok');return;}
    if(url.pathname==='/reports'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(reports));return;}
    if(url.pathname==='/assets.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await assets()));return;}
    const file=url.pathname==='/'?'preview.html':url.pathname.slice(1);
    if(!['preview.html','preview.js','answer-preview.html','answer-preview.js','fish-preview.html','fish-preview.js','speech-text.js','i18n.js','fish-client.js','vendor/marked.umd.js','answer-bridge.js','model-profile.js','renderer.js','vendor/pixi.min.js','vendor/unsafe-eval.min.js','vendor/live2d.min.js','vendor/cubism2.min.js'].includes(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');res.end(await fs.readFile(path.join(root,file)));
  }catch(error){res.writeHead(500).end(error.message);}
});
server.listen(port,'127.0.0.1',()=>console.log(`Preview http://127.0.0.1:${port}`));
