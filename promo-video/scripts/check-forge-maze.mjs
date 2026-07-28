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
const port = 4206;
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
  assert.equal(layout.textLength > 220, true, `${label} rendered content`);
}
async function assertCanvas(page, selector, label) {
  const pixels = await page.locator(selector).evaluate((canvas) => {
    const context = canvas.getContext("2d");
    const colors = new Set();
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
  assert.equal(pixels.opaque > 200, true, `${label} canvas is nonblank`);
  assert.equal(pixels.colors >= 4, true, `${label} canvas has rendered detail`);
}
async function open(page, file, apiName) {
  const response = await page.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: "load" });
  assert.equal(response?.status(), 200, `${file} response`);
  await page.waitForFunction((name) => Boolean(window[name]), apiName);
  await assertLayout(page, file);
}

try {
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const desktop = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const forge = await desktop.newPage();
  observe(forge, "forge-desktop");
  await open(forge, "block-forge.html", "__blockForgeTest");
  assert.deepEqual(await forge.evaluate(() => window.__blockForgeTest.validateContent()), {
    contracts: 12,
    rigs: 3,
    blueprintPieces: 62,
    targetLines: 144,
    referenceWins: 12,
    uniqueBlueprints: 12,
  });
  await forge.evaluate(() => window.__blockForgeTest.begin(0));
  await forge.locator("#overlayButton").click();
  assert.equal(await forge.evaluate(() => window.__blockForgeTest.getState().run), true);
  await forge.keyboard.press("ArrowLeft");
  await forge.keyboard.press("ArrowUp");
  await forge.locator('[data-action="drop"]').click();
  await assertCanvas(forge, "#board", "forge desktop");
  await forge.screenshot({ path: path.join(outputDir, "block-forge-v2-desktop.png"), fullPage: true });
  await forge.evaluate(() => window.__blockForgeTest.forceFinish());
  await forge.locator("#overlay:not([hidden])").waitFor();
  assert.equal(await forge.evaluate(() => window.__blockForgeTest.getProfile().stars[0]), 3);
  const forgeArchive = await forge.evaluate(() => window.__blockForgeTest.encodeProfile());
  assert.equal(await forge.evaluate((code) => window.__blockForgeTest.decodeProfile(code).stars[0], forgeArchive), 3);
  await assert.rejects(() => forge.evaluate((code) => window.__blockForgeTest.decodeProfile(`${code}x`), forgeArchive));
  await forge.close();

  const maze = await desktop.newPage();
  observe(maze, "maze-desktop");
  await open(maze, "maze-chase.html", "__mazeChaseTest");
  const mazeValidation = await maze.evaluate(() => window.__mazeChaseTest.validateContent());
  assert.equal(mazeValidation.missions, 12);
  assert.equal(mazeValidation.uniqueMaps, 12);
  assert.equal(mazeValidation.referenceWins, 12);
  assert.equal(mazeValidation.beacons >= 58, true);
  assert.equal(mazeValidation.maxReferenceSteps <= 120, true);
  await maze.evaluate(() => window.__mazeChaseTest.begin(0));
  await maze.locator("#overlayButton").click();
  assert.equal(await maze.evaluate(() => window.__mazeChaseTest.getState().run), true);
  await maze.keyboard.press("q");
  assert.equal(await maze.evaluate(() => window.__mazeChaseTest.getState().phase), 1);
  await maze.keyboard.press("Space");
  assert.equal(await maze.evaluate(() => window.__mazeChaseTest.getState().steps), 1);
  await assertCanvas(maze, "#canvas", "maze desktop");
  await maze.screenshot({ path: path.join(outputDir, "maze-chase-v2-desktop.png"), fullPage: true });
  await maze.evaluate(() => window.__mazeChaseTest.forceFinish());
  await maze.locator("#overlay:not([hidden])").waitFor();
  assert.equal(await maze.evaluate(() => window.__mazeChaseTest.getProfile().stars[0]), 3);
  const mazeArchive = await maze.evaluate(() => window.__mazeChaseTest.encodeProfile());
  assert.equal(await maze.evaluate((code) => window.__mazeChaseTest.decodeProfile(code).stars[0], mazeArchive), 3);
  await assert.rejects(() => maze.evaluate((code) => window.__mazeChaseTest.decodeProfile(`${code}x`), mazeArchive));
  await maze.close();
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  for (const [file, apiName, canvas, screenshot] of [
    ["block-forge.html", "__blockForgeTest", "#board", "block-forge-v2-mobile.png"],
    ["maze-chase.html", "__mazeChaseTest", "#canvas", "maze-chase-v2-mobile.png"],
  ]) {
    const page = await mobile.newPage();
    observe(page, `${file}-mobile`);
    await open(page, file, apiName);
    await page.evaluate((name) => window[name].begin(0), apiName);
    await page.locator("#overlayButton").click();
    await page.waitForTimeout(120);
    await assertCanvas(page, canvas, `${file} mobile`);
    await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: true });
    await page.close();
  }
  await mobile.close();

  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    checks: "PASS",
    games: 2,
    contracts: 24,
    forgeReferenceWins: 12,
    mazeReferenceWins: 12,
    desktopOverflow: false,
    mobileOverflow: false,
    screenshots: 4,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
