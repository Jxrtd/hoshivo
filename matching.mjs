const clean=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export const titleNames=anime=>[anime.title,anime.alternative,anime.native,...String(anime.titles||'').split(/[;,]/)].map(s=>String(s||'').trim()).filter(Boolean);
export function chooseMatch(candidates,anime){
  for(const key of ['ani_id','mal_id']){
    if(anime[key]){const exact=candidates.filter(row=>row[key]&&String(row[key])===String(anime[key]));if(exact.length===1)return exact[0];}
  }
  const names=titleNames(anime).map(clean);
  return candidates.find(row=>{
    if(['ani_id','mal_id'].some(key=>anime[key]&&row[key]&&String(anime[key])!==String(row[key])))return false;
    return titleNames(row).some(name=>names.includes(clean(name)))&&(!(Number(row.year)>=1900&&Number(row.year)<=2100)||!anime.year||Number(row.year)===Number(anime.year));
  });
}
export async function findMatch(anime,search,signal){
  const queries=[...new Set(titleNames(anime).flatMap(name=>[name,name.replace(/\s*\((?:19|20)\d{2}\)\s*/g,' ').trim()]))].slice(0,8);
  for(const query of queries){signal?.throwIfAborted();const match=chooseMatch(await search(query,signal),anime);if(match)return match;}
  return null;
}
