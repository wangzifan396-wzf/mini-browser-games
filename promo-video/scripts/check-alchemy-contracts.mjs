import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here=path.dirname(fileURLToPath(import.meta.url)),rootDir=path.resolve(here,"..",".."),outputDir=path.join(rootDir,"output","alchemy-contracts"),port=4241,errors=[];
await mkdir(outputDir,{recursive:true});
const server=http.createServer(async(request,response)=>{try{const pathname=decodeURIComponent(new URL(request.url,"http://local").pathname);if(pathname==="/favicon.ico")return response.writeHead(204).end();const target=path.resolve(rootDir,pathname.slice(1));if(!target.startsWith(rootDir+path.sep))return response.writeHead(403).end("Forbidden");const info=await stat(target);if(!info.isFile())throw Error("Not a file");response.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});createReadStream(target).pipe(response)}catch{response.writeHead(404).end("Not found")}});
await new Promise(resolve=>server.listen(port,"127.0.0.1",resolve));
function observe(page,label){page.on("pageerror",error=>errors.push(`${label}: ${error.message}`));page.on("console",message=>{if(message.type()==="error")errors.push(`${label}: ${message.text()}`)})}
async function noOverflow(page,label){const result=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,outside:[...document.querySelectorAll("body *")].filter(element=>{const rect=element.getBoundingClientRect();return rect.left<-4||rect.right>document.documentElement.clientWidth+4}).slice(0,8).map(element=>({tag:element.tagName,id:element.id,left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right}))}));assert.ok(result.scroll<=result.client+4,`${label} horizontal overflow: ${JSON.stringify(result)}`)}
async function open(page,label){const response=await page.goto(`http://127.0.0.1:${port}/alchemy-workshop.html`,{waitUntil:"load"});assert.equal(response?.status(),200,`${label} response`);await page.waitForFunction(()=>Boolean(window.__alchemyWorkshop));await noOverflow(page,label)}

let browser;
try{
  try{browser=await chromium.launch({channel:"msedge",headless:true})}catch{browser=await chromium.launch({headless:true})}
  const desktop=await browser.newContext({viewport:{width:1440,height:950},colorScheme:"dark"}),page=await desktop.newPage();observe(page,"alchemy-desktop");await open(page,"alchemy desktop");
  const validation=await page.evaluate(()=>window.__alchemyWorkshop.validateContent());
  assert.equal(validation.valid,true,validation.errors.join(" | "));
  assert.equal(validation.contracts,12,"twelve fixed contracts");
  assert.equal(validation.ingredients,20,"twenty ingredient profiles");
  assert.equal(validation.reactions,14,"fourteen discoverable reactions");
  assert.equal(validation.covered,20,"formal references cover every ingredient");
  assert.equal(validation.references.filter(reference=>reference.stars===3).length,12,"all references earn three stars");

  await page.locator('[data-contract="0"]').click();
  const reference=await page.evaluate(()=>window.__alchemyWorkshop.CONTRACTS[0].reference);
  for(const id of reference.ingredients)await page.locator(`[data-ing="${id}"]`).click();
  await page.locator("#apparatusSelect").selectOption(reference.apparatus);
  await page.locator("#heatSelect").selectOption(reference.heat);
  await page.locator("#durationSelect").selectOption(reference.duration);
  await page.locator("#assayBtn").click();
  assert.equal(await page.evaluate(()=>window.__alchemyWorkshop.state().experiments),1,"real assay records an experiment");
  assert.ok(await page.locator("#reactions .reaction").count()>=1,"assay exposes active reaction knowledge");
  await page.locator("#submitBtn").click();
  await page.locator("#infoOverlay").waitFor({state:"visible"});
  assert.equal(await page.evaluate(()=>window.__alchemyWorkshop.profile().stars[0]),3,"real reference selection stores three stars");
  await page.locator("#closeInfoBtn").click();

  await page.evaluate(()=>window.__alchemyWorkshop.start(1));
  await page.locator("#hintBtn").click();
  await page.locator("#submitBtn").click();
  await page.locator("#infoOverlay").waitFor({state:"visible"});
  assert.equal(await page.evaluate(()=>window.__alchemyWorkshop.profile().stars[1]),2,"mentor sample is formally capped at two stars");
  await page.locator("#closeInfoBtn").click();

  const archive=await page.evaluate(()=>window.__alchemyWorkshop.encode());
  assert.match(archive,/^ALCH2\./,"archive prefix");
  assert.equal(await page.evaluate(code=>window.__alchemyWorkshop.decode(code).profile.stars[0],archive),3,"archive round trip");
  await assert.rejects(()=>page.evaluate(code=>window.__alchemyWorkshop.decode(code+"x"),archive),"tampered archive rejected");
  const canvasSignal=await page.evaluate(()=>{const canvas=document.querySelector("#chart"),pixels=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();let alpha=0;for(let index=0;index<pixels.length;index+=800){alpha+=pixels[index+3];colors.add(`${pixels[index]},${pixels[index+1]},${pixels[index+2]}`)}const box=canvas.getBoundingClientRect();return{alpha,colors:colors.size,width:box.width,height:box.height}});
  assert.ok(canvasSignal.alpha>0&&canvasSignal.colors>8,"assay chart has visible pixel variation");
  assert.ok(canvasSignal.width>700&&canvasSignal.height>200,"desktop assay chart is visible");
  await noOverflow(page,"alchemy desktop after completion");
  await page.screenshot({path:path.join(outputDir,"alchemy-desktop.png"),fullPage:true});await page.close();await desktop.close();

  const migration=await browser.newContext({viewport:{width:900,height:700}});await migration.addInitScript(()=>localStorage.setItem("alchemyWorkshopV3",JSON.stringify({v:3,known:[0,1,2,3,4,5,6],stock:{}})));const oldPage=await migration.newPage();observe(oldPage,"alchemy-migration");await open(oldPage,"alchemy V3 migration");assert.equal(await oldPage.evaluate(()=>window.__alchemyWorkshop.profile().legacyKnown),7,"V3 recipe count migrates as history");await oldPage.close();await migration.close();

  const mobile=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}),phone=await mobile.newPage();observe(phone,"alchemy-mobile");await open(phone,"alchemy mobile");await phone.locator('[data-contract="0"]').tap();await phone.locator('[data-ing="0"]').tap();await phone.locator('[data-ing="2"]').tap();await phone.locator("#apparatusSelect").selectOption("infuse");await phone.locator("#heatSelect").selectOption("low");await phone.locator("#assayBtn").tap();assert.deepEqual(await phone.evaluate(()=>window.__alchemyWorkshop.state().last.axis),await phone.evaluate(()=>window.__alchemyWorkshop.CONTRACTS[0].target),"touch experiment reaches visible target");await phone.locator("#undoBtn").tap();assert.equal(await phone.evaluate(()=>window.__alchemyWorkshop.state().ingredients.length),1,"touch undo removes the latest material");await noOverflow(phone,"alchemy mobile after touch");await phone.screenshot({path:path.join(outputDir,"alchemy-mobile.png"),fullPage:true});await phone.close();await mobile.close();
  assert.deepEqual(errors,[],`browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({checks:"PASS",games:1,contracts:validation.contracts,ingredients:validation.ingredients,reactions:validation.reactions,referenceStars:validation.references.filter(reference=>reference.stars===3).length,screenshots:2},null,2));
}finally{if(browser)await browser.close();server.close()}
