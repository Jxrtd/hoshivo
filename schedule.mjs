import {parseHTML} from 'linkedom';
const cache=new Map(),pending=new Map();
export const TIMEZONE='Asia/Manila';
export function manilaDate(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export function weekDates(date){const start=new Date(date+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);return Array.from({length:7},(_,i)=>new Date(start.getTime()+i*86400000).toISOString().slice(0,10));}
async function memo(key,fn){const hit=cache.get(key);if(hit&&hit.expires>Date.now())return hit.data;if(pending.has(key))return pending.get(key);const task=fn().then(data=>{if(cache.size>200)cache.delete(cache.keys().next().value);cache.set(key,{data,expires:Date.now()+300000});return data;}).finally(()=>pending.delete(key));pending.set(key,task);return task;}
export function daySchedule(date){return memo('day:'+date,async()=>{
  const stamp=Date.parse(date+'T00:00:00Z')/1000;
  const response=await fetch(`https://anikototv.bz/ajax/schedule/date?tz=8&time=${stamp}`,{headers:{'X-Requested-With':'XMLHttpRequest'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Schedule is temporarily unavailable.');const json=await response.json();if(json.status!==200||typeof json.result!=='string')throw new Error('Schedule could not be loaded.');
  const {document}=parseHTML(json.result);
  const episodes=Array.from(document.querySelectorAll('a.item')).map(node=>{
    const id=node.querySelector('[data-tip]')?.getAttribute('data-tip'),title=node.querySelector('.title')?.textContent.trim(),time=node.querySelector('.time')?.textContent.trim(),episode=Number(node.querySelector('.ep')?.textContent.match(/[\d.]+/)?.[0]);
    if(!/^[1-9]\d*$/.test(id||'')||!title||!/^\d{2}:\d{2}$/.test(time||'')||!Number.isFinite(episode))return null;
    const milliseconds=Date.parse(`${date}T${time}:00+08:00`);if(!Number.isFinite(milliseconds))return null;
    return {id,title,episode,airingAt:new Date(milliseconds).toISOString()};
  }).filter(Boolean).sort((a,b)=>a.airingAt.localeCompare(b.airingAt));
  return {date,episodes};
});}
export async function releaseSchedule(date,view){
  const dates=view==='week'?weekDates(date):[date],days=new Array(dates.length);let index=0;
  const worker=async()=>{while(index<dates.length){const i=index++;try{days[i]=await daySchedule(dates[i]);}catch(e){days[i]={date:dates[i],episodes:[],error:e.message};}}};
  await Promise.all(Array.from({length:Math.min(3,dates.length)},worker));
  return {date,view,days,timezone:TIMEZONE,source:'Anikoto',estimated:true};
}
export async function animeRelease(anime){return memo('anime:'+anime.id,async()=>{
  const now=Date.now()/1000,next=Number(anime.next_air_schedule_time),episode=Number(anime.next_air_ep);
  if(next>now&&episode>0)return {status:'scheduled',episodes:[{episode,airingAt:new Date(next*1000).toISOString()}],source:'Anikoto',timezone:TIMEZONE};
  if(/finished|completed/i.test(anime.status||''))return {status:'finished',episodes:[],timezone:TIMEZONE};
  const id=Number(anime.ani_id);if(!Number.isSafeInteger(id)||id<1)return {status:'unannounced',episodes:[],timezone:TIMEZONE};
  const query='query($id:Int!){Media(id:$id,type:ANIME){status nextAiringEpisode{airingAt episode} airingSchedule(notYetAired:true,perPage:8){nodes{airingAt episode}}}}';
  const response=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query,variables:{id,now:Math.floor(now)}}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('Release information is temporarily unavailable.');const data=await response.json(),media=data.data?.Media;if(!media)throw new Error('Release information is temporarily unavailable.');
  const nodes=[media.nextAiringEpisode,...(media.airingSchedule?.nodes||[])].filter(e=>e&&e.airingAt>now&&e.episode>0);
  const episodes=[...new Map(nodes.map(e=>[e.episode,{episode:e.episode,airingAt:new Date(e.airingAt*1000).toISOString()}])).values()].sort((a,b)=>a.airingAt.localeCompare(b.airingAt));
  return {status:episodes.length?'scheduled':media.status==='FINISHED'?'finished':'unannounced',episodes,source:'AniList',timezone:TIMEZONE};
});}
