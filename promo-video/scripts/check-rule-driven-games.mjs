import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output", "rule-driven-games");
const port = 4184;
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

async function canvasSignal(page, selector) {
  return page.locator(selector).evaluate((canvas) => {
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let opaque = 0;
    const stride = Math.max(4, Math.floor(data.length / 2500 / 4) * 4);
    for (let index = 0; index < data.length; index += stride) {
      if (data[index + 3] > 0) opaque += 1;
      colors.add(`${data[index] >> 4}:${data[index + 1] >> 4}:${data[index + 2] >> 4}`);
    }
    return { opaque, colors: colors.size };
  });
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
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark"
  });

  const bytebot = await desktop.newPage();
  observe(bytebot);
  await bytebot.goto(`http://127.0.0.1:${port}/bytebot-lab.html`, { waitUntil: "load" });
  await bytebot.waitForFunction(() => Boolean(window.__bytebotTest));
  const byteValidation = await bytebot.evaluate(() => window.__bytebotTest.validateLevels());
  assert.equal(byteValidation.length, 12, "bytebot has twelve missions");
  assert.equal(byteValidation.every((item) => item.valid), true, "every reference program solves its mission");
  assert.equal(
    await bytebot.evaluate(() => window.__bytebotTest.levels.every((level, index) => window.__bytebotTest.simulate(index, level.solution).won)),
    true,
    "bytebot interpreter accepts every published solution"
  );
  for (let index = 0; index < 4; index++) await bytebot.locator('[data-command="F"]').click();
  await bytebot.locator("#runBtn").click();
  await bytebot.waitForFunction(() => window.__bytebotTest.getProfile().stars[0] === 3);
  assert.equal(await bytebot.evaluate(() => window.__bytebotTest.getProfile().stars[0]), 3, "real program run awards three stars");
  const byteCode = await bytebot.evaluate(() => window.__bytebotTest.encodeProfile());
  assert.match(byteCode, /^BYTE2\./, "bytebot archive prefix");
  assert.equal(
    await bytebot.evaluate((code) => window.__bytebotTest.decodeProfile(code).stars[0], byteCode),
    3,
    "bytebot archive round trip"
  );
  assert.equal(
    await bytebot.evaluate((code) => window.__bytebotTest.decodeProfile(code).bestTokens[1], byteCode),
    null,
    "bytebot archive keeps unfinished best records empty"
  );
  let signal = await canvasSignal(bytebot, "#board");
  assert.ok(signal.opaque > 30 && signal.colors > 6, "bytebot canvas renders varied pixels");
  await noOverflow(bytebot, "bytebot desktop");
  await bytebot.screenshot({ path: path.join(outputDir, "bytebot-desktop.png"), fullPage: true });

  const checkpoint = await desktop.newPage();
  observe(checkpoint);
  await checkpoint.goto(`http://127.0.0.1:${port}/checkpoint-inspector.html`, { waitUntil: "load" });
  await checkpoint.waitForFunction(() => Boolean(window.__checkpointTest));
  const caseValidation = await checkpoint.evaluate(() => window.__checkpointTest.validateCases());
  assert.deepEqual(caseValidation, { valid: true, errors: [], days: 6, cases: 30 }, "checkpoint case audit");
  assert.equal(
    await checkpoint.evaluate(() => window.__checkpointTest.rules.every((_, day) =>
      Array.from({ length: 5 }, (_, slot) => window.__checkpointTest.makeCase(day, slot))
        .every((item) => item.allowed === (item.reasons.length === 0))
    )),
    true,
    "checkpoint decisions and reasons agree"
  );
  for (let slot = 0; slot < 5; slot++) {
    const allowed = await checkpoint.evaluate((index) => window.__checkpointTest.makeCase(0, index).allowed, slot);
    await checkpoint.locator(allowed ? "#approveBtn" : "#denyBtn").click();
    await checkpoint.locator("#nextBtn").click();
  }
  const checkpointProfile = await checkpoint.evaluate(() => window.__checkpointTest.getProfile());
  assert.equal(checkpointProfile.stars[0], 3, "five correct decisions award three stars");
  assert.equal(checkpointProfile.days[0], 5, "day result unlocks the next shift");
  await checkpoint.locator('[data-day="1"]').click();
  assert.equal(await checkpoint.locator("#result").innerText(), "请对照左侧规则和两份证件做出裁定。", "checkpoint shift resets result feedback");
  const checkpointCode = await checkpoint.evaluate(() => window.__checkpointTest.encodeProfile());
  assert.match(checkpointCode, /^CHECK2\./, "checkpoint archive prefix");
  assert.equal(
    await checkpoint.evaluate((code) => window.__checkpointTest.decodeProfile(code).best[0], checkpointCode),
    5,
    "checkpoint archive round trip"
  );
  await noOverflow(checkpoint, "checkpoint desktop");
  await checkpoint.screenshot({ path: path.join(outputDir, "checkpoint-desktop.png"), fullPage: true });

  const ecosystem = await desktop.newPage();
  observe(ecosystem);
  await ecosystem.goto(`http://127.0.0.1:${port}/ecosystem-keeper.html`, { waitUntil: "load" });
  await ecosystem.waitForFunction(() => Boolean(window.__ecosystemTest));
  const modelValidation = await ecosystem.evaluate(() => window.__ecosystemTest.validateModel());
  assert.deepEqual(
    modelValidation,
    { valid: true, errors: [], scenarios: 6, simulatedYears: 270 },
    "ecosystem invariant audit"
  );
  await ecosystem.locator('[data-project="irrigation"]').click();
  for (let year = 0; year < 15; year++) await ecosystem.locator("#nextYearBtn").click();
  const ecosystemState = await ecosystem.evaluate(() => window.__ecosystemTest.getState());
  const ecosystemProfile = await ecosystem.evaluate(() => window.__ecosystemTest.getProfile());
  assert.equal(ecosystemState.year, 15, "real controls advance fifteen years");
  assert.equal(ecosystemState.extinctions.length, 0, "tutorial strategy keeps all species alive");
  assert.equal(ecosystemProfile.stars[0], 3, "all targets plus project award three stars");
  const ecoCode = await ecosystem.evaluate(() => window.__ecosystemTest.encodeProfile());
  assert.match(ecoCode, /^ECO2\./, "ecosystem archive prefix");
  assert.equal(
    await ecosystem.evaluate((code) => window.__ecosystemTest.decodeProfile(code).stars[0], ecoCode),
    3,
    "ecosystem archive round trip"
  );
  signal = await canvasSignal(ecosystem, "#worldCanvas");
  assert.ok(signal.opaque > 30 && signal.colors > 8, "ecosystem world canvas renders varied pixels");
  signal = await canvasSignal(ecosystem, "#trendCanvas");
  assert.ok(signal.opaque > 30 && signal.colors > 5, "ecosystem trend canvas renders data");
  await noOverflow(ecosystem, "ecosystem desktop");
  await ecosystem.screenshot({ path: path.join(outputDir, "ecosystem-desktop.png"), fullPage: true });
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
    ["bytebot-lab.html", "__bytebotTest", async (page) => {
      await page.locator('[data-command="F"]').click();
      assert.equal(await page.locator("#program .token").count(), 1, "bytebot touch adds a command");
      const mobileSignal = await canvasSignal(page, "#board");
      assert.ok(mobileSignal.opaque > 30 && mobileSignal.colors > 6, "bytebot mobile canvas signal");
    }],
    ["checkpoint-inspector.html", "__checkpointTest", async (page) => {
      await page.locator('[data-field="expiry"]').click();
      assert.equal(await page.locator('[data-field="expiry"].focused').count(), 1, "checkpoint touch marks a field");
    }],
    ["ecosystem-keeper.html", "__ecosystemTest", async (page) => {
      await page.locator("#nextYearBtn").click();
      assert.equal(await page.evaluate(() => window.__ecosystemTest.getState().year), 1, "ecosystem touch advances a year");
      const mobileSignal = await canvasSignal(page, "#worldCanvas");
      assert.ok(mobileSignal.opaque > 30 && mobileSignal.colors > 8, "ecosystem mobile canvas signal");
    }]
  ];

  for (const [file, api, interact] of mobileCases) {
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
    bytebot: { missions: 12, validatedSolutions: 12 },
    checkpoint: { days: 6, cases: 30 },
    ecosystem: { scenarios: 6, invariantYears: 270 },
    archives: ["BYTE2", "CHECK2", "ECO2"],
    failures
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
