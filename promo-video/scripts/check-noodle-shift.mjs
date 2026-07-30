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
const port = 4211;
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
  assert.equal(layout.textLength > 260, true, `${label} rendered content`);
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
  const response = await page.goto(`http://127.0.0.1:${port}/noodle-shift.html`, { waitUntil: "load" });
  assert.equal(response?.status(), 200, `${label} response`);
  await page.waitForFunction(() => Boolean(window.__noodleShiftTest));
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
  observe(page, "noodle-shift-desktop");
  await open(page, "noodle shift desktop");
  const content = await page.evaluate(() => window.__noodleShiftTest.validateContent());
  assert.equal(content.shifts, 12);
  assert.equal(content.streets, 4);
  assert.equal(content.recipes, 11);
  assert.equal(content.ingredients, 6);
  assert.equal(content.uniqueSchedules, 12);
  assert.equal(content.referencePlans, 36);
  assert.equal(content.referenceWins, 12);

  await page.evaluate(() => window.__noodleShiftTest.begin(0));
  await page.locator("#overlayButton").click();
  await page.evaluate(() => window.__noodleShiftTest.advance(1));
  await page.locator(".ticket").first().click();
  await page.locator('[data-pot="0"]').click();
  assert.equal(await page.evaluate(() => window.__noodleShiftTest.getState().pots[0].stage), "blanch");
  await page.evaluate(() => window.__noodleShiftTest.advance(3));
  assert.equal(await page.evaluate(() => window.__noodleShiftTest.getState().pots[0].stage), "dress");
  const firstIngredients = await page.evaluate(() => {
    const test = window.__noodleShiftTest;
    const state = test.getState();
    return test.recipes[state.orders[0].recipe].items;
  });
  for (const ingredient of firstIngredients) await page.locator(`[data-ingredient="${ingredient}"]`).click();
  await page.locator("#serve").click();
  assert.equal(await page.evaluate(() => window.__noodleShiftTest.getState().served), 1);
  assert.equal(await page.evaluate(() => window.__noodleShiftTest.getState().income > 0), true);
  await page.evaluate(() => window.__noodleShiftTest.forceFinish());
  await page.locator("#overlay:not([hidden])").waitFor();
  assert.equal(await page.evaluate(() => window.__noodleShiftTest.getProfile().stars[0]), 3);
  const archive = await page.evaluate(() => window.__noodleShiftTest.encodeProfile());
  assert.equal(await page.evaluate((code) => window.__noodleShiftTest.decodeProfile(code).stars[0], archive), 3);
  await assert.rejects(() => page.evaluate((code) => window.__noodleShiftTest.decodeProfile(`${code}x`), archive));
  await assertCanvas(page, "noodle shift desktop");
  await page.screenshot({ path: path.join(outputDir, "noodle-shift-v2-desktop.png"), fullPage: true });
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
  observe(phone, "noodle-shift-mobile");
  await open(phone, "noodle shift mobile");
  await phone.evaluate(() => window.__noodleShiftTest.begin(0));
  await phone.locator("#overlayButton").tap();
  await phone.evaluate(() => window.__noodleShiftTest.advance(1));
  await phone.locator(".ticket").first().tap();
  await phone.locator('[data-pot="0"]').tap();
  assert.equal(await phone.evaluate(() => window.__noodleShiftTest.getState().pots[0].stage), "blanch");
  await assertCanvas(phone, "noodle shift mobile");
  await phone.screenshot({ path: path.join(outputDir, "noodle-shift-v2-mobile.png"), fullPage: true });
  await phone.close();
  await mobile.close();

  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    checks: "PASS",
    games: 1,
    shifts: content.shifts,
    orders: content.orders,
    recipes: content.recipes,
    referencePlans: content.referencePlans,
    referenceWins: content.referenceWins,
    desktopOverflow: false,
    mobileOverflow: false,
    screenshots: 2,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
