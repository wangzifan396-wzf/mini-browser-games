import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output", "chalk-billiards");
const port = 4199;
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
      "cache-control": "no-store",
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
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 4, `${label} horizontal overflow: ${overflow}px`);
}

async function canvasSignal(page) {
  return page.locator("#gameCanvas").evaluate((canvas) => {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0;
    const colors = new Set();
    const stride = Math.max(4, Math.floor((canvas.width * canvas.height) / 7000) * 4);
    for (let index = 0; index < pixels.length; index += stride) {
      if (pixels[index + 3] > 0) {
        opaque++;
        colors.add(`${pixels[index] >> 4},${pixels[index + 1] >> 4},${pixels[index + 2] >> 4}`);
      }
    }
    return { opaque, colors: colors.size };
  });
}

async function playReferenceStroke(page) {
  const data = await page.evaluate(() => ({
    drag: window.__chalkBilliards.referenceDrag(),
    table: window.__chalkBilliards.tableRect(),
  }));
  const box = await page.locator("#gameCanvas").boundingBox();
  assert.ok(box && data.drag, "reference drag has canvas geometry");
  const screen = (point) => ({
    x: box.x + data.table.x + point.x * data.table.scale,
    y: box.y + data.table.y + point.y * data.table.scale,
  });
  const start = screen(data.drag.start);
  const end = screen(data.drag.end);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
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
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 940 }, colorScheme: "dark" });
  const page = await desktop.newPage();
  observe(page);
  await page.goto(`http://127.0.0.1:${port}/chalk-billiards.html`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__chalkBilliards));

  const validation = await page.evaluate(() => window.__chalkBilliards.validateContent());
  console.log("validation", JSON.stringify(validation));
  assert.deepEqual(
    validation,
    { valid: true, errors: [], missions: 9, rooms: 3, drills: 27, cues: 3, chalks: 6, references: 9 },
    "cue campaign content contract",
  );
  assert.equal(
    await page.evaluate(() => Array.from({ length: 9 }, (_, index) => window.__chalkBilliards.simulateReference(index)).every((result) => result.ok && result.stars === 3 && result.checks.every((check) => check.ok))),
    true,
    "all 27 reference strokes use the real physics model",
  );

  await page.locator('[data-cue="fine"]').click();
  assert.equal(await page.evaluate(() => window.__chalkBilliards.profile().cue), "fine", "real cue selection");
  await page.locator('[data-cue="balance"]').click();
  await page.locator("#overlayStart").click();
  await playReferenceStroke(page);
  await page.waitForFunction(() => window.__chalkBilliards.state().drillIndex === 1, null, { timeout: 8_000 });
  assert.equal(await page.evaluate(() => window.__chalkBilliards.state().shots), 1, "real drag stroke completes first drill");
  assert.equal(await page.evaluate(() => window.__chalkBilliards.state().marks), 1, "real stroke earns power mark");
  await page.locator("#resetDrillBtn").click();
  assert.equal(await page.evaluate(() => window.__chalkBilliards.state().drillIndex), 1, "real reset keeps current drill");

  const reference = await page.evaluate(() => window.__chalkBilliards.applyReference(0));
  assert.equal(reference.stars, 3, "displayed physics reference earns three stars");
  assert.equal(await page.evaluate(() => window.__chalkBilliards.profile().unlocked >= 1), true, "contract clear unlocks next table");
  const archive = await page.evaluate(() => window.__chalkBilliards.encode());
  assert.match(archive, /^CUE2\./, "archive prefix");
  assert.equal(await page.evaluate((code) => window.__chalkBilliards.decode(code).stars.length, archive), 9, "archive round trip");
  await assert.rejects(
    page.evaluate((code) => window.__chalkBilliards.decode(`${code}x`), archive),
    /杆法档案校验失败/,
    "archive detects tampering",
  );
  let signal = await canvasSignal(page);
  assert.ok(signal.opaque > 1000 && signal.colors >= 8, `desktop canvas signal ${JSON.stringify(signal)}`);
  await noOverflow(page, "desktop");
  await page.screenshot({ path: path.join(outputDir, "desktop.png"), fullPage: true });
  assert.deepEqual(failures, [], "desktop browser errors");
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const mobilePage = await mobile.newPage();
  observe(mobilePage);
  await mobilePage.goto(`http://127.0.0.1:${port}/chalk-billiards.html`, { waitUntil: "load" });
  await mobilePage.waitForFunction(() => Boolean(window.__chalkBilliards));
  await mobilePage.locator("#overlayStart").tap();
  await playReferenceStroke(mobilePage);
  await mobilePage.waitForFunction(() => window.__chalkBilliards.state().drillIndex === 1, null, { timeout: 8_000 });
  assert.equal(await mobilePage.evaluate(() => window.__chalkBilliards.state().marks), 1, "mobile drag earns mark");
  signal = await canvasSignal(mobilePage);
  assert.ok(signal.opaque > 1000 && signal.colors >= 8, `mobile canvas signal ${JSON.stringify(signal)}`);
  await noOverflow(mobilePage, "mobile");
  await mobilePage.screenshot({ path: path.join(outputDir, "mobile.png"), fullPage: true });
  assert.deepEqual(failures, [], "mobile browser errors");
  await mobile.close();

  console.log(JSON.stringify({ missions: 9, rooms: 3, drills: 27, cues: 3, chalks: 6, archive: "CUE2", failures }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
