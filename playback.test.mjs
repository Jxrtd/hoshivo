import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseMatch} from './playback.mjs';
import {findMatch} from './matching.mjs';
import http from 'node:http';
import {relayMedia,issueMedia,byteRange} from './media.mjs';
import {isPublicAddress,validateTarget,rewriteManifest,looksLikeHtml,mediaContentType} from './media.mjs';
test('native mobile byte-range probes work when the upstream ignores Range',async()=>{
  const originalFetch=globalThis.fetch,bytes=Buffer.alloc(564);bytes[0]=bytes[188]=bytes[376]=0x47;
  const source='https://1.1.1.1/test-segment.jpg';
  globalThis.fetch=(url,options)=>String(url)===source?Promise.resolve(new Response(bytes,{headers:{'content-type':'image/jpeg','content-length':String(bytes.length)}})):originalFetch(url,options);
  const token=issueMedia(source).split('/').at(-1),relay=http.createServer((req,res)=>relayMedia(req,res,token));
  await new Promise(resolve=>relay.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${relay.address().port}/media`;
  try{
    for(const [range,expected] of [['bytes=0-1',[0,1]],['bytes=188-',[188,563]],['bytes=-188',[376,563]],['bytes=500-999',[500,563]]]){
      const r=await originalFetch(url,{headers:{Range:range}});assert.equal(r.status,206);assert.equal(r.headers.get('content-type'),'video/mp2t');assert.equal(r.headers.get('content-range'),`bytes ${expected[0]}-${expected[1]}/564`);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(expected[0],expected[1]+1));
    }
    const invalid=await originalFetch(url,{headers:{Range:'bytes=999-'}});assert.equal(invalid.status,416);assert.equal(invalid.headers.get('content-range'),'bytes */564');await invalid.body.cancel();
    const head=await originalFetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-type'),'video/mp2t');assert.equal((await head.arrayBuffer()).byteLength,0);
    assert.equal(byteRange('bytes=-0',564),null);assert.equal(byteRange('bytes=5-1',564),null);
  }finally{globalThis.fetch=originalFetch;await new Promise(resolve=>relay.close(resolve));}
});
test('native HLS receives transport-stream content type for mislabeled video segments',()=>{
  const ts=Buffer.alloc(564);ts[0]=ts[188]=ts[376]=0x47;
  for(const type of ['image/jpeg','image/png','text/html','application/octet-stream','video/mp2t'])assert.equal(mediaContentType(ts,type),'video/mp2t');
  assert.equal(mediaContentType(Buffer.from([0xff,0xd8,0xff]),'image/jpeg'),'image/jpeg');
  assert.equal(mediaContentType(Buffer.alloc(16,0x47),'application/octet-stream'),'application/octet-stream');
  assert.equal(mediaContentType(Buffer.from('WEBVTT\n'),'text/vtt'),'text/vtt');
});
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
