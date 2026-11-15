import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {server} from '../server.mjs';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const anime={id:'ap-test',title:'Test Season 1',year:2025,terms_by_type:{}};
  const token='a'.repeat(48),variant='b'.repeat(48);
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    let result=path.startsWith('/api/series/')?{ok:true,data:{anime,episodes:[{number:1,title:'Episode One'}]}}:path==='/api/playback'?{ok:true,data:{kind:'hls',url:'/api/media/'+token,subtitles:[],skip:{}}}:path==='/api/seasons'?{ok:true,data:[{...anime,current:true},{...anime,id:'ap-test-2',title:'Test Season 2',year:2026}]}:{ok:false,error:'No fixture data'};
    return route.fulfill({json:result});
  });
  await page.addInitScript(()=>{
    const events={};window.Hls=class{
      static isSupported(){return true;}static Events={MANIFEST_PARSED:'manifest',ERROR:'error'};
      constructor(){window.testHls=this;this.levels=[{height:720,bitrate:1},{height:1080,bitrate:2},{height:2160,bitrate:3}];}
      on(name,fn){events[name]=fn;}loadSource(){}attachMedia(){events.manifest?.();}destroy(){}
    };
  });
  // Keep the app's bundled library from replacing the deterministic engine.
  await page.route('**/vendor/hls.min.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.clock.install();
  await page.goto(base+'/#anime/ap-test');
  const quality=page.getByRole('combobox',{name:'Video quality'});await quality.locator('option').filter({hasText:'4K'}).waitFor({state:'attached'});
  await quality.selectOption('2');assert.equal(await page.evaluate(()=>window.testHls.currentLevel),2);
  await quality.selectOption('auto');assert.equal(await page.evaluate(()=>window.testHls.currentLevel),-1);
  await page.evaluate(()=>{
    const video=document.querySelector('video');window.bufferSeconds=1;
    Object.defineProperties(video,{paused:{get:()=>false},seeking:{get:()=>false},duration:{get:()=>600},currentTime:{get:()=>40},buffered:{get:()=>({length:1,start:()=>0,end:()=>40+window.bufferSeconds})}});
    window.testHls.currentLevel=2;window.testHls.bandwidthEstimate=100;
    video.dispatchEvent(new Event('playing'));video.dispatchEvent(new Event('waiting'));
  });
  await page.clock.runFor(8000);assert.equal(await page.evaluate(()=>window.testHls.autoLevelCapping),1);
  await page.evaluate(()=>{window.testHls.currentLevel=1;window.bufferSeconds=30;document.querySelector('video').dispatchEvent(new Event('playing'));});
  await page.clock.runFor(31000);assert.equal(await page.evaluate(()=>window.testHls.autoLevelCapping),-1);
  await page.locator('#player').dispatchEvent('pointermove');await quality.selectOption('2');
  await page.evaluate(()=>{window.bufferSeconds=0;document.querySelector('video').dispatchEvent(new Event('waiting'));});
  await page.clock.runFor(25000);assert.equal(await page.evaluate(()=>window.testHls.currentLevel),2);assert.equal(await page.evaluate(()=>window.testHls.autoLevelCapping),-1);
  assert.equal(await page.locator('.player-buffering').isVisible(),true);assert.match(await page.locator('#playback-status').textContent(),/Connection is slow/);
  await page.evaluate(()=>document.querySelector('video').dispatchEvent(new Event('playing')));assert.equal(await page.locator('.player-buffering').isVisible(),false);
  await page.locator('.season-card').nth(1).waitFor();assert.equal(await page.locator('.season-card').nth(1).getAttribute('href'),'#anime/ap-test-2');assert.equal(await page.locator('.season-card.current').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(async()=>{const {destroyPlayer}=await import('/player.js');destroyPlayer();window.testHls.autoLevelCapping=2;});
  await page.clock.runFor(31000);assert.equal(await page.evaluate(()=>window.testHls.autoLevelCapping),2);
  const native=await browser.newPage({viewport:{width:390,height:844}});
  await native.route('**/fixture',route=>route.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="/style.css"><p id="playback-status"></p><button id="reload-source">Reload</button><div class="player" id="player"></div>'}));
  await native.route('**/api/playback?*',route=>route.fulfill({json:{ok:true,data:{kind:'hls',url:'/api/media/'+token,subtitles:[],skip:{}}}}));
  await native.route('**/api/media/'+token,route=>route.fulfill({body:`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100,RESOLUTION=1920x1080\n/api/media/${variant}`,contentType:'application/vnd.apple.mpegurl'}));
  await native.goto(base+'/fixture');
  await native.evaluate(async()=>{
    Object.defineProperty(HTMLMediaElement.prototype,'src',{configurable:true,get(){return this.dataset.source||'';},set(value){this.dataset.source=value;}});
    HTMLMediaElement.prototype.canPlayType=()=> 'probably';HTMLMediaElement.prototype.load=function(){this.dispatchEvent(new Event('loadedmetadata'));};HTMLMediaElement.prototype.play=async function(){window.playCalls=(window.playCalls||0)+1;};
    const {setEpisode}=await import('/player.js');await setEpisode({anime:{id:'ap-test'},episode:{number:1}});
    const video=document.querySelector('video');video.currentTime=40;Object.defineProperty(video,'paused',{get:()=>false});
  });
  await native.getByRole('combobox',{name:'Video quality'}).selectOption({label:'1080p'});
  assert.deepEqual(await native.locator('video').evaluate(v=>[v.dataset.source,v.currentTime,window.playCalls]),['/api/media/'+variant,40,1]);
  console.log('Passed: adaptive downshift and recovery, manual quality preserved, slow buffering without reload errors, monitor cleanup, native quality switching, seasons, and mobile layout.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
