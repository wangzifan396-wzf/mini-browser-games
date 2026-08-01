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
const port = 4215;
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
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label}: ${message.text()}`);
  });
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
  }));
  assert.equal(layout.scrollWidth <= layout.clientWidth + 4, true, `${label} horizontal overflow`);
  assert.equal(layout.controlsFit, true, `${label} controls fit viewport`);
  assert.equal(layout.textLength > 160, true, `${label} rendered content`);
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
  const response = await page.goto(`http://127.0.0.1:${port}/snow-ridge.html`, { waitUntil: "load" });
  assert.equal(response?.status(), 200, `${label} response`);
  await page.waitForFunction(() => Boolean(window.__snowRidgeTest));
  await assertLayout(page, label);
}

try {
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const desktop = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await desktop.newPage();
  observe(page, "snow-ridge-desktop");
  await open(page, "snow ridge desktop");

  const content = await page.evaluate(() => window.__snowRidgeTest.validateContent());
  assert.deepEqual(content, { courses: 12, riders: 3, boards: 3, uniqueCourses: 12 });
  const references = await page.evaluate(() => window.__snowRidgeTest.courses.map((_, index) => window.__snowRidgeTest.runReferenceCourse(index)));
  assert.equal(references.every((result) => result.won), true, `reference failures: ${JSON.stringify(references.filter((result) => !result.won))}`);
  assert.equal(references.every((result) => result.stars === 3), true, `reference star failures: ${JSON.stringify(references.filter((result) => result.stars < 3))}`);
  assert.equal(references.some((result) => result.flips >= 3), true, "reference route completes chained flips");
  assert.equal(references.some((result) => result.rescued >= 3), true, "reference route completes mountain rescue");
  assert.equal(references.some((result) => result.coins >= 22), true, "reference route completes badge collection");

  const archive = await page.evaluate(() => {
    const test = window.__snowRidgeTest;
    const profile = test.freshProfile();
    profile.stars[0] = 3;
    profile.bestTimes[0] = 24.5;
    profile.ghosts[0] = [[0, 0, 300], [1, 420, 280]];
    return test.encodeArchive(profile);
  });
  const restored = await page.evaluate((code) => window.__snowRidgeTest.decodeArchive(code), archive);
  assert.equal(restored.stars[0], 3);
  assert.equal(restored.bestTimes[0], 24.5);
  assert.deepEqual(restored.ghosts[0], [[0, 0, 300], [1, 420, 280]]);
  await assert.rejects(() => page.evaluate((code) => window.__snowRidgeTest.decodeArchive(`${code}x`), archive));

  const physical = await page.evaluate(() => {
    const test = window.__snowRidgeTest;
    test.begin(0, "aerial", "cloud", { testing: true });
    for (let i = 0; i < 24; i += 1) test.advance(1 / 60, { jump: i === 0, left: i > 1 });
    const airborne = test.getState();
    for (let i = 0; i < 180; i += 1) test.advance(1 / 60, { steady: true });
    const landed = test.getState();
    return { airborne, landed };
  });
  assert.equal(physical.airborne.grounded, false, "jump enters airborne state");
  assert.equal(Math.abs(physical.airborne.angle) > 0.05, true, "air control rotates rider");
  assert.equal(physical.landed.distance > physical.airborne.distance, true, "physics advances along course");

  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__snowRidgeTest));
  await page.locator("#courseButton").click();
  assert.equal(await page.locator(".course-card").count(), 12);
  assert.equal(await page.locator("[data-rider]").count(), 3);
  assert.equal(await page.locator("[data-board]").count(), 3);
  await page.locator('[data-rider="aerial"]').click();
  await page.locator('[data-board="cloud"]').click();
  await page.locator("#closeScreen").click();
  await page.locator("#startButton").click();
  await page.keyboard.press("Space");
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(250);
  await page.keyboard.up("ArrowLeft");
  await page.locator("#boostButton").click();
  assert.equal(await page.evaluate(() => window.__snowRidgeTest.getState().state), "running");
  await assertCanvas(page, "snow ridge desktop");
  await page.screenshot({ path: path.join(outputDir, "snow-ridge-v2-desktop.png"), fullPage: true });
  await page.close();
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const phone = await mobile.newPage();
  observe(phone, "snow-ridge-mobile");
  await open(phone, "snow ridge mobile");
  await phone.locator("#startButton").tap();
  await phone.locator("#jumpButton").tap();
  await phone.locator("#spinRightButton").dispatchEvent("pointerdown");
  await phone.waitForTimeout(180);
  await phone.locator("#spinRightButton").dispatchEvent("pointerup");
  assert.equal(await phone.evaluate(() => window.__snowRidgeTest.getState().state), "running");
  await assertCanvas(phone, "snow ridge mobile");
  await phone.screenshot({ path: path.join(outputDir, "snow-ridge-v2-mobile.png"), fullPage: true });
  await phone.close();
  await mobile.close();

  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    checks: "PASS",
    games: 1,
    courses: content.courses,
    referenceWins: references.filter((result) => result.won).length,
    referenceThreeStars: references.filter((result) => result.stars === 3).length,
    totalFlips: references.reduce((sum, result) => sum + result.flips, 0),
    totalRescues: references.reduce((sum, result) => sum + result.rescued, 0),
    screenshots: 2,
    references,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
