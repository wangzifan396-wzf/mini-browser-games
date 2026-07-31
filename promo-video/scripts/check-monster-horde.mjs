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
const port = 4212;
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
  assert.equal(layout.textLength > 300, true, `${label} rendered content`);
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
  assert.equal(pixels.colors >= 6, true, `${label} canvas has rendered detail`);
}
async function open(page, label) {
  const response = await page.goto(`http://127.0.0.1:${port}/monster-horde.html`, { waitUntil: "load" });
  assert.equal(response?.status(), 200, `${label} response`);
  await page.waitForFunction(() => Boolean(window.__monsterHordeTest));
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
  observe(page, "monster-horde-desktop");
  await open(page, "monster horde desktop");
  const content = await page.evaluate(() => window.__monsterHordeTest.validateContent());
  assert.deepEqual(content, { contracts: 12, commanders: 3, units: 9, towers: 8 });
  const references = await page.evaluate(() => window.__monsterHordeTest.contracts.map((_, index) => window.__monsterHordeTest.runReferenceContract(index)));
  assert.equal(references.every((result) => result.won), true, "all reference sieges win");
  assert.equal(references.some((result) => result.towers >= 3), true, "reference siege exercises tower destruction");

  const archive = await page.evaluate(() => {
    const test = window.__monsterHordeTest;
    const profile = test.freshProfile();
    profile.stars[0] = 3;
    profile.bestNights[0] = 2;
    return test.encodeArchive(profile);
  });
  assert.equal(await page.evaluate((code) => window.__monsterHordeTest.decodeArchive(code).stars[0], archive), 3);
  await assert.rejects(() => page.evaluate((code) => window.__monsterHordeTest.decodeArchive(`${code}x`), archive));

  await page.evaluate(() => window.__monsterHordeTest.newGame(0, "bone"));
  await page.locator('[data-lane="0"]').click();
  await page.locator('[data-unit="ram"]').click();
  await page.locator('[data-unit="imp"]').click();
  assert.equal(await page.evaluate(() => window.__monsterHordeTest.getState().queue.length), 2);
  await page.locator("#startButton").click();
  assert.equal(await page.evaluate(() => window.__monsterHordeTest.getState().mode), "running");
  await page.waitForTimeout(800);
  await page.locator('[data-spell="blood"]').click();
  assert.equal(await page.evaluate(() => window.__monsterHordeTest.getState().spellsUsed), 1);
  await assertCanvas(page, "monster horde desktop");
  await page.screenshot({ path: path.join(outputDir, "monster-horde-v2-desktop.png"), fullPage: true });

  await page.locator("#campaignButton").click();
  assert.equal(await page.locator(".contract-card").count(), 12);
  await page.locator('[data-commander="mist"]').click();
  assert.equal(await page.evaluate(() => window.__monsterHordeTest.getState().commander), "mist");
  await page.locator("#closeCampaign").click();
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
  observe(phone, "monster-horde-mobile");
  await open(phone, "monster horde mobile");
  await phone.locator('[data-lane="2"]').tap();
  await phone.locator('[data-unit="ram"]').tap();
  await phone.locator("#startButton").tap();
  assert.equal(await phone.evaluate(() => window.__monsterHordeTest.getState().mode), "running");
  await assertCanvas(phone, "monster horde mobile");
  await phone.screenshot({ path: path.join(outputDir, "monster-horde-v2-mobile.png"), fullPage: true });
  await phone.close();
  await mobile.close();

  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    checks: "PASS",
    games: 1,
    contracts: content.contracts,
    commanders: content.commanders,
    referenceWins: references.filter((result) => result.won).length,
    referenceStars: references.reduce((sum, result) => sum + result.stars, 0),
    destroyedTowers: references.reduce((sum, result) => sum + result.towers, 0),
    desktopOverflow: false,
    mobileOverflow: false,
    screenshots: 2,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
