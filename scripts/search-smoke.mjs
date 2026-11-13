import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000/#browse');
  await page.locator('#search').fill('Frieren');
  const frieren=page.locator('#grid a[href="#anime/ap-sousou-no-frieren"]');await frieren.waitFor({timeout:25000});
  assert.ok(await page.locator('#grid .card').count()>=2);
  assert.equal(await page.locator('#load-more').isVisible(),false);
  await frieren.click();await page.locator('.play-episode').waitFor({timeout:90000});
  assert.match(await page.locator('#detail h1').innerText(),/Frieren/);assert.equal(await page.locator('.episode').count(),28);
  await page.locator('#save-anime').click();
  await page.locator('.play-episode').click();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>2,null,{timeout:35000});
  const cues=await page.locator('video').evaluate(v=>({tracks:v.textTracks.length,background:getComputedStyle(v,'::cue').backgroundColor,firstCue:v.textTracks[0]?.cues?.[0]?.startTime,engine:v.dataset.engine}));
  assert.equal(cues.background,'rgba(0, 0, 0, 0)');
  if(cues.firstCue!==undefined){await page.locator('video').evaluate((v,time)=>v.currentTime=time+1,cues.firstCue);await page.waitForFunction(()=>document.querySelector('video').textTracks[0]?.activeCues?.length>0,null,{timeout:20000});}
  await page.locator('#player').screenshot({path:'.local-results/frieren-subtitles.png'});
  await page.getByRole('link',{name:'Discover',exact:true}).click();await page.locator('.recent-card[href="#anime/ap-sousou-no-frieren/episode/1"]').waitFor();
  await page.getByRole('link',{name:/My watchlist/}).click();await page.locator('#grid a[href="#anime/ap-sousou-no-frieren"]').waitFor();
  await page.locator('#search').fill('');await page.getByRole('link',{name:'Browse anime',exact:true}).click();await page.locator('#search').fill('Frieren');await frieren.waitFor({timeout:25000});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({searchResults:await page.locator('#grid .card').count(),cues,errors}));
  console.log('Passed: full Frieren search, native title details and episodes, playback, transparent subtitles, recent history, watchlist, repeat search, and mobile layout.');
}finally{await browser.close();}
