import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const gameDir = path.join(rootDir, "star-cluster-arena");
const outputDir = path.join(rootDir, "docs", "images", "browser-performance");
const screenshotPath = path.join(outputDir, "star-cluster-stress.jpg");
const measurementPath = path.join(outputDir, "runtime-measurement.json");
const host = "127.0.0.1";
const port = 25556;
const origin = `http://${host}:${port}`;
const pageUrl = `${origin}/?debug=1&refresh=120`;

await mkdir(outputDir, { recursive: true });

const serverLines = [];
const server = spawn(process.execPath, ["backend/server.mjs"], {
  cwd: gameDir,
  env: { ...process.env, HOST: host, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});
server.stdout.on("data", chunk => serverLines.push(chunk.toString().trim()));
server.stderr.on("data", chunk => serverLines.push(chunk.toString().trim()));

async function waitForJson(url, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || "unknown error"}`);
}

async function closeServer() {
  if (server.exitCode !== null || server.killed) return;
  const exited = new Promise(resolve => server.once("exit", resolve));
  server.kill("SIGTERM");
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2_000))]);
  if (server.exitCode === null && !server.killed) server.kill();
}

let browser;
let context;
const pageErrors = [];
const consoleErrors = [];

try {
  const health = await waitForJson(`${origin}/api/health`);
  const runtime = await waitForJson(`${origin}/api/runtime`);

  let browserChannel = "bundled-chromium";
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    browserChannel = "msedge";
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "no-preference"
  });
  const page = await context.newPage();
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__ballArenaDebug), null, { timeout: 15_000 });
  const userAgent = await page.evaluate(() => navigator.userAgent);

  await page.evaluate(() => window.__ballArenaDebug.startMode("battle"));
  await page.waitForTimeout(6_000);
  const normal = await page.evaluate(() => window.__ballArenaDebug.snapshot());

  const stressSetup = await page.evaluate(() => window.__ballArenaDebug.stressLateGame("battle"));
  await page.waitForTimeout(8_000);
  const stressMeasured = await page.evaluate(() => window.__ballArenaDebug.snapshot());

  // Refill the deterministic stress fixture immediately before the screenshot
  // so the illustration visibly contains the configured upper-bound objects.
  const screenshotSetup = await page.evaluate(() => window.__ballArenaDebug.stressLateGame("battle"));
  await page.waitForTimeout(700);
  const screenshotSnapshot = await page.evaluate(() => window.__ballArenaDebug.snapshot());
  await page.screenshot({
    path: screenshotPath,
    type: "jpeg",
    quality: 94,
    fullPage: false
  });

  assert.equal(normal.targetPlayers, 100, "battle mode should contain one player and 99 AI");
  assert.equal(normal.foodBase, 2100, "base food count");
  assert.equal(stressSetup.foodCount, stressSetup.foodMax, "stress fixture should fill food capacity");
  assert.equal(stressSetup.ejected, stressSetup.maxEjected, "stress fixture should fill ejected capacity");
  assert.equal(normal.simulationFps, 60, "fixed simulation rate");
  assert.equal(normal.targetFps, 120, "requested high-refresh render target");
  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(" | ")}`);

  const environment = {
    capturedAt: new Date().toISOString(),
    methodology: "Playwright headless browser; normal battle sampled after 6 seconds, stress battle sampled after 8 seconds",
    limitation: "This reproducible headless run is a diagnostic sample, not a cross-device benchmark.",
    browserChannel,
    browserVersion: browser.version(),
    userAgent,
    viewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
    requestedRefreshRate: 120,
    platform: process.platform,
    node: process.version
  };

  await context.close();
  context = null;
  await new Promise(resolve => setTimeout(resolve, 500));
  const telemetry = await waitForJson(`${origin}/api/telemetry`);

  const measurement = {
    environment,
    api: { health, runtime, telemetry },
    samples: { normal, stressSetup, stressMeasured, screenshotSetup, screenshotSnapshot },
    diagnostics: { pageErrors, consoleErrors: [...new Set(consoleErrors)] },
    artifacts: {
      screenshot: "docs/images/browser-performance/star-cluster-stress.jpg",
      measurement: "docs/images/browser-performance/runtime-measurement.json"
    }
  };
  await writeFile(measurementPath, `${JSON.stringify(measurement, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    checks: "PASS",
    renderer: stressMeasured.renderer,
    normal: {
      avgFrame: normal.avgFrame,
      avgWork: normal.avgWork,
      food: normal.foodCount,
      cells: normal.drawnCells
    },
    stress: {
      avgFrame: stressMeasured.avgFrame,
      avgWork: stressMeasured.avgWork,
      food: stressMeasured.foodCount,
      cells: stressMeasured.drawnCells,
      ejected: stressMeasured.ejected,
      lowQuality: stressMeasured.lowQuality
    },
    screenshot: path.relative(rootDir, screenshotPath),
    measurement: path.relative(rootDir, measurementPath),
    consoleErrors: [...new Set(consoleErrors)]
  }, null, 2));
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await closeServer();
  if (serverLines.filter(Boolean).length) {
    console.error(serverLines.filter(Boolean).join("\n"));
  }
}
