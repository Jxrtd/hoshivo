import {timelineSegments} from './skip.js';
const stamp=value=>{const seconds=Math.max(0,Math.floor(Number.isFinite(value)?value:0));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
const icons={play:'<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',pause:'<path d="M8 5v14M16 5v14" stroke-width="4"/>',volume:'<path d="m11 5-6 4H2v6h3l6 4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',muted:'<path d="m11 5-6 4H2v6h3l6 4Z"/><path d="m16 9 6 6m0-6-6 6"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',collapse:'<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[name]}</svg>`;
export function attachVideoControls(player,video,segments,onSeek,onPlayError,qualityApi){
  video.controls=false;player.classList.add('has-custom-controls');
  const controls=document.createElement('div');controls.className='video-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','Video playback controls');
  const seekWrap=document.createElement('div');seekWrap.className='video-seek-wrap';
  const track=document.createElement('div');track.className='video-seek-track';track.setAttribute('aria-hidden','true');
  const fill=document.createElement('span');fill.className='video-seek-progress';
  const seek=document.createElement('input');seek.className='video-seek';seek.type='range';seek.min='0';seek.max='0';seek.step='0.1';seek.value='0';seek.disabled=true;seek.setAttribute('aria-label','Seek video');
  const tooltip=document.createElement('span');tooltip.className='video-seek-tooltip';tooltip.hidden=true;tooltip.setAttribute('aria-hidden','true');
  const tooltipTime=document.createElement('span');tooltipTime.className='timeline-preview-time';tooltip.append(tooltipTime);
  seekWrap.append(track,seek,tooltip);controls.append(seekWrap);
  const row=document.createElement('div');row.className='video-controls-row';
  function button(label,text,action){const node=document.createElement('button');node.type='button';node.className='video-control-button';node.setAttribute('aria-label',label);node.title=label;node.innerHTML=icon(label==='Play'?'play':label==='Mute'?'volume':'expand');node.onclick=action;row.append(node);return node;}
  const play=button('Play','▶',async()=>{if(!video.paused){video.pause();return;}try{await video.play();}catch(e){if(e.name!=='AbortError')onPlayError(e.message);}});
  const time=document.createElement('span');time.className='video-time';row.append(time);
  const legend=document.createElement('span');legend.className='video-chapter-legend';row.append(legend);
  const mute=button('Mute','🔊',()=>{if(video.muted||video.volume===0){video.muted=false;if(video.volume===0)video.volume=1;}else video.muted=true;});
  const volume=document.createElement('input');volume.className='video-volume';volume.type='range';volume.min='0';volume.max='1';volume.step='0.05';volume.value=String(video.volume);volume.setAttribute('aria-label','Volume');volume.oninput=()=>{video.volume=Number(volume.value);video.muted=video.volume===0;};row.append(volume);
  const captions=document.createElement('select');captions.className='video-captions';captions.setAttribute('aria-label','Subtitles');row.append(captions);
  let captionChoice=null;
  function updateCaptions(){
    const tracks=Array.from(video.textTracks),selected=captionChoice??String(tracks.findIndex(t=>t.mode==='showing'));
    captions.replaceChildren(new Option('Subtitles off','-1'));
    tracks.forEach((t,i)=>{if(t.kind==='subtitles'||t.kind==='captions')captions.append(new Option(t.label||t.language||'Subtitles',String(i)));});
    captions.value=Array.from(captions.options).some(o=>o.value===selected)?selected:'-1';
  }
  captions.onchange=()=>{captionChoice=captions.value;Array.from(video.textTracks).forEach((t,i)=>{t.mode=String(i)===captionChoice?'showing':'disabled';});};
  const quality=document.createElement('select');quality.className='video-quality';quality.setAttribute('aria-label','Video quality');row.append(quality);
  function updateQuality(){const options=qualityApi?.options()||[];quality.replaceChildren(new Option('Auto','auto'),...options.map(item=>new Option(item.label,item.id)));quality.value=qualityApi?.selected()||'auto';quality.disabled=!options.length;quality.title=options.length?'Video quality':'This stream does not offer selectable resolutions';}
  quality.onchange=()=>qualityApi?.select(quality.value);video.addEventListener('qualitychange',updateQuality);updateQuality();
  const speed=document.createElement('select');speed.className='video-speed';speed.setAttribute('aria-label','Playback speed');for(const rate of [0.75,1,1.25,1.5,2])speed.append(new Option(rate+'×',String(rate)));speed.value='1';speed.onchange=()=>{video.playbackRate=Number(speed.value);};row.append(speed);
  const expanded=()=>player.classList.contains('mobile-fullscreen');
  const mobile=()=>window.matchMedia('(pointer:coarse)').matches;
  let orientationLocked=false;
  function unlockOrientation(){if(orientationLocked){try{screen.orientation?.unlock();}catch{}orientationLocked=false;}}
  function expandPlayer(){player.classList.add('mobile-fullscreen');player.classList.toggle('landscape-fullscreen',mobile());document.body.classList.add('player-fullscreen-open');}
  const isFullscreen=()=>document.fullscreenElement===player||document.webkitFullscreenElement===player||video.webkitDisplayingFullscreen||expanded();
  function exitExpanded(){player.classList.remove('mobile-fullscreen','landscape-fullscreen');document.body.classList.remove('player-fullscreen-open');unlockOrientation();}
  const fullscreen=button('Enter fullscreen','⛶',async()=>{
    const entering=!isFullscreen();
    try{
      if(expanded())exitExpanded();
      else if(document.fullscreenElement)await document.exitFullscreen();
      else if(document.webkitFullscreenElement)document.webkitExitFullscreen();
      else if(video.webkitDisplayingFullscreen)video.webkitExitFullscreen();
      else if(mobile()&&video.webkitEnterFullscreen&&video.readyState>=1)video.webkitEnterFullscreen();
      else if(player.requestFullscreen)await player.requestFullscreen();
      else if(player.webkitRequestFullscreen)player.webkitRequestFullscreen();
      else if(video.webkitEnterFullscreen&&video.readyState>=1)video.webkitEnterFullscreen();
      else throw new Error('Use expanded player');
    }catch{try{if(video.webkitEnterFullscreen&&video.readyState>=1)video.webkitEnterFullscreen();else expandPlayer();}catch{expandPlayer();}}
    if(entering&&mobile()&&document.fullscreenElement===player){
      try{await screen.orientation.lock('landscape');orientationLocked=true;if(disposed||!isFullscreen())unlockOrientation();}
      catch{/* Keep true fullscreen when the browser refuses orientation locking. */}
    }
    syncFullscreen();
  });
  controls.append(row);player.append(controls);
  let hideTimer,disposed=false;
  const originalCuePositions=new Map(),subtitleTracks=new Set();
  const cueMeasurements=new WeakMap();
  function cueHeight(cue,height){
    const width=Math.max(40,video.clientWidth*(cue.size||100)/100*0.95),font=Math.max(12,height*0.05),text=cue.getCueAsHTML().textContent||'';
    const key=[width,font,text].join(':');const cached=cueMeasurements.get(cue);if(cached?.key===key)return cached.height;
    const measure=document.createElement('div');
    measure.style.cssText=`position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;overflow-wrap:anywhere;font-family:sans-serif;font-size:${font}px;line-height:1.6;width:${width}px;`;
    measure.textContent=text||' ';document.body.append(measure);const result=Math.ceil(measure.getBoundingClientRect().height)+4;measure.remove();cueMeasurements.set(cue,{key,height:result});return result;
  }
  function restoreSubtitlePositions(){
    for(const [cue,original] of originalCuePositions){cue.snapToLines=original.snapToLines;cue.line=original.line;cue.lineAlign=original.lineAlign;}
  }
  function positionSubtitles(){
    if(disposed)return;
    // The native iPhone player manages its own captions and control clearance.
    if(video.webkitDisplayingFullscreen){restoreSubtitlePositions();return;}
    const height=video.clientHeight;if(height<=0)return;
    const padding=mobile()?Math.max(12,height*0.04):Math.max(28,height*0.08),controlHeight=controls.classList.contains('controls-hidden')?0:controls.offsetHeight;
    player.style.setProperty('--video-controls-height',controlHeight+'px');
    const bottom=Math.max(10,100-(controlHeight+padding)/height*100);
    const activeCues=[];
    for(const textTrack of video.textTracks){
      if(textTrack.mode!=='showing'||!['subtitles','captions'].includes(textTrack.kind))continue;
      for(const cue of Array.from(textTrack.activeCues||[])){
        if(!('line' in cue)||cue.vertical)continue;
        if(!originalCuePositions.has(cue))originalCuePositions.set(cue,{line:cue.line,snapToLines:cue.snapToLines,lineAlign:cue.lineAlign});
        activeCues.push(cue);
      }
    }
    const active=new Set(activeCues);let usedHeight=0;
    activeCues.sort((a,b)=>a.startTime-b.startTime||a.endTime-b.endTime);
    for(const cue of activeCues){
      const original=originalCuePositions.get(cue);
      // Keep a safe bottom margin even with hidden controls, preserving top signs.
      if(original.line==='auto'||(original.snapToLines&&original.line<0)||(!original.snapToLines&&original.line>bottom)){
        const line=Math.max(0,bottom-usedHeight/height*100);
        if(cue.snapToLines!==false)cue.snapToLines=false;if(cue.line!==line)cue.line=line;if(cue.lineAlign!=='end')cue.lineAlign='end';
        usedHeight+=cueHeight(cue,height);
      }else{if(cue.snapToLines!==original.snapToLines)cue.snapToLines=original.snapToLines;if(cue.line!==original.line)cue.line=original.line;if(cue.lineAlign!==original.lineAlign)cue.lineAlign=original.lineAlign;}
    }
    for(const [cue,original] of originalCuePositions){if(active.has(cue))continue;cue.snapToLines=original.snapToLines;cue.line=original.line;cue.lineAlign=original.lineAlign;}
  }
  function registerSubtitleTracks(){for(const textTrack of video.textTracks){if(subtitleTracks.has(textTrack))continue;subtitleTracks.add(textTrack);textTrack.addEventListener('cuechange',positionSubtitles);}positionSubtitles();}
  const subtitleResize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(positionSubtitles);subtitleResize?.observe(video);subtitleResize?.observe(controls);
  video.textTracks.addEventListener('addtrack',registerSubtitleTracks);video.textTracks.addEventListener('change',positionSubtitles);
  function hideControls(){
    clearTimeout(hideTimer);hideTimer=null;if(disposed||video.paused||video.ended)return;
    if(!tooltip.hidden&&window.matchMedia('(hover:hover)').matches){hideTimer=setTimeout(hideControls,5000);return;}
    if(controls.contains(document.activeElement)&&document.activeElement.tagName==='SELECT'){hideTimer=setTimeout(hideControls,5000);return;}
    if(controls.contains(document.activeElement))video.focus({preventScroll:true});
    tooltip.hidden=true;controls.classList.add('controls-hidden');controls.inert=true;controls.setAttribute('aria-hidden','true');player.classList.add('controls-idle');positionSubtitles();
  }
  function showControls(){
    if(disposed)return;clearTimeout(hideTimer);controls.classList.remove('controls-hidden');controls.inert=false;controls.removeAttribute('aria-hidden');player.classList.remove('controls-idle');positionSubtitles();
    if(!video.paused&&!video.ended)hideTimer=setTimeout(hideControls,5000);
  }
  function onNavigationKey(event){if(event.key==='Tab')showControls();}
  function onControlFocus(event){if(controls.contains(event.target))showControls();}
  player.addEventListener('pointermove',showControls);player.addEventListener('pointerdown',showControls);player.addEventListener('keydown',onNavigationKey);player.addEventListener('focusin',onControlFocus);
  // A seek emits playing/timeupdate again, but must not wake the controls.
  video.addEventListener('play',showControls);video.addEventListener('pause',showControls);video.addEventListener('ended',showControls);
  let duration=NaN,ranges=[];
  function update(){
    if(duration!==video.duration){
      duration=video.duration;ranges=timelineSegments(segments,duration);track.replaceChildren();legend.replaceChildren();
      for(const range of ranges){const area=document.createElement('span');area.className='video-seek-chapter '+range.kind;area.style.left=range.left+'%';area.style.width=range.width+'%';area.title=(range.kind==='intro'?'Intro':'Outro')+' '+stamp(range.start)+'–'+stamp(range.end);track.append(area);const label=document.createElement('span');label.className=range.kind;label.textContent=range.kind==='intro'?'Intro':'Outro';label.title=area.title;legend.append(label);}
      track.append(fill);seek.disabled=!Number.isFinite(duration)||duration<=0;seek.max=String(seek.disabled?0:duration);
      seek.setAttribute('aria-description',ranges.map(r=>`${r.kind}: ${stamp(r.start)} to ${stamp(r.end)}`).join('. '));
    }
    const current=video.currentTime||0;seek.value=String(current);fill.style.width=(duration>0?Math.max(0,Math.min(100,current/duration*100)):0)+'%';
    const active=ranges.find(r=>current>=r.start&&current<r.end);seek.setAttribute('aria-valuetext',stamp(current)+' of '+stamp(duration)+(active?', '+active.kind:''));
    time.textContent=stamp(current)+' / '+stamp(duration);if(play.dataset.state!==(video.paused?'play':'pause')){play.dataset.state=video.paused?'play':'pause';play.innerHTML=icon(play.dataset.state);}play.setAttribute('aria-label',video.paused?'Play':'Pause');play.title=video.paused?'Play':'Pause';
    const silent=video.muted||video.volume===0;if(mute.dataset.state!==(silent?'muted':'volume')){mute.dataset.state=silent?'muted':'volume';mute.innerHTML=icon(mute.dataset.state);}mute.setAttribute('aria-label',silent?'Unmute':'Mute');mute.title=silent?'Unmute':'Mute';volume.value=String(video.muted?0:video.volume);
  }
  seek.oninput=()=>{onSeek(Number(seek.value));update();};
  seek.onkeydown=event=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const next=event.key==='Home'?0:event.key==='End'?duration:video.currentTime+(event.key==='ArrowRight'?5:-5);onSeek(next);update();};
  seek.onpointermove=event=>{if(seek.disabled)return;const rect=seek.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),value=ratio*duration,range=ranges.find(r=>value>=r.start&&value<r.end);tooltipTime.textContent=stamp(value)+(range?' · '+(range.kind==='intro'?'Intro':'Outro')+' '+stamp(range.start)+'–'+stamp(range.end):'');const half=Math.min(87,rect.width*0.4);tooltip.style.left=Math.max(half,Math.min(rect.width-half,ratio*rect.width))+'px';tooltip.hidden=false;};
  seek.onpointerleave=()=>{tooltip.hidden=true;};
  const events=['timeupdate','durationchange','loadedmetadata','play','pause','ended','volumechange'];events.forEach(name=>video.addEventListener(name,update));video.textTracks.addEventListener('addtrack',updateCaptions);video.textTracks.addEventListener('change',updateCaptions);
  function videoKey(event){if(event.altKey||event.ctrlKey||event.metaKey||event.isComposing)return;const target=event.target;if(target instanceof Element&&(target.closest('input,textarea,select,button,a,[role="textbox"],[role="slider"]')||target.isContentEditable))return;if(event.key===' '||event.key==='k'){event.preventDefault();if(!event.repeat)play.click();}else if(event.target!==video)return;else if(event.key==='f'){event.preventDefault();fullscreen.click();}else if(event.key==='m'){event.preventDefault();mute.click();}}
  document.addEventListener('keydown',videoKey);video.addEventListener('click',clickVideo);
  function clickVideo(){play.click();}
  function syncFullscreen(){if(!isFullscreen())unlockOrientation();const label=isFullscreen()?'Exit fullscreen':'Enter fullscreen';fullscreen.setAttribute('aria-label',label);fullscreen.title=label;fullscreen.innerHTML=icon(isFullscreen()?'collapse':'expand');positionSubtitles();}
  function escapeExpanded(event){if(event.key==='Escape'&&expanded()){exitExpanded();syncFullscreen();}}
  document.addEventListener('keydown',escapeExpanded);document.addEventListener('webkitfullscreenchange',syncFullscreen);video.addEventListener('webkitbeginfullscreen',syncFullscreen);video.addEventListener('webkitendfullscreen',syncFullscreen);
  document.addEventListener('fullscreenchange',syncFullscreen);update();updateCaptions();registerSubtitleTracks();
  return ()=>{video.removeEventListener('qualitychange',updateQuality);exitExpanded();document.removeEventListener('keydown',escapeExpanded);document.removeEventListener('webkitfullscreenchange',syncFullscreen);video.removeEventListener('webkitbeginfullscreen',syncFullscreen);video.removeEventListener('webkitendfullscreen',syncFullscreen);disposed=true;clearTimeout(hideTimer);subtitleResize?.disconnect();video.textTracks.removeEventListener('addtrack',registerSubtitleTracks);video.textTracks.removeEventListener('change',positionSubtitles);for(const textTrack of subtitleTracks)textTrack.removeEventListener('cuechange',positionSubtitles);restoreSubtitlePositions();originalCuePositions.clear();player.removeEventListener('pointermove',showControls);player.removeEventListener('pointerdown',showControls);player.removeEventListener('keydown',onNavigationKey);player.removeEventListener('focusin',onControlFocus);video.removeEventListener('play',showControls);video.removeEventListener('pause',showControls);video.removeEventListener('ended',showControls);events.forEach(name=>video.removeEventListener(name,update));video.textTracks.removeEventListener('addtrack',updateCaptions);video.textTracks.removeEventListener('change',updateCaptions);document.removeEventListener('keydown',videoKey);video.removeEventListener('click',clickVideo);document.removeEventListener('fullscreenchange',syncFullscreen);controls.remove();player.classList.remove('has-custom-controls','controls-idle');};
}
