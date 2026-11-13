import {setEpisode,destroyPlayer} from './player.js';
import {initDashboard,showRankings} from './dashboard.js';
import {initSchedules,showSchedule,loadAnimeSchedule,clearAnimeSchedule} from './schedule.js';
const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}};
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
let saved=read('anikoto-watchlist',[]);if(!Array.isArray(saved))saved=[];
let history=read('anikoto-progress',{});if(!history||typeof history!=='object'||Array.isArray(history))history={};
let recent=read('anikoto-recently-watched',[]);if(!Array.isArray(recent))recent=[];recent=recent.filter(a=>a&&/^(?:[1-9]\d*|ap-[a-zA-Z0-9_-]{1,160})$/.test(String(a.id))&&Number.isFinite(Number(a.episode))).slice(0,20);
let searchItems=[],searchBusy=false,searchError='',searchSequence=0,searchTimer,searchAbort;
let latestItems=[],latestPage=1,latestPages=1,latestLoading=false,latestError='';
let items=[],page=0,totalPages=1,loading=false,current=null,episodeIndex=-1,lang='sub',routeToken=0;
function store(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{toast('Browser storage is unavailable; changes last for this session.');return false;}}
let toastTimer;function toast(text){$('#toast').textContent=text;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',3000);}
async function request(path){const response=await fetch(path);const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'Unable to load anime.');return result;}
const genres=a=>a.terms_by_type?.genre||[];
const isSaved=id=>saved.some(a=>String(a.id)===String(id));
function countSaved(){$('#saved-count').textContent=saved.length;}
function catalogCard(a,latest){
  const episode=Math.max(0,Number(a.is_sub)||0,Number(a.is_dub)||0),id=encodeURIComponent(String(a.id));
  const href=`#anime/${id}${latest&&episode>0?'/latest':''}`;
  return `<a class="card" href="${href}" aria-label="${latest?'Watch latest episode of':'Watch'} ${escape(a.title)}"><div class="poster-wrap"><img src="${escape(safeUrl(a.poster))}" alt="${escape(a.title)} poster" loading="lazy" referrerpolicy="no-referrer">${latest&&episode>0?`<span class="latest-episode">EP ${episode}</span>`:''}<span class="score">&#9733; ${escape(a.score||'—')}</span><div class="badges">${Number(a.is_sub)>0?`<span class="badge">SUB ${Number(a.is_sub)}</span>`:''}${Number(a.is_dub)>0?`<span class="badge dub">DUB ${Number(a.is_dub)}</span>`:''}</div></div><h3>${escape(a.title)}</h3><div class="card-meta">${escape(a.terms_by_type?.type?.[0]||'Anime')}<span>•</span>${escape(a.year||'TBA')}<span>•</span>${latest?'Latest update':escape(a.status==='Currently Airing'?'Airing':a.status||'Anime')}</div></a>`;
}
function render(){
  const watchlist=location.hash==='#watchlist';
  const query=$('#search').value.trim().toLowerCase(),genre=$('#genre').value,language=$('#language').value;
  const remote=!watchlist&&!!query,homeLatest=(!location.hash||location.hash==='#home')&&!remote;
  $('#grid').classList.toggle('latest-grid',homeLatest);showSchedule(homeLatest);
  const list=(watchlist?saved:remote?searchItems:homeLatest?latestItems:items).filter(a=>(remote||!query||[a.title,a.alternative,a.native,a.titles].some(t=>String(t||'').toLowerCase().includes(query)))&&(!genre||genres(a).includes(genre))&&(!language||Number(a['is_'+language])>0));
  $('#section-title').innerHTML=watchlist?'Your watchlist<span>.</span>':remote?'Search results<span>.</span>':'Latest episodes<span>.</span>';
  $('#section-eyebrow').textContent=watchlist?'GOOD STORIES, SAVED FOR LATER':remote?'FIND YOUR NEXT FAVORITE':'NEW EPISODES, JUST ADDED';
  $('#catalog-count').textContent=searchBusy&&remote?'Searching...':`${list.length} ${watchlist?'saved':remote?'matching':'loaded'} titles`;
  $('#filter-note').textContent=watchlist?'Search your saved anime.':remote?'Searching the full AnimeParadise catalog.':'Search any anime by title. Genre and language filters apply to the displayed titles.';
  if(remote){$('#status').className=searchError?'error':'';$('#status').textContent=searchBusy?'Searching anime...':searchError||(query.length<2?'Type at least two characters.':'');}else if(watchlist){$('#status').className='';$('#status').textContent='';}else if(homeLatest){$('#status').className=latestError?'error':'';$('#status').textContent=latestLoading?'Loading latest episodes...':latestError;}
  $('#grid').innerHTML=list.map(a=>catalogCard(a,!watchlist&&!remote)).join('')||(!(remote?searchBusy:homeLatest?latestLoading:loading)?`<div class="empty">${watchlist?'No saved matches yet. Open an anime and add it to your watchlist.':'No matching anime found. Try another title or clear your filters.'}</div>`:'');
  $('#load-more').hidden=homeLatest||watchlist||remote||page>=totalPages;
  $('#latest-pagination').hidden=!homeLatest;$('#latest-page').textContent=`Page ${latestPage} of ${latestPages}`;$('#latest-previous').disabled=latestLoading||latestPage<=1;$('#latest-next').disabled=latestLoading||latestPage>=latestPages;$('#latest-retry').hidden=!latestError;$('#load-more').disabled=loading;
  $('#load-more').textContent=loading?'Loading…':'Load more anime ↓';countSaved();
}
function scheduleSearch(){
  clearTimeout(searchTimer);searchAbort?.abort();const sequence=++searchSequence,query=$('#search').value.trim();searchItems=[];searchError='';searchBusy=false;
  if(location.hash==='#watchlist'||query.length<2){if(!query){$('#status').className='';$('#status').textContent='';}render();return;}
  searchBusy=true;render();searchTimer=setTimeout(async()=>{
    const controller=new AbortController();searchAbort=controller;
    try{const response=await fetch('/api/search?q='+encodeURIComponent(query),{signal:controller.signal});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'Search failed.');if(sequence!==searchSequence)return;searchItems=result.data;updateGenres();}
    catch(error){if(controller.signal.aborted||sequence!==searchSequence)return;searchError=error.message;}
    finally{if(sequence===searchSequence){searchBusy=false;render();}}
  },350);
}
function updateGenres(){const selected=$('#genre').value;$('#genre').innerHTML='<option value="">All genres</option>'+[...new Set([...items,...latestItems,...saved,...searchItems].flatMap(genres))].sort().map(g=>`<option value="${escape(g)}">${escape(g)}</option>`).join('');$('#genre').value=selected;}
async function loadLatest(number=1){
  if(latestLoading)return;latestLoading=true;latestError='';render();
  try{const result=await request('/api/recent-anime?per_page=12&page='+number);latestItems=result.data;latestPage=result.pagination.page;latestPages=result.pagination.total_pages;updateGenres();
    if(latestItems[0]){const a=latestItems[0];$('#hero').style.backgroundImage='url("'+safeUrl(a.background_image||a.poster)+'")';$('#spotlight-title').textContent=a.title;}
  }catch(error){latestError=error.message;}finally{latestLoading=false;render();}
}
$('#latest-previous').onclick=()=>loadLatest(latestPage-1);$('#latest-next').onclick=()=>loadLatest(latestPage+1);$('#latest-retry').onclick=()=>loadLatest(latestPage);
async function loadMore(){if(loading)return;loading=true;$('#status').className='';$('#status').textContent='Loading fresh episodes…';render();if(!items.length)$('#grid').innerHTML=Array.from({length:12},()=>'<div class="skeleton"></div>').join('');
  try{const result=await request(`/api/recent-anime?page=${page+1}`);items=[...new Map([...items,...result.data].map(a=>[a.id,a])).values()];page=result.pagination.page;totalPages=result.pagination.total_pages;updateGenres();if(items[0]){$('#hero').style.backgroundImage=`url("${safeUrl(items[0].background_image||items[0].poster).replace(/["\\]/g,'')} ")`;$('#spotlight-title').textContent=items[0].title;}$('#status').textContent='';}
  catch(e){$('#status').className='error';$('#status').textContent=e.message+' Use Load more to retry.';}finally{loading=false;render();}}
