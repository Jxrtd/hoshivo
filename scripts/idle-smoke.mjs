import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000/#anime/ap-sousou-no-frieren');await page.locator('.video-controls').waitFor({timeout:90000});
  await page.locator('.play-episode').click();await page.waitForFunction(()=>!document.querySelector('video').paused&&document.querySelector('video').currentTime>=89,null,{timeout:35000});
  await page.mouse.move(5,5);
  await page.waitForFunction(()=>document.querySelector('.video-controls').classList.contains('controls-hidden'),null,{timeout:8000});
  const before=await page.locator('video').evaluate(v=>v.currentTime);await page.keyboard.press('ArrowRight');
  assert.ok(await page.locator('video').evaluate(v=>v.currentTime)>=before+4.9);assert.equal(await page.locator('.video-controls').evaluate(e=>e.classList.contains('controls-hidden')),true);
  assert.equal(await page.locator('.skip-notice').count(),0);assert.equal(await page.locator('.video-overlay').isVisible(),false);
  await page.waitForFunction(()=>!document.querySelector('video').seeking,null,{timeout:25000});assert.equal(await page.locator('.video-controls').evaluate(e=>e.classList.contains('controls-hidden')),true);
  const rect=await page.locator('#player').boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.locator('.video-controls').waitFor();assert.equal(await page.locator('.video-controls').evaluate(e=>e.inert),false);
  await page.locator('.video-controls').getByRole('button',{name:'Pause',exact:true}).click();assert.equal(await page.locator('video').evaluate(v=>v.paused),true);assert.equal(await page.locator('.video-controls').isVisible(),true);
  await page.getByRole('link',{name:'Discover',exact:true}).click();assert.equal(await page.locator('.video-controls').count(),0);assert.deepEqual(errors,[]);
  console.log('Passed: controls hide after five seconds, arrow seeking stays hidden, no skip popup or buffering overlay, pointer movement restores controls, paused controls remain visible, and cleanup.');
}finally{await browser.close();}
