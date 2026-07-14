import http from "node:http";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const promoDir = path.resolve(here, "..");
const rootDir = path.resolve(promoDir, "..");
const recordingsDir = path.join(promoDir, "recordings");
const recordingsHqDir = path.join(promoDir, "recordings-hq");
const workDir = path.join(promoDir, "work", "playwright-video");
const hqMode = process.argv.includes("--hq");
const scenes = JSON.parse(
  await readFile(path.join(promoDir, "config", "scenes.json"), "utf8"),
);
const requested = process.argv.find((arg) => arg.startsWith("--scene="));
const requestedId = requested?.split("=")[1] || "all";
const selectedScenes =
  requestedId === "all"
    ? scenes
    : scenes.filter((scene) => scene.id === requestedId);

if (!selectedScenes.length) {
  throw new Error(`Unknown scene: ${requestedId}`);
}

await mkdir(recordingsDir, { recursive: true });
await mkdir(recordingsHqDir, { recursive: true });
await mkdir(workDir, { recursive: true });

const fullFfmpeg =
  process.env.FFMPEG_PATH ||
  path.join(os.homedir(), "AppData", "Roaming", "bilibili", "ffmpeg", "ffmpeg.exe");

function runProcess(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: promoDir, windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-20_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed (${code})\n${stderr}`));
    });
  });
}

async function beginHighQualityCapture(page, scene) {
  const framesDir = path.join(workDir, "hq-frames", scene.id);
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  const session = await page.context().newCDPSession(page);
  let firstTimestamp = null;
  let nextFrameTime = 0;
  let frameIndex = 0;
  let lastBuffer = null;
  const writes = [];
  const wallStart = Date.now();

  session.on("Page.screencastFrame", (event) => {
    session
      .send("Page.screencastFrameAck", { sessionId: event.sessionId })
      .catch(() => {});
    const buffer = Buffer.from(event.data, "base64");
    lastBuffer = buffer;
    if (firstTimestamp === null) firstTimestamp = event.metadata.timestamp;
    const elapsed = Math.max(0, event.metadata.timestamp - firstTimestamp);
    while (nextFrameTime <= elapsed + 0.002) {
      frameIndex += 1;
      const file = path.join(framesDir, `frame-${String(frameIndex).padStart(6, "0")}.jpg`);
      writes.push(writeFile(file, buffer));
      nextFrameTime = frameIndex / 30;
    }
  });

  await session.send("Page.startScreencast", {
    format: "jpeg",
    quality: 96,
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1,
  });

  return async () => {
    await session.send("Page.stopScreencast");
    await delay(180);
    const actualDuration = Math.max(0.1, (Date.now() - wallStart) / 1000);
    const targetFrames = Math.ceil(actualDuration * 30);
    if (!lastBuffer) throw new Error(`${scene.id}: screencast returned no frames`);
    while (frameIndex < targetFrames) {
      frameIndex += 1;
      const file = path.join(framesDir, `frame-${String(frameIndex).padStart(6, "0")}.jpg`);
      writes.push(writeFile(file, lastBuffer));
    }
    await Promise.all(writes);
    await session.detach();
    const output = path.join(recordingsHqDir, `${scene.id}.mp4`);
    await runProcess(
      fullFfmpeg,
      [
        "-y",
        "-framerate",
        "30",
        "-start_number",
        "1",
        "-i",
        path.join(framesDir, "frame-%06d.jpg"),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "10",
        "-profile:v",
        "high",
        "-level",
        "4.2",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        output,
      ],
      `encode HQ ${scene.id}`,
    );
    return { output, frames: frameIndex, duration: actualDuration };
  };
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    const relative = pathname === "/" ? "README.md" : pathname.slice(1);
    const target = path.resolve(rootDir, relative);
    if (!target.startsWith(rootDir + path.sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(target);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "content-type": mime[path.extname(target).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolve) => server.listen(4173, "127.0.0.1", resolve));

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tap(page, key, hold = 90) {
  await page.keyboard.down(key);
  await delay(hold);
  await page.keyboard.up(key);
}

async function runTimed(durationMs, steps, tick = 120) {
  const start = Date.now();
  const pending = [...steps].sort((a, b) => a.at - b.at);
  while (Date.now() - start < durationMs) {
    const elapsed = Date.now() - start;
    while (pending.length && pending[0].at <= elapsed) {
      const step = pending.shift();
      await step.run();
    }
    await delay(tick);
  }
}

async function ball(page, duration) {
  await page.locator('[data-mode="blitz"]').click();
  await page.locator("#playAgainBtn").click();
  await delay(500);
  const steps = [
    { at: 900, run: () => tap(page, "Space", 110) },
    { at: 2200, run: () => tap(page, "KeyD", 150) },
    { at: 3400, run: () => tap(page, "KeyW", 100) },
    { at: 4700, run: () => tap(page, "Space", 110) },
    { at: 6100, run: () => tap(page, "KeyA", 120) },
    { at: 7350, run: () => tap(page, "KeyD", 150) },
  ];
  const start = Date.now();
  await runTimed(duration * 1000, steps, 110);
  void start;
}

async function ballWithMotion(page, duration) {
  const motion = (async () => {
    const start = Date.now();
    while (Date.now() - start < duration * 1000) {
      const t = (Date.now() - start) / 1000;
      const x = 960 + Math.cos(t * 1.15) * 520;
      const y = 540 + Math.sin(t * 1.72) * 300;
      await page.mouse.move(x, y, { steps: 4 });
      await delay(90);
    }
  })();
  await Promise.all([ball(page, duration), motion]);
}

async function starforge(page, duration) {
  await page.evaluate(() => {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    window.scrollTo(0, 0);
  });
  for (let index = 0; index < 8; index += 1) {
    await page.locator("#tapBtn").click();
    await delay(90);
  }
  if (await page.locator("#overclockBtn").isEnabled()) {
    await page.locator("#overclockBtn").click();
  }
  const sequence = [
    ["overview", 3200],
    ["build", 3300],
    ["research", 3900],
    ["voyage", 3900],
    ["battle", 5200],
    ["projects", 2500],
  ];
  const start = Date.now();
  for (const [view, hold] of sequence) {
    await page.evaluate((targetView) => {
      document.querySelector(`[data-view="${targetView}"]`)?.click();
      window.scrollTo(0, 0);
    }, view);
    const active = page.locator(`#${view}View`);
    await active.evaluate((element) => element.scrollTo?.(0, 0));
    await page.evaluate(() => window.scrollTo(0, 0));
    if (view === "battle") {
      const stance = page.locator('[data-stance="push"]');
      if (await stance.count()) await stance.click();
    }
    await delay(hold);
  }
  const remaining = duration * 1000 - (Date.now() - start);
  if (remaining > 0) await delay(remaining);
}

