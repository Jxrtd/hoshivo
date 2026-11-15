export function bufferAhead(video){
  for(let i=0;i<video.buffered.length;i++)if(video.currentTime>=video.buffered.start(i)-0.1&&video.currentTime<=video.buffered.end(i))return Math.max(0,video.buffered.end(i)-video.currentTime)/Math.max(0.25,video.playbackRate||1);
  return 0;
}
export function adaptiveCap({levels,current,cap=-1,buffer,bandwidth,lowSeconds=0,waitingSeconds=0,stableSeconds=0,droppedRatio=0,cooldown=Infinity}){
  if(levels.length<2||cooldown<10||!levels[current])return null;
  const ceiling=cap>=0?Math.min(cap,current):current;
  const struggling=waitingSeconds>=3||(lowSeconds>=4&&buffer<3&&bandwidth>0&&bandwidth<(levels[current].bitrate||0)*1.3)||droppedRatio>=0.1;
  if(struggling&&ceiling>0)return ceiling-1;
  if(cap>=0&&stableSeconds>=30&&buffer>=15&&cooldown>=30&&droppedRatio<0.03){
    const next=cap+1;
    if(next<levels.length&&levels[next].bitrate>0&&bandwidth>levels[next].bitrate*1.6)return next===levels.length-1?-1:next;
  }
  return null;
}
export function adaptiveConfig(connection){
  const hint=Number(connection?.downlink)*1e6;
  return {maxBufferLength:40,maxMaxBufferLength:60,backBufferLength:20,maxBufferSize:40*1000*1000,startLevel:-1,
    abrEwmaDefaultEstimate:connection?.saveData?300000:Math.max(300000,Math.min(2000000,Number.isFinite(hint)&&hint>0?hint*0.6:500000)),
    abrBandWidthFactor:0.8,abrBandWidthUpFactor:0.6,maxStarvationDelay:2,maxLoadingDelay:4};
}
export function monitorPlayback(video,engine,isAuto,onChange){
  let started=false,waitingAt=0,graceUntil=0,lastChange=0,stableSeconds=0,lowSeconds=0,previousFrames=null,droppedRatio=0,lastFrameAt=0;
  const reset=()=>{waitingAt=0;stableSeconds=0;lowSeconds=0;previousFrames=null;droppedRatio=0;graceUntil=Date.now()+5000;};
  const playing=()=>{started=true;waitingAt=0;};
  const waiting=()=>{if(!video.seeking&&!video.paused&&!waitingAt)waitingAt=Date.now();stableSeconds=0;};
  const quality=()=>{engine.autoLevelCapping=-1;reset();};
  video.addEventListener('playing',playing);video.addEventListener('waiting',waiting);video.addEventListener('seeking',reset);video.addEventListener('seeked',reset);video.addEventListener('qualitychange',quality);
  const timer=setInterval(()=>{
    const now=Date.now();
    if(!started||video.paused||video.ended||video.seeking||!isAuto()||now<graceUntil){stableSeconds=0;lowSeconds=0;return;}
    if(Number.isFinite(video.duration)&&video.duration-video.currentTime<5)return;
    const buffer=bufferAhead(video);lowSeconds=buffer<3?lowSeconds+1:0;stableSeconds=buffer>=15&&!waitingAt?stableSeconds+1:0;
    if(video.getVideoPlaybackQuality&&now-lastFrameAt>=5000){
      const frames=video.getVideoPlaybackQuality(),total=previousFrames?frames.totalVideoFrames-previousFrames.totalVideoFrames:0;
      droppedRatio=total>=30?Math.max(0,frames.droppedVideoFrames-previousFrames.droppedVideoFrames)/total:0;
      previousFrames=frames;lastFrameAt=now;
    }
    const current=engine.currentLevel>=0?engine.currentLevel:engine.nextLoadLevel;
    const cap=adaptiveCap({levels:engine.levels||[],current,cap:engine.autoLevelCapping,buffer,bandwidth:engine.bandwidthEstimate,lowSeconds,waitingSeconds:waitingAt?(now-waitingAt)/1000:0,stableSeconds,droppedRatio,cooldown:lastChange?(now-lastChange)/1000:Infinity});
    if(cap===null)return;
    engine.autoLevelCapping=cap;if(cap>=0)engine.nextAutoLevel=cap;lastChange=now;stableSeconds=0;lowSeconds=0;droppedRatio=0;onChange(cap);
  },1000);
  return ()=>{clearInterval(timer);video.removeEventListener('playing',playing);video.removeEventListener('waiting',waiting);video.removeEventListener('seeking',reset);video.removeEventListener('seeked',reset);video.removeEventListener('qualitychange',quality);};
}
