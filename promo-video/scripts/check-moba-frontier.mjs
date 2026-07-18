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
const port = 4177;
await mkdir(outputDir, { recursive: true });

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    if (pathname === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    const target = path.resolve(rootDir, pathname.slice(1));
    if (!target.startsWith(rootDir + path.sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(target);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "content-type": path.extname(target) === ".html"
        ? "text/html; charset=utf-8"
        : "application/octet-stream",
      "cache-control": "no-store"
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));

let browser;
const pageErrors = [];
const consoleErrors = [];

function observe(page) {
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
}

try {
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark"
  });
  const page = await context.newPage();
  observe(page);
  await page.goto(`http://127.0.0.1:${port}/moba-frontier.html?debug=1`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__crystalFrontDebug));

  assert.match(await page.title(), /晶塔前线/);
  assert.match(await page.locator("h1").innerText(), /群星赛季 V5/);
  assert.equal(await page.locator("[data-champion]").count(), 6, "six champions");
  assert.equal(await page.locator("[data-rule]").count(), 6, "six rules");
  assert.equal(await page.locator("[data-career]").count(), 6, "six career technologies");
  assert.equal(await page.locator(".medal-card").count(), 6, "six season medals");
  assert.equal(await page.locator("#soundBtn").getAttribute("aria-pressed"), "true");
  await page.locator("#soundBtn").click();
  assert.equal(await page.locator("#soundBtn").getAttribute("aria-pressed"), "false");
  await page.locator("#soundBtn").click();

  let snapshot = await page.evaluate(() => window.__crystalFrontDebug.start({ seed: 396 }));
  assert.equal(snapshot.augmentCount, 12, "augment content count");
  assert.equal(snapshot.medalCount, 6, "medal content count");
  assert.equal(snapshot.savePrefix, "CFT4", "V4 save prefix");
  assert.deepEqual(snapshot.game.augmentPicks, [], "fresh match has no augments");

  const compiled = await page.evaluate(() =>
    window.__crystalFrontDebug.compileModifiers(["siegeProtocol", "commandNetwork"])
  );
  assert.equal(compiled.structureDamage, 1.42, "structure modifier");
  assert.ok(Math.abs(compiled.minionDamage - 1.18 * 1.24) < 1e-9, "multiplicative stacking");
  assert.equal(compiled.minionSpeed, 1.15, "minion speed modifier");

  snapshot = await page.evaluate(() =>
    window.__crystalFrontDebug.openDraft(2, ["aetherLoop", "siegeProtocol", "prismBastion"])
  );
  assert.equal(snapshot.game.draftOpen, true, "draft opens");
  assert.equal(snapshot.game.paused, true, "draft pauses simulation");
  assert.deepEqual(snapshot.game.draftOptions, ["aetherLoop", "siegeProtocol", "prismBastion"]);
  assert.equal(await page.locator("#augmentModal.show").count(), 1, "draft modal visible");
  assert.equal(await page.locator("[data-augment]").count(), 3, "three draft choices");
  await page.screenshot({
    path: path.join(outputDir, "moba-frontier-v5-draft.png"),
    fullPage: true
  });
  await page.locator('[data-augment="aetherLoop"]').click();
  snapshot = await page.evaluate(() => window.__crystalFrontDebug.snapshot());
  assert.deepEqual(snapshot.game.augmentPicks, ["aetherLoop"]);
  assert.equal(snapshot.game.modifiers.cooldownRate, 1.18);
  assert.equal(snapshot.game.modifiers.manaCost, 0.82);
  assert.equal(snapshot.game.paused, false, "choosing resumes simulation");

  snapshot = await page.evaluate(() => window.__crystalFrontDebug.start({ seed: 397 }));
  snapshot = await page.evaluate(() => window.__crystalFrontDebug.grantXp(200));
  assert.equal(snapshot.player.level, 2, "XP reaches level two");
  assert.equal(snapshot.game.draftOpen, true, "natural level-up queues a draft");
  const naturalChoice = snapshot.game.draftOptions[0];
  await page.evaluate(key => window.__crystalFrontDebug.pickAugment(key), naturalChoice);

  snapshot = await page.evaluate(() => window.__crystalFrontDebug.lastStandCheck());
  assert.equal(snapshot.player.alive, true, "last stand prevents death");
  assert.equal(snapshot.player.hp, 1, "last stand leaves one HP");
  assert.equal(snapshot.game.lastStandCharges, 0, "last stand charge consumed");
  assert.ok(snapshot.player.shield > 0, "last stand grants emergency shield");

  snapshot = await page.evaluate(() =>
    window.__crystalFrontDebug.forceOutcome(true, {
      kills: 6,
      deaths: 0,
      towers: 3,
      objectives: 2,
      waveNumber: 12,
      time: 420,
      augments: ["cometMatrix", "beastPact", "siegeProtocol"]
    })
  );
  assert.equal(snapshot.career.wins, 1, "victory saved");
  assert.equal(snapshot.career.bestGrade, "S", "S grade saved");
  assert.equal(Object.keys(snapshot.career.medals).length, 5, "five immediate medals");
  assert.equal(snapshot.career.championWins.starblade, 1, "champion victory saved");
  assert.equal(snapshot.career.augmentWins.cometMatrix, 1, "augment victory saved");
  assert.match(await page.locator("#resultTitle").innerText(), /S 评价/);
  assert.match(await page.locator("#resultCopy").innerText(), /新勋章/);

  const code = await page.evaluate(() => window.__crystalFrontDebug.encodeCareer());
  assert.match(code, /^CFT4\./, "exported V4 code");
  snapshot = await page.evaluate(value => window.__crystalFrontDebug.importCareer(value), code);
  assert.equal(snapshot.career.bestGrade, "S", "V4 round trip");

  await page.evaluate(() => window.__crystalFrontDebug.start({ seed: 398 }));
  await page.waitForTimeout(1_400);
  await page.screenshot({
    path: path.join(outputDir, "moba-frontier-v5-desktop.png"),
    fullPage: true
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4),
    true,
    "desktop horizontal overflow"
  );
  await context.close();

  const legacyContext = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  await legacyContext.addInitScript(() => {
    localStorage.setItem("crystalFrontCareerV3", JSON.stringify({
      version: 3,
      shards: 37,
      wins: 3,
      games: 5,
      bestKills: 8,
      tech: { power: 2 },
      mastery: { starblade: 4 },
      records: {},
      loadout: { champion: "starblade", rule: "iron" }
    }));
  });
  const legacyPage = await legacyContext.newPage();
  observe(legacyPage);
  await legacyPage.goto(`http://127.0.0.1:${port}/moba-frontier.html?debug=1`, { waitUntil: "load" });
  await legacyPage.waitForFunction(() => Boolean(window.__crystalFrontDebug));
  snapshot = await legacyPage.evaluate(() => window.__crystalFrontDebug.snapshot());
  assert.equal(snapshot.career.version, 4, "legacy career migrated");
  assert.equal(snapshot.career.shards, 37, "legacy shards preserved");
  assert.equal(snapshot.career.tech.power, 2, "legacy technology preserved");
  assert.equal(snapshot.selectedRule, "iron", "legacy loadout preserved");
  assert.equal(snapshot.savePrefix, "CFT4", "migrated export uses V4");
  assert.equal(
    await legacyPage.evaluate(() => Boolean(localStorage.getItem("crystalFrontCareerV4"))),
    true,
    "migration persists the V4 key"
  );
  await legacyContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    colorScheme: "dark"
  });
  const mobilePage = await mobileContext.newPage();
  observe(mobilePage);
  await mobilePage.goto(`http://127.0.0.1:${port}/moba-frontier.html?debug=1`, { waitUntil: "load" });
  await mobilePage.waitForFunction(() => Boolean(window.__crystalFrontDebug));
  assert.equal(await mobilePage.locator(".medal-card").count(), 6, "mobile medal content");
  await mobilePage.evaluate(() => window.__crystalFrontDebug.start({ seed: 399 }));
  await mobilePage.evaluate(() =>
    window.__crystalFrontDebug.openDraft(2, ["phaseEngine", "bloodCore", "bountyLens"])
  );
  assert.equal(await mobilePage.locator("#augmentModal.show").count(), 1, "mobile draft visible");
  assert.equal(await mobilePage.locator("[data-augment]").count(), 3, "mobile draft choices");
  await mobilePage.locator('[data-augment="phaseEngine"]').click();
  snapshot = await mobilePage.evaluate(() => window.__crystalFrontDebug.snapshot());
  assert.deepEqual(snapshot.game.augmentPicks, ["phaseEngine"], "mobile draft selection");
  assert.equal(
    await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4),
    true,
    "mobile horizontal overflow"
  );
  await mobilePage.screenshot({
    path: path.join(outputDir, "moba-frontier-v5-mobile.png"),
    fullPage: true
  });
  await mobileContext.close();

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(" | ")}`);
  assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join(" | ")}`);
  console.log(JSON.stringify({
    checks: "PASS",
    champions: 6,
    rules: 6,
    augments: 12,
    medals: 6,
    saveVersion: 4,
    screenshots: [
      "output/moba-frontier-v5-draft.png",
      "output/moba-frontier-v5-desktop.png",
      "output/moba-frontier-v5-mobile.png"
    ]
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