function showPlayer(){
  const ep=current.episodes[episodeIndex];
  const anime=current.anime,previous=recent.find(a=>String(a.id)===String(anime.id)&&Number(a.episode)===Number(ep?.number));
  setEpisode({anime,episode:ep,resumeAt:previous&&!previous.completed?Number(previous.position)||0:0,onProgress:progress=>recordWatched(anime,ep,progress)});
  $('#now-playing').textContent=ep?`Episode ${ep.number} · ${lang.toUpperCase()}`:'No episodes available';
  $('#previous').disabled=episodeIndex<=0;$('#next').disabled=episodeIndex>=current.episodes.length-1||episodeIndex<0;
  document.querySelectorAll('.episode').forEach(b=>{const active=Number(b.dataset.index)===episodeIndex;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});

}
function renderRecent(){
  const home=!location.hash||location.hash==='#home';$('#recently-watched').hidden=!home;
  $('#clear-recent').hidden=!recent.length;
  $('#recent-grid').innerHTML=recent.length?recent.slice(0,12).map(a=>{
    const percent=a.duration>0?Math.min(100,Math.max(0,a.position/a.duration*100)):0;
    const minutes=Math.floor((Number(a.position)||0)/60),seconds=Math.floor((Number(a.position)||0)%60);
    return `<a class="recent-card" href="#anime/${encodeURIComponent(String(a.id))}/episode/${Number(a.episode)}" aria-label="${a.completed?'Replay':'Continue'} ${escape(a.title)}, episode ${Number(a.episode)}"><div class="recent-image"><img src="${escape(safeUrl(a.background_image||a.poster))}" alt="${escape(a.title)}" loading="lazy" referrerpolicy="no-referrer"><span class="recent-play">&#9654;</span><span class="recent-episode">EP ${Number(a.episode)}</span><div class="recent-progress" role="progressbar" aria-label="Episode progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}"><span style="width:${percent}%"></span></div></div><h3>${escape(a.title)}</h3><p>${a.completed?'Watch again':`Continue &middot; ${minutes}:${String(seconds).padStart(2,'0')}`}</p></a>`;
  }).join(''):'<div class="recent-empty"><span>&#9655;</span><p>Your next episode is waiting.<small>Start watching an anime and it will appear here.</small></p><a class="button" href="#browse">Browse anime &#8599;</a></div>';
}
function recordWatched(anime,episode,progress){
  const row={id:anime.id,title:anime.title,poster:anime.poster,background_image:anime.background_image,episode:episode.number,position:progress.position,duration:progress.duration,completed:progress.completed,watchedAt:Date.now()};
  recent=[row,...recent.filter(a=>String(a.id)!==String(anime.id))].slice(0,20);store('anikoto-recently-watched',recent);
  history[anime.id]={episode:episode.number,lang:'sub'};store('anikoto-progress',history);renderRecent();
}
$('#clear-recent').onclick=()=>{recent=[];store('anikoto-recently-watched',recent);renderRecent();toast('Recently watched cleared');};
function drawEpisodes(){const query=$('#episode-search').value.trim().toLowerCase();$('#episodes').innerHTML=current.episodes.map((ep,index)=>({ep,index})).filter(({ep})=>!query||String(ep.number).includes(query)||String(ep.title).toLowerCase().includes(query)).map(({ep,index})=>`<button class="episode ${index===episodeIndex?'active':''}" data-index="${index}" aria-pressed="${index===episodeIndex}" title="${escape(ep.title)}">${escape(ep.number)}</button>`).join('')||'<span class="player-note">No episodes found.</span>';}
async function detail(id,token,requestedEpisode){
  $('#detail').innerHTML='<a class="back" href="#browse">← Back to anime</a><p role="status">Loading anime and episodes…</p>';
  try{const response=await request('/api/series/'+id);if(token!==routeToken)return;current=response.data;current.episodes=Array.isArray(current.episodes)?current.episodes:[];const a=current.anime;
    const resume=recent.find(x=>String(x.id)===String(a.id))||history[a.id];const wanted=requestedEpisode==='latest'?Math.max(0,...current.episodes.map(ep=>Number(ep.number)||0)):requestedEpisode??resume?.episode;episodeIndex=Math.max(0,current.episodes.findIndex(ep=>Number(ep.number)===Number(wanted)));if(!current.episodes.length)episodeIndex=-1;
    lang='sub';
    document.title=`${a.title} — Hoshivo`;
    $('#detail').innerHTML=`<a class="back" href="#browse">← Back to anime</a><div class="detail-intro"><img class="detail-poster" src="${escape(safeUrl(a.poster))}" alt="${escape(a.title)} poster" referrerpolicy="no-referrer"><div><div class="eyebrow">${escape(a.status||'ANIME')} · ${escape(a.year||'TBA')}</div><h1>${escape(a.title)}</h1><div class="chips"><span class="chip">★ ${escape(a.score||'Unrated')}</span>${genres(a).map(g=>`<span class="chip">${escape(g)}</span>`).join('')}<span class="chip">${current.episodes.length} episodes available</span></div><p class="detail-description">${escape(a.description||'No synopsis available.')}</p><button id="save-anime" class="button">${isSaved(a.id)?'✓ In watchlist':'+ Add to watchlist'}</button></div></div><div class="watch-layout"><div><div class="playback-toolbar"><p id="playback-status" role="status" aria-live="polite"></p><button class="button" id="reload-source">Reload video</button></div><div class="player" id="player"></div><div class="player-controls"><strong id="now-playing"></strong><span class="chip">SUB &middot; AnimeParadise</span><button class="button" id="previous">← Prev</button><button class="button" id="next">Next →</button></div><p class="player-note">Subtitled video by AnimeParadise. Your recently watched episodes and playback position are saved in this browser.</p><section id="anime-schedule" class="anime-schedule" aria-label="Anime release schedule"></section></div><aside class="episode-panel"><h3>Episodes <span class="chip">${current.episodes.length}</span></h3><input id="episode-search" type="search" placeholder="Find an episode…" aria-label="Find episode"><div class="episodes" id="episodes"></div></aside></div>`;
    $('#save-anime').onclick=()=>{if(isSaved(a.id)){saved=saved.filter(x=>String(x.id)!==String(a.id));toast('Removed from watchlist');}else{saved.push(a);toast('Added to watchlist');}store('anikoto-watchlist',saved);countSaved();$('#save-anime').textContent=isSaved(a.id)?'✓ In watchlist':'+ Add to watchlist';updateGenres();};
    $('#previous').onclick=()=>{if(episodeIndex>0){episodeIndex--;showPlayer();}};$('#next').onclick=()=>{if(episodeIndex<current.episodes.length-1){episodeIndex++;showPlayer();}};
    $('#episode-search').oninput=drawEpisodes;$('#episodes').onclick=e=>{const button=e.target.closest('[data-index]');if(button){episodeIndex=Number(button.dataset.index);showPlayer();}};drawEpisodes();showPlayer();loadAnimeSchedule(a.id);
  }catch(e){if(token===routeToken)$('#detail').innerHTML=`<a class="back" href="#browse">← Back to anime</a><p role="alert">${escape(e.message)}</p><button id="retry-detail" class="button">Retry</button>`;const retry=$('#retry-detail');if(retry)retry.onclick=()=>detail(id,token);}
}
function route(){destroyPlayer();clearAnimeSchedule();const token=++routeToken,hash=location.hash||'#home',match=hash.match(/^#anime\/([1-9]\d*|ap-[a-zA-Z0-9_-]{1,160})(?:\/(latest)|\/episode\/(\d+(?:\.\d+)?))?$/);$('#detail').hidden=!match;$('#dashboard-layout').hidden=!!match;showRankings(!hash||hash==='#home');$('#catalog').hidden=!!match;$('#hero').hidden=!!match||hash==='#watchlist'||hash==='#browse';document.querySelectorAll('.nav-link').forEach(a=>a.classList.toggle('active',a.hash===hash));renderRecent();if(match){detail(match[1],token,match[2]==='latest'?'latest':match[3]===undefined?undefined:Number(match[3]));window.scrollTo(0,0);}else{current=null;$('#detail').innerHTML='';document.title='Hoshivo — Your next obsession';render();if($('#search').value.trim())scheduleSearch();if(hash==='#home'){if(!latestItems.length)loadLatest();}else if(!items.length&&hash!=='#watchlist')loadMore();} }
$('#load-more').onclick=loadMore;$('#search').oninput=scheduleSearch;$('#genre').onchange=render;$('#language').onchange=render;window.addEventListener('hashchange',route);document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('#catalog').hidden){e.preventDefault();$('#search').focus();}});initDashboard();initSchedules();updateGenres();countSaved();route();
