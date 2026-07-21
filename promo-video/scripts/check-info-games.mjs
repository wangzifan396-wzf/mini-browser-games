import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output");
const articleImageDir = path.join(rootDir, "docs", "images", "readable-uncertainty");
const port = 4183;
const failures = [];

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    if (pathname === "/favicon.ico") return response.writeHead(204).end();
    const target = path.resolve(rootDir, pathname.slice(1));
    if (!target.startsWith(rootDir + path.sep)) return response.writeHead(403).end("Forbidden");
    const info = await stat(target);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "content-type": target.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "cache-control": "no-store" });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

function observe(page) {
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
}

async function canvasSignal(page, selector) {
  return page.locator(selector).evaluate((canvas) => {
    const context = canvas.getContext("2d");
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
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

async function noOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4), true, `${label} horizontal overflow`);
}

await mkdir(outputDir, { recursive: true });
await mkdir(articleImageDir, { recursive: true });
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
let browser;
try { browser = await chromium.launch({ channel: "msedge", headless: true }); }
catch { browser = await chromium.launch({ headless: true }); }

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });

  const beat = await desktop.newPage();
  observe(beat);
  await beat.goto(`http://127.0.0.1:${port}/beat-bento.html?debug=1`, { waitUntil: "load" });
  await beat.waitForFunction(() => Boolean(window.__beatBentoDebug));
  assert.equal(await beat.locator("[data-show]").count(), 12, "beat tour has twelve shows");
  assert.equal(await beat.locator("[data-chef]").count(), 4, "beat tour has four chefs");
  assert.equal(await beat.locator("[data-show]:disabled").count(), 11, "beat tour starts with one show");
  let snapshot = await beat.evaluate(() => window.__beatBentoDebug.start("dock"));
  assert.equal(snapshot.bpm, 96, "opening show BPM");
  await beat.evaluate(() => window.__beatBentoDebug.queueNote(0, 0));
  await beat.keyboard.press("KeyA");
  snapshot = await beat.evaluate(() => window.__beatBentoDebug.snapshot());
  assert.ok(snapshot.score > 0, "real keyboard input judges a queued note");
  snapshot = await beat.evaluate(() => window.__beatBentoDebug.forceFinish({ served: 7, score: 9000, combo: 32 }));
  assert.equal(snapshot.career.stageStars.dock, 3, "beat show awards three stars");
  assert.match(await beat.locator("#overlayTitle").innerText(), /★★★/, "beat result renders stars");
  await beat.locator("#lobbyBtn").click();
  snapshot = await beat.evaluate(() => window.__beatBentoDebug.unlockAll());
  assert.equal(snapshot.totalStars, 36, "beat full tour total");
  await beat.locator('[data-chef="jin"]').click();
  await beat.locator('[data-show="full-moon"]').click();
  await beat.locator("#overlayStartBtn").click();
  snapshot = await beat.evaluate(() => window.__beatBentoDebug.snapshot());
  assert.equal(snapshot.chef, "jin", "selected chef enters performance");
  assert.equal(snapshot.modifier, "rush", "final show has speed-up rule");
  const beatCode = await beat.evaluate(() => window.__beatBentoDebug.encodeCareer());
  assert.match(beatCode, /^BENTO2\./, "beat V2 archive prefix");
  const beatImported = await beat.evaluate((code) => window.__beatBentoDebug.importCareer(code), beatCode);
  assert.equal(beatImported.selectedChef, "jin", "beat archive preserves chef");
  let signal = await canvasSignal(beat, "#gameCanvas");
  assert.ok(signal.opaque > 30 && signal.colors > 8, "beat canvas renders varied pixels");
  await noOverflow(beat, "beat desktop");
  await beat.screenshot({ path: path.join(articleImageDir, "beat-bento.png"), fullPage: true });

  const shadow = await desktop.newPage();
  observe(shadow);
  await shadow.goto(`http://127.0.0.1:${port}/shadow-post.html?debug=1`, { waitUntil: "load" });
  await shadow.waitForFunction(() => Boolean(window.__shadowPostDebug));
  assert.equal(await shadow.locator("[data-level]").count(), 12, "shadow campaign has twelve missions");
  const mapAudit = await shadow.evaluate(() => window.__shadowPostDebug.data.levels.map((level) => ({ rows: level.map.length, widths: [...new Set(level.map.map((row) => row.length))], starts: level.map.join("").split("S").length - 1, exits: level.map.join("").split("E").length - 1 })));
  assert.equal(mapAudit.every((item) => item.widths.length === 1 && item.starts === 1 && item.exits === 1), true, "all shadow maps are rectangular with endpoints");
  snapshot = await shadow.evaluate(() => window.__shadowPostDebug.start("night-1"));
  await shadow.keyboard.press("KeyD");
  snapshot = await shadow.evaluate(() => window.__shadowPostDebug.snapshot());
  assert.equal(snapshot.steps, 1, "real keyboard input moves courier one turn");
  snapshot = await shadow.evaluate(() => window.__shadowPostDebug.forceComplete({ steps: 10, toolsUsed: 0 }));
  assert.equal(snapshot.career.stageStars["night-1"], 3, "shadow mission awards three stars");
  await shadow.locator("#campaignBtn").click();
  snapshot = await shadow.evaluate(() => window.__shadowPostDebug.unlockAll());
  assert.equal(snapshot.totalStars, 36, "shadow full campaign total");
  await shadow.locator('[data-level="night-12"]').click();
  await shadow.locator("#campaignStartBtn").click();
  snapshot = await shadow.evaluate(() => window.__shadowPostDebug.snapshot());
  assert.equal(snapshot.guards.some((guard) => guard.type === "sentry"), true, "final mission includes long-range sentry");
  assert.equal(snapshot.guards.some((guard) => guard.type === "reverse"), true, "final mission includes reverse guard");
  const shadowCode = await shadow.evaluate(() => window.__shadowPostDebug.encodeCareer());
  assert.match(shadowCode, /^SHADOW2\./, "shadow V2 archive prefix");
  const shadowImported = await shadow.evaluate((code) => window.__shadowPostDebug.importCareer(code), shadowCode);
  assert.equal(shadowImported.selectedLevel, "night-12", "shadow archive preserves mission");
  signal = await canvasSignal(shadow, "#gameCanvas");
  assert.ok(signal.opaque > 30 && signal.colors > 8, "shadow canvas renders varied pixels");
  await noOverflow(shadow, "shadow desktop");
  await shadow.screenshot({ path: path.join(articleImageDir, "shadow-post.png"), fullPage: true });

  const sonar = await desktop.newPage();
  observe(sonar);
  await sonar.goto(`http://127.0.0.1:${port}/abyss-sonar.html?debug=1`, { waitUntil: "load" });
  await sonar.waitForFunction(() => Boolean(window.__abyssSonarDebug));
  assert.equal(await sonar.locator("[data-mission]").count(), 8, "sonar has eight patrols");
  assert.equal(await sonar.locator("[data-module]").count(), 6, "sonar has six modules");
  snapshot = await sonar.evaluate(() => window.__abyssSonarDebug.start("threshold"));
  const beforeNoise = snapshot.noise;
  snapshot = await sonar.evaluate(() => window.__abyssSonarDebug.revealAll());
  assert.ok(snapshot.noise > beforeNoise, "active sonar raises noise");
  const hostile = snapshot.contacts.find((contact) => ["hunter", "frigate", "mine"].includes(contact.kind));
  await sonar.evaluate((id) => window.__abyssSonarDebug.aim(id), hostile.id);
  await sonar.locator("#fireBtn").click();
  snapshot = await sonar.evaluate(() => window.__abyssSonarDebug.snapshot());
  assert.equal(snapshot.torpedoes, 9, "real fire button consumes a torpedo");
  assert.equal(snapshot.contacts.find((contact) => contact.id === hostile.id).destroyed, true, "aimed torpedo destroys hunter");
  snapshot = await sonar.evaluate(() => window.__abyssSonarDebug.forceComplete({ hull: 100, torpedoes: 5 }));
  assert.equal(snapshot.career.stageStars.threshold, 3, "sonar patrol awards three stars");
  await sonar.locator("#backBtn").click();
  await sonar.evaluate(() => window.__abyssSonarDebug.unlockAll());
  await sonar.locator('[data-module="hull"]').click();
  await sonar.locator('[data-module="magazine"]').click();
  await sonar.locator('[data-mission="abyss-core"]').click();
  await sonar.locator("#diveBtn").click();
  snapshot = await sonar.evaluate(() => window.__abyssSonarDebug.snapshot());
  assert.equal(snapshot.hull, 125, "hull module changes initial hull");
  assert.equal(snapshot.torpedoes, 12, "magazine module changes initial torpedoes");
  const sonarCode = await sonar.evaluate(() => window.__abyssSonarDebug.encodeCareer());
  assert.match(sonarCode, /^SONAR2\./, "sonar V2 archive prefix");
  const sonarImported = await sonar.evaluate((code) => window.__abyssSonarDebug.importCareer(code), sonarCode);
  assert.deepEqual(sonarImported.modules, ["hull", "magazine"], "sonar archive preserves loadout");
  signal = await canvasSignal(sonar, "#sonar");
  assert.ok(signal.opaque > 30 && signal.colors > 6, "sonar canvas renders varied pixels");
  await noOverflow(sonar, "sonar desktop");
  await sonar.screenshot({ path: path.join(articleImageDir, "abyss-sonar.png"), fullPage: true });
  assert.deepEqual(failures, [], "desktop browser errors");
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: "dark" });
  for (const [file, debugName, startId, screenshot, canvasSelector] of [
    ["beat-bento.html", "__beatBentoDebug", "dock", "beat-bento-tour-mobile.png", "#gameCanvas"],
    ["shadow-post.html", "__shadowPostDebug", "night-1", "shadow-post-campaign-mobile.png", "#gameCanvas"],
    ["abyss-sonar.html", "__abyssSonarDebug", "threshold", "abyss-sonar-route-mobile.png", "#sonar"]
  ]) {
    const page = await mobile.newPage();
    observe(page);
    await page.goto(`http://127.0.0.1:${port}/${file}?debug=1`, { waitUntil: "load" });
    await page.waitForFunction((name) => Boolean(window[name]), debugName);
    await page.evaluate(([name, id]) => window[name].start(id), [debugName, startId]);
    await page.waitForTimeout(450);
    const mobileSignal = await canvasSignal(page, canvasSelector);
    assert.ok(mobileSignal.opaque > 30 && mobileSignal.colors > 6, `${file} mobile canvas signal`);
    await noOverflow(page, `${file} mobile`);
    await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: true });
    await page.close();
  }
  assert.deepEqual(failures, [], "mobile browser errors");
  await mobile.close();

  console.log(JSON.stringify({
    beatBento: { shows: 12, chefs: 4 },
    shadowPost: { missions: 12, guardRules: 4 },
    abyssSonar: { patrols: 8, modules: 6 },
    screenshots: ["beat-bento-tour", "shadow-post-campaign", "abyss-sonar-route"],
    failures
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
