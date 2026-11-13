import {readSkipSettings,activeSkip} from './skip.js';
const $=s=>document.querySelector(s);
let session=null,hls=null,cleanup=()=>{};
export function destroyPlayer(){
  cleanup();cleanup=()=>{};session?.abort.abort();session=null;hls?.destroy();hls=null;
  const video=$('#player video');if(video){video.pause();video.removeAttribute('src');video.load();}$('#player')?.replaceChildren();$('#skip-controls')?.remove();
}
export async function setEpisode({anime,episode,resumeAt=0,onProgress}){
  const key=[anime.id,episode?.number].join(':');if(session?.key===key)return;
  destroyPlayer();if(!episode){$('#player').textContent='No episodes are available.';return;}
  const s={key,abort:new AbortController()};session=s;let latestPosition=resumeAt;
  const status=$('#playback-status');status.textContent='Loading episode…';
  const loadingMessage=document.createElement('div');loadingMessage.className='player-message';loadingMessage.textContent='Loading your episode…';$('#player').append(loadingMessage);
  const retry=()=>{if(session===s){session.key=null;setEpisode({anime,episode,resumeAt:latestPosition,onProgress});}};
  $('#reload-source').onclick=retry;
  let source;
  try{
    const query=new URLSearchParams({series:anime.id,episode:episode.number,refresh:'1'});
    const response=await fetch('/api/playback?'+query,{signal:AbortSignal.any([s.abort.signal,AbortSignal.timeout(80000)])});const data=await response.json();
    if(!response.ok||!data.ok)throw new Error(data.error||'Unable to load this episode.');source=data.data;
  }catch(e){if(session!==s)return;loadingMessage.textContent=e.message;status.textContent='Episode unavailable. You can retry using Reload video.';return;}
  if(session!==s)return;
  if(!/^\/api\/media\/[a-f0-9]{48}$/.test(source.url)){loadingMessage.textContent='Invalid video source.';return;}
  $('#player').replaceChildren();
  const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='auto';video.crossOrigin='anonymous';
  const poster=String(anime.background_image||anime.poster||'');if(poster.startsWith('https://'))video.poster=poster;
  for(const sub of source.subtitles||[]){if(!/^\/api\/media\/[a-f0-9]{48}$/.test(sub.url))continue;const track=document.createElement('track');track.kind='subtitles';track.label=sub.label||sub.language||'Subtitles';track.srclang=/^[a-z]{2,3}(-[a-zA-Z]+)?$/.test(sub.language)?sub.language:'en';track.src=sub.url;track.default=/^en(g)?$/i.test(sub.language||'');video.append(track);}
  const overlay=document.createElement('div');overlay.className='video-overlay';
  const button=document.createElement('button');button.className='button primary play-episode';button.textContent=`▶ Play episode ${episode.number}`;
  const hint=document.createElement('p');hint.className='video-hint';hint.setAttribute('role','status');hint.textContent=resumeAt>0?'Continue from where you left off.':'Press Play to start the video.';
  overlay.append(button,hint);$('#player').append(video,overlay);status.textContent='Press Play to start.';
  let timer,skipNoticeTimer,disposed=false,failed=false,hasPlayed=false,lastSaved=0,manualSkipOverride=null;
  const alive=()=>!disposed&&session===s&&$('#player video')===video;
  const save=()=>{if(hasPlayed){latestPosition=Number.isFinite(video.currentTime)?video.currentTime:0;onProgress?.({position:latestPosition,duration:Number.isFinite(video.duration)?video.duration:0,completed:video.ended});lastSaved=Date.now();}};
  const clear=()=>{clearTimeout(timer);timer=null;};
  const onHide=()=>{if(document.hidden)save();};document.addEventListener('visibilitychange',onHide);window.addEventListener('pagehide',save);
  cleanup=()=>{save();disposed=true;clear();clearTimeout(skipNoticeTimer);document.removeEventListener('visibilitychange',onHide);window.removeEventListener('pagehide',save);document.removeEventListener('keydown',onSeekKey,true);};
  const settings=readSkipSettings();
  const skipControls=document.createElement('div');skipControls.id='skip-controls';skipControls.className='skip-controls';
  const skipButtons=document.createElement('div');skipButtons.className='skip-buttons';$('#player').append(skipButtons);
  const manualButtons={};
  for(const kind of ['intro','outro']){
    const label=document.createElement('label');label.className='skip-toggle';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='auto-skip-'+kind;checkbox.checked=settings[kind];
    const text=document.createElement('span');text.textContent='Auto-skip '+kind;label.append(checkbox,text);skipControls.append(label);
    checkbox.onchange=()=>{settings[kind]=checkbox.checked;try{localStorage.setItem('anikoto-skip-settings',JSON.stringify(settings));}catch{}updateSkips();};
    const manual=document.createElement('button');manual.className='button skip-button';manual.textContent='Skip '+kind;manual.hidden=true;
    manual.onclick=()=>{const active=activeSkip(source.skip,video.currentTime,video.duration);if(active?.kind===kind)performSkip(active);};
    skipButtons.append(manual);manualButtons[kind]=manual;
  }
  const skipNote=document.createElement('span');skipNote.className='skip-availability';skipNote.textContent=source.skip?.intro||source.skip?.outro?'Skip timings available': 'No skip timings available for this episode.';
  skipControls.append(skipNote);$('#player').after(skipControls);
  const skipNotice=document.createElement('div');skipNotice.className='skip-notice';skipNotice.setAttribute('role','status');skipNotice.hidden=true;$('#player').append(skipNotice);
  video.tabIndex=0;video.setAttribute('aria-label','Episode player. Right Arrow: forward 5 seconds. Left Arrow: back 5 seconds.');video.setAttribute('aria-keyshortcuts','ArrowRight ArrowLeft');
  function onSeekKey(event){
    if(!alive()||!['ArrowRight','ArrowLeft'].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.isComposing)return;
    const target=event.target;if(target instanceof Element&&(target.closest('input,textarea,select,[role="textbox"],[role="slider"],[role="combobox"]')||target.isContentEditable))return;
    if(video.readyState<1||!Number.isFinite(video.duration)||video.duration<=0)return;
    event.preventDefault();event.stopImmediatePropagation();
    const delta=event.key==='ArrowRight'?5:-5,next=Math.max(0,Math.min(video.duration,video.currentTime+delta));
    // A deliberate rewind into an intro/outro must not be immediately undone
    // by automatic skipping. Offer the manual skip button for that pass.
    manualSkipOverride=activeSkip(source.skip,next,video.duration)?.kind||null;
    video.currentTime=next;latestPosition=next;save();
    skipNotice.textContent=delta>0?'Forward 5 seconds':'Back 5 seconds';skipNotice.hidden=false;clearTimeout(skipNoticeTimer);skipNoticeTimer=setTimeout(()=>{skipNotice.hidden=true;},1200);
    updateSkips();
  }
  document.addEventListener('keydown',onSeekKey,true);
  function performSkip(active){
    if(!alive()||video.seeking)return;
    video.currentTime=active.end;manualButtons.intro.hidden=true;manualButtons.outro.hidden=true;
    skipNotice.textContent='Skipped '+active.kind;skipNotice.hidden=false;clearTimeout(skipNoticeTimer);skipNoticeTimer=setTimeout(()=>{skipNotice.hidden=true;},2500);save();
  }
  function updateSkips(){
    if(!alive())return;
    const active=activeSkip(source.skip,video.currentTime,video.duration);
    if(active?.kind!==manualSkipOverride)manualSkipOverride=null;
    for(const kind of ['intro','outro'])manualButtons[kind].hidden=active?.kind!==kind||(settings[kind]&&manualSkipOverride!==kind);
    if(active&&settings[active.kind]&&manualSkipOverride!==active.kind&&hasPlayed&&!video.paused&&!video.seeking)performSkip(active);
  }
  video.addEventListener('timeupdate',updateSkips);video.addEventListener('seeked',updateSkips);video.addEventListener('loadedmetadata',updateSkips);
  const fail=text=>{if(!alive())return;clear();failed=true;overlay.hidden=false;button.disabled=false;button.textContent='Reload video';hint.textContent=text;status.textContent=text;};
  const loading=()=>{if(!alive())return;clear();overlay.hidden=false;button.disabled=true;button.textContent='Loading video…';hint.textContent='Waiting for video data.';status.textContent='Loading video…';timer=setTimeout(()=>fail('The stream did not start within 20 seconds. Reload the video to try again.'),20000);};
  button.onclick=async()=>{if(failed){retry();return;}loading();try{await video.play();}catch(e){if(!alive())return;if(e.name==='NotAllowedError'){clear();overlay.hidden=false;button.disabled=false;button.textContent='▶ Play episode';hint.textContent='Press Play again to allow playback.';}else fail(`Playback could not start: ${e.message}`);}};
  video.addEventListener('loadedmetadata',()=>{if(video.dataset.engine==='native'&&resumeAt>0&&Number.isFinite(video.duration)&&resumeAt<video.duration-5)video.currentTime=resumeAt;});
  video.addEventListener('loadeddata',()=>{if(alive()&&video.videoWidth){clear();status.textContent=video.paused?'Video ready. Press Play to start.':'Video loaded.';}});
  video.addEventListener('playing',()=>{if(!alive())return;clear();failed=false;hasPlayed=true;overlay.hidden=true;button.disabled=false;status.textContent='Playing';updateSkips();save();});
  video.addEventListener('timeupdate',()=>{if(alive()&&hasPlayed&&Date.now()-lastSaved>=5000)save();});
  video.addEventListener('ended',save);
  video.addEventListener('waiting',()=>{if(alive()&&!video.paused&&!failed)loading();});
  video.addEventListener('pause',()=>{if(!alive())return;save();if(failed)return;clear();overlay.hidden=false;button.disabled=false;button.textContent=video.ended?'↻ Replay episode':'▶ Resume episode';hint.textContent='Press Play to continue.';});
  video.addEventListener('error',()=>fail(`Playback failed (${video.error?.message||video.error?.code||'unknown error'}). Reload the video to retry.`));
  if(source.kind==='hls'){
    if(window.Hls?.isSupported()){video.dataset.engine='hls.js';hls=new window.Hls({maxBufferLength:20,maxMaxBufferLength:40,startPosition:resumeAt>0?resumeAt:-1});hls.on(window.Hls.Events.ERROR,(_,data)=>{if(data.fatal)fail(`Video could not load: ${data.details}. Reload the video to retry.`);});hls.loadSource(source.url);hls.attachMedia(video);}
    else if(video.canPlayType('application/vnd.apple.mpegurl')){video.dataset.engine='native';video.src=source.url;}
    else fail('This browser does not support this video format. Try Chrome, Edge, Firefox, or Safari.');
  }else{video.dataset.engine='native';video.src=source.url;}
}
