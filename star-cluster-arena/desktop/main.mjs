import { appendFile, mkdir } from "node:fs/promises";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu, clipboard, contentTracing, ipcMain, screen, session, shell } from "electron";
import { createProfileStore } from "./profile-store.mjs";
import { createSafeConsole } from "./safe-console.mjs";
import electronSquirrelStartup from "electron-squirrel-startup";
import { startServer } from "../backend/server.mjs";
import { inspectWindowsFirewall } from "../backend/multiplayer/windows-network-diagnostics.mjs";
import { normalizeExternalUrl } from "./external-links.mjs";
import { createDisplayModeController, readDisplayState } from "./display-mode.mjs";

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SMOKE_MODE = process.env.SCA_DESKTOP_SMOKE === "1";
const SMOKE_MANUAL = SMOKE_MODE && process.env.SCA_QA_MANUAL === "1";
if (SMOKE_MODE) app.setPath("userData", join(app.getPath("temp"), `sca-desktop-smoke-${process.pid}`));
const SMOKE_MULTIPLAYER = process.env.SCA_DESKTOP_SMOKE_PATH === "multiplayer";
const SMOKE_RELEASE = process.env.SCA_DESKTOP_SMOKE_RELEASE === "1";
const SMOKE_GAMEPLAY = process.env.SCA_DESKTOP_SMOKE_GAMEPLAY === "1" || SMOKE_RELEASE;
const SMOKE_DISPLAY = process.env.SCA_DESKTOP_SMOKE_DISPLAY === "1";
const SMOKE_VISUAL = process.env.SCA_DESKTOP_SMOKE_VISUAL === "1";
const SMOKE_FORCE_DISPLAY = process.env.SCA_DESKTOP_SMOKE_GAMEPLAY_DISPLAY_MODE === "borderless-fullscreen";
const SMOKE_NAVIGATION = process.env.SCA_DESKTOP_SMOKE_NAVIGATION === "1";
const SMOKE_VISUAL_DISPLAY_MODE = SMOKE_FORCE_DISPLAY || process.env.SCA_DESKTOP_SMOKE_VISUAL_DISPLAY_MODE === "borderless-fullscreen"
  ? "borderless-fullscreen"
  : "windowed";
const SMOKE_GAMEPLAY_MODE = ["solo", "team", "survival", "battle", "blitz", "spore", "screen", "control", "giant", "demon"].includes(process.env.SCA_DESKTOP_SMOKE_GAMEPLAY_MODE)
  ? process.env.SCA_DESKTOP_SMOKE_GAMEPLAY_MODE
  : "solo";
const SMOKE_MIN_FPS = Math.max(0, Number(process.env.SCA_DESKTOP_SMOKE_MIN_FPS) || 0);
const SMOKE_LOW_POWER_GPU = SMOKE_GAMEPLAY && process.env.SCA_DESKTOP_SMOKE_LOW_POWER_GPU === "1";
const SMOKE_VISIBLE = SMOKE_GAMEPLAY && process.env.SCA_PERF_VISIBLE === "1";
const SMOKE_GAMEPLAY_DURATION = Math.min(300, Math.max(8, Math.round(Number(process.env.SCA_DESKTOP_SMOKE_DURATION) || 16)));
let mainWindow = null;
let serverController = null;
let profileStore = null;
let stopping = false;
let logFile = null;
let desktopRefreshRate = 60;
let displayModeController = null;
const writeConsole = createSafeConsole(process.stdout, process.stderr);
app.commandLine.appendSwitch(SMOKE_LOW_POWER_GPU ? "force_low_power_gpu" : "force_high_performance_gpu");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
if (SMOKE_GAMEPLAY) {
  app.commandLine.appendSwitch("disable-background-timer-throttling");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
}

async function writeLog(level, values) {
  const message = values.map(value => value instanceof Error ? value.stack || value.message : String(value)).join(" ");
  const line = `${new Date().toISOString()} [${level}] ${message}\n`;
  writeConsole(level, message);
  if (!logFile) return;
  try {
    await appendFile(logFile, line, "utf8");
  } catch {
    // 日志写入失败不能阻断游戏启动。
  }
}

const logger = {
  log: (...values) => void writeLog("info", values),
  info: (...values) => void writeLog("info", values),
  warn: (...values) => void writeLog("warn", values),
  error: (...values) => void writeLog("error", values)
};

app.on("child-process-gone", (_event, details) => {
  const type = details?.type || "unknown";
  const reason = details?.reason || "unknown";
  const code = details?.exitCode ?? "unknown";
  logger.error(`Electron 子进程异常退出：type=${type} reason=${reason} exitCode=${code}`);
});

