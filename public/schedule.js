const $=s=>document.querySelector(s),zone='Asia/Manila';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dateLabel=date=>new Intl.DateTimeFormat('en-PH',{timeZone:'UTC',weekday:'long',month:'short',day:'numeric'}).format(new Date(date+'T00:00:00Z'));
const timeLabel=stamp=>new Intl.DateTimeFormat('en-PH',{timeZone:zone,hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(stamp));
const releaseLabel=stamp=>new Intl.DateTimeFormat('en-PH',{timeZone:zone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(stamp));
let selected=today(),view='day',sequence=0,loaded=false,loading=false,animeRequest;
function daysOfWeek(date){const start=new Date(date+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);return Array.from({length:7},(_,i)=>new Date(start.getTime()+86400000*i).toISOString().slice(0,10));}
function paintControls(){
  $('#schedule-day').setAttribute('aria-pressed',String(view==='day'));$('#schedule-week').setAttribute('aria-pressed',String(view==='week'));
  $('#schedule-dates').innerHTML=daysOfWeek(selected).map(date=>`<button class="schedule-date" data-date="${date}" aria-pressed="${view==='day'&&date===selected}" aria-label="${esc(dateLabel(date))}"><span>${new Intl.DateTimeFormat('en-PH',{timeZone:'UTC',weekday:'short'}).format(new Date(date+'T00:00:00Z'))}</span><strong>${Number(date.slice(-2))}</strong>${date===today()?'<small>Today</small>':'<small>&nbsp;</small>'}</button>`).join('');
}
async function load(){
  const request=++sequence;loading=true;paintControls();$('#schedule-status').textContent='Loading estimated releases…';$('#schedule-retry').hidden=true;$('#schedule-list').replaceChildren();
  try{
    const response=await fetch(`/api/schedule?date=${selected}&view=${view}`);const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'Schedule unavailable.');if(request!==sequence)return;
    const days=result.data.days;loaded=true;
    $('#schedule-list').innerHTML=days.map(day=>`<section class="schedule-group"><h3>${esc(dateLabel(day.date))}</h3>${day.error?`<p class="schedule-empty">${esc(day.error)}</p>`:day.episodes.length?day.episodes.map(ep=>`<a class="release-row" href="#anime/${encodeURIComponent(ep.id)}"><time datetime="${esc(ep.airingAt)}">${esc(timeLabel(ep.airingAt))}</time><strong>${esc(ep.title)}</strong><span class="release-episode">EP ${Number(ep.episode)}</span><span class="release-state">${Date.parse(ep.airingAt)<Date.now()?'Earlier':'Estimated'}</span></a>`).join(''):'<p class="schedule-empty">No estimated releases listed for this day.</p>'}</section>`).join('');
    const partial=days.some(d=>d.error);$('#schedule-status').textContent=partial?'Some days could not be loaded. Please retry.':'';$('#schedule-retry').hidden=!partial;
  }catch(error){if(request!==sequence)return;$('#schedule-status').textContent=error.message;$('#schedule-retry').hidden=false;}finally{if(request===sequence)loading=false;}
}
export function initSchedules(){
  $('#release-schedule').innerHTML='<div class="section-heading"><div><div class="eyebrow">PLAN YOUR NEXT WATCH</div><h2>Estimated schedule<span>.</span></h2></div><div class="schedule-views"><button id="schedule-day" class="button" aria-pressed="true">Day</button><button id="schedule-week" class="button" aria-pressed="false">Week</button><button id="schedule-today" class="button">Today</button></div></div><p class="schedule-note">Philippine time (PHT / UTC+8). Release times are estimates and may change.</p><div id="schedule-dates" class="schedule-dates" role="group" aria-label="Choose release day"></div><p id="schedule-status" role="status" aria-live="polite"></p><div id="schedule-list"></div><button id="schedule-retry" class="button" hidden>Retry schedule</button><p class="schedule-source">Estimated schedule from Anikoto.</p>';
  $('#schedule-day').onclick=()=>{view='day';load();};$('#schedule-week').onclick=()=>{view='week';load();};$('#schedule-today').onclick=()=>{selected=today();view='day';load();};$('#schedule-retry').onclick=load;
  $('#schedule-dates').onclick=e=>{const button=e.target.closest('[data-date]');if(button){selected=button.dataset.date;view='day';load();}};
}
export function showSchedule(visible){$('#release-schedule').hidden=!visible;if(visible&&!loaded&&!loading)load();}
export function clearAnimeSchedule(){animeRequest?.abort();animeRequest=null;}
export async function loadAnimeSchedule(id){
  clearAnimeSchedule();const host=$('#anime-schedule');if(!host)return;const controller=new AbortController();animeRequest=controller;
  host.innerHTML='<div class="eyebrow">NEXT RELEASE</div><h3>Estimated episode schedule</h3><p role="status">Checking release information…</p>';
  try{
    const response=await fetch('/api/anime-schedule?series='+encodeURIComponent(id),{signal:controller.signal});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'Release information unavailable.');if(controller.signal.aborted||!host.isConnected)return;
    const data=result.data;
    host.innerHTML='<div class="eyebrow">NEXT RELEASE</div><h3>Estimated episode schedule</h3>'+(data.status==='scheduled'?data.episodes.slice(0,3).map((ep,i)=>`<div class="anime-release-row"><strong>${i===0?'Next: ':''}Episode ${Number(ep.episode)}</strong><time datetime="${esc(ep.airingAt)}">${esc(releaseLabel(ep.airingAt))} PHT</time></div>`).join(''):data.status==='finished'?'<p class="release-finished">This season has finished airing. No new episode is scheduled.</p>':'<p>The next episode date has not been announced yet.</p>')+'<p class="schedule-note">Philippine time. Estimates may change; availability on the player may be later.</p>';
  }catch(error){if(controller.signal.aborted||!host.isConnected)return;host.innerHTML='<h3>Estimated episode schedule</h3><p>'+esc(error.message)+'</p><button class="button" id="anime-schedule-retry">Retry schedule</button>';$('#anime-schedule-retry').onclick=()=>loadAnimeSchedule(id);}
}
