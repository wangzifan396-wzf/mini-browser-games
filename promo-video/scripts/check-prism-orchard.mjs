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
const port = 4209;
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
  assert.equal(layout.textLength > 240, true, `${label} rendered content`);
}
async function assertCanvas(page, label) {
  const pixels = await page.locator("#board").evaluate((canvas) => {
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
  assert.equal(pixels.colors >= 6, true, `${label} canvas has rendered detail`);
}
async function open(page, label) {
  const response = await page.goto(`http://127.0.0.1:${port}/prism-orchard.html`, { waitUntil: "load" });
  assert.equal(response?.status(), 200, `${label} response`);
  await page.waitForFunction(() => Boolean(window.__prismOrchardTest));
  await assertLayout(page, label);
}
async function cellPoint(page, x, y) {
  const box = await page.locator("#board").boundingBox();
  assert.ok(box, "canvas bounding box");
  const logical = await page.evaluate(({ x, y }) => {
    const item = window.__prismOrchardTest.getState().item;
    const size = Math.floor(Math.min((640 - 24) / item.size[0], (620 - 70) / item.size[1]));
    const ox = Math.floor((640 - item.size[0] * size) / 2);
    const oy = Math.floor((620 - item.size[1] * size) / 2) + 18;
    return { x: ox + (x + 0.5) * size, y: oy + (y + 0.5) * size };
  }, { x, y });
  return { x: box.x + logical.x / 640 * box.width, y: box.y + logical.y / 620 * box.height };
}

try {
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const desktop = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await desktop.newPage();
  observe(page, "prism-orchard-desktop");
  await open(page, "prism-orchard desktop");
  assert.deepEqual(await page.evaluate(() => window.__prismOrchardTest.validateContent()), {
    missions: 12,
    kits: 3,
    targets: 28,
    referencePieces: 30,
    referenceWins: 12,
    uniqueMissions: 12,
  });
  await page.evaluate(() => window.__prismOrchardTest.begin(0));
  await page.locator("#overlayButton").click();
  await page.locator('[data-tool="slash"]').click();
  let point = await cellPoint(page, 2, 4);
  await page.mouse.click(point.x, point.y);
  assert.equal(await page.evaluate(() => window.__prismOrchardTest.getState().moves), 1);
  assert.equal(await page.evaluate(() => window.__prismOrchardTest.getState().won), false);
  await assertCanvas(page, "prism-orchard desktop");
  await page.screenshot({ path: path.join(outputDir, "prism-orchard-v2-desktop.png"), fullPage: true });
  await page.locator("#undo").click();
  assert.equal(await page.evaluate(() => window.__prismOrchardTest.getState().moves), 0);
  point = await cellPoint(page, 4, 4);
  await page.mouse.click(point.x, point.y);
  await page.locator("#overlay:not([hidden])").waitFor();
  assert.equal(await page.evaluate(() => window.__prismOrchardTest.getProfile().stars[0]), 3);
  await page.locator("#overlayButton").click();
  await page.locator("#overlayButton").click();
  await page.locator("#hint").click();
  await page.locator("#overlay:not([hidden])").waitFor();
  assert.equal(await page.evaluate(() => window.__prismOrchardTest.getProfile().stars[1]), 3);
  const archive = await page.evaluate(() => window.__prismOrchardTest.encodeProfile());
  assert.equal(await page.evaluate((code) => window.__prismOrchardTest.decodeProfile(code).stars[0], archive), 3);
  await assert.rejects(() => page.evaluate((code) => window.__prismOrchardTest.decodeProfile(`${code}x`), archive));
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
  observe(phone, "prism-orchard-mobile");
  await open(phone, "prism-orchard mobile");
  await phone.evaluate(() => window.__prismOrchardTest.begin(0));
  await phone.locator("#overlayButton").tap();
  await phone.locator('[data-tool="slash"]').tap();
  await phone.locator("#board").scrollIntoViewIfNeeded();
  point = await cellPoint(phone, 2, 4);
  await phone.touchscreen.tap(point.x, point.y);
  assert.equal(await phone.evaluate(() => window.__prismOrchardTest.getState().moves), 1);
  await assertCanvas(phone, "prism-orchard mobile");
  await phone.screenshot({ path: path.join(outputDir, "prism-orchard-v2-mobile.png"), fullPage: true });
  await phone.close();
  await mobile.close();

  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    checks: "PASS",
    games: 1,
    missions: 12,
    spectralTargets: 28,
    referencePieces: 30,
    referenceWins: 12,
    desktopOverflow: false,
    mobileOverflow: false,
    screenshots: 2,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
