import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await fetch('http://localhost:3000/api/playback?series=ap-sousou-no-frieren&episode=1');const {data}=await response.json();assert.ok(data.skip.intro);assert.ok(data.skip.outro);
  await page.goto('http://localhost:3000/#anime/ap-sousou-no-frieren');
  await page.locator('#auto-skip-intro').waitFor({timeout:90000});assert.equal(await page.locator('#auto-skip-intro').isChecked(),true);assert.equal(await page.locator('#auto-skip-outro').isChecked(),true);
  await page.locator('.play-episode').click();await page.waitForFunction(end=>document.querySelector('video').currentTime>=end,data.skip.intro.end,{timeout:35000});
  console.log('Automatic intro skip passed.');
  await page.locator('#auto-skip-intro').uncheck();await page.locator('video').evaluate(v=>v.pause());
  await page.locator('video').evaluate((v,time)=>v.currentTime=time,data.skip.intro.start+5);
  await page.waitForFunction(()=>!document.querySelector('video').seeking,null,{timeout:25000});
  const manual=page.getByRole('button',{name:'Skip intro',exact:true});await manual.waitFor();
  assert.ok(await page.locator('video').evaluate(v=>v.currentTime)<data.skip.intro.end);
  await manual.click();await page.waitForFunction(end=>document.querySelector('video').currentTime>=end,data.skip.intro.end,{timeout:25000});
  console.log('Manual intro skip passed with automatic intro skipping off.');
  await page.waitForFunction(()=>!document.querySelector('video').seeking,null,{timeout:25000});
  await page.locator('video').evaluate((v,time)=>v.currentTime=time,data.skip.outro.start+1);
  await page.waitForFunction(()=>!document.querySelector('video').seeking,null,{timeout:25000});
  await page.locator('.play-episode').click();await page.waitForFunction(end=>document.querySelector('video').currentTime>=end,data.skip.outro.end,{timeout:35000});
  console.log('Automatic outro skip passed.');
  await page.locator('#auto-skip-outro').uncheck();await page.reload();await page.locator('#auto-skip-intro').waitFor({timeout:90000});
  assert.equal(await page.locator('#auto-skip-intro').isChecked(),false);assert.equal(await page.locator('#auto-skip-outro').isChecked(),false);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);console.log('Passed: default-on switches, automatic intro/outro skipping, manual skip, saved preferences, mobile layout, and no JavaScript errors.');
}finally{await browser.close();}
