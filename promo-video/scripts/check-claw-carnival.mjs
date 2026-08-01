import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output");
const port = 4216;
await mkdir(outputDir, { recursive: true });

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    if (pathname === "/favicon.ico") return response.writeHead(204).end();
    const target = path.resolve(rootDir, pathname.slice(1));
    if (!target.startsWith(rootDir + path.sep)) return response.writeHead(403).end("Forbidden");
    const info = await stat(target);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

let browser;
const errors = [];
function observe(page, label) {
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${label}: ${message.text()}`); });
}
async function assertLayout(page, label) {
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    textLength: document.body.innerText.replace(/\s+/g, "").length,
    controlsFit: [...document.querySelectorAll("h1, h2, button")].every((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= -4 && rect.right <= document.documentElement.clientWidth + 4;
    }),
    outside: [...document.querySelectorAll("body *")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.right > document.documentElement.clientWidth + 4 || rect.left < -4;
    }).slice(0, 8).map((element) => ({ tag: element.tagName, id: element.id, className: element.className, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })),
  }));
  assert.equal(layout.scrollWidth <= layout.clientWidth + 4, true, `${label} horizontal overflow: ${JSON.stringify(layout.outside)}`);
  assert.equal(layout.controlsFit, true, `${label} controls fit viewport`);
  assert.equal(layout.textLength > 220, true, `${label} rendered content`);
}
async function assertCanvas(page, label) {
  const pixels = await page.locator("#gameCanvas").evaluate((canvas) => {
    const context = canvas.getContext("2d");
    const colors = new Set();
    let opaque = 0;
    for (let y = 0; y < canvas.height; y += Math.max(1, Math.floor(canvas.height / 19))) {
      for (let x = 0; x < canvas.width; x += Math.max(1, Math.floor(canvas.width / 21))) {
        const data = context.getImageData(x, y, 1, 1).data;
        if (data[3]) opaque += 1;
        colors.add(`${data[0]},${data[1]},${data[2]},${data[3]}`);
      }
    }
    return { opaque, colors: colors.size };
  });
  assert.equal(pixels.opaque > 300, true, `${label} canvas is nonblank`);
  assert.equal(pixels.colors >= 8, true, `${label} canvas has rendered detail`);
}
async function open(page, label) {
  const response = await page.goto(`http://127.0.0.1:${port}/claw-carnival.html`, { waitUntil: "load" });
  assert.equal(response?.status(), 200, `${label} response`);
  await page.waitForFunction(() => Boolean(window.__clawCarnivalTest));
  await assertLayout(page, label);
}

