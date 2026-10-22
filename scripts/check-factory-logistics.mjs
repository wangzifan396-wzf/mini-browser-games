import assert from 'node:assert/strict';
import {chromium} from '../promo-video/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

// Isolated headless browser regression. State is read for assertions; all game
// mutations below are actual player buttons, taps, selects and archive imports.
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'output/factory-logistics');
await mkdir(output,{recursive:true});
let browser;
try{browser=await chromium.launch({channel:process.env.BROWSER_TEST_CHANNEL==='chromium'?undefined:'msedge',timeout:15000,headless:true})}
catch{browser=await chromium.launch({headless:true})}
const results=[],failures=[];
async function snapshot(page){return page.evaluate(()=>JSON.stringify(window.__factorySandbox.state()))}
async function capture(page,name){
 const size=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}));
 assert.ok(size.content<=size.viewport+2,JSON.stringify(size));
 await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
}
try{
 for(const mobile of [false,true]){
  const label=mobile?'mobile':'desktop',errors=[],external=[];
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:950},...(mobile?{isMobile:true,hasTouch:true,deviceScaleFactor:2}:{})});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  page.on('request',request=>{if(/^https?:/.test(request.url()))external.push(request.url())});
  const input=async locator=>mobile?locator.tap():locator.click();
  const cell=key=>page.locator(`#sbGrid [data-cell="${key}"]`);
  try{
   await page.goto(pathToFileURL(path.join(root,'tiny-factory.html')).href,{waitUntil:'load'});
   for(let i=0;i<28;i++)await input(page.locator('#sbStepBtn'));
   assert.ok(await page.evaluate(()=>window.__factorySandbox.state().sold.plate>0),'real starting factory production');
   await input(cell('3,3'));
   await input(page.locator('#sbRunBtn'));
   assert.equal(await page.evaluate(()=>window.__factorySandbox.running()),true);
   await input(page.locator('#sbMoveBtn'));
   assert.equal(await page.evaluate(()=>window.__factorySandbox.running()),false,'entering move mode pauses real production');
   assert.equal(await page.evaluate(()=>window.__factorySandbox.moving()),'3,3');
   const paused=await snapshot(page);
   await input(cell('1,3'));
   assert.match(await page.locator('#sbMessage').innerText(),/目的地已有设施/);
   assert.equal(await snapshot(page),paused,'occupied destination is atomic');
   await input(page.locator('#sbRunBtn'));
   assert.equal(await page.evaluate(()=>window.__factorySandbox.running()),false,'cannot resume a pending move');
   assert.equal(await snapshot(page),paused);
   if(mobile)await input(page.locator('#sbCancelMove'));else await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>window.__factorySandbox.moving()),null);
   assert.equal(await snapshot(page),paused,'cancel does not mutate game or inventory');
   await input(page.locator('#sbMoveBtn'));await input(page.locator('[data-sb-tool="belt"]'));
   assert.equal(await page.evaluate(()=>window.__factorySandbox.moving()),null,'choosing another construction tool cancels pending move');
   assert.equal(await snapshot(page),paused);
   await input(page.locator('#sbMoveBtn'));await page.locator('#sbFilter').selectOption('coal');
   assert.equal(await page.evaluate(()=>window.__factorySandbox.moving()),null,'choosing a filter cancels pending move without configuring or relocating anything');
   assert.equal(await snapshot(page),paused);
   await page.locator('#sbFilter').selectOption('plate');
   await input(page.locator('#sbMoveBtn'));
   const original=await page.evaluate(()=>{const s=window.__factorySandbox.state();return{device:s.sim.devices['3,3'],credits:s.credits,sold:s.sold,tick:s.sim.tick}});
   await input(cell('4,4'));
   const relocated=await page.evaluate(()=>{const s=window.__factorySandbox.state();return{device:s.sim.devices['4,4'],credits:s.credits,sold:s.sold,tick:s.sim.tick,old:s.layout['3,3'],moving:window.__factorySandbox.moving()}});
   assert.deepEqual(relocated.device,original.device,'working machine state preserved');
   assert.equal(relocated.credits,original.credits);assert.deepEqual(relocated.sold,original.sold);assert.equal(relocated.tick,original.tick);
   assert.equal(relocated.old,undefined);assert.equal(relocated.moving,null);

   await input(page.locator('[data-sb-research="logistics"]'));
   await input(page.locator('[data-sb-tool="filter"]'));
   await input(cell('7,0'));
   const dir=await page.evaluate(()=>window.__factorySandbox.state().layout['7,0'].dir);
   await page.locator('#sbFilter').selectOption('coal');
   await input(page.locator('#sbApplyFilter'));
   assert.deepEqual(await page.evaluate(()=>window.__factorySandbox.state().layout['7,0']),{type:'filter',dir,filter:'coal'});
   await input(page.locator('#sbInspectRotate'));
   assert.deepEqual(await page.evaluate(()=>window.__factorySandbox.state().layout['7,0']),{type:'filter',dir:(dir+1)%4,filter:'coal'});

   for(let i=0;i<10;i++)await input(page.locator('#sbStepBtn'));
   await input(cell('2,3'));
   assert.match(await page.locator('#sbInspector').innerText(),/出口未连接设施/,'actual disconnected route is diagnosed');
   await page.locator('#sbViewport').scrollIntoViewIfNeeded();
   await capture(page,label+'-worksite');
   await page.screenshot({path:path.join(output,label+'-viewport.png'),fullPage:false});

   await input(page.locator('#sbArchiveBtn'));
   const code=await page.locator('#sbArchiveCode').inputValue();
   const beforeImport=await snapshot(page);
   const expected=await page.evaluate(code=>JSON.stringify(window.__factorySandbox.decode(code)),code);
   await page.locator('#sbArchiveCode').fill(code+'x');await input(page.locator('#sbImportCode'));
   assert.match(await page.locator('#sbArchiveFeedback').innerText(),/校验失败/);
   assert.equal(await snapshot(page),beforeImport,'bad archive is atomic');
   await page.locator('#sbArchiveCode').fill(code);await input(page.locator('#sbImportCode'));
   assert.equal(await snapshot(page),expected,'moved machine, filter and cursors restore from real archive UI');
   await input(page.locator('#closeInfoBtn'));await page.reload({waitUntil:'load'});
   assert.equal(await snapshot(page),expected,'disk restore retains the post-move worksite');
   await input(cell('4,4'));assert.match(await page.locator('#sbInspector').innerText(),/铁炉/);
   await capture(page,label+'-restored');
   assert.deepEqual(errors,[],'no page/console errors');assert.deepEqual(external,[],'offline game makes no external asset/runtime requests');
   results.push({label,pass:true,foregroundUsed:false,realProduction:true,pausedMove:true,invalidTargetAtomic:true,cancelUnchanged:true,workingStockPreserved:true,filterIndependent:true,outletDiagnostics:true,archiveRoundtrip:true,diskRestore:true,externalRequests:0});
   console.log('PASS factory-logistics-'+label);
  }catch(error){failures.push({label,message:error.stack,pageErrors:errors});console.error('FAIL factory-logistics-'+label+': '+error.message);await page.screenshot({path:path.join(output,label+'-failure.png'),fullPage:true}).catch(()=>{})}
  finally{await context.close()}
 }
}finally{await browser.close()}
await writeFile(path.join(output,'results.json'),JSON.stringify({results,failures},null,2));
assert.equal(failures.length,0,JSON.stringify(failures));
