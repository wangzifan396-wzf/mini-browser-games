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
const port = 4205;
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
async function open(page, label) {
  observe(page, label);
  const response = await page.goto(`http://127.0.0.1:${port}/fruit-slice.html`, { waitUntil: "load" });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => Boolean(window.__fruitSliceTest));
  const layout = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    text: document.body.innerText.replace(/\s+/g, "").length,
    controlsFit: [...document.querySelectorAll("h1, h2, button")].every((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= -4 && rect.right <= document.documentElement.clientWidth + 4;
    }),
  }));
  assert.equal(layout.scrollWidth <= layout.width + 4, true, `${label} horizontal overflow`);
  assert.equal(layout.controlsFit, true, `${label} controls fit`);
  assert.equal(layout.text > 180, true, `${label} rendered content`);
}
async function assertCanvas(page, label) {
  const signal = await page.locator("canvas").evaluate((canvas) => {
    const context = canvas.getContext("2d"), colors = new Set();
    let opaque = 0;
    for (let y = 0; y < canvas.height; y += Math.max(1, Math.floor(canvas.height / 17))) {
      for (let x = 0; x < canvas.width; x += Math.max(1, Math.floor(canvas.width / 19))) {
        const data = context.getImageData(x, y, 1, 1).data;
        if (data[3]) opaque += 1;
        colors.add(`${data[0]},${data[1]},${data[2]},${data[3]}`);
      }
    }
    return { opaque, colors: colors.size };
  });
  assert.equal(signal.opaque > 200, true, `${label} nonblank canvas`);
  assert.equal(signal.colors > 4, true, `${label} canvas detail`);
}

try {
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const desktop = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await desktop.newPage();
  await open(page, "fruit-desktop");
  assert.deepEqual(await page.evaluate(() => window.__fruitSliceTest.validateContent()), {
    missions: 12,
    blades: 3,
    seals: 4,
    events: 499,
    fruitEvents: 421,
    bombs: 78,
    bossLayers: 33,
    orderItems: 297,
    referenceWins: 12,
    maxFrames: 5792,
  });
  await page.evaluate(() => window.__fruitSliceTest.begin(0));
  await page.locator("#overlayButton").click();
  assert.equal(await page.evaluate(() => window.__fruitSliceTest.getState().run), true);
  await page.waitForFunction(() => window.__fruitSliceTest.getState().objects.some((object) => !object.bomb && object.y > .2 && object.y < .88));
  const fruit = await page.evaluate(() => {
    const object = window.__fruitSliceTest.getState().objects.find((item) => !item.bomb && item.y > .2 && item.y < .88);
    return { x: object.x, y: object.y };
  });
  const box = await page.locator("canvas").boundingBox();
  assert.ok(box);
  const px = box.x + fruit.x * box.width, py = box.y + fruit.y * box.height;
  await page.mouse.move(px - 28, py);
  await page.mouse.down();
  await page.mouse.move(px + 28, py, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__fruitSliceTest.getState().cuts > 0);
  assert.equal(await page.evaluate(() => window.__fruitSliceTest.getState().score > 0), true, "real slash scores");
  await page.evaluate(() => window.__fruitSliceTest.forceFinish());
  await page.locator("#overlay:not([hidden])").waitFor();
  assert.equal(await page.evaluate(() => window.__fruitSliceTest.getProfile().stars[0] >= 1), true);
  const archive = await page.evaluate(() => window.__fruitSliceTest.encodeProfile());
  assert.equal(await page.evaluate((code) => window.__fruitSliceTest.decodeProfile(code).perfect[0], archive), true);
  await assert.rejects(() => page.evaluate((code) => window.__fruitSliceTest.decodeProfile(`${code}x`), archive));
  await page.locator("#overlayButton").click();
  await page.waitForTimeout(1_350);
  await assertCanvas(page, "fruit desktop");
  await page.screenshot({ path: path.join(outputDir, "fruit-slice-v2-desktop.png"), fullPage: true });
  await page.close();
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const mobilePage = await mobile.newPage();
  await open(mobilePage, "fruit-mobile");
  await mobilePage.evaluate(() => window.__fruitSliceTest.begin(0));
  await mobilePage.locator("#overlayButton").tap();
  assert.equal(await mobilePage.evaluate(() => window.__fruitSliceTest.getState().run), true, "touch start button");
  await mobilePage.waitForTimeout(1_350);
  await assertCanvas(mobilePage, "fruit mobile");
  await mobilePage.screenshot({ path: path.join(outputDir, "fruit-slice-v2-mobile.png"), fullPage: true });
  await mobilePage.close();
  await mobile.close();

  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    checks: "PASS",
    missions: 12,
    events: 499,
    fruitEvents: 421,
    bombEvents: 78,
    bossLayers: 33,
    orderItems: 297,
    referenceWins: 12,
    realSlash: true,
    archiveTamperRejected: true,
    desktopOverflow: false,
    mobileOverflow: false,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
