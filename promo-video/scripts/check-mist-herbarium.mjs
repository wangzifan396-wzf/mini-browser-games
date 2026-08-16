import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here=path.dirname(fileURLToPath(import.meta.url)),rootDir=path.resolve(here,"..",".."),outputDir=path.join(rootDir,"output","mist-herbarium"),port=4242,errors=[];
await mkdir(outputDir,{recursive:true});
const server=http.createServer(async(request,response)=>{try{const pathname=decodeURIComponent(new URL(request.url,"http://local").pathname);if(pathname==="/favicon.ico")return response.writeHead(204).end();const target=path.resolve(rootDir,pathname.slice(1));if(!target.startsWith(rootDir+path.sep))return response.writeHead(403).end("Forbidden");const info=await stat(target);if(!info.isFile())throw Error("Not a file");response.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});createReadStream(target).pipe(response)}catch{response.writeHead(404).end("Not found")}});
await new Promise(resolve=>server.listen(port,"127.0.0.1",resolve));
function observe(page,label){page.on("pageerror",error=>errors.push(`${label}: ${error.message}`));page.on("console",message=>{if(message.type()==="error")errors.push(`${label}: ${message.text()}`)})}
async function noOverflow(page,label){const result=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,outside:[...document.querySelectorAll("body *")].filter(element=>{const rect=element.getBoundingClientRect();return rect.left<-4||rect.right>document.documentElement.clientWidth+4}).slice(0,8).map(element=>({tag:element.tagName,id:element.id,left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right}))}));assert.ok(result.scroll<=result.client+4,`${label} horizontal overflow: ${JSON.stringify(result)}`)}
async function open(page,label){const response=await page.goto(`http://127.0.0.1:${port}/mist-valley-herbarium.html`,{waitUntil:"load"});assert.equal(response?.status(),200,`${label} response`);await page.waitForFunction(()=>Boolean(window.__mistHerbarium));await noOverflow(page,label)}

let browser;
try{
  try{browser=await chromium.launch({channel:"msedge",headless:true})}catch{browser=await chromium.launch({headless:true})}
  const desktop=await browser.newContext({viewport:{width:1440,height:950},colorScheme:"dark"}),page=await desktop.newPage();observe(page,"herbarium-desktop");await open(page,"herbarium desktop");
  const validation=await page.evaluate(()=>window.__mistHerbarium.validateContent());
  assert.equal(validation.valid,true,validation.errors.join(" | "));
  assert.equal(validation.cases,12,"twelve fixed cabinets");
  assert.equal(validation.plants,24,"twenty-four field-guide plants");
  assert.equal(validation.samples,48,"four blind samples per cabinet");
  assert.equal(validation.candidateEntries,96,"eight candidate entries per cabinet");
  assert.equal(validation.targetCoverage,24,"every plant enters a formal target");
  assert.equal(validation.references.filter(reference=>reference.stars===3).length,12,"all minimum evidence plans earn three stars");

  await page.locator('[data-case="0"]').click();
  const plan=await page.evaluate(()=>({plans:window.__mistHerbarium.CASES[0].plans,targets:window.__mistHerbarium.CASES[0].targets}));
  for(let sample=0;sample<4;sample++){
    await page.locator(`[data-sample="${sample}"]`).click();
    for(const field of plan.plans[sample])await page.locator(`[data-test="${field}"]`).click();
    await page.locator(`[data-candidate="${plan.targets[sample]}"]`).click();
  }
  assert.equal(await page.evaluate(()=>window.__mistHerbarium.evaluateState(window.__mistHerbarium.state()).reports.every(report=>report.certified)),true,"real tests make every identity unique");
  await page.locator("#submitBtn").click();await page.locator("#infoOverlay").waitFor({state:"visible"});assert.equal(await page.evaluate(()=>window.__mistHerbarium.profile().stars[0]),3,"real minimum evidence path stores three stars");await page.locator("#closeInfoBtn").click();

  await page.evaluate(()=>window.__mistHerbarium.start(1));
  for(let sample=0;sample<4;sample++){await page.locator(`[data-sample="${sample}"]`).click();await page.locator("#hintBtn").click()}
  await page.locator("#submitBtn").click();await page.locator("#infoOverlay").waitFor({state:"visible"});assert.equal(await page.evaluate(()=>window.__mistHerbarium.profile().stars[1]),2,"curator-assisted cabinet is capped at two stars");await page.locator("#closeInfoBtn").click();

  const archive=await page.evaluate(()=>window.__mistHerbarium.encode());assert.match(archive,/^BOTANY2\./,"archive prefix");assert.equal(await page.evaluate(code=>window.__mistHerbarium.decode(code).profile.stars[0],archive),3,"archive round trip");await assert.rejects(()=>page.evaluate(code=>window.__mistHerbarium.decode(code+"x"),archive),"tampered archive rejected");
  const canvasSignal=await page.evaluate(()=>{const canvas=document.querySelector("#specimen"),pixels=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();let alpha=0;for(let index=0;index<pixels.length;index+=800){alpha+=pixels[index+3];colors.add(`${pixels[index]},${pixels[index+1]},${pixels[index+2]}`)}const box=canvas.getBoundingClientRect();return{alpha,colors:colors.size,width:box.width,height:box.height}});assert.ok(canvasSignal.alpha>0&&canvasSignal.colors>6,"specimen canvas has visible pixel variation");assert.ok(canvasSignal.width>700&&canvasSignal.height>200,"desktop specimen bench is visible");await noOverflow(page,"herbarium desktop after completion");await page.screenshot({path:path.join(outputDir,"herbarium-desktop.png"),fullPage:true});await page.close();await desktop.close();

  const mobile=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}),phone=await mobile.newPage();observe(phone,"herbarium-mobile");await open(phone,"herbarium mobile");await phone.locator('[data-case="0"]').tap();const firstField=await phone.evaluate(()=>window.__mistHerbarium.CASES[0].plans[0][0]);await phone.locator(`[data-test="${firstField}"]`).tap();const firstTarget=await phone.evaluate(()=>window.__mistHerbarium.CASES[0].targets[0]);await phone.locator(`[data-candidate="${firstTarget}"]`).tap();assert.equal(await phone.evaluate(()=>window.__mistHerbarium.evaluateState(window.__mistHerbarium.state()).reports[0].pass),true,"touch evidence and label certify a sample");await phone.locator('[data-sample="1"]').tap();assert.equal(await phone.evaluate(()=>window.__mistHerbarium.state().current),1,"touch sample tabs switch specimens");await noOverflow(phone,"herbarium mobile after touch");await phone.screenshot({path:path.join(outputDir,"herbarium-mobile.png"),fullPage:true});await phone.close();await mobile.close();
  assert.deepEqual(errors,[],`browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({checks:"PASS",games:1,cases:validation.cases,plants:validation.plants,samples:validation.samples,candidateEntries:validation.candidateEntries,referenceStars:validation.references.filter(reference=>reference.stars===3).length,screenshots:2},null,2));
}finally{if(browser)await browser.close();server.close()}
