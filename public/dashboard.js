const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const periods=['day','week','month'],cache=new Map();let selected='day',sequence=0,loaded=false;
const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:'';}catch{return '';}};
async function load(period){
  selected=period;const request=++sequence;
  document.querySelectorAll('.ranking-tab').forEach(tab=>{const active=tab.dataset.period===period;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;});
  $('#ranking-list').setAttribute('aria-labelledby','ranking-'+period);$('#ranking-status').textContent='Loading '+period+' rankings…';$('#ranking-retry').hidden=true;
  $('#ranking-list').setAttribute('aria-busy','true');$('#ranking-list').replaceChildren();
  try{
    let rows=cache.get(period);if(!rows||rows.expires<Date.now()){
      const response=await fetch('/api/top-anime?period='+period);const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Rankings could not be loaded.');
      rows={data:data.data,expires:Date.now()+300000};cache.set(period,rows);
    }
    if(request!==sequence)return;
    $('#ranking-list').innerHTML=rows.data.map(a=>`<a class="ranking-item" href="#anime/${encodeURIComponent(a.id)}" aria-label="Rank ${a.rank}: ${escape(a.title)}"><span class="ranking-number">${String(a.rank).padStart(2,'0')}</span><img src="${escape(safeUrl(a.poster))}" alt="${escape(a.title)} poster" loading="lazy" referrerpolicy="no-referrer"><span class="ranking-copy"><strong>${escape(a.title)}</strong><span>${escape(a.type)}${a.sub?` <b>·</b> SUB ${Number(a.sub)}`:''}</span></span></a>`).join('');
    $('#ranking-status').textContent='';loaded=true;
  }catch(error){if(request!==sequence)return;$('#ranking-status').textContent=error.message;$('#ranking-retry').hidden=false;}
  finally{if(request===sequence)$('#ranking-list').setAttribute('aria-busy','false');}
}
export function initDashboard(){
  document.querySelectorAll('.ranking-tab').forEach(tab=>{
    tab.onclick=()=>load(tab.dataset.period);
    tab.onkeydown=event=>{let index=periods.indexOf(selected);if(event.key==='ArrowRight')index=(index+1)%3;else if(event.key==='ArrowLeft')index=(index+2)%3;else if(event.key==='Home')index=0;else if(event.key==='End')index=2;else return;event.preventDefault();$('#ranking-'+periods[index]).focus();load(periods[index]);};
  });
  $('#ranking-retry').onclick=()=>load(selected);
}
export function showRankings(visible){$('#rankings').hidden=!visible;$('#dashboard-layout').classList.toggle('without-rankings',!visible);if(visible&&!loaded)load(selected);}
