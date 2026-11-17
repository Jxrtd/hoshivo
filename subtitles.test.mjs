import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subtitleVtt} from './public/subtitles.js';
import http from 'node:http';
import {issueMedia,relayMedia} from './media.mjs';
test('subtitle relay converts provider files and returns the browser caption content type',async()=>{
  const original=globalThis.fetch,source='https://1.1.1.1/test-subtitles.srt';
  globalThis.fetch=(url,options)=>String(url)===source?Promise.resolve(new Response('1\n00:00:01,000 --> 00:00:03,000\nProvider captions',{headers:{'content-type':'application/octet-stream'}})):original(url,options);
  const token=issueMedia(source,{},true).split('/').at(-1),server=http.createServer((req,res)=>relayMedia(req,res,token));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const r=await original(`http://127.0.0.1:${server.address().port}/captions`);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/^text\/vtt/);assert.match(await r.text(),/WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nProvider captions/);assert.notEqual(issueMedia(source),'/api/media/'+token);}finally{globalThis.fetch=original;await new Promise(r=>server.close(r));}
});
test('SRT captions convert to timed multiline WebVTT',()=>{
  const vtt=subtitleVtt('1\r\n00:01:02,345 --> 00:01:05,900\r\nFirst speaker\r\nSecond line\r\n');assert.match(vtt,/WEBVTT\n\n00:01:02.345 --> 00:01:05.900\nFirst speaker\nSecond line/);
});
test('ASS dialogue retains timestamps, commas, line breaks, and top signs',()=>{
  const input='[Script Info]\nTitle: Test\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.20,0:00:03.45,Default,,0,0,0,,{\\i1}Hello, friend\\NAnother line\nDialogue: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,{\\an8}Top sign\nDialogue: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,{\\p1}m 0 0 l 1 1';
  const vtt=subtitleVtt(input);assert.match(vtt,/00:00:01.200 --> 00:00:03.450\nHello, friend\nAnother line/);assert.match(vtt,/line:10%\nTop sign/);assert.ok(!vtt.includes('m 0 0'));
});
test('VTT passes through and unsupported subtitle content is rejected',()=>{
  assert.equal(subtitleVtt('\uFEFFWEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello'),'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n');assert.throws(()=>subtitleVtt('<html>Bad gateway</html>'),/No readable captions/);
});
