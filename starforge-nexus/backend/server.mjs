import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);
const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(HERE, "../frontend");
const HOST = process.env.HOST || "127.0.0.1";
const requestedPort = Number.parseInt(process.env.PORT || "25555", 10);
const PORT = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536
  ? requestedPort
  : 25555;
const VERSION = "1.0.0";
const MAX_TELEMETRY_BYTES = 16 * 1024;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".woff2", "font/woff2"]
]);

const assetCache = new Map();
const telemetry = {
  samples: 0,
  averageFps: 0,
  averageWorkMs: 0,
  gpuSamples: 0,
  last: null
};

function securityHeaders() {
  return {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Origin-Agent-Cluster": "?1",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
  };
}

function sendJson(response, status, value, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    ...securityHeaders(),
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    ...extraHeaders
  });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_TELEMETRY_BYTES) throw new Error("payload-too-large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      name: "starforge-nexus",
      version: VERSION,
      uptimeSeconds: Math.round(process.uptime())
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/runtime") {
    sendJson(response, 200, {
      name: "starforge-nexus",
      version: VERSION,
      origin: `http://${HOST}:${PORT}`,
      renderer: {
        preferred: "webgl2",
        fallback: "canvas2d",
        powerPreference: "high-performance"
      },
      tuning: {
        adaptivePixelRatio: true,
        maxPixelRatio: 1.25,
        foregroundPixelBudget: 1800000,
        fixedSimulationHz: 30,
        gpuProceduralBackground: true,
        gpuCacheHz: 60,
        singleVisibleSurface: true,
        stableCanvasDuringPlay: true,
        throttledDomUpdates: true,
        allocationReducedEffects: true
      }
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/telemetry") {
    try {
      const value = JSON.parse(await readBody(request) || "{}");
      const fps = Number(value.fps) || 0;
      const workMs = Number(value.workMs) || 0;
      telemetry.samples += 1;
      telemetry.averageFps += (fps - telemetry.averageFps) / telemetry.samples;
      telemetry.averageWorkMs += (workMs - telemetry.averageWorkMs) / telemetry.samples;
      if (value.gpu) telemetry.gpuSamples += 1;
      telemetry.last = {
        fps,
        workMs,
        renderer: String(value.renderer || "unknown").slice(0, 32),
        gpu: Boolean(value.gpu),
        dpr: Number(value.dpr) || 1,
        targetFps: Number(value.targetFps) || 60,
        simulationFps: Number(value.simulationFps) || 60,
        spriteBatching: Boolean(value.spriteBatching),
        maxFrame: Number(value.maxFrame) || 0,
        longFrames: Number(value.longFrames) || 0,
        lowQuality: Boolean(value.lowQuality),
        receivedAt: new Date().toISOString()
      };
      response.writeHead(204, securityHeaders());
      response.end();
    } catch (error) {
      sendJson(response, error.message === "payload-too-large" ? 413 : 400, { error: "invalid-telemetry" });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/telemetry") {
    sendJson(response, 200, {
      ...telemetry,
      averageFps: Math.round(telemetry.averageFps * 10) / 10,
      averageWorkMs: Math.round(telemetry.averageWorkMs * 10) / 10
    });
    return true;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "not-found" });
    return true;
  }
  return false;
}

async function cachedAsset(filePath) {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) return null;
  const cached = assetCache.get(filePath);
  if (cached && cached.mtimeMs === fileStat.mtimeMs) return cached;
  const raw = await readFile(filePath);
  const entry = {
    raw,
    mtimeMs: fileStat.mtimeMs,
    etag: `W/\"${fileStat.size.toString(16)}-${Math.trunc(fileStat.mtimeMs).toString(16)}\"`,
    br: null,
    gzip: null
  };
  assetCache.set(filePath, entry);
  return entry;
}

async function encodedAsset(entry, acceptEncoding) {
  if (acceptEncoding.includes("br")) {
    entry.br ||= await compressBrotli(entry.raw, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 }
    });
    return { body: entry.br, encoding: "br" };
  }
  if (acceptEncoding.includes("gzip")) {
    entry.gzip ||= await compressGzip(entry.raw, { level: 6 });
    return { body: entry.gzip, encoding: "gzip" };
  }
  return { body: entry.raw, encoding: null };
}

async function serveStatic(request, response, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "method-not-allowed" }, { Allow: "GET, HEAD" });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  } catch (_error) {
    sendJson(response, 400, { error: "invalid-path" });
    return;
  }
  const filePath = resolve(FRONTEND_ROOT, `.${pathname}`);
  if (filePath !== FRONTEND_ROOT && !filePath.startsWith(`${FRONTEND_ROOT}${sep}`)) {
    sendJson(response, 403, { error: "forbidden" });
    return;
  }

  try {
    const entry = await cachedAsset(filePath);
    if (!entry) throw new Error("not-found");
    if (request.headers["if-none-match"] === entry.etag) {
      response.writeHead(304, { ...securityHeaders(), ETag: entry.etag });
      response.end();
      return;
    }

    const type = mimeTypes.get(extname(filePath).toLowerCase()) || "application/octet-stream";
    const compressible = /^(text\/|application\/(javascript|json))/.test(type);
    const encoded = compressible
      ? await encodedAsset(entry, String(request.headers["accept-encoding"] || ""))
      : { body: entry.raw, encoding: null };
    const headers = {
      ...securityHeaders(),
      "Cache-Control": type.startsWith("text/html") ? "no-cache" : "public, max-age=0, must-revalidate",
      "Content-Type": type,
      "Content-Length": encoded.body.length,
      ETag: entry.etag,
      Vary: "Accept-Encoding"
    };
    if (encoded.encoding) headers["Content-Encoding"] = encoded.encoding;
    response.writeHead(200, headers);
    response.end(request.method === "HEAD" ? undefined : encoded.body);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR" || error.message === "not-found") {
      sendJson(response, 404, { error: "not-found" });
      return;
    }
    console.error(error);
    sendJson(response, 500, { error: "internal-server-error" });
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
    if (await handleApi(request, response, url)) return;
    await serveStatic(request, response, url);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: "internal-server-error" });
    else response.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Starforge Nexus is running at http://${HOST}:${PORT}`);
  console.log(`WebGL2 high-performance rendering is preferred; Canvas 2D is the fallback.`);
});

server.on("error", error => {
  console.error(`Unable to start Starforge Nexus on ${HOST}:${PORT}:`, error.message);
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
