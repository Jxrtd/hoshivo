export function attachPreview(host,source,main){
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;canvas.className='timeline-preview';canvas.hidden=true;
  const note=document.createElement('span');note.className='timeline-preview-note';host.prepend(canvas,note);
  const context=canvas.getContext('2d'),cache=new Map();
  let timer,deadline,media=null,engine=null,events=null,wanted=0,visible=false,disposed=false;
  function stop(){clearTimeout(timer);timer=null;clearTimeout(deadline);events?.abort();events=null;engine?.destroy();engine=null;if(media){media.pause();media.removeAttribute('src');media.load();media=null;}}
  function unavailable(){if(!visible||disposed)return;note.textContent='Preview unavailable';canvas.hidden=true;stop();}
  function display(frame){clearTimeout(deadline);context.drawImage(frame,0,0,160,90);canvas.hidden=false;note.textContent='';}
  function seek(){if(!media||media.readyState<1||media.seeking)return;const target=Math.min(wanted,Number.isFinite(media.duration)?Math.max(0,media.duration-0.1):wanted);if(Math.abs(media.currentTime-target)>0.25)media.currentTime=target;else frame();}
  function frame(){
    if(!visible||!media||media.seeking||media.readyState<2)return;
    const target=Math.min(wanted,Number.isFinite(media.duration)?Math.max(0,media.duration-0.1):wanted);
    if(Math.abs(media.currentTime-target)>0.5){seek();return;}
    try{const snapshot=document.createElement('canvas');snapshot.width=160;snapshot.height=90;snapshot.getContext('2d').drawImage(media,0,0,160,90);cache.set(wanted,snapshot);if(cache.size>60)cache.delete(cache.keys().next().value);display(snapshot);}catch{unavailable();}
  }
  function load(){
    if(!visible||disposed||cache.has(wanted))return;
    if(!source?.url||!context||(!main.paused&&main.readyState<3)){note.textContent='Preview unavailable while buffering';return;}
    clearTimeout(deadline);deadline=setTimeout(unavailable,10000);
    if(media){seek();return;}
    media=document.createElement('video');media.muted=true;media.playsInline=true;media.preload='auto';media.crossOrigin='anonymous';events=new AbortController();
    for(const [name,fn]of [['loadedmetadata',seek],['loadeddata',frame],['seeked',frame],['error',unavailable]])media.addEventListener(name,fn,{signal:events.signal});
    if(source.kind==='hls'&&window.Hls?.isSupported()){
      engine=new window.Hls({autoStartLoad:false,startLevel:0,maxBufferLength:2,maxMaxBufferLength:4,backBufferLength:0,maxBufferSize:4*1000*1000});
      engine.on(window.Hls.Events.MANIFEST_PARSED,()=>{if(!engine)return;engine.autoLevelCapping=0;engine.startLoad(wanted);});engine.on(window.Hls.Events.ERROR,(_,data)=>{if(data.fatal)unavailable();});engine.loadSource(source.url);engine.attachMedia(media);
    }else if(source.kind!=='hls'||media.canPlayType('application/vnd.apple.mpegurl'))media.src=source.url;
    else unavailable();
  }
  return {
    show(time){if(disposed)return;visible=true;const next=Math.max(0,Math.floor(time/5)*5);if(next===wanted&&(timer||!canvas.hidden))return;wanted=next;clearTimeout(timer);if(cache.has(wanted)){display(cache.get(wanted));return;}canvas.hidden=true;note.textContent='Loading preview…';timer=setTimeout(()=>{timer=null;load();},250);},
    hide(){visible=false;canvas.hidden=true;note.textContent='';stop();},
    destroy(){disposed=true;visible=false;stop();cache.clear();canvas.remove();note.remove();}
  };
}
