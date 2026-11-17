import {issueMedia,validateTarget} from './media.mjs';
export const mangaId=value=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const cache=new Map(),pending=new Map();let queue=Promise.resolve();
async function api(path){
  const hit=cache.get(path);if(hit?.expires>Date.now())return hit.data;if(pending.has(path))return pending.get(path);
  if(pending.size>=80)throw Object.assign(new Error('Manga catalog is busy. Please retry shortly.'),{status:429});
  const task=(async()=>{
    const turn=queue.then(()=>new Promise(r=>setTimeout(r,220)));queue=turn;await turn;
    const r=await fetch('https://api.mangadex.org'+path,{headers:{Accept:'application/json','User-Agent':'Hoshivo/1.1 MangaDex reader'},signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Object.assign(new Error(r.status===429?'MangaDex rate limit reached. Please retry shortly.':'MangaDex is temporarily unavailable.'),{status:r.status===429?429:502});
    const data=await r.json();if(data.result!=='ok')throw new Error('MangaDex could not load this content.');
    if(cache.size>=300)cache.delete(cache.keys().next().value);cache.set(path,{data,expires:Date.now()+120000});return data;
  })();pending.set(path,task);try{return await task;}finally{pending.delete(path);}
}
const ratings='contentRating[]=safe&contentRating[]=suggestive';
export function normalizeManga(row){
  const a=row.attributes||{},cover=row.relationships?.find(r=>r.type==='cover_art')?.attributes?.fileName;
  const title=a.title?.en||a.altTitles?.find(t=>t.en)?.en||Object.values(a.title||{})[0]||'Untitled';
  return {id:row.id,title,description:a.description?.en||'',poster:cover?`https://uploads.mangadex.org/covers/${row.id}/${encodeURIComponent(cover)}.256.jpg`:'',year:a.year||null,status:a.status||'',kind:a.originalLanguage==='ko'?'Manhwa':a.originalLanguage?.startsWith('zh')?'Manhua':'Manga',languages:(a.availableTranslatedLanguages||[]).filter(l=>typeof l==='string'),tags:(a.tags||[]).map(t=>t.attributes?.name?.en).filter(Boolean)};
}
export async function mangaCatalog({q='',kind='all',page=1}){
  const params=new URLSearchParams({limit:'18',offset:String((page-1)*18),'includes[]':'cover_art','order[followedCount]':'desc',hasAvailableChapters:'true'});
  if(q)params.set('title',q);if(kind!=='all')params.append('originalLanguage[]',{manga:'ja',manhwa:'ko',manhua:'zh'}[kind]);
  if(kind==='manhua')params.append('originalLanguage[]','zh-hk');const data=await api('/manga?'+params+'&'+ratings);return {items:data.data.map(normalizeManga),page,pages:Math.max(1,Math.min(555,Math.ceil(data.total/18))),total:data.total};
}
async function title(id){const data=await api('/manga/'+id+'?includes[]=cover_art');if(!['safe','suggestive'].includes(data.data.attributes.contentRating))throw Object.assign(new Error('This title is not available in this catalog.'),{status:404});return normalizeManga(data.data);}
export async function mangaDetails(id,language='en',page=1){
  const manga=await title(id),data=await api(`/manga/${id}/feed?limit=100&offset=${(page-1)*100}&translatedLanguage[]=${encodeURIComponent(language)}&order[chapter]=asc&order[volume]=asc&includeExternalUrl=0&${ratings}`);
  return {manga,chapters:data.data.map(row=>({id:row.id,number:row.attributes.chapter,title:row.attributes.title||'',volume:row.attributes.volume,pages:row.attributes.pages,language:row.attributes.translatedLanguage})),page,pages:Math.max(1,Math.ceil(Math.min(data.total,10000)/100)),total:data.total};
}
export async function mangaChapter(id){
  const record=(await api('/chapter/'+id)).data,mangaID=record.relationships?.find(r=>r.type==='manga')?.id;
  if(!mangaId(mangaID||''))throw new Error('Chapter does not reference a valid title.');
  const manga=await title(mangaID),language=record.attributes.translatedLanguage;
  if(record.attributes.externalUrl)throw new Error('This chapter is available only on the publisher website.');
  const [home,aggregate]=await Promise.all([api('/at-home/server/'+id),api(`/manga/${mangaID}/aggregate?translatedLanguage[]=${encodeURIComponent(language)}`)]);
  const base=await validateTarget(home.baseUrl);
  const hash=home.chapter?.hash,files=home.chapter?.dataSaver?.length?home.chapter.dataSaver:home.chapter?.data,mode=home.chapter?.dataSaver?.length?'data-saver':'data';
  if(!/^[a-f0-9]+$/i.test(hash||'')||!Array.isArray(files)||!files.length||files.length>500)throw new Error('No readable pages are available for this chapter.');
  const pages=files.map(file=>{if(typeof file!=='string'||file.length>240||!/^[a-zA-Z0-9_.-]+\.(?:jpe?g|png|webp|gif|avif)$/i.test(file))throw new Error('Invalid chapter image.');return issueMedia(`${base.origin}/${mode}/${hash}/${encodeURIComponent(file)}`,{Referer:'https://mangadex.org/'});});
  const chapters=Object.values(aggregate.volumes||{}).flatMap(v=>Object.values(v.chapters||{})).filter(c=>mangaId(c.id||'')).sort((a,b)=>Number(a.chapter)-Number(b.chapter));
  const index=chapters.findIndex(c=>c.id===id||(c.others||[]).includes(id));
  return {manga,id,title:record.attributes.title||'',number:record.attributes.chapter,language,pages,previous:index>0?chapters[index-1].id:null,next:index>=0&&index<chapters.length-1?chapters[index+1].id:null};
}
