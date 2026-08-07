import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here=path.dirname(fileURLToPath(import.meta.url)),rootDir=path.resolve(here,"..",".."),outputDir=path.join(rootDir,"output","tiny-factory-contracts"),port=4238,errors=[];
await mkdir(outputDir,{recursive:true});
const server=http.createServer(async(request,response)=>{try{const pathname=decodeURIComponent(new URL(request.url,"http://local").pathname);if(pathname==="/favicon.ico")return response.writeHead(204).end();const target=path.resolve(rootDir,pathname.slice(1));if(!target.startsWith(rootDir+path.sep))return response.writeHead(403).end("Forbidden");const info=await stat(target);if(!info.isFile())throw Error("Not a file");response.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});createReadStream(target).pipe(response)}catch{response.writeHead(404).end("Not found")}});
await new Promise(resolve=>server.listen(port,"127.0.0.1",resolve));
function observe(page,label){page.on("pageerror",error=>errors.push(`${label}: ${error.message}`));page.on("console",message=>{if(message.type()==="error")errors.push(`${label}: ${message.text()}`)})}
async function noOverflow(page,label){const result=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,outside:[...document.querySelectorAll("body *")].filter(element=>{const rect=element.getBoundingClientRect();return rect.left<-4||rect.right>document.documentElement.clientWidth+4}).slice(0,8).map(element=>({tag:element.tagName,id:element.id,left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right}))}));assert.ok(result.scroll<=result.client+4,`${label} horizontal overflow: ${JSON.stringify(result)}`)}
async function open(page,label){const response=await page.goto(`http://127.0.0.1:${port}/tiny-factory.html`,{waitUntil:"load"});assert.equal(response?.status(),200,`${label} response`);await page.waitForFunction(()=>Boolean(window.__tinyFactory));await noOverflow(page,label)}

let browser;
try{
  try{browser=await chromium.launch({channel:"msedge",headless:true})}catch{browser=await chromium.launch({headless:true})}
  const desktop=await browser.newContext({viewport:{width:1440,height:950},colorScheme:"dark"}),page=await desktop.newPage();observe(page,"factory-desktop");await open(page,"factory desktop");
  const validation=await page.evaluate(()=>window.__tinyFactory.validateContent());
  assert.equal(validation.valid,true,validation.errors.join(" | "));
  assert.equal(validation.contracts,12,"twelve fixed contracts");
  assert.ok(validation.devices>=50,"substantial fixed device and obstacle content");
  assert.ok(validation.referenceTiles>=120,"substantial reference routing content");
  assert.equal(validation.references.every(reference=>reference.stars===3),true,"all formal references earn three stars");
  await page.locator('[data-contract="0"]').click();
  await page.locator('[data-cell="1,3"]').click();
  assert.deepEqual(await page.evaluate(()=>window.__tinyFactory.state().layout["1,3"]),{type:"belt",dir:0},"real grid click places belt");
  await page.locator("#stepBtn").click();await page.locator("#stepBtn").click();
  assert.equal(await page.evaluate(()=>window.__tinyFactory.state().sim.tick),2,"real single-step advances formal clock");
  await page.evaluate(()=>window.__tinyFactory.applyReference(0));
  for(let tick=0;tick<50&&!await page.evaluate(()=>window.__tinyFactory.state().sim.complete);tick++)await page.locator("#stepBtn").click();
  assert.equal(await page.evaluate(()=>window.__tinyFactory.state().sim.complete),true,"real step controls complete reference factory");
  await page.locator("#infoOverlay").waitFor({state:"visible"});
  assert.equal(await page.evaluate(()=>window.__tinyFactory.profile().stars[0]),3,"real completion stores three stars");
  await page.locator("#closeInfoBtn").click();
  const archive=await page.evaluate(()=>window.__tinyFactory.encode());assert.match(archive,/^FACTORY2\./,"archive prefix");assert.equal(await page.evaluate(code=>window.__tinyFactory.decode(code).profile.stars[0],archive),3,"archive round trip");await assert.rejects(()=>page.evaluate(code=>window.__tinyFactory.decode(code+"x"),archive),"tampered archive rejected");
  await noOverflow(page,"factory desktop after completion");await page.screenshot({path:path.join(outputDir,"factory-desktop.png"),fullPage:true});await page.close();await desktop.close();

  const mobile=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}),phone=await mobile.newPage();observe(phone,"factory-mobile");await open(phone,"factory mobile");await phone.locator('[data-contract="0"]').tap();await phone.locator("#rotateBtn").tap();await phone.locator('[data-cell="1,3"]').tap();assert.equal(await phone.evaluate(()=>window.__tinyFactory.state().layout["1,3"].dir),1,"touch rotation and placement");await phone.locator("#undoBtn").tap();assert.equal(await phone.evaluate(()=>Boolean(window.__tinyFactory.state().layout["1,3"])),false,"touch undo restores blueprint");await noOverflow(phone,"factory mobile controls");await phone.screenshot({path:path.join(outputDir,"factory-mobile.png"),fullPage:true});await phone.close();await mobile.close();
  assert.deepEqual(errors,[],`browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({checks:"PASS",games:1,contracts:validation.contracts,devices:validation.devices,referenceTiles:validation.referenceTiles,referenceStars:validation.references.filter(reference=>reference.stars===3).length,screenshots:2},null,2));
}finally{if(browser)await browser.close();server.close()}
