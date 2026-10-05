import assert from 'node:assert/strict';
import {chromium} from '../promo-video/node_modules/playwright/index.mjs';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

// This is an omniscient UI regression policy, not a human difficulty/fun review.
// It reads production state; every mutation is a real button/tap/canvas action.
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'output/echo-campaign');
await mkdir(output,{recursive:true});
let browser;
try { browser=await chromium.launch({channel:'msedge',headless:true}); }
catch { browser=await chromium.launch({headless:true}); }
const results=[],failures=[];

async function state(page){return page.evaluate(()=>EchoExpedition.parse(localStorage.getItem('echo-expedition.save.v1')));}
async function exportArchive(page,input){
 await input(page.locator('#save-button'));
 const text=await page.getByRole('textbox',{name:'可复制的完整存档 JSON',exact:true}).inputValue();
 await input(page.getByRole('button',{name:'返回',exact:true}));return text;
}
async function importArchive(page,input,text){
 await input(page.locator('#import-button'));
 await page.getByRole('textbox',{name:'要导入的存档',exact:true}).fill(text);
 await input(page.getByRole('button',{name:'检查存档',exact:true}));
 assert.equal(await page.locator('#dialog-title').innerText(),'确认导入');
 await input(page.getByRole('button',{name:'确认导入',exact:true}));
}
async function screenshot(page,name){
 const size=await page.evaluate(()=>({width:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}));
 assert.ok(size.content<=size.width+2,JSON.stringify(size));
 await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
}
async function selectTile(page,input,x,y){
 const map=page.locator('#map');await map.scrollIntoViewIfNeeded();const box=await map.boundingBox();
 await input(map,{position:{x:(x+.5)/19*box.width,y:(y+.5)/17*box.height}});
}
async function command(page,input,plan){
 const buttons={end:'end-turn-button',cover:'cover-button',heal:'heal-button',emp:'emp-button',interact:'interact-button',extract:'extract-button',collect:'loot-button',scan:'scan-button',shoot:'shoot-button',push:'push-button'};
 if(plan.select)await selectTile(page,input,plan.select.x,plan.select.y);
 if(plan.type==='move')await input(page.locator(`[data-dir="${plan.dir}"]`));
 else {assert.ok(buttons[plan.type],JSON.stringify(plan));const button=page.locator('#'+buttons[plan.type]);assert.equal(await button.isDisabled(),false,'planned command must be available: '+JSON.stringify(plan));await input(button);}
}
async function nextPlan(page){
 return page.evaluate(()=>{
  const E=EchoExpedition,s=E.parse(localStorage.getItem('echo-expedition.save.v1')).run;
  if(!s)return {ended:true};
  const p=s.player,o=E.objectiveState(s),danger=E.damageForecast(s).total;
  if(p.hp<=p.maxHp-4&&p.meds&&s.ap>=1)return {type:'heal'};
  const safeEnd=()=>danger>0&&s.ap>=1&&!p.cover?{type:'cover'}:{type:'end'};
  // Suppression is a legitimate scarce resource, not injected invulnerability.
  if(danger>=Math.min(3,p.hp)&&p.energy&&s.ap>=2&&E.liveGuards(s).some(g=>E.distance(p,g)<=4))return {type:'emp'};
  const antennasPending=s.objectives.some(n=>n.kind==='antenna'&&!n.done);
  const unfinished=s.objectives.filter(n=>!n.done&&!(antennasPending&&n.kind==='broadcast'));
  let target;
  if(o.ready)target=s.exits[o.requiresRemote?1:0];
  else target=unfinished.map(n=>({n,path:E.path(s,p,n,true)})).filter(a=>a.path.length).sort((a,b)=>a.path.length-b.path.length||a.n.id-b.n.id)[0]?.n;
  if(!target)return safeEnd();
  if(target.kind==='broadcast'&&target.armed&&E.distance(p,target)<=2&&E.lineOfSight(s,p,target))return safeEnd();
  if(E.distance(p,target)<=1){
   if(o.ready)return s.ap>=2?{type:'extract'}:safeEnd();
   const cost=target.kind==='survey'||target.kind==='antenna'?1:2;
   if(target.kind==='archive'&&target.lastTurn===s.turn)return safeEnd();
   if(s.ap>=cost)return {type:'interact',select:{x:target.x,y:target.y}};
   return safeEnd();
  }
  const cost=E.heavy(s)?2:1;
  if(s.ap<cost)return safeEnd();
  const route=E.path(s,p,target,true);
  if(route.length<2){
   const g=E.liveGuards(s).find(g=>E.distance(p,g)===1);
   if(g&&s.ap>=1)return {type:'push',select:{x:g.x,y:g.y}};
   return safeEnd();
  }
  const next=route[1];
  const dir=Object.entries(E.DIR).find(([,d])=>d[0]===next.x-p.x&&d[1]===next.y-p.y)?.[0];
  return dir?{type:'move',dir}:safeEnd();
 });
}

