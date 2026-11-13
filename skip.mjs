export function normalizeSkipData(data){
  const result={intro:null,outro:null};
  for(const name of ['intro','outro']){
    const range=data?.[name];if(!range||typeof range.start!=='number'||typeof range.end!=='number')continue;
    if(Number.isFinite(range.start)&&Number.isFinite(range.end)&&range.start>=0&&range.end>range.start&&range.end<=100000)result[name]={start:range.start,end:range.end};
  }
  if(result.intro&&result.outro&&result.outro.start<result.intro.end)result.outro=null;
  return result;
}
export async function loadSkipData(unitId,signal){
  try{
    const raw=unitId.replace(/^animeparadise:/,''),separator=raw.lastIndexOf(':');
    if(separator<0)return normalizeSkipData(null);
    const uid=raw.slice(0,separator),origin=raw.slice(separator+1);
    if(!/^[a-zA-Z0-9_-]+$/.test(uid)||!/^[a-zA-Z0-9_-]+$/.test(origin))return normalizeSkipData(null);
    const response=await fetch(`https://api.animeparadise.moe/ep/${encodeURIComponent(uid)}?origin=${encodeURIComponent(origin)}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
    if(!response.ok)return normalizeSkipData(null);
    const data=await response.json();return normalizeSkipData(data.data?.episode?.skipData);
  }catch{return normalizeSkipData(null);}
}