function startVisualFrameMonitor(window) {
  const stats = {
    samples: 0,
    maximumWhiteRatio: 0,
    maximumMeanChannel: 0,
    suspiciousFrames: []
  };
  const startedAt = Date.now();
  const onFrame = image => {
    if (!image || image.isEmpty()) return;
    const bitmap = image.resize({ width: 64, height: 36, quality: "good" }).toBitmap();
    if (!bitmap?.length) return;
    let white = 0;
    let channels = 0;
    for (let index = 0; index + 2 < bitmap.length; index += 4) {
      const first = bitmap[index];
      const second = bitmap[index + 1];
      const third = bitmap[index + 2];
      channels += first + second + third;
      if (first >= 235 && second >= 235 && third >= 235) white += 1;
    }
    const pixels = Math.max(1, Math.floor(bitmap.length / 4));
    const whiteRatio = white / pixels;
    const meanChannel = channels / (pixels * 3);
    stats.samples += 1;
    stats.maximumWhiteRatio = Math.max(stats.maximumWhiteRatio, whiteRatio);
    stats.maximumMeanChannel = Math.max(stats.maximumMeanChannel, meanChannel);
    if (whiteRatio >= 0.72 || meanChannel >= 220) {
      stats.suspiciousFrames.push({
        elapsedMs: Date.now() - startedAt,
        whiteRatio: Number(whiteRatio.toFixed(4)),
        meanChannel: Number(meanChannel.toFixed(1))
      });
      if (stats.suspiciousFrames.length > 24) stats.suspiciousFrames.shift();
    }
  };
  window.webContents.beginFrameSubscription(false, onFrame);
  return () => {
    window.webContents.endFrameSubscription();
    return {
      ...stats,
      maximumWhiteRatio: Number(stats.maximumWhiteRatio.toFixed(4)),
      maximumMeanChannel: Number(stats.maximumMeanChannel.toFixed(1))
    };
  };
}

function waitForMainFrameLoad(window, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let timer = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      window.webContents.removeListener("did-finish-load", loaded);
    };
    const loaded = () => {
      cleanup();
      resolve();
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("页面导航超时"));
    }, timeoutMs);
    window.webContents.once("did-finish-load", loaded);
  });
}

async function collectNavigationSmoke(window) {
  const routes = [await window.webContents.executeJavaScript("location.pathname")];
  for (let cycle = 0; cycle < 4; cycle++) {
    const enteredLobby = waitForMainFrameLoad(window);
    await window.webContents.executeJavaScript("document.getElementById('titleOnlineBtn').click()")
    await enteredLobby;
    routes.push(await window.webContents.executeJavaScript("location.pathname"));
    await new Promise(resolveDelay => setTimeout(resolveDelay, 140));

    const returnedHome = waitForMainFrameLoad(window);
    await window.webContents.executeJavaScript("document.querySelector('.back-link').click()")
    await returnedHome;
    routes.push(await window.webContents.executeJavaScript("location.pathname"));
    await window.webContents.executeJavaScript(`(() => {
      document.querySelector('[data-title-open="settings"]').click();
      document.querySelector('[data-title-back]').click();
      document.querySelector('[data-title-open="settings"]').click();
      document.querySelector('[data-title-back]').click();
    })()`);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 140));
  }
  return { cycles: 4, routes };
}

function isLocalGameUrl(target) {
  if (!serverController) return false;
  try {
    return new URL(target).origin === new URL(serverController.url).origin;
  } catch {
    return false;
  }
}

function desktopGameUrl(pathname = "/") {
  const url = new URL(pathname, serverController.url);
  url.searchParams.set("desktop", "1");
  url.searchParams.set("refresh", String(desktopRefreshRate));
  if (SMOKE_GAMEPLAY) url.searchParams.set("debug", "1");
  return url.href;
}

async function openAllowedExternal(target) {
  const url = normalizeExternalUrl(target);
  if (!url) return { ok: false, error: "不允许打开这个外部地址" };
  try {
    await shell.openExternal(url.href);
    return { ok: true, url: url.href };
  } catch (error) {
    logger.warn("外部地址打开失败", error);
    return { ok: false, error: "系统没有可用于打开该地址的应用" };
  }
}

function currentDisplayState() {
  return displayModeController?.read() || readDisplayState(mainWindow, screen);
}

function emitDisplayState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("desktop:display-state", currentDisplayState());
}

async function setDesktopDisplayMode(settings = {}) {
  if (!displayModeController) return currentDisplayState();
  const state = await displayModeController.set(settings);
  emitDisplayState();
  logger.info(`显示模式请求：${settings?.mode || "windowed"}；结果：${state.mode}；全屏=${state.fullscreen}`);
  return state;
}

async function toggleDesktopDisplayMode(windowSize = "current") {
  if (!displayModeController) return currentDisplayState();
  const state = await displayModeController.toggle(windowSize);
  emitDisplayState();
  logger.info(`显示模式切换；结果：${state.mode}；全屏=${state.fullscreen}`);
  return state;
}

