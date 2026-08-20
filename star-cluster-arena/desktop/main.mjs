import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu, ipcMain, session, shell } from "electron";
import electronSquirrelStartup from "electron-squirrel-startup";
import { startServer } from "../backend/server.mjs";
import { inspectWindowsFirewall } from "../backend/multiplayer/windows-network-diagnostics.mjs";

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SMOKE_MODE = process.env.SCA_DESKTOP_SMOKE === "1";
const SMOKE_MULTIPLAYER = process.env.SCA_DESKTOP_SMOKE_PATH === "multiplayer";
let mainWindow = null;
let serverController = null;
let stopping = false;
let logFile = null;

app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");

async function writeLog(level, values) {
  const message = values.map(value => value instanceof Error ? value.stack || value.message : String(value)).join(" ");
  const line = `${new Date().toISOString()} [${level}] ${message}\n`;
  if (level === "error") console.error(message);
  else if (level === "warn") console.warn(message);
  else console.log(message);
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

function isLocalGameUrl(target) {
  if (!serverController) return false;
  try {
    return new URL(target).origin === new URL(serverController.url).origin;
  } catch {
    return false;
  }
}

function createMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "游戏",
      submenu: [
        { label: "返回首页", click: () => mainWindow?.loadURL(`${serverController.url}/`) },
        { label: "联机大厅", click: () => mainWindow?.loadURL(`${serverController.url}/multiplayer.html?desktop=1`) },
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
    show: false,
    backgroundColor: "#07111f",
    title: "星团大作战",
    icon: join(PROJECT_ROOT, "desktop", "assets", "icon.ico"),
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(PROJECT_ROOT, "desktop", "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (!isLocalGameUrl(target)) event.preventDefault();
  });
  mainWindow.webContents.on("will-attach-webview", event => event.preventDefault());
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logger.error(`渲染进程异常退出：${details.reason}`);
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) logger.error(`页面加载失败：${code} ${description} ${url}`);
  });

  mainWindow.once("ready-to-show", () => {
    if (!SMOKE_MODE) mainWindow?.show();
  });
  mainWindow.on("closed", () => { mainWindow = null; });

  if (SMOKE_MODE) {
    const smokeWindow = mainWindow;
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          const state = await smokeWindow.webContents.executeJavaScript(`({ title: document.title, connection: document.getElementById("connectionText")?.textContent || "", warning: document.getElementById("networkWarning")?.hidden === false })`);
          if (SMOKE_MULTIPLAYER && state.connection !== "联机服务正常") throw new Error(`联机大厅状态异常：${state.connection}`);
          logger.info(`DESKTOP_SMOKE_OK ${JSON.stringify(state)}`);
        } catch (error) {
          process.exitCode = 2;
          logger.error(error);
        } finally {
          app.quit();
        }
      }, SMOKE_MULTIPLAYER ? 1000 : 300);
    });
  }

  await mainWindow.loadURL(`${serverController.url}${SMOKE_MULTIPLAYER ? "/multiplayer.html?desktop=1" : "/?desktop=1"}`);
}

async function startDesktop() {
  const logsDirectory = join(app.getPath("userData"), "logs");
  await mkdir(logsDirectory, { recursive: true });
  logFile = join(logsDirectory, "desktop.log");

  const firewall = await inspectWindowsFirewall({ logger });
  let lastPortError = null;
  for (const port of [25555, 25557, 0]) {
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
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
      ipcMain.handle("desktop:open-firewall-settings", async event => {
        if (!mainWindow || event.sender !== mainWindow.webContents) return false;
        await shell.openExternal("windowsdefender://Network");
        return true;
      });
      await startDesktop();
    }).catch(error => {
      logger.error(error);
      app.exit(1);
    });
  }
}
