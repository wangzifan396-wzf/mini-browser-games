import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const captureDir = path.join(rootDir, "output", "vibe-coding-retrospective");
const articleDir = path.join(rootDir, "docs", "images", "vibe-coding-retrospective");
const auditFile = path.join(rootDir, "output", "game-audit-results.json");
const auditDoc = path.join(rootDir, "GAME_AUDIT.md");
const port = 4180;
await mkdir(captureDir, { recursive: true });
await mkdir(articleDir, { recursive: true });

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
      "content-type": path.extname(target) === ".html"
        ? "text/html; charset=utf-8"
        : "application/octet-stream",
      "cache-control": "no-store"
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise(resolve => server.listen(port, "127.0.0.1", resolve));

const recipes = [
  { id: "starforge", name: "星炉工坊", file: "starforge-idle.html" },
  { id: "moba", name: "晶塔前线", file: "moba-frontier.html", debugStart: true },
  { id: "shan-hai", name: "山海伏魔录", file: "shan-hai.html" },
  { id: "snake", name: "霓虹贪吃蛇", file: "snake-game.html" },
  { id: "neon-2048", name: "霓虹 2048", file: "neon-2048.html" },
];

let browser;
const diagnostics = [];
try {
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  for (const recipe of recipes) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      colorScheme: "dark"
    });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const query = recipe.debugStart ? "?debug=1" : "";
    await page.goto(`http://127.0.0.1:${port}/${recipe.file}${query}`, { waitUntil: "load" });
    if (recipe.debugStart) {
      await page.waitForFunction(() => Boolean(window.__crystalFrontDebug));
      await page.evaluate(() => window.__crystalFrontDebug.start({ seed: 396 }));
      await page.waitForTimeout(700);
    } else {
      await page.waitForTimeout(550);
    }
    await page.screenshot({
      path: path.join(captureDir, `${recipe.id}.jpg`),
      type: "jpeg",
      quality: 92,
      fullPage: false
    });
    diagnostics.push({
      id: recipe.id,
      name: recipe.name,
      file: recipe.file,
      title: await page.title(),
      pageErrors: [...new Set(pageErrors)],
      consoleErrors: [...new Set(consoleErrors)],
      horizontalOverflow: await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 4
      ),
      screenshot: `output/vibe-coding-retrospective/${recipe.id}.jpg`
    });
    await context.close();
  }

  const audit = JSON.parse(await readFile(auditFile, "utf8"));
  const auditMarkdown = await readFile(auditDoc, "utf8");
  const htmlFiles = (await readdir(rootDir)).filter(file => file.endsWith(".html"));
  const htmlStats = [];
  for (const file of htmlFiles) {
    const source = await readFile(path.join(rootDir, file), "utf8");
    htmlStats.push({ file, bytes: Buffer.byteLength(source), lines: source.split(/\r?\n/).length });
  }
  const sortedBytes = htmlStats.map(item => item.bytes).sort((a, b) => a - b);
  const ratingMatches = [...auditMarkdown.matchAll(/^### ([SABCD]) 级（(\d+) 款）/gm)];
  const ratings = Object.fromEntries(ratingMatches.map(match => [match[1], Number(match[2])]));
  const rounds = [...auditMarkdown.matchAll(/^## (第[^\n]+(?:轮质量更新|批重制成果))/gm)].map(match => match[1]);
  const summary = {
    games: audit.gameCount,
    pages: audit.results.length,
    loadFailures: audit.results.filter(result => result.loadError || result.responseStatus !== 200).length,
    javascriptFailures: audit.results.filter(result => result.pageErrors.length).length,
    consoleFailures: audit.results.filter(result => result.consoleErrors.length).length,
    overflows: audit.results.filter(result => result.horizontalOverflow).length,
    weakPages: audit.results.filter(result => result.textLength < 80 && result.visibleCanvasCount === 0).length
  };
  const projectData = {
    generatedAt: new Date().toISOString(),
    methodology: "Repository-derived counts plus Playwright screenshots from five different games; ratings are the project's own quality rubric, not market scores.",
    audit: summary,
    ratings,
    qualityRounds: rounds.length,
    html: {
      files: htmlFiles.length,
      totalBytes: htmlStats.reduce((sum, item) => sum + item.bytes, 0),
      totalLines: htmlStats.reduce((sum, item) => sum + item.lines, 0),
      medianBytes: sortedBytes[Math.floor(sortedBytes.length / 2)] || 0
    },
    diagnostics,
    captures: recipes.map(recipe => ({
      id: recipe.id,
      name: recipe.name,
      path: `output/vibe-coding-retrospective/${recipe.id}.jpg`
    })),
    committedReference: {
      id: "star-cluster",
      name: "星团大作战",
      path: "docs/images/browser-performance/star-cluster-stress.jpg"
    }
  };
  assert.equal(summary.games, 100);
  assert.equal(summary.pages, 200);
  assert.equal(Object.values(ratings).reduce((sum, value) => sum + value, 0), 100);
  assert.equal(ratings.S, 10);
  assert.equal(ratings.A, 21);
  assert.equal(rounds.length, 7);
  assert.deepEqual(
    diagnostics.flatMap(item => item.pageErrors),
    [],
    "capture page errors"
  );
  assert.deepEqual(
    diagnostics.flatMap(item => item.consoleErrors),
    [],
    "capture console errors"
  );
  await writeFile(
    path.join(articleDir, "project-data.json"),
    `${JSON.stringify(projectData, null, 2)}\n`,
    "utf8"
  );
  console.log(JSON.stringify({
    checks: "PASS",
    audit: summary,
    ratings,
    qualityRounds: rounds.length,
    totalLines: projectData.html.totalLines,
    captures: diagnostics.map(item => item.screenshot)
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.close();
}
