import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output", "courier-lunar");
const port = 4196;
const failures = [];

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    if (pathname === "/favicon.ico") return response.writeHead(204).end();
    const target = path.resolve(rootDir, pathname.slice(1));
    if (!target.startsWith(rootDir + path.sep)) return response.writeHead(403).end("Forbidden");
    const info = await stat(target);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "content-type": target.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream",
      "cache-control": "no-store"
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

function observe(page) {
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
}

async function noOverflow(page, label) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  assert.ok(overflow <= 4, `${label} horizontal overflow: ${overflow}px`);
}

async function canvasSignal(page, selector) {
  return page.locator(selector).evaluate((canvas) => {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0;
    const colors = new Set();
    const stride = Math.max(4, Math.floor((canvas.width * canvas.height) / 6000) * 4);
    for (let index = 0; index < pixels.length; index += stride) {
      if (pixels[index + 3] > 0) {
        opaque++;
        colors.add(`${pixels[index] >> 4},${pixels[index + 1] >> 4},${pixels[index + 2] >> 4}`);
      }
    }
    return { opaque, colors: colors.size };
  });
}

async function clickWorld(page, selector, x, y, worldWidth, worldHeight) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${selector} has bounds`);
  await page.locator(selector).click({ position: { x: box.width * x / worldWidth, y: box.height * y / worldHeight } });
}

await mkdir(outputDir, { recursive: true });
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
} catch {
  browser = await chromium.launch({ headless: true });
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 920 }, colorScheme: "dark" });

  const courier = await desktop.newPage();
  observe(courier);
  await courier.goto(`http://127.0.0.1:${port}/courier-grid.html`, { waitUntil: "load" });
  await courier.waitForFunction(() => Boolean(window.__courierGrid));
  assert.deepEqual(
    await courier.evaluate(() => window.__courierGrid.validateContent()),
    { valid: true, errors: [], cities: 3, shifts: 12, orders: 60, vans: 3, references: 12 },
    "courier content contract"
  );
  assert.equal(
    await courier.evaluate(() => Array.from({ length: 12 }, (_, index) => window.__courierGrid.solveShift(index)).every((item) => item.stars === 3 && item.late === 0)),
    true,
    "all courier shifts have on-time three-star routes"
  );
  await clickWorld(courier, "#mapCanvas", 230, 85, 960, 540);
  assert.deepEqual(await courier.evaluate(() => window.__courierGrid.state().route), [0, 1], "real courier canvas adds station");
  await courier.locator("#undoBtn").click();
  assert.deepEqual(await courier.evaluate(() => window.__courierGrid.state().route), [0], "real courier undo removes station");
  const courierReference = await courier.evaluate(() => window.__courierGrid.applyReference());
  assert.equal(courierReference.stars, 3, "displayed courier reference earns three stars");
  const courierCode = await courier.evaluate(() => window.__courierGrid.encode());
  assert.match(courierCode, /^COURIER2\./, "courier archive prefix");
  assert.equal(await courier.evaluate((code) => window.__courierGrid.decode(code).stars.length, courierCode), 12, "courier archive round trip");
  await assert.rejects(
    courier.evaluate((code) => window.__courierGrid.decode(`${code}x`), courierCode),
    /配送档案校验失败/,
    "courier archive detects tampering"
  );
  let signal = await canvasSignal(courier, "#mapCanvas");
  assert.ok(signal.opaque > 1000 && signal.colors > 7, `courier canvas signal ${JSON.stringify(signal)}`);
  await noOverflow(courier, "courier desktop");
  await courier.screenshot({ path: path.join(outputDir, "courier-desktop.png"), fullPage: true });

  const lunar = await desktop.newPage();
  observe(lunar);
  await lunar.goto(`http://127.0.0.1:${port}/moon-lander.html`, { waitUntil: "load" });
  await lunar.waitForFunction(() => Boolean(window.__moonLander));
  assert.deepEqual(
    await lunar.evaluate(() => window.__moonLander.validateContent()),
    { valid: true, errors: [], missions: 9, regions: 3, landers: 3, modules: 6, references: 9 },
    "lunar content contract"
  );
  assert.equal(
    await lunar.evaluate(() => Array.from({ length: 9 }, (_, index) => window.__moonLander.simulateReference(index)).every((item) => item.ok && item.stars === 3)),
    true,
    "all lunar contracts have physical three-star demonstrations"
  );
  await lunar.locator("#overlayBtn").click();
  const fuelBefore = await lunar.evaluate(() => window.__moonLander.state().fuel);
  await lunar.locator('[data-control="main"]').dispatchEvent("pointerdown", { pointerId: 1 });
  await lunar.waitForTimeout(220);
  await lunar.locator('[data-control="main"]').dispatchEvent("pointerup", { pointerId: 1 });
  assert.ok(await lunar.evaluate((before) => window.__moonLander.state().fuel < before, fuelBefore), "real lunar thrust consumes fuel");
  const lunarReference = await lunar.evaluate(() => window.__moonLander.applyReference());
  assert.equal(lunarReference.stars, 3, "displayed lunar demonstration earns three stars");
  const lunarCode = await lunar.evaluate(() => window.__moonLander.encode());
  assert.match(lunarCode, /^LANDER2\./, "lunar archive prefix");
  assert.equal(await lunar.evaluate((code) => window.__moonLander.decode(code).stars.length, lunarCode), 9, "lunar archive round trip");
  signal = await canvasSignal(lunar, "#flightCanvas");
  assert.ok(signal.opaque > 1000 && signal.colors > 7, `lunar canvas signal ${JSON.stringify(signal)}`);
  await noOverflow(lunar, "lunar desktop");
  await lunar.screenshot({ path: path.join(outputDir, "lunar-desktop.png"), fullPage: true });
  assert.deepEqual(failures, [], "desktop browser errors");
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    colorScheme: "dark"
  });

  const courierMobile = await mobile.newPage();
  observe(courierMobile);
  await courierMobile.goto(`http://127.0.0.1:${port}/courier-grid.html`, { waitUntil: "load" });
  await courierMobile.waitForFunction(() => Boolean(window.__courierGrid));
  await clickWorld(courierMobile, "#mapCanvas", 230, 85, 960, 540);
  assert.deepEqual(await courierMobile.evaluate(() => window.__courierGrid.state().route), [0, 1], "courier mobile canvas route");
  signal = await canvasSignal(courierMobile, "#mapCanvas");
  assert.ok(signal.opaque > 1000 && signal.colors > 7, "courier mobile canvas signal");
  await noOverflow(courierMobile, "courier mobile");
  await courierMobile.screenshot({ path: path.join(outputDir, "courier-mobile.png"), fullPage: true });
  await courierMobile.close();

  const lunarMobile = await mobile.newPage();
  observe(lunarMobile);
  await lunarMobile.goto(`http://127.0.0.1:${port}/moon-lander.html`, { waitUntil: "load" });
  await lunarMobile.waitForFunction(() => Boolean(window.__moonLander));
  await lunarMobile.locator("#overlayBtn").tap();
  const mobileFuel = await lunarMobile.evaluate(() => window.__moonLander.state().fuel);
  await lunarMobile.locator('[data-control="main"]').dispatchEvent("pointerdown", { pointerId: 2 });
  await lunarMobile.waitForTimeout(180);
  await lunarMobile.locator('[data-control="main"]').dispatchEvent("pointerup", { pointerId: 2 });
  assert.ok(await lunarMobile.evaluate((before) => window.__moonLander.state().fuel < before, mobileFuel), "lunar mobile thrust");
  signal = await canvasSignal(lunarMobile, "#flightCanvas");
  assert.ok(signal.opaque > 1000 && signal.colors > 7, "lunar mobile canvas signal");
  await noOverflow(lunarMobile, "lunar mobile");
  await lunarMobile.screenshot({ path: path.join(outputDir, "lunar-mobile.png"), fullPage: true });
  await lunarMobile.close();

  assert.deepEqual(failures, [], "mobile browser errors");
  await mobile.close();

  console.log(JSON.stringify({
    courier: { cities: 3, shifts: 12, orders: 60, vans: 3, archive: "COURIER2" },
    lunar: { contracts: 9, regions: 3, landers: 3, modules: 6, archive: "LANDER2" },
    failures
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
