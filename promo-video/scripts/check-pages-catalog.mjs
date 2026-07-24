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
const port = 4194;
await mkdir(outputDir, { recursive: true });

const mime = {
  ".html": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const target = path.resolve(rootDir, relative);
    if (!target.startsWith(rootDir + path.sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(target);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "content-type": mime[path.extname(target)] || "application/octet-stream",
      "cache-control": "no-store",
    });
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

async function noOverflow(page) {
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

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  observe(desktop, "desktop");
  await desktop.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await desktop.waitForSelector(".game-card");
  assert.equal(await desktop.locator(".game-card").count(), 100, "catalog game count");
  assert.equal(await desktop.locator("#totalStat").innerText(), "100");
  assert.equal(await desktop.locator(".category").count(), 100);
  assert.equal(await desktop.locator(".play").count(), 100);
  const links = await desktop.locator(".play").evaluateAll((nodes) => nodes.map((node) => node.href));
  assert.equal(new Set(links).size, 100, "unique Pages game links");
  assert.equal(links.every((link) => /^https:\/\/wangzifan396-wzf\.github\.io\/mini-browser-games\/.+\.html$/.test(link)), true);
  await desktop.locator('[data-grade="S"]').click();
  assert.equal(await desktop.locator(".game-card").count(), 13, "S grade filter");
  await desktop.locator('[data-grade="all"]').click();
  await desktop.locator("#searchInput").fill("钟楼密室");
  assert.equal(await desktop.locator(".game-card").count(), 1, "search filter");
  assert.match(await desktop.locator(".game-card h3").innerText(), /钟楼密室/);
  await desktop.locator("#searchInput").fill("");
  assert.equal(await noOverflow(desktop), true);
  await desktop.screenshot({ path: path.join(outputDir, "pages-catalog-desktop.png"), fullPage: true });
  await desktop.close();

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  observe(mobile, "mobile");
  await mobile.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await mobile.waitForSelector(".game-card");
  assert.equal(await mobile.locator(".game-card").count(), 100);
  assert.equal(await noOverflow(mobile), true);
  await mobile.locator("#searchInput").fill("信标车队");
  assert.equal(await mobile.locator(".game-card").count(), 1);
  await mobile.screenshot({ path: path.join(outputDir, "pages-catalog-mobile.png"), fullPage: true });
  await mobile.close();

  assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({
    checks: "PASS",
    games: 100,
    uniquePagesLinks: 100,
    desktopOverflow: false,
    mobileOverflow: false,
    screenshots: ["output/pages-catalog-desktop.png", "output/pages-catalog-mobile.png"],
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
