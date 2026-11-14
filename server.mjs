import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {resolveEpisode} from './playback.mjs';
import {relayMedia} from './media.mjs';
import {searchAnime,paradiseSeries,recentAnime} from './paradise.mjs';
import {topAnime,PERIODS} from './rankings.mjs';
import {manilaDate,validDate,releaseSchedule,animeRelease} from './schedule.mjs';
const root=fileURLToPath(new URL('./public/',import.meta.url));
const cache=new Map(), pending=new Map();
let requests=[];
const base='https://anikotoapi.site';
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
export async function api(path){
  const hit=cache.get(path);
  if(hit&&hit.expires>Date.now()) return hit.data;
  if(pending.has(path)) return pending.get(path);
  requests=requests.filter(t=>Date.now()-t<120000);
  if(requests.length>=55){const e=new Error('Catalog is busy. Please try again in two minutes.');e.status=429;throw e;}
  requests.push(Date.now());
  const task=(async()=>{
    const response=await fetch(base+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});
    if(!response.ok){const e=new Error(response.status===429?'Provider rate limit reached. Please try again shortly.':'Anime provider is temporarily unavailable.');e.status=response.status===429?429:502;throw e;}
    const data=await response.json();
    if(!data.ok) throw new Error('The provider could not load this anime.');
    if(cache.size>=500) cache.delete(cache.keys().next().value);
    cache.set(path,{data,expires:Date.now()+300000});return data;
  })();
  pending.set(path,task);
  try{return await task;}finally{pending.delete(path);}
}
export const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  const mediaHead=req.method==='HEAD'&&/^\/api\/media\/[a-f0-9]{48}(?:\?|$)/.test(req.url);
  if(req.method!=='GET'&&!mediaHead){res.writeHead(405,{'Allow':'GET'});res.end();return;}
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/healthz'){
      try{
        const upstream=await fetch('http://127.0.0.1:3031/health',{signal:AbortSignal.timeout(2000)});
        await upstream.body?.cancel();
        return json(res,upstream.ok?200:503,{ok:upstream.ok});
      }catch{return json(res,503,{ok:false});}
    }
    if(url.pathname==='/api/schedule'){
      const date=url.searchParams.get('date')||manilaDate(),view=url.searchParams.get('view')||'day';
      if(!validDate(date)||Math.abs(Date.parse(date)-Date.parse(manilaDate()))>31*86400000||!['day','week'].includes(view))return json(res,400,{ok:false,error:'Choose a valid day or week within 31 days of today.'});
      return json(res,200,{ok:true,data:await releaseSchedule(date,view)});
    }
    if(url.pathname==='/api/anime-schedule'){
      const series=url.searchParams.get('series')||'';if(!/^(?:[1-9]\d*|ap-[a-zA-Z0-9_-]{1,160})$/.test(series))return json(res,400,{ok:false,error:'Invalid anime.'});
      const info=series.startsWith('ap-')?await paradiseSeries(series.slice(3)):await api('/series/'+series);
      return json(res,200,{ok:true,data:await animeRelease(info.data.anime)});
    }
    if(url.pathname==='/api/top-anime'){
      const period=url.searchParams.get('period')||'day';if(!PERIODS.includes(period))return json(res,400,{ok:false,error:'Choose day, week, or month.'});
      const result=await topAnime(period);return json(res,200,{ok:true,...result});
    }
    if(url.pathname==='/api/search'){
      const query=(url.searchParams.get('q')||'').trim();if(query.length<2||query.length>100)return json(res,400,{ok:false,error:'Search must contain 2–100 characters.'});
      return json(res,200,{ok:true,data:await searchAnime(query)});
    }
    if(url.pathname==='/api/playback'){
      const series=url.searchParams.get('series')||'',episode=Number(url.searchParams.get('episode'));
      if(!/^(?:[1-9]\d*|ap-[a-zA-Z0-9_-]{1,160})$/.test(series)||!Number.isFinite(episode)||episode<0||episode>100000)return json(res,400,{ok:false,error:'Invalid series or episode.'});
      const seriesData=series.startsWith('ap-')?await paradiseSeries(series.slice(3)):await api(`/series/${series}`);const ep=seriesData.data.episodes?.find(e=>Number(e.number)===episode);
      if(!ep)return json(res,404,{ok:false,error:'Episode is not listed for this anime.'});
      return json(res,200,{ok:true,data:await resolveEpisode(seriesData.data.anime,ep,url.searchParams.get('refresh')==='1')});
    }
    const mediaMatch=url.pathname.match(/^\/api\/media\/([a-f0-9]{48})$/);
    if(mediaMatch)return relayMedia(req,res,mediaMatch[1]);
    if(url.pathname==='/api/recent-anime'){
      const page=Number(url.searchParams.get('page')||1);
      const perPage=Number(url.searchParams.get('per_page')||30);
      if(!Number.isSafeInteger(page)||page<1||page>10000||!Number.isSafeInteger(perPage)||perPage<1||perPage>30)return json(res,400,{ok:false,error:'Invalid page or page size.'});
      return json(res,200,await recentAnime(page,perPage));
    }
    const seriesMatch=url.pathname.match(/^\/api\/series\/([1-9]\d*|ap-[a-zA-Z0-9_-]{1,160})$/);
    if(seriesMatch)return json(res,200,seriesMatch[1].startsWith('ap-')?await paradiseSeries(seriesMatch[1].slice(3)):await api(url.pathname.slice(4)));
    if(url.pathname.startsWith('/api/'))return json(res,404,{ok:false,error:'Endpoint not found.'});
    if(url.pathname==='/vendor/hls.min.js'){
      const content=await readFile(new URL('./node_modules/hls.js/dist/hls.min.js',import.meta.url));res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=86400'});res.end(content);return;
    }
    const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/dashboard.js':'dashboard.js','/schedule.js':'schedule.js','/player.js':'player.js','/video-controls.js':'video-controls.js','/skip.js':'skip.js','/style.css':'style.css','/favicon.svg':'favicon.svg'};
    const file=files[url.pathname];
    if(!file){res.writeHead(404);res.end('Not found');return;}
    const content=await readFile(resolve(root,file));
    res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[extname(file)]});res.end(content);
  }catch(error){json(res,error.status||502,{ok:false,error:error.message||'Unable to load data.'});}
});
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT)||3000,host=process.env.HOST||'127.0.0.1';
  server.listen(port,host,()=>console.log(`Hoshivo ready at http://${host}:${port}`));
}
