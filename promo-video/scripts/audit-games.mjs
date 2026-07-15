import http from "node:http";
import { createReadStream } from "node:fs";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputFile = path.join(rootDir, "output", "game-audit-results.json");
const port = 4174;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    if (pathname === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    const target = path.resolve(rootDir, pathname.slice(1));
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

const files = (await readdir(rootDir))
  .filter((file) => file.endsWith(".html"))
  .sort((a, b) => a.localeCompare(b));

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
} catch {
  browser = await chromium.launch({ headless: true });
}

const viewports = [
  { id: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { id: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
];

const startSelectors = [
  "#startBtn",
  "#start",
  "#playBtn",
  "#newGameBtn",
  "#restartBtn",
  "#dealBtn",
  "#launchBtn",
  "#beginBtn",
];
const startPattern = /^(开始|开始游戏|开始战斗|开始挑战|新游戏|发牌|出发|启程|进入|开局|投币|抛竿|旋转)$/;

async function inspectPage(page, file, viewport) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const startedAt = Date.now();
  let responseStatus = 0;
  let loadError = "";
  try {
    const response = await page.goto(`http://127.0.0.1:${port}/${file}`, {
      waitUntil: "load",
      timeout: 15_000,
    });
    responseStatus = response?.status() || 0;
    await page.waitForTimeout(260);
  } catch (error) {
    loadError = error.message;
  }

  let initial = {};
  if (!loadError) {
    initial = await page.evaluate(() => {
      const body = document.body;
      const root = document.documentElement;
      const canvases = [...document.querySelectorAll("canvas")];
      const interactive = [...document.querySelectorAll("button, input, select, [role='button']")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 2 && rect.height > 2 && style.display !== "none" && style.visibility !== "hidden";
        });
      return {
        title: document.title.trim(),
        textLength: (body?.innerText || "").replace(/\s+/g, "").length,
        bodyWidth: body?.scrollWidth || 0,
        rootWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        bodyHeight: body?.scrollHeight || 0,
        canvasCount: canvases.length,
        visibleCanvasCount: canvases.filter((canvas) => {
          const rect = canvas.getBoundingClientRect();
          return rect.width > 10 && rect.height > 10;
        }).length,
        interactiveCount: interactive.length,
        tinyTargets: interactive.filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width < 40 || rect.height < 36;
        }).length,
        hasViewportMeta: Boolean(document.querySelector('meta[name="viewport"]')),
        horizontalOverflow: root.scrollWidth > root.clientWidth + 4,
      };
    });
  }

  let startAttempted = false;
  if (!loadError) {
    for (const selector of startSelectors) {
      const target = page.locator(selector).first();
      if ((await target.count()) && (await target.isVisible().catch(() => false))) {
        await target.click({ timeout: 1_500 }).catch(() => {});
        startAttempted = true;
        break;
      }
    }
    if (!startAttempted) {
      const buttons = page.getByRole("button");
      const count = Math.min(await buttons.count(), 30);
      for (let index = 0; index < count; index += 1) {
        const button = buttons.nth(index);
        const label = (await button.innerText().catch(() => "")).trim();
        if (startPattern.test(label) && (await button.isVisible().catch(() => false))) {
          await button.click({ timeout: 1_500 }).catch(() => {});
          startAttempted = true;
          break;
        }
      }
    }
    if (startAttempted) await page.waitForTimeout(320);
  }

  return {
    file,
    viewport: viewport.id,
    responseStatus,
    loadMs: Date.now() - startedAt,
    loadError,
    startAttempted,
    pageErrors: [...new Set(pageErrors)],
    consoleErrors: [...new Set(consoleErrors)],
    ...initial,
  };
}

const results = [];
for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    deviceScaleFactor: viewport.isMobile ? 2 : 1,
    colorScheme: "dark",
  });
  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      const file = files[index];
      const page = await context.newPage();
      const result = await inspectPage(page, file, viewport);
      results.push(result);
      await page.close();
      const flags = [
        result.loadError && "LOAD",
        result.pageErrors.length && "JS",
        result.horizontalOverflow && "OVERFLOW",
        !result.title && "TITLE",
      ].filter(Boolean);
      console.log(
        `[${viewport.id} ${String(index + 1).padStart(3, "0")}/${files.length}] ${file}${flags.length ? ` :: ${flags.join(",")}` : ""}`,
      );
    }
  });
  await Promise.all(workers);
  await context.close();
}

const payload = {
  generatedAt: new Date().toISOString(),
  gameCount: files.length,
  viewports,
  results,
};
await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const summary = {
  pages: results.length,
  loadFailures: results.filter((result) => result.loadError || result.responseStatus !== 200).length,
  javascriptFailures: results.filter((result) => result.pageErrors.length).length,
  consoleFailures: results.filter((result) => result.consoleErrors.length).length,
  overflows: results.filter((result) => result.horizontalOverflow).length,
  missingViewport: results.filter((result) => !result.hasViewportMeta).length,
  weakPages: results.filter((result) => result.textLength < 80 && result.visibleCanvasCount === 0).length,
};
console.log(JSON.stringify(summary, null, 2));
console.log(`Wrote ${outputFile}`);

await browser.close();
server.close();