async function waitForNativeFullscreen(expected, timeoutMs = 2600) {
  const startedAt = Date.now();
  while (Boolean(mainWindow?.isFullScreen()) !== expected) {
    if (Date.now() - startedAt > timeoutMs) return false;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return true;
}

async function rendererDisplaySnapshot(smokeWindow) {
  return smokeWindow.webContents.executeJavaScript(`({
    desktopApi: Boolean(window.starClusterDesktop?.desktop),
    desktopMethods: ['getDisplayState', 'setDisplayMode', 'toggleFullscreen', 'openExternal', 'copyText', 'quitApp']
      .every(method => typeof window.starClusterDesktop?.[method] === 'function'),
    buttonText: document.getElementById('titleFullscreenBtn')?.textContent || '',
    buttonPressed: document.getElementById('titleFullscreenBtn')?.getAttribute('aria-pressed') || '',
    savedMode: window.ScaGameSettings?.load?.().displayMode || '',
    selectedMode: document.getElementById('gameSettingsForm')?.elements.displayMode.value || ''
  })`);
}

async function waitForRendererDisplay(smokeWindow, expectedFullscreen, timeoutMs = 3000) {
  const expectedMode = expectedFullscreen ? "borderless-fullscreen" : "windowed";
  const expectedPressed = String(expectedFullscreen);
  const startedAt = Date.now();
  let state = null;
  do {
    state = await rendererDisplaySnapshot(smokeWindow);
    if (
      state.desktopApi
      && state.desktopMethods
      && state.savedMode === expectedMode
      && state.selectedMode === expectedMode
      && state.buttonPressed === expectedPressed
    ) return state;
    await new Promise(resolve => setTimeout(resolve, 25));
  } while (Date.now() - startedAt <= timeoutMs);
  return state;
}

async function collectDisplayInteractionSmoke(smokeWindow) {
  await setDesktopDisplayMode({ mode: "windowed", windowSize: "current" });
  const initial = await rendererDisplaySnapshot(smokeWindow);
  logger.info(`显示交互初始状态：${JSON.stringify(initial)}`);
  if (!initial.desktopApi || !initial.desktopMethods) throw new Error("桌面桥接未完整加载，首页按钮会错误地退回浏览器全屏路径");
  await smokeWindow.webContents.executeJavaScript(`document.getElementById('titleFullscreenBtn').click()`);
  if (!await waitForNativeFullscreen(true)) throw new Error("首页全屏按钮未进入原生全屏");
  const buttonEnteredRenderer = await waitForRendererDisplay(smokeWindow, true);
  const buttonEntered = { native: currentDisplayState(), renderer: buttonEnteredRenderer };

  await smokeWindow.webContents.executeJavaScript(`document.getElementById('titleFullscreenBtn').click()`);
  if (!await waitForNativeFullscreen(false)) throw new Error("首页全屏按钮未退出原生全屏");
  const buttonLeftRenderer = await waitForRendererDisplay(smokeWindow, false);
  const buttonLeft = { native: currentDisplayState(), renderer: buttonLeftRenderer };

  await smokeWindow.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-title-open="settings"]').click();
    const form = document.getElementById('gameSettingsForm');
    form.elements.displayMode.value = 'borderless-fullscreen';
    form.elements.displayMode.dispatchEvent(new Event('change', { bubbles: true }));
    form.requestSubmit();
  })()`);
  if (!await waitForNativeFullscreen(true)) throw new Error("设置保存未进入原生全屏");
  const settingsEnteredRenderer = await waitForRendererDisplay(smokeWindow, true);
  const settingsEntered = { native: currentDisplayState(), renderer: settingsEnteredRenderer };

  await smokeWindow.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-title-open="settings"]').click();
    const form = document.getElementById('gameSettingsForm');
    form.elements.displayMode.value = 'windowed';
    form.elements.windowSize.value = '1280x720';
    form.elements.displayMode.dispatchEvent(new Event('change', { bubbles: true }));
    form.requestSubmit();
  })()`);
  if (!await waitForNativeFullscreen(false)) throw new Error("设置保存未退出原生全屏");
  const settingsLeftRenderer = await waitForRendererDisplay(smokeWindow, false);
  const settingsLeft = { native: currentDisplayState(), renderer: settingsLeftRenderer };

  return { buttonEntered, buttonLeft, settingsEntered, settingsLeft };
}