try {
  try { browser = await chromium.launch({ channel: "msedge", headless: true }); }
  catch { browser = await chromium.launch({ headless: true }); }

  const desktop = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await desktop.newPage();
  observe(page, "claw-carnival-desktop");
  await open(page, "claw carnival desktop");

  const content = await page.evaluate(() => window.__clawCarnivalTest.validateContent());
  assert.deepEqual(content, { cabinets: 12, prizes: 16, operators: 3, heads: 3, pieces: 144, uniqueSeeds: 12 });
  const references = await page.evaluate(() => window.__clawCarnivalTest.cabinets.map((_, index) => window.__clawCarnivalTest.runReferenceCabinet(index)));
  assert.equal(references.every((result) => result.won), true, `reference failures: ${JSON.stringify(references.filter((result) => !result.won))}`);
  assert.equal(references.every((result) => result.stars === 3), true, `reference star failures: ${JSON.stringify(references.filter((result) => result.stars < 3))}`);
  assert.equal(references.some((result) => result.combo >= 4), true, "reference route completes four-catch combo");
  assert.equal(references.some((result) => result.score >= 640), true, "reference route completes score challenge");
  assert.equal(references.every((result) => result.misses === 0), true, "reference routes avoid hidden probability");

  const deterministic = await page.evaluate(() => {
    const test = window.__clawCarnivalTest;
    test.begin(7, "lifter", "magnet", { testing: true });
    const first = test.getState().pieces.map(({ type, x, y }) => [type, x, y]);
    test.begin(7, "lifter", "magnet", { testing: true });
    const second = test.getState().pieces.map(({ type, x, y }) => [type, x, y]);
    return { first, second };
  });
  assert.deepEqual(deterministic.first, deterministic.second, "fixed cabinet layout is reproducible");

  const archive = await page.evaluate(() => {
    const test = window.__clawCarnivalTest;
    const profile = test.freshProfile();
    profile.stars[0] = 3;
    profile.bestTurns[0] = 2;
    profile.dex.bear = 4;
    return test.encodeArchive(profile);
  });
  const restored = await page.evaluate((code) => window.__clawCarnivalTest.decodeArchive(code), archive);
  assert.equal(restored.stars[0], 3);
  assert.equal(restored.bestTurns[0], 2);
  assert.equal(restored.dex.bear, 4);
  await assert.rejects(() => page.evaluate((code) => window.__clawCarnivalTest.decodeArchive(`${code}x`), archive));

  const motion = await page.evaluate(() => {
    const test = window.__clawCarnivalTest;
    test.begin(0, "balancer", "balanced", { testing: true });
    for (let i = 0; i < 45; i += 1) test.step(1 / 60, { right: true });
    const driven = test.getState();
    for (let i = 0; i < 80; i += 1) test.step(1 / 60, { brake: true });
    const braked = test.getState();
    return { driven, braked };
  });
  assert.equal(motion.driven.x > 0.55, true, "rail control moves claw");
  assert.equal(Math.abs(motion.driven.swing) > 0.02, true, "rail movement creates pendulum swing");
  assert.equal(Math.abs(motion.braked.swing) < Math.abs(motion.driven.swing), true, "brake reduces pendulum swing");

  await page.evaluate(() => {
    const test = window.__clawCarnivalTest;
    test.begin(0, "calibrator", "balanced", { testing: true });
    const target = test.getState().pieces.find((piece) => piece.type === "bear");
    test.aim(target.x);
  });
  await page.locator("#dropButton").click();
  await page.waitForTimeout(1150);
  assert.equal(await page.evaluate(() => window.__clawCarnivalTest.getState().collected.bear), 1, "real drop catches aligned prize");

  await page.locator("#cabinetButton").click();
  assert.equal(await page.locator(".cabinet-card").count(), 12);
  assert.equal(await page.locator("[data-operator]").count(), 3);
  assert.equal(await page.locator("[data-head]").count(), 3);
  await page.locator("#closeScreen").click();
  await page.locator("#startButton").click();
  await page.waitForTimeout(120);
  await assertCanvas(page, "claw carnival desktop");
  await page.screenshot({ path: path.join(outputDir, "claw-carnival-v2-desktop.png"), fullPage: true });
  await page.close(); await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const phone = await mobile.newPage();
  observe(phone, "claw-carnival-mobile");
  await open(phone, "claw carnival mobile");
  await phone.locator("#startButton").tap();
  await phone.locator("#rightButton").dispatchEvent("pointerdown");
  await phone.waitForTimeout(180);
  await phone.locator("#rightButton").dispatchEvent("pointerup");
  await phone.locator("#brakeButton").dispatchEvent("pointerdown");
  await phone.waitForTimeout(160);
  await phone.locator("#brakeButton").dispatchEvent("pointerup");
  await phone.locator("#dropButton").tap();
  assert.equal(await phone.evaluate(() => window.__clawCarnivalTest.getState().attempts), 1);
  await assertCanvas(phone, "claw carnival mobile");
  await phone.screenshot({ path: path.join(outputDir, "claw-carnival-v2-mobile.png"), fullPage: true });
  await phone.close(); await mobile.close();

  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ checks: "PASS", games: 1, cabinets: content.cabinets, prizes: content.prizes, fixedPieces: content.pieces, referenceWins: references.filter((result) => result.won).length, referenceThreeStars: references.filter((result) => result.stars === 3).length, totalReferenceScore: references.reduce((sum, result) => sum + result.score, 0), screenshots: 2, references }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
