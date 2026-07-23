import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output", "event-replay-scenarios");
const port = 4189;
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

  const auction = await desktop.newPage();
  observe(auction);
  await auction.goto(`http://127.0.0.1:${port}/auction-fever.html`, { waitUntil: "load" });
  await auction.waitForFunction(() => Boolean(window.__auctionFever));
  assert.deepEqual(
    await auction.evaluate(() => window.__auctionFever.validateContent()),
    { valid: true, errors: [], tours: 3, lots: 12, rivals: 3, events: 12 },
    "auction content audit"
  );
  await auction.locator("#appraiseBtn").click();
  await auction.locator("#bidBtn").click();
  assert.equal(await auction.evaluate(() => window.__auctionFever.state().appraisals), 1, "real appraisal action");
  assert.ok(await auction.evaluate(() => window.__auctionFever.state().events.length >= 3), "real bid produces event journal");
  const auctionReplay = await auction.evaluate(() => {
    const api = window.__auctionFever;
    return { live: api.digest(api.state()), replay: api.replay(api.state().history) };
  });
  assert.equal(auctionReplay.live, auctionReplay.replay, "auction command replay is deterministic");
  await auction.evaluate(() => {
    const api = window.__auctionFever;
    const state = api.state();
    state.money = api.TOURS[0].target;
    state.bag = [];
    state.profitableSales = 1;
    state.appraisals = 2;
    state.mode = "auction";
    api.finishTour();
  });
  assert.equal(await auction.evaluate(() => window.__auctionFever.profile().stars[0]), 3, "auction three-star settlement");
  const auctionCode = await auction.evaluate(() => window.__auctionFever.encode());
  assert.match(auctionCode, /^AUCTION2\./, "auction archive prefix");
  assert.equal(await auction.evaluate((code) => window.__auctionFever.decode(code).stars[0], auctionCode), 3, "auction archive round trip");
  await noOverflow(auction, "auction desktop");
  await auction.screenshot({ path: path.join(outputDir, "auction-desktop.png"), fullPage: true });

  const island = await desktop.newPage();
  observe(island);
  await island.goto(`http://127.0.0.1:${port}/island-survival.html`, { waitUntil: "load" });
  await island.waitForFunction(() => Boolean(window.__islandSurvival));
  assert.deepEqual(
    await island.evaluate(() => window.__islandSurvival.validateContent()),
    { valid: true, errors: [], routes: 3, events: 30, actions: 5 },
    "island content audit"
  );
  await island.locator('[data-choice="0"]').click();
  await island.locator('[data-action="wood"]').click();
  await island.locator('[data-action="water"]').click();
  await island.locator("#sleepBtn").click();
  await island.locator('[data-choice="0"]').click();
  assert.equal(await island.evaluate(() => window.__islandSurvival.state().day), 2, "real island event and night advance");
  const islandReplay = await island.evaluate(() => {
    const api = window.__islandSurvival;
    return { live: api.digest(api.state()), replay: api.replay(api.state().history) };
  });
  assert.equal(islandReplay.live, islandReplay.replay, "island command replay is deterministic");
  await island.evaluate(() => {
    const api = window.__islandSurvival;
    const state = api.state();
    state.signal = 100;
    state.hp = 80;
    state.eventsHelped = 3;
    state.day = 11;
    state.mode = "play";
    api.finish();
  });
  assert.equal(await island.evaluate(() => window.__islandSurvival.profile().stars[0]), 3, "island three-star rescue");
  const islandCode = await island.evaluate(() => window.__islandSurvival.encode());
  assert.match(islandCode, /^ISLAND2\./, "island archive prefix");
  assert.equal(await island.evaluate((code) => window.__islandSurvival.decode(code).stars[0], islandCode), 3, "island archive round trip");
  await noOverflow(island, "island desktop");
  await island.screenshot({ path: path.join(outputDir, "island-desktop.png"), fullPage: true });

  const pathogen = await desktop.newPage();
  observe(pathogen);
  await pathogen.goto(`http://127.0.0.1:${port}/pathogen-protocol.html`, { waitUntil: "load" });
  await pathogen.waitForFunction(() => Boolean(window.__pathogenProtocol));
  assert.deepEqual(
    await pathogen.evaluate(() => window.__pathogenProtocol.validateContent()),
    { valid: true, errors: [], scenarios: 4, regions: 8, genes: 12, events: 24, strains: 3 },
    "pathogen content audit"
  );
  await pathogen.locator('[data-gene="air"]').click();
  await pathogen.locator("#stepBtn").click();
  await pathogen.locator("#stepBtn").click();
  assert.equal(await pathogen.evaluate(() => window.__pathogenProtocol.state().cycle), 2, "real simulation cycles advance");
  const pathogenReplay = await pathogen.evaluate(() => {
    const api = window.__pathogenProtocol;
    return { live: api.digest(api.state()), replay: api.replay(api.state().history) };
  });
  assert.equal(pathogenReplay.live, pathogenReplay.replay, "pathogen command replay is deterministic");
  const references = await pathogen.evaluate(() =>
    window.__pathogenProtocol.SCENARIOS.map((_, index) => window.__pathogenProtocol.simulateReference(index))
  );
  assert.equal(references.every((item) => item.mode === "result"), true, `all reference strategies win: ${JSON.stringify(references)}`);
  await pathogen.evaluate(() => {
    const api = window.__pathogenProtocol;
    const state = api.state();
    state.cure = 0;
    state.deaths = 0;
    state.cycle = 10;
    api.finish();
  });
  assert.equal(await pathogen.evaluate(() => window.__pathogenProtocol.profile().stars[0]), 3, "pathogen three-star result");
  const pathogenCode = await pathogen.evaluate(() => window.__pathogenProtocol.encode());
  assert.match(pathogenCode, /^PATH2\./, "pathogen archive prefix");
  assert.equal(await pathogen.evaluate((code) => window.__pathogenProtocol.decode(code).stars[0], pathogenCode), 3, "pathogen archive round trip");
  await noOverflow(pathogen, "pathogen desktop");
  await pathogen.screenshot({ path: path.join(outputDir, "pathogen-desktop.png"), fullPage: true });
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
  const cases = [
    ["auction-fever.html", "__auctionFever", async (page) => {
      await page.locator("#appraiseBtn").tap();
      assert.equal(await page.evaluate(() => window.__auctionFever.state().appraisals), 1, "auction mobile appraisal");
    }],
    ["island-survival.html", "__islandSurvival", async (page) => {
      await page.locator('[data-choice="0"]').tap();
      await page.locator('[data-action="wood"]').tap();
      assert.equal(await page.evaluate(() => window.__islandSurvival.state().ap), 3, "island mobile action");
    }],
    ["pathogen-protocol.html", "__pathogenProtocol", async (page) => {
      await page.locator("#stepBtn").tap();
      assert.equal(await page.evaluate(() => window.__pathogenProtocol.state().cycle), 1, "pathogen mobile step");
    }]
  ];
  for (const [file, api, interact] of cases) {
    const page = await mobile.newPage();
    observe(page);
    await page.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: "load" });
    await page.waitForFunction((name) => Boolean(window[name]), api);
    await interact(page);
    await noOverflow(page, `${file} mobile`);
    await page.screenshot({ path: path.join(outputDir, file.replace(".html", "-mobile.png")), fullPage: true });
    await page.close();
  }
  assert.deepEqual(failures, [], "mobile browser errors");
  await mobile.close();

  console.log(JSON.stringify({
    auction: { tours: 3, lots: 12, rivals: 3, events: 12, replay: true, archive: "AUCTION2" },
    island: { routes: 3, events: 30, replay: true, archive: "ISLAND2" },
    pathogen: { scenarios: 4, regions: 8, genes: 12, events: 24, references, replay: true, archive: "PATH2" },
    failures
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
