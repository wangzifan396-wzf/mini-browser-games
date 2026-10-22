import assert from 'node:assert/strict';
import { chromium } from '../promo-video/node_modules/playwright/index.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'output/pulse-composer');
await mkdir(output, { recursive: true });
const url = pathToFileURL(path.join(root, 'pulse-studio.html')).href;
const results = [];
let browser;
try { browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] }); }
catch { browser = await chromium.launch({ headless: true, args: ['--mute-audio'] }); }
const state = page => page.evaluate(() => window.__pulseComposer.state());
const code = page => page.evaluate(() => window.PulseComposerCore.encode(window.__pulseComposer.state()));
async function input(page, selector, value) { await page.locator(selector).fill(String(value)); await page.locator(selector).press('Tab'); }
async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, scrollX,
    overflow: [...document.querySelectorAll('body *')].filter(node=>!node.closest('.c-seq')).map(node=>({tag:node.tagName,id:node.id,cl:node.className,width:node.getBoundingClientRect().width,right:node.getBoundingClientRect().right+scrollX,display:getComputedStyle(node).display})).filter(row=>row.width>0&&row.right>innerWidth+2).slice(0,12) }));
  assert.ok(dimensions.scroll <= dimensions.width + 2, `body overflow: ${JSON.stringify(dimensions)}`);
}
async function download(page, selector, name) {
  const pending = page.waitForEvent('download'); await page.locator(selector).click();
  const file = await pending; assert.equal(await file.failure(), null); await file.saveAs(path.join(output, name));
  return readFile(await file.path());
}
async function run(mobile) {
  const label = mobile ? 'mobile' : 'desktop';
  const context = await browser.newContext({ acceptDownloads: true, viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (!/^(file:|blob:|data:)/.test(request.url())) external.push(request.url()); });
  page.on('dialog', dialog => dialog.accept());
  const click = selector => mobile ? page.locator(selector).tap() : page.locator(selector).click();
  try {
    await page.goto(url, { waitUntil: 'load' }); await page.waitForFunction(() => Boolean(window.__pulseComposer));
    assert.equal(await page.evaluate(() => window.__pulseComposer.mode()), 'composer');
    assert.equal(await page.locator('#composerApp').isVisible(), true); assert.equal(await page.locator('#legacyApp').isVisible(), false);
    await noOverflow(page);
    const initial = await state(page); assert.equal(initial.patterns.length, 4); assert.equal(await page.locator('#cKit option:disabled').count(), 0);
    const cell = '#cSeq [data-track="5"][data-step="2"]';
    await click(cell); await page.locator('#cVelocity').selectOption('3'); await page.locator('#cDegree').selectOption('7');
    let p = await state(page); assert.equal(p.patterns[0].steps[5][2], 3); assert.equal(p.patterns[0].notes[5][2], 7);
    const originalA = p.patterns[0];
    await page.locator('#cCopyTarget').selectOption('1'); await click('#cCopy');
    p = await state(page); assert.deepEqual(p.patterns[1].steps, originalA.steps); assert.deepEqual(p.patterns[1].notes, originalA.notes);
    await click('#cPatterns [data-pattern="1"]'); await click(cell); await page.locator('#cVelocity').selectOption('2'); await page.locator('#cDegree').selectOption('1');
    p = await state(page); assert.deepEqual(p.patterns[0], originalA); assert.equal(p.patterns[1].notes[5][2], 1);
    const beforeVariation = await code(page); await input(page, '#cSeed', 23); await click('#cVariation');
    const variation = await code(page); assert.notEqual(variation, beforeVariation);
    await click('#cUndo'); assert.equal(await code(page), beforeVariation); await click('#cRedo'); assert.equal(await code(page), variation);
    await click('#cUndo'); await click('#cShiftLeft'); await click('#cShiftRight'); assert.equal(await code(page), beforeVariation);
    await click('#cAppend'); await page.getByLabel('段落1重复次数', { exact: true }).selectOption('2');
    await page.getByLabel('段落2重复次数', { exact: true }).selectOption('3');
    await page.getByRole('button', { name: '后移段落1', exact: true }).click();
    assert.deepEqual((await state(page)).order, [{ pattern: 1, repeats: 3 }, { pattern: 0, repeats: 2 }]);
    await input(page, '#cBpm', 137); await page.locator('#cSwing').focus(); await page.locator('#cSwing').press('End');
    await page.locator('#cSwing').press('Tab'); await page.locator('#cKit').selectOption('3');
    await page.locator('#cRoot').selectOption('55'); await page.locator('#cScale').selectOption('major');
    await page.getByRole('button', { name: '低音静音', exact: true }).click();
    assert.equal((await state(page)).tracks[3].mute, true);
    await page.getByRole('button', { name: '低音静音', exact: true }).click();
    await page.getByRole('button', { name: '主奏独奏', exact: true }).click();
    assert.equal(await page.evaluate(() => window.PulseComposerCore.compile(window.__pulseComposer.state()).steps.flatMap(s => s.events).every(e => e.track === 5)), true);
    await page.getByRole('button', { name: '主奏独奏', exact: true }).click();
    p = await state(page); assert.equal(p.bpm, 137); assert.equal(p.swing, .45); assert.equal(p.kit, 3); assert.equal(p.scale, 'major');
    await input(page, '#cTitle', '编曲测试 · ' + label); await page.locator('#cShelf').selectOption('0'); await click('#cShelfSave');
    const saved0 = await code(page);
    await input(page, '#cTitle', '第二完整工程'); await input(page, '#cBpm', 120); await page.locator('#cShelf').selectOption('1'); await click('#cShelfSave');
    const saved1 = await code(page);
    await input(page, '#cTitle', '第三完整工程'); await page.locator('#cRoot').selectOption('57'); await page.locator('#cShelf').selectOption('2'); await click('#cShelfSave');
    const saved2 = await code(page);
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => Boolean(window.__pulseComposer)); assert.equal(await code(page), saved2);
    for (const [index, saved] of [[0, saved0], [1, saved1], [2, saved2]]) {
      await page.locator('#cShelf').selectOption(String(index)); await click('#cShelfLoad'); assert.equal(await code(page), saved, 'shelf restores the full project');
    }
    await click('#cProject'); const projectText = await page.locator('#cProjectText').inputValue(); assert.match(projectText, /^PULSESONG1\./);
    const textDownload = await download(page, '#cProjectDownload', label + '.pulse.txt'); assert.equal(textDownload.toString(), projectText);
    const preserved = await code(page); await page.locator('#cProjectText').fill(projectText + 'corrupt'); await click('#cProjectImport');
    assert.match(await page.locator('#cProjectFeedback').innerText(), /原工程未改变/); assert.equal(await code(page), preserved);
    await page.locator('#cProjectFile').setInputFiles({ name: 'test.pulse.txt', mimeType: 'text/plain', buffer: textDownload });
    await page.waitForFunction(() => document.getElementById('cProjectFeedback').textContent.includes('文件已读取'));
    assert.equal(await code(page), preserved, 'reading file does not import it'); await click('#cProjectImport'); assert.equal(await code(page), preserved);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#cProjectModal').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'cProject');
    await click('#cPlaySong'); await page.waitForFunction(() => window.__pulseComposer.transport().state === 'playing');
    await page.waitForFunction(() => document.querySelectorAll('#cSeq .now').length > 0);
    await click('#cStop'); await page.waitForFunction(() => window.__pulseComposer.transport().state === 'stopped');
    assert.equal(await page.locator('#cSeq .now').count(), 0);
    await click('#cPlayPattern'); await page.waitForFunction(() => window.__pulseComposer.transport().state === 'playing');
    await click('#cSeq [data-track="0"][data-step="0"]'); assert.equal(await page.evaluate(() => window.__pulseComposer.transport().state), 'stopped');
    await click('#cUndo');
    await click('#cPlaySong'); await page.waitForFunction(() => window.__pulseComposer.transport().state === 'playing'); await click('#cStop');
    const wav = await download(page, '#cWav', label + '.wav');
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE'); assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt32LE(24), 44100); assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), wav.length - 44); assert.equal(wav.readUInt32LE(4), wav.length - 8);
    let peak = 0, energy = 0, tailPeak = 0;
    for (let i = 44; i < wav.length; i += 2) { const sample = wav.readInt16LE(i); peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; if (i > wav.length - 4410) tailPeak = Math.max(tailPeak, Math.abs(sample)); }
    assert.ok(energy > 1000000 && peak > 50, 'rendered WAV contains real nonzero audio'); assert.ok(peak <= 32113, 'WAV peak attenuation prevents clipping');
    const exported = await page.evaluate(() => window.__pulseComposer.lastExport()), playback = await page.evaluate(() => window.__pulseComposer.lastPlayback());
    assert.equal(exported.projectCode, playback.projectCode); assert.equal(exported.events, playback.events);
    assert.equal(exported.frames * 2 + 44, wav.length); assert.equal(exported.sampleRate, 44100); assert.ok(exported.duration > exported.musicalDuration);
    await noOverflow(page);await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({ path: path.join(output, label + '-viewport.png'), fullPage: false });
    await page.screenshot({ path: path.join(output, label + '.png'), fullPage: true });
    const legacy = await page.evaluate(() => {
      const C = window.PulseComposerCore, slots = [C.createProject().patterns[0].steps, null, C.blank().patterns[0].steps];
      slots[2][5][15] = 3; let hash = 2166136261;
      const body = btoa(JSON.stringify({ v: 2, u: 1.5, s: [99, '2', -1], k: 2.5, l: slots }));
      for (let i = 0; i < body.length; i++) hash = Math.imul(hash ^ body.charCodeAt(i), 16777619);
      return 'PULSE2.' + body + '.' + (hash >>> 0).toString(36).toUpperCase();
    });
    await click('#cProject'); await page.locator('#cProjectText').fill(legacy); await click('#cProjectImport');
    p = await state(page); assert.equal(p.bpm, 112); assert.equal(p.kit, 0); assert.equal(p.patterns[2].steps[5][15], 3);
    await page.keyboard.press('Escape');
    const composerBeforePractice = await code(page); await click('#practiceModeBtn'); assert.equal(await page.locator('#legacyApp').isVisible(), true);
    await click('#tour [data-gig="0"]');
    for (const [r,i,v] of [[0,0,3],[0,4,3],[0,8,3],[0,12,2],[1,4,2],[1,12,2],[2,1,2],[2,3,2],[2,5,2],[2,7,2]])
      for(let n=0;n<v;n++)await click(`#seq [data-r="${r}"][data-i="${i}"]`);
    assert.equal(await page.evaluate(() => window.__pulseStudio.rating().stars), 3); await click('#submitBtn');
    assert.equal(await page.evaluate(() => window.__pulseStudio.career().stars[0]), 3);
    const fans=await page.evaluate(()=>window.__pulseStudio.career().fans);await click('#submitBtn');
    assert.equal(await page.evaluate(()=>window.__pulseStudio.career().fans),fans,'repeat equal rating does not farm listeners');
    await click('#clearBtn');
    for(let i=4;i<14;i++)await click(`#seq [data-r="2"][data-i="${i}"]`);
    assert.equal(await page.evaluate(()=>window.__pulseStudio.metrics().emptyRun),6,'silence crossing the loop boundary is contiguous');
    await click('#playBtn'); await page.waitForFunction(() => document.getElementById('playBtn').textContent.includes('停止'));
    await click('#composerModeBtn'); assert.equal(await code(page), composerBeforePractice); assert.match(await page.locator('#playBtn').textContent(), /播放/);
    assert.deepEqual(errors, [], 'no page or console errors'); assert.deepEqual(external, [], 'no external runtime resources');
    const result = { viewport: label, passed: true, shelves: 3, fullProject: true, legacyMigration: true, legacyPractice: true, wav: { bytes: wav.length, frames: exported.frames, musicalDuration: exported.musicalDuration, duration: exported.duration, peakPCM: peak, tailPeakPCM: tailPeak }, pageErrors: errors, externalRequests: external };
    results.push(result); console.log('PASS pulse-composer ' + label);
  } catch (error) {
    await page.screenshot({ path: path.join(output, label + '-failure.png'), fullPage: true }).catch(() => {});
    results.push({ viewport: label, passed: false, error: error.message, pageErrors: errors, externalRequests: external });
    console.error('FAIL pulse-composer ' + label + ': ' + error.stack);
  } finally { await context.close(); }
}
async function recovery(kind) {
  const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[];
  if(kind==='blocked-storage')await context.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage disabled','SecurityError');}}));
  if(kind==='bad-legacy')await context.addInitScript(()=>localStorage.setItem('miniPulseStudioV2',JSON.stringify({v:2,unlocked:1.5,stars:[99,'2',-1],kit:2.5,fans:-3,slots:[]})));
  if(kind==='bad-draft')await context.addInitScript(()=>localStorage.setItem('miniPulseComposerV1','{"v":1,"bpm":null}'));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(url,{waitUntil:'load'});await page.waitForFunction(()=>Boolean(window.__pulseComposer));
    if(kind==='blocked-storage'){
      await page.locator('#cSeq [data-track="0"][data-step="1"]').click();assert.match(await page.locator('#cSaveState').innerText(),/无法保存/);
    }else if(kind==='bad-legacy'){
      await page.locator('#practiceModeBtn').click();const career=await page.evaluate(()=>window.__pulseStudio.career());
      assert.equal(career.unlocked,1);assert.deepEqual(career.stars.slice(0,3),[3,0,0]);assert.equal(career.kit,0);assert.equal(career.fans,0);
      assert.equal(await page.locator('#gigName').innerText(),'2. 开镲练习');
    }else if(kind==='bad-draft'){
      assert.match(await page.locator('#cMessage').innerText(),/原损坏草稿未被覆盖/);
      assert.equal(await page.evaluate(()=>localStorage.getItem('miniPulseComposerV1')),'{"v":1,"bpm":null}');
    }else if(kind==='arrangement-limit'){
      const fixture=await page.evaluate(()=>{const C=PulseComposerCore,p=C.blank();p.order=[{pattern:0,repeats:3},...Array.from({length:7},()=>({pattern:1,repeats:4})),{pattern:2,repeats:1}];return C.encode(p);});
      await page.locator('#cProject').click();await page.locator('#cProjectText').fill(fixture);await page.locator('#cProjectImport').click();await page.keyboard.press('Escape');
      await page.getByLabel('段落1重复次数',{exact:true}).selectOption('4');assert.equal(await code(page),fixture);
      assert.equal(await page.getByLabel('段落1重复次数',{exact:true}).inputValue(),'3','rejected edit restores displayed control');
      assert.equal(await page.locator('#cAppend').isDisabled(),true);
    }
    await noOverflow(page);assert.deepEqual(errors,[]);results.push({recovery:kind,passed:true});console.log('PASS pulse-composer '+kind);
  }finally{await context.close();}
}
try { await run(false); await run(true); for(const kind of ['blocked-storage','bad-legacy','bad-draft','arrangement-limit'])await recovery(kind); }
finally { await browser.close(); await writeFile(path.join(output, 'report.json'), JSON.stringify({ headless: true, audioMuted: true, results }, null, 2)); }
assert.ok(results.every(result => result.passed), JSON.stringify(results));
