import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseMatch} from './playback.mjs';
import {findMatch} from './matching.mjs';
import {hlsQualities,nativeQualities} from './public/quality.js';
import {relatedSeasons} from './paradise.mjs';
import {adaptiveCap,adaptiveConfig,bufferAhead,streamRecovery} from './public/adaptive.js';
import {issueMedia} from './media.mjs';
test('temporary stream failures recover without endless retries or retrying missing episodes',()=>{
  let now=0,network=0,media=0;const recover=streamRecovery({startLoad:position=>{assert.equal(position,-1);network++;},recoverMediaError:()=>media++},()=>now);
  assert.equal(recover({type:'networkError',response:{code:404}}),false);
  assert.equal(recover({type:'networkError'}),true);assert.equal(recover({type:'networkError'}),true);assert.equal(recover({type:'networkError'}),false);
  assert.equal(recover({type:'mediaError'}),true);assert.equal(recover({type:'mediaError'}),false);
  now=61000;assert.equal(recover({type:'networkError'}),true);assert.equal(network,3);assert.equal(media,1);
});
test('repeat segment links reuse a token without sharing different provider headers',()=>{
  const url='https://example.com/segment-cache.ts';assert.equal(issueMedia(url,{Referer:'https://provider.example/'}),issueMedia(url,{Referer:'https://provider.example/'}));assert.notEqual(issueMedia(url,{Referer:'https://provider.example/'}),issueMedia(url,{Referer:'https://other.example/'}));
});
test('adaptive playback lowers quality for stalls and recovers only after sustained headroom',()=>{
  const levels=[{bitrate:500000},{bitrate:1500000},{bitrate:4000000}],normal={levels,current:2,cap:-1,buffer:20,bandwidth:10000000};
  assert.equal(adaptiveCap({...normal,waitingSeconds:3}),1);
  assert.equal(adaptiveCap({...normal,buffer:2,bandwidth:2000000,lowSeconds:4}),1);
  assert.equal(adaptiveCap({...normal,droppedRatio:0.15}),1);
  assert.equal(adaptiveCap({...normal,waitingSeconds:10,cooldown:5}),null);
  assert.equal(adaptiveCap({...normal,current:1,cap:1,stableSeconds:29}),null);
  assert.equal(adaptiveCap({...normal,current:1,cap:1,stableSeconds:30}),-1);
  assert.equal(adaptiveCap({...normal,current:1,cap:1,stableSeconds:30,bandwidth:5000000}),null);
  assert.equal(adaptiveCap({...normal,levels:[levels[0]],current:0,waitingSeconds:10}),null);
});
test('buffer monitoring ignores future ranges and accounts for playback speed',()=>{
  const video={currentTime:5,playbackRate:2,buffered:{length:2,start:i=>[0,20][i],end:i=>[10,30][i]}};
  assert.equal(bufferAhead(video),2.5);video.currentTime=15;assert.equal(bufferAhead(video),0);
  assert.equal(adaptiveConfig({saveData:true,downlink:50}).abrEwmaDefaultEstimate,300000);
  assert.ok(adaptiveConfig({downlink:1}).abrEwmaDefaultEstimate<1000000);
});
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
