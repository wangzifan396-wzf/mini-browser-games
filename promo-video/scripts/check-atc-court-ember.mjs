import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output", "atc-court-ember");
const port = 4188;
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

async function moveCourtLine(page, target) {
  let current = await page.evaluate(() => window.__courtroom.run().line);
  while (current < target) {
    await page.locator("#nextBtn").click();
    current += 1;
  }
  while (current > target) {
    await page.locator("#prevBtn").click();
    current -= 1;
  }
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

  const atc = await desktop.newPage();
  observe(atc);
  await atc.goto(`http://127.0.0.1:${port}/air-traffic-control.html`, { waitUntil: "load" });
  await atc.waitForFunction(() => Boolean(window.__airTraffic));
  assert.deepEqual(
    await atc.evaluate(() => window.__airTraffic.validateContent()),
    { valid: true, errors: [], airports: 3, shifts: 9, flights: 55, types: 4 },
    "ATC content audit"
  );
  await atc.locator("#startBtn").click();
  await atc.evaluate(() => {
    const api = window.__airTraffic;
    const state = api.state();
    const shift = api.SHIFTS[0];
    state.planes = [];
    state.next = shift.flights.length;
    state.clock = shift.flights.at(-1).at + 5;
    state.landed = shift.target - 1;
    state.priorityLanded = state.priorityTotal - 1;
    const plane = api.spawnPlane({ side: 0, type: "med", code: "TEST1" });
    plane.x = 375;
    plane.y = 250;
    plane.h = 0;
    plane.alt = 1;
    api.renderAll();
  });
  const canvasBox = await atc.locator("#radarCanvas").boundingBox();
  await atc.mouse.click(
    canvasBox.x + (375 / 960) * canvasBox.width,
    canvasBox.y + (250 / 650) * canvasBox.height
  );
  await atc.locator('[data-rw="A"]').click();
  await atc.locator("#clearBtn").click();
  await atc.evaluate(() => window.__airTraffic.step(0.5));
  assert.equal(await atc.evaluate(() => window.__airTraffic.profile().stars[0]), 3, "real ATC landing awards three stars");
  const atcCode = await atc.evaluate(() => window.__airTraffic.encode());
  assert.match(atcCode, /^ATC2\./, "ATC archive prefix");
  assert.equal(await atc.evaluate((code) => window.__airTraffic.decode(code).stars[0], atcCode), 3, "ATC archive round trip");
  const atcSignal = await canvasSignal(atc, "#radarCanvas");
  assert.ok(atcSignal.opaque > 30 && atcSignal.colors > 8, "ATC canvas signal");
  await noOverflow(atc, "ATC desktop");
  await atc.screenshot({ path: path.join(outputDir, "atc-desktop.png"), fullPage: true });

  const court = await desktop.newPage();
  observe(court);
  await court.goto(`http://127.0.0.1:${port}/courtroom-clash.html`, { waitUntil: "load" });
  await court.waitForFunction(() => Boolean(window.__courtroom));
  assert.deepEqual(
    await court.evaluate(() => window.__courtroom.validateCases()),
    { valid: true, errors: [], cases: 6, phases: 18, statements: 72, evidence: 30 },
    "court content audit"
  );
  for (let phaseIndex = 0; phaseIndex < 3; phaseIndex += 1) {
    const data = await court.evaluate((index) => {
      const courtCase = window.__courtroom.CASES[0];
      const phase = courtCase.phases[index];
      const evidence = courtCase.evidence.find((item) => item[0] === phase.answer[1]);
      let unlockLine = -1;
      if (evidence[4]) unlockLine = phase.lines.findIndex((line) => line[2] === phase.answer[1]);
      return { line: phase.answer[0], evidence: phase.answer[1], unlockLine };
    }, phaseIndex);
    if (data.unlockLine >= 0) {
      await moveCourtLine(court, data.unlockLine);
      await court.locator("#pressBtn").click();
    }
    await moveCourtLine(court, data.line);
    await court.locator(`[data-evidence="${data.evidence}"]`).click();
    await court.locator("#objectBtn").click();
  }
  const closing = await court.evaluate(() => window.__courtroom.CASES[0].close.answer);
  await court.locator("#culpritSelect").selectOption(String(closing[0]));
  await court.locator("#methodSelect").selectOption(String(closing[1]));
  await court.locator("#closeCaseBtn").click();
  assert.equal(await court.evaluate(() => window.__courtroom.profile().stars[0]), 3, "real court case awards three stars");
  const courtCode = await court.evaluate(() => window.__courtroom.encode());
  assert.match(courtCode, /^COURT2\./, "court archive prefix");
  assert.equal(await court.evaluate((code) => window.__courtroom.decode(code).stars[0], courtCode), 3, "court archive round trip");
  await noOverflow(court, "court desktop");
  await court.screenshot({ path: path.join(outputDir, "court-desktop.png"), fullPage: true });

  const ember = await desktop.newPage();
  observe(ember);
  await ember.goto(`http://127.0.0.1:${port}/ember-tactics.html`, { waitUntil: "load" });
  await ember.waitForFunction(() => Boolean(window.__emberTactics));
  assert.deepEqual(
    await ember.evaluate(() => window.__emberTactics.validateContent()),
    { valid: true, errors: [], missions: 9, heroes: 6, sigils: 8, objectiveTypes: 5 },
    "ember content audit"
  );
  await ember.locator("#startBtn").click();
  const beforeEnemy = await ember.evaluate(() => window.__emberTactics.state().enemies[0].hp);
  await ember.evaluate(() => {
    const api = window.__emberTactics;
    api.state().heroes[0].pos = 16;
    api.renderAll();
  });
  await ember.locator('[data-cell="16"]').click();
  await ember.locator('[data-cell="8"]').click();
  assert.ok(
    await ember.evaluate((before) => window.__emberTactics.state().enemies[0].hp < before, beforeEnemy),
    "real tactical attack damages enemy"
  );
  await ember.evaluate(() => {
    const api = window.__emberTactics;
    api.state().heroes[0].done = false;
    api.renderAll();
  });
  await ember.locator('[data-cell="16"]').click();
  await ember.locator("#skillBtn").click();
  assert.equal(await ember.evaluate(() => window.__emberTactics.state().enemies.length), 2, "real class skill defeats adjacent enemy");
  await ember.evaluate(() => {
    const api = window.__emberTactics;
    const state = api.state();
    state.enemies = [];
    state.lost = 0;
    state.turn = 1;
    api.finish(true);
  });
  assert.equal(await ember.evaluate(() => window.__emberTactics.profile().stars[0]), 3, "tactical mission awards three stars");
  const objectiveResults = await ember.evaluate(() => {
    const api = window.__emberTactics;
    api.profile().unlocked = 8;
    return api.MISSIONS.map((mission, index) => {
      api.selectMission(index);
      api.start();
      const state = api.state();
      if (mission.type === "eliminate" || mission.type === "boss") state.enemies = [];
      if (mission.type === "seal") state.sealed = [...mission.objectives];
      if (mission.type === "escape") state.escaped = 2;
      if (mission.type === "defend") state.turn = mission.rounds + 1;
      api.checkOutcome();
      return { type: mission.type, mode: state.mode };
    });
  });
  assert.equal(objectiveResults.every((item) => item.mode === "result"), true, "all tactical objective types can resolve");
  const emberCode = await ember.evaluate(() => window.__emberTactics.encode());
  assert.match(emberCode, /^EMBER2\./, "ember archive prefix");
  assert.equal(await ember.evaluate((code) => window.__emberTactics.decode(code).stars[0], emberCode), 3, "ember archive round trip");
  await noOverflow(ember, "ember desktop");
  await ember.screenshot({ path: path.join(outputDir, "ember-desktop.png"), fullPage: true });
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
    ["air-traffic-control.html", "__airTraffic", async (page) => {
      await page.locator("#startBtn").tap();
      assert.equal(await page.evaluate(() => window.__airTraffic.state().mode), "playing", "ATC mobile start");
    }],
    ["courtroom-clash.html", "__courtroom", async (page) => {
      await page.locator("#pressBtn").tap();
      assert.equal(await page.evaluate(() => window.__courtroom.run().presses), 1, "court mobile press");
    }],
    ["ember-tactics.html", "__emberTactics", async (page) => {
      await page.locator("#startBtn").tap();
      await page.locator('[data-cell="56"]').tap();
      assert.equal(await page.evaluate(() => window.__emberTactics.state().selected?.type), "knight", "ember mobile selection");
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
    atc: { airports: 3, shifts: 9, flights: 55, archive: "ATC2" },
    court: { cases: 6, phases: 18, statements: 72, evidence: 30, archive: "COURT2" },
    ember: { missions: 9, heroes: 6, sigils: 8, objectiveTypes: 5, archive: "EMBER2" },
    failures
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
