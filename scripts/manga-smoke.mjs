import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {server} from '../server.mjs';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/#manga');await page.locator('#manga-grid .card').first().waitFor({timeout:40000});
  await page.getByRole('searchbox',{name:'Search manga and manhwa'}).fill('The Greatest Estate Developer');await page.locator('#manga-search-form').getByRole('button',{name:'Search',exact:true}).click();
  await page.locator('#manga-grid .card').filter({hasText:'The Greatest Estate Developer'}).first().waitFor({timeout:40000});assert.match(await page.locator('#manga-grid .card').first().textContent(),/Manhwa/);
  await page.getByRole('searchbox',{name:'Search manga and manhwa'}).fill('You Are a Four-Leaf Clover');await page.locator('#manga-search-form').getByRole('button',{name:'Search',exact:true}).click();
  const title=page.locator('#manga-grid .card').filter({hasText:'You Are a Four-Leaf Clover'}).first();await title.waitFor({timeout:40000});await title.click();
  await page.locator('.chapter-card').first().waitFor({timeout:40000});assert.equal(await page.getByRole('combobox',{name:'Chapter language'}).inputValue(),'en');
  await page.getByRole('link',{name:'Start reading',exact:true}).click();
  await page.waitForFunction(()=>{const img=document.querySelector('.reader-pages img');return img?.complete&&img.naturalWidth>0;},null,{timeout:45000});
  assert.match(page.url(),/#read\/[a-f0-9-]{36}$/);assert.ok(await page.locator('.reader-pages img').count()>1);
  assert.ok(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('hoshivo-reading')||'{}')).length)>0);
  mkdirSync('.local-results',{recursive:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'.local-results/manga-reader-mobile.png'});
  await page.getByRole('link',{name:'Manga & manhwa',exact:true}).click();await page.getByRole('heading',{name:'Continue reading.'}).waitFor();assert.equal(await page.locator('.reading-recent-grid a').count(),1);
  await page.locator('#manga-grid .card').first().waitFor({timeout:40000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'.local-results/manga-catalog-mobile.png'});
  await page.getByRole('link',{name:'Browse anime',exact:true}).click();assert.equal(await page.locator('#manga-section').isVisible(),false);assert.equal(await page.locator('#catalog').isVisible(),true);assert.deepEqual(errors,[]);
  console.log('Passed: real manga and manhwa search, chapter list, readable chapter images, saved reading history, mobile layout, and anime navigation.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
