import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
await mkdir(path.join(rootDir, "output"), { recursive: true });
const source = await readFile(path.join(rootDir, "slingstorm.html"), "utf8");
const hook = `
  window.__SLING_TEST__ = {
    snapshot: () => ({
      level: state.level,
      status: state.status,
      shotsUsed: state.shotsUsed,
      stars: state.stars,
      targetStart: state.targetStart,
      targetCount: targets.length,
      targets: targets.map(body => ({
        type: body.game.targetType,
        hp: body.game.hp,
        x: body.position.x,
        y: body.position.y
      })),
      projectile: currentProjectile ? {
        isStatic: currentProjectile.isStatic,
        mass: currentProjectile.mass,
        speed: currentProjectile.speed,
        x: currentProjectile.position.x,
        y: currentProjectile.position.y
      } : null,
      save: JSON.parse(JSON.stringify(save))
    }),
    loadLevel,
    finishLevel,
    encodeSave,
    importSave,
    buyWorkshop,
    setSave: value => {
      save = normalizeSave(value);
      bestStars = levels.map((_, index) => Number(save.stars[index + 1]) || 0);
      selectedLevel = Math.max(0, Math.min(levels.length - 1, save.unlocked - 1));
      storeSave();
      renderStation();
      updateUI();
    },
    setRun: value => Object.assign(state, value),
    worldToClient: (x, y) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (view.ox + x * view.scale) / view.dpr,
        y: rect.top + (view.oy + y * view.scale) / view.dpr
      };
    }
  };
`;
const marker = "  requestAnimationFrame(loop);";
assert(source.includes(marker), "test hook marker missing");
const instrumented = source.replace(marker, `${hook}\n${marker}`);
const port = 4175;
const server = http.createServer((request, response) => {
  if (new URL(request.url, "http://local").pathname === "/slingstorm.html") {
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

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const page = await desktop.newPage();
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${port}/slingstorm.html`, { waitUntil: "load" });

  assert.equal(await page.locator(".campaign-node").count(), 18, "campaign node count");
  assert.equal(await page.locator(".campaign-node:disabled").count(), 17, "fresh save locking");
  assert.match(await page.locator("#progressPill").innerText(), /0\/54.*解锁 1\/18/, "fresh progress");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4), true, "desktop overflow");
  assert.equal(await page.locator("#soundBtn").getAttribute("aria-pressed"), "true", "sound defaults on");
  await page.locator("#soundBtn").click();
  assert.equal(await page.locator("#soundBtn").getAttribute("aria-pressed"), "false", "sound toggles off");
  await page.locator("#soundBtn").click();
  assert.equal(await page.locator("#soundBtn").getAttribute("aria-pressed"), "true", "sound toggles on");

  await page.locator("#startBtn").click();
  await page.waitForTimeout(120);
  const beforeLaunch = await page.evaluate(() => window.__SLING_TEST__.snapshot());
  assert.equal(beforeLaunch.projectile?.isStatic, true, "projectile should begin held");
  const pouch = await page.evaluate(() => window.__SLING_TEST__.worldToClient(162, 492));
  const pull = await page.evaluate(() => window.__SLING_TEST__.worldToClient(62, 548));
  await page.mouse.move(pouch.x, pouch.y);
  await page.mouse.down();
  await page.mouse.move(pull.x, pull.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const afterLaunch = await page.evaluate(() => window.__SLING_TEST__.snapshot());
  assert.equal(afterLaunch.shotsUsed, 1, "drag should consume one shot");
  assert.equal(afterLaunch.projectile?.isStatic, false, "launched projectile should be dynamic");
  assert.equal(Number.isFinite(afterLaunch.projectile?.mass), true, "launched projectile should have finite mass");
  assert.ok(afterLaunch.projectile?.speed > 2, "launched projectile should have velocity");

  const stability = [];
  for (let index = 0; index < 18; index += 1) {
    await page.evaluate(level => window.__SLING_TEST__.loadLevel(level), index);
    await page.waitForTimeout(180);
    const snapshot = await page.evaluate(() => window.__SLING_TEST__.snapshot());
    const validTargets = snapshot.targets.every(target =>
      Number.isFinite(target.x) && Number.isFinite(target.y) && target.y < 850 && target.hp > 0
    );
    stability.push({ level: index + 1, targets: snapshot.targetCount, status: snapshot.status, validTargets });
    assert.equal(snapshot.targetCount, snapshot.targetStart, `level ${index + 1} target stability`);
    assert.equal(snapshot.status, "ready", `level ${index + 1} premature result`);
    assert.equal(validTargets, true, `level ${index + 1} target bounds`);
  }
  for (const index of [5, 11, 17]) {
    await page.evaluate(level => window.__SLING_TEST__.loadLevel(level), index);
    const boss = await page.evaluate(() => window.__SLING_TEST__.snapshot().targets.find(target => target.type === "boss"));
    assert.ok(boss?.hp >= 140, `level ${index + 1} boss health`);
    assert.match(await page.locator("#targetValue").innerText(), /^风眼 /, `level ${index + 1} boss HUD`);
  }

  await page.evaluate(() => {
    window.__SLING_TEST__.setSave({ v: 4, cores: 100, unlocked: 1, runs: 0, wins: 0 });
    document.querySelector("#startModal").classList.add("show");
  });
  await page.locator('[data-workshop="tension"]').click();
  let snapshot = await page.evaluate(() => window.__SLING_TEST__.snapshot());
  assert.equal(snapshot.save.lab.tension, 1, "workshop level");
  assert.equal(snapshot.save.cores, 90, "workshop cost");

  const saveCode = await page.evaluate(() => window.__SLING_TEST__.encodeSave());
  await page.evaluate(() => window.__SLING_TEST__.setSave({ v: 4, cores: 1, unlocked: 1 }));
  await page.evaluate(code => window.__SLING_TEST__.importSave(code), saveCode);
  snapshot = await page.evaluate(() => window.__SLING_TEST__.snapshot());
  assert.equal(snapshot.save.cores, 90, "save import cores");
  assert.equal(snapshot.save.lab.tension, 1, "save import workshop");

  await page.evaluate(() => {
    window.__SLING_TEST__.setSave({
      v: 4,
      cores: -12,
      unlocked: 999,
      lab: { tension: 99 },
      stars: { 1: 99 },
      runs: 2,
      wins: 50
    });
  });
  snapshot = await page.evaluate(() => window.__SLING_TEST__.snapshot());
  assert.equal(snapshot.save.cores, 0, "save cores clamp");
  assert.equal(snapshot.save.unlocked, 18, "save unlock clamp");
  assert.equal(snapshot.save.lab.tension, 6, "save workshop clamp");
  assert.equal(snapshot.save.stars[1], 3, "save stars clamp");
  assert.equal(snapshot.save.wins, 2, "save wins clamp");

  await page.evaluate(() => {
    window.__SLING_TEST__.setSave({ v: 4, cores: 0, unlocked: 1, runs: 0, wins: 0 });
    window.__SLING_TEST__.loadLevel(0);
    window.__SLING_TEST__.setRun({ shotsUsed: 2, windShiftsUsed: 0, score: 3000 });
    window.__SLING_TEST__.finishLevel(true);
  });
  snapshot = await page.evaluate(() => window.__SLING_TEST__.snapshot());
  assert.equal(snapshot.stars, 3, "three-condition star result");
  assert.equal(snapshot.save.unlocked, 2, "next level unlock");
  assert.equal(snapshot.save.stars[1], 3, "best stars stored");
  assert.equal(await page.locator("#resultModal").evaluate(element => element.classList.contains("show")), true, "result modal");

  await page.evaluate(() => {
    window.__SLING_TEST__.setSave({ v: 4, cores: 0, unlocked: 18, runs: 0, wins: 0 });
    window.__SLING_TEST__.loadLevel(17);
    window.__SLING_TEST__.setRun({ shotsUsed: 6, maxShotKills: 4, score: 12000 });
    window.__SLING_TEST__.finishLevel(true);
  });
  await page.locator("#nextBtn").click();
  assert.equal(await page.locator("#startModal").evaluate(element => element.classList.contains("show")), true, "final level returns to station");

  const canvasSignal = await page.locator("#gameCanvas").evaluate(canvas => {
    const context = canvas.getContext("2d");
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let colored = 0;
    for (let index = 0; index < data.length; index += 64) {
      if (data[index] + data[index + 1] + data[index + 2] > 30 && data[index + 3] > 0) colored += 1;
    }
    return colored;
  });
  assert.ok(canvasSignal > 1000, "canvas should be visibly rendered");
  await page.screenshot({ path: path.join(rootDir, "output", "slingstorm-v4-desktop.png"), fullPage: true });
  await desktop.close();

  const legacy = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  await legacy.addInitScript(() => localStorage.setItem("slingstorm.bestStars.v1", JSON.stringify([3, 2, 1, 3, 2])));
  const legacyPage = await legacy.newPage();
  await legacyPage.goto(`http://127.0.0.1:${port}/slingstorm.html`, { waitUntil: "load" });
  const migrated = await legacyPage.evaluate(() => window.__SLING_TEST__.snapshot().save);
  assert.equal(migrated.unlocked, 6, "legacy unlock migration");
  assert.deepEqual([1, 2, 3, 4, 5].map(index => migrated.stars[index]), [3, 2, 1, 3, 2], "legacy stars migration");
  await legacy.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    colorScheme: "dark"
  });
  const mobilePage = await mobile.newPage();
  mobilePage.on("pageerror", error => pageErrors.push(error.message));
  await mobilePage.goto(`http://127.0.0.1:${port}/slingstorm.html`, { waitUntil: "load" });
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4), true, "mobile overflow");
  assert.equal(await mobilePage.locator("#startBtn").isVisible(), true, "mobile start action");
  assert.equal(await mobilePage.locator(".setup-dialog").evaluate(element => element.scrollHeight > element.clientHeight), true, "mobile station scrolling");
  await mobilePage.screenshot({ path: path.join(rootDir, "output", "slingstorm-v4-mobile.png"), fullPage: true });
  await mobile.close();

  assert.deepEqual(pageErrors, [], "page errors");
  assert.deepEqual(consoleErrors, [], "console errors");
  console.log(JSON.stringify({
    checks: "PASS",
    levels: stability,
    launchSpeed: Number(afterLaunch.projectile.speed.toFixed(2)),
    canvasSignal,
    screenshots: ["output/slingstorm-v4-desktop.png", "output/slingstorm-v4-mobile.png"]
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