function tcpPortHasListener(port, timeoutMs = 280) {
  return new Promise(resolvePort => {
    const socket = connect({ host: "127.0.0.1", port });
    let settled = false;
    const finish = occupied => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePort(occupied);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function collectGameplaySmoke(smokeWindow) {
  return smokeWindow.webContents.executeJavaScript(`(async () => {
    const mode = ${JSON.stringify(SMOKE_GAMEPLAY_MODE)};
    document.getElementById('titleSingleBtn')?.click();
    document.querySelector('[data-mode="' + mode + '"]')?.click();
    document.getElementById('playAgainBtn')?.click();
    if (document.getElementById('titleScreen')?.hidden !== true || getComputedStyle(document.getElementById('overlay')).display !== 'none') throw new Error('性能测试未进入可见的纯游戏画面');
    window.__ballArenaDebug?.protectPerfProbe?.(${JSON.stringify(SMOKE_GAMEPLAY_DURATION + 5)});
    const samples = [];
    for (let elapsed = 4; elapsed <= ${JSON.stringify(SMOKE_GAMEPLAY_DURATION)}; elapsed += 4) {
      await new Promise(resolve => setTimeout(resolve, 4000));
      const state = window.__ballArenaDebug?.snapshot?.();
      if (!state) throw new Error('单机调试采样接口不可用');
      if (state.paused) throw new Error('性能采样因失焦或输入而暂停，请保持测试窗口状态稳定，不要将暂停帧计入性能结果');
      samples.push({
        elapsed,
        over: state.over,
        paused: state.paused,
        menu: state.menu,
        playerCells: state.playerCells,
        alive: state.alive,
        fps: Math.round(1000 / Math.max(1, state.avgFrame)),
        avgFrame: state.avgFrame,
        avgWork: state.avgWork,
        maxFrame: state.maxFrame,
        longFrames: state.longFrames,
        lowQuality: state.lowQuality,
        pixelRatio: state.pixelRatio,
        backingStoreResizes: state.backingStoreResizes,
        renderedFrames: state.renderedFrames,
        skippedRenderFrames: state.skippedRenderFrames,
        drawnFood: state.drawnFood,
        drawnCells: state.drawnCells,
        foodCount: state.foodCount,
        leaderMass: state.leaderMass,
        totalMass: state.totalMass,
        totalKills: state.totalKills,
        renderer: state.renderer
      });
      if (${JSON.stringify(process.env.SCA_PERF_STREAM === "1")}) console.info('SCA_PERF_SAMPLE ' + JSON.stringify(samples[samples.length - 1]));
    }
    const activeSamples = samples.filter(sample => !sample.over);
    const steadySamples = activeSamples.filter(sample => sample.elapsed >= 8);
    return {
      mode,
      samples,
      summary: {
        activeSamples: activeSamples.length,
        averageFps: activeSamples.length ? Math.round(activeSamples.reduce((sum, sample) => sum + sample.fps, 0) / activeSamples.length) : 0,
        steadyAverageFps: steadySamples.length ? Math.round(steadySamples.reduce((sum, sample) => sum + sample.fps, 0) / steadySamples.length) : 0,
        steadyMinimumFps: steadySamples.length ? Math.min(...steadySamples.map(sample => sample.fps)) : 0,
        minimumFps: activeSamples.length ? Math.min(...activeSamples.map(sample => sample.fps)) : 0,
        maximumWorkMs: activeSamples.length ? Math.max(...activeSamples.map(sample => sample.avgWork)) : 0,
        maximumLongFrames: activeSamples.length ? Math.max(...activeSamples.map(sample => sample.longFrames)) : 0
      }
    };
  })()`);
}

async function collectMultiplayerGameplaySmoke(smokeWindow) {
  return evaluateSmoke(smokeWindow, `(async () => {
    const mode = ${JSON.stringify(SMOKE_GAMEPLAY_MODE)};
    const duration = ${JSON.stringify(SMOKE_GAMEPLAY_DURATION)};
    const waitFor = async (predicate, label, timeout = 12000) => {
      const startedAt = performance.now();
      while (!predicate()) {
        if (performance.now() - startedAt > timeout) throw new Error('联机性能采样等待超时：' + label);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    };

    const modeSelect = document.getElementById('modeSelect');
    modeSelect.value = mode;
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('nicknameInput').value = '桌面性能房主';
    document.getElementById('createRoomBtn').click();
    await waitFor(() => document.getElementById('roomView')?.hidden === false, '创建房间');
    const roomCode = document.getElementById('roomCode').textContent.trim();
    const initialBots = document.getElementById('roomBots').textContent.trim();
    if (${JSON.stringify(SMOKE_RELEASE)}) {
      for (const id of ['readyBtn', 'startMatchBtn']) {
        const rect = document.getElementById(id).getBoundingClientRect();
        if (rect.bottom > innerHeight || rect.top < 0) throw new Error('等待房间按钮超出窗口：' + id);
      }
    }
    const endpoint = location.origin.replace(/^http/, 'ws') + '/ws?room=' + encodeURIComponent(roomCode);
    const guest = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('性能采样访客加入超时')), 8000);
      guest.addEventListener('open', () => guest.send(JSON.stringify({
        type: 'join',
        protocol: 'sca-v1',
        name: '桌面性能访客',
        cosmetics: { skin: 'dragon', spore: 'royal', halo: 'gravity', trail: 'demon-trail' }
      })));
      guest.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.type === 'welcome') {
          guest.send(JSON.stringify({ type: 'ready', ready: true, configVersion: message.room.configVersion }));
          clearTimeout(timer);
          resolve();
        }
        if (message.type === 'ping') guest.send(JSON.stringify({ type: 'pong', clientTime: message.clientTime }));
      });
      guest.addEventListener('error', () => reject(new Error('性能采样访客连接失败')), { once: true });
    });

    await waitFor(() => document.getElementById('roomCapacity').textContent.includes('2 / '), '第二名玩家进入房间');
    const filledBots = document.getElementById('roomBots').textContent.trim();
    document.getElementById('readyBtn').click();
    await waitFor(() => !document.getElementById('startMatchBtn').disabled, '双方准备');
    document.getElementById('startMatchBtn').click();
    await waitFor(() => document.getElementById('gameView')?.hidden === false, '开始联机对局');

    const samples = [];
    for (let elapsed = 4; elapsed <= duration; elapsed += 4) {
      await new Promise(resolve => setTimeout(resolve, 4000));
      const detail = document.getElementById('gameNetworkDetail').textContent || '';
      const fps = Number(detail.match(/图形 ([0-9]+) FPS/i)?.[1] || detail.match(/([0-9]+)fps/i)?.[1] || 0);
      const snapshotHz = Number(detail.match(/权威 ([0-9.]+) Hz/i)?.[1] || detail.match(/([0-9.]+)Hz/i)?.[1] || 0);
      const debug = window.__starClusterMultiplayerDebug?.snapshot?.() || {};
      samples.push({
        elapsed,
        fps,
        snapshotHz,
        detail,
        mass: document.getElementById('gameMass').textContent,
        rank: document.getElementById('gameRank').textContent,
        world: debug.world,
        foodCount: debug.foodCount,
        leaderMass: debug.leaderMass,
        totalKills: debug.totalKills
      });
    }
    if (${JSON.stringify(SMOKE_RELEASE)}) window.__scaSmokeGuest = guest;
    else guest.close(1000, 'smoke-complete');
    const steadySamples = samples.filter(sample => sample.elapsed >= 8 && sample.snapshotHz > 0);
    return {
      mode,
      roomCode,
      initialBots,
      filledBots,
      samples,
      summary: {
        activeSamples: samples.length,
        averageFps: samples.length ? Math.round(samples.reduce((sum, sample) => sum + sample.fps, 0) / samples.length) : 0,
        steadyAverageFps: steadySamples.length ? Math.round(steadySamples.reduce((sum, sample) => sum + sample.fps, 0) / steadySamples.length) : 0,
        steadyMinimumFps: steadySamples.length ? Math.min(...steadySamples.map(sample => sample.fps)) : 0,
        minimumFps: samples.length ? Math.min(...samples.map(sample => sample.fps)) : 0,
        averageSnapshotHz: steadySamples.length ? Number((steadySamples.reduce((sum, sample) => sum + sample.snapshotHz, 0) / steadySamples.length).toFixed(1)) : 0
      }
    };
  })()`);
}

async function evaluateSmoke(window, source) {
  const outcome = await window.webContents.executeJavaScript(`(async () => {
    try { return { ok: true, value: await (${source}) }; }
    catch (error) { return { ok: false, error: error.stack || error.message }; }
  })()`);
  if (!outcome.ok) throw new Error(`Smoke 执行失败：${outcome.error}`);
  return outcome.value;
}

async function collectReleaseInteractionSmoke(window) {
  const single = await evaluateSmoke(window, `(async () => {
    const assert = (condition, label) => { if (!condition) throw new Error('正式版单人流程：' + label); };
    const debug = window.__ballArenaDebug;
    document.getElementById('titleSingleBtn').click();
    document.querySelector('[data-mode="screen"]').click();
    document.getElementById('playAgainBtn').click();
    await new Promise(resolve => setTimeout(resolve, 250));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const before = debug.snapshot();
    assert(before.paused && !document.getElementById('singleSessionMenu').hidden, 'Esc 应暂停并显示菜单');
    for (const [key, code] of [[' ', 'Space'], ['w', 'KeyW'], ['a', 'KeyA'], ['d', 'KeyD']]) document.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 1300));
    const after = debug.snapshot();
    assert(after.timeLeft === before.timeLeft && after.playerCells === before.playerCells && !after.ejectHeld, '暂停应冻结时间并拒绝游戏操作');
    document.getElementById('singleResumeBtn').click();
    assert(!debug.snapshot().paused, '继续应恢复原比赛');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    assert(debug.snapshot().paused, 'R 不应意外重开');
    document.getElementById('singleLeaveBtn').click();
    assert(debug.snapshot().menu, '退出应返回主页');
    debug.startMode('blitz'); const result = debug.forceTimeEnd();
    assert(result.snapshot.over && result.title, '单人限时结算');
    document.getElementById('playAgainBtn').click();
    assert(!debug.snapshot().over && !debug.snapshot().menu, '再来一局应可开始');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.getElementById('singleLeaveBtn').click();
    return { pausedSeconds: 1.3, mode: before.mode, frozenTimeLeft: before.timeLeft, resultTitle: result.title, restart: true };
  })()`);
  await window.loadURL(desktopGameUrl('/multiplayer.html'));
  await new Promise(resolveDelay => setTimeout(resolveDelay, 1000));
  const connection = await evaluateSmoke(window, `(async () => {
    const assert = (condition, label) => { if (!condition) throw new Error(label); };
    const select = document.getElementById('connectionMode');
    select.value = 'internet'; select.dispatchEvent(new Event('change', { bubbles: true }));
    const debug = window.__starClusterMultiplayerDebug;
    assert(debug.snapshot().connectionMode === 'internet', '互联网选择未切换实际连接状态');
    assert(!document.getElementById('internetServer').hidden, '互联网地址不可见');
    document.getElementById('createRoomBtn').click();
    await new Promise(resolve => setTimeout(resolve, 250));
    assert(document.getElementById('roomView').hidden, '空公网地址不能偷偷创建局域网房间');
    document.getElementById('internetServer').value = location.origin;
    document.getElementById('applyConnectionBtn').click();
    const began = performance.now();
    while (!document.getElementById('connectionText').textContent.includes('服务正常') || debug.snapshot().serviceOrigin !== location.origin) {
      if (performance.now() - began > 8000) throw new Error('互联网地址检查超时');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    document.getElementById('internetServer').value = 'http://127.0.0.1:9';
    document.getElementById('createRoomBtn').click();
    await new Promise(resolve => setTimeout(resolve, 250));
    assert(document.getElementById('roomView').hidden, '修改地址后未检查不应连接旧服务');
    document.getElementById('internetServer').value = location.origin;
    return { internetSelected: true, emptyAddressBlocked: true, changedAddressBlocked: true };
  })()`);
  // Keep idle lifecycle probes alive until the explicit survivor fixture.
  // Ordinary matches never receive this smoke-only protection.
  const protectedMatches = new Set();
  const protectLifecycleProbe = () => {
    for (const room of serverController.roomManager.rooms.values()) {
      if (!room.simulation || protectedMatches.has(room.matchId)) continue;
      protectedMatches.add(room.matchId);
      for (const player of room.players.values()) room.simulation.runtime.setGroupFixture(player.id, { invincibleSeconds: SMOKE_GAMEPLAY_DURATION + 10 });
      room.simulation.cachedSnapshot = null;
    }
  };
  serverController.roomManager.on("rooms-changed", protectLifecycleProbe);
  let multiplayer;
  try { multiplayer = await collectMultiplayerGameplaySmoke(window); }
  finally { serverController.roomManager.off("rooms-changed", protectLifecycleProbe); }
  const code = multiplayer.roomCode;
  const room = serverController.roomManager.rooms.get(code);
  if (!room?.simulation) throw new Error('正式版联机测试房间缺失');
  const host = [...room.players.values()].find(player => player.host);
  const guest = [...room.players.values()].find(player => !player.host);
  const bot = room.simulation.snapshot({ foodMode: 'none' }).groups.find(group => !group.human && !group.dead && group.cells.length);
  if (!bot) throw new Error('生命周期夹具需要一名仍存活的 AI');
  room.simulation.runtime.setGroupFixture(bot.id, { mass: 512, invincibleSeconds: 3 });
  room.simulation.runtime.setSurvivors([guest.id, bot.id]);
  room.simulation.cachedSnapshot = null;
  await new Promise(resolveDelay => setTimeout(resolveDelay, 700));
  const spectating = await evaluateSmoke(window, `(() => {
    const debug = window.__starClusterMultiplayerDebug;
    if (document.getElementById('spectateBtn').hidden || !debug.snapshot().spectatorId) throw new Error('阵亡后未进入观战');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const state = debug.snapshot();
    if (document.getElementById('sessionMenu').hidden || !state.inputSuspended || state.input.eject) throw new Error('联机菜单未释放输入');
    document.getElementById('sessionContinueBtn').click();
    if (debug.snapshot().inputSuspended) throw new Error('联机继续未恢复输入');
    return { spectatorId: state.spectatorId, inputReleased: true };
  })()`);
  room.simulation.runtime.setSurvivors([guest.id]); room.simulation.cachedSnapshot = null;
  await new Promise(resolveDelay => setTimeout(resolveDelay, 700));
  const result = await window.webContents.executeJavaScript(`({ visible: !document.getElementById('matchResult').hidden, text: document.getElementById('matchResultTitle').textContent + ' · ' + document.getElementById('matchResultSummary').textContent })`);
  if (!result.visible || !result.text.includes('桌面性能访客')) throw new Error('联机结算没有显示真实访客胜者：' + result.text);
  await new Promise(resolveDelay => setTimeout(resolveDelay, 4200));
  const returned = await evaluateSmoke(window, `(() => {
    if (document.getElementById('roomView').hidden || document.getElementById('matchResult').hidden) throw new Error('返回房间应保留可读结算');
    document.getElementById('matchResultContinue').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (document.getElementById('sessionMenu').hidden) throw new Error('等待房间 Esc 无效');
    document.getElementById('sessionLeaveBtn').click();
    window.__scaSmokeGuest?.close();
    return true;
  })()`);
  return { single, connection, multiplayer, spectating, result, returned };
}

function createMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "游戏",
      submenu: [
        { label: "返回首页", click: () => mainWindow?.loadURL(desktopGameUrl("/")) },
        { label: "联机大厅", click: () => mainWindow?.loadURL(desktopGameUrl("/multiplayer.html")) },
        { type: "separator" },
        { label: "退出", role: "quit" }
      ]
    },
    {
      label: "视图",
      submenu: [
        { label: "全屏", role: "togglefullscreen" },
        { label: "重新载入", role: "reload" },
        { type: "separator" },
        { label: "实际大小", role: "resetzoom" },
        { label: "放大", role: "zoomin" },
        { label: "缩小", role: "zoomout" }
      ]
    }
  ]));
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    fullscreenable: true,
    show: SMOKE_GAMEPLAY || SMOKE_DISPLAY,
    ...((SMOKE_GAMEPLAY || SMOKE_DISPLAY) && !SMOKE_VISIBLE ? { x: -10_000, y: -10_000, skipTaskbar: true } : {}),
    ...(SMOKE_DISPLAY ? { opacity: 0 } : {}),
    backgroundColor: "#07111f",
    title: "星团大作战",
    icon: join(PROJECT_ROOT, "desktop", "assets", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(PROJECT_ROOT, "desktop", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: !SMOKE_GAMEPLAY
    }
  });
  displayModeController = createDisplayModeController(mainWindow, screen);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (normalizeExternalUrl(url)) setImmediate(() => void openAllowedExternal(url));
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (!isLocalGameUrl(target)) {
      event.preventDefault();
      return;
    }
    const url = new URL(target);
    if (!url.searchParams.has("desktop") || !url.searchParams.has("refresh")) {
      event.preventDefault();
      mainWindow?.loadURL(desktopGameUrl(`${url.pathname}${url.search}`));
    }
  });
  mainWindow.webContents.on("will-attach-webview", event => event.preventDefault());
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logger.error(`渲染进程异常退出：${details.reason}`);
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) logger.error(`页面加载失败：${code} ${description} ${url}`);
  });
  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    logger.error(`桌面桥接加载失败：${preloadPath}`, error);
  });
  if (SMOKE_MODE) mainWindow.webContents.on("console-message", event => {
    const details = event;
    if (details?.message?.startsWith('SCA_PERF_SAMPLE ')) logger.info(details.message);
    else if (details && ["warning", "error"].includes(details.level)) {
      logger.error(`Smoke 网页 ${details.level}：${details.message} (${details.sourceId}:${details.lineNumber})`);
    }
  });

  mainWindow.once("ready-to-show", () => {
    if (!SMOKE_MODE || SMOKE_MANUAL) mainWindow?.show();
  });
  mainWindow.on("enter-full-screen", emitDisplayState);
  mainWindow.on("leave-full-screen", emitDisplayState);
  mainWindow.on("closed", () => {
    mainWindow = null;
    displayModeController = null;
  });

  const activeDisplay = screen.getDisplayMatching(mainWindow.getBounds());
  desktopRefreshRate = Math.min(240, Math.max(60, Math.round(Number(activeDisplay.displayFrequency) || 60)));
  logger.info(`显示器刷新率：${desktopRefreshRate} Hz；已请求${SMOKE_LOW_POWER_GPU ? "低功耗" : "高性能"} GPU`);

  if (SMOKE_MODE && !SMOKE_MANUAL) {
    const smokeWindow = mainWindow;
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          if (SMOKE_VISUAL || SMOKE_FORCE_DISPLAY) {
            await smokeWindow.webContents.executeJavaScript(`(() => {
              const current = window.ScaGameSettings?.load?.() || {};
              window.ScaGameSettings?.save?.({ ...current, displayMode: ${JSON.stringify(SMOKE_VISUAL_DISPLAY_MODE)}, windowSize: 'current' });
            })()`);
            await setDesktopDisplayMode({ mode: SMOKE_VISUAL_DISPLAY_MODE, windowSize: "current" });
            await new Promise(resolveDelay => setTimeout(resolveDelay, 250));
          }
          const stopVisualMonitor = SMOKE_VISUAL || SMOKE_NAVIGATION ? startVisualFrameMonitor(smokeWindow) : null;
          if (SMOKE_VISIBLE) {
            smokeWindow.show();
            smokeWindow.focus();
          }
          const nativeStart = {
            focused: smokeWindow.isFocused(), visible: smokeWindow.isVisible(),
            bounds: smokeWindow.getBounds(),
            display: screen.getDisplayMatching(smokeWindow.getBounds())
          };
          let gameplay = null;
          let visual = null;
          let navigation = null;
          const tracePath = SMOKE_GAMEPLAY ? process.env.SCA_PERF_TRACE : null;
          if (tracePath) await contentTracing.startRecording({ included_categories: ['gpu', 'viz', 'cc', 'toplevel', 'benchmark', 'disabled-by-default-gpu.service'] });
          try {
            navigation = SMOKE_NAVIGATION ? await collectNavigationSmoke(smokeWindow) : null;
            gameplay = SMOKE_RELEASE ? await collectReleaseInteractionSmoke(smokeWindow) : SMOKE_GAMEPLAY
              ? (SMOKE_MULTIPLAYER ? await collectMultiplayerGameplaySmoke(smokeWindow) : await collectGameplaySmoke(smokeWindow))
              : null;
          } finally {
            visual = stopVisualMonitor?.() || null;
            if (tracePath) logger.info(`PERF_TRACE ${await contentTracing.stopRecording(tracePath)}`);
          }
          const display = SMOKE_DISPLAY ? await collectDisplayInteractionSmoke(smokeWindow) : null;
          const state = await smokeWindow.webContents.executeJavaScript(`({ title: document.title, connection: document.getElementById("connectionText")?.textContent || "", warning: document.getElementById("networkWarning")?.hidden === false, renderer: document.getElementById("renderBadge")?.title || "", refresh: new URLSearchParams(location.search).get("refresh"), desktopApi: Boolean(window.starClusterDesktop?.desktop) })`);
          state.gameplay = gameplay;
          state.runtime = { electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node };
          state.nativeStart = nativeStart;
          state.nativeEnd = { focused: smokeWindow.isFocused(), visible: smokeWindow.isVisible(), bounds: smokeWindow.getBounds() };
          if (SMOKE_VISIBLE && (!nativeStart.focused || !state.nativeEnd.focused)) throw new Error('前台性能采样失去窗口焦点，不能作为玩家帧率结果');
          state.display = display;
          state.visual = visual;
          state.navigation = navigation;
          if (SMOKE_MULTIPLAYER && !SMOKE_GAMEPLAY && state.connection !== "联机服务正常") throw new Error(`联机大厅状态异常：${state.connection}`);
          if (display && (
            !display.buttonEntered?.native?.fullscreen
            || display.buttonLeft?.native?.fullscreen
            || !display.settingsEntered?.native?.fullscreen
            || display.settingsLeft?.native?.fullscreen
            || !display.buttonEntered?.renderer?.desktopApi
            || !display.buttonEntered?.renderer?.desktopMethods
            || display.buttonEntered?.renderer?.buttonPressed !== "true"
            || display.buttonLeft?.renderer?.buttonPressed !== "false"
            || display.settingsEntered?.renderer?.savedMode !== "borderless-fullscreen"
            || display.settingsLeft?.renderer?.savedMode !== "windowed"
            || display.settingsEntered?.renderer?.selectedMode !== "borderless-fullscreen"
            || display.settingsLeft?.renderer?.selectedMode !== "windowed"
            || Math.abs((display.settingsLeft?.native?.contentBounds?.width || 0) - 1280) > 20
            || Math.abs((display.settingsLeft?.native?.contentBounds?.height || 0) - 720) > 20
          )) {
            throw new Error(`桌面全屏状态异常：${JSON.stringify(display)}`);
          }
          if (gameplay && !SMOKE_RELEASE && gameplay.samples.filter(sample => !sample.over).length < 2) throw new Error(`性能采样缺少有效对局帧：${gameplay.mode}`);
          if (gameplay && !SMOKE_RELEASE && gameplay.samples.some(sample => Number.isFinite(sample.backingStoreResizes) && sample.backingStoreResizes !== 0)) {
            throw new Error(`固定窗口对局期间发生 Canvas 后备缓冲重建：${JSON.stringify({ samples: gameplay.samples, visual })}`);
          }
          if (gameplay && !SMOKE_RELEASE && SMOKE_MULTIPLAYER && gameplay.samples.some(sample => sample.world && (sample.world.width !== 7600 || sample.world.height !== 7600))) {
            throw new Error(`联机世界尺寸回退：${JSON.stringify(gameplay.samples)}`);
          }
          if (gameplay && !SMOKE_RELEASE && SMOKE_MIN_FPS > 0 && gameplay.summary.steadyAverageFps < SMOKE_MIN_FPS) {
            logger.info(`DESKTOP_SMOKE_FAILED ${JSON.stringify(state)}`);
            throw new Error(`性能采样低于门槛：${gameplay.summary.steadyAverageFps} < ${SMOKE_MIN_FPS} FPS；${JSON.stringify(gameplay.summary)}`);
          }
          if (visual?.suspiciousFrames?.length) {
            throw new Error(`检测到疑似白屏合成帧：${JSON.stringify(visual)}`);
          }
          logger.info(`DESKTOP_SMOKE_OK ${JSON.stringify(state)}`);
        } catch (error) {
          process.exitCode = 2;
          logger.error(error);
        } finally {
          if (process.exitCode) {
            await stopDesktop();
            app.exit(process.exitCode);
          } else {
            app.quit();
          }
        }
      }, SMOKE_MULTIPLAYER ? 1000 : SMOKE_GAMEPLAY ? 500 : 300);
    });
  }

  await mainWindow.loadURL(desktopGameUrl(SMOKE_MULTIPLAYER ? "/multiplayer.html" : "/"));
}

