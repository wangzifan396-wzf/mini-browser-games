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
const port = 4193;
await mkdir(outputDir, { recursive: true });

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
      "content-type": path.extname(target) === ".html"
        ? "text/html; charset=utf-8"
        : "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

const errors = [];
let browser;

function observe(page, label) {
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label}: ${message.text()}`);
  });
}

async function hasCanvasSignal(page) {
  return page.locator("canvas").evaluate((canvas) => {
    const context = canvas.getContext("2d");
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let opaque = 0;
    const colors = new Set();
    for (let index = 0; index < data.length; index += 64) {
      if (data[index + 3] > 0) opaque += 1;
      colors.add(`${data[index]}:${data[index + 1]}:${data[index + 2]}`);
    }
    return opaque > 1_000 && colors.size > 12;
  });
}

async function hasNoHorizontalOverflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4,
  );
}

try {
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 } });

  const escapePage = await desktop.newPage();
  observe(escapePage, "clockwork desktop");
  await escapePage.goto(`http://127.0.0.1:${port}/clockwork-escape.html`, { waitUntil: "load" });
  await escapePage.waitForFunction(() => Boolean(window.__clockworkEscape));
  const escapeContent = await escapePage.evaluate(() => window.__clockworkEscape.validateContent());
  assert.equal(escapeContent.valid, true);
  assert.equal(escapeContent.chapters, 6);
  assert.equal(escapeContent.objects, 37);
  for (let index = 0; index < 6; index += 1) {
    const result = await escapePage.evaluate((value) => window.__clockworkEscape.applyReference(value), index);
    assert.equal(result.ok, true, `escape reference ${index}`);
    assert.equal(result.stars, 3, `escape stars ${index}`);
  }
  await escapePage.evaluate(() => window.__clockworkEscape.selectChapter(0));
  await escapePage.locator('[data-object="painting"]').click();
  await escapePage.locator('[data-object="desk"]').click();
  await escapePage.locator('[data-id="wind"]').click();
  await escapePage.locator('[data-object="clock"]').click();
  await escapePage.locator('[data-object="safe"]').click();
  await escapePage.locator("#codeInput").fill("0645");
  await escapePage.locator("#codeConfirm").click();
  assert.equal(await escapePage.evaluate(() => window.__clockworkEscape.state().flags.safe), true);
  const escapeCode = await escapePage.evaluate(() => window.__clockworkEscape.encode());
  assert.match(escapeCode, /^ESCAPE2\./);
  assert.equal(
    await escapePage.evaluate((code) => window.__clockworkEscape.decode(code).v, escapeCode),
    2,
  );
  assert.equal(await hasNoHorizontalOverflow(escapePage), true);
  await escapePage.screenshot({ path: path.join(outputDir, "clockwork-escape-v2-desktop.png"), fullPage: true });

  const signalPage = await desktop.newPage();
  observe(signalPage, "signal desktop");
  await signalPage.goto(`http://127.0.0.1:${port}/signal-caravan.html`, { waitUntil: "load" });
  await signalPage.waitForFunction(() => Boolean(window.__signalCaravan));
  const signalContent = await signalPage.evaluate(() => window.__signalCaravan.validateContent());
  assert.deepEqual(signalContent, { valid: true, errors: [], routes: 12, events: 78, references: 12 });
  for (let index = 0; index < 12; index += 1) {
    const result = await signalPage.evaluate((value) => window.__signalCaravan.simulateReference(value), index);
    assert.equal(result.ok, true, `signal reference ${index}`);
    assert.equal(result.stars, 3, `signal stars ${index}`);
  }
  await signalPage.locator("#startBtn").click();
  await signalPage.waitForTimeout(700);
  await signalPage.locator('[data-action="sweep"]').click();
  assert.equal(await signalPage.evaluate(() => window.__signalCaravan.state().progress > 0), true);
  assert.equal(await hasCanvasSignal(signalPage), true);
  const signalCode = await signalPage.evaluate(() => window.__signalCaravan.encode());
  assert.match(signalCode, /^BEACON2\./);
  assert.equal(await signalPage.evaluate((code) => window.__signalCaravan.decode(code).v, signalCode), 2);
  assert.equal(await hasNoHorizontalOverflow(signalPage), true);
  await signalPage.screenshot({ path: path.join(outputDir, "signal-caravan-v2-desktop.png"), fullPage: true });

  const cityPage = await desktop.newPage();
  observe(cityPage, "city desktop");
  await cityPage.goto(`http://127.0.0.1:${port}/skyline-planner.html`, { waitUntil: "load" });
  await cityPage.waitForFunction(() => Boolean(window.__skylinePlanner));
  const cityContent = await cityPage.evaluate(() => window.__skylinePlanner.validateContent());
  assert.deepEqual(cityContent, {
    valid: true,
    errors: [],
    scenarios: 12,
    buildings: 11,
    policies: 6,
    references: 12,
  });
  for (let index = 0; index < 12; index += 1) {
    const result = await cityPage.evaluate((value) => window.__skylinePlanner.simulateReference(value), index);
    assert.equal(result.ok, true, `city reference ${index}`);
    assert.equal(result.stars, 3, `city stars ${index}`);
  }
  await cityPage.locator('[data-tool="home"]').click();
  await cityPage.locator('[data-x="0"][data-y="4"]').click();
  assert.equal(
    await cityPage.evaluate(() => window.__skylinePlanner.state().cells[40].type),
    "home",
  );
  const cityReference = await cityPage.evaluate(() => window.__skylinePlanner.applyReference(0));
  assert.equal(cityReference.stars, 3);
  const cityCode = await cityPage.evaluate(() => window.__skylinePlanner.encode());
  assert.match(cityCode, /^CITY2\./);
  assert.equal(await cityPage.evaluate((code) => window.__skylinePlanner.decode(code).v, cityCode), 2);
  assert.equal(await hasNoHorizontalOverflow(cityPage), true);
  await cityPage.screenshot({ path: path.join(outputDir, "skyline-planner-v2-desktop.png"), fullPage: true });

  const dojoPage = await desktop.newPage();
  observe(dojoPage, "dojo desktop");
  await dojoPage.goto(`http://127.0.0.1:${port}/dojo-duel.html`, { waitUntil: "load" });
  await dojoPage.waitForFunction(() => Boolean(window.__dojoDuel));
  const dojoContent = await dojoPage.evaluate(() => window.__dojoDuel.validateContent());
  assert.deepEqual(dojoContent, {
    valid: true,
    errors: [],
    fighters: 6,
    playerFighters: 4,
    bouts: 8,
    styles: 8,
  });
  await dojoPage.locator('[data-fighter="tiger"]').click();
  await dojoPage.locator("#startBtn").click();
  await dojoPage.waitForTimeout(450);
  await dojoPage.keyboard.press("KeyJ");
  await dojoPage.waitForTimeout(180);
  assert.equal(await dojoPage.evaluate(() => window.__dojoDuel.snapshot().mode), "running");
  assert.equal(await hasCanvasSignal(dojoPage), true);
  const dojoResult = await dojoPage.evaluate(() =>
    window.__dojoDuel.forceOutcome(true, { maxCombo: 4, specialHits: 1, score: 1_400 }),
  );
  assert.equal(dojoResult.stars, 3);
  const dojoCode = await dojoPage.evaluate(() => window.__dojoDuel.encode());
  assert.match(dojoCode, /^DOJO2\./);
  assert.equal(await dojoPage.evaluate((code) => window.__dojoDuel.decode(code).v, dojoCode), 2);
  assert.equal(await hasNoHorizontalOverflow(dojoPage), true);
  await dojoPage.screenshot({ path: path.join(outputDir, "dojo-duel-v2-desktop.png"), fullPage: true });

  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  for (const [file, contract, screenshot] of [
    ["clockwork-escape.html", "__clockworkEscape", "clockwork-escape-v2-mobile.png"],
    ["signal-caravan.html", "__signalCaravan", "signal-caravan-v2-mobile.png"],
    ["skyline-planner.html", "__skylinePlanner", "skyline-planner-v2-mobile.png"],
    ["dojo-duel.html", "__dojoDuel", "dojo-duel-v2-mobile.png"],
  ]) {
    const page = await mobile.newPage();
    observe(page, `${file} mobile`);
    await page.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: "load" });
    await page.waitForFunction((name) => Boolean(window[name]), contract);
    assert.equal(await hasNoHorizontalOverflow(page), true, `${file} mobile overflow`);
    if (contract === "__signalCaravan") {
      await page.locator("#startBtn").tap();
      await page.waitForTimeout(350);
      assert.equal(await hasCanvasSignal(page), true);
    }
    if (contract === "__dojoDuel") {
      await page.locator("#startBtn").tap();
      await page.waitForTimeout(350);
      assert.equal(await hasCanvasSignal(page), true);
    }
    await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: true });
    await page.close();
  }
  await mobile.close();

  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    checks: "PASS",
    games: 4,
    clockwork: { chapters: 6, objects: 37, references: 6 },
    signal: { routes: 12, events: 78, references: 12 },
    city: { scenarios: 12, buildings: 11, policies: 6, references: 12 },
    dojo: { fighters: 6, playerFighters: 4, bouts: 8, styles: 8 },
    screenshots: 8,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
