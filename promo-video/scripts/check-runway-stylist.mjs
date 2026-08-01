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
const port = 4218;
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
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, textLength: document.body.innerText.replace(/\s+/g, "").length,
    controlsFit: [...document.querySelectorAll("h1,h2,button")].every((element) => { const rect = element.getBoundingClientRect(); return rect.left >= -4 && rect.right <= document.documentElement.clientWidth + 4; }),
    outside: [...document.querySelectorAll("body *")].filter((element) => { const rect = element.getBoundingClientRect(); return rect.right > document.documentElement.clientWidth + 4 || rect.left < -4; }).slice(0, 8).map((element) => ({ tag: element.tagName, id: element.id, className: element.className, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })),
  }));
  assert.equal(layout.scrollWidth <= layout.clientWidth + 4, true, `${label} horizontal overflow: ${JSON.stringify(layout.outside)}`);
  assert.equal(layout.controlsFit, true, `${label} controls fit viewport`); assert.equal(layout.textLength > 150, true, `${label} rendered content`);
}
async function assertCanvas(page, label) {
  const pixels = await page.locator("#lookCanvas").evaluate((canvas) => { const context = canvas.getContext("2d"), colors = new Set(); let opaque = 0; for (let y = 0; y < canvas.height; y += Math.max(1, Math.floor(canvas.height / 19))) for (let x = 0; x < canvas.width; x += Math.max(1, Math.floor(canvas.width / 21))) { const data = context.getImageData(x, y, 1, 1).data; if (data[3]) opaque += 1; colors.add(`${data[0]},${data[1]},${data[2]},${data[3]}`); } return { opaque, colors: colors.size }; });
  assert.equal(pixels.opaque > 300, true, `${label} canvas is nonblank`); assert.equal(pixels.colors >= 8, true, `${label} canvas has rendered detail`);
}
async function open(page, label) { const response = await page.goto(`http://127.0.0.1:${port}/runway-stylist.html`, { waitUntil: "load" }); assert.equal(response?.status(), 200); await page.waitForFunction(() => Boolean(window.__runwayStylistTest)); await assertLayout(page, label); await assertCanvas(page, label); }
async function selectReferenceWithClicks(page) {
  const refs = await page.evaluate(() => window.__runwayStylistTest.briefs[0].reference.map((id) => { const item = window.__runwayStylistTest.items.find((entry) => entry.id === id); return { id, slot: item.slot }; }));
  for (const { id, slot } of refs) { await page.locator(`[data-slot='${slot}']`).click(); await page.locator(`[data-item='${id}']`).click(); }
}
try {
  try { browser = await chromium.launch({ channel: "msedge", headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
  const desktop = await browser.newContext({ viewport: { width: 1365, height: 900 } }); const page = await desktop.newPage(); observe(page, "stylist-desktop"); await open(page, "stylist desktop");
  const content = await page.evaluate(() => window.__runwayStylistTest.validateContent());
  assert.deepEqual({ briefs: content.briefs, chapters: content.chapters, items: content.items, slots: content.slots }, { briefs: 12, chapters: 4, items: 40, slots: 5 });
  assert.equal(content.styles >= 10, true); assert.equal(content.materials >= 12, true); assert.equal(content.references.every((reference) => reference.score === 100 && reference.cost <= reference.budget), true);
  const references = await page.evaluate(() => window.__runwayStylistTest.briefs.map((_, index) => window.__runwayStylistTest.runReferenceBrief(index)));
  assert.equal(references.every((result) => result.passed && result.stars === 3 && result.score === 100), true, `reference failures: ${JSON.stringify(references.filter((result) => !result.passed || result.stars < 3))}`);
  const comparison = await page.evaluate(() => { const test = window.__runwayStylistTest, brief = test.briefs[0], reference = Object.fromEntries(brief.reference.map((id) => { const item = test.items.find((entry) => entry.id === id); return [item.slot, id]; })); return { reference: test.evaluate(reference, 0), mismatch: test.evaluate({ ...reference, top: "neon-tee" }, 0) }; });
  assert.equal(comparison.reference.score, 100); assert.equal(comparison.mismatch.score < comparison.reference.score, true, "off-brief piece loses explainable points"); assert.equal(comparison.mismatch.palette < comparison.reference.palette, true);
  const archive = await page.evaluate(() => { const test = window.__runwayStylistTest, profile = test.freshProfile(); profile.issue = 7; profile.stars[0] = 3; profile.bestScores[0] = 100; profile.bestCosts[0] = 145; profile.clears[0] = 2; return test.encodeArchive(profile); });
  assert.equal(archive.startsWith("STYLE2."), true); const restored = await page.evaluate((code) => window.__runwayStylistTest.decodeArchive(code), archive); assert.equal(restored.issue, 7); assert.equal(restored.stars[0], 3); assert.equal(restored.bestScores[0], 100); assert.equal(restored.clears[0], 2); await assert.rejects(() => page.evaluate((code) => window.__runwayStylistTest.decodeArchive(`${code}x`), archive));
  await page.reload({ waitUntil: "load" }); await page.waitForFunction(() => Boolean(window.__runwayStylistTest)); await page.locator("#issueButton").click(); assert.equal(await page.locator("[data-issue]").count(), 12); await page.locator("[data-close='issueDialog']").click();
  await selectReferenceWithClicks(page); assert.equal(await page.locator("#scoreText").textContent(), "100"); await page.locator("#submitButton").click(); assert.equal(await page.locator("#resultDialog").getAttribute("open") !== null, true); assert.match(await page.locator("#resultScore").textContent(), /100 分/); await page.screenshot({ path: path.join(outputDir, "runway-stylist-v2-desktop.png"), fullPage: true }); await page.close(); await desktop.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const phone = await mobile.newPage(); observe(phone, "stylist-mobile"); await open(phone, "stylist mobile"); await phone.evaluate(() => { localStorage.clear(); location.reload(); }); await phone.waitForFunction(() => Boolean(window.__runwayStylistTest)); await phone.locator("#hintButton").tap(); assert.match(await phone.locator("#hintLine").textContent(), /主编建议/); assert.equal((await phone.locator("#selectionText").textContent()).includes("提示 1"), true); await selectReferenceWithClicks(phone); await phone.locator("#submitButton").tap(); assert.equal(await phone.locator("#resultDialog").getAttribute("open") !== null, true); assert.match(await phone.locator("#resultStars").textContent(), /★★☆/); await phone.locator("#retryResult").tap(); await assertLayout(phone, "stylist mobile after interaction"); await assertCanvas(phone, "stylist mobile after interaction"); await phone.screenshot({ path: path.join(outputDir, "runway-stylist-v2-mobile.png"), fullPage: true }); await phone.close(); await mobile.close();
  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ checks: "PASS", games: 1, briefs: content.briefs, chapters: content.chapters, items: content.items, slots: content.slots, styles: content.styles, materials: content.materials, referencePasses: references.filter((result) => result.passed).length, referenceThreeStars: references.filter((result) => result.stars === 3).length, averageReferenceCost: Math.round(references.reduce((sum, result) => sum + result.cost, 0) / references.length), screenshots: 2, references }, null, 2));
} finally { if (browser) await browser.close(); server.close(); }
