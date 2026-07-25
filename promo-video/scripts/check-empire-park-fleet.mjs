import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output", "empire-park-fleet");
const port = 4195;
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

async function gridContract(page, selector, expected, label) {
  const result = await page.locator(selector).evaluateAll((cells) => ({
    count: cells.length,
    minWidth: Math.min(...cells.map((cell) => cell.getBoundingClientRect().width)),
    minHeight: Math.min(...cells.map((cell) => cell.getBoundingClientRect().height))
  }));
  assert.equal(result.count, expected, `${label} cell count`);
  assert.ok(result.minWidth >= 34 && result.minHeight >= 34, `${label} stable cells: ${JSON.stringify(result)}`);
  return result;
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

  const empire = await desktop.newPage();
  observe(empire);
  await empire.goto(`http://127.0.0.1:${port}/pocket-empire.html`, { waitUntil: "load" });
  await empire.waitForFunction(() => Boolean(window.__pocketEmpire));
  assert.deepEqual(
    await empire.evaluate(() => window.__pocketEmpire.validateContent()),
    { valid: true, errors: [], scenarios: 6, tiles: 384, doctrines: 3, techs: 6, references: 6 },
    "empire content contract"
  );
  assert.equal(
    await empire.evaluate(() => Array.from({ length: 6 }, (_, index) => window.__pocketEmpire.simulateReference(index)).every((item) => item.ok && item.stars === 3)),
    true,
    "all empire reference campaigns earn three stars"
  );
  await empire.locator('[data-tile="56"]').click();
  await empire.locator('[data-tile="57"]').click();
  assert.equal(await empire.evaluate(() => window.__pocketEmpire.state().ap), 3, "real empire movement spends action");
  await empire.locator('[data-tech="agri"]').click();
  assert.equal(await empire.evaluate(() => window.__pocketEmpire.state().tech.agri), true, "real empire research unlocks technology");
  await empire.locator("#endBtn").click();
  assert.equal(await empire.evaluate(() => window.__pocketEmpire.state().turn), 2, "real empire turn advances");
  const empireReference = await empire.evaluate(() => window.__pocketEmpire.applyReference());
  assert.equal(empireReference.stars, 3, "empire displayed reference earns three stars");
  const empireCode = await empire.evaluate(() => window.__pocketEmpire.encode());
  assert.match(empireCode, /^EMPIRE2\./, "empire archive prefix");
  assert.equal(await empire.evaluate((code) => window.__pocketEmpire.decode(code).stars.length, empireCode), 6, "empire archive round trip");
  await assert.rejects(
    empire.evaluate((code) => window.__pocketEmpire.decode(`${code}x`), empireCode),
    /帝国档案校验失败/,
    "empire archive detects tampering"
  );
  await gridContract(empire, ".tile", 64, "empire desktop");
  await noOverflow(empire, "empire desktop");
  await empire.screenshot({ path: path.join(outputDir, "empire-desktop.png"), fullPage: true });

  const park = await desktop.newPage();
  observe(park);
  await park.goto(`http://127.0.0.1:${port}/wonder-park.html`, { waitUntil: "load" });
  await park.waitForFunction(() => Boolean(window.__wonderPark));
  assert.deepEqual(
    await park.evaluate(() => window.__wonderPark.validateContent()),
    { valid: true, errors: [], scenarios: 6, days: 60, buildings: 9, visitorTypes: 3, references: 6 },
    "park content contract"
  );
  assert.equal(
    await park.evaluate(() => Array.from({ length: 6 }, (_, index) => window.__wonderPark.simulateReference(index)).every((item) => item.ok && item.stars === 3)),
    true,
    "all park reference operations earn three stars"
  );
  await park.locator('[data-cell="57"]').click();
  assert.equal(await park.evaluate(() => window.__wonderPark.state().cells[57].type), "path", "real park path placement");
  await park.locator('[data-price="premium"]').click();
  assert.equal(await park.evaluate(() => window.__wonderPark.state().price), "premium", "real park price control");
  const parkReference = await park.evaluate(() => window.__wonderPark.applyReference());
  assert.equal(parkReference.stars, 3, "park displayed reference earns three stars");
  const parkCode = await park.evaluate(() => window.__wonderPark.encode());
  assert.match(parkCode, /^PARK2\./, "park archive prefix");
  assert.equal(await park.evaluate((code) => window.__wonderPark.decode(code).stars.length, parkCode), 6, "park archive round trip");
  await gridContract(park, ".cell", 64, "park desktop");
  await noOverflow(park, "park desktop");
  await park.screenshot({ path: path.join(outputDir, "park-desktop.png"), fullPage: true });

  const fleet = await desktop.newPage();
  observe(fleet);
  await fleet.goto(`http://127.0.0.1:${port}/fleet-duel.html`, { waitUntil: "load" });
  await fleet.waitForFunction(() => Boolean(window.__fleetDuel));
  assert.deepEqual(
    await fleet.evaluate(() => window.__fleetDuel.validateContent()),
    { valid: true, errors: [], scenarios: 6, ships: 30, captains: 3, cells: 64, references: 6 },
    "fleet content contract"
  );
  assert.equal(
    await fleet.evaluate(() => Array.from({ length: 6 }, (_, index) => window.__fleetDuel.simulateReference(index)).every((item) => item.ok && item.stars === 3)),
    true,
    "all fleet reference operations earn three stars"
  );
  await fleet.locator("#sonarActionBtn").click();
  await fleet.locator('[data-enemy="18"]').click();
  assert.equal(await fleet.evaluate(() => window.__fleetDuel.state().sonarUsed), 1, "real fleet sonar spends charge");
  await fleet.locator('[data-enemy="0"]').click();
  assert.equal(await fleet.evaluate(() => window.__fleetDuel.state().hits), 1, "real fleet shot hits fixed target");
  const fleetReference = await fleet.evaluate(() => window.__fleetDuel.applyReference());
  assert.deepEqual(
    { stars: fleetReference.stars, shots: fleetReference.shots, hits: fleetReference.hits },
    { stars: 3, shots: 14, hits: 14 },
    "fleet displayed reference is efficient"
  );
  const fleetCode = await fleet.evaluate(() => window.__fleetDuel.encode());
  assert.match(fleetCode, /^FLEET2\./, "fleet archive prefix");
  assert.equal(await fleet.evaluate((code) => window.__fleetDuel.decode(code).stars.length, fleetCode), 6, "fleet archive round trip");
  await gridContract(fleet, ".cell", 128, "fleet desktop");
  await noOverflow(fleet, "fleet desktop");
  await fleet.screenshot({ path: path.join(outputDir, "fleet-desktop.png"), fullPage: true });
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
  const mobileCases = [
    ["pocket-empire.html", "__pocketEmpire", ".tile", 64, async (page) => {
      await page.locator('[data-tile="56"]').tap();
      await page.locator('[data-tile="57"]').tap();
      assert.equal(await page.evaluate(() => window.__pocketEmpire.state().ap), 3, "empire mobile movement");
    }],
    ["wonder-park.html", "__wonderPark", ".cell", 64, async (page) => {
      await page.locator('[data-cell="57"]').tap();
      assert.equal(await page.evaluate(() => window.__wonderPark.state().cells[57].type), "path", "park mobile build");
    }],
    ["fleet-duel.html", "__fleetDuel", ".cell", 128, async (page) => {
      await page.locator('[data-enemy="0"]').tap();
      assert.equal(await page.evaluate(() => window.__fleetDuel.state().hits), 1, "fleet mobile shot");
    }]
  ];
  const mobileGrids = {};
  for (const [file, apiName, selector, count, interact] of mobileCases) {
    const page = await mobile.newPage();
    observe(page);
    await page.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: "load" });
    await page.waitForFunction((name) => Boolean(window[name]), apiName);
    await interact(page);
    mobileGrids[file] = await gridContract(page, selector, count, `${file} mobile`);
    await noOverflow(page, `${file} mobile`);
    await page.screenshot({ path: path.join(outputDir, file.replace(".html", "-mobile.png")), fullPage: true });
    await page.close();
  }
  assert.deepEqual(failures, [], "mobile browser errors");
  await mobile.close();

  console.log(JSON.stringify({
    empire: { scenarios: 6, doctrines: 3, techs: 6, archive: "EMPIRE2" },
    park: { scenarios: 6, eventDays: 60, visitorTypes: 3, archive: "PARK2" },
    fleet: { scenarios: 6, fixedShips: 30, captains: 3, archive: "FLEET2" },
    mobileGrids,
    failures
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
