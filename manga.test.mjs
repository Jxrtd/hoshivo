import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mangaId,normalizeManga,mangaChapter,mangaCoverPath} from './manga.mjs';
import {sourceId,sourcePath,externalMangaId} from './manga-sources.mjs';
test('additional source IDs are canonical and cannot point at arbitrary URLs',()=>{
  const id=sourceId('mp','/manga/6372/solo-glitch-player');assert.equal(sourcePath(id).path,'/manga/6372');assert.equal(sourcePath(id).origin,'https://mangapill.com');assert.equal(id,sourceId('mp','/manga/6372'));
  assert.equal(externalMangaId(id),true);assert.equal(externalMangaId('https://example.com'),false);
  for(const path of ['/../admin','https://127.0.0.1/private','/manga/1?url=https://example.com','/chapters/1/../../private'])assert.throws(()=>sourceId('mp',path),/Invalid source/);
  assert.throws(()=>sourcePath('mp-'+Buffer.from('https://example.com/').toString('base64url')),/Invalid source/);
});
test('manga covers use a fixed-origin proxy and reject malformed paths',()=>{
  const id='11111111-1111-1111-1111-111111111111',file='cover-name.jpg.256.jpg';assert.equal(mangaCoverPath(id,file),`https://uploads.mangadex.org/covers/${id}/${file}`);
  assert.equal(normalizeManga({id,attributes:{},relationships:[{type:'cover_art',attributes:{fileName:'cover-name.jpg'}}]}).poster,`/api/manga/cover/${id}/${file}`);
  for(const value of ['../secret','https://evil.example/x.jpg','cover%2Fsecret.jpg','file.txt'])assert.throws(()=>mangaCoverPath(id,value),/Invalid manga cover/);
});
test('manga metadata recognizes manhwa and English alternative titles',()=>{
  const row=normalizeManga({id:'a',attributes:{title:{'ko-ro':'Korean title'},altTitles:[{en:'English title'}],originalLanguage:'ko',availableTranslatedLanguages:['en','fr']},relationships:[]});
  assert.equal(row.title,'English title');assert.equal(row.kind,'Manhwa');assert.equal(row.poster,'');
  for(const value of ['../../../etc','a',undefined,'00000000-0000-0000-0000-00000000000z'])assert.equal(mangaId(value),false);
});
test('chapter resolution preserves page order and supplies adjacent chapters',async()=>{
  const previous=globalThis.fetch,id='11111111-1111-1111-1111-111111111111',manga='22222222-2222-2222-2222-222222222222',next='33333333-3333-3333-3333-333333333333';
  globalThis.fetch=async url=>{
    const path=new URL(url).pathname;let data;
    if(path==='/chapter/'+id)data={id,attributes:{chapter:'1',translatedLanguage:'en'},relationships:[{type:'manga',id:manga}]};
    else if(path==='/manga/'+manga)data={id:manga,attributes:{title:{en:'Test title'},contentRating:'safe',originalLanguage:'ja'},relationships:[]};
    else if(path==='/at-home/server/'+id)return Response.json({result:'ok',baseUrl:'https://1.1.1.1',chapter:{hash:'abcd1234',data:['original.jpg'],dataSaver:['first.jpg','second.jpg']}});
    else if(path.endsWith('/aggregate'))return Response.json({result:'ok',volumes:{1:{chapters:{1:{id,chapter:'1'},2:{id:next,chapter:'2'}}}}});
    else throw new Error('Unexpected manga request');return Response.json({result:'ok',data});
  };
  try{const chapter=await mangaChapter(id);assert.equal(chapter.pages.length,2);assert.ok(chapter.pages.every(path=>/^\/api\/media\/[a-f0-9]{48}$/.test(path)));assert.notEqual(chapter.pages[0],chapter.pages[1]);assert.equal(chapter.previous,null);assert.equal(chapter.next,next);}finally{globalThis.fetch=previous;}
});
