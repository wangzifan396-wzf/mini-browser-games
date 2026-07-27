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
const port = 4204;
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
  assert.equal(layout.textLength > 180, true, `${label} rendered content`);
}
async function assertCanvas(page, label) {
  const pixels = await page.locator("canvas").evaluate((canvas) => {
    const context = canvas.getContext("2d");
    const colors = new Set();
    let opaque = 0;
    for (let y = 0; y < canvas.height; y += Math.max(1, Math.floor(canvas.height / 17))) {
      for (let x = 0; x < canvas.width; x += Math.max(1, Math.floor(canvas.width / 19))) {
        const data = context.getImageData(x, y, 1, 1).data;
        if (data[3]) opaque += 1;
        colors.add(`${data[0]},${data[1]},${data[2]},${data[3]}`);
      }
    }
    return { opaque, colors: colors.size };
  });
  assert.equal(pixels.opaque > 200, true, `${label} canvas is nonblank`);
  assert.equal(pixels.colors > 4, true, `${label} canvas has rendered detail`);
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

  const sudoku = await desktop.newPage();
  observe(sudoku, "sudoku-desktop");
  await open(sudoku, "sudoku-studio.html", "__sudokuStudioTest");
  assert.deepEqual(await sudoku.evaluate(() => window.__sudokuStudioTest.validateContent()), {
    missions: 12,
    uniqueSolutions: 12,
    classic: 4,
    diagonal: 4,
    killer: 4,
    clues: 318,
    cages: 115,
  });
  const firstEmpty = await sudoku.evaluate(() => window.__sudokuStudioTest.getState().values.indexOf(0));
  await sudoku.locator("#noteMode").click();
  await sudoku.evaluate(() => window.__sudokuStudioTest.input(5));
  assert.equal(await sudoku.evaluate((index) => window.__sudokuStudioTest.getState().notes[index].includes(5), firstEmpty), true);
  await sudoku.locator("#undo").click();
  assert.equal(await sudoku.evaluate((index) => window.__sudokuStudioTest.getState().notes[index].length, firstEmpty), 0);
  await sudoku.locator("#answerMode").click();
  const wrong = await sudoku.evaluate((index) => Number(window.__sudokuStudioTest.missions[0].solution[index]) % 9 + 1, firstEmpty);
  await sudoku.evaluate((value) => window.__sudokuStudioTest.input(value), wrong);
  assert.equal(await sudoku.evaluate(() => window.__sudokuStudioTest.getState().errors), 1);
  await sudoku.locator("#undo").click();
  assert.equal(await sudoku.evaluate(() => window.__sudokuStudioTest.getState().errors), 0);
  await sudoku.locator("#hint").click();
  assert.equal(await sudoku.evaluate(() => window.__sudokuStudioTest.getState().hints), 1);
  await sudoku.evaluate(() => window.__sudokuStudioTest.solveReference());
  await sudoku.locator("#result:not([hidden])").waitFor();
  assert.equal(await sudoku.locator("#resultStars").innerText(), "★★☆");
  const sudokuArchive = await sudoku.evaluate(() => window.__sudokuStudioTest.encodeSave());
  assert.equal(await sudoku.evaluate((code) => window.__sudokuStudioTest.decodeSave(code).stars.s1, sudokuArchive), 2);
  await assert.rejects(() => sudoku.evaluate((code) => window.__sudokuStudioTest.decodeSave(`${code}x`), sudokuArchive));
  await sudoku.screenshot({ path: path.join(outputDir, "sudoku-studio-v2-desktop.png"), fullPage: true });
  await sudoku.close();

  const hockey = await desktop.newPage();
  observe(hockey, "hockey-desktop");
  await open(hockey, "air-hockey.html", "__airHockeyTest");
  const hockeyValidation = await hockey.evaluate(() => window.__airHockeyTest.validateContent());
  assert.deepEqual({ ...hockeyValidation, maxFrames: 0 }, {
    matches: 12,
    paddles: 3,
    goals: 49,
    bumpers: 21,
    referenceWins: 12,
    maxFrames: 0,
  });
  assert.equal(hockeyValidation.maxFrames < 30_000, true, "hockey reference duration");
  await hockey.evaluate(() => window.__airHockeyTest.begin(0));
  await hockey.locator("#overlayButton").click();
  assert.equal(await hockey.evaluate(() => window.__airHockeyTest.getState().run), true);
  await hockey.evaluate(() => window.__airHockeyTest.forceFinish(3, 0, 20));
  await hockey.locator("#overlay:not([hidden])").waitFor();
  assert.equal(await hockey.evaluate(() => window.__airHockeyTest.getProfile().stars[0]), 3);
  assert.equal(await hockey.locator(".match").nth(1).isEnabled(), true);
  const hockeyArchive = await hockey.evaluate(() => window.__airHockeyTest.encodeProfile());
  assert.equal(await hockey.evaluate((code) => window.__airHockeyTest.decodeProfile(code).shutouts[0], hockeyArchive), true);
  await assert.rejects(() => hockey.evaluate((code) => window.__airHockeyTest.decodeProfile(`${code}x`), hockeyArchive));
  await hockey.locator("#overlayButton").click();
  await hockey.waitForTimeout(120);
  await assertCanvas(hockey, "air-hockey desktop");
  await hockey.screenshot({ path: path.join(outputDir, "air-hockey-v2-desktop.png"), fullPage: true });
  await hockey.close();

  const prism = await desktop.newPage();
  observe(prism, "prism-desktop");
  await open(prism, "prism-breaker.html", "__prismBreakerTest");
  const prismValidation = await prism.evaluate(() => window.__prismBreakerTest.validateContent());
  assert.equal(prismValidation.missions, 12);
  assert.equal(prismValidation.modules, 4);
  assert.equal(prismValidation.referenceWins, 12);
  assert.equal(prismValidation.maxFrames < 10_000, true, "prism reference duration");
  assert.equal(prismValidation.bricks > 300, true, "prism content volume");
  assert.equal(prismValidation.prisms > 50, true, "prism mechanics coverage");
  assert.equal(prismValidation.cores, 9);
  await prism.evaluate(() => window.__prismBreakerTest.begin(0));
  await prism.locator("#overlayButton").click();
  const actionMessage = await prism.evaluate(() => window.__prismBreakerTest.activate(window.__prismBreakerTest.getState()));
  assert.equal(actionMessage, "聚焦射线已发射");
  await prism.evaluate(() => window.__prismBreakerTest.forceFinish());
  await prism.locator("#overlay:not([hidden])").waitFor();
  assert.equal(await prism.evaluate(() => window.__prismBreakerTest.getProfile().stars[0]), 3);
  const prismArchive = await prism.evaluate(() => window.__prismBreakerTest.encodeProfile());
  assert.equal(await prism.evaluate((code) => window.__prismBreakerTest.decodeProfile(code).perfect[0], prismArchive), true);
  await assert.rejects(() => prism.evaluate((code) => window.__prismBreakerTest.decodeProfile(`${code}x`), prismArchive));
  await prism.locator("#overlayButton").click();
  await prism.waitForTimeout(120);
  await assertCanvas(prism, "prism-breaker desktop");
  await prism.screenshot({ path: path.join(outputDir, "prism-breaker-v2-desktop.png"), fullPage: true });
  await prism.close();
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  for (const [file, apiName, screenshot] of [
    ["sudoku-studio.html", "__sudokuStudioTest", "sudoku-studio-v2-mobile.png"],
    ["air-hockey.html", "__airHockeyTest", "air-hockey-v2-mobile.png"],
    ["prism-breaker.html", "__prismBreakerTest", "prism-breaker-v2-mobile.png"],
  ]) {
    const page = await mobile.newPage();
    observe(page, `${file}-mobile`);
    await open(page, file, apiName);
    if (file !== "sudoku-studio.html") {
      await page.evaluate((name) => window[name].begin(0), apiName);
      await page.locator("#overlayButton").click();
      await page.waitForTimeout(120);
      await assertCanvas(page, `${file} mobile`);
    }
    await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: true });
    await page.close();
  }
  await mobile.close();

  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    checks: "PASS",
    games: 3,
    missions: 36,
    sudokuUniqueSolutions: 12,
    hockeyReferenceWins: hockeyValidation.referenceWins,
    hockeyReferenceMaxFrames: hockeyValidation.maxFrames,
    prismReferenceWins: prismValidation.referenceWins,
    prismBricks: prismValidation.bricks,
    prismTargets: prismValidation.targets,
    desktopOverflow: false,
    mobileOverflow: false,
    screenshots: 6,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
