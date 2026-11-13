import {parseHTML} from 'linkedom';
import {fetchPublic,readLimited} from './media.mjs';
let cached=null,pending=null;
export const PERIODS=['day','week','month'];
export async function topAnime(period){
  if(!PERIODS.includes(period))throw Object.assign(new Error('Choose day, week, or month.'),{status:400});
  if(cached&&cached.expires>Date.now())return {period,data:cached.data.rankings[period],source:cached.data.source,updatedAt:cached.data.updatedAt};
  if(!pending)pending=(async()=>{
    const response=await fetchPublic('https://anikototv.bz/home',{},AbortSignal.timeout(15000));
    if(!response.ok){await response.body?.cancel();throw new Error('Rankings are temporarily unavailable. Please retry.');}
    const html=(await readLimited(response,2*1024*1024)).toString('utf8');const {document}=parseHTML(html),rankings={};
    for(const name of PERIODS){
      const nodes=document.querySelectorAll(`#top-anime .tab-content[data-name="${name}"] a.item`);
      rankings[name]=Array.from(nodes).map(node=>({
        id:node.querySelector('[data-tip]')?.getAttribute('data-tip'),
        title:node.querySelector('.name')?.textContent.trim(),
        poster:node.querySelector('.poster img')?.getAttribute('src')||'',
        sub:Number(node.querySelector('.ep-status.sub')?.textContent.trim())||0,
        dub:Number(node.querySelector('.ep-status.dub')?.textContent.trim())||0,
        type:node.querySelector('.meta .dot')?.textContent.trim()||'Anime',
      })).filter(a=>/^[1-9]\d*$/.test(a.id||'')&&a.title).slice(0,10).map((a,i)=>({...a,rank:i+1}));
      if(!rankings[name].length)throw new Error('Viewing rankings could not be loaded. Please retry later.');
    }
    const data={rankings,source:'Anikoto',updatedAt:new Date().toISOString()};cached={data,expires:Date.now()+300000};return data;
  })().finally(()=>{pending=null;});
  const data=await pending;return {period,data:data.rankings[period],source:data.source,updatedAt:data.updatedAt};
}
