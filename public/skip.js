export function readSkipSettings(storage){
  try{const saved=JSON.parse((storage||localStorage).getItem('anikoto-skip-settings'));return {intro:typeof saved?.intro==='boolean'?saved.intro:true,outro:typeof saved?.outro==='boolean'?saved.outro:true};}catch{return {intro:true,outro:true};}
}
export function activeSkip(segments,time,duration){
  if(!Number.isFinite(time)||!Number.isFinite(duration)||duration<=0)return null;
  for(const kind of ['intro','outro']){
    const range=segments?.[kind];if(!range||!Number.isFinite(range.start)||!Number.isFinite(range.end)||range.start<0||range.end<=range.start)continue;
    const end=Math.min(range.end,duration);
    if(time>=range.start&&time<end-0.15)return {kind,end};
  }
  return null;
}
export function timelineSegments(segments,duration){
  if(!Number.isFinite(duration)||duration<=0)return [];
  return ['intro','outro'].flatMap(kind=>{
    const range=segments?.[kind];if(!range||!Number.isFinite(range.start)||!Number.isFinite(range.end)||range.start<0||range.end<=range.start)return [];
    const end=Math.min(duration,range.end);if(range.start>=end)return [];
    return [{kind,start:range.start,end,left:range.start/duration*100,width:(end-range.start)/duration*100}];
  });
}
