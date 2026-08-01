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
const port = 4219;
await mkdir(outputDir, { recursive: true });
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    if (pathname === "/favicon.ico") return response.writeHead(204).end();
    const target = path.resolve(rootDir, pathname.slice(1));
    if (!target.startsWith(rootDir + path.sep)) return response.writeHead(403).end("Forbidden");
    const info = await stat(target); if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); createReadStream(target).pipe(response);
  } catch { response.writeHead(404).end("Not found"); }
});
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
let browser;
const errors = [];
function observe(page, label) { page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`)); page.on("console", (message) => { if (message.type() === "error") errors.push(`${label}: ${message.text()}`); }); }
async function assertLayout(page, label) {
  const layout = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, textLength: document.body.innerText.replace(/\s+/g, "").length, controlsFit: [...document.querySelectorAll("h1,h2,button")].every((element) => { const rect = element.getBoundingClientRect(); return rect.left >= -4 && rect.right <= document.documentElement.clientWidth + 4; }), outside: [...document.querySelectorAll("body *")].filter((element) => { const rect = element.getBoundingClientRect(); return rect.right > document.documentElement.clientWidth + 4 || rect.left < -4; }).slice(0, 8).map((element) => ({ tag: element.tagName, id: element.id, className: element.className, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })) }));
  assert.equal(layout.scrollWidth <= layout.clientWidth + 4, true, `${label} horizontal overflow: ${JSON.stringify(layout.outside)}`); assert.equal(layout.controlsFit, true, `${label} controls fit viewport`); assert.equal(layout.textLength > 110, true, `${label} rendered content`);
}
async function assertCanvas(page, label) {
  const pixels = await page.locator("#gameCanvas").evaluate((canvas) => { const context = canvas.getContext("2d"), colors = new Set(); let opaque = 0; for (let y = 0; y < canvas.height; y += Math.max(1, Math.floor(canvas.height / 19))) for (let x = 0; x < canvas.width; x += Math.max(1, Math.floor(canvas.width / 21))) { const data = context.getImageData(x, y, 1, 1).data; if (data[3]) opaque += 1; colors.add(`${data[0]},${data[1]},${data[2]},${data[3]}`); } return { opaque, colors: colors.size }; });
  assert.equal(pixels.opaque > 300, true, `${label} canvas is nonblank`); assert.equal(pixels.colors >= 10, true, `${label} canvas has rendered detail`);
}
async function open(page, label) { const response = await page.goto(`http://127.0.0.1:${port}/forest-dash.html`, { waitUntil: "load" }); assert.equal(response?.status(), 200); await page.waitForFunction(() => Boolean(window.__forestDashTest)); await assertLayout(page, label); await assertCanvas(page, label); }
try {
  try { browser = await chromium.launch({ channel: "msedge", headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
  const desktop = await browser.newContext({ viewport: { width: 1365, height: 900 } }); const page = await desktop.newPage(); observe(page, "forest-desktop"); await open(page, "forest desktop");
  const content = await page.evaluate(() => window.__forestDashTest.validateContent());
  assert.deepEqual({ routes: content.routes, chapters: content.chapters, runners: content.runners, uniqueSeeds: content.uniqueSeeds }, { routes: 12, chapters: 4, runners: 3, uniqueSeeds: 12 }); assert.equal(content.totalMeters >= 8000, true); assert.equal(content.targetCoins >= 250, true);
  const references = await page.evaluate(() => window.__forestDashTest.routes.map((_, index) => window.__forestDashTest.runReferenceRoute(index)));
  assert.equal(references.every((result) => result.won), true, `reference failures: ${JSON.stringify(references.filter((result) => !result.won))}`); assert.equal(references.every((result) => result.stars === 3), true, `reference star failures: ${JSON.stringify(references.filter((result) => result.stars < 3))}`); assert.equal(references.every((result) => result.savedHits === 0), true, `reference collisions: ${JSON.stringify(references.filter((result) => result.savedHits > 0))}`);
  const archive = await page.evaluate(() => { const test = window.__forestDashTest, profile = test.freshProfile(); profile.route = 8; profile.runner = "fox"; profile.stars[0] = 3; profile.bestTimes[0] = 14.2; profile.bestScores[0] = 4200; profile.totalCoins = 123; return test.encodeArchive(profile); }); assert.equal(archive.startsWith("DASH2."), true); const restored = await page.evaluate((code) => window.__forestDashTest.decodeArchive(code), archive); assert.equal(restored.route, 8); assert.equal(restored.runner, "fox"); assert.equal(restored.stars[0], 3); assert.equal(restored.totalCoins, 123); await assert.rejects(() => page.evaluate((code) => window.__forestDashTest.decodeArchive(`${code}x`), archive));
  const deterministic = await page.evaluate(() => { const test = window.__forestDashTest; function sample() { test.begin(5, "cub", { testing: true }); for (let index = 0; index < 180; index += 1) test.step(1 / 60); const state = test.snapshot(); return { distance: state.distance, obstacles: state.obstacles, powers: state.powers }; } return { first: sample(), second: sample() }; }); assert.deepEqual(deterministic.first, deterministic.second, "fixed route events are reproducible");
  await page.reload({ waitUntil: "load" }); await page.waitForFunction(() => Boolean(window.__forestDashTest)); await page.locator("#routeButton").click(); assert.equal(await page.locator("[data-route]").count(), 12); assert.equal(await page.locator("[data-skin]").count(), 3); await page.locator("[data-close='routeDialog']").click(); await page.locator("#startButton").click(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowUp"); await page.waitForTimeout(220); const interaction = await page.evaluate(() => window.__forestDashTest.snapshot()); assert.equal(interaction.state, "running"); assert.equal(interaction.lane, 1); assert.equal(interaction.jumpY > 0, true); await page.locator("#downButton").dispatchEvent("pointerdown"); assert.equal((await page.evaluate(() => window.__forestDashTest.snapshot())).slide > 0, true); await assertCanvas(page, "forest desktop after controls"); await page.screenshot({ path: path.join(outputDir, "forest-dash-v3-desktop.png"), fullPage: true }); await page.close(); await desktop.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const phone = await mobile.newPage(); observe(phone, "forest-mobile"); await open(phone, "forest mobile"); await phone.locator("#startButton").tap(); await phone.locator("#leftButton").dispatchEvent("pointerdown"); await phone.locator("#jumpButton").dispatchEvent("pointerdown"); await phone.waitForTimeout(180); const mobileState = await phone.evaluate(() => window.__forestDashTest.snapshot()); assert.equal(mobileState.lane, -1); assert.equal(mobileState.jumpY > 0, true); await phone.locator("#pauseTop").tap(); await phone.locator("#resumeButton").tap(); await assertLayout(phone, "forest mobile after controls"); await assertCanvas(phone, "forest mobile after controls"); await phone.screenshot({ path: path.join(outputDir, "forest-dash-v3-mobile.png"), fullPage: true }); await phone.close(); await mobile.close();
  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ checks: "PASS", games: 1, routes: content.routes, chapters: content.chapters, runners: content.runners, totalMeters: content.totalMeters, targetCoins: content.targetCoins, referenceWins: references.filter((result) => result.won).length, referenceThreeStars: references.filter((result) => result.stars === 3).length, referenceCoins: references.reduce((sum, result) => sum + result.coins, 0), screenshots: 2, references }, null, 2));
} finally { if (browser) await browser.close(); server.close(); }
