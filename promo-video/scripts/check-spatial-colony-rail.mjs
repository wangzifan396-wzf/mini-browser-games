import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output", "spatial-colony-rail");
const port = 4192;
const failures = [];

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    if (pathname === "/favicon.ico") return response.writeHead(204).end();
    const target = path.resolve(rootDir, pathname.slice(1));
    if (!target.startsWith(rootDir + path.sep)) return response.writeHead(403).end("Forbidden");
    const info = await stat(target);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "content-type": target.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "cache-control": "no-store" });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

function observe(page) {
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
}

async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 4, `${label} horizontal overflow: ${overflow}px`);
}

async function canvasSignal(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return { colored: 0, spread: 0 };
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const width = canvas.width;
    const height = canvas.height;
    const pixels = context.getImageData(0, 0, width, height).data;
    let colored = 0;
    const colors = new Set();
    const stride = Math.max(4, Math.floor((width * height) / 5000) * 4);
    for (let index = 0; index < pixels.length; index += stride) {
      const alpha = pixels[index + 3];
      if (alpha > 0) {
        colored++;
        colors.add(`${pixels[index] >> 4},${pixels[index + 1] >> 4},${pixels[index + 2] >> 4}`);
      }
    }
    return { colored, spread: colors.size };
  });
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
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });

  const cozy = await desktop.newPage();
  observe(cozy);
  await cozy.goto(`http://127.0.0.1:${port}/cozy-organizer.html`, { waitUntil: "load" });
  await cozy.waitForFunction(() => Boolean(window.__cozyOrganizer));
  assert.deepEqual(
    await cozy.evaluate(() => window.__cozyOrganizer.validateContent()),
    { valid: true, errors: [], rooms: 12, chapters: 4, pieces: 98, references: 12 },
    "organizer content contract"
  );
  await cozy.locator('[data-piece="p0"]').click();
  await cozy.locator('[data-x="0"][data-y="0"]').click();
  assert.equal(await cozy.evaluate(() => window.__cozyOrganizer.state().moves), 1, "real organizer placement");
  const cozyResult = await cozy.evaluate(() => {
    const api = window.__cozyOrganizer;
    const reference = api.applyReference(0);
    return { reference, stars: api.finish(), code: api.encode() };
  });
  assert.deepEqual(cozyResult.reference, { ok: true, errors: [] }, "organizer reference is legal");
  assert.equal(cozyResult.stars, 3, "organizer reference earns three stars");
  assert.match(cozyResult.code, /^COZY2\./, "organizer archive prefix");
  assert.equal(await cozy.evaluate((code) => window.__cozyOrganizer.decode(code).stars[0], cozyResult.code), 3, "organizer archive round trip");
  await noOverflow(cozy, "organizer desktop");
  await cozy.screenshot({ path: path.join(outputDir, "organizer-desktop.png"), fullPage: true });

  const hive = await desktop.newPage();
  observe(hive);
  await hive.goto(`http://127.0.0.1:${port}/hive-sovereign.html`, { waitUntil: "load" });
  await hive.waitForFunction(() => Boolean(window.__hiveSovereign));
  const hiveContent = await hive.evaluate(() => window.__hiveSovereign.validateContent());
  assert.equal(hiveContent.valid, true, `hive content: ${JSON.stringify(hiveContent.errors)}`);
  assert.deepEqual(
    { scenarios: hiveContent.scenarios, days: hiveContent.days, lineages: hiveContent.lineages, roles: hiveContent.roles, projects: hiveContent.projects },
    { scenarios: 4, days: 48, lineages: 3, roles: 5, projects: 6 },
    "hive content contract"
  );
  assert.equal(hiveContent.references.every((item) => item.mode === "result" && item.stars === 3), true, "all hive references clear with three stars");
  await hive.locator("#balanceBtn").click();
  await hive.locator('[data-project="comb"]').click();
  await hive.locator("#nextDayBtn").click();
  assert.equal(await hive.evaluate(() => window.__hiveSovereign.state().day), 2, "real hive day advances");
  assert.equal(await hive.evaluate(() => window.__hiveSovereign.state().projects.comb), 1, "real hive project built");
  const hiveCode = await hive.evaluate(() => window.__hiveSovereign.encode());
  assert.match(hiveCode, /^HIVE2\./, "hive archive prefix");
  assert.equal(await hive.evaluate((code) => window.__hiveSovereign.decode(code).stars.length, hiveCode), 4, "hive archive round trip");
  await noOverflow(hive, "hive desktop");
  await hive.screenshot({ path: path.join(outputDir, "hive-desktop.png"), fullPage: true });

  const rail = await desktop.newPage();
  observe(rail);
  await rail.goto(`http://127.0.0.1:${port}/switchyard-rush.html`, { waitUntil: "load" });
  await rail.waitForFunction(() => Boolean(window.__switchyardRush));
  const railContent = await rail.evaluate(() => window.__switchyardRush.validateContent());
  assert.equal(railContent.valid, true, `rail content: ${JSON.stringify(railContent.errors)}`);
  assert.deepEqual(
    { yards: railContent.yards, shifts: railContent.shifts, trains: railContent.trains, types: railContent.types },
    { yards: 3, shifts: 12, trains: 96, types: 4 },
    "rail content contract"
  );
  assert.equal(railContent.references.every((item) => item.mode === "result" && item.stars === 3), true, "all rail references clear with three stars");
  await rail.locator('[data-route="0"]').click();
  await rail.locator("#startBtn").click();
  await rail.locator("#pauseBtn").click();
  const railRun = await rail.evaluate(() => {
    const api = window.__switchyardRush;
    let guard = 0;
    while (api.state().mode !== "over" && guard++ < 600) {
      const pending = api.state().trains.filter((train) => train.lane === null).sort((a, b) => b.t - a.t)[0];
      if (pending) api.setRoute(pending.goal);
      api.step(.1, true);
    }
    return { mode: api.state().mode, delivered: api.state().delivered, strikes: api.state().strikes, score: api.state().score, stars: api.profile().stars[0], code: api.encode() };
  });
  assert.deepEqual(
    { mode: railRun.mode, delivered: railRun.delivered, strikes: railRun.strikes, stars: railRun.stars },
    { mode: "over", delivered: 8, strikes: 0, stars: 3 },
    "real rail model completes reference dispatch"
  );
  assert.match(railRun.code, /^RAIL2\./, "rail archive prefix");
  assert.equal(await rail.evaluate((code) => window.__switchyardRush.decode(code).stars[0], railRun.code), 3, "rail archive round trip");
  const pixels = await canvasSignal(rail);
  assert.ok(pixels.colored > 1000 && pixels.spread > 8, `rail canvas signal ${JSON.stringify(pixels)}`);
  await noOverflow(rail, "rail desktop");
  await rail.screenshot({ path: path.join(outputDir, "rail-desktop.png"), fullPage: true });
  assert.deepEqual(failures, [], "desktop browser errors");
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: "dark" });
  const mobileCases = [
    ["cozy-organizer.html", "__cozyOrganizer", async (page) => {
      await page.locator('[data-piece="p0"]').tap();
      await page.locator('[data-x="0"][data-y="0"]').tap();
      assert.equal(await page.evaluate(() => window.__cozyOrganizer.state().moves), 1, "organizer mobile placement");
    }],
    ["hive-sovereign.html", "__hiveSovereign", async (page) => {
      await page.locator("#balanceBtn").tap();
      await page.locator("#nextDayBtn").tap();
      assert.equal(await page.evaluate(() => window.__hiveSovereign.state().day), 2, "hive mobile day");
    }],
    ["switchyard-rush.html", "__switchyardRush", async (page) => {
      await page.locator('[data-route="2"]').tap();
      assert.equal(await page.evaluate(() => window.__switchyardRush.state().route), 2, "rail mobile route");
      const pixels = await canvasSignal(page);
      assert.ok(pixels.colored > 1000 && pixels.spread > 8, "rail mobile canvas signal");
    }]
  ];
  for (const [file, apiName, interact] of mobileCases) {
    const page = await mobile.newPage();
    observe(page);
    await page.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: "load" });
    await page.waitForFunction((name) => Boolean(window[name]), apiName);
    await interact(page);
    await noOverflow(page, `${file} mobile`);
    await page.screenshot({ path: path.join(outputDir, file.replace(".html", "-mobile.png")), fullPage: true });
    await page.close();
  }
  assert.deepEqual(failures, [], "mobile browser errors");
  await mobile.close();

  console.log(JSON.stringify({
    organizer: { rooms: 12, pieces: 98, references: 12, archive: "COZY2" },
    hive: { scenarios: 4, days: 48, lineages: 3, roles: 5, projects: 6, references: hiveContent.references, archive: "HIVE2" },
    rail: { yards: 3, shifts: 12, trains: 96, types: 4, references: railContent.references.length, score: railRun.score, archive: "RAIL2" },
    failures
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
