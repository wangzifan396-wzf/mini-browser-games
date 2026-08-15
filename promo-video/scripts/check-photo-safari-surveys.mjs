import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here=path.dirname(fileURLToPath(import.meta.url));
const rootDir=path.resolve(here,"..","..");
const outputDir=path.join(rootDir,"output","photo-safari-surveys");
const port=4240;
const errors=[];
await mkdir(outputDir,{recursive:true});

const server=http.createServer(async(request,response)=>{
  try{
    const pathname=decodeURIComponent(new URL(request.url,"http://local").pathname);
    if(pathname==="/favicon.ico")return response.writeHead(204).end();
    const target=path.resolve(rootDir,pathname.slice(1));
    if(!target.startsWith(rootDir+path.sep))return response.writeHead(403).end("Forbidden");
    const info=await stat(target);
    if(!info.isFile())throw Error("Not a file");
    response.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});
    createReadStream(target).pipe(response);
  }catch{
    response.writeHead(404).end("Not found");
  }
});
await new Promise(resolve=>server.listen(port,"127.0.0.1",resolve));

function observe(page,label){
  page.on("pageerror",error=>errors.push(`${label}: ${error.message}`));
  page.on("console",message=>{if(message.type()==="error")errors.push(`${label}: ${message.text()}`)});
}

async function noOverflow(page,label){
  const result=await page.evaluate(()=>({
    client:document.documentElement.clientWidth,
    scroll:document.documentElement.scrollWidth,
    outside:[...document.querySelectorAll("body *")].filter(element=>{
      const rect=element.getBoundingClientRect();
      return rect.left<-4||rect.right>document.documentElement.clientWidth+4;
    }).slice(0,8).map(element=>({tag:element.tagName,id:element.id,left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right}))
  }));
  assert.ok(result.scroll<=result.client+4,`${label} horizontal overflow: ${JSON.stringify(result)}`);
}

async function open(page,label){
  const response=await page.goto(`http://127.0.0.1:${port}/photo-safari.html`,{waitUntil:"load"});
  assert.equal(response?.status(),200,`${label} response`);
  await page.waitForFunction(()=>Boolean(window.__photoSafari));
  await noOverflow(page,label);
}

