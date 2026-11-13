import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const children=[];
const services=[['AnimeParadise','scripts/sdk-server.mjs','.local-providers/anime-sdk/dist/index.js',3031,{}]];
let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const child of children)child.kill();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
for(const [name,script,check,port,env] of services){
  if(!existsSync(resolve(root,check))){console.log(`${name}: unavailable. Run npm run setup:providers.`);continue;}
  try{const r=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(600)});await r.body?.cancel();console.log(`${name}: reusing the service on port ${port}.`);continue;}catch{}
  const child=spawn(process.execPath,[resolve(root,script)],{cwd:root,env:{...process.env,...env},windowsHide:true,stdio:'inherit'});children.push(child);
  child.on('error',e=>console.error(`${name}: ${e.message}`));
}
const app=spawn(process.execPath,[resolve(root,'server.mjs')],{cwd:root,windowsHide:true,stdio:'inherit'});children.push(app);
app.on('error',e=>{console.error(e.message);stop();process.exitCode=1;});
app.on('exit',code=>{stop();process.exitCode=code||0;});