async function tank(page, duration) {
  await page.locator('[data-mode="arena"]').click();
  await page.locator('[data-chassis="specter"]').click();
  await page.locator('[data-cannon="arc"]').click();
  await page.locator("#startBtn").click();
  await delay(450);
  await page.mouse.move(1510, 430);
  await page.mouse.down();
  const movement = (async () => {
    await page.keyboard.down("KeyW");
    await page.keyboard.down("KeyD");
    await delay(2200);
    await page.keyboard.up("KeyW");
    await page.keyboard.up("KeyD");
    await tap(page, "Shift", 120);
    await page.keyboard.down("KeyS");
    await delay(1600);
    await page.keyboard.up("KeyS");
    await page.keyboard.down("KeyA");
    await delay(1700);
    await page.keyboard.up("KeyA");
    await tap(page, "KeyE", 120);
  })();
  const aim = (async () => {
    const start = Date.now();
    while (Date.now() - start < duration * 1000) {
      const t = (Date.now() - start) / 1000;
      await page.mouse.move(
        960 + Math.cos(t * 1.35) * 650,
        540 + Math.sin(t * 1.1) * 360,
        { steps: 5 },
      );
      await delay(150);
    }
  })();
  await Promise.all([movement, aim, delay(duration * 1000)]);
  await page.mouse.up();
}

async function spud(page, duration) {
  await page.locator("#startBtn").click();
  await delay(450);
  await page.locator("#speedBtn").click();
  const steps = [
    { at: 900, run: () => tap(page, "Shift", 120) },
    { at: 2400, run: () => tap(page, "KeyQ", 120) },
    { at: 4400, run: () => tap(page, "Shift", 120) },
    { at: 6500, run: () => tap(page, "KeyQ", 120) },
  ];
  const move = (async () => {
    const pattern = ["KeyD", "KeyS", "KeyA", "KeyW"];
    const start = Date.now();
    let index = 0;
    while (Date.now() - start < duration * 1000) {
      const key = pattern[index++ % pattern.length];
      await page.keyboard.down(key);
      await delay(900);
      await page.keyboard.up(key);
    }
  })();
  const upgrades = (async () => {
    const start = Date.now();
    while (Date.now() - start < duration * 1000) {
      const option = page.locator('[data-choice]:visible').first();
      if (await option.count()) {
        await option.click();
        await delay(260);
      }
      await delay(180);
    }
  })();
  await Promise.all([move, upgrades, runTimed(duration * 1000, steps)]);
}