async function startDesktop() {
  const logsDirectory = join(app.getPath("userData"), "logs");
  await mkdir(logsDirectory, { recursive: true });
  logFile = join(logsDirectory, "desktop.log");

  const firewall = await inspectWindowsFirewall({ logger });
  let lastPortError = null;
  for (const port of [25555, 25557, 0]) {
    if (port > 0 && await tcpPortHasListener(port)) {
      lastPortError = Object.assign(new Error(`TCP port ${port} already has a loopback listener`), { code: "EADDRINUSE" });
      logger.warn(`联机端口 ${port} 已有本机服务应答，跳过重叠监听并尝试备用端口。`);
      continue;
    }
    try {
      serverController = await startServer({
        host: "0.0.0.0",
        port,
        preferredPort: 25555,
        discoveryEnabled: true,
        networkDiagnostics: { firewall },
        logger
      });
      break;
    } catch (error) {
      lastPortError = error;
      if (error.code !== "EADDRINUSE" || port === 0) throw error;
      logger.warn(`联机端口 ${port} 已被占用，正在尝试备用端口。`);
    }
  }
  if (!serverController) throw lastPortError || new Error("无法启动内置游戏服务");
  logger.info(`内置游戏服务已启动：${serverController.url}`);
  logger.info(`局域网地址：${serverController.discovery.status().addresses.join(", ") || "无"}；TCP ${serverController.port}；UDP ${serverController.discovery.status().port}；防火墙 ${firewall.status}`);
  createMenu();
  await createMainWindow();
}

