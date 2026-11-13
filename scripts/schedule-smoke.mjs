import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000/#home');await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===12,null,{timeout:25000});
  const layout=await page.locator('#grid .card').evaluateAll(nodes=>({rows:new Set(nodes.map(n=>Math.round(n.getBoundingClientRect().y))).size,columns:new Set(nodes.map(n=>Math.round(n.getBoundingClientRect().x))).size}));assert.deepEqual(layout,{rows:2,columns:6});
  const first=await page.locator('#grid .card').first().getAttribute('href');await page.locator('#latest-next').click();await page.waitForFunction(()=>document.querySelector('#latest-page').textContent.startsWith('Page 2'),null,{timeout:25000});assert.equal(await page.locator('#grid .card').count(),12);assert.notEqual(await page.locator('#grid .card').first().getAttribute('href'),first);
  await page.locator('#latest-previous').click();await page.waitForFunction(()=>document.querySelector('#latest-page').textContent.startsWith('Page 1'),null,{timeout:25000});
  await page.locator('.release-row').first().waitFor({timeout:25000});assert.equal(await page.locator('.schedule-group').count(),1);assert.match(await page.locator('.schedule-note').first().innerText(),/PHT/);
  await page.locator('#schedule-week').click();await page.waitForFunction(()=>document.querySelectorAll('.schedule-group').length===7,null,{timeout:25000});assert.ok(await page.locator('.release-row').count()>0);
  await page.locator('#schedule-today').click();await page.waitForFunction(()=>document.querySelectorAll('.schedule-group').length===1,null,{timeout:25000});
  await mkdir(new URL('../.local-results/',import.meta.url),{recursive:true});await page.screenshot({path:'.local-results/schedule-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('#grid .card').count(),12);await page.screenshot({path:'.local-results/schedule-mobile.png',fullPage:true});
  await page.goto('http://localhost:3000/#anime/9033');await page.locator('#anime-schedule .anime-release-row').waitFor({timeout:30000});assert.match(await page.locator('#anime-schedule').innerText(),/Episode 8/);const position=await page.locator('#anime-schedule').boundingBox(),player=await page.locator('#player').boundingBox();assert.ok(position.y>=player.y+player.height);
  await page.goto('http://localhost:3000/#anime/ap-sousou-no-frieren');await page.locator('.release-finished').waitFor({timeout:30000});assert.match(await page.locator('#anime-schedule').innerText(),/finished airing/);
  assert.deepEqual(errors,[]);console.log('Passed: 2 rows x 6 columns, 12-title pagination, day/week schedules, PHT times, per-anime next episode, finished seasons, mobile layout, and no JavaScript errors.');
}finally{await browser.close();}
