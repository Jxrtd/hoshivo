import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {server} from '../server.mjs';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:1000,height:700}});
  await page.route('**/fixture',r=>r.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="/style.css"><div id="player" class="player"><video></video></div><input aria-label="Search"><button>Other button</button>'}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
  mkdirSync('.local-results',{recursive:true});
  const recording=await browser.newContext({viewport:{width:160,height:90},recordVideo:{dir:'.local-results',size:{width:160,height:90}}});
  const recorded=await recording.newPage();await recorded.setContent('<body style="margin:0;background:red"></body>');await recorded.waitForTimeout(1000);await recording.close();const clip=readFileSync(await recorded.video().path()).toString('base64');
  await page.route('**/preview-media',r=>r.fulfill({contentType:'video/webm',body:Buffer.from(clip,'base64')}));
  await page.evaluate(async()=>{
    const {attachVideoControls}=await import('/video-controls.js'),video=document.querySelector('video');window.paused=true;window.position=12;
    Object.defineProperties(video,{paused:{get:()=>window.paused},duration:{get:()=>100},currentTime:{get:()=>window.position,set:v=>{window.position=v;}},readyState:{get:()=>4}});
    video.play=async()=>{window.paused=false;video.dispatchEvent(new Event('play'));};video.pause=()=>{window.paused=true;video.dispatchEvent(new Event('pause'));};
    window.removeTestControls=attachVideoControls(document.querySelector('#player'),video,{},v=>{window.position=v;},message=>{throw new Error(message);},undefined,{kind:'mp4',url:'/preview-media'});
  });
  await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>window.paused),false);
  await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>window.paused),true);
  await page.locator('video').click();assert.equal(await page.evaluate(()=>window.paused),false);
  await page.locator('input[aria-label="Search"]').focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>window.paused),false);
  const seek=page.getByRole('slider',{name:'Seek video'}),rect=await seek.boundingBox();await page.mouse.move(rect.x+rect.width*0.02,rect.y+rect.height/2);
  await page.waitForFunction(()=>{const c=document.querySelector('.timeline-preview');return c&&!c.hidden&&c.getContext('2d').getImageData(80,45,1,1).data[0]>200;},null,{timeout:15000});
  assert.equal(await page.evaluate(()=>window.position),12);assert.equal(await page.evaluate(()=>window.paused),false);
  await page.mouse.move(5,5);assert.equal(await page.locator('.video-seek-tooltip').isVisible(),false);
  await page.evaluate(()=>window.removeTestControls());await page.locator('input').evaluate(input=>input.blur());await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>window.paused),false);
  console.log('Passed: real decoded thumbnail preview, main playback unchanged by hover, Space and surface click toggles, input exclusion, and cleanup.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
