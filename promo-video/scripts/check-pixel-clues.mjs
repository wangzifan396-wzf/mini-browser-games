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
const port = 4210;
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
  const response = await page.goto(`http://127.0.0.1:${port}/pixel-clues.html`, { waitUntil: "load" });
  assert.equal(response?.status(), 200, `${label} response`);
  await page.waitForFunction(() => Boolean(window.__pixelCluesTest));
  await assertLayout(page, label);
}
async function cellPoint(page, x, y) {
  const box = await page.locator("#board").boundingBox();
  assert.ok(box, "canvas bounding box");
  const logical = await page.evaluate(({ x, y }) => {
    const state = window.__pixelCluesTest.getState();
    const left = 118;
    const top = 102;
    const size = Math.floor(Math.min((720 - left - 34) / state.item.cols, (680 - top - 34) / state.item.rows));
    const ox = Math.floor((720 - (left + state.item.cols * size)) / 2);
    const oy = Math.floor((680 - (top + state.item.rows * size)) / 2) + 8;
    return { x: ox + left + (x + 0.5) * size, y: oy + top + (y + 0.5) * size };
  }, { x, y });
  return { x: box.x + logical.x / 720 * box.width, y: box.y + logical.y / 680 * box.height };
}

try {
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const desktop = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await desktop.newPage();
  observe(page, "pixel-clues-desktop");
  await open(page, "pixel clues desktop");
  const solutionCounts = await page.evaluate(() => window.__pixelCluesTest.puzzles.map((item) => ({
    name: item.name,
    solutions: window.__pixelCluesTest.countSolutions(item),
  })));
  assert.equal(solutionCounts.every((item) => item.solutions === 1), true, "every puzzle has one solution");
  const content = await page.evaluate(() => window.__pixelCluesTest.validateContent());
  assert.equal(content.puzzles, 12);
  assert.equal(content.chapters, 4);
  assert.equal(content.uniquePuzzles, 12);
  assert.equal(content.uniqueSolutions, 12);
  assert.equal(content.largestBoard, 64);

  await page.evaluate(() => window.__pixelCluesTest.begin(0));
  await page.locator("#overlayButton").click();
  let point = await cellPoint(page, 1, 0);
  await page.mouse.click(point.x, point.y);
  assert.equal(await page.evaluate(() => window.__pixelCluesTest.getState().moves), 1);
  await page.locator("#undo").click();
  assert.equal(await page.evaluate(() => window.__pixelCluesTest.getState().moves), 0);
  await page.locator("#hint").click();
  assert.equal(await page.evaluate(() => window.__pixelCluesTest.getState().hints), 1);
  await page.evaluate(() => window.__pixelCluesTest.forceFinish());
  await page.locator("#overlay:not([hidden])").waitFor();
  assert.equal(await page.evaluate(() => window.__pixelCluesTest.getProfile().stars[0]), 3);
  const archive = await page.evaluate(() => window.__pixelCluesTest.encodeProfile());
  assert.equal(await page.evaluate((code) => window.__pixelCluesTest.decodeProfile(code).stars[0], archive), 3);
  await assert.rejects(() => page.evaluate((code) => window.__pixelCluesTest.decodeProfile(`${code}x`), archive));
  await assertCanvas(page, "pixel clues desktop");
  await page.screenshot({ path: path.join(outputDir, "pixel-clues-v2-desktop.png"), fullPage: true });
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
  observe(phone, "pixel-clues-mobile");
  await open(phone, "pixel clues mobile");
  await phone.evaluate(() => window.__pixelCluesTest.begin(0));
  await phone.locator("#overlayButton").tap();
  await phone.locator('[data-tool="mark"]').tap();
  await phone.locator("#board").scrollIntoViewIfNeeded();
  point = await cellPoint(phone, 0, 0);
  await phone.touchscreen.tap(point.x, point.y);
  assert.equal(await phone.evaluate(() => window.__pixelCluesTest.getState().moves), 1);
  assert.equal(await phone.evaluate(() => window.__pixelCluesTest.getState().cells[0][0]), 2);
  await assertCanvas(phone, "pixel clues mobile");
  await phone.screenshot({ path: path.join(outputDir, "pixel-clues-v2-mobile.png"), fullPage: true });
  await phone.close();
  await mobile.close();

  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    checks: "PASS",
    games: 1,
    puzzles: content.puzzles,
    uniqueSolutions: content.uniqueSolutions,
    filledTargets: content.filledTargets,
    largestBoard: content.largestBoard,
    desktopOverflow: false,
    mobileOverflow: false,
    screenshots: 2,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