async function stopDesktop() {
  if (stopping) return;
  stopping = true;
  try {
    await profileStore?.flush();
    await serverController?.close();
    logger.info("内置游戏服务已停止");
  } catch (error) {
    logger.error(error);
  }
}

if (electronSquirrelStartup) {
  app.quit();
} else {
  const primaryInstance = app.requestSingleInstanceLock();
  if (!primaryInstance) {
    app.quit();
  } else {
    app.on("second-instance", () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    });
    app.on("before-quit", event => {
      if (serverController && !stopping) {
        event.preventDefault();
        void stopDesktop().finally(() => app.quit());
      }
    });
    app.on("window-all-closed", () => app.quit());
    app.whenReady().then(async () => {
      profileStore = await createProfileStore(app.getPath("userData"), { logger });
      if (SMOKE_MODE && SMOKE_GAMEPLAY && ['auto', 'performance', 'balanced', 'high'].includes(process.env.SCA_PERF_QUALITY)) {
        profileStore.set('starClusterGameSettingsV1', JSON.stringify({ quality: process.env.SCA_PERF_QUALITY }));
      }
      ipcMain.on("desktop:load-profile", event => {
        event.returnValue = mainWindow && event.sender === mainWindow.webContents ? profileStore.snapshot() : {};
      });
      ipcMain.on("desktop:save-profile-value", (event, key, value) => {
        if (mainWindow && event.sender === mainWindow.webContents) profileStore.set(key, value);
      });
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
      ipcMain.handle("desktop:open-firewall-settings", async event => {
        if (!mainWindow || event.sender !== mainWindow.webContents) return false;
        await shell.openExternal("windowsdefender://Network");
        return true;
      });
      ipcMain.handle("desktop:open-external", async (event, target) => {
        if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: "游戏窗口不可用" };
        return openAllowedExternal(target);
      });
      ipcMain.handle("desktop:copy-text", (event, value) => {
        if (!mainWindow || event.sender !== mainWindow.webContents) return false;
        const text = String(value ?? "").slice(0, 256);
        if (!text) return false;
        clipboard.writeText(text);
        return true;
      });
      ipcMain.handle("desktop:get-display-state", event => {
        if (!mainWindow || event.sender !== mainWindow.webContents) return null;
        return currentDisplayState();
      });
      ipcMain.handle("desktop:set-display-mode", (event, settings) => {
        if (!mainWindow || event.sender !== mainWindow.webContents) return null;
        return setDesktopDisplayMode(settings);
      });
      ipcMain.handle("desktop:toggle-fullscreen", event => {
        if (!mainWindow || event.sender !== mainWindow.webContents) return null;
        return toggleDesktopDisplayMode();
      });
      ipcMain.handle("desktop:quit", event => {
        if (!mainWindow || event.sender !== mainWindow.webContents) return false;
        app.quit();
        return true;
      });
      await startDesktop();
    }).catch(error => {
      logger.error(error);
      app.exit(1);
    });
  }
}
