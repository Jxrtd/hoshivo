export const qualityLabel=height=>height>=2160?`${height===2160?'4K':height+'p'}`:`${height}p`;
export function hlsQualities(levels){
  const byHeight=new Map();
  levels.forEach((level,index)=>{if(level.height>0&&(!byHeight.has(level.height)||level.bitrate>byHeight.get(level.height).bitrate))byHeight.set(level.height,{id:String(index),height:level.height,bitrate:level.bitrate||0,label:qualityLabel(level.height)});});
  return [...byHeight.values()].sort((a,b)=>b.height-a.height);
}
export function nativeQualities(text,base){
  const lines=text.split(/\r?\n/),levels=[];
  for(let i=0;i<lines.length;i++){
    if(!lines[i].startsWith('#EXT-X-STREAM-INF:'))continue;
    const size=/RESOLUTION=(\d+)x(\d+)/.exec(lines[i]),rate=/BANDWIDTH=(\d+)/.exec(lines[i]);
    const next=lines.slice(i+1).find(line=>line.trim()&&!line.startsWith('#'));if(!size||!next)continue;
    const url=new URL(next.trim(),base),origin=new URL(base).origin;
    if(url.origin!==origin||!/^\/api\/media\/[a-f0-9]{48}$/.test(url.pathname))continue;
    levels.push({height:Number(size[2]),bitrate:Number(rate?.[1]||0),url:url.pathname});
  }
  return hlsQualities(levels).map(row=>({...row,url:levels[Number(row.id)].url}));
}
