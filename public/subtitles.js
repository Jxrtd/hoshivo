function timestamp(value){
  const match=/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(value.trim());if(!match)return null;
  const hours=Number(match[1]||0),minutes=Number(match[2]),seconds=Number(match[3]);if(minutes>59||seconds>59)return null;
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${match[4].padEnd(3,'0')}`;
}
export function subtitleVtt(input){
  const text=String(input).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
  if(/^WEBVTT(?:\s|$)/.test(text))return text+'\n';
  const cues=[];
  if(/\[Events\]/i.test(text)){
    let active=false,fields=['layer','start','end','style','name','marginl','marginr','marginv','effect','text'];
    for(const line of text.split('\n')){
      if(/^\[/.test(line)){active=/^\[Events\]/i.test(line);continue;}if(!active)continue;
      if(/^Format:/i.test(line)){fields=line.slice(line.indexOf(':')+1).split(',').map(f=>f.trim().toLowerCase());continue;}
      if(!/^Dialogue:/i.test(line)||fields.at(-1)!=='text')continue;
      const values=line.slice(line.indexOf(':')+1).split(','),start=timestamp(values[fields.indexOf('start')]||''),end=timestamp(values[fields.indexOf('end')]||'');
      let content=values.slice(fields.length-1).join(',');if(!start||!end||/\\p[1-9]/.test(content))continue;
      const top=/\\an[789]\b/.test(content);content=content.replace(/\{[^}]*\}/g,'').replace(/\\[Nn]/g,'\n').replace(/\\h/g,' ').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').trim();
      if(content)cues.push(`${start} --> ${end}${top?' line:10%':''}\n${content}`);
    }
  }else{
    for(const block of text.split(/\n\s*\n/)){
      const lines=block.split('\n'),index=lines.findIndex(line=>line.includes('-->'));if(index<0)continue;
      const times=lines[index].split('-->'),start=timestamp(times[0]),end=timestamp(times[1]?.trim().split(/\s/)[0]||'');if(!start||!end)continue;
      const content=lines.slice(index+1).join('\n').trim();if(content)cues.push(`${start} --> ${end}\n${content}`);
    }
  }
  if(!cues.length)throw new Error('No readable captions were found in this subtitle file.');
  return 'WEBVTT\n\n'+cues.join('\n\n')+'\n';
}
