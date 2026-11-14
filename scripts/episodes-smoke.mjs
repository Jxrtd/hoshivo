import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000/#anime/ap-sousou-no-frieren/episode/1');await page.locator('.play-episode').waitFor({timeout:90000});
  const first=page.locator('.episode[data-number="1"]');assert.match(await first.locator('.episode-title').innerText(),/Journey/);assert.match(await first.getAttribute('aria-label'),/Not watched/);assert.equal(await page.locator('.episode-check,.episode-state').count(),0);assert.ok((await first.boundingBox()).height<=60);
  const panel=await page.locator('.episode-panel').boundingBox(),player=await page.locator('#player').boundingBox();assert.ok(panel.x+panel.width<=player.x,'Episode list must be on the left.');
  await page.locator('.play-episode').click();await page.waitForFunction(()=>document.querySelector('.episode[data-number="1"]').classList.contains('watched'),null,{timeout:30000});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('hoshivo-episode-progress'))['ani:154587']['1'].completed),false);
  await page.locator('.video-seek').waitFor();assert.equal(await page.locator('.video-seek-chapter').count(),2);assert.match(await page.locator('.video-seek-chapter.intro').getAttribute('title'),/Intro 0:00/);assert.match(await page.locator('.video-seek-chapter.outro').getAttribute('title'),/Outro/);
  await page.locator('video').evaluate(v=>v.pause());
  await page.waitForFunction(()=>document.querySelector('.episode[data-number="1"]').classList.contains('watched'),null,{timeout:15000});
  assert.match(await first.getAttribute('aria-label'),/Watched/);assert.ok(await first.evaluate(e=>e.classList.contains('watched')));
  await page.locator('.episode[data-number="2"]').click();assert.match(await first.getAttribute('aria-label'),/Watched/);assert.ok(await first.evaluate(e=>e.classList.contains('watched')));assert.equal(await page.locator('.episode[data-number="2"]').getAttribute('aria-pressed'),'true');
  await page.reload();await first.waitFor({timeout:25000});assert.match(await first.getAttribute('aria-label'),/Watched/);assert.ok(await first.evaluate(e=>e.classList.contains('watched')));
  await page.locator('#episode-search').fill('Magic');assert.ok(await page.locator('.episode').count()>0);assert.match(await page.locator('.episode-title').first().innerText(),/magic/i);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log('Passed: real episode titles, compact left sidebar, no visible marks, watched-on-start colors, intro/outro timeline, persisted episode history, title search, and mobile layout.');
}finally{await browser.close();}