async function garden(page, duration) {
  await page.locator('[data-tab="special"]').click();
  await page.locator('[data-special="survival"]').click();
  await page.locator("#startBtn").click();
  await delay(500);
  await page.locator("#speedBtn").click();
  const canvas = page.locator("#gameCanvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Garden canvas not visible");
  const cell = (row, col) => ({
    x: box.x + ((215 + col * 94 + 47) / 1280) * box.width,
    y: box.y + ((137 + row * 100 + 50) / 760) * box.height,
  });
  const plant = async (seedIndex, row, col) => {
    const seed = page.locator(".seed-card").nth(seedIndex);
    if (await seed.isEnabled()) {
      await seed.click();
      const point = cell(row, col);
      await page.mouse.click(point.x, point.y);
    }
  };
  await plant(0, 0, 0);
  await plant(1, 2, 2);
  await delay(3600);
  await plant(0, 4, 0);
  await plant(1, 1, 2);
  await delay(1900);
  await plant(2, 3, 2);
  const start = Date.now();
  while (Date.now() - start < duration * 1000 - 6100) {
    const x = box.x + box.width * (0.35 + Math.random() * 0.55);
    const y = box.y + box.height * (0.18 + Math.random() * 0.65);
    await page.mouse.click(x, y);
    await delay(480);
  }
}

