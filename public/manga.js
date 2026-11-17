import {libraryState,inLibrary,saveDialog,categoryManager,setSourceEnabled} from './library.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function coverImage(value){
  if(typeof value!=='string')return '';
  if(value.startsWith('/api/manga/cover/')||value.startsWith('/api/manga/source-cover/'))return value;
  try{const url=new URL(value);if(url.hostname==='uploads.mangadex.org'&&url.pathname.startsWith('/covers/'))return '/api/manga/cover/'+url.pathname.slice('/covers/'.length);}catch{}return '';
}
const uuid='(?:[a-fA-F0-9-]{36}|(?:mp|wc)-[A-Za-z0-9_-]{1,400})';let controller=null,observer=null,host=null,query='',kind='all',catalogPage=1,detailRequest=0,selectedSource='mangadex',libraryCategory='all',libraryQuery='',definitions=[];
function history(){try{const rows=JSON.parse(localStorage.getItem('hoshivo-reading')||'{}');return rows&&typeof rows==='object'&&!Array.isArray(rows)?rows:{};}catch{return {};}}
function remember(manga,chapter,number,page=0){try{const rows=history();rows[manga.id]={id:manga.id,title:manga.title,poster:manga.poster,source:manga.source||sourceOf(manga.id),chapter,number,page,updated:Date.now()};const newest=Object.values(rows).sort((a,b)=>b.updated-a.updated).slice(0,30);localStorage.setItem('hoshivo-reading',JSON.stringify(Object.fromEntries(newest.map(row=>[row.id,row]))));}catch{}}
async function request(path){const response=await fetch(path,{signal:controller.signal}),data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Unable to load manga.');return data.data;}
const card=manga=>`<a class="card" href="#manga/${esc(manga.id)}"><div class="poster-wrap">${manga.poster?`<img src="${esc(coverImage(manga.poster))}" alt="${esc(manga.title)} cover" loading="lazy" referrerpolicy="no-referrer">`:''}<span class="latest-episode">${esc(manga.kind)}</span></div><h3>${esc(manga.title)}</h3><div class="card-meta">${esc(manga.year||'TBA')} · ${esc(manga.status||'Manga')}</div></a>`;
function sourceOf(id){return id.startsWith('mp-')?'mangapill':id.startsWith('wc-')?'weebcentral':'mangadex';}
function sourceLabel(id){return {mangadex:'MangaDex',mangapill:'MangaPill',weebcentral:'Weeb Central'}[id]||id;}
function workspaceTabs(){const hash=location.hash;return `<div class="manga-workspace"><nav aria-label="Manga workspace"><a class="workspace-tab ${hash==='#manga/library'?'active':''}" href="#manga/library">Library <span>${Object.keys(libraryState().entries).length}</span></a><a class="workspace-tab ${hash==='#manga'||/^#(?:manga|read)\//.test(hash)&&!hash.endsWith('/sources')&&!hash.endsWith('/library')?'active':''}" href="#manga">Browse</a><a class="workspace-tab ${hash==='#manga/sources'?'active':''}" href="#manga/sources">Sources</a></nav></div>`;}
function saveButton(manga){const button=document.createElement('button');button.type='button';button.className='button library-save';button.dataset.libraryId=manga.id;button.dataset.libraryTitle=manga.title;button.textContent=inLibrary(manga.id)?'Edit categories':'+ Save to library';button.setAttribute('aria-label',inLibrary(manga.id)?'Edit categories for '+manga.title:'Save '+manga.title+' to library');button.onclick=()=>saveDialog({...manga,source:manga.source||sourceOf(manga.id)});return button;}
function renderCards(node,items){node.replaceChildren();for(const manga of items){const wrapper=document.createElement('article');wrapper.className='library-card';wrapper.innerHTML=card(manga);const source=document.createElement('small');source.className='library-source';source.textContent=sourceLabel(manga.source||sourceOf(manga.id));wrapper.append(source,saveButton(manga));node.append(wrapper);}}
window.addEventListener('hoshivo-library-change',()=>{
  if(location.hash==='#manga/library'||location.hash==='#manga/sources'){showManga(location.hash);return;}
  host?.querySelectorAll('[data-library-id]').forEach(button=>{button.textContent=inLibrary(button.dataset.libraryId)?'Edit categories':'+ Save to library';button.setAttribute('aria-label',inLibrary(button.dataset.libraryId)?'Edit categories for '+button.dataset.libraryTitle:'Save '+button.dataset.libraryTitle+' to library');});
});
function libraryView(){
  const data=libraryState(),entries=Object.values(data.entries).filter(entry=>entry&&typeof entry.id==='string'),categoryIds=new Set(data.categories.map(c=>c.id));
  if(!['all','uncategorized',...categoryIds].includes(libraryCategory))libraryCategory='all';
  const matches=(entry,category)=>category==='all'||(category==='uncategorized'?!(entry.categories||[]).some(id=>categoryIds.has(id)):(entry.categories||[]).includes(category));
  document.title='Reading library — Hoshivo';host.innerHTML=workspaceTabs()+`<div class="section-heading"><div><div class="eyebrow">YOUR PERSONAL SHELVES</div><h1>Library<span>.</span></h1></div><button class="button" id="manage-categories">Manage categories</button></div><p class="manga-intro">Save stories from any source and organize them your way.</p><div class="library-category-bar"></div><label class="search library-search"><span>⌕</span><input type="search" id="library-search" aria-label="Search your library" placeholder="Search your library…" value="${esc(libraryQuery)}"></label><p class="library-hint">Saved on this browser. Reading history stays separate from your library.</p><div class="grid" id="library-grid"></div>`;
  host.querySelector('#manage-categories').onclick=categoryManager;
  const filters=[{id:'all',name:'All'},{id:'uncategorized',name:'Uncategorized'},...data.categories];
  for(const category of filters){const button=document.createElement('button');button.className='library-category';button.setAttribute('aria-pressed',String(libraryCategory===category.id));button.textContent=category.name+' '+entries.filter(entry=>matches(entry,category.id)).length;button.onclick=()=>{libraryCategory=category.id;libraryView();};host.querySelector('.library-category-bar').append(button);}
  const draw=()=>{const items=entries.filter(entry=>matches(entry,libraryCategory)&&entry.title.toLowerCase().includes(libraryQuery.toLowerCase())).sort((a,b)=>a.title.localeCompare(b.title));const grid=host.querySelector('#library-grid');if(items.length)renderCards(grid,items);else grid.innerHTML='<p class="library-empty">No titles on this shelf yet. <a href="#manga">Browse sources</a> to save a story.</p>';};
  host.querySelector('#library-search').oninput=event=>{libraryQuery=event.target.value;draw();};draw();
}
async function sourceView(signal){
  if(!definitions.length)definitions=await request('/api/manga/sources');if(signal.aborted)return;
  document.title='Manga sources — Hoshivo';host.innerHTML=workspaceTabs()+'<div class="eyebrow">BUILD YOUR READING COLLECTION</div><h1>Sources<span>.</span></h1><p class="manga-intro">Enable the sources you want to browse. Each source has its own catalog and chapters.</p><div class="source-grid"></div><p class="library-hint">These are web-compatible source extensions for Hoshivo. Native Tachimanga, Mihon, APK, or JAR extension files cannot be installed in this browser.</p>';
  const enabled=libraryState().enabled;
  for(const source of definitions){const row=document.createElement('article');row.className='source-card';row.dataset.source=source.id;row.innerHTML=`<div class="source-icon">${esc(source.name.charAt(0))}</div><div class="source-copy"><h2>${esc(source.name)}</h2><span>${esc(source.language)}</span><p>${esc(source.description)}</p><small>${enabled.includes(source.id)?'Enabled':'Not enabled'}</small></div>`;
    const actions=document.createElement('div');actions.className='source-actions';const toggle=document.createElement('button');toggle.className='button';toggle.textContent=enabled.includes(source.id)?'Disable':'Add source';toggle.setAttribute('aria-label',(enabled.includes(source.id)?'Disable ':'Add ')+source.name);toggle.onclick=()=>{try{setSourceEnabled(source.id,!enabled.includes(source.id));}catch(error){failure(error,()=>showManga(location.hash));}};actions.append(toggle);
    if(enabled.includes(source.id)){const browse=document.createElement('a');browse.className='button primary';browse.textContent='Browse';browse.href='#manga';browse.onclick=()=>{selectedSource=source.id;query='';kind='all';catalogPage=1;};actions.append(browse);}row.append(actions);host.querySelector('.source-grid').append(row);
  }
}
export function mangaRoute(hash){return /^#(?:manga|read)(?:\/|$)/.test(hash);}
export function hideManga(){controller?.abort();controller=null;observer?.disconnect();observer=null;if(host)host.hidden=true;}
function shell(){if(!host){host=document.createElement('section');host.id='manga-section';host.className='manga-section';document.querySelector('main').append(host);}host.hidden=false;}
function failure(error,retry){if(error.name==='AbortError'||controller?.signal.aborted)return;host.innerHTML=workspaceTabs()+`<a class="back" href="#manga">← Manga & manhwa</a><p role="alert">${esc(error.message)}</p>`;const button=document.createElement('button');button.className='button';button.textContent='Retry';button.onclick=retry;host.append(button);}
export async function showManga(hash){
  hideManga();shell();controller=new AbortController();const signal=controller.signal;
  const detail=hash.match(new RegExp(`^#manga/(${uuid})$`)),chapter=hash.match(new RegExp(`^#read/(${uuid})$`));
  host.innerHTML='<p role="status">Loading your library…</p>';window.scrollTo(0,0);
  try{if(hash==='#manga/library'){libraryView();return;}if(hash==='#manga/sources'){await sourceView(signal);return;}if(chapter){await readChapter(chapter[1],signal);return;}if(detail){await titlePage(detail[1],signal);return;}if(hash!=='#manga')throw new Error('This reading link is invalid.');await catalog(signal);}catch(error){if(!signal.aborted)failure(error,()=>showManga(hash));}
}
async function catalog(signal){
  document.title='Manga & Manhwa — Hoshivo';
  host.innerHTML=workspaceTabs()+`<div class="eyebrow">YOUR NEXT CHAPTER</div><h1>Manga & <em>manhwa.</em></h1><p class="manga-intro">Discover stories worth staying up for. Read available chapters, or pick up where you left off.</p><form class="toolbar" id="manga-search-form"><label class="search"><span>⌕</span><input id="manga-search" type="search" aria-label="Search manga and manhwa" placeholder="Search manga or manhwa…" value="${esc(query)}" maxlength="100"></label><select id="manga-source" aria-label="Manga source"></select><select id="manga-kind" aria-label="Manga category"><option value="all">All stories</option><option value="manga">Manga</option><option value="manhwa">Manhwa</option><option value="manhua">Manhua</option></select><button class="button primary" type="submit">Search</button></form><section id="reading-recent"></section><p class="manga-provider">Choose an enabled source to browse its catalog. Available chapters vary by source.</p><p id="manga-status" role="status">Loading titles…</p><div class="grid" id="manga-grid"></div><div class="latest-pagination" id="manga-pagination"></div>`;
  if(!definitions.length)definitions=await request('/api/manga/sources');if(signal.aborted)return;
  const enabled=libraryState().enabled,sourceSelect=host.querySelector('#manga-source');for(const definition of definitions.filter(d=>enabled.includes(d.id)))sourceSelect.append(new Option(definition.name,definition.id));
  if(!enabled.includes(selectedSource))selectedSource=enabled[0]||'';sourceSelect.value=selectedSource;
  const typeSelect=host.querySelector('#manga-kind');if(selectedSource!=='mangadex')kind='all';typeSelect.value=kind;typeSelect.disabled=selectedSource!=='mangadex';typeSelect.title=typeSelect.disabled?'Type filters are available on MangaDex.':'';
  sourceSelect.onchange=()=>{selectedSource=sourceSelect.value;catalogPage=1;showManga('#manga');};
  host.querySelector('form').onsubmit=event=>{event.preventDefault();query=host.querySelector('#manga-search').value.trim();kind=host.querySelector('#manga-kind').value;catalogPage=1;showManga('#manga');};
  host.querySelector('#manga-kind').onchange=()=>host.querySelector('form').requestSubmit();
  const recent=Object.values(history()).filter(row=>row&&new RegExp(`^${uuid}$`).test(row.chapter)).sort((a,b)=>b.updated-a.updated).slice(0,6);
  if(recent.length)host.querySelector('#reading-recent').innerHTML='<h2>Continue reading<span>.</span></h2><div class="reading-recent-grid">'+recent.map(row=>`<a class="season-card" href="#read/${esc(row.chapter)}">${row.poster?`<img src="${esc(coverImage(row.poster))}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}<div><strong>${esc(row.title)}</strong><span>Chapter ${esc(row.number||'—')} · Page ${Number(row.page||0)+1}</span></div></a>`).join('')+'</div>';
  if(!selectedSource){host.querySelector('#manga-status').textContent='No sources enabled. Open Sources to add one.';return;}
  const result=await request('/api/manga?'+new URLSearchParams({q:query,kind,page:catalogPage,source:selectedSource}));if(signal.aborted)return;
  host.querySelector('#manga-status').textContent=result.items.length?`${result.total.toLocaleString()} titles · Page ${result.page} of ${result.pages}`:'No matching titles found. Try another name or category.';
  renderCards(host.querySelector('#manga-grid'),result.items);pagination(host.querySelector('#manga-pagination'),result.page,result.pages,page=>{catalogPage=page;showManga('#manga');});
}
function pagination(node,page,pages,change){
  node.replaceChildren();for(const [label,next,disabled]of [['← Previous',page-1,page<=1],['Next →',page+1,page>=pages]]){const button=document.createElement('button');button.className='button';button.textContent=label;button.disabled=disabled;button.onclick=()=>change(next);node.append(button);}const text=document.createElement('span');text.textContent=`Page ${page} of ${pages}`;node.insertBefore(text,node.lastChild);
}
async function titlePage(id,signal,lang='en',page=1){
  const version=++detailRequest,result=await request(`/api/manga/${id}?lang=${encodeURIComponent(lang)}&page=${page}`);if(signal.aborted||version!==detailRequest)return;
  const {manga,chapters}=result,saved=history()[id];document.title=manga.title+' — Hoshivo';
  host.innerHTML=`<a class="back" href="#manga">← Manga & manhwa</a><div class="detail-intro">${manga.poster?`<img class="detail-poster" src="${esc(coverImage(manga.poster))}" alt="Cover" referrerpolicy="no-referrer">`:''}<div><div class="eyebrow">${esc(manga.kind)} · ${esc(manga.year||'TBA')}</div><h1>${esc(manga.title)}</h1><div class="chips">${[manga.status,...manga.tags.slice(0,6)].filter(Boolean).map(tag=>`<span class="chip">${esc(tag)}</span>`).join('')}</div><p class="detail-description">${esc(manga.description||'No description available.')}</p>${saved?`<a class="button primary" href="#read/${esc(saved.chapter)}">Continue chapter ${esc(saved.number||'—')}</a>`:chapters[0]?`<a class="button primary" href="#read/${esc(chapters[0].id)}">Start reading</a>`:''}</div></div><div class="section-heading"><h2>Chapters<span>.</span></h2><select id="chapter-language" aria-label="Chapter language"></select></div><p class="manga-provider">${result.total} chapters in this language. Chapters may differ across sources.</p><div class="manga-chapters"></div><div class="latest-pagination" id="chapter-pagination"></div>`;
  const libraryButton=saveButton(manga);host.querySelector('.detail-intro>div:last-child').append(libraryButton);
  const language=host.querySelector('#chapter-language'),languages=[...new Set(['en',lang,...manga.languages])];
  const names=new Intl.DisplayNames(['en'],{type:'language'});for(const code of languages){let label=code;try{label=names.of(code)||code;}catch{}language.append(new Option(label,code));}language.value=lang;
  language.onchange=()=>{host.setAttribute('aria-busy','true');titlePage(id,signal,language.value).catch(e=>{if(!signal.aborted)failure(e,()=>showManga(location.hash));}).finally(()=>host.removeAttribute('aria-busy'));};
  host.querySelector('.manga-chapters').innerHTML=chapters.length?chapters.map(c=>`<a class="chapter-card ${saved?.chapter===c.id?'current':''}" href="#read/${esc(c.id)}"><strong>Chapter ${esc(c.number||'Oneshot')}</strong><span>${esc(c.title||'Untitled chapter')}</span><small>${c.pages===null?'':c.pages+' pages'}</small></a>`).join(''):'<p>No chapters available in this language. Try another language above.</p>';
  pagination(host.querySelector('#chapter-pagination'),result.page,result.pages,next=>titlePage(id,signal,lang,next).catch(e=>{if(!signal.aborted)failure(e,()=>showManga(location.hash));}));
}
async function readChapter(id,signal){
  const result=await request('/api/manga/chapter/'+id);if(signal.aborted)return;const {manga}=result,saved=history()[manga.id],resume=saved?.chapter===id?Number(saved.page)||0:0;
  document.title=`Chapter ${result.number||'Oneshot'} · ${manga.title} — Hoshivo`;
  const navigation=()=>`<div class="reader-navigation">${result.previous?`<a class="button" href="#read/${esc(result.previous)}">← Previous chapter</a>`:'<span></span>'}<a class="button" href="#manga/${manga.id}">All chapters</a>${result.next?`<a class="button" href="#read/${esc(result.next)}">Next chapter →</a>`:'<span></span>'}</div>`;
  host.innerHTML=workspaceTabs()+`<a class="back" href="#manga/${manga.id}">← ${esc(manga.title)}</a><div class="reader-heading"><div><div class="eyebrow">${esc(manga.kind)} · ${esc(result.language)}</div><h1>Chapter ${esc(result.number||'Oneshot')}</h1><p>${esc(result.title)}</p></div><span id="reader-progress" role="status">Page 1 of ${result.pages.length}</span></div>${navigation()}<div class="reader-pages ${manga.kind==='Manhwa'?'webtoon':''}"></div>${navigation()}`;
  host.querySelector('.reader-heading').append(saveButton(manga));
  remember(manga,id,result.number,resume);
  const pages=host.querySelector('.reader-pages');result.pages.forEach((url,index)=>{
    const figure=document.createElement('figure');figure.dataset.page=String(index);
    const image=document.createElement('img');image.src=url;image.alt=`Page ${index+1}`;image.width=800;image.height=1100;image.loading=index<2?'eager':'lazy';image.decoding='async';
    const retry=document.createElement('button');retry.className='button page-retry';retry.textContent='Retry page '+(index+1);retry.hidden=true;image.onerror=()=>{retry.hidden=false;};image.onload=()=>{retry.hidden=true;};retry.onclick=()=>{image.src=url+'?retry='+Date.now();retry.hidden=true;};figure.append(image,retry);pages.append(figure);
  });
  observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const page=Number(entry.target.dataset.page);remember(manga,id,result.number,page);const text=host.querySelector('#reader-progress');if(text)text.textContent=`Page ${page+1} of ${result.pages.length}`;}},{rootMargin:'-15% 0px -40% 0px'});
  pages.querySelectorAll('figure').forEach(figure=>observer.observe(figure));
  if(resume>0&&resume<result.pages.length)pages.children[resume].scrollIntoView({block:'start'});
}
