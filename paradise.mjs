const cache=new Map(),pending=new Map();
async function cached(key,fn){const hit=cache.get(key);if(hit&&hit.expires>Date.now())return hit.data;if(pending.has(key))return pending.get(key);const task=fn().then(data=>{if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,{data,expires:Date.now()+300000});return data;}).finally(()=>pending.delete(key));pending.set(key,task);return task;}
async function providerResponse(path,signal){const r=await fetch('https://api.animeparadise.moe'+path,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok||data.error)throw new Error('AnimeParadise could not load this title. Please retry.');return data;}
async function provider(path,signal){return (await providerResponse(path,signal)).data;}
export function normalizeAnime(a){
  return {id:'ap-'+a.link,source_id:'animeparadise:'+a._id,ani_id:a.mappings?.anilist||null,mal_id:a.mappings?.myanimelist||null,title:a.alternativeTitle?.english||a.title,alternative:a.title,native:a.alternativeTitle?.native||'',titles:a.alternativeTitle?.romaji||'',poster:a.posterImage?.large||a.posterImage?.medium||'',background_image:a.coverImage?.large||a.coverImage?.original||'',description:a.synopsys||a.synopsis||'',year:a.animeSeason?.year||'',score:a.rate?String(Math.round(Number(a.rate))/10):'',status:a.status||'',is_sub:Number(a.episodeCount||a.episodes)||0,is_dub:0,terms_by_type:{genre:a.genres||[],type:[a.type||'Anime']}};
}
export function searchAnime(query,signal){return cached('search:'+query.toLowerCase(),async()=>{const rows=await provider('/search?q='+encodeURIComponent(query)+'&limit=30',signal);return (Array.isArray(rows)?rows:[]).filter(a=>/^[a-zA-Z0-9_-]{1,160}$/.test(a.link||'')).map(normalizeAnime);});}
export function recentAnime(page,perPage){return cached(`recent:${page}:${perPage}`,async()=>{
  const result=await providerResponse(`/ep/recently-added?limit=${perPage}&page=${page}`);
  if(!Array.isArray(result.data)||!result.pagination)throw new Error('AnimeParadise returned an invalid latest-episodes feed.');
  const rows=result.data.filter(ep=>ep.origin?._id&&/^[a-zA-Z0-9_-]{1,160}$/.test(ep.origin.link||''));
  const data=[...new Map(rows.map(ep=>{
    const anime=normalizeAnime(ep.origin);anime.is_sub=Number(ep.number)||0;anime.updated_at=ep.airDate;return [anime.id,anime];
  })).values()];
  return {ok:true,data,pagination:{page:Number(result.pagination.page)||page,per_page:perPage,total:Number(result.pagination.totalItems)||0,total_pages:Number(result.pagination.totalPages)||1}};
});}
export function paradiseSeries(slug){return cached('series:'+slug,async()=>{
  const info=await provider('/anime/'+encodeURIComponent(slug));const anime=normalizeAnime(info);
  const r=await fetch('http://127.0.0.1:3031/content?provider=animeparadise&mediaId='+encodeURIComponent(anime.source_id),{signal:AbortSignal.timeout(20000)});const units=await r.json();if(!r.ok||!Array.isArray(units))throw new Error('Unable to load the episode list.');
  const episodes=units.map(u=>({id:u.id,number:u.number,title:u.title}));anime.is_sub=episodes.length;return {ok:true,data:{anime,episodes}};
});}
