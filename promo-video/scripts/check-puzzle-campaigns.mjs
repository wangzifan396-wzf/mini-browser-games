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
const port = 4196;
await mkdir(outputDir, { recursive: true });

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    if (pathname === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
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
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    textLength: document.body.innerText.replace(/\s+/g, "").length,
  }));
  assert.equal(layout.scrollWidth <= layout.width + 4, true, `${label} horizontal overflow`);
  assert.equal(layout.textLength > 120, true, `${label} rendered content`);
}
async function open(page, file, apiName) {
  const response = await page.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: "load" });
  assert.equal(response?.status(), 200, `${file} response`);
  await page.waitForFunction((name) => Boolean(window[name]), apiName);
  await assertLayout(page, file);
}

try {
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const desktop = await browser.newContext({ viewport: { width: 1365, height: 900 } });

  const bomb = await desktop.newPage();
  observe(bomb, "bomb-desktop");
  await open(bomb, "bomb-grid.html", "__bombGridTest");
  assert.deepEqual(await bomb.evaluate(() => window.__bombGridTest.validateContent()), {
    missions: 12,
    referencesPassed: 12,
    stars: 36,
  });
  const bombReference = await bomb.evaluate(() => window.__bombGridTest.missions[0].ref);
  for (const [x, y, type] of bombReference) {
    await bomb.locator(`[data-type="${type}"]`).click();
    await bomb.locator(`.cell[data-x="${x}"][data-y="${y}"]`).click();
  }
  await bomb.locator("#detonate").click();
  await bomb.locator("#result:not([hidden])").waitFor();
  assert.equal(await bomb.locator("#resultStars").innerText(), "★★★");
  await bomb.screenshot({ path: path.join(outputDir, "bomb-grid-v2-desktop.png"), fullPage: true });
  await bomb.close();

  const mine = await desktop.newPage();
  observe(mine, "mine-desktop");
  await open(mine, "mine-matrix.html", "__mineMatrixTest");
  const mineValidation = await mine.evaluate(() => window.__mineMatrixTest.validateContent());
  assert.equal(mineValidation.missions, 12);
  assert.equal(mineValidation.logicSolved, 12);
  assert.equal(mineValidation.totalDeductions, 77);
  await mine.locator("#hint").click();
  assert.equal(await mine.locator(".cell.hint").count(), 1, "explainable hint highlight");
  const safeCells = await mine.evaluate(() => window.__mineMatrixTest.prepared[0].board.cells
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => cell.active && !cell.mine)
    .map(({ index }) => index));
  for (const index of safeCells) {
    const cell = mine.locator(`.cell[data-index="${index}"]`);
    if (!(await cell.isDisabled())) await cell.click();
    if (await mine.locator("#result:not([hidden])").count()) break;
  }
  await mine.locator("#result:not([hidden])").waitFor();
  assert.match(await mine.locator("#resultText").innerText(), /6 枚地雷全部定位/);
  await mine.screenshot({ path: path.join(outputDir, "mine-matrix-v2-desktop.png"), fullPage: true });
  await mine.close();

  const grid = await desktop.newPage();
  observe(grid, "grid-desktop");
  await open(grid, "tidal-grid.html", "__tidalGridTest");
  const gridValidation = await grid.evaluate(() => window.__tidalGridTest.validateContent());
  assert.equal(gridValidation.contracts, 12);
  assert.equal(gridValidation.phaseChecks, 36);
  const gridPar = await grid.evaluate(() => window.__tidalGridTest.prepared[0].par);
  for (let index = 0; index < gridPar; index += 1) await grid.locator("#hint").click();
  await grid.locator("#inspect").click();
  await grid.locator("#result:not([hidden])").waitFor();
  assert.match(await grid.locator("#resultText").innerText(), /低潮、平潮和高潮负载全部稳定/);
  await grid.screenshot({ path: path.join(outputDir, "tidal-grid-desktop.png"), fullPage: true });
  await grid.close();

  const post = await desktop.newPage();
  observe(post, "post-desktop");
  await open(post, "time-post.html", "__timePostTest");
  const postValidation = await post.evaluate(() => window.__timePostTest.validateContent());
  assert.equal(postValidation.missions, 12);
  assert.equal(postValidation.scheduledTasks, 84);
  const taskCount = await post.locator(".task").count();
  for (let index = 0; index < taskCount; index += 1) await post.locator("#hint").click();
  await post.locator("#execute").click();
  await post.locator("#result:not([hidden])").waitFor();
  assert.match(await post.locator("#resultText").innerText(), /6 项投递在 T4 前完成/);
  await post.screenshot({ path: path.join(outputDir, "time-post-desktop.png"), fullPage: true });
  await post.close();

  const golf = await desktop.newPage();
  observe(golf, "golf-desktop");
  await open(golf, "pocket-golf.html", "__pocketGolfTest");
  const golfValidation = await golf.evaluate(() => window.__pocketGolfTest.validateContent());
  assert.equal(golfValidation.holes, 18);
  assert.equal(golfValidation.referencesPassed, 18);
  assert.equal(golfValidation.tours, 3);
  assert.equal(golfValidation.totalPar > 50, true);
  await golf.locator("#reference").click();
  const courseBox = await golf.locator("#course").boundingBox();
  assert.ok(courseBox, "golf canvas visible");
  await golf.mouse.move(courseBox.x + courseBox.width * .094, courseBox.y + courseBox.height * .5);
  await golf.mouse.down();
  await golf.mouse.move(courseBox.x + 4, courseBox.y + courseBox.height * .5, { steps: 8 });
  await golf.mouse.up();
  await golf.waitForFunction(() => window.__pocketGolfTest.getState().strokes === 1);
  assert.equal(await golf.evaluate(() => {
    const canvas = document.querySelector("#course");
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let index = 0; index < pixels.length; index += 1600) if (pixels[index + 3]) colored += 1;
    return colored > 300;
  }), true, "golf canvas pixels");
  await golf.screenshot({ path: path.join(outputDir, "pocket-golf-v2-desktop.png"), fullPage: true });
  await golf.close();

  const cipher = await desktop.newPage();
  observe(cipher, "cipher-desktop");
  await open(cipher, "cipher-relay.html", "__cipherRelayTest");
  assert.deepEqual(await cipher.evaluate(() => window.__cipherRelayTest.validateContent()), {
    missions: 12,
    uniqueSolutions: 12,
    clues: 96,
    codewords: 64,
  });
  for (let index = 0; index < 7; index += 1) await cipher.locator("#hint").click();
  await cipher.locator("#verify").click();
  await cipher.locator("#result:not([hidden])").waitFor();
  assert.match(await cipher.locator("#resultText").innerText(), /噪声来自第 1 条读数/);
  await cipher.screenshot({ path: path.join(outputDir, "cipher-relay-desktop.png"), fullPage: true });
  await cipher.close();

  const route = await desktop.newPage();
  observe(route, "route-desktop");
  await open(route, "starline-route.html", "__starlineRouteTest");
  assert.deepEqual(await route.evaluate(() => window.__starlineRouteTest.validateContent()), {
    missions: 12,
    referenceRoutes: 12,
    edges: 166,
    eulerVerified: 12,
  });
  const routeEdges = await route.evaluate(() => window.__starlineRouteTest.missions[0].edges.length);
  for (let index = 0; index < routeEdges; index += 1) {
    await route.locator("#hint").click();
    await route.waitForFunction((count) => window.__starlineRouteTest.getState().used === count, index + 1);
  }
  await route.locator("#inspect").click();
  await route.locator("#result:not([hidden])").waitFor();
  assert.match(await route.locator("#resultText").innerText(), /12 条航线均恰好经过一次/);
  await route.screenshot({ path: path.join(outputDir, "starline-route-desktop.png"), fullPage: true });
  await route.close();

  const clean = await desktop.newPage();
  observe(clean, "clean-desktop");
  await open(clean, "clean-slate.html", "__cleanSlateTest");
  const cleanValidation = await clean.evaluate(() => window.__cleanSlateTest.validateContent());
  assert.equal(cleanValidation.jobs, 12);
  assert.equal(cleanValidation.referencesPassed, 12);
  assert.equal(cleanValidation.patches, 269);
  assert.equal(cleanValidation.totalLayers > 350, true);
  assert.equal(cleanValidation.tools, 4);
  const firstPatch = await clean.evaluate(() => window.__cleanSlateTest.getState().firstPatch);
  const toolForType = { dust: "rinse", grease: "foam", paint: "scraper", rust: "polish" };
  await clean.locator(`[data-tool="${toolForType[firstPatch.type]}"]`).click();
  const surfaceBox = await clean.locator("#surface").boundingBox();
  assert.ok(surfaceBox, "clean canvas visible");
  const cleanX = surfaceBox.x + surfaceBox.width * firstPatch.x / 960;
  const cleanY = surfaceBox.y + surfaceBox.height * firstPatch.y / 540;
  await clean.mouse.move(cleanX, cleanY);
  await clean.mouse.down();
  for (let index = 0; index < 3; index += 1) await clean.mouse.move(cleanX + index % 2, cleanY, { steps: 1 });
  await clean.mouse.up();
  assert.equal(await clean.evaluate(() => window.__cleanSlateTest.getState().cleanedLayers > 0), true);
  const cleanJobLayers = await clean.evaluate(() => window.__cleanSlateTest.jobs[0].totalLayers);
  let cleanedLayers = await clean.evaluate(() => window.__cleanSlateTest.getState().cleanedLayers);
  while (cleanedLayers < cleanJobLayers) {
    await clean.locator("#hint").click();
    cleanedLayers = await clean.evaluate(() => window.__cleanSlateTest.getState().cleanedLayers);
  }
  await clean.locator("#result:not([hidden])").waitFor();
  assert.match(await clean.locator("#resultText").innerText(), /层污渍全部清除/);
  await clean.screenshot({ path: path.join(outputDir, "clean-slate-v2-desktop.png"), fullPage: true });
  await clean.close();
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  for (const game of [
    ["bomb-grid.html", "__bombGridTest", "bomb-grid-v2-mobile.png"],
    ["mine-matrix.html", "__mineMatrixTest", "mine-matrix-v2-mobile.png"],
    ["tidal-grid.html", "__tidalGridTest", "tidal-grid-mobile.png"],
    ["time-post.html", "__timePostTest", "time-post-mobile.png"],
    ["pocket-golf.html", "__pocketGolfTest", "pocket-golf-v2-mobile.png"],
    ["cipher-relay.html", "__cipherRelayTest", "cipher-relay-mobile.png"],
    ["starline-route.html", "__starlineRouteTest", "starline-route-mobile.png"],
    ["clean-slate.html", "__cleanSlateTest", "clean-slate-v2-mobile.png"],
  ]) {
    const page = await mobile.newPage();
    observe(page, `${game[0]}-mobile`);
    await open(page, game[0], game[1]);
    const viewportFit = await page.evaluate(() => [...document.querySelectorAll("h1, h2, button")].every((element) => {
      const rect = element.getBoundingClientRect();
      return rect.right <= document.documentElement.clientWidth + 4 || element.closest(".timeline-wrap");
    }));
    assert.equal(viewportFit, true, `${game[0]} mobile controls fit`);
    await page.screenshot({ path: path.join(outputDir, game[2]), fullPage: true });
    await page.close();
  }
  await mobile.close();

  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    checks: "PASS",
    games: 8,
    campaignMissions: 102,
    bombReferences: 12,
    mineLogicBoards: 12,
    gridPhaseChecks: 36,
    postTasks: 84,
    golfHoles: 18,
    cipherUniqueSolutions: 12,
    routeEdges: 166,
    cleanLayers: cleanValidation.totalLayers,
    desktopOverflow: false,
    mobileOverflow: false,
    screenshots: [
      "output/bomb-grid-v2-desktop.png",
      "output/mine-matrix-v2-desktop.png",
      "output/tidal-grid-desktop.png",
      "output/time-post-desktop.png",
      "output/pocket-golf-v2-desktop.png",
      "output/cipher-relay-desktop.png",
      "output/starline-route-desktop.png",
      "output/clean-slate-v2-desktop.png",
      "output/bomb-grid-v2-mobile.png",
      "output/mine-matrix-v2-mobile.png",
      "output/tidal-grid-mobile.png",
      "output/time-post-mobile.png",
      "output/pocket-golf-v2-mobile.png",
      "output/cipher-relay-mobile.png",
      "output/starline-route-mobile.png",
      "output/clean-slate-v2-mobile.png",
    ],
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
