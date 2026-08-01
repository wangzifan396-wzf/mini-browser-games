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
const port = 4217;
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
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${label}: ${message.text()}`); });
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
    outside: [...document.querySelectorAll("body *")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.right > document.documentElement.clientWidth + 4 || rect.left < -4;
    }).slice(0, 8).map((element) => ({ tag: element.tagName, id: element.id, className: element.className, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })),
  }));
  assert.equal(layout.scrollWidth <= layout.clientWidth + 4, true, `${label} horizontal overflow: ${JSON.stringify(layout.outside)}`);
  assert.equal(layout.controlsFit, true, `${label} controls fit viewport`);
  assert.equal(layout.textLength > 100, true, `${label} rendered content`);
}
async function assertCanvas(page, label) {
  const pixels = await page.locator("#gameCanvas").evaluate((canvas) => {
    const context = canvas.getContext("2d");
    const colors = new Set();
    let opaque = 0;
    for (let y = 0; y < canvas.height; y += Math.max(1, Math.floor(canvas.height / 19))) {
      for (let x = 0; x < canvas.width; x += Math.max(1, Math.floor(canvas.width / 21))) {
        const data = context.getImageData(x, y, 1, 1).data;
        if (data[3]) opaque += 1;
        colors.add(`${data[0]},${data[1]},${data[2]},${data[3]}`);
      }
    }
    return { opaque, colors: colors.size };
  });
  assert.equal(pixels.opaque > 300, true, `${label} canvas is nonblank`);
  assert.equal(pixels.colors >= 8, true, `${label} canvas has rendered detail`);
}
async function open(page, label) {
  const response = await page.goto(`http://127.0.0.1:${port}/sokoban-quest.html`, { waitUntil: "load" });
  assert.equal(response?.status(), 200, `${label} response`);
  await page.waitForFunction(() => Boolean(window.__sokobanQuestTest));
  await assertLayout(page, label);
  await assertCanvas(page, label);
}

try {
  try { browser = await chromium.launch({ channel: "msedge", headless: true }); }
  catch { browser = await chromium.launch({ headless: true }); }

  const desktop = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await desktop.newPage();
  observe(page, "sokoban-desktop");
  await open(page, "sokoban desktop");

  const content = await page.evaluate(() => window.__sokobanQuestTest.validateContent());
  assert.equal(content.levels, 12);
  assert.equal(content.chapters, 4);
  assert.equal(content.uniqueIds, 12);
  assert.equal(content.boxes >= 27, true, "campaign has enough crate objectives");
  assert.equal(content.results.every((result) => result.moves > 0 && result.pushes > 0), true, `invalid reference metrics: ${JSON.stringify(content.results)}`);

  const references = await page.evaluate(() => window.__sokobanQuestTest.levels.map((_, index) => window.__sokobanQuestTest.runReferenceLevel(index)));
  assert.equal(references.every((result) => result.won), true, `reference failures: ${JSON.stringify(references.filter((result) => !result.won))}`);
  assert.equal(references.every((result) => result.stars === 3), true, `reference star failures: ${JSON.stringify(references.filter((result) => result.stars < 3))}`);
  assert.equal(new Set(references.map((result) => result.route)).size, 12, "all warehouses have distinct reference routes");

  const archive = await page.evaluate(() => {
    const test = window.__sokobanQuestTest;
    const profile = test.freshProfile();
    profile.level = 6; profile.stars[0] = 3; profile.bestMoves[0] = 12; profile.bestPushes[0] = 4; profile.clears[0] = 2;
    return test.encodeArchive(profile);
  });
  assert.equal(archive.startsWith("SOKO2."), true);
  const restored = await page.evaluate((code) => window.__sokobanQuestTest.decodeArchive(code), archive);
  assert.equal(restored.level, 6); assert.equal(restored.stars[0], 3); assert.equal(restored.bestMoves[0], 12); assert.equal(restored.clears[0], 2);
  await assert.rejects(() => page.evaluate((code) => window.__sokobanQuestTest.decodeArchive(`${code}x`), archive));

  const stateFlow = await page.evaluate(() => {
    const test = window.__sokobanQuestTest;
    test.begin(0, { testing: true });
    const before = test.getState();
    test.move("R");
    const after = test.getState();
    test.undo();
    const undone = test.getState();
    return { before, after, undone };
  });
  assert.equal(stateFlow.after.complete, true, "real transition solves first warehouse");
  assert.equal(stateFlow.after.pushes, 1);
  assert.deepEqual(stateFlow.undone.boxes, stateFlow.before.boxes, "undo restores crate positions");
  assert.equal(stateFlow.undone.moves, 0);

  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__sokobanQuestTest));
  await page.locator("#levelButton").click();
  assert.equal(await page.locator("[data-level]").count(), 12);
  await page.locator("[data-close='levelDialog']").click();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);
  assert.equal(await page.locator("#resultDialog").getAttribute("open") !== null, true, "keyboard movement reaches result screen");
  await page.screenshot({ path: path.join(outputDir, "sokoban-quest-v2-desktop.png"), fullPage: true });
  await page.close(); await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const phone = await mobile.newPage();
  observe(phone, "sokoban-mobile");
  await open(phone, "sokoban mobile");
  await phone.evaluate(() => { localStorage.clear(); location.reload(); });
  await phone.waitForFunction(() => Boolean(window.__sokobanQuestTest));
  await phone.locator("[data-dir='R']").tap();
  await phone.waitForTimeout(250);
  assert.equal(await phone.locator("#resultDialog").getAttribute("open") !== null, true, "touch direction solves first warehouse");
  await phone.locator("#retryResult").tap();
  await phone.locator("#hintButton").tap();
  await phone.waitForFunction(() => document.getElementById("hintLine").textContent.includes("建议"));
  assert.equal((await phone.locator("#hintLine").textContent()).includes("向右"), true, "solver offers visible next move");
  await assertLayout(phone, "sokoban mobile after interaction");
  await assertCanvas(phone, "sokoban mobile after interaction");
  await phone.screenshot({ path: path.join(outputDir, "sokoban-quest-v2-mobile.png"), fullPage: true });
  await phone.close(); await mobile.close();

  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ checks: "PASS", games: 1, levels: content.levels, chapters: content.chapters, boxes: content.boxes, referenceWins: references.filter((result) => result.won).length, referenceThreeStars: references.filter((result) => result.stars === 3).length, totalReferenceMoves: references.reduce((sum, result) => sum + result.moves, 0), totalReferencePushes: references.reduce((sum, result) => sum + result.pushes, 0), screenshots: 2, references }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