async function moba(page, duration) {
  await page.locator('[data-champion="frostmage"]').click();
  await page.locator('[data-rule="rift"]').click();
  await page.locator("#startBtn").click();
  await delay(450);
  const canvas = page.locator("#gameCanvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("MOBA canvas not visible");
  const steps = [
    { at: 800, run: () => tap(page, "KeyW", 1500) },
    { at: 2300, run: () => tap(page, "KeyQ", 100) },
    { at: 3300, run: () => tap(page, "KeyE", 100) },
    { at: 4550, run: () => tap(page, "KeyW", 900) },
    { at: 5600, run: () => tap(page, "KeyR", 120) },
    { at: 7100, run: () => tap(page, "KeyQ", 100) },
    { at: 7950, run: () => tap(page, "KeyW", 700) },
  ];
  const clicks = (async () => {
    const start = Date.now();
    while (Date.now() - start < duration * 1000) {
      await page.mouse.click(
        box.x + box.width * (0.58 + Math.random() * 0.25),
        box.y + box.height * (0.35 + Math.random() * 0.35),
      );
      await delay(650);
    }
  })();
  await Promise.all([clicks, runTimed(duration * 1000, steps)]);
}

async function shanhai(page, duration) {
  const node = page.locator('[data-action="start-node"]:not([disabled])').first();
  await node.click();
  await delay(500);
  const start = Date.now();
  while (Date.now() - start < duration * 1000) {
    const playable = page.locator('[data-action="play-card"]:not([disabled])');
    if ((await playable.count()) > 0) {
      await playable.first().click();
      await delay(720);
    } else {
      const end = page.locator('[data-action="end-turn"]');
      if (await end.count()) await end.click();
      await delay(1050);
    }
  }
}

async function snake(page, duration) {
  await page.locator('[data-mode="hunt"]').click();
  await page.locator('[data-frame="comet"]').click();
  await page.locator("#startBtn").click();
  await delay(450);
  const sweeps = [
    ["ArrowRight", 1700],
    ["ArrowDown", 620],
    ["ArrowLeft", 1800],
    ["ArrowDown", 620],
    ["ArrowRight", 1800],
    ["ArrowUp", 620],
    ["ArrowLeft", 1750],
    ["ArrowUp", 620],
  ];
  const start = Date.now();
  let index = 0;
  while (Date.now() - start < duration * 1000) {
    const [key, travel] = sweeps[index++ % sweeps.length];
    await tap(page, key, 60);
    if (index % 3 === 0) await tap(page, "Shift", 80);
    await delay(travel);
  }
}

async function matrix(page, duration) {
  await page.locator('[data-mode="entropy"]').click();
  await page.locator("#startBtn").click();
  await delay(450);
  const keys = [
    "ArrowLeft",
    "ArrowDown",
    "ArrowRight",
    "ArrowDown",
    "ArrowLeft",
    "ArrowUp",
  ];
  const start = Date.now();
  let index = 0;
  while (Date.now() - start < duration * 1000) {
    const protocol = page.locator('[data-protocol]:visible').first();
    if (await protocol.count()) {
      await protocol.click();
      await delay(260);
    }
    await tap(page, keys[index++ % keys.length], 60);
    await delay(330);
  }
}

const runners = {
  ball: ballWithMotion,
  starforge,
  tank,
  spud,
  garden,
  moba,
  shanhai,
  snake,
  matrix,
};

const failures = [];
for (const scene of selectedScenes) {
  const sceneWork = path.join(workDir, scene.id);
  await mkdir(sceneWork, { recursive: true });
  const contextOptions = {
    viewport: { width: 1920, height: 1080 },
    screen: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  };
  if (!hqMode) {
    contextOptions.recordVideo = {
      dir: sceneWork,
      size: { width: 1920, height: 1080 },
    };
  }
  const context = await browser.newContext(contextOptions);
  if (scene.id === "starforge") {
    await context.addInitScript(() => {
      const state = {
        v: 8,
        protocol: "battle",
        timeFlux: 18,
        dust: 8.6e7,
        crystal: 4.2e6,
        alloy: 680000,
        science: 920000,
        fragments: 12600,
        salvage: 38000,
        plasma: 7600,
        data: 5800,
        influence: 4200,
        dark: 860,
        energy: 1200,
        cores: 24,
        boostUntil: Date.now() + 120000,
        b: {
          probe: 24,
          miner: 18,
          smelter: 15,
          lab: 13,
          relay: 11,
          condenser: 9,
          archive: 8,
          plasmaRing: 6,
          databank: 5,
          embassy: 4,
          voidWell: 3,
        },
        r: {
          rProbe: true,
          rMiner: true,
          rForge: true,
          rVoyage: true,
          rArchive: true,
          rVoid: true,
        },
        rLv: {
          production: 7,
          archive: 6,
          combat: 8,
          voyage: 6,
          logistics: 5,
          reactor: 5,
          diplomacy: 4,
          singularity: 3,
        },
        projects: {
          industry: 5,
          research: 5,
          battle: 6,
          voyage: 5,
          crew: 4,
          time: 4,
          council: 3,
          void: 3,
        },
        constellations: {
          forge: 5,
          scholar: 4,
          war: 5,
          voyage: 4,
          council: 3,
          void: 3,
        },
        trials: { supply: 4, fleet: 5, relic: 3, singularity: 2 },
        crew: { engineer: 9, geologist: 8, scholar: 8, pilot: 7, envoy: 6 },
        crewRank: { engineer: 4, geologist: 3, scholar: 4, pilot: 3, envoy: 3 },
        artifacts: { lens: 5, ledger: 4, anchor: 5, loom: 4, sigil: 3 },
        coreUp: { memory: 5, catalyst: 4, contract: 4, beacon: 3 },
        gear: {
          weapon: 8,
          armor: 7,
          reactor: 7,
          drone: 6,
          matrix: 6,
          drive: 5,
          singularity: 4,
        },
        combatUp: {
          targeting: 7,
          plating: 6,
          scavenger: 6,
          command: 6,
          momentum: 5,
          barrage: 5,
          overload: 4,
          voidHull: 3,
          bossMark: 4,
        },
        battle: {
          zone: 28,
          enemyHp: 0,
          playerHp: 0,
          stance: "push",
          momentum: 72,
          suppress: 0,
          level: 22,
          exp: 850,
          grind: 0,
          points: 4,
          attrs: { attack: 8, hull: 6, regen: 4, loot: 7, focus: 5, boss: 4 },
        },
        stats: {
          totalDust: 2.8e9,
          lifetimeDust: 8.2e10,
          manual: 380,
          bestCores: 24,
          totalCores: 46,
          orders: 85,
          expeditions: 42,
          overclocks: 16,
          offlineSeconds: 280000,
          fragmentsEarned: 48000,
          salvageEarned: 92000,
          plasmaEarned: 16000,
          dataEarned: 12000,
          influenceEarned: 9000,
          darkEarned: 1900,
          trialsRun: 24,
          kills: 680,
          bosses: 34,
          salvos: 188,
          battleExp: 28500,
          retreats: 3,
          highestZone: 32,
          maxRate: 0,
          timeWarps: 12,
          protocolSwitches: 15,
          maxTimeFlux: 18,
        },
        last: Date.now(),
      };
      localStorage.setItem("miniStarforgeIdleSaveV1", JSON.stringify(state));
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  try {
    await page.goto(`http://127.0.0.1:4173/${scene.file}`, {
      waitUntil: "load",
      timeout: 30_000,
    });
    await delay(900);
    const stopHighQualityCapture = hqMode
      ? await beginHighQualityCapture(page, scene)
      : null;
    await runners[scene.id](page, scene.duration);
    await delay(700);
    if (stopHighQualityCapture) {
      const result = await stopHighQualityCapture();
      await context.close();
      console.log(
        `${scene.id}: HQ captured ${result.frames} frames / ${result.duration.toFixed(2)}s -> ${result.output}`,
      );
    } else {
      const video = page.video();
      await context.close();
      const source = await video.path();
      const output = path.join(recordingsDir, `${scene.id}.webm`);
      await copyFile(source, output);
      console.log(`${scene.id}: captured -> ${output}`);
    }
    if (errors.length) {
      console.warn(`${scene.id}: browser warnings: ${errors.join(" | ")}`);
    }
  } catch (error) {
    failures.push(`${scene.id}: ${error.stack || error.message}`);
    await context.close().catch(() => {});
  }
}

await browser.close();
server.close();

if (failures.length) {
  console.error(failures.join("\n\n"));
  process.exitCode = 1;
}
