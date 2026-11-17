const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid='[a-fA-F0-9-]{36}';let controller=null,observer=null,host=null,query='',kind='all',catalogPage=1,detailRequest=0;
function history(){try{const rows=JSON.parse(localStorage.getItem('hoshivo-reading')||'{}');return rows&&typeof rows==='object'&&!Array.isArray(rows)?rows:{};}catch{return {};}}
function remember(manga,chapter,number,page=0){try{const rows=history();rows[manga.id]={id:manga.id,title:manga.title,poster:manga.poster,chapter,number,page,updated:Date.now()};const newest=Object.values(rows).sort((a,b)=>b.updated-a.updated).slice(0,30);localStorage.setItem('hoshivo-reading',JSON.stringify(Object.fromEntries(newest.map(row=>[row.id,row]))));}catch{}}
async function request(path){const response=await fetch(path,{signal:controller.signal}),data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Unable to load manga.');return data.data;}
const card=manga=>`<a class="card" href="#manga/${esc(manga.id)}"><div class="poster-wrap">${manga.poster?`<img src="${esc(manga.poster)}" alt="${esc(manga.title)} cover" loading="lazy" referrerpolicy="no-referrer">`:''}<span class="latest-episode">${esc(manga.kind)}</span></div><h3>${esc(manga.title)}</h3><div class="card-meta">${esc(manga.year||'TBA')} · ${esc(manga.status||'Manga')}</div></a>`;
export function mangaRoute(hash){return /^#(?:manga|read)(?:\/|$)/.test(hash);}
export function hideManga(){controller?.abort();controller=null;observer?.disconnect();observer=null;if(host)host.hidden=true;}
function shell(){if(!host){host=document.createElement('section');host.id='manga-section';host.className='manga-section';document.querySelector('main').append(host);}host.hidden=false;}
function failure(error,retry){if(error.name==='AbortError'||controller?.signal.aborted)return;host.innerHTML=`<a class="back" href="#manga">← Manga & manhwa</a><p role="alert">${esc(error.message)}</p>`;const button=document.createElement('button');button.className='button';button.textContent='Retry';button.onclick=retry;host.append(button);}
export async function showManga(hash){
  hideManga();shell();controller=new AbortController();const signal=controller.signal;
  const detail=hash.match(new RegExp(`^#manga/(${uuid})$`)),chapter=hash.match(new RegExp(`^#read/(${uuid})$`));
  host.innerHTML='<p role="status">Loading your library…</p>';window.scrollTo(0,0);
  try{if(chapter){await readChapter(chapter[1],signal);return;}if(detail){await titlePage(detail[1],signal);return;}if(hash!=='#manga')throw new Error('This reading link is invalid.');await catalog(signal);}catch(error){if(!signal.aborted)failure(error,()=>showManga(hash));}
}
async function catalog(signal){
  document.title='Manga & Manhwa — Hoshivo';
  host.innerHTML=`<div class="eyebrow">YOUR NEXT CHAPTER</div><h1>Manga & <em>manhwa.</em></h1><p class="manga-intro">Discover stories worth staying up for. Read available chapters, or pick up where you left off.</p><form class="toolbar" id="manga-search-form"><label class="search"><span>⌕</span><input id="manga-search" type="search" aria-label="Search manga and manhwa" placeholder="Search manga or manhwa…" value="${esc(query)}" maxlength="100"></label><select id="manga-kind" aria-label="Manga category"><option value="all">All stories</option><option value="manga">Manga</option><option value="manhwa">Manhwa</option><option value="manhua">Manhua</option></select><button class="button primary" type="submit">Search</button></form><section id="reading-recent"></section><p class="manga-provider">Catalog and available chapters by <a href="https://mangadex.org" target="_blank" rel="noopener noreferrer">MangaDex</a>. Coverage and chapter languages vary by title.</p><p id="manga-status" role="status">Loading titles…</p><div class="grid" id="manga-grid"></div><div class="latest-pagination" id="manga-pagination"></div>`;
  host.querySelector('#manga-kind').value=kind;
  host.querySelector('form').onsubmit=event=>{event.preventDefault();query=host.querySelector('#manga-search').value.trim();kind=host.querySelector('#manga-kind').value;catalogPage=1;showManga('#manga');};
  host.querySelector('#manga-kind').onchange=()=>host.querySelector('form').requestSubmit();
  const recent=Object.values(history()).filter(row=>row&&new RegExp(`^${uuid}$`).test(row.chapter)).sort((a,b)=>b.updated-a.updated).slice(0,6);
  if(recent.length)host.querySelector('#reading-recent').innerHTML='<h2>Continue reading<span>.</span></h2><div class="reading-recent-grid">'+recent.map(row=>`<a class="season-card" href="#read/${esc(row.chapter)}">${row.poster?`<img src="${esc(row.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}<div><strong>${esc(row.title)}</strong><span>Chapter ${esc(row.number||'—')} · Page ${Number(row.page||0)+1}</span></div></a>`).join('')+'</div>';
  const result=await request('/api/manga?'+new URLSearchParams({q:query,kind,page:catalogPage}));if(signal.aborted)return;
  host.querySelector('#manga-status').textContent=result.items.length?`${result.total.toLocaleString()} titles · Page ${result.page} of ${result.pages}`:'No matching titles found. Try another name or category.';
  host.querySelector('#manga-grid').innerHTML=result.items.map(card).join('');pagination(host.querySelector('#manga-pagination'),result.page,result.pages,page=>{catalogPage=page;showManga('#manga');});
}
function pagination(node,page,pages,change){
  node.replaceChildren();for(const [label,next,disabled]of [['← Previous',page-1,page<=1],['Next →',page+1,page>=pages]]){const button=document.createElement('button');button.className='button';button.textContent=label;button.disabled=disabled;button.onclick=()=>change(next);node.append(button);}const text=document.createElement('span');text.textContent=`Page ${page} of ${pages}`;node.insertBefore(text,node.lastChild);
}
async function titlePage(id,signal,lang='en',page=1){
  const version=++detailRequest,result=await request(`/api/manga/${id}?lang=${encodeURIComponent(lang)}&page=${page}`);if(signal.aborted||version!==detailRequest)return;
  const {manga,chapters}=result,saved=history()[id];document.title=manga.title+' — Hoshivo';
  host.innerHTML=`<a class="back" href="#manga">← Manga & manhwa</a><div class="detail-intro">${manga.poster?`<img class="detail-poster" src="${esc(manga.poster)}" alt="Cover" referrerpolicy="no-referrer">`:''}<div><div class="eyebrow">${esc(manga.kind)} · ${esc(manga.year||'TBA')}</div><h1>${esc(manga.title)}</h1><div class="chips">${[manga.status,...manga.tags.slice(0,6)].filter(Boolean).map(tag=>`<span class="chip">${esc(tag)}</span>`).join('')}</div><p class="detail-description">${esc(manga.description||'No description available.')}</p>${saved?`<a class="button primary" href="#read/${esc(saved.chapter)}">Continue chapter ${esc(saved.number||'—')}</a>`:chapters[0]?`<a class="button primary" href="#read/${esc(chapters[0].id)}">Start reading</a>`:''}</div></div><div class="section-heading"><h2>Chapters<span>.</span></h2><select id="chapter-language" aria-label="Chapter language"></select></div><p class="manga-provider">${result.total} chapters in this language. Missing chapters may not be available from MangaDex.</p><div class="manga-chapters"></div><div class="latest-pagination" id="chapter-pagination"></div>`;
  const language=host.querySelector('#chapter-language'),languages=[...new Set(['en',lang,...manga.languages])];
  const names=new Intl.DisplayNames(['en'],{type:'language'});for(const code of languages){let label=code;try{label=names.of(code)||code;}catch{}language.append(new Option(label,code));}language.value=lang;
  language.onchange=()=>{host.setAttribute('aria-busy','true');titlePage(id,signal,language.value).catch(e=>{if(!signal.aborted)failure(e,()=>showManga(location.hash));}).finally(()=>host.removeAttribute('aria-busy'));};
  host.querySelector('.manga-chapters').innerHTML=chapters.length?chapters.map(c=>`<a class="chapter-card ${saved?.chapter===c.id?'current':''}" href="#read/${esc(c.id)}"><strong>Chapter ${esc(c.number||'Oneshot')}</strong><span>${esc(c.title||'Untitled chapter')}</span><small>${c.pages} pages</small></a>`).join(''):'<p>No chapters available in this language. Try another language above.</p>';
  pagination(host.querySelector('#chapter-pagination'),result.page,result.pages,next=>titlePage(id,signal,lang,next).catch(e=>{if(!signal.aborted)failure(e,()=>showManga(location.hash));}));
}
async function readChapter(id,signal){
  const result=await request('/api/manga/chapter/'+id);if(signal.aborted)return;const {manga}=result,saved=history()[manga.id],resume=saved?.chapter===id?Number(saved.page)||0:0;
  document.title=`Chapter ${result.number||'Oneshot'} · ${manga.title} — Hoshivo`;
  const navigation=()=>`<div class="reader-navigation">${result.previous?`<a class="button" href="#read/${esc(result.previous)}">← Previous chapter</a>`:'<span></span>'}<a class="button" href="#manga/${manga.id}">All chapters</a>${result.next?`<a class="button" href="#read/${esc(result.next)}">Next chapter →</a>`:'<span></span>'}</div>`;
  host.innerHTML=`<a class="back" href="#manga/${manga.id}">← ${esc(manga.title)}</a><div class="reader-heading"><div><div class="eyebrow">${esc(manga.kind)} · ${esc(result.language)}</div><h1>Chapter ${esc(result.number||'Oneshot')}</h1><p>${esc(result.title)}</p></div><span id="reader-progress" role="status">Page 1 of ${result.pages.length}</span></div>${navigation()}<div class="reader-pages ${manga.kind==='Manhwa'?'webtoon':''}"></div>${navigation()}`;
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
