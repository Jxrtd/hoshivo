import {subtitleVtt} from './subtitles.js';
export function attachCaptions(player,video){
  const abort=new AbortController(),options={signal:abort.signal},urls=[];let disposed=false;
  const root=document.createElement('div');root.className='video-captions';
  const trigger=document.createElement('button');trigger.type='button';trigger.className='caption-trigger';trigger.setAttribute('aria-label','Subtitles');trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');root.append(trigger);
  const menu=document.createElement('div');menu.className='caption-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Subtitle tracks');player.append(menu);
  const input=document.createElement('input');input.type='file';input.accept='.vtt,.srt,.ass,.ssa';input.hidden=true;input.setAttribute('aria-label','Load subtitle file');root.append(input);
  const entries=()=>Array.from(video.textTracks).map((track,index)=>({track,index})).filter(({track})=>['subtitles','captions'].includes(track.kind));
  function close(focus=false){menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus({preventScroll:true});}
  function select(index){Array.from(video.textTracks).forEach((track,i)=>{if(['subtitles','captions'].includes(track.kind))track.mode=i===index?'showing':'disabled';});close(true);update();}
  function update(){
    const tracks=entries(),chosen=tracks.find(({track})=>track.mode==='showing');trigger.textContent=chosen?chosen.track.label||chosen.track.language:'Subtitles off';trigger.title='Subtitles: '+trigger.textContent;
    menu.replaceChildren();const heading=document.createElement('div');heading.className='caption-menu-heading';heading.textContent='Subtitles';menu.append(heading);
    function item(label,index,format){const button=document.createElement('button');button.type='button';button.className='caption-option';button.setAttribute('role','menuitemradio');button.setAttribute('aria-label',format?label+' '+format:label);button.setAttribute('aria-checked',String(index===(chosen?.index??-1)));const text=document.createElement('span');text.textContent=label;button.append(text);if(format){const badge=document.createElement('small');badge.className='caption-format';badge.textContent=format;button.append(badge);}button.onclick=()=>select(index);menu.append(button);}
    item('Off',-1);
    for(const {track,index}of tracks){const element=Array.from(video.querySelectorAll('track')).find(node=>node.track===track);item(track.label||track.language||'Subtitles',index,element?.dataset.format||'VTT');}
    if(!tracks.length){const empty=document.createElement('p');empty.className='caption-empty';empty.textContent='No subtitles supplied for this episode. Load a subtitle file to add your own.';menu.append(empty);}
    const load=document.createElement('button');load.type='button';load.className='caption-load';load.setAttribute('role','menuitem');load.textContent='Load subtitle file…';load.onclick=()=>input.click();menu.append(load);
  }
  trigger.onclick=()=>{if(!menu.hidden){close();return;}update();menu.hidden=false;trigger.setAttribute('aria-expanded','true');};
  input.onchange=async()=>{
    const file=input.files?.[0];if(!file)return;
    try{
      if(file.size>2*1024*1024)throw new Error('Subtitle files must be smaller than 2 MB.');
      const text=subtitleVtt(await file.text());if(disposed)return;
      const url=URL.createObjectURL(new Blob([text],{type:'text/vtt'}));urls.push(url);
      const track=document.createElement('track');track.kind='subtitles';track.label=file.name;track.srclang='und';track.dataset.format=(file.name.split('.').at(-1)||'VTT').toUpperCase();track.src=url;video.append(track);
      Array.from(video.textTracks).forEach(t=>{if(['subtitles','captions'].includes(t.kind))t.mode=t===track.track?'showing':'disabled';});close();update();
    }catch(error){if(disposed)return;update();const message=document.createElement('p');message.className='caption-empty';message.setAttribute('role','alert');message.textContent=error.message;menu.append(message);menu.hidden=false;trigger.setAttribute('aria-expanded','true');}
    input.value='';
  };
  document.addEventListener('pointerdown',event=>{if(!root.contains(event.target)&&!menu.contains(event.target))close();},options);
  menu.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();
    const buttons=Array.from(menu.querySelectorAll('button')),index=buttons.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();
  },options);
  trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();if(menu.hidden)trigger.click();menu.querySelector('button')?.focus();}},options);
  video.textTracks.addEventListener('addtrack',update,options);video.textTracks.addEventListener('change',update,options);update();
  return {element:root,open:()=>!menu.hidden,destroy(){disposed=true;abort.abort();urls.forEach(url=>URL.revokeObjectURL(url));menu.remove();root.remove();}};
}
