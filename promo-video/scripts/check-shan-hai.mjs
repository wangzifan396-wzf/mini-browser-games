import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
await mkdir(path.join(rootDir, "output"), { recursive: true });
const source = await readFile(path.join(rootDir, "shan-hai.html"), "utf8");
const marker = "      updateAscensionOptions();\n      renderSoundButton();\n      saveMeta();";
const hook = `
      window.__SHAN_HAI_TEST__ = {
        snapshot: () => ({
          state: JSON.parse(JSON.stringify(state)),
          meta: JSON.parse(JSON.stringify(meta)),
          chapters: JSON.parse(JSON.stringify(CHAPTERS)),
          finalFloor: FINAL_FLOOR,
          soundEnabled
        }),
        setMeta: value => {
          meta = normalizeMeta(value);
          saveMeta();
          updateAscensionOptions();
          renderStats();
        },
        newRun,
        showDaoHall,
        buyDaoTalent,
        encodeMetaSave,
        decodeMetaSave,
        saveFloor: floor => {
          state.floorIndex = Math.max(0, Math.min(FINAL_FLOOR - 1, floor));
          state.screen = "map";
          state.currentNode = null;
          state.combat = null;
          state.reward = null;
          state.event = null;
          saveRunCheckpoint();
          render();
        },
        bossAt: floor => {
          const previous = state.floorIndex;
          state.floorIndex = floor;
          const enemy = createEnemy("boss");
          state.floorIndex = previous;
          return { name: enemy.name, hp: enemy.hp, pattern: enemy.pattern.length };
        },
        forceFinalVictory: () => {
          state.floorIndex = FINAL_FLOOR - 1;
          state.currentNode = state.map[FINAL_FLOOR - 1][0];
          startCombat("boss");
          state.combat.enemy.hp = 0;
          winCombat();
        }
      };
`;
assert(source.includes(marker), "test hook marker missing");
const instrumented = source.replace(marker, `${hook}\n${marker}`);
const port = 4176;
const server = http.createServer((request, response) => {
  if (new URL(request.url, "http://local").pathname === "/shan-hai.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(instrumented);
    return;
  }
  response.writeHead(204).end();
});
await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));

