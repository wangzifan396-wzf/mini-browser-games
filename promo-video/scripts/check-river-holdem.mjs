import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output", "river-holdem");
const port = 4200;
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
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 4, `${label} horizontal overflow: ${overflow}px`);
}

async function playOneHand(page) {
  for (let action = 0; action < 24; action++) {
    const state = await page.evaluate(() => window.__riverHoldem.state());
    if (state.handEnded || state.mode === "result") return state;
    assert.equal(state.turn, 0, `hero turn before action ${action}`);
    await page.locator("#callBtn").click();
  }
  throw new Error("hand did not settle within 24 hero actions");
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
  await page.addInitScript(() => { Date.now = () => 123456789; });
  observe(page);
  await page.goto(`http://127.0.0.1:${port}/river-holdem.html`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__riverHoldem));

  const validation = await page.evaluate(() => window.__riverHoldem.validateContent());
  console.log("validation", JSON.stringify(validation));
  assert.deepEqual(validation, {
    valid: true,
    errors: [],
    contracts: 3,
    opponents: 3,
    medals: 6,
    evaluatorCases: 5,
    sidePots: 3,
  }, "holdem content and rules contract");

  const sidePots = await page.evaluate(() => window.__riverHoldem.buildSidePots([
    { committed: 100, folded: false },
    { committed: 200, folded: false },
    { committed: 300, folded: true },
    { committed: 300, folded: false },
  ]));
  assert.deepEqual(sidePots, [
    { amount: 400, eligible: [0, 1, 3] },
    { amount: 300, eligible: [1, 3] },
    { amount: 200, eligible: [3] },
  ], "three-layer side pot keeps folded contributions but excludes folded winners");
  const awards = await page.evaluate(() => window.__riverHoldem.settlePots([
    { committed: 100, folded: false },
    { committed: 200, folded: false },
    { committed: 300, folded: true },
    { committed: 300, folded: false },
  ], [100, 300, 999, 200], 0));
  assert.deepEqual(awards, [0, 700, 0, 200], "short stack wins eligible pots while deep stack retains final side pot");
  const tiedAwards = await page.evaluate(() => window.__riverHoldem.settlePots([
    { committed: 100, folded: false },
    { committed: 200, folded: false },
    { committed: 300, folded: true },
    { committed: 300, folded: false },
  ], [100, 300, 999, 300], 0));
  assert.deepEqual(tiedAwards, [0, 350, 0, 550], "ties split eligible pots and preserve exclusive final side pot");

  await page.locator("#startContractBtn").click();
  let state = await page.evaluate(() => window.__riverHoldem.state());
  assert.equal(state.players.length, 4, "four tournament seats");
  assert.equal(state.turn, 0, "AI advances to real player turn");
  assert.equal(state.players.reduce((sum, player) => sum + player.chips + player.committed, 0), 2400, "chips conserved after blinds and AI action");

  if (await page.locator("#raiseBtn").isEnabled()) {
    const target = await page.locator("#raiseRange").inputValue();
    await page.locator("#raiseBtn").click();
    state = await page.evaluate(() => window.__riverHoldem.state());
    assert.ok(state.stats.raises >= 1, `real raise to ${target} recorded`);
  }

  state = await playOneHand(page);
  assert.ok(state.handEnded || state.mode === "result", "real betting hand settles");
  assert.equal(state.players.reduce((sum, player) => sum + player.chips, 0), 2400, "chips conserved after side-pot settlement");
  if (state.mode === "playing") {
    const previousDealer = state.dealer;
    await page.locator("#nextHandBtn").click();
    state = await page.evaluate(() => window.__riverHoldem.state());
    assert.equal(state.hand, 2, "second tournament hand starts");
    assert.notEqual(state.dealer, previousDealer, "dealer button rotates across active seats");
    assert.equal(state.players.reduce((sum, player) => sum + player.chips + player.committed, 0), 2400, "chips conserved after the next blinds");
  }

  const archive = await page.evaluate(() => window.__riverHoldem.encode());
  assert.match(archive, /^RIVER2\./, "archive prefix");
  assert.equal(await page.evaluate((code) => window.__riverHoldem.decode(code).profile.stars.length, archive), 3, "archive round trip");
  await assert.rejects(
    page.evaluate((code) => window.__riverHoldem.decode(`${code}x`), archive),
    /巡回档案校验失败/,
    "archive rejects tampering",
  );
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
  await mobilePage.addInitScript(() => { Date.now = () => 987654321; });
  observe(mobilePage);
  await mobilePage.goto(`http://127.0.0.1:${port}/river-holdem.html`, { waitUntil: "load" });
  await mobilePage.waitForFunction(() => Boolean(window.__riverHoldem));
  await mobilePage.locator("#startContractBtn").tap();
  assert.equal(await mobilePage.evaluate(() => window.__riverHoldem.state().turn), 0, "mobile AI advances to player");
  await mobilePage.locator("#callBtn").tap();
  assert.ok(await mobilePage.evaluate(() => window.__riverHoldem.state().stats.actions >= 1), "mobile real action recorded");
  await noOverflow(mobilePage, "mobile");
  await mobilePage.screenshot({ path: path.join(outputDir, "mobile.png"), fullPage: true });
  assert.deepEqual(failures, [], "mobile browser errors");
  await mobile.close();

  console.log(JSON.stringify({ contracts: 3, opponents: 3, evaluatorCases: 5, sidePots: 3, archive: "RIVER2", failures }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
