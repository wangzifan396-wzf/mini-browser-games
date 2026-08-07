import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here=path.dirname(fileURLToPath(import.meta.url));
const rootDir=path.resolve(here,"..","..");
const outputDir=path.join(rootDir,"output","touchline-manager");
const port=4237;
const errors=[];
await mkdir(outputDir,{recursive:true});
const server=http.createServer(async(request,response)=>{try{const pathname=decodeURIComponent(new URL(request.url,"http://local").pathname);if(pathname==="/favicon.ico")return response.writeHead(204).end();const target=path.resolve(rootDir,pathname.slice(1));if(!target.startsWith(rootDir+path.sep))return response.writeHead(403).end("Forbidden");const info=await stat(target);if(!info.isFile())throw Error("Not a file");response.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});createReadStream(target).pipe(response)}catch{response.writeHead(404).end("Not found")}});
await new Promise(resolve=>server.listen(port,"127.0.0.1",resolve));

function observe(page,label){page.on("pageerror",error=>errors.push(`${label}: ${error.message}`));page.on("console",message=>{if(message.type()==="error")errors.push(`${label}: ${message.text()}`)})}
async function noOverflow(page,label){const layout=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,outside:[...document.querySelectorAll("body *")].filter(element=>{const rect=element.getBoundingClientRect();return rect.left<-4||rect.right>document.documentElement.clientWidth+4}).slice(0,8).map(element=>({tag:element.tagName,id:element.id,left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right}))}));assert.ok(layout.scroll<=layout.client+4,`${label} horizontal overflow: ${JSON.stringify(layout)}`)}
async function open(page,label){const response=await page.goto(`http://127.0.0.1:${port}/touchline-manager.html`,{waitUntil:"load"});assert.equal(response?.status(),200,`${label} response`);await page.waitForFunction(()=>Boolean(window.__touchlineManager));await noOverflow(page,label)}

let browser;
try{
  try{browser=await chromium.launch({channel:"msedge",headless:true})}catch{browser=await chromium.launch({headless:true})}
  const desktop=await browser.newContext({viewport:{width:1440,height:950},colorScheme:"dark"});
  const page=await desktop.newPage();observe(page,"manager-desktop");await open(page,"manager desktop");
  const content=await page.evaluate(()=>window.__touchlineManager.validateContent());
  assert.deepEqual(content,{valid:true,clubs:4,instructions:4,opponents:10,fixtures:21,badPlans:[]});
  assert.equal(await page.evaluate(()=>window.__touchlineManager.match("press","control")),3,"press beats control");
  assert.equal(await page.evaluate(()=>window.__touchlineManager.match("control","press")),-2,"control loses to press");
  await page.locator('[data-club="harbor"]').click();
  const career=await page.evaluate(()=>({players:window.__touchlineManager.state().players.length,starters:window.__touchlineManager.state().starters.length,fixtures:window.__touchlineManager.state().schedule.length,version:window.__touchlineManager.state().v}));
  assert.deepEqual(career,{players:18,starters:11,fixtures:21,version:4},"career starts with full deterministic season state");
  await page.locator("#playBtn").click();
  await page.locator("#liveOverlay").waitFor({state:"visible"});
  const modelA=await page.evaluate(()=>window.__touchlineManager.model("press"));
  const modelB=await page.evaluate(()=>window.__touchlineManager.model("press"));
  assert.deepEqual(modelA,modelB,"phase model is deterministic before commitment");
  await page.locator('[data-instruction="press"]').click();
  assert.equal(await page.evaluate(()=>window.__touchlineManager.state().live.phase),1,"real phase instruction advances to thirty minutes");
  await page.locator("#autoSubBtn").click();
  assert.equal(await page.evaluate(()=>window.__touchlineManager.state().live.substituted),true,"real automatic substitution changes lineup");
  await page.locator('[data-instruction="control"]').click();
  await page.locator('[data-instruction="counter"]').click();
  assert.equal(await page.evaluate(()=>window.__touchlineManager.state().live.finished),true,"three real instructions finish match");
  assert.equal(await page.locator("#confirmResultBtn").isVisible(),true,"result confirmation appears");
  await page.screenshot({path:path.join(outputDir,"manager-live-desktop.png"),fullPage:true});
  await page.locator("#confirmResultBtn").click();
  const result=await page.evaluate(()=>({round:window.__touchlineManager.state().round,played:window.__touchlineManager.state().table[0].p,live:window.__touchlineManager.state().live,events:window.__touchlineManager.state().events.length}));
  assert.equal(result.round,1,"match advances schedule");assert.equal(result.played,1,"league table updated");assert.equal(result.live,null,"live state committed once");assert.ok(result.events>=4,"phase events retained");
  const archive=await page.evaluate(()=>window.__touchlineManager.encode());
  assert.match(archive,/^TM4-/,"archive prefix");
  assert.equal(await page.evaluate(code=>window.__touchlineManager.decode(code).q.round,archive),1,"archive round trip");
  await assert.rejects(()=>page.evaluate(code=>window.__touchlineManager.decode(code+"x"),archive),"tampered archive rejected");
  await noOverflow(page,"manager desktop after match");
  await page.screenshot({path:path.join(outputDir,"manager-career-desktop.png"),fullPage:true});
  await page.close();await desktop.close();

  const mobile=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const phone=await mobile.newPage();observe(phone,"manager-mobile");await open(phone,"manager mobile");
  await phone.locator('[data-club="academy"]').tap();
  await phone.locator("#playBtn").tap();
  const mobileTeams=await phone.evaluate(()=>({home:document.querySelector("#homeName").textContent,away:document.querySelector("#awayName").textContent}));
  assert.notEqual(mobileTeams.home,mobileTeams.away,"selected club is removed from opponent pool");
  await phone.locator('[data-instruction="probe"]').tap();
  assert.equal(await phone.evaluate(()=>window.__touchlineManager.state().live.phase),1,"touch instruction advances live match");
  await phone.locator("#autoSubBtn").tap();
  await noOverflow(phone,"manager mobile live controls");
  await phone.screenshot({path:path.join(outputDir,"manager-live-mobile.png"),fullPage:true});
  await phone.close();await mobile.close();
  assert.deepEqual(errors,[],`browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({checks:"PASS",games:1,clubs:content.clubs,opponents:content.opponents,instructions:content.instructions,fixtures:content.fixtures,livePhases:3,screenshots:3},null,2));
}finally{if(browser)await browser.close();server.close()}
