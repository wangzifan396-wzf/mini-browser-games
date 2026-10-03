import assert from 'node:assert/strict';
import {chromium} from '../promo-video/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'output/browser-refresh');
await mkdir(output,{recursive:true});
const echoPreview=process.argv.includes('--echo'),results=[],errors=[];
let browser;
try{browser=await chromium.launch({channel:'msedge',headless:true})}
catch{browser=await chromium.launch({headless:true})}
async function noOverflow(page){const size=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}));assert.ok(size.content<=size.viewport+2,JSON.stringify(size));}
async function capture(page,name){await noOverflow(page);await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});}
async function check(file,mobile,exercise,suffix=''){
 const label=file+(mobile?'-mobile':'-desktop')+suffix;
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:950},...(mobile?{isMobile:true,hasTouch:true,deviceScaleFactor:2}:{})});
 const page=await context.newPage(),localErrors=[];
 if(exercise===echoBlocked)await context.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage disabled','SecurityError')}}));
 page.on('pageerror',e=>localErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')localErrors.push(m.text())});
 page.on('dialog',dialog=>dialog.accept());
 const input=async locator=>mobile?locator.tap():locator.click();
 try{
  const directory=['echo-expedition','breach-protocol'].includes(file)?'development/':'';
  await page.goto(pathToFileURL(path.join(root,directory,file+'.html')).href,{waitUntil:'load'});
  await noOverflow(page);const detail=await exercise(page,input,mobile,label);
  await capture(page,label);assert.deepEqual(localErrors,[],'page and console errors');
  results.push({label,pass:true,...detail});console.log('PASS '+label);
 }catch(error){errors.push({label,message:error.message,pageErrors:localErrors});console.error('FAIL '+label+': '+error.message);await page.screenshot({path:path.join(output,label+'-failure.png'),fullPage:true}).catch(()=>{});}
 finally{await context.close()}
}

