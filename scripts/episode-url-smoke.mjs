import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000/#anime/ap-sousou-no-frieren');await page.locator('#now-playing').waitFor({timeout:30000});assert.match(page.url(),/\/episode\/1$/);
  const panel=await page.locator('.episode-panel').elementHandle();
  async function expectEpisode(number){await page.waitForFunction(n=>location.hash.endsWith('/episode/'+n)&&document.querySelector('.episode.active')?.dataset.number===String(n),number,{timeout:15000});assert.match(await page.title(),new RegExp('Episode '+number));}
  await page.locator('.episode[data-number="2"]').click();await expectEpisode(2);assert.equal(await page.locator('.episode-panel').evaluate((node,previous)=>node===previous,panel),true);
  await page.locator('#next').click();await expectEpisode(3);await page.locator('#previous').click();await expectEpisode(2);
  await page.goBack();await expectEpisode(3);await page.goForward();await expectEpisode(2);
  await page.reload();await page.locator('#now-playing').waitFor({timeout:30000});await expectEpisode(2);
  assert.deepEqual(errors,[]);console.log('Passed: canonical episode URLs, episode-list/Next/Previous navigation, browser Back/Forward, refresh, and no full detail reload on episode switching.');
}finally{await browser.close();}
