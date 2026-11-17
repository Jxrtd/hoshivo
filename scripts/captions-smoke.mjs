import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {server} from '../server.mjs';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:1000,height:750}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/fixture',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><div id="player" class="player"><video></video></div>'}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
  await page.evaluate(async()=>{
    const {attachVideoControls}=await import('/video-controls.js'),video=document.querySelector('video');Object.defineProperty(video,'duration',{get:()=>100});
    const english=document.createElement('track');english.kind='subtitles';english.label='English';english.srclang='en';english.dataset.format='ASS';video.append(english);english.track.mode='showing';
    const arabic=document.createElement('track');arabic.kind='subtitles';arabic.label='Arabic';arabic.srclang='ar';arabic.dataset.format='SRT';video.append(arabic);
    window.captionCleanup=attachVideoControls(document.querySelector('#player'),video,{},()=>{},()=>{});
  });
  const trigger=page.getByRole('button',{name:'Subtitles',exact:true});await trigger.click();
  assert.equal(await page.getByRole('menuitemradio',{name:'English ASS',exact:true}).getAttribute('aria-checked'),'true');
  await page.getByRole('menuitemradio',{name:'Arabic SRT',exact:true}).click();assert.equal(await page.locator('video').evaluate(v=>v.textTracks[1].mode),'showing');
  await trigger.click();await page.getByRole('menuitemradio',{name:'Off',exact:true}).click();assert.equal(await page.locator('video').evaluate(v=>Array.from(v.textTracks).some(t=>t.mode==='showing')),false);
  await trigger.click();await page.locator('input[type=file]').setInputFiles({name:'English fallback.srt',mimeType:'text/plain',buffer:Buffer.from('1\n00:00:01,000 --> 00:00:04,000\nFallback dialogue\n')});
  await page.waitForFunction(()=>Array.from(document.querySelector('video').textTracks).some(t=>t.label==='English fallback.srt'&&t.mode==='showing'));
  const vtt=await page.locator('track').last().evaluate(async t=>await(await fetch(t.src)).text());assert.match(vtt,/WEBVTT/);assert.match(vtt,/Fallback dialogue/);
  await trigger.click();assert.equal(await page.getByRole('menuitemradio',{name:'English fallback.srt SRT',exact:true}).getAttribute('aria-checked'),'true');
  await page.getByRole('menuitemradio',{name:'Off',exact:true}).focus();await page.keyboard.press('ArrowDown');assert.match(await page.evaluate(()=>document.activeElement.textContent),/English/);await page.keyboard.press('Escape');assert.equal(await page.getByRole('menu',{name:'Subtitle tracks'}).isVisible(),false);
  await page.setViewportSize({width:390,height:844});await trigger.click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  mkdirSync('.local-results',{recursive:true});await page.locator('#player').screenshot({path:'.local-results/subtitle-menu.png'});
  await page.evaluate(()=>window.captionCleanup());assert.equal(await page.locator('.caption-menu').count(),0);assert.deepEqual(errors,[]);
  console.log('Passed: subtitle menu format labels, language switching, Off, local SRT fallback conversion, keyboard navigation, mobile layout, and cleanup.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
