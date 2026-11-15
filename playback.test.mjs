import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseMatch} from './playback.mjs';
import {findMatch} from './matching.mjs';
import {hlsQualities,nativeQualities} from './public/quality.js';
import {relatedSeasons} from './paradise.mjs';
test('quality choices reflect actual renditions and reject external variant URLs',()=>{
  assert.deepEqual(hlsQualities([{height:1080,bitrate:100},{height:1080,bitrate:200},{height:2160,bitrate:300}]).map(r=>[r.id,r.label]),[['2','4K'],['1','1080p']]);
  const token='a'.repeat(48),manifest=`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100,RESOLUTION=1920x1080\n/api/media/${token}\n#EXT-X-STREAM-INF:RESOLUTION=3840x2160\nhttps://evil.example/video.m3u8`;
  assert.equal(nativeQualities(manifest,'https://hoshivo.test/api/media/'+token).length,1);
  assert.deepEqual(nativeQualities('#EXTM3U\n#EXTINF:10,\nsegment.ts','https://hoshivo.test/master'),[]);
});
test('season links follow sequels and prequels, avoid cycles, and exclude unrelated titles',async()=>{
  const previous=globalThis.fetch;
  const row=(n,relations)=>({_id:'season-'+n,link:'season-'+n,title:'Season '+n,animeSeason:{year:2020+n},mappings:{anilist:n},relations});
  const relation=(n,type='SEQUEL')=>({anilist:n,type:'ANIME',relationType:type});
  const one=row(1,[relation(2)]),two=row(2,[relation(1,'PREQUEL'),relation(3)]),three=row(3,[relation(2,'PREQUEL')]);
  const paths={'/anime/season-1':one,'/anime/season-1/relations':[two,row(99,[])],'/anime/season-2/relations':[one,three],'/anime/season-3/relations':[two]};
  globalThis.fetch=async url=>{const path=new URL(url).pathname;if(!(path in paths))throw new Error('Unexpected provider path');return Response.json({data:paths[path]});};
  try{const seasons=await relatedSeasons({id:'ap-season-test',source_id:'animeparadise:season-1'});assert.deepEqual(seasons.map(a=>a.title),['Season 1','Season 2','Season 3']);assert.equal(seasons.filter(a=>a.current).length,1);}finally{globalThis.fetch=previous;}
});
import {isPublicAddress,validateTarget,rewriteManifest,looksLikeHtml} from './media.mjs';
test('catalog matching retries alternate names and recognizes provider aliases',async()=>{
  const queries=[];const match=await findMatch({title:'Frieren: Beyond Journey’s End',alternative:'Sousou no Frieren',year:2023},async q=>{queries.push(q);return q==='Sousou no Frieren'?[{source_id:'animeparadise:correct',title:'Different English Label',alternative:'Sousou no Frieren',year:2023}]:[];});
  assert.equal(match.source_id,'animeparadise:correct');assert.deepEqual(queries,['Frieren: Beyond Journey’s End','Sousou no Frieren']);
});
test('catalog IDs identify renamed titles and conflicting IDs reject a match',()=>{
  assert.equal(chooseMatch([{title:'Renamed title',ani_id:123,year:2025}],{title:'Original title',ani_id:'123',year:2026})?.title,'Renamed title');
  assert.equal(chooseMatch([{title:'Same Title',mal_id:2}],{title:'Same Title',mal_id:1}),undefined);
  assert.equal(chooseMatch([{title:'別の作品'}],{title:'葬送のフリーレン'}),undefined);
});
test('MPEG-TS segments mislabeled as HTML are not discarded as error pages',()=>{assert.equal(looksLikeHtml(Buffer.from('474000130000b00d0001c100000001ef','hex')),false);assert.equal(looksLikeHtml(Buffer.from('<!DOCTYPE html><html><body>Not found</body></html>')),true);assert.equal(looksLikeHtml(Buffer.from('<html lang="en">Error</html>')),true);});
test('title matching avoids selecting a sequel or wrong release year',()=>{const anime={title:'One Piece',year:1999};assert.equal(chooseMatch([{id:'film',title:'One Piece Film Red'},{id:'wrong',title:'ONE PIECE',year:2025},{id:'right',title:'ONE PIECE',year:1999}],anime)?.id,'right');assert.equal(chooseMatch([{title:'One Piece Film Red'}],anime),undefined);});
test('media relay rejects private targets and non HTTPS URLs',async()=>{for(const address of ['127.0.0.1','10.0.0.1','172.16.1.1','192.168.0.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1','fe80::1'])assert.equal(isPublicAddress(address),false,address);assert.equal(isPublicAddress('8.8.8.8'),true);for(const url of ['http://example.com/x','https://127.0.0.1/x','https://[::1]/x','https://example.com:8080/x','https://user:pass@example.com/x'])await assert.rejects(()=>validateTarget(url));});
test('HLS rewrite covers variants, segments, encryption keys, and initialization maps',()=>{const text='#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\n../720/index.m3u8\nchunk.ts';const urls=[];const rewritten=rewriteManifest(text,'https://cdn.example.com/show/master.m3u8',url=>{urls.push(url);return '/token/'+urls.length;});assert.deepEqual(urls,['https://cdn.example.com/show/key.bin','https://cdn.example.com/show/init.mp4','https://cdn.example.com/720/index.m3u8','https://cdn.example.com/show/chunk.ts']);assert.ok(rewritten.includes('URI="/token/1"'));assert.ok(!rewritten.includes('chunk.ts'));});
