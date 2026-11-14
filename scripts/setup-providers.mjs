import {existsSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const run=(cmd,args,cwd)=>new Promise((done,fail)=>{
  const child=spawn(cmd,args,{cwd,stdio:'inherit',shell:process.platform==='win32'&&cmd==='npm',windowsHide:true});
  child.on('error',fail);child.on('exit',code=>code===0?done():fail(new Error(`${cmd} failed (${code})`)));
});
mkdirSync(resolve(root,'.local-providers'),{recursive:true});
for(const [name,repo,install] of [['anime-sdk','hexxt-git/anime-sdk',true]]){
  const cwd=resolve(root,'.local-providers',name);
  const needsRestore=['package.json','package-lock.json','src/index.ts'].some(file=>!existsSync(resolve(cwd,file)));
  if(needsRestore){
    // Build caches can retain node_modules while omitting ignored provider source.
    // Restore tracked files even when the destination directory already exists.
    mkdirSync(cwd,{recursive:true});
    if(!existsSync(resolve(cwd,'.git')))await run('git',['init'],cwd);
    await run('git',['fetch','--depth','1',`https://github.com/${repo}.git`,'72d734f1f9bc6d59183ead2fcb0f172ad6018cdf'],cwd);
    await run('git',['checkout','--force','--detach','FETCH_HEAD'],cwd);
  }
  if(install&&(needsRestore||!existsSync(resolve(cwd,'node_modules'))))await run('npm',['ci','--include=dev','--ignore-scripts','--no-audit','--no-fund'],cwd);
  if(name==='anime-sdk'&&(needsRestore||!existsSync(resolve(cwd,'dist/index.js'))))await run('npm',['run','build'],cwd);
}
console.log('Local provider checkouts ready. Run npm start.');
