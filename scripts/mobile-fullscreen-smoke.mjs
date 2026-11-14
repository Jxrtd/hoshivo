import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {server} from '../server.mjs';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await page.route('**/fixture',route=>route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><p id="playback-status"></p><button id="reload-source">Reload video</button><div class="player" id="player"></div>'}));
  await page.route('**/api/playback?*',route=>route.fulfill({json:{ok:true,data:{kind:'mp4',url:'/api/media/'+'a'.repeat(48),skip:{},subtitles:[]}}}));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
  await page.evaluate(async()=>{
    Object.defineProperty(HTMLMediaElement.prototype,'src',{configurable:true,set(){},get(){return '';}});
    const {setEpisode,destroyPlayer}=await import('/player.js');window.destroyTestPlayer=destroyPlayer;
    await setEpisode({anime:{id:'ap-test'},episode:{number:1}});
    const video=document.querySelector('video');Object.defineProperty(video,'readyState',{get:()=>2});video.pause=()=>{};
    document.querySelector('#player').requestFullscreen=async()=>{throw new Error('Unsupported');};
  });
  await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();
  assert.equal(await page.locator('#player').evaluate(p=>p.classList.contains('mobile-fullscreen')),true);
  const rect=await page.locator('#player').boundingBox();assert.equal(Math.round(rect.width),390);assert.equal(Math.round(rect.height),844);
  assert.equal(await page.locator('#playback-status').textContent(),'Press Play to start.');
  await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
  await page.evaluate(()=>document.querySelector('video').dispatchEvent(new Event('error')));
  assert.equal(await page.locator('.video-overlay').evaluate(e=>e.hidden),true);
  assert.match(await page.locator('#playback-status').textContent(),/Playback failed/);
  assert.equal(await page.locator('#player').getByRole('button',{name:'Reload video'}).count(),0);
  assert.equal(await page.locator('#reload-source').isVisible(),true);
  await page.evaluate(()=>{const p=document.querySelector('#player'),v=p.querySelector('video');p.requestFullscreen=undefined;p.webkitRequestFullscreen=undefined;v.webkitEnterFullscreen=()=>{window.nativeFullscreenCalled=true;};});
  await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();assert.equal(await page.evaluate(()=>window.nativeFullscreenCalled),true);
  await page.evaluate(()=>{document.querySelector('#player').classList.add('mobile-fullscreen');document.body.classList.add('player-fullscreen-open');window.destroyTestPlayer();});
  assert.equal(await page.locator('body').evaluate(b=>b.classList.contains('player-fullscreen-open')),false);
  console.log('Passed: mobile fullscreen fallback, native Safari API selection, no reload overlay, and cleanup.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
