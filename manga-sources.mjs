import {parseHTML} from 'linkedom';
import {issueMedia,fetchPublic,readLimited} from './media.mjs';
export const mangaSources=[{id:'mangadex',name:'MangaDex',language:'Multilingual',website:'https://mangadex.org',description:'Manga, manhwa and manhua with chapter language selection.'},{id:'mangapill',name:'MangaPill',language:'English',website:'https://mangapill.com',description:'Search and read its English manga catalog.'},{id:'weebcentral',name:'Weeb Central',language:'English',website:'https://weebcentral.com',description:'Browse English manga and manhwa chapters.'}];
const origins={mp:'https://mangapill.com',wc:'https://weebcentral.com'},names={mp:'mangapill',wc:'weebcentral'},cache=new Map(),pending=new Map(),covers=new Map();
const availability=new Map();
export async function sourceRegistry(check=false){
  const previous=availability.get('weebcentral');
  if(check&&(!previous||Date.now()-previous.at>180000)){
    try{const response=await fetchPublic('https://weebcentral.com/search/data?text=solo&limit=1',{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',Referer:'https://weebcentral.com/'},AbortSignal.timeout(5000));await response.body?.cancel();availability.set('weebcentral',{at:Date.now(),available:response.ok,message:response.ok?'':'The source rejected this server (HTTP '+response.status+').'});}catch{availability.set('weebcentral',{at:Date.now(),available:false,message:'The source could not be reached from this server.'});}
  }
  return mangaSources.map(source=>({...source,...(availability.get(source.id)||{})}));
}
const patterns={mp:/^\/(?:manga\/\d+(?:\/[a-zA-Z0-9-]+)?|chapters\/[\d-]+(?:\/[a-zA-Z0-9-]+)?)$/,wc:/^\/(?:series\/[A-Z0-9]{26}(?:\/[a-zA-Z0-9-]+)?|chapters\/[A-Z0-9]{26})$/};
export function sourceId(prefix,path){if(!patterns[prefix]?.test(path))throw Object.assign(new Error('Invalid source content path.'),{status:400});return prefix+'-'+Buffer.from(path.split('/').slice(0,3).join('/')).toString('base64url');}
export function sourcePath(id){const prefix=id.slice(0,2),encoded=id.slice(3),path=Buffer.from(encoded,'base64url').toString();if(id[2]!=='-'||encoded.length>400||Buffer.from(path).toString('base64url')!==encoded||!patterns[prefix]?.test(path))throw Object.assign(new Error('Invalid source title or chapter.'),{status:400});return {prefix,path,origin:origins[prefix]};}
export const externalMangaId=id=>typeof id==='string'&&/^(mp|wc)-[a-zA-Z0-9_-]{1,400}$/.test(id);
const clean=node=>node?.textContent?.trim().replace(/\s+/g,' ')||'';
const image=node=>node?.getAttribute('data-src')||node?.getAttribute('src')||'';
async function document(prefix,path){
  const key=prefix+path,hit=cache.get(key);if(hit?.expires>Date.now())return parseHTML(hit.text).document;if(pending.has(key))return parseHTML(await pending.get(key)).document;
  const task=(async()=>{const response=await fetchPublic(origins[prefix]+path,{'User-Agent':prefix==='wc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36':'Hoshivo/1.1 manga reader',Referer:origins[prefix]+'/'},AbortSignal.timeout(20000));if(!response.ok){await response.body?.cancel();throw new Error(`${prefix==='mp'?'MangaPill':'Weeb Central'} returned HTTP ${response.status}. Try another source or retry later.`);}const text=(await readLimited(response,4*1024*1024)).toString('utf8');if(cache.size>=40)cache.delete(cache.keys().next().value);cache.set(key,{text,expires:Date.now()+180000});return text;})();pending.set(key,task);try{return parseHTML(await task).document;}finally{pending.delete(key);}
}
function pathFrom(prefix,href){try{const url=new URL(href,origins[prefix]);return url.origin===origins[prefix]?url.pathname:null;}catch{return null;}}
function metadata(prefix,path,title,cover,extra={}){const id=sourceId(prefix,path);if(cover){if(covers.size>=1000)covers.delete(covers.keys().next().value);covers.set(id,new URL(cover,origins[prefix]).href);}return {id,source:names[prefix],title,poster:cover?'/api/manga/source-cover/'+id:'',description:'',kind:'Manga',year:null,status:'',languages:['en'],tags:[],...extra};}
export async function sourceCatalog(source,q='',page=1){
  const prefix=source==='mangapill'?'mp':'wc',path=prefix==='mp'?'/search?'+new URLSearchParams({q,page}):'/search/data?'+new URLSearchParams({text:q,offset:(page-1)*20,limit:20,display_mode:'Full Display'}),doc=await document(prefix,path),items=new Map();
  const links=prefix==='mp'?doc.querySelectorAll('a.mb-2[href^="/manga/"]'):doc.querySelectorAll('article a[href*="/series/"]');
  for(const link of links){const target=pathFrom(prefix,link.getAttribute('href'));if(!target||!patterns[prefix].test(target)||target==='/series/random')continue;
    const container=prefix==='mp'?link.parentElement.parentElement:link.closest('article'),title=prefix==='mp'?clean(link.querySelector('div')):clean(link),cover=image(container?.querySelector('img'));
    if(prefix==='wc'&&link.querySelector('img'))continue;if(!title||items.has(target))continue;const text=clean(container);items.set(target,metadata(prefix,target,title,cover,{kind:/\bmanhwa\b/i.test(text)?'Manhwa':/\bmanhua\b/i.test(text)?'Manhua':'Manga'}));}
  const rows=[...items.values()].slice(0,40),next=prefix==='mp'?!!doc.querySelector('a[rel="next"]'):rows.length>=20;
  return {items:rows,page,pages:next?page+1:page,total:rows.length,source,estimated:true};
}
export async function sourceDetails(id){
  const {prefix,path}=sourcePath(id);if(!path.startsWith(prefix==='mp'?'/manga/':'/series/'))throw Object.assign(new Error('Expected a title link.'),{status:400});
  const doc=await document(prefix,path),title=clean(doc.querySelector('h1')),cover=doc.querySelector('meta[property="og:image"]')?.getAttribute('content')||image(doc.querySelector('img')),description=doc.querySelector('meta[property="og:description"]')?.getAttribute('content')||'';
  if(!title)throw new Error('This source could not load the title.');const manga=metadata(prefix,path,title,cover,{description,kind:/Type:?\s*Manhwa/i.test(clean(doc.querySelector('main'))||clean(doc))?'Manhwa':'Manga'});
  let chaptersDoc=doc;if(prefix==='wc'){const seriesID=path.split('/')[2];chaptersDoc=await document(prefix,`/series/${seriesID}/full-chapter-list`);}
  const map=new Map();for(const link of chaptersDoc.querySelectorAll('a[href*="/chapters/"]')){const target=pathFrom(prefix,link.getAttribute('href'));if(!target||!patterns[prefix].test(target))continue;const label=clean(link),number=/(?:Chapter|Episode|Ch\.?)\s*([\d.]+)/i.exec(label)?.[1]||null;map.set(target,{id:sourceId(prefix,target),number,title:label.replace(/\s*Last Read[\s\S]*/, '').trim(),volume:null,pages:null,language:'en'});}
  const chapters=[...map.values()].sort((a,b)=>Number(a.number)-Number(b.number));return {manga,chapters,page:1,pages:1,total:chapters.length};
}
export async function sourceCover(id){const {prefix}=sourcePath(id);if(!covers.has(id))await sourceDetails(id);const url=covers.get(id);if(!url)throw Object.assign(new Error('Cover not available.'),{status:404});return issueMedia(url,{Referer:origins[prefix]+'/','User-Agent':'Hoshivo/1.1 manga reader'});}
export async function sourceChapter(id){
  const {prefix,path}=sourcePath(id);if(!path.startsWith('/chapters/'))throw Object.assign(new Error('Expected a chapter link.'),{status:400});const doc=await document(prefix,path);
  const parent=Array.from(doc.querySelectorAll(prefix==='mp'?'a[href^="/manga/"]':'a[href*="/series/"]')).map(a=>pathFrom(prefix,a.getAttribute('href'))).find(p=>p&&patterns[prefix].test(p));if(!parent)throw new Error('The chapter title could not be identified.');
  const details=await sourceDetails(sourceId(prefix,parent));const current=details.chapters.findIndex(c=>sourcePath(c.id).path===path||sourcePath(c.id).path.split('/')[2]===path.split('/')[2]);
  const imagesDoc=prefix==='mp'?doc:await document(prefix,path+'/images?is_prev=False&current_page=1&reading_style=long_strip');
  const images=Array.from(imagesDoc.querySelectorAll(prefix==='mp'?'.js-page':'#chapter-images img')).map(image).filter(url=>/^https:\/\//.test(url));if(!images.length)throw new Error('No readable chapter pages were returned by this source.');
  return {id,manga:details.manga,title:details.chapters[current]?.title||'',number:details.chapters[current]?.number||null,language:'en',pages:images.slice(0,500).map(url=>issueMedia(url,{Referer:origins[prefix]+'/','User-Agent':'Hoshivo/1.1 manga reader'})),previous:current>0?details.chapters[current-1].id:null,next:current>=0&&current<details.chapters.length-1?details.chapters[current+1].id:null};
}
