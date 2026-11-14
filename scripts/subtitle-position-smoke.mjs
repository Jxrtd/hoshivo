import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000/#anime/ap-sousou-no-frieren');await page.locator('.video-controls').waitFor({timeout:90000});await page.locator('#auto-skip-intro').uncheck();await page.locator('.play-episode').click();
  await page.waitForFunction(()=>Array.from(document.querySelector('video').textTracks).some(t=>t.mode==='showing'&&t.cues?.length),null,{timeout:25000});
  await page.waitForFunction(()=>{const v=document.querySelector('video');return !v.paused&&v.currentTime>0.25&&v.readyState>=3;},null,{timeout:25000});
  const original=await page.locator('video').evaluate(v=>{const index=Array.from(v.textTracks).findIndex(t=>t.mode==='showing'&&t.cues?.length),cue=v.textTracks[index].cues[0];v.pause();v.currentTime=cue.startTime+0.5;return {index,line:cue.line,snapToLines:cue.snapToLines,lineAlign:cue.lineAlign};});
  await page.waitForFunction(i=>{const v=document.querySelector('video'),cue=v.textTracks[i].cues[0];return !v.seeking&&typeof cue.line==='number'&&!cue.snapToLines;},original.index,{timeout:25000});
  const inspect=()=>page.evaluate(i=>{const video=document.querySelector('video'),cue=video.textTracks[i].cues[0],height=video.getBoundingClientRect().height,controlHeight=document.querySelector('.video-controls').getBoundingClientRect().height;return {line:cue.line,snap:cue.snapToLines,expected:Math.max(10,100-((document.querySelector('.video-controls').classList.contains('controls-hidden')?0:controlHeight)+Math.max(20,height*0.06))/height*100)};},original.index);
  let position=await inspect();assert.ok(Math.abs(position.line-position.expected)<0.1);assert.equal(position.snap,false);
  await mkdir(new URL('../.local-results/',import.meta.url),{recursive:true});await page.locator('#player').screenshot({path:'.local-results/subtitles-above-controls.png'});
  await page.locator('.video-controls').getByRole('button',{name:'Enter fullscreen'}).click();await page.waitForFunction(()=>document.fullscreenElement?.id==='player');position=await inspect();assert.ok(Math.abs(position.line-position.expected)<0.1);
  await page.locator('.video-controls').getByRole('button',{name:'Exit fullscreen'}).click();await page.waitForFunction(()=>!document.fullscreenElement);
  await page.locator('.video-controls').getByRole('button',{name:'Play',exact:true}).click();await page.mouse.move(5,5);await page.waitForFunction(()=>document.querySelector('.video-controls').classList.contains('controls-hidden'),null,{timeout:9000});
  const restored=await page.locator('video').evaluate((v,i)=>{const cue=v.textTracks[i].cues[0];return {line:cue.line,snapToLines:cue.snapToLines,lineAlign:cue.lineAlign};},original.index);position=await inspect();assert.ok(Math.abs(position.line-position.expected)<0.1);assert.equal(restored.snapToLines,false);assert.equal(restored.lineAlign,'end');assert.ok(restored.line<=94.01);
  await page.setViewportSize({width:390,height:844});const rect=await page.locator('#player').boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.locator('video').evaluate((v,i)=>{v.pause();v.currentTime=v.textTracks[i].cues[0].startTime+0.5;},original.index);
  await page.waitForFunction(i=>!document.querySelector('video').seeking&&document.querySelector('video').textTracks[i].cues[0].snapToLines===false,original.index,{timeout:25000});position=await inspect();assert.ok(Math.abs(position.line-position.expected)<0.1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);console.log('Passed: real subtitles above visible controls, fullscreen/mobile resizing, and padded subtitles with hidden controls.');
}finally{await browser.close();}
