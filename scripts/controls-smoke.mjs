import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000/#anime/ap-sousou-no-frieren');await page.locator('.video-controls').waitFor({timeout:90000});await page.waitForFunction(()=>Number.isFinite(document.querySelector('video').duration),null,{timeout:30000});
  assert.equal(await page.locator('.segment-map').count(),0);assert.equal(await page.locator('.video-seek').count(),1);assert.equal(await page.locator('.video-seek-chapter').count(),2);assert.equal(await page.locator('video').evaluate(v=>v.controls),false);
  const videoRect=await page.locator('video').boundingBox(),controlsRect=await page.locator('.video-controls').boundingBox();assert.ok(controlsRect.y>videoRect.y&&controlsRect.y<videoRect.y+videoRect.height,'Controls must overlay the video at the bottom.');assert.ok(Math.abs((await page.locator('#player').boundingBox()).height-videoRect.height)<=2,'Controls must not reserve extra screen space.');
  await page.locator('.video-controls').getByRole('button',{name:'Play',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('video').paused&&document.querySelector('video').currentTime>=89,null,{timeout:35000});
  await page.locator('.video-controls').getByRole('button',{name:'Pause',exact:true}).click();assert.equal(await page.locator('video').evaluate(v=>v.paused),true);
  await page.locator('.video-seek').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');assert.ok(Math.abs(await page.locator('video').evaluate(v=>v.currentTime)-5)<0.1);
  const seek=await page.locator('.video-seek').boundingBox(),duration=await page.locator('video').evaluate(v=>v.duration);await page.mouse.click(seek.x+seek.width/2,seek.y+seek.height/2);assert.ok(Math.abs(await page.locator('video').evaluate(v=>v.currentTime)-duration/2)<10);
  await page.locator('.video-speed').selectOption('1.5');assert.equal(await page.locator('video').evaluate(v=>v.playbackRate),1.5);
  await page.locator('.video-captions').selectOption('-1');assert.equal(await page.locator('video').evaluate(v=>Array.from(v.textTracks).some(t=>t.mode==='showing')),false);
  const caption=await page.locator('.video-captions option').nth(1).getAttribute('value');await page.locator('.video-captions').selectOption(caption);assert.equal(await page.locator('video').evaluate((v,i)=>v.textTracks[Number(i)].mode,caption),'showing');
  await page.locator('.video-volume').focus();await page.keyboard.press('Home');await page.locator('.video-controls').getByRole('button',{name:'Unmute',exact:true}).click();assert.ok(await page.locator('video').evaluate(v=>!v.muted&&v.volume>0));
  await page.locator('.video-controls').getByRole('button',{name:'Enter fullscreen'}).click();await page.waitForFunction(()=>document.fullscreenElement?.id==='player');assert.equal(await page.locator('.video-seek').isVisible(),true);await page.locator('.video-controls').getByRole('button',{name:'Exit fullscreen'}).click();await page.waitForFunction(()=>!document.fullscreenElement);
  await mkdir(new URL('../.local-results/',import.meta.url),{recursive:true});await page.locator('#player').screenshot({path:'.local-results/integrated-player.png'});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('link',{name:'Discover',exact:true}).click();assert.equal(await page.locator('.video-controls').count(),0);assert.deepEqual(errors,[]);
  console.log('Passed: one integrated seek bar with intro/outro colors, controls over the video, playback, seeking, volume, captions, speed, fullscreen, mobile, and cleanup.');
}finally{await browser.close();}
