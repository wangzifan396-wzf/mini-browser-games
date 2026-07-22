import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output", "growth-and-cycles");
const port = 4186;
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

  const comet = await desktop.newPage();
  observe(comet);
  await comet.goto(`http://127.0.0.1:${port}/comet-weaver.html`, { waitUntil: "load" });
  await comet.waitForFunction(() => Boolean(window.__cometWeaver));
  assert.equal(await comet.evaluate(() => window.__cometWeaver.STAGES.length), 12, "comet has twelve stages");
  assert.equal(await comet.evaluate(() => window.__cometWeaver.MODULES.length), 6, "comet has six modules");
  assert.equal(
    await comet.evaluate(() => window.__cometWeaver.STAGES.every((stage) => stage.patterns.length >= 2 && stage.hp > 0 && stage.par > 0)),
    true,
    "comet stage data is complete"
  );
  await comet.locator("#overlayBtn").click();
  await comet.waitForFunction(() => window.__cometWeaver.state().mode === "running");
  await comet.locator("#blinkBtn").click();
  assert.ok(await comet.evaluate(() => window.__cometWeaver.state().player.blink > 0), "comet real blink starts cooldown");
  await comet.evaluate(() => {
    const state = window.__cometWeaver.state();
    state.charge = state.maxCharge;
    state.bullets.push({ x: 100, y: 100, vx: 0, vy: 0, r: 5, color: "#fff", type: "normal", grazed: false, age: 0 });
  });
  await comet.locator("#novaBtn").click();
  assert.equal(await comet.evaluate(() => window.__cometWeaver.state().bullets.length), 0, "comet nova clears bullets");
  await comet.evaluate(() => {
    const api = window.__cometWeaver;
    const state = api.state();
    state.boss = 0;
    state.graze = api.STAGES[0].graze;
    state.hits = 0;
    api.finish(true);
  });
  assert.equal(await comet.evaluate(() => window.__cometWeaver.career().stars[0]), 3, "comet completion awards three stars");
  const cometCode = await comet.evaluate(() => window.__cometWeaver.encode());
  assert.match(cometCode, /^COMET2\./, "comet archive prefix");
  assert.equal(await comet.evaluate((code) => window.__cometWeaver.decode(code).stars[0], cometCode), 3, "comet archive round trip");
  let signal = await canvasSignal(comet, "#gameCanvas");
  assert.ok(signal.opaque > 30 && signal.colors > 6, "comet canvas signal");
  await noOverflow(comet, "comet desktop");
  await comet.screenshot({ path: path.join(outputDir, "comet-desktop.png"), fullPage: true });

  const companion = await desktop.newPage();
  observe(companion);
  await companion.goto(`http://127.0.0.1:${port}/pocket-companion.html`, { waitUntil: "load" });
  await companion.waitForFunction(() => Boolean(window.__pocketCompanion));
  assert.equal(await companion.evaluate(() => window.__pocketCompanion.JOURNEYS.length), 4, "companion has four journeys");
  assert.equal(await companion.evaluate(() => window.__pocketCompanion.FORMS.length), 8, "companion has eight final forms");
  assert.equal(await companion.evaluate(() => window.__pocketCompanion.FACILITIES.length), 4, "companion has four facilities");
  await companion.locator('[data-act="feed"]').click();
  assert.equal(await companion.evaluate(() => window.__pocketCompanion.run().actions), 2, "companion real care spends an action");
  await companion.evaluate(() => {
    const api = window.__pocketCompanion;
    for (let day = api.run().day; day < 12; day += 1) {
      const run = api.run();
      run.actions = 0;
      run.food = run.joy = run.clean = 100;
      run.bond = 40;
      run.traits.brave = 15;
      api.nextDay();
    }
  });
  const companionResult = await companion.evaluate(() => ({
    complete: window.__pocketCompanion.run().complete,
    form: window.__pocketCompanion.run().form,
    stars: window.__pocketCompanion.career().stars[0]
  }));
  assert.deepEqual(companionResult, { complete: true, form: 0, stars: 3 }, "companion deterministic growth result");
  const petCode = await companion.evaluate(() => window.__pocketCompanion.encode());
  assert.match(petCode, /^PET2\./, "companion archive prefix");
  assert.equal(await companion.evaluate((code) => window.__pocketCompanion.decode(code).dex.includes(0), petCode), true, "companion archive round trip");
  await noOverflow(companion, "companion desktop");
  await companion.screenshot({ path: path.join(outputDir, "companion-desktop.png"), fullPage: true });

  const market = await desktop.newPage();
  observe(market);
  await market.goto(`http://127.0.0.1:${port}/market-pulse.html`, { waitUntil: "load" });
  await market.waitForFunction(() => Boolean(window.__marketPulse));
  assert.equal(await market.evaluate(() => window.__marketPulse.COMPANIES.length), 8, "market has eight companies");
  assert.equal(await market.evaluate(() => window.__marketPulse.SCENARIOS.length), 6, "market has six scenarios");
  const modelValidation = await market.evaluate(() => window.__marketPulse.validateModel());
  assert.deepEqual(modelValidation, { valid: true, errors: [], scenarios: 6, simulatedDays: 240 }, "market model invariant audit");
  const scenarioSolvability = await market.evaluate(() => {
    const api = window.__marketPulse;
    return api.SCENARIOS.map((scenario, scenarioIndex) => {
      let stocks = api.COMPANIES.map((company) => ({
        price: company.price,
        last: company.price,
        shares: 0,
        avg: 0,
        history: [company.price]
      }));
      const paths = [stocks.map((stock) => stock.price)];
      let active = [];
      for (let day = 1; day <= 18; day += 1) {
        const event = api.eventFor(scenarioIndex, day);
        active.push({ ...event, remaining: event.days });
        stocks = api.advancePrices(stocks, scenarioIndex, day, active);
        paths.push(stocks.map((stock) => stock.price));
        active = active.map((eventItem) => ({ ...eventItem, remaining: eventItem.remaining - 1 }))
          .filter((eventItem) => eventItem.remaining > 0);
      }
      let solution = null;
      const units = Array(8).fill(0);
      const evaluate = () => {
        let cash = 100000;
        const shares = units.map((unit, index) => {
          const count = Math.floor(unit / 10 * 100000 / paths[0][index]);
          const gross = count * paths[0][index];
          cash -= gross * 1.0015;
          return count;
        });
        if (cash < -0.01) return;
        let peak = 100000;
        let maxDrawdown = 0;
        let dividends = 0;
        for (let day = 1; day <= 18; day += 1) {
          if (day % 6 === 0) {
            const income = Math.round(shares.reduce(
              (sum, count, index) => sum + count * api.COMPANIES[index].dividend * 0.12,
              0
            ));
            cash += income;
            dividends += income;
          }
          const worth = cash + shares.reduce((sum, count, index) => sum + count * paths[day][index], 0);
          peak = Math.max(peak, worth);
          maxDrawdown = Math.max(maxDrawdown, (peak - worth) / peak);
        }
        const finalWorth = cash + shares.reduce((sum, count, index) => sum + count * paths[18][index], 0);
        if (finalWorth < 100000 * scenario.target || maxDrawdown > scenario.maxDD) return;
        const values = shares.map((count, index) => count * paths[18][index]);
        const sectorWeights = { 科技: 0, 能源: 0, 金融: 0, 民生: 0 };
        values.forEach((value, index) => { sectorWeights[api.COMPANIES[index].sector] += value / finalWorth; });
        const heldSectors = Object.values(sectorWeights).filter((weight) => weight > 0.01).length;
        const concentration = Math.max(0, ...values.map((value) => value / finalWorth));
        const special = scenario.special === "sectors2" ? heldSectors >= 2
          : scenario.special === "cash20" ? cash / finalWorth >= 0.2
            : scenario.special === "green35" ? values[2] / finalWorth >= 0.35
              : scenario.special === "concentration45" ? concentration <= 0.45
                : scenario.special === "dividend300" ? dividends >= 300
                  : heldSectors >= 4;
        if (special) solution = { units: units.slice(), finalWorth: Math.round(finalWorth), maxDrawdown };
      };
      const search = (index, remaining) => {
        if (solution) return;
        if (index === units.length) return evaluate();
        for (let unit = 0; unit <= remaining && !solution; unit += 1) {
          units[index] = unit;
          search(index + 1, remaining - unit);
        }
      };
      search(0, 10);
      return { scenario: scenarioIndex + 1, solved: Boolean(solution), solution };
    });
  });
  assert.equal(
    scenarioSolvability.every((item) => item.solved),
    true,
    `all market scenarios have buy-and-hold three-star portfolios: ${JSON.stringify(scenarioSolvability)}`
  );
  await market.locator('[data-company="0"] [data-buy=".1"]').click();
  assert.ok(await market.evaluate(() => window.__marketPulse.run().stocks[0].shares > 0), "market real order buys shares");
  await market.locator("#closeBtn").click();
  assert.equal(await market.evaluate(() => window.__marketPulse.run().day), 2, "market real close advances a day");
  assert.ok(await market.evaluate(() => Number.isFinite(window.__marketPulse.total()) && window.__marketPulse.total() > 0), "market account remains finite");
  await market.evaluate(() => {
    const api = window.__marketPulse;
    const run = api.run();
    run.cash = 105000;
    run.stocks.forEach((stock) => { stock.shares = 0; });
    run.stocks[0].shares = 20;
    run.stocks[2].shares = 20;
    run.maxDD = 0;
    run.over = false;
    api.finishScenario();
  });
  assert.equal(await market.evaluate(() => window.__marketPulse.career().stars[0]), 3, "market mandate awards three stars");
  const marketCode = await market.evaluate(() => window.__marketPulse.encode());
  assert.match(marketCode, /^MARKET2\./, "market archive prefix");
  assert.equal(await market.evaluate((code) => window.__marketPulse.decode(code).stars[0], marketCode), 3, "market archive round trip");
  signal = await canvasSignal(market, "#chart");
  assert.ok(signal.opaque > 30 && signal.colors > 4, "market chart signal");
  await noOverflow(market, "market desktop");
  await market.screenshot({ path: path.join(outputDir, "market-desktop.png"), fullPage: true });
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
    ["comet-weaver.html", "__cometWeaver", async (page) => {
      await page.locator("#overlayBtn").tap();
      await page.locator("#blinkBtn").tap();
      assert.ok(await page.evaluate(() => window.__cometWeaver.state().player.blink > 0), "comet mobile blink");
      await page.evaluate(() => { window.__cometWeaver.state().boss = 0; window.__cometWeaver.finish(true); });
    }],
    ["pocket-companion.html", "__pocketCompanion", async (page) => {
      await page.locator('[data-act="clean"]').tap();
      assert.equal(await page.evaluate(() => window.__pocketCompanion.run().actions), 2, "companion mobile care");
    }],
    ["market-pulse.html", "__marketPulse", async (page) => {
      await page.locator('[data-company="0"] [data-buy=".1"]').tap();
      assert.ok(await page.evaluate(() => window.__marketPulse.run().stocks[0].shares > 0), "market mobile order");
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
    comet: { stages: 12, modules: 6, archive: "COMET2" },
    companion: { journeys: 4, forms: 8, archive: "PET2" },
    market: { scenarios: 6, companies: 8, invariantDays: 240, archive: "MARKET2" },
    marketSolvability: "6/6 buy-and-hold three-star portfolios found",
    failures
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
