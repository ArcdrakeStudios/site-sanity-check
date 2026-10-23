// Synthetic local browser verification; all owned resources close in finally.
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';

await mkdir(new URL('../.runtime/browser/',import.meta.url),{recursive:true});
const server=createApp({port:43147});server.listen(43147,'127.0.0.1');await once(server,'listening');
let browser;const errors=[],results=[];
try{
  browser=await chromium.launch({headless:true});
  for(const lang of ['en','de'])for(const width of [320,768,1440]){
    const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    // Nothing outside this owned server is permitted, even accidental asset or scanner requests.
    await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:43147/')?route.continue():route.abort());
    await page.goto('http://127.0.0.1:43147/');await page.selectOption('#language',lang);
    assert.equal(await page.locator('html').getAttribute('lang'),lang);
    await page.click('#demo');await page.locator('#results:not([hidden])').waitFor();
    assert.equal(await page.locator('.card').count(),4);
    assert.equal(await page.locator('#results-title').evaluate(n=>n===document.activeElement),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${lang} ${width} overflow`);
    await page.screenshot({path:fileURLToPath(new URL(`../.runtime/browser/${lang}-${width}-summary.png`,import.meta.url)),fullPage:true});
    for(const details of await page.locator('.card details').all())await details.locator('summary').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:fileURLToPath(new URL(`../.runtime/browser/${lang}-${width}.png`,import.meta.url)),fullPage:true});
    await page.click('#clear');assert.equal(await page.locator('#results').isVisible(),false);assert.equal(await page.locator('#url').evaluate(n=>n===document.activeElement),true);
    await page.fill('#url','http://127.0.0.1');await page.click('#submit');await page.waitForFunction(()=>!document.querySelector('#submit').disabled);
    assert.match(await page.locator('#status').textContent(),lang==='de'?/öffentliches Ziel/:/public destination/);
    await page.selectOption('#language',lang==='en'?'de':'en');assert.match(await page.locator('#status').textContent(),lang==='en'?/öffentliches Ziel/:/public destination/);await page.selectOption('#language',lang);
    await page.reload();assert.equal(await page.locator('html').getAttribute('lang'),lang);
    results.push({lang,width,passed:true});await context.close();
  }
  // UI cancellation/clear race is tested with a synthetic browser response, never a network target.
  const context=await browser.newContext();const page=await context.newPage();await page.goto('http://127.0.0.1:43147/');
  await page.route('**/api/scan',async route=>{await new Promise(r=>setTimeout(r,200));await route.fulfill({status:400,contentType:'application/json',body:'{"error":"request_failed"}'}).catch(()=>{});});
  await page.fill('#url','example.com');await page.click('#submit');await page.click('#clear');await page.waitForTimeout(300);assert.equal(await page.locator('#status').textContent(),'');assert.equal(await page.locator('#results').isVisible(),false);await context.close();
  assert.deepEqual(errors,[]);await writeFile(new URL('../.runtime/browser/results.json',import.meta.url),JSON.stringify({results,errors,cancellationRace:true},null,2));console.log(JSON.stringify({results,errors,cancellationRace:true}));
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
