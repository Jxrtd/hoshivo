import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000/#anime/ap-sousou-no-frieren');await page.locator('.play-episode').waitFor({timeout:90000});
  await page.locator('.play-episode').click();await page.waitForFunction(()=>document.querySelector('video').currentTime>=89,null,{timeout:35000});
  const video=page.locator('video');await video.evaluate(v=>v.pause());
  await page.waitForFunction(()=>!document.querySelector('video').seeking,null,{timeout:25000});
  await video.focus();const before=await video.evaluate(v=>v.currentTime);
  await page.keyboard.press('ArrowRight');assert.ok(Math.abs(await video.evaluate(v=>v.currentTime)-before-5)<0.05,'Right Arrow must seek once by exactly five seconds.');
  await page.keyboard.press('ArrowLeft');assert.ok(Math.abs(await video.evaluate(v=>v.currentTime)-before)<0.05);
  await page.locator('#episode-search').fill('123');const editingTime=await video.evaluate(v=>v.currentTime);
  await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowRight');assert.equal(await video.evaluate(v=>v.currentTime),editingTime);
  await video.evaluate(v=>v.currentTime=90);await video.focus();await page.keyboard.press('ArrowLeft');assert.ok(Math.abs(await video.evaluate(v=>v.currentTime)-85)<0.05);
  await page.waitForFunction(()=>!document.querySelector('video').seeking,null,{timeout:25000});
  await page.locator('.play-episode').click();await page.waitForFunction(()=>document.querySelector('video').currentTime>86,null,{timeout:25000});
  assert.ok(await video.evaluate(v=>v.currentTime)<89,'Auto-skip must not undo a deliberate keyboard rewind.');
  await video.evaluate(v=>{v.pause();v.currentTime=2;});await video.focus();await page.keyboard.press('ArrowLeft');assert.equal(await video.evaluate(v=>v.currentTime),0);
  await video.evaluate(v=>v.currentTime=v.duration-2);await video.focus();await page.keyboard.press('ArrowRight');assert.ok(Math.abs(await video.evaluate(v=>v.currentTime-v.duration))<0.01);
  await page.getByRole('link',{name:'Discover',exact:true}).click();assert.equal(await page.locator('video').count(),0);await page.keyboard.press('ArrowRight');assert.deepEqual(errors,[]);
  console.log('Passed: exact five-second arrow seeks, no duplicate native seek, typing unaffected, manual rewind overrides auto-skip, duration bounds, and cleanup.');
}finally{await browser.close();}