let browser;
const pageErrors = [];
const consoleErrors = [];
try {
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const page = await context.newPage();
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${port}/shan-hai.html`, { waitUntil: "load" });

  assert.equal(await page.locator(".chapter-map").count(), 3, "chapter count");
  assert.equal(await page.locator(".map-column").count(), 18, "floor count");
  assert.deepEqual(await page.locator(".map-node .node-title").allInnerTexts().then(values =>
    values.filter(value => ["穷奇", "相柳", "烛九阴"].includes(value))
  ), ["穷奇", "相柳", "烛九阴"], "boss route labels");
  assert.equal(await page.locator("#floorStat").innerText(), "0/18", "fresh floor HUD");
  assert.equal(await page.locator('#ascensionSelect option[value="1"]').isDisabled(), false, "first ascension unlocked");
  assert.equal(await page.locator('#ascensionSelect option[value="2"]').isDisabled(), true, "higher ascension locked");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4), true, "desktop overflow");

  assert.equal(await page.locator("#soundButton").getAttribute("aria-pressed"), "true", "sound defaults on");
  await page.locator("#soundButton").click();
  assert.equal(await page.locator("#soundButton").getAttribute("aria-pressed"), "false", "sound toggles off");
  await page.locator("#soundButton").click();

  await page.evaluate(() => window.__SHAN_HAI_TEST__.setMeta({
    v: 3,
    dao: 100,
    totalDao: 100,
    wins: 0,
    bestAscension: 0,
    talents: {},
    heroWins: {}
  }));
  await page.locator("#daoHallButton").click();
  await page.locator('[data-talent="pulse"]').click();
  let snapshot = await page.evaluate(() => window.__SHAN_HAI_TEST__.snapshot());
  assert.equal(snapshot.meta.talents.pulse, 1, "dao talent purchase");
  assert.equal(snapshot.meta.dao, 90, "dao talent cost");
  await page.locator("#modalCloseButton").click();
  await page.evaluate(() => window.__SHAN_HAI_TEST__.newRun());
  snapshot = await page.evaluate(() => window.__SHAN_HAI_TEST__.snapshot());
  assert.equal(snapshot.state.player.maxHp, 78, "dao vitality applies");

  const bosses = await page.evaluate(() => [5, 11, 17].map(floor => window.__SHAN_HAI_TEST__.bossAt(floor)));
  assert.deepEqual(bosses.map(boss => boss.name), ["穷奇", "相柳", "烛九阴"], "three boss order");
  assert.equal(bosses.every(boss => boss.hp > 100 && boss.pattern >= 4), true, "boss depth");

  const firstFight = page.locator('.map-node.available[data-node-id="f0-n0"]');
  await firstFight.click();
  assert.equal(await page.locator(".combat-screen").count(), 1, "combat starts from map");
  snapshot = await page.evaluate(() => window.__SHAN_HAI_TEST__.snapshot());
  const turnBefore = snapshot.state.combat.turn;
  const handBefore = snapshot.state.combat.hand.length;
  const playable = page.locator('.card-button:not([disabled])').first();
  assert.equal(await playable.count(), 1, "playable opening card");
  await playable.click();
  snapshot = await page.evaluate(() => window.__SHAN_HAI_TEST__.snapshot());
  assert.ok(snapshot.state.combat.hand.length <= handBefore, "card action resolves");
  await page.locator('[data-action="end-turn"]').click();
  snapshot = await page.evaluate(() => window.__SHAN_HAI_TEST__.snapshot());
  assert.equal(snapshot.state.combat.turn, turnBefore + 1, "enemy and next player turn resolve");

  await page.evaluate(() => window.__SHAN_HAI_TEST__.saveFloor(7));
  await page.reload({ waitUntil: "load" });
  snapshot = await page.evaluate(() => window.__SHAN_HAI_TEST__.snapshot());
  assert.equal(snapshot.state.floorIndex, 7, "safe checkpoint resumes");
  assert.match(snapshot.state.runLog[0].text, /恢复第 8 层/, "resume is reported");

  const saveCode = await page.evaluate(() => window.__SHAN_HAI_TEST__.encodeMetaSave());
  await page.evaluate(() => window.__SHAN_HAI_TEST__.setMeta({ v: 3, dao: 1, wins: 0 }));
  await page.evaluate(code => window.__SHAN_HAI_TEST__.decodeMetaSave(code), saveCode);
  snapshot = await page.evaluate(() => window.__SHAN_HAI_TEST__.snapshot());
  assert.equal(snapshot.meta.dao, 90, "V3 import restores dao");
  assert.equal(snapshot.meta.talents.pulse, 1, "V3 import restores dojo");
  assert.equal(snapshot.state.floorIndex, 7, "V3 import restores run checkpoint");

  await page.evaluate(() => {
    window.__SHAN_HAI_TEST__.setMeta({ v: 3, dao: 0, totalDao: 0, wins: 0, bestAscension: 0 });
    window.__SHAN_HAI_TEST__.newRun();
    window.__SHAN_HAI_TEST__.forceFinalVictory();
  });
  snapshot = await page.evaluate(() => window.__SHAN_HAI_TEST__.snapshot());
  assert.equal(snapshot.state.screen, "victory", "final boss victory screen");
  assert.equal(snapshot.state.floorIndex, 18, "final victory completes all floors");
  assert.equal(snapshot.meta.wins, 1, "victory record");
  assert.equal(snapshot.meta.heroWins.sword, 1, "hero mastery record");
  assert.ok(snapshot.meta.dao > 0 && snapshot.meta.bestScore > 0, "victory progression rewards");
  assert.equal(await page.evaluate(() => localStorage.getItem("shan_hai_v3_run")), null, "finished checkpoint clears");
  await page.screenshot({ path: path.join(rootDir, "output", "shan-hai-v3-desktop.png"), fullPage: true });
  await context.close();

  const legacyContext = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  await legacyContext.addInitScript(() => localStorage.setItem("shan_hai_v2_meta", JSON.stringify({ dao: 37, wins: 3, bestAscension: 2 })));
  const legacyPage = await legacyContext.newPage();
  await legacyPage.goto(`http://127.0.0.1:${port}/shan-hai.html`, { waitUntil: "load" });
  const migrated = await legacyPage.evaluate(() => window.__SHAN_HAI_TEST__.snapshot().meta);
  assert.equal(migrated.v, 3, "legacy save version migration");
  assert.equal(migrated.dao, 37, "legacy dao migration");
  assert.equal(migrated.wins, 3, "legacy wins migration");
  assert.equal(migrated.bestAscension, 2, "legacy ascension migration");
  await legacyContext.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    colorScheme: "light"
  });
  const mobilePage = await mobile.newPage();
  mobilePage.on("pageerror", error => pageErrors.push(error.message));
  await mobilePage.goto(`http://127.0.0.1:${port}/shan-hai.html`, { waitUntil: "load" });
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4), true, "mobile overflow");
  assert.equal(await mobilePage.locator(".chapter-map").count(), 3, "mobile chapters");
  assert.equal(await mobilePage.locator("#daoHallButton").isVisible(), true, "mobile dojo control");
  await mobilePage.screenshot({ path: path.join(rootDir, "output", "shan-hai-v3-mobile.png"), fullPage: true });
  await mobile.close();

  assert.deepEqual(pageErrors, [], "page errors");
  assert.deepEqual(consoleErrors, [], "console errors");
  console.log(JSON.stringify({
    checks: "PASS",
    floors: 18,
    bosses: bosses.map(boss => boss.name),
    screenshots: ["output/shan-hai-v3-desktop.png", "output/shan-hai-v3-mobile.png"]
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