try {
 for(const mobile of [false,true]){
  const label=mobile?'mobile':'desktop',errors=[],requests=[];
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:950},...(mobile?{isMobile:true,hasTouch:true,deviceScaleFactor:2}:{})});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  const input=(locator,options)=>mobile?locator.tap(options):locator.click(options);
  try {
   await page.goto(pathToFileURL(path.join(root,'development/echo-expedition.html')).href,{waitUntil:'load'});
   const zeroArchive=await exportArchive(page,input);
   await input(page.locator('#campaign-button'));
   assert.equal(await page.locator('[data-mission="archive"]').isDisabled(),true);
   assert.equal(await page.locator('[data-mission="broadcast"]').isDisabled(),true);
   await input(page.locator('[data-mission="survey"]'));
   await page.locator('#seed-input').fill('campaign-ui');
   await input(page.locator('#start-button'));
   if(await page.locator('[data-testid="tutorial-continue"]').isVisible())await input(page.locator('[data-testid="tutorial-continue"]'));
   assert.equal((await state(page)).run.operation,'survey');
   await page.evaluate(()=>document.getElementById('game-screen').scrollIntoView({block:'start'}));
   const layout=await page.evaluate(()=>{const map=document.getElementById('map').getBoundingClientRect(),turn=document.getElementById('end-turn-button').getBoundingClientRect(),forecast=document.getElementById('intent-info').getBoundingClientRect();return{mapTop:map.top,mapBottom:map.bottom,turnBottom:turn.bottom,forecastBottom:forecast.bottom,height:innerHeight};});
   assert.ok(layout.mapTop>=0&&layout.mapBottom<=layout.height,'entire tactical map fits the viewport: '+JSON.stringify(layout));
   if(mobile)assert.ok(layout.forecastBottom<=layout.turnBottom&&layout.turnBottom<=layout.height,'forecast and end turn remain next to the visible map: '+JSON.stringify(layout));
   await screenshot(page,label+'-survey-start');
   await page.screenshot({path:path.join(output,label+'-survey-viewport.png'),fullPage:false});
   let replayChecked=false,interactions=0;
   for(let i=0;i<300;i++){
    const saved=await state(page);if(!saved.run)break;
    const plan=await nextPlan(page);assert.ok(!plan.ended,'ongoing state exists');
    await command(page,input,plan);
    if(plan.type==='interact'){
     interactions++;await screenshot(page,label+'-survey-interaction-'+interactions);
     if(!replayChecked){
      const before=await page.evaluate(()=>localStorage.getItem('echo-expedition.save.v1'));
      await page.keyboard.press('Escape');await input(page.getByRole('button',{name:'保存并回出发页',exact:true}));
      await page.reload({waitUntil:'load'});await input(page.locator('#resume-button'));
      assert.equal(await page.evaluate(()=>localStorage.getItem('echo-expedition.save.v1')),before,'mission interactions replay exactly after disk reload');
      replayChecked=true;
     }
    }
   }
   const completed=await state(page);
   assert.equal(completed.run,null,'mission reaches settled state');
   assert.equal(completed.base.campaign.cleared.survey,1,'proof is paid only after actual extraction');
   assert.equal(interactions,2);assert.equal(replayChecked,true);
   assert.match(await page.locator('#dialog-title').innerText(),/撤离/);
   await screenshot(page,label+'-survey-result');await input(page.locator('[data-testid="result-home"]'));
   await input(page.locator('#campaign-button'));
   assert.equal(await page.locator('[data-mission="archive"]').isDisabled(),false);
   assert.equal(await page.locator('[data-mission="grid"]').isDisabled(),false);
   assert.equal(await page.locator('[data-mission="broadcast"]').isDisabled(),true);
   const chain=[{operation:'survey',interactions,payout:completed.base.credits}],observed={archiveCrossTurn:false,gridPowerOff:false,broadcastCharge:false,scanner:false};let archiveResume=null;
   for(const operation of ['archive','grid','broadcast']){
    await input(page.locator(`[data-mission="${operation}"]`));await page.locator('#seed-input').fill('campaign-ui-'+operation);await input(page.locator('#start-button'));
    assert.equal((await state(page)).run.operation,operation);
    if(operation==='grid'){
     const before=(await state(page)).run;
     if(mobile)await input(page.locator('#scan-button'));else await page.keyboard.press('v');
     const after=(await state(page)).run;assert.equal(after.scanUntil,after.turn);assert.equal(after.player.energy,before.player.energy-1);observed.scanner=true;
    }
    let actions=0,firstDecryptTurn=null;
    for(let i=0;i<380;i++){
     const saved=await state(page);if(!saved.run)break;
     const plan=await nextPlan(page);await command(page,input,plan);
     const current=(await state(page)).run;
     if(plan.type==='interact'){
      actions++;
      if(operation==='archive'&&current){
       const terminal=current.objectives[0];
       if(terminal.progress===1){firstDecryptTurn=current.turn;archiveResume=await page.evaluate(()=>localStorage.getItem('echo-expedition.save.v1'));}
       if(terminal.progress===2){assert.ok(current.turn>firstDecryptTurn);assert.ok(current.cargo.some(i=>i.kind==='archive'));observed.archiveCrossTurn=true;}
      }
      if(operation==='grid'&&current?.objectives.every(n=>n.done)){assert.equal(current.powerDisabled,true);observed.gridPowerOff=true;}
      await screenshot(page,label+'-'+operation+'-interaction-'+actions);
     }
     if(operation==='broadcast'&&current?.objectives.find(n=>n.kind==='broadcast')?.done){
      assert.equal(current.objectives.find(n=>n.kind==='broadcast').progress,2);observed.broadcastCharge=true;
     }
    }
    const saved=await state(page);assert.equal(saved.run,null);assert.equal(saved.base.campaign.cleared[operation],1,operation+' must be completed by real extraction');
    assert.match(await page.locator('#dialog-title').innerText(),/撤离/);await screenshot(page,label+'-'+operation+'-result');
    await input(page.locator('[data-testid="result-home"]'));await input(page.locator('#campaign-button'));
    chain.push({operation,interactions:actions,payout:saved.base.credits});
   }
   assert.ok(Object.values(observed).every(Boolean),'different objectives produce genuinely different actions');
   const finalBase=(await state(page)).base;assert.equal(finalBase.runs,4);assert.ok(Object.values(finalBase.campaign.cleared).every(n=>n===1));
   const finalArchive=await exportArchive(page,input);
   await input(page.locator('[data-mission="broadcast"]'));
   await importArchive(page,input,zeroArchive);
   assert.equal(await page.locator('[data-mission="survey"]').getAttribute('aria-pressed'),'true','older imported base selects a valid starter mission');
   assert.equal(await page.locator('[data-mission="broadcast"]').isDisabled(),true);
   assert.equal(await page.locator('[data-mission="broadcast"]').getAttribute('aria-pressed'),'false','locked mission does not remain selected');
   await importArchive(page,input,archiveResume);
   assert.equal((await state(page)).run.operation,'archive');
   assert.equal(await page.locator('[data-mission="archive"]').getAttribute('aria-pressed'),'true','imported in-progress operation synchronizes its menu');
   assert.equal(await page.locator('#resume-button').isVisible(),true);
   await input(page.locator('#resume-button'));
   assert.equal(await page.evaluate(()=>localStorage.getItem('echo-expedition.save.v1')),archiveResume,'UI import restores exact actual mid-decryption commands');
   await page.keyboard.press('Escape');await input(page.getByRole('button',{name:'保存并回出发页',exact:true}));
   await importArchive(page,input,finalArchive);
   assert.deepEqual((await state(page)).base,finalBase,'restoring the real finished archive does not lose progression');
   await input(page.locator('#free-raid-button'));await input(page.locator('#start-button'));
   assert.equal((await state(page)).run.operation,undefined,'free raid remains separate optional entry into same engine');
   await page.keyboard.press('Escape');await input(page.getByRole('button',{name:'保存并回出发页',exact:true}));
   await screenshot(page,label+'-campaign-menu');
   assert.deepEqual(errors,[]);assert.deepEqual(requests,[],'offline game requests no remote runtime or assets');
   results.push({label,pass:true,chain,observed,extractedProof:true,diskReplay:true,prerequisites:true,validMenuAfterOlderImport:true,activeOperationImport:true,freeRaidPreserved:true,foregroundUsed:false});
   console.log('PASS campaign '+label);
  }catch(error){failures.push({label,message:error.message,errors});console.error('FAIL campaign '+label+': '+error.message);await page.screenshot({path:path.join(output,label+'-failure.png'),fullPage:true}).catch(()=>{});}
  finally {await context.close();}
 }
 await writeFile(path.join(output,'campaign-browser-results.json'),JSON.stringify({results,failures},null,2));
 assert.deepEqual(failures,[]);console.log(JSON.stringify({passed:results.length,headless:true,foregroundUsed:false}));
}finally {await browser.close();}
