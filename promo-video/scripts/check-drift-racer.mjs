import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output");
const port = 4182;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    if (pathname === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    const target = path.resolve(rootDir, pathname.slice(1));
    if (!target.startsWith(rootDir + path.sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(target);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "content-type": mime[path.extname(target).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

function observe(page, failures) {
  page.on("pageerror", error => failures.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
}

async function canvasSignal(page) {
  return page.locator("#gameCanvas").evaluate(canvas => {
    const context = canvas.getContext("2d");
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let opaque = 0;
    const stride = Math.max(4, Math.floor(data.length / 1800 / 4) * 4);
    for (let index = 0; index < data.length; index += stride) {
      if (data[index + 3] > 0) opaque += 1;
      colors.add(`${data[index] >> 4}:${data[index + 1] >> 4}:${data[index + 2] >> 4}`);
    }
    return { opaque, colors: colors.size };
  });
}

await mkdir(outputDir, { recursive: true });
await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));

let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
} catch {
  browser = await chromium.launch({ headless: true });
}

const failures = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const page = await context.newPage();
  observe(page, failures);
  await page.goto(`http://127.0.0.1:${port}/drift-racer.html?debug=1`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__driftTourDebug));

  assert.equal(await page.locator("[data-event]").count(), 9, "nine-event tour");
  assert.equal(await page.locator("[data-vehicle]").count(), 4, "four vehicle choices");
  assert.equal(await page.locator("[data-module]").count(), 8, "eight tuning modules");
  assert.equal(await page.locator("[data-event]:disabled").count(), 8, "career begins with one event");
  await page.screenshot({ path: path.join(outputDir, "drift-tour-v2-lobby-desktop.png"), fullPage: true });

  let snapshot = await page.evaluate(() => window.__driftTourDebug.snapshot());
  assert.equal(snapshot.totalStars, 0, "new career starts at zero stars");
  assert.equal(snapshot.trackPoints, 11, "harbor track configured");
  assert.equal(snapshot.checkpoints, 4, "checkpoint sequence configured");

  await page.evaluate(() => window.__driftTourDebug.start("harbor-qualifier"));
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1_150);
  await page.keyboard.up("KeyW");
  snapshot = await page.evaluate(() => window.__driftTourDebug.snapshot());
  assert.ok(snapshot.player.speed > 100, "real keyboard input accelerates the vehicle");
  let signal = await canvasSignal(page);
  assert.ok(signal.opaque > 30, "desktop canvas has opaque pixels");
  assert.ok(signal.colors > 8, "desktop canvas has varied rendered colors");
  await page.screenshot({ path: path.join(outputDir, "drift-tour-v2-desktop.png"), fullPage: true });

  snapshot = await page.evaluate(() => window.__driftTourDebug.forceFinish({
    place: 1,
    time: 39,
    bestLap: 18.6,
    driftScore: 2100,
    clips: 8,
    offroadTime: 0,
    recordGhost: true
  }));
  assert.equal(snapshot.career.eventStars["harbor-qualifier"], 3, "three objectives award three stars");
  assert.equal(snapshot.totalStars, 3, "career star total updated");
  assert.equal(snapshot.career.wins, 1, "championship win recorded");
  assert.match(await page.locator("#resultGrade").innerText(), /★★★/, "result shows three stars");
  assert.equal(await page.locator("[data-event]:disabled").count(), 6, "new events unlock at three stars");

  await page.evaluate(() => window.__driftTourDebug.start("harbor-qualifier"));
  snapshot = await page.evaluate(() => window.__driftTourDebug.snapshot());
  assert.ok(snapshot.activeGhostSamples > 8, "new personal best becomes a replay ghost");
  await page.locator("#garageBtn").click();

  snapshot = await page.evaluate(() => window.__driftTourDebug.unlockAll());
  assert.equal(snapshot.totalStars, 27, "debug completion unlocks full tour");
  assert.equal(snapshot.medals.length, 6, "six career medals available");
  await page.locator('[data-tab="garage"]').click();
  await page.locator('[data-vehicle="comet"]').click();
  await page.locator('[data-module="overdrive"]').click();
  await page.locator('[data-module="driftKit"]').click();
  await page.evaluate(() => window.__driftTourDebug.start("apex-final"));
  snapshot = await page.evaluate(() => window.__driftTourDebug.snapshot());
  assert.ok(snapshot.career.ownedCars.includes("comet"), "unlocked vehicle is purchased with credits");
  assert.ok(snapshot.career.ownedModules.includes("driftKit"), "unlocked module is purchased with credits");
  assert.equal(snapshot.career.credits, 3960, "vehicle and module prices are deducted");
  assert.ok(snapshot.player.stats.speed > 1.16, "vehicle and turbo speed modifiers stack");
  assert.ok(snapshot.player.stats.drift > 1.2, "drift module affects scoring stats");
  assert.equal(snapshot.condition, "storm", "final uses storm condition");
  assert.equal(snapshot.trackPoints, 12, "foundry track has independent geometry");

  const code = await page.evaluate(() => window.__driftTourDebug.encodeCareer());
  assert.match(code, /^DRIFT2\./, "portable archive uses V2 prefix");
  snapshot = await page.evaluate(value => window.__driftTourDebug.importCareer(value), code);
  assert.equal(snapshot.selectedCar, "comet", "archive preserves selected vehicle");
  assert.deepEqual(snapshot.modules, ["overdrive", "driftKit"], "archive preserves tuning loadout");
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4),
    true,
    "desktop has no horizontal overflow"
  );
  assert.deepEqual(failures, [], "desktop has no browser errors");
  await context.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    colorScheme: "dark"
  });
  const mobilePage = await mobileContext.newPage();
  observe(mobilePage, failures);
  await mobilePage.goto(`http://127.0.0.1:${port}/drift-racer.html?debug=1`, { waitUntil: "load" });
  await mobilePage.waitForFunction(() => Boolean(window.__driftTourDebug));
  await mobilePage.evaluate(() => window.__driftTourDebug.unlockAll());
  assert.equal(await mobilePage.locator("[data-event]").count(), 9, "mobile tour content present");
  await mobilePage.screenshot({ path: path.join(outputDir, "drift-tour-v2-lobby-mobile.png"), fullPage: true });
  await mobilePage.evaluate(() => window.__driftTourDebug.start("alpine-rain"));
  await mobilePage.waitForTimeout(650);
  assert.equal(await mobilePage.locator(".touch-controls").evaluate(element => getComputedStyle(element).display), "flex", "touch controls visible");
  signal = await canvasSignal(mobilePage);
  assert.ok(signal.opaque > 30, "mobile canvas has opaque pixels");
  assert.ok(signal.colors > 8, "mobile canvas has varied rendered colors");
  assert.equal(
    await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4),
    true,
    "mobile has no horizontal overflow"
  );
  await mobilePage.screenshot({ path: path.join(outputDir, "drift-tour-v2-mobile.png"), fullPage: true });
  assert.deepEqual(failures, [], "mobile has no browser errors");
  await mobileContext.close();

  console.log(JSON.stringify({
    events: 9,
    vehicles: 4,
    modules: 8,
    medals: 6,
    desktopLobbyScreenshot: "output/drift-tour-v2-lobby-desktop.png",
    mobileLobbyScreenshot: "output/drift-tour-v2-lobby-mobile.png",
    desktopScreenshot: "output/drift-tour-v2-desktop.png",
    mobileScreenshot: "output/drift-tour-v2-mobile.png",
    failures
  }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
