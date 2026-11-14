import {probeMedia,issueMedia} from './media.mjs';
import {loadSkipData} from './skip.mjs';
import {searchAnime} from './paradise.mjs';
import {findMatch} from './matching.mjs';
export {chooseMatch} from './matching.mjs';
const cache=new Map(),pending=new Map();
async function sdk(path,signal){
  let response;try{response=await fetch('http://127.0.0.1:3031'+path,{signal});}catch(e){throw new Error(e.name==='TimeoutError'?'The video source timed out. Please retry.':'The video service is unavailable. Start the app with npm start.');}
  const data=await response.json();
  if(!response.ok||data.error){
    const stage=path.split('?')[0].slice(1),detail=String(data.error||'Unable to load video.').slice(0,300);
    console.error(`[playback] AnimeParadise ${stage}: HTTP ${response.status}: ${detail}`);
    throw new Error(/timed?\s*out|timeout/i.test(detail)?`AnimeParadise ${stage} request timed out from this server. Please retry.`:detail);
  }
  return data;
}
export async function resolveEpisode(anime,episode,refresh=false){
  const key=[anime.id,episode.number].join(':'),hit=cache.get(key);
  if(hit&&hit.expires>Date.now()&&(!refresh||Date.now()-hit.created<10000))return hit.source;
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
    const signal=AbortSignal.timeout(60000);
    const match=anime.source_id?{source_id:anime.source_id}:await findMatch(anime,searchAnime,signal);
    if(!match)throw new Error('No matching AnimeParadise title was found. Try opening this anime from Search.');
    const episodes=await sdk('/content?provider=animeparadise&mediaId='+encodeURIComponent(match.source_id),signal);
    const unit=episodes.find(e=>Number(e.number)===Number(episode.number));
    if(!unit)throw new Error('AnimeParadise did not return this episode in its episode list.');
    const [resolved,skip]=await Promise.all([sdk('/stream?provider=animeparadise&unitId='+encodeURIComponent(unit.id)+'&language=sub',signal),loadSkipData(unit.id,signal)]);
    let lastError;
    for(const stream of (resolved.streams||[]).slice(0,3)){
      try{
        const candidate={url:stream.sourceUrl,kind:stream.isHLS?'hls':'mp4',headers:stream.headers};
        await probeMedia(candidate,signal);
        const source={kind:candidate.kind,url:issueMedia(candidate.url,candidate.headers),skip,subtitles:(stream.subtitles||[]).filter(s=>s.url&&s.format!=='ass'&&s.format!=='srt').map(s=>({...s,url:issueMedia(s.url,candidate.headers)}))};
        if(cache.size>=300)cache.delete(cache.keys().next().value);cache.set(key,{source,created:Date.now(),expires:Date.now()+120000});return source;
      }catch(e){lastError=e;}
    }
    throw lastError||new Error('No video is available for this episode.');
  })();pending.set(key,task);try{return await task;}finally{pending.delete(key);}
}
