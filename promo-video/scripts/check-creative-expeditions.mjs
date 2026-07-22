import assert from "node:assert/strict";
import http from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "output", "creative-expeditions");
const port = 4185;
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

  const element = await desktop.newPage();
  observe(element);
  await element.goto(`http://127.0.0.1:${port}/elemental-sandbox.html`, { waitUntil: "load" });
  await element.waitForFunction(() => Boolean(window.__elementLab));
  assert.equal(await element.evaluate(() => window.__elementLab.MISSIONS.length), 9, "element lab has nine studies");
  assert.equal(await element.evaluate(() => window.__elementLab.REACTIONS.length), 9, "element lab tracks nine reactions");
  await element.evaluate(() => {
    const api = window.__elementLab;
    const grid = api.grid;
    const width = 192;
    const height = 108;
    for (let y = height - 7; y < height; y += 1) {
      for (let x = 0; x < 14; x += 1) grid[y * width + x] = 1;
    }
  });
  await element.waitForFunction(() => window.__elementLab.progress() >= 1);
  await element.locator("#claimBtn").click();
  assert.equal(await element.evaluate(() => window.__elementLab.state().stars[0]), 3, "element real submit awards three stars");
  const elementCode = await element.evaluate(() => window.__elementLab.encode());
  assert.match(elementCode, /^ELEM2\./, "element archive prefix");
  assert.equal(
    await element.evaluate((code) => window.__elementLab.decode(code).stars[0], elementCode),
    3,
    "element archive round trip"
  );
  let signal = await canvasSignal(element, "#labCanvas");
  assert.ok(signal.opaque > 30 && signal.colors >= 2, "element lab canvas renders material pixels");
  await noOverflow(element, "element desktop");
  await element.screenshot({ path: path.join(outputDir, "element-desktop.png"), fullPage: true });

  const tide = await desktop.newPage();
  observe(tide);
  await tide.goto(`http://127.0.0.1:${port}/tide-salvage.html`, { waitUntil: "load" });
  await tide.waitForFunction(() => Boolean(window.__tideSalvage));
  assert.equal(await tide.evaluate(() => window.__tideSalvage.ROUTES.length), 5, "tide has five sea routes");
  assert.equal(await tide.evaluate(() => window.__tideSalvage.RELICS.length), 16, "tide has sixteen relics");
  await tide.locator("#overlayBtn").click();
  await tide.waitForFunction(() => window.__tideSalvage.dive().mode === "running");
  await tide.evaluate(() => {
    const api = window.__tideSalvage;
    const dive = api.dive();
    const relic = api.RELICS[0];
    dive.items = [{ ...relic, id: 0, x: dive.player.x, y: dive.player.y, r: 12, reveal: 0, phase: 0 }];
  });
  await tide.waitForFunction(() => window.__tideSalvage.dive().cargo.length === 1);
  await tide.evaluate(() => { window.__tideSalvage.dive().player.y = 80; });
  await tide.waitForFunction(() => window.__tideSalvage.dive().banked > 0);
  assert.equal(await tide.evaluate(() => window.__tideSalvage.career().found.includes(0)), true, "tide banks a real relic at surface");
  await tide.locator("#sonarBtn").click();
  assert.ok(await tide.evaluate(() => window.__tideSalvage.dive().sonar > 0), "tide sonar starts cooldown");
  const tideCode = await tide.evaluate(() => window.__tideSalvage.encode());
  assert.match(tideCode, /^TIDE2\./, "tide archive prefix");
  assert.equal(
    await tide.evaluate((code) => window.__tideSalvage.decode(code).found.includes(0), tideCode),
    true,
    "tide archive round trip"
  );
  signal = await canvasSignal(tide, "#gameCanvas");
  assert.ok(signal.opaque > 30 && signal.colors > 8, "tide canvas renders varied pixels");
  await noOverflow(tide, "tide desktop");
  await tide.screenshot({ path: path.join(outputDir, "tide-desktop.png"), fullPage: true });
  await tide.evaluate(() => window.__tideSalvage.finish("测试结束"));

  const pulse = await desktop.newPage();
  observe(pulse);
  await pulse.goto(`http://127.0.0.1:${port}/pulse-studio.html`, { waitUntil: "load" });
  await pulse.waitForFunction(() => Boolean(window.__pulseStudio));
  assert.equal(await pulse.evaluate(() => window.__pulseStudio.TRACKS.length), 6, "pulse has six tracks");
  assert.equal(await pulse.evaluate(() => window.__pulseStudio.GIGS.length), 12, "pulse has twelve gigs");
  await pulse.evaluate(() => {
    const api = window.__pulseStudio;
    [[0,0,3],[0,4,3],[0,8,3],[0,12,2],[1,4,2],[1,12,2],[2,1,2],[2,3,2],[2,5,2],[2,7,2]]
      .forEach(([track, step, level]) => api.setCell(track, step, level));
  });
  assert.equal(await pulse.evaluate(() => window.__pulseStudio.rating().stars), 3, "pulse structure checker awards three stars");
  await pulse.locator("#submitBtn").click();
  assert.equal(await pulse.evaluate(() => window.__pulseStudio.career().stars[0]), 3, "pulse real submit saves rating");
  const pulseCode = await pulse.evaluate(() => window.__pulseStudio.encode());
  assert.match(pulseCode, /^PULSE2\./, "pulse archive prefix");
  assert.equal(
    await pulse.evaluate((code) => window.__pulseStudio.decode(code).stars[0], pulseCode),
    3,
    "pulse archive round trip"
  );
  await pulse.locator("#playBtn").click();
  await pulse.waitForTimeout(220);
  await pulse.locator("#playBtn").click();
  await noOverflow(pulse, "pulse desktop");
  await pulse.screenshot({ path: path.join(outputDir, "pulse-desktop.png"), fullPage: true });
  const gigSolvability = await pulse.evaluate(() => {
    const api = window.__pulseStudio;
    api.career().unlocked = 11;
    let seed = 0x9e3779b9;
    const random = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
    return api.GIGS.map((_, gigIndex) => {
      api.chooseGig(gigIndex);
      const grid = api.pattern();
      let solved = false;
      let attempts = 0;
      for (; attempts < 60000 && !solved; attempts += 1) {
        for (let track = 0; track < 6; track += 1) {
          for (let step = 0; step < 16; step += 1) {
            let chance = gigIndex === 6 ? 0.16 : 0.29;
            if (gigIndex === 7) chance = step < 8 ? 0.12 : 0.42;
            if (gigIndex === 4 && track === 4 && step < 8) chance = 0.48;
            if (gigIndex === 4 && track === 5 && step >= 8) chance = 0.48;
            grid[track][step] = random() < chance ? (random() < 0.34 ? 3 : 2) : 0;
          }
        }
        solved = api.rating().stars === 3;
      }
      return { gig: gigIndex + 1, solved, attempts };
    });
  });
  assert.equal(gigSolvability.every((item) => item.solved), true, `all pulse gigs have three-star arrangements: ${JSON.stringify(gigSolvability)}`);
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
    ["elemental-sandbox.html", "__elementLab", async (page) => {
      const box = await page.locator("#labCanvas").boundingBox();
      await page.touchscreen.tap(box.x + box.width * 0.4, box.y + box.height * 0.3);
      await page.waitForTimeout(80);
      assert.ok(await page.evaluate(() => window.__elementLab.grid.some((value) => value > 0)), "element touch paints material");
    }],
    ["tide-salvage.html", "__tideSalvage", async (page) => {
      await page.locator("#overlayBtn").tap();
      await page.locator('[data-dir="down"]').tap();
      assert.equal(await page.evaluate(() => window.__tideSalvage.dive().mode), "running", "tide touch starts dive");
      await page.evaluate(() => window.__tideSalvage.finish("移动测试"));
    }],
    ["pulse-studio.html", "__pulseStudio", async (page) => {
      const step = page.locator('[data-r="0"][data-i="0"]');
      await step.tap();
      await step.tap();
      await step.tap();
      assert.equal(await page.evaluate(() => window.__pulseStudio.pattern()[0][0]), 3, "pulse touch cycles intensity");
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
    element: { studies: 9, reactions: 9, archive: "ELEM2" },
    tide: { routes: 5, relics: 16, archive: "TIDE2" },
    pulse: { tracks: 6, gigs: 12, archive: "PULSE2" },
    pulseSolvability: "12/12 three-star arrangements found",
    failures
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
