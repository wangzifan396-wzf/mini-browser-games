import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output", "gem-garden");
const port = 4198;
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
      "cache-control": "no-store",
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
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 4, `${label} horizontal overflow: ${overflow}px`);
}

async function canvasSignal(page) {
  return page.locator("#gameCanvas").evaluate((canvas) => {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0;
    const colors = new Set();
    const stride = Math.max(4, Math.floor((canvas.width * canvas.height) / 7000) * 4);
    for (let index = 0; index < pixels.length; index += stride) {
      if (pixels[index + 3] > 0) {
        opaque++;
        colors.add(`${pixels[index] >> 4},${pixels[index + 1] >> 4},${pixels[index + 2] >> 4}`);
      }
    }
    return { opaque, colors: colors.size };
  });
}

async function boardMove(page, drag = false) {
  const data = await page.evaluate(() => ({
    move: window.__gemGarden.suggestMove(),
    rect: window.__gemGarden.boardRect(),
    moves: window.__gemGarden.state().moves,
  }));
  assert.ok(data.move, "board has a legal move");
  const box = await page.locator("#gameCanvas").boundingBox();
  assert.ok(box, "canvas has bounds");
  const center = (cell) => ({
    x: box.x + data.rect.x + (cell.x + 0.5) * data.rect.cell,
    y: box.y + data.rect.y + (cell.y + 0.5) * data.rect.cell,
  });
  const from = center(data.move[0]);
  const to = center(data.move[1]);
  if (drag) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
  } else {
    await page.mouse.click(from.x, from.y);
    await page.mouse.click(to.x, to.y);
  }
  await page.waitForTimeout(220);
  return data.moves;
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
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 940 }, colorScheme: "dark" });
  const page = await desktop.newPage();
  observe(page);
  await page.goto(`http://127.0.0.1:${port}/gem-garden.html`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__gemGarden));

  const validation = await page.evaluate(() => window.__gemGarden.validateContent());
  console.log("validation", JSON.stringify(validation));
  assert.deepEqual(
    validation,
    { valid: true, errors: [], missions: 12, seasons: 4, gardeners: 3, charms: 6, patterns: 8, references: 12 },
    "garden content contract",
  );
  assert.equal(
    await page.evaluate(() => {
      const a = window.__gemGarden.makeGame(7, { gardener: "dew", charms: [] });
      const b = window.__gemGarden.makeGame(7, { gardener: "dew", charms: [] });
      return window.__gemGarden.boardSignature(a) === window.__gemGarden.boardSignature(b);
    }),
    true,
    "boards and refill state start deterministically",
  );
  assert.equal(
    await page.evaluate(() => Array.from({ length: 12 }, (_, index) => window.__gemGarden.simulateReference(index)).every((result) => result.ok && result.stars === 3)),
    true,
    "all garden references earn three stars",
  );

  await page.locator('[data-gardener="craft"]').click();
  assert.equal(await page.evaluate(() => window.__gemGarden.profile().gardener), "craft", "real gardener selection");
  await page.locator("#overlayStart").click();
  const movesBefore = await boardMove(page);
  assert.equal(await page.evaluate(() => window.__gemGarden.state().moves), movesBefore - 1, "real board swap spends one move");

  const hammerBefore = await page.evaluate(() => window.__gemGarden.state().hammers);
  await page.locator("#hammerBtn").click();
  const bed = await page.evaluate(() => {
    const state = window.__gemGarden.state();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (state.soil[y][x] > 0) return { x, y };
    return { x: 0, y: 0 };
  });
  const rect = await page.evaluate(() => window.__gemGarden.boardRect());
  await page.locator("#gameCanvas").click({ position: {
    x: rect.x + (bed.x + 0.5) * rect.cell,
    y: rect.y + (bed.y + 0.5) * rect.cell,
  }});
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(() => window.__gemGarden.state().hammers), hammerBefore - 1, "real hammer tool is consumed");

  const reference = await page.evaluate(() => window.__gemGarden.applyReference(0));
  assert.equal(reference.stars, 3, "displayed reference result earns three stars");
  assert.equal(await page.evaluate(() => window.__gemGarden.profile().unlocked >= 1), true, "garden clear unlocks next commission");
  const archive = await page.evaluate(() => window.__gemGarden.encode());
  assert.match(archive, /^GARDEN2\./, "archive prefix");
  assert.equal(await page.evaluate((code) => window.__gemGarden.decode(code).stars.length, archive), 12, "archive round trip");
  await assert.rejects(
    page.evaluate((code) => window.__gemGarden.decode(`${code}x`), archive),
    /园圃档案校验失败/,
    "archive detects tampering",
  );
  let signal = await canvasSignal(page);
  assert.ok(signal.opaque > 1000 && signal.colors >= 8, `desktop canvas signal ${JSON.stringify(signal)}`);
  await noOverflow(page, "desktop");
  await page.screenshot({ path: path.join(outputDir, "desktop.png"), fullPage: true });
  assert.deepEqual(failures, [], "desktop browser errors");
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const mobilePage = await mobile.newPage();
  observe(mobilePage);
  await mobilePage.goto(`http://127.0.0.1:${port}/gem-garden.html`, { waitUntil: "load" });
  await mobilePage.waitForFunction(() => Boolean(window.__gemGarden));
  await mobilePage.locator("#overlayStart").tap();
  const mobileMoves = await boardMove(mobilePage, true);
  assert.equal(await mobilePage.evaluate(() => window.__gemGarden.state().moves), mobileMoves - 1, "mobile drag performs swap");
  signal = await canvasSignal(mobilePage);
  assert.ok(signal.opaque > 1000 && signal.colors >= 8, `mobile canvas signal ${JSON.stringify(signal)}`);
  await noOverflow(mobilePage, "mobile");
  await mobilePage.screenshot({ path: path.join(outputDir, "mobile.png"), fullPage: true });
  assert.deepEqual(failures, [], "mobile browser errors");
  await mobile.close();

  console.log(JSON.stringify({ missions: 12, seasons: 4, gardeners: 3, charms: 6, archive: "GARDEN2", failures }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