async function refusedClipboardCopy(page,input){
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('Permission denied'))},configurable:true}));
 await input(page.locator('#copyCode'));
 await page.waitForFunction(()=>{const b=document.getElementById('saveCode');return b.selectionStart===0&&b.selectionEnd===b.value.length});
}
async function factory(page,input){
 await input(page.locator('[data-sb-tool="belt"]'));await input(page.locator('#sbGrid [data-cell="7,0"]'));
 assert.equal(await page.evaluate(()=>window.__factorySandbox.state().layout['7,0'].type),'belt','real placement');
 for(let n=0;n<28;n++)await input(page.locator('#sbStepBtn'));
 const state=await page.evaluate(()=>{const s=window.__factorySandbox.state();return{tick:s.sim.tick,delivered:s.delivered,credits:s.credits,sold:s.sold}});
 assert.equal(state.tick,28);assert.ok(state.sold.plate>0,'starter line delivers real iron plates');
 await input(page.locator('#sbGrid [data-cell="3,3"]'));
 assert.match(await page.locator('#sbInspector').innerText(),/铁炉/);
 await input(page.locator('#sbArchiveBtn'));
 const code=await page.locator('#sbArchiveCode').inputValue();assert.match(code,/^FACTORYFREE1\./);
 const snapshot=await page.evaluate(()=>JSON.stringify(window.__factorySandbox.state().sim));
 const normalized=await page.evaluate(code=>JSON.stringify(window.__factorySandbox.decode(code).sim),code);
 await page.locator('#sbArchiveCode').fill(code+'x');await input(page.locator('#sbImportCode'));
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__factorySandbox.state().sim)),snapshot,'bad import is atomic');
 await page.locator('#sbArchiveCode').fill(code);await input(page.locator('#sbImportCode'));
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__factorySandbox.state().sim)),normalized,'in-flight cargo survives UI import (normalization may add zero counters)');
 await input(page.locator('#closeInfoBtn'));await page.reload({waitUntil:'load'});
 assert.equal(await page.evaluate(()=>window.__factorySandbox.state().sim.tick),28,'disk restore');
 await input(page.locator('#contractModeBtn'));await input(page.locator('[data-contract="0"]'));
 await input(page.locator('#grid [data-cell="1,3"]'));await input(page.locator('#stepBtn'));
 assert.equal(await page.evaluate(()=>window.__tinyFactory.state().sim.tick),1,'legacy contract remains operable');
 const refs=await page.evaluate(()=>window.__tinyFactory.validateContent());assert.equal(refs.valid,true,refs.errors.join(' | '));
 await input(page.locator('#sandboxModeBtn'));
 return{deliveries:state.sold.plate,legacyReferences:refs.references.length,saveRoundtrip:true};
}
async function backpack(page,input){
 await input(page.locator('[data-class="ranger"]'));
 await input(page.locator('#grid .gear').first());for(let n=0;n<4;n++)await input(page.locator('#rotateBtn'));
 await input(page.locator('#saveBtn'));const code=await page.locator('#saveCode').inputValue();assert.match(code,/^BA3-/);
 await refusedClipboardCopy(page,input);
 await input(page.locator('#closeInfoBtn'));await page.reload({waitUntil:'load'});
 assert.equal(await page.locator('#grid .gear').count(),2,'starting gear restored');
 await input(page.locator('#fightBtn'));assert.equal(await page.locator('#rotateBtn').isDisabled(),true);
 await page.waitForTimeout(1200);await page.keyboard.press('Escape');
 assert.match(await page.locator('#fightBtn').innerText(),/继续/);
 const health=await page.locator('#playerHp').getAttribute('style');await page.waitForTimeout(700);
 assert.equal(await page.locator('#playerHp').getAttribute('style'),health,'paused combat stays paused');
 await input(page.locator('#fightBtn'));await page.waitForTimeout(500);await page.keyboard.press('Escape');
 return{realClassSelection:true,fourRotationInputs:true,pauseAndResume:true,saveReload:true};
}
async function chess(page,input){
 await input(page.locator('[data-cmd="vanguard"]'));await input(page.locator('[data-buy="0"]'));
 await input(page.locator('#bench .unit').first());await input(page.locator('#board .cell').nth(24));
 const before=await page.locator('#opponent .preview span').allTextContents();
 await input(page.locator('#saveBtn'));await refusedClipboardCopy(page,input);await input(page.locator('#closeInfoBtn'));
 await input(page.locator('#fightBtn'));
 const actual=await page.locator('.unit.enemy .icon').allTextContents();assert.deepEqual(actual,before,'shown opponent is actual opponent');
 assert.equal(await page.locator('#rerollBtn').isDisabled(),true);
 await page.waitForTimeout(1200);const cells=await page.locator('#board .unit').evaluateAll(nodes=>nodes.map(n=>Array.from(n.parentElement.parentElement.children).indexOf(n.parentElement)));
 assert.ok(cells.some(n=>n!==24&&n!==40&&n>1),'actual rendered troops moved');
 await page.keyboard.press('Escape');assert.match(await page.locator('#fightBtn').innerText(),/继续/);
 assert.equal(await page.locator('#sellBtn').isDisabled(),true);
 await input(page.locator('#fightBtn'));await page.waitForTimeout(400);await page.keyboard.press('Escape');
 return{opponentMatches:true,realPurchaseAndDeploy:true,troopsMove:true,pauseAndResume:true};
}
async function island(page,input){
 const choice=await page.evaluate(()=>{const s=window.__islandSurvival.state();return s.event.choices.findIndex(([,d])=>['wood','food','water','scrap'].every(k=>!(d[k]<0)||s[k]>=-d[k]))});
 const expected=await page.evaluate(i=>window.__islandSurvival.state().event.choices[i][1].eventsHelped||0,choice);
 await input(page.locator('#eventChoices button').nth(choice));
 assert.equal(await page.evaluate(()=>window.__islandSurvival.state().eventsHelped),expected);
 await input(page.getByRole('button',{name:'🪵 收集木材',exact:true}));
 assert.equal(await page.evaluate(()=>window.__islandSurvival.state().ap),3);
 await input(page.locator('#archiveBtn'));const code=await page.locator('#archiveText').inputValue();assert.match(code,/^ISLAND2\./);
 await page.locator('#archiveText').fill('ISLAND2.bad.bad');await input(page.locator('#importBtn'));
 assert.match(await page.locator('#archiveFeedback').innerText(),/校验/);await input(page.locator('#closeArchiveBtn'));
 return{eventCountCorrect:true,realResourceAction:true,badImportRejected:true};
}
async function catalog(page,input){
 assert.equal(await page.locator('.game-card').count(),115);
 const hrefs=await page.locator('.play').evaluateAll(nodes=>nodes.map(n=>n.href));
 assert.ok(hrefs.every(h=>h.startsWith(pathToFileURL(root).href)&&h.endsWith('.html')),'local catalog does not send local users to an old online build');
 await page.locator('#searchInput').fill('微型流水线');assert.equal(await page.locator('.game-card').count(),1);
 const href=await page.locator('.play').getAttribute('href');assert.ok(href.endsWith('/tiny-factory.html'));
 await input(page.locator('.play'));await page.waitForURL('**/tiny-factory.html');assert.match(await page.title(),/流水线/);
 return{offlineCatalog:true,localGameLink:true};
}
async function echo(page,input,mobile,label){
 await page.locator('#seed-input').fill('experience-review');await input(page.locator('#start-button'));
 await input(page.locator('[data-testid="tutorial-continue"]'));
 if(mobile){
  await page.evaluate(()=>document.getElementById('game-screen').scrollIntoView({block:'start'}));
  const layout=await page.evaluate(()=>{const map=document.getElementById('map').getBoundingClientRect(),controls=document.querySelector('.control-row').getBoundingClientRect(),turn=document.getElementById('end-turn-button').getBoundingClientRect();return{mapTop:map.top,mapBottom:map.bottom,controlsTop:controls.top,turnBottom:turn.bottom,height:innerHeight}});
  assert.ok(layout.mapTop>=0&&layout.controlsTop>=layout.mapBottom&&layout.turnBottom<=layout.height,`map and movement/end-turn fit together: ${JSON.stringify(layout)}`);
  await page.screenshot({path:path.join(output,label+'-controls-viewport.png')});
 }
 const read=()=>page.evaluate(()=>EchoExpedition.parse(localStorage.getItem('echo-expedition.save.v1')).run);
 const moveTo=async target=>{
  for(let guard=0;guard<35;guard++){
   const plan=await page.evaluate(target=>{const E=EchoExpedition,s=E.parse(localStorage.getItem('echo-expedition.save.v1')).run;if(!s)return null;if(E.distance(s.player,target)<=1)return{done:true};if(s.ap<1)return{end:true};const route=E.path(s,s.player,target,true);if(route.length<2)return{blocked:true};const next=route[1],dir=Object.entries(E.DIR).find(([,d])=>d[0]===next.x-s.player.x&&d[1]===next.y-s.player.y)[0];return{dir}},target);
   assert.ok(plan&&!plan.blocked,'nearby route remains walkable');if(plan.done)return;
   if(plan.end)await input(page.locator('#end-turn-button'));else await input(page.locator(`[data-dir="${plan.dir}"]`));
  }throw Error('movement did not reach target');
 };
 const state=await read(),target=state.caches[0];await moveTo(target);
 let current=await read();if(current.ap<1)await input(page.locator('#end-turn-button'));
 await input(page.locator('#loot-button'));assert.ok((await read()).cargo.length>0,'loot obtained through real controls');
 await capture(page,label+'-raid');
 const archiveBefore=await page.evaluate(()=>localStorage.getItem('echo-expedition.save.v1'));await page.reload({waitUntil:'load'});
 await input(page.locator('#resume-button'));assert.equal(await page.evaluate(()=>localStorage.getItem('echo-expedition.save.v1')),archiveBefore,'resume replays actual action log');
 current=await read();await moveTo(current.exits[0]);current=await read();if(current.ap<2)await input(page.locator('#end-turn-button'));
 await input(page.locator('#extract-button'));assert.match(await page.locator('#dialog-title').innerText(),/撤离|带回/);
 const saved=await page.evaluate(()=>EchoExpedition.parse(localStorage.getItem('echo-expedition.save.v1')));
 assert.ok(saved.base.credits>0);assert.equal(saved.base.runs,1);assert.equal(saved.run,null);
 if(mobile){await page.setViewportSize({width:1100,height:900});await page.locator('.game-side #end-turn-button').waitFor({state:'attached'});await page.setViewportSize({width:390,height:844});await page.locator('.map-panel #end-turn-button').waitFor({state:'attached'});}
 return{completeLootAndExtraction:true,payout:saved.base.credits,saveResume:true};
}
async function echoCore(page,input,mobile,label){
 await page.locator('#seed-input').fill('core-visual-review');
 await input(page.locator('#region-choices button').nth(2));await input(page.locator('#start-button'));
 await input(page.locator('[data-testid="tutorial-continue"]'));
 let found=null;
 for(let i=0;i<70&&!found;i++){
  const plan=await page.evaluate(()=>{
   const E=EchoExpedition,s=E.parse(localStorage.getItem('echo-expedition.save.v1')).run;
   if(!s)return{ended:true};
   const guards=E.liveGuards(s).filter(g=>E.visible(s,g.x,g.y)&&E.distance(s.player,g)<=4&&E.attackTiles(s,g).length>1);
   if(guards.length&&s.ap>=2)return{found:guards[0]};
   if(s.ap<1||guards.length)return{end:true};
   const nearest=E.liveGuards(s).map(g=>({g,path:E.path(s,s.player,g,true)})).filter(g=>g.path.length>1).sort((a,b)=>a.path.length-b.path.length)[0];
   if(!nearest)return{end:true};const p=nearest.path[1];
   return{dir:Object.entries(E.DIR).find(([,d])=>d[0]===p.x-s.player.x&&d[1]===p.y-s.player.y)[0]};
  });
  assert.ok(!plan.ended,'core encounter can be reached without teleporting or invulnerability');
  if(plan.found){found=plan.found;break;}
  if(plan.end)await input(page.locator('#end-turn-button'));else await input(page.locator(`[data-dir="${plan.dir}"]`));
 }
 assert.ok(found,'real patrol encounter shows a multi-tile locked volley');
 const map=page.locator('#map');await map.scrollIntoViewIfNeeded();const box=await map.boundingBox();
 const position={x:(found.x+.5)/19*box.width,y:(found.y+.5)/17*box.height};
 if(mobile)await map.tap({position});else await map.click({position});
 assert.match(await page.locator('#inspector').innerText(),/守卫/);
 await capture(page,label+'-telegraph');await input(page.locator('#emp-button'));
 const cleared=await page.evaluate(()=>{const E=EchoExpedition,s=E.parse(localStorage.getItem('echo-expedition.save.v1')).run;return{energy:s.player.energy,active:E.liveGuards(s).filter(g=>E.distance(s.player,g)<=4&&E.attackTiles(s,g).length).length}});
 assert.equal(cleared.energy,2);assert.equal(cleared.active,0,'EMP removes the same attack areas that were drawn');
 const saved=await page.evaluate(()=>localStorage.getItem('echo-expedition.save.v1'));await page.keyboard.press('Escape');
 await input(page.getByRole('button',{name:'保存并回出发页',exact:true}));assert.equal(await page.locator('#menu-screen').isVisible(),true);
 await input(page.locator('#resume-button'));assert.equal(await page.evaluate(()=>localStorage.getItem('echo-expedition.save.v1')),saved);
 return{corePatrolThroughRealMovement:true,mapEnemySelection:true,areaAttackAndEMPCancel:true,pauseMenuResume:true};
}
async function echoBlocked(page,input){
 await input(page.locator('#start-button'));await input(page.locator('[data-testid="tutorial-continue"]'));
 assert.match(await page.locator('#game-save-status').innerText(),/不可用|不能|无法|失败|备份/);
 await input(page.locator('#end-turn-button'));assert.match(await page.locator('#hud-turn').innerText(),/^2 /);
 await page.keyboard.press('Escape');await input(page.getByRole('button',{name:'保存并回出发页',exact:true}));
 await input(page.locator('#save-button'));assert.ok((await page.locator('textarea').inputValue()).includes('echo-expedition'));
 return{blockedStorageStillPlayable:true,manualSaveStillAvailable:true};
}
try{
 for(const mobile of [false,true]){
  for(const [file,exercise]of [['tiny-factory',factory],['backpack-arena',backpack],['auto-chess-forge',chess],['island-survival',island],['index',catalog]])await check(file,mobile,exercise);
  if(echoPreview){await check('echo-expedition',mobile,echo);await check('echo-expedition',mobile,echoCore,'-core');await check('echo-expedition',mobile,echoBlocked,'-storage-blocked');}
 }
 await writeFile(path.join(output,'browser-results.json'),JSON.stringify({results,errors},null,2));
 assert.deepEqual(errors,[],`${errors.length} failed browser exercises`);
 console.log(JSON.stringify({passed:results.length,errors:0,headless:true,foregroundUsed:false},null,2));
}finally{await browser.close()}
