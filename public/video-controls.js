import {timelineSegments} from './skip.js';
const stamp=value=>{const seconds=Math.max(0,Math.floor(Number.isFinite(value)?value:0));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
export function attachVideoControls(player,video,segments,onSeek,onPlayError){
  video.controls=false;player.classList.add('has-custom-controls');
  const controls=document.createElement('div');controls.className='video-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','Video playback controls');
  const seekWrap=document.createElement('div');seekWrap.className='video-seek-wrap';
  const track=document.createElement('div');track.className='video-seek-track';track.setAttribute('aria-hidden','true');
  const fill=document.createElement('span');fill.className='video-seek-progress';
  const seek=document.createElement('input');seek.className='video-seek';seek.type='range';seek.min='0';seek.max='0';seek.step='0.1';seek.value='0';seek.disabled=true;seek.setAttribute('aria-label','Seek video');
  const tooltip=document.createElement('span');tooltip.className='video-seek-tooltip';tooltip.hidden=true;tooltip.setAttribute('aria-hidden','true');
  seekWrap.append(track,seek,tooltip);controls.append(seekWrap);
  const row=document.createElement('div');row.className='video-controls-row';
  function button(label,text,action){const node=document.createElement('button');node.type='button';node.className='video-control-button';node.setAttribute('aria-label',label);node.title=label;node.textContent=text;node.onclick=action;row.append(node);return node;}
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
  const speed=document.createElement('select');speed.className='video-speed';speed.setAttribute('aria-label','Playback speed');for(const rate of [0.75,1,1.25,1.5,2])speed.append(new Option(rate+'×',String(rate)));speed.value='1';speed.onchange=()=>{video.playbackRate=Number(speed.value);};row.append(speed);
  const fullscreen=button('Enter fullscreen','⛶',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await player.requestFullscreen();}catch(e){onPlayError('Fullscreen unavailable: '+e.message);}});
  controls.append(row);player.append(controls);
  let hideTimer,disposed=false;
  const originalCuePositions=new Map(),subtitleTracks=new Set();
  function restoreSubtitlePositions(){
    for(const [cue,original] of originalCuePositions){cue.snapToLines=original.snapToLines;cue.line=original.line;cue.lineAlign=original.lineAlign;}
  }
  function positionSubtitles(){
    if(disposed)return;
    const height=video.getBoundingClientRect().height;if(height<=0)return;
    const padding=Math.max(28,height*0.08),controlHeight=controls.classList.contains('controls-hidden')?0:controls.getBoundingClientRect().height;
    const bottom=Math.max(10,100-(controlHeight+padding)/height*100);
    for(const textTrack of video.textTracks){
      if(textTrack.mode!=='showing'||!['subtitles','captions'].includes(textTrack.kind))continue;
      for(const cue of Array.from(textTrack.activeCues||[])){
        if(!('line' in cue)||cue.vertical)continue;
        if(!originalCuePositions.has(cue))originalCuePositions.set(cue,{line:cue.line,snapToLines:cue.snapToLines,lineAlign:cue.lineAlign});
      }
    }
    for(const [cue,original] of originalCuePositions){
      // Keep a safe bottom margin even with hidden controls, preserving top signs.
      if(original.line==='auto'||(original.snapToLines&&original.line<0)||(!original.snapToLines&&original.line>bottom)){
        if(cue.snapToLines!==false)cue.snapToLines=false;if(cue.line!==bottom)cue.line=bottom;if(cue.lineAlign!=='end')cue.lineAlign='end';
      }else{if(cue.snapToLines!==original.snapToLines)cue.snapToLines=original.snapToLines;if(cue.line!==original.line)cue.line=original.line;if(cue.lineAlign!==original.lineAlign)cue.lineAlign=original.lineAlign;}
    }
  }
  function registerSubtitleTracks(){for(const textTrack of video.textTracks){if(subtitleTracks.has(textTrack))continue;subtitleTracks.add(textTrack);textTrack.addEventListener('cuechange',positionSubtitles);}positionSubtitles();}
  const subtitleResize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(positionSubtitles);subtitleResize?.observe(video);subtitleResize?.observe(controls);
  video.textTracks.addEventListener('addtrack',registerSubtitleTracks);video.textTracks.addEventListener('change',positionSubtitles);
  function hideControls(){
    clearTimeout(hideTimer);hideTimer=null;if(disposed||video.paused||video.ended)return;
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
    time.textContent=stamp(current)+' / '+stamp(duration);play.textContent=video.paused?'▶':'❚❚';play.setAttribute('aria-label',video.paused?'Play':'Pause');play.title=video.paused?'Play':'Pause';
    const silent=video.muted||video.volume===0;mute.textContent=silent?'🔇':'🔊';mute.setAttribute('aria-label',silent?'Unmute':'Mute');mute.title=silent?'Unmute':'Mute';volume.value=String(video.muted?0:video.volume);
  }
  seek.oninput=()=>{onSeek(Number(seek.value));update();};
  seek.onkeydown=event=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const next=event.key==='Home'?0:event.key==='End'?duration:video.currentTime+(event.key==='ArrowRight'?5:-5);onSeek(next);update();};
  seek.onpointermove=event=>{if(seek.disabled)return;const rect=seek.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),value=ratio*duration,range=ranges.find(r=>value>=r.start&&value<r.end);tooltip.textContent=stamp(value)+(range?' · '+(range.kind==='intro'?'Intro':'Outro')+' '+stamp(range.start)+'–'+stamp(range.end):'');tooltip.style.left=Math.max(12,Math.min(88,ratio*100))+'%';tooltip.hidden=false;};
  seek.onpointerleave=()=>{tooltip.hidden=true;};
  const events=['timeupdate','durationchange','loadedmetadata','play','pause','ended','volumechange'];events.forEach(name=>video.addEventListener(name,update));video.textTracks.addEventListener('addtrack',updateCaptions);video.textTracks.addEventListener('change',updateCaptions);
  function videoKey(event){if(event.target!==video)return;if(event.key===' '||event.key==='k'){event.preventDefault();play.click();}else if(event.key==='f'){event.preventDefault();fullscreen.click();}else if(event.key==='m'){event.preventDefault();mute.click();}}
  video.addEventListener('keydown',videoKey);
  function syncFullscreen(){fullscreen.setAttribute('aria-label',document.fullscreenElement===player?'Exit fullscreen':'Enter fullscreen');positionSubtitles();}
  document.addEventListener('fullscreenchange',syncFullscreen);update();updateCaptions();registerSubtitleTracks();
  return ()=>{disposed=true;clearTimeout(hideTimer);subtitleResize?.disconnect();video.textTracks.removeEventListener('addtrack',registerSubtitleTracks);video.textTracks.removeEventListener('change',positionSubtitles);for(const textTrack of subtitleTracks)textTrack.removeEventListener('cuechange',positionSubtitles);restoreSubtitlePositions();originalCuePositions.clear();player.removeEventListener('pointermove',showControls);player.removeEventListener('pointerdown',showControls);player.removeEventListener('keydown',onNavigationKey);player.removeEventListener('focusin',onControlFocus);video.removeEventListener('play',showControls);video.removeEventListener('pause',showControls);video.removeEventListener('ended',showControls);events.forEach(name=>video.removeEventListener(name,update));video.textTracks.removeEventListener('addtrack',updateCaptions);video.textTracks.removeEventListener('change',updateCaptions);video.removeEventListener('keydown',videoKey);document.removeEventListener('fullscreenchange',syncFullscreen);controls.remove();player.classList.remove('has-custom-controls','controls-idle');};
}