let browser;
try{
  try{browser=await chromium.launch({channel:"msedge",headless:true})}catch{browser=await chromium.launch({headless:true})}

  const desktop=await browser.newContext({viewport:{width:1440,height:950},colorScheme:"dark"});
  const page=await desktop.newPage();
  observe(page,"photo-desktop");
  await open(page,"photo desktop");

  const validation=await page.evaluate(()=>window.__photoSafari.validateContent());
  assert.equal(validation.valid,true,validation.errors.join(" | "));
  assert.equal(validation.surveys,12,"twelve fixed wildlife surveys");
  assert.equal(validation.encounters,72,"six fixed encounters in every survey");
  assert.equal(validation.species,24,"twenty-four species represented");
  assert.equal(validation.references.filter(reference=>reference.stars===3).length,12,"all formal references earn three stars");
  assert.equal(await page.evaluate(()=>window.__photoSafari.SURVEYS.every(survey=>new Set(survey.goals.map(id=>survey.encounters.find(encounter=>encounter.id===id).species)).size===3)),true,"every survey requires three different species");

  await page.locator('[data-survey="0"]').click();
  for(let goal=0;goal<3;goal++){
    const focused=await page.evaluate(index=>window.__photoSafari.focusReference(index),goal);
    assert.equal(typeof focused.id,"string",`goal ${goal+1} has a fixed encounter`);
    await page.locator("#shutterBtn").click();
  }
  assert.equal(await page.evaluate(()=>window.__photoSafari.state().photos.length),3,"real shutter controls capture all required evidence");
  await page.locator("#submitBtn").click();
  await page.locator("#infoOverlay").waitFor({state:"visible"});
  assert.equal(await page.evaluate(()=>window.__photoSafari.profile().stars[0]),3,"real survey completion stores three stars");
  const expectedDex=await page.evaluate(()=>{
    const survey=window.__photoSafari.SURVEYS[0];
    return new Set(survey.goals.map(id=>survey.encounters.find(encounter=>encounter.id===id).species)).size;
  });
  assert.equal(await page.evaluate(()=>window.__photoSafari.profile().dex.length),expectedDex,"completed evidence enters the field guide");
  await page.locator("#closeInfoBtn").click();

  const archive=await page.evaluate(()=>window.__photoSafari.encode());
  assert.match(archive,/^PHOTO2\./,"archive prefix");
  assert.equal(await page.evaluate(code=>window.__photoSafari.decode(code).profile.stars[0],archive),3,"archive round trip");
  await assert.rejects(()=>page.evaluate(code=>window.__photoSafari.decode(code+"x"),archive),"tampered archive rejected");

  const canvasSignal=await page.evaluate(()=>{
    const canvas=document.querySelector("#canvas"),context=canvas.getContext("2d"),pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
    let alpha=0,variance=0,previous=-1;
    for(let index=0;index<pixels.length;index+=1600){alpha+=pixels[index+3];if(previous>=0&&pixels[index]!==previous)variance++;previous=pixels[index]}
    const box=canvas.getBoundingClientRect();
    return{alpha,variance,width:box.width,height:box.height};
  });
  assert.ok(canvasSignal.alpha>0&&canvasSignal.variance>10,"canvas contains visible, varied scene pixels");
  assert.ok(canvasSignal.width>700&&canvasSignal.height>350,"desktop camera scene is materially visible");
  await noOverflow(page,"photo desktop after survey");
  await page.screenshot({path:path.join(outputDir,"photo-desktop.png"),fullPage:true});
  await page.close();
  await desktop.close();

  const migration=await browser.newContext({viewport:{width:900,height:700}});
  await migration.addInitScript(()=>localStorage.setItem("photoSafariV3",JSON.stringify({v:3,profile:{dex:[0,4,8,12,16]},q:null})));
  const legacyPage=await migration.newPage();
  observe(legacyPage,"photo-migration");
  await open(legacyPage,"photo V3 migration");
  assert.equal(await legacyPage.evaluate(()=>window.__photoSafari.profile().legacyDex),5,"V3 nested field guide count migrates as a historical record");
  await legacyPage.close();
  await migration.close();

  const mobile=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const phone=await mobile.newPage();
  observe(phone,"photo-mobile");
  await open(phone,"photo mobile");
  await phone.locator('[data-survey="0"]').tap();
  const before=await phone.locator("#reticle").evaluate(element=>({left:element.style.left,top:element.style.top}));
  const scene=await phone.locator("#canvas").boundingBox();
  assert.ok(scene&&scene.width>300&&scene.height>160,"mobile camera scene is visible");
  await phone.touchscreen.tap(scene.x+scene.width*.18,scene.y+scene.height*.22);
  const after=await phone.locator("#reticle").evaluate(element=>({left:element.style.left,top:element.style.top}));
  assert.notDeepEqual(after,before,"real canvas tap moves the reticle");
  await phone.locator("#zoomRange").fill("20");
  assert.equal(await phone.locator("#zoomText").innerText(),"2.0×","touch zoom control updates focal length");
  const timeBefore=await phone.evaluate(()=>window.__photoSafari.state().time);
  await phone.locator("#stepBtn").tap();
  assert.equal(await phone.evaluate(()=>window.__photoSafari.state().time),timeBefore+1,"touch wait control advances the deterministic timeline");
  await phone.locator("#shutterBtn").tap();
  assert.equal(await phone.evaluate(()=>window.__photoSafari.state().shots),1,"touch shutter consumes one exposure");
  await noOverflow(phone,"photo mobile after touch");
  await phone.screenshot({path:path.join(outputDir,"photo-mobile.png"),fullPage:true});
  await phone.close();
  await mobile.close();

  assert.deepEqual(errors,[],`browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    checks:"PASS",
    games:1,
    surveys:validation.surveys,
    encounters:validation.encounters,
    species:validation.species,
    referenceStars:validation.references.filter(reference=>reference.stars===3).length,
    screenshots:2
  },null,2));
}finally{
  if(browser)await browser.close();
  server.close();
}
