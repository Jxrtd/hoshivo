import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {server} from '../server.mjs';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await page.route('**/fixture',route=>route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><p id="playback-status"></p><button id="reload-source">Reload</button><div class="player" id="player"></div>'}));
  await page.route('**/api/playback?*',route=>route.fulfill({json:{ok:true,data:{kind:'mp4',url:'/api/media/'+'a'.repeat(48),skip:{},subtitles:[]}}}));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
  await page.clock.install();
  await page.evaluate(async()=>{
    // Avoid upstream media so mobile state transitions are deterministic.
    Object.defineProperty(HTMLMediaElement.prototype,'src',{configurable:true,set(){},get(){return '';}});
    const {setEpisode,destroyPlayer}=await import('/player.js');window.destroyTestPlayer=destroyPlayer;
    await setEpisode({anime:{id:'ap-test'},episode:{number:1}});
    const video=document.querySelector('video');window.testVideo=video;window.testTime=30;window.testPaused=false;window.testReady=2;
    Object.defineProperties(video,{duration:{get:()=>120},currentTime:{get:()=>window.testTime,set:value=>{window.testTime=value;}},paused:{get:()=>window.testPaused},readyState:{get:()=>window.testReady},seeking:{get:()=>false}});
    video.play=async()=>{window.testPaused=false;video.dispatchEvent(new Event('playing'));};
    video.pause=()=>{window.testPaused=true;video.dispatchEvent(new Event('pause'));};
    video.dispatchEvent(new Event('loadedmetadata'));video.dispatchEvent(new Event('playing'));
  });
  async function tapPair(side){await page.locator('video').evaluate((video,side)=>{
    const rect=video.getBoundingClientRect(),x=rect.left+rect.width*(side==='right'?0.8:0.2),y=rect.top+rect.height/2;
    for(let i=0;i<2;i++)for(const type of ['pointerdown','pointerup'])video.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',isPrimary:true,clientX:x,clientY:y}));
  },side);}
  await tapPair('right');assert.equal(await page.evaluate(()=>window.testTime),35);
  await tapPair('left');assert.equal(await page.evaluate(()=>window.testTime),30);
  await page.evaluate(()=>{document.querySelector('#player').requestFullscreen=async()=>{throw new Error('Unsupported');};});
  await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();
  assert.equal(await page.locator('#player').evaluate(p=>p.classList.contains('mobile-fullscreen')),true);
  const rect=await page.locator('#player').boundingBox();assert.equal(Math.round(rect.width),390);assert.equal(Math.round(rect.height),844);
  assert.equal(await page.locator('.video-overlay').evaluate(e=>e.hidden),true);
  await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
  await page.evaluate(()=>{window.testVideo.dispatchEvent(new Event('waiting'));});
  await page.clock.runFor(21000);
  assert.equal(await page.locator('.video-overlay').evaluate(e=>e.hidden),true);
  assert.match(await page.locator('#playback-status').textContent(),/Connection is slow/);
  await page.evaluate(()=>{window.testTime=31;window.testVideo.dispatchEvent(new Event('timeupdate'));});
  assert.equal(await page.locator('#playback-status').textContent(),'Playing');
  // Safari's native fullscreen API is selected when element fullscreen is absent.
  await page.evaluate(()=>{const player=document.querySelector('#player');player.requestFullscreen=undefined;player.webkitRequestFullscreen=undefined;window.testVideo.webkitEnterFullscreen=()=>{window.nativeFullscreenCalled=true;};});
  await page.locator('#player').dispatchEvent('pointermove');
  await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.nativeFullscreenCalled),true);
  await page.evaluate(()=>window.destroyTestPlayer());
  assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('player-fullscreen-open')),false);
  console.log('Passed: mobile double-tap ±5 seconds, fullscreen fallback, native Safari API selection, buffering recovery, and cleanup.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
