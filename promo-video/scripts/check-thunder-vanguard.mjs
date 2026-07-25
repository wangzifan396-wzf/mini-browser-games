import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output", "thunder-vanguard");
const port = 4197;
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

async function dragShip(page, fromX, toX) {
  const box = await page.locator("#gameCanvas").boundingBox();
  assert.ok(box, "canvas has bounds");
  const y = box.y + box.height * 0.82;
  await page.mouse.move(box.x + box.width * fromX, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * toX, y, { steps: 6 });
  await page.waitForTimeout(260);
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
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 920 }, colorScheme: "dark" });
  const page = await desktop.newPage();
  observe(page);
  await page.goto(`http://127.0.0.1:${port}/thunder-vanguard.html`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__thunderVanguard));

  assert.deepEqual(
    await page.evaluate(() => window.__thunderVanguard.validateContent()),
    { valid: true, errors: [], missions: 9, sectors: 3, fighters: 3, modules: 6, protocols: 7, formations: 7, references: 9 },
    "campaign content contract",
  );
  assert.equal(
    await page.evaluate(() => Array.from({ length: 9 }, (_, index) => window.__thunderVanguard.simulateReference(index)).every((result) => result.ok && result.stars === 3)),
    true,
    "all reference tactics earn three stars",
  );
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.__thunderVanguard.missionPlan(4)) === JSON.stringify(window.__thunderVanguard.missionPlan(4))),
    true,
    "mission formations replay deterministically",
  );

  await page.locator('[data-fighter="falcon"]').click();
  assert.equal(await page.evaluate(() => window.__thunderVanguard.profile().fighter), "falcon", "real fighter selection");
  await page.locator("#overlayLaunch").click();
  assert.equal(await page.evaluate(() => window.__thunderVanguard.state().mode), "running", "real launch starts sortie");
  const xBefore = await page.evaluate(() => window.__thunderVanguard.state().p.x);
  await dragShip(page, 0.5, 0.78);
  assert.ok(
    await page.evaluate((before) => window.__thunderVanguard.state().p.x > before + 0.04, xBefore),
    "real pointer drag moves fighter",
  );

  await page.evaluate(() => { window.__thunderVanguard.state().storm = 100; });
  await page.waitForTimeout(50);
  await page.locator("#stormBtn").click();
  assert.equal(await page.evaluate(() => window.__thunderVanguard.state().stormUses), 1, "real storm button fires ability");
  await page.evaluate(() => {
    const state = window.__thunderVanguard.state();
    state.time = state.plan.at(-1).at * 0.37;
  });
  await page.waitForFunction(() => window.__thunderVanguard.state().mode === "upgrade");
  await page.locator("[data-protocol]").first().click();
  assert.equal(await page.evaluate(() => window.__thunderVanguard.state().protocols.length), 1, "real protocol card applies upgrade");

  const reference = await page.evaluate(() => window.__thunderVanguard.applyReference(0));
  assert.equal(reference.stars, 3, "displayed reference result earns three stars");
  assert.equal(await page.evaluate(() => window.__thunderVanguard.profile().unlocked >= 1), true, "campaign clear unlocks next sortie");
  const archive = await page.evaluate(() => window.__thunderVanguard.encode());
  assert.match(archive, /^THUNDER2\./, "archive prefix");
  assert.equal(await page.evaluate((code) => window.__thunderVanguard.decode(code).stars.length, archive), 9, "archive round trip");
  await assert.rejects(
    page.evaluate((code) => window.__thunderVanguard.decode(`${code}x`), archive),
    /先锋档案校验失败/,
    "archive detects tampering",
  );
  let signal = await canvasSignal(page);
  assert.ok(signal.opaque > 1000 && signal.colors >= 7, `desktop canvas signal ${JSON.stringify(signal)}`);
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
  await mobilePage.goto(`http://127.0.0.1:${port}/thunder-vanguard.html`, { waitUntil: "load" });
  await mobilePage.waitForFunction(() => Boolean(window.__thunderVanguard));
  await mobilePage.locator("#overlayLaunch").tap();
  const mobileBefore = await mobilePage.evaluate(() => window.__thunderVanguard.state().p.x);
  await dragShip(mobilePage, 0.5, 0.74);
  assert.ok(
    await mobilePage.evaluate((before) => window.__thunderVanguard.state().p.x > before + 0.03, mobileBefore),
    "mobile pointer drag moves fighter",
  );
  signal = await canvasSignal(mobilePage);
  assert.ok(signal.opaque > 1000 && signal.colors >= 7, `mobile canvas signal ${JSON.stringify(signal)}`);
  await noOverflow(mobilePage, "mobile");
  await mobilePage.screenshot({ path: path.join(outputDir, "mobile.png"), fullPage: true });
  assert.deepEqual(failures, [], "mobile browser errors");
  await mobile.close();

  console.log(JSON.stringify({
    missions: 9,
    sectors: 3,
    fighters: 3,
    modules: 6,
    protocols: 7,
    archive: "THUNDER2",
    failures,
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
