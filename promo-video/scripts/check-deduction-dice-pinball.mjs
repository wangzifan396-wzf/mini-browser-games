import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output", "deduction-dice-pinball");
const port = 4187;
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
    const stride = Math.max(4, Math.floor(data.length / 2200 / 4) * 4);
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
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });

  const starship = await desktop.newPage();
  observe(starship);
  await starship.goto(`http://127.0.0.1:${port}/starship-suspects.html`, { waitUntil: "load" });
  await starship.waitForFunction(() => Boolean(window.__starshipSuspects));
  assert.deepEqual(
    await starship.evaluate(() => window.__starshipSuspects.validateCases()),
    { valid: true, errors: [], cases: 6, clues: 36, links: 18 },
    "starship case audit"
  );
  for (const [a, b] of [["a", "b"], ["c", "d"], ["e", "f"]]) {
    await starship.locator(`[data-clue="${a}"]`).click();
    await starship.locator(`[data-clue="${b}"]`).click();
    await starship.locator("#linkBtn").click();
  }
  assert.equal(await starship.evaluate(() => window.__starshipSuspects.run().links.length), 3, "starship real links complete evidence chain");
  await starship.locator("#accuseBtn").click();
  assert.equal(await starship.evaluate(() => window.__starshipSuspects.profile().stars[0]), 3, "starship real accusation awards three stars");
  const shipCode = await starship.evaluate(() => window.__starshipSuspects.encode());
  assert.match(shipCode, /^SHIP2\./, "starship archive prefix");
  assert.equal(await starship.evaluate((code) => window.__starshipSuspects.decode(code).stars[0], shipCode), 3, "starship archive round trip");
  await noOverflow(starship, "starship desktop");
  await starship.screenshot({ path: path.join(outputDir, "starship-desktop.png"), fullPage: true });

  const dice = await desktop.newPage();
  observe(dice);
  await dice.goto(`http://127.0.0.1:${port}/dice-delver.html`, { waitUntil: "load" });
  await dice.waitForFunction(() => Boolean(window.__diceDelver));
  assert.deepEqual(
    await dice.evaluate(() => window.__diceDelver.validateContent()),
    { valid: true, errors: [], nodes: 18, relics: 12, heroes: 3, combos: 8 },
    "dice content audit"
  );
  await dice.locator('[data-node="battle"]').click();
  await dice.waitForFunction(() => window.__diceDelver.run().mode === "battle");
  const beforeEnemy = await dice.evaluate(() => window.__diceDelver.run().enemy.hp);
  await dice.evaluate(() => {
    const api = window.__diceDelver;
    api.run().dice = [1, 1, 2, 3, 5];
    api.renderAll();
  });
  await dice.locator('[data-combo="0"]').click();
  assert.ok(await dice.evaluate((before) => window.__diceDelver.run().enemy.hp < before, beforeEnemy), "dice real combo damages enemy");
  await dice.evaluate(() => {
    const api = window.__diceDelver;
    const run = api.run();
    run.node = 5;
    run.mode = "battle";
    run.hp = 85;
    run.max = 100;
    run.relics = ["echo", "compass"];
    api.completeNode();
  });
  assert.equal(await dice.evaluate(() => window.__diceDelver.profile().stars[0]), 3, "dice region completion awards three stars");
  const diceCode = await dice.evaluate(() => window.__diceDelver.encode());
  assert.match(diceCode, /^DICE2\./, "dice archive prefix");
  assert.equal(await dice.evaluate((code) => window.__diceDelver.decode(code).stars[0], diceCode), 3, "dice archive round trip");
  await noOverflow(dice, "dice desktop");
  await dice.screenshot({ path: path.join(outputDir, "dice-desktop.png"), fullPage: true });

  const pinball = await desktop.newPage();
  observe(pinball);
  await pinball.goto(`http://127.0.0.1:${port}/orbital-pinball.html`, { waitUntil: "load" });
  await pinball.waitForFunction(() => Boolean(window.__orbitalPinball));
  assert.equal(await pinball.evaluate(() => window.__orbitalPinball.TABLES.length), 3, "pinball has three tables");
  assert.equal(await pinball.evaluate(() => window.__orbitalPinball.MODULES.length), 6, "pinball has six modules");
  assert.equal(
    await pinball.evaluate(() => window.__orbitalPinball.TABLES.every((table) => table.target > 0 && table.objectiveCount > 0)),
    true,
    "pinball table data is complete"
  );
  await pinball.locator("#overlayBtn").click();
  await pinball.locator("#launchBtn").dispatchEvent("pointerdown");
  await pinball.waitForTimeout(80);
  await pinball.locator("#launchBtn").dispatchEvent("pointerup");
  assert.equal(await pinball.evaluate(() => window.__orbitalPinball.state().ball.locked), false, "pinball real launch releases ball");
  await pinball.evaluate(() => {
    const api = window.__orbitalPinball;
    const state = api.state();
    state.score = api.TABLES[0].target;
    state.balls = 3;
    state.board.lanes.forEach((lane) => { lane.hits = 1; });
    api.finish(true);
  });
  assert.equal(await pinball.evaluate(() => window.__orbitalPinball.profile().stars[0]), 3, "pinball completion awards three stars");
  const pinCode = await pinball.evaluate(() => window.__orbitalPinball.encode());
  assert.match(pinCode, /^PIN2\./, "pinball archive prefix");
  assert.equal(await pinball.evaluate((code) => window.__orbitalPinball.decode(code).stars[0], pinCode), 3, "pinball archive round trip");
  const signal = await canvasSignal(pinball, "#gameCanvas");
  assert.ok(signal.opaque > 30 && signal.colors > 8, "pinball canvas signal");
  await noOverflow(pinball, "pinball desktop");
  await pinball.screenshot({ path: path.join(outputDir, "pinball-desktop.png"), fullPage: true });
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
  const cases = [
    ["starship-suspects.html", "__starshipSuspects", async (page) => {
      await page.locator('[data-clue="a"]').tap();
      await page.locator('[data-clue="b"]').tap();
      await page.locator("#linkBtn").tap();
      assert.equal(await page.evaluate(() => window.__starshipSuspects.run().links.length), 1, "starship mobile evidence link");
    }],
    ["dice-delver.html", "__diceDelver", async (page) => {
      await page.locator('[data-node="battle"]').tap();
      await page.locator("#rollBtn").tap();
      assert.equal(await page.evaluate(() => window.__diceDelver.run().rolls), 2, "dice mobile roll");
    }],
    ["orbital-pinball.html", "__orbitalPinball", async (page) => {
      await page.locator("#overlayBtn").tap();
      await page.locator("#launchBtn").dispatchEvent("pointerdown");
      await page.locator("#launchBtn").dispatchEvent("pointerup");
      assert.equal(await page.evaluate(() => window.__orbitalPinball.state().ball.locked), false, "pinball mobile launch");
      await page.evaluate(() => window.__orbitalPinball.finish(false));
    }]
  ];
  for (const [file, api, interact] of cases) {
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
    starship: { cases: 6, clues: 36, links: 18, archive: "SHIP2" },
    dice: { nodes: 18, heroes: 3, relics: 12, archive: "DICE2" },
    pinball: { tables: 3, modules: 6, archive: "PIN2" },
    failures
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
