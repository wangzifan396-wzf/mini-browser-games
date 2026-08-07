import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here=path.dirname(fileURLToPath(import.meta.url));
const rootDir=path.resolve(here,"..","..");
const outputDir=path.join(rootDir,"output","relay-coordination");
const port=4236;
const errors=[];
await mkdir(outputDir,{recursive:true});
const server=http.createServer(async(request,response)=>{try{const pathname=decodeURIComponent(new URL(request.url,"http://local").pathname);if(pathname==="/favicon.ico")return response.writeHead(204).end();const target=path.resolve(rootDir,pathname.slice(1));if(!target.startsWith(rootDir+path.sep))return response.writeHead(403).end("Forbidden");const info=await stat(target);if(!info.isFile())throw Error("Not a file");response.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});createReadStream(target).pipe(response)}catch{response.writeHead(404).end("Not found")}});
await new Promise(resolve=>server.listen(port,"127.0.0.1",resolve));

function observe(page,label){page.on("pageerror",error=>errors.push(`${label}: ${error.message}`));page.on("console",message=>{if(message.type()==="error")errors.push(`${label}: ${message.text()}`)})}
async function noOverflow(page,label){const layout=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,outside:[...document.querySelectorAll("body *")].filter(element=>{const rect=element.getBoundingClientRect();return rect.left<-4||rect.right>document.documentElement.clientWidth+4}).slice(0,8).map(element=>({tag:element.tagName,id:element.id,left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right}))}));assert.ok(layout.scroll<=layout.client+4,`${label} horizontal overflow: ${JSON.stringify(layout)}`)}
async function open(page,label){const response=await page.goto(`http://127.0.0.1:${port}/relay-coordination.html`,{waitUntil:"load"});assert.equal(response?.status(),200,`${label} response`);await page.waitForFunction(()=>Boolean(window.__relayCoordination));await noOverflow(page,label)}

let browser;
try{
  try{browser=await chromium.launch({channel:"msedge",headless:true})}catch{browser=await chromium.launch({headless:true})}
  const desktop=await browser.newContext({viewport:{width:1440,height:950},colorScheme:"dark"});
  const page=await desktop.newPage();observe(page,"relay-desktop");await open(page,"relay desktop");
  const validation=await page.evaluate(()=>window.__relayCoordination.validateContent());
  assert.equal(validation.valid,true,validation.errors.join(" | "));
  assert.equal(validation.scenarios,12,"twelve fixed stations");
  assert.ok(validation.relays>=70,"at least seventy relay instances");
  assert.ok(validation.cases>=100,"at least one hundred primary and backup fault trials");
  assert.equal(validation.references.every(reference=>reference.stars===3),true,"all references pass formal three-star evaluation");
  const initial=await page.evaluate(()=>window.__relayCoordination.SCENARIOS.map((scenario,index)=>window.__relayCoordination.evaluateScenario(index,window.__relayCoordination.fresh(index).settings).stars));
  assert.equal(initial.every(stars=>stars<3),true,"shared initial settings do not solve the campaign");
  await page.locator('[data-scenario="0"]').click();
  assert.equal(await page.locator('[data-relay-card]').count(),3,"first station renders three relay controls");
  await page.locator('[data-setting="pickup"]').first().selectOption("9");
  assert.equal(await page.evaluate(()=>window.__relayCoordination.state().settings.R1.pickup),9,"real selector changes pickup setting");
  await page.locator("#caseSelect").selectOption("2");
  await page.locator("#demoBtn").click();
  assert.equal(await page.evaluate(()=>window.__relayCoordination.state().last.kind),"demo","real fault demonstration uses formal path simulation");
  const firstReference=await page.evaluate(()=>window.__relayCoordination.applyReference(0));
  assert.equal(firstReference.stars,3,"reference application reaches three stars");
  await page.locator("#testAllBtn").click();
  await page.locator("#infoOverlay").waitFor({state:"visible"});
  assert.equal(await page.evaluate(()=>window.__relayCoordination.profile().stars[0]),3,"real acceptance stores three-star result");
  await page.locator("#closeInfoBtn").click();
  const archive=await page.evaluate(()=>window.__relayCoordination.encode());
  assert.match(archive,/^RELAY2\./,"archive prefix");
  assert.equal(await page.evaluate(code=>window.__relayCoordination.decode(code).profile.stars[0],archive),3,"archive round trip");
  await assert.rejects(()=>page.evaluate(code=>window.__relayCoordination.decode(code+"x"),archive),"tampered archive rejected");
  const svg=await page.evaluate(()=>({wires:document.querySelectorAll(".wire").length,nodes:document.querySelectorAll(".node").length,box:document.querySelector("#network").getBoundingClientRect().toJSON()}));
  assert.deepEqual({wires:svg.wires,nodes:svg.nodes},{wires:3,nodes:4},"network diagram has formal edge and node layers");
  assert.ok(svg.box.width>500&&svg.box.height>250,"desktop network diagram visible");
  await noOverflow(page,"relay desktop after interaction");
  await page.screenshot({path:path.join(outputDir,"relay-desktop.png"),fullPage:true});
  await page.close();await desktop.close();

  const mobile=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const phone=await mobile.newPage();observe(phone,"relay-mobile");await open(phone,"relay mobile");
  await phone.locator('[data-scenario="0"]').tap();
  await phone.locator('[data-setting="delay"]').nth(2).selectOption("1");
  await phone.locator("#focusBtn").tap();
  await phone.locator("#demoBtn").tap();
  assert.ok((await phone.locator("#message").innerText()).includes("演练结果"),"touch fault demonstration completes");
  await noOverflow(phone,"relay mobile after touch");
  await phone.screenshot({path:path.join(outputDir,"relay-mobile.png"),fullPage:true});
  await phone.close();await mobile.close();
  assert.deepEqual(errors,[],`browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({checks:"PASS",games:1,scenarios:validation.scenarios,relays:validation.relays,cases:validation.cases,referenceStars:validation.references.filter(reference=>reference.stars===3).length,screenshots:2},null,2));
}finally{if(browser)await browser.close();server.close()}
