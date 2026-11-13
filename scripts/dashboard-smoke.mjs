import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000/#home');await page.locator('.latest-episode').first().waitFor({timeout:25000});await page.locator('.ranking-item').first().waitFor({timeout:25000});
  assert.match(await page.locator('#section-title').innerText(),/Latest episodes/);
  const latestLink=await page.locator('#grid .card').first().getAttribute('href');assert.match(latestLink,/\/latest$/);
  const rankings=await page.locator('#rankings').boundingBox(),catalog=await page.locator('#catalog').boundingBox();assert.ok(rankings.x>catalog.x+catalog.width,'Rankings must appear to the right on desktop.');
  for(const period of ['day','week','month']){
    const data=await (await fetch('http://localhost:3000/api/top-anime?period='+period)).json();assert.equal(data.ok,true);assert.ok(data.data.length>0);
    await page.locator('#ranking-'+period).click();await page.waitForFunction(()=>document.querySelector('#ranking-list').getAttribute('aria-busy')==='false');
    assert.equal(await page.locator('#ranking-'+period).getAttribute('aria-selected'),'true');assert.equal(await page.locator('.ranking-copy strong').first().innerText(),data.data[0].title);
  }
  await mkdir(new URL('../.local-results/',import.meta.url),{recursive:true});await page.screenshot({path:'.local-results/dashboard-desktop.png',fullPage:true});
  const rankedId=await page.locator('.ranking-item').first().getAttribute('href');await page.locator('.ranking-item').first().click();await page.locator('#detail h1').waitFor({timeout:25000});assert.equal(await page.locator('#dashboard-layout').isVisible(),false);assert.equal(new URL(page.url()).hash,rankedId);
  await page.getByRole('link',{name:'Discover',exact:true}).click();await page.locator('#grid .card').first().click();await page.locator('#now-playing').waitFor({timeout:25000});
  const id=latestLink.split('/')[1],detail=await (await fetch('http://localhost:3000/api/series/'+id)).json();const max=Math.max(...detail.data.episodes.map(e=>Number(e.number)));assert.match(await page.locator('#now-playing').innerText(),new RegExp('Episode '+max+' '));
  await page.getByRole('link',{name:'Discover',exact:true}).click();await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('#rankings').isVisible(),true);await page.screenshot({path:'.local-results/dashboard-mobile.png',fullPage:true});
  await page.getByRole('link',{name:/My watchlist/}).click();assert.equal(await page.locator('#rankings').isVisible(),false);assert.deepEqual(errors,[]);
  console.log('Passed: latest episode badges, newest-episode links, live Day/Week/Month rankings, desktop right sidebar, internal ranking links, mobile layout, and watchlist isolation.');
}finally{await browser.close();}
