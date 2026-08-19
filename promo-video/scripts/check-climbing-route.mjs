import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const out = path.join(root, "output", "climbing-route");
const port = 4251;
const errors = [];
await mkdir(out, { recursive: true });
const server = http.createServer(async (request, response) => {
  try { const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname), file = path.resolve(root, pathname.slice(1)); if (pathname === "/favicon.ico") return response.writeHead(204).end(); if (!file.startsWith(root + path.sep) || !(await stat(file)).isFile()) throw new Error("missing"); response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); createReadStream(file).pipe(response); } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
function observe(page, label) { page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`)); page.on("console", (m) => { if (m.type() === "error") errors.push(`${label}: ${m.text()}`); }); }
async function noOverflow(page, label) { const sizes = await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]); assert.ok(sizes[1] <= sizes[0] + 4, `${label} overflow`); }
async function open(page, label) { const response = await page.goto(`http://127.0.0.1:${port}/climbing-route.html`, { waitUntil: "load" }); assert.equal(response?.status(), 200); await page.waitForFunction(() => Boolean(window.__climbingRoute)); await noOverflow(page, label); }
async function clickReference(page) { await page.locator("#clearBtn").click(); const ref = await page.evaluate(() => window.__climbingRoute.WALLS[0].reference); const box = await page.locator("canvas").boundingBox(); assert.ok(box); for (const id of ref) { const h = await page.evaluate((v) => window.__climbingRoute.WALLS[0].holds[v], id); await page.locator("canvas").click({ position: { x: (120 + h.c * 128) * box.width / 960, y: (465 - h.r * 52) * box.height / 520 } }); } }
let browser;
try {
  try { browser = await chromium.launch({ channel: "msedge", headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 950 } }); const page = await desktop.newPage(); observe(page, "climb-desktop"); await open(page, "desktop");
  const content = await page.evaluate(() => window.__climbingRoute.validateContent()); assert.equal(content.valid, true, content.errors.join(" | ")); assert.equal(content.walls, 12); assert.equal(content.checks, 24); assert.ok(content.holds >= 200); assert.equal(content.references.filter((x) => x.stars === 3).length, 12);
  await page.locator('[data-wall="0"]').click(); await clickReference(page); await page.locator("#submitBtn").click(); await page.locator("#infoOverlay").waitFor({ state: "visible" }); assert.equal(await page.evaluate(() => window.__climbingRoute.profile().stars[0]), 3); await page.locator("#closeInfoBtn").click();
  await page.evaluate(() => window.__climbingRoute.start(1)); await page.locator("#hintBtn").click(); await page.locator("#submitBtn").click(); await page.locator("#infoOverlay").waitFor({ state: "visible" }); assert.equal(await page.evaluate(() => window.__climbingRoute.profile().stars[1]), 2); await page.locator("#closeInfoBtn").click();
  const code = await page.evaluate(() => window.__climbingRoute.encode()); assert.match(code, /^CLIMB1\./); assert.equal(await page.evaluate((v) => window.__climbingRoute.decode(v).profile.stars[0], code), 3); await assert.rejects(() => page.evaluate((v) => window.__climbingRoute.decode(`${v}x`), code));
  const signal = await page.evaluate(() => { const c = document.querySelector("canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, colors = new Set(); let alpha = 0; for (let i = 0; i < d.length; i += 900) { alpha += d[i + 3]; colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`); } return [alpha, colors.size, c.getBoundingClientRect().width]; }); assert.ok(signal[0] > 0 && signal[1] > 7 && signal[2] > 700); await noOverflow(page, "desktop final"); await page.screenshot({ path: path.join(out, "climbing-desktop.png"), fullPage: true }); await desktop.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const phone = await mobile.newPage(); observe(phone, "climb-mobile"); await open(phone, "mobile"); await phone.locator('[data-wall="0"]').tap(); await phone.locator("#clearBtn").tap(); const start = await phone.evaluate(() => window.__climbingRoute.WALLS[0].reference[0]); const h = await phone.evaluate((v) => window.__climbingRoute.WALLS[0].holds[v], start); const box = await phone.locator("canvas").boundingBox(); await phone.locator("canvas").tap({ position: { x: (120 + h.c * 128) * box.width / 960, y: (465 - h.r * 52) * box.height / 520 } }); assert.equal(await phone.evaluate(() => window.__climbingRoute.state().route.length), 1); await phone.locator("#undoBtn").tap(); assert.equal(await phone.evaluate(() => window.__climbingRoute.state().route.length), 0); await noOverflow(phone, "mobile final"); await phone.screenshot({ path: path.join(out, "climbing-mobile.png"), fullPage: true }); await mobile.close();
  assert.deepEqual(errors, []); console.log(JSON.stringify({ checks: "PASS", games: 1, walls: content.walls, holds: content.holds, checksTotal: content.checks, referenceStars: 12, screenshots: 2 }, null, 2));
} finally { if (browser) await browser.close(); server.close(); }
