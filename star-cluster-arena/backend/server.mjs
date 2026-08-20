import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import { WebSocketServer } from "ws";
import { LanDiscovery } from "./multiplayer/lan-discovery.mjs";
import { publicModeCatalog } from "./multiplayer/modes.mjs";
import { PROTOCOL_VERSION, ProtocolError, normalizeRoomCode } from "./multiplayer/protocol.mjs";
import { RoomManager } from "./multiplayer/room-manager.mjs";

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);
const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FRONTEND_ROOT = resolve(HERE, "../frontend");
const DEFAULT_HOST = process.env.HOST || "0.0.0.0";
const requestedPort = Number.parseInt(process.env.PORT || "25555", 10);
const DEFAULT_PORT = Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort < 65536 ? requestedPort : 25555;
const VERSION = "3.2.0-lan";
const MAX_TELEMETRY_BYTES = 16 * 1024;
const MAX_API_BODY_BYTES = 24 * 1024;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".woff2", "font/woff2"]
]);

function securityHeaders() {
  return {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
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

async function readBody(request, maximumBytes = MAX_API_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error("payload-too-large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function remoteAddress(request) {
  return String(request.socket.remoteAddress || "unknown").replace(/^::ffff:/, "");
}

function requestHost(request, actualPort) {
  const header = String(request.headers.host || "").trim();
  if (/^[a-z0-9.:[\]-]+$/i.test(header)) return header;
  return `127.0.0.1:${actualPort}`;
}

function websocketEndpoint(request, roomCode, actualPort) {
  return `ws://${requestHost(request, actualPort)}/ws?room=${roomCode}`;
}

function allowedWebSocketOrigin(origin, request) {
  if (!origin || origin === "null") return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (!["http:", "https:", "app:"].includes(parsed.protocol)) return false;
  const hostname = parsed.hostname.toLowerCase();
  if (["127.0.0.1", "localhost", "::1"].includes(hostname)) return true;
  const requestedHostname = String(request.headers.host || "").split(":")[0].replace(/^\[|\]$/g, "").toLowerCase();
  return hostname === requestedHostname || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

function createSlidingWindowLimiter({ maximum = 8, windowMs = 60_000 } = {}) {
  const entries = new Map();
  return address => {
    const now = Date.now();
    const entry = entries.get(address);
    if (!entry || now - entry.startedAt >= windowMs) {
      entries.set(address, { startedAt: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= maximum;
  };
}

function createTelemetry() {
  return { samples: 0, averageFps: 0, averageWorkMs: 0, gpuSamples: 0, last: null };
}

export async function startServer(options = {}) {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const frontendRoot = resolve(options.frontendRoot || DEFAULT_FRONTEND_ROOT);
  const logger = options.logger || console;
  const assetCache = new Map();
  const telemetry = createTelemetry();
  const roomManager = options.roomManager || new RoomManager({
    logger,
    allowSinglePlayerStart: Boolean(options.allowSinglePlayerStart)
  });
  const canCreateRoom = createSlidingWindowLimiter({ maximum: options.roomCreatesPerMinute || 8 });
  let actualPort = 0;
  let closing = false;
  let broadcastRoomChanges = null;

  function diagnosticsSnapshot() {
    const value = typeof options.networkDiagnostics === "function" ? options.networkDiagnostics() : options.networkDiagnostics;
    return value && typeof value === "object" ? value : {
      firewall: { status: "unknown", message: "当前运行方式不提供 Windows 防火墙诊断。" }
    };
  }

  function lanRoomsPayload(request, discovery) {
    const localRooms = roomManager.roomList(room => websocketEndpoint(request, room.code, actualPort))
      .map(room => ({
        ...room,
        instanceId: discovery.instanceId || "local",
        endpoints: [room.endpoint],
        source: "local",
        seenAt: Date.now()
      }));
    const combined = new Map();
    for (const room of [...discovery.list(), ...localRooms]) {
      const key = `${room.instanceId || room.source}:${room.code}:${room.endpoint}`;
      combined.set(key, room);
    }
    return {
      protocol: PROTOCOL_VERSION,
      rooms: [...combined.values()].sort((left, right) => (right.seenAt || right.createdAt) - (left.seenAt || left.createdAt) || left.code.localeCompare(right.code)),
      discovery: discovery.status(),
      diagnostics: diagnosticsSnapshot()
    };
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

  async function handleApi(request, response, url, discovery) {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        name: "star-cluster-arena",
        version: VERSION,
        uptimeSeconds: Math.round(process.uptime()),
        ...roomManager.stats()
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/runtime") {
      sendJson(response, 200, {
        name: "star-cluster-arena",
        version: VERSION,
        protocol: PROTOCOL_VERSION,
        origin: `http://${requestHost(request, actualPort)}`,
        multiplayer: {
          enabled: true,
          discovery: discovery.status(),
          maxHumanPlayers: 8,
          authoritativeServer: true,
          simulationHz: 20,
          snapshotHz: 20,
          inputHz: 30,
          snapshotInterpolation: "adaptive-history",
          modes: publicModeCatalog()
        },
        renderer: { preferred: "webgl2", fallback: "canvas2d", powerPreference: "high-performance" },
        tuning: {
          adaptivePixelRatio: true,
          maxPixelRatio: 1.25,
          foregroundPixelBudget: 3200000,
          fixedSimulationHz: 60,
          batchedFoodRendering: true,
          gpuSpriteBatching: true,
          singleVisibleSurface: true,
          stableCanvasDuringPlay: true,
          pooledCollisionBuffers: true,
          spatialIndexReuse: true
        }
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/modes") {
      sendJson(response, 200, { protocol: PROTOCOL_VERSION, modes: publicModeCatalog() });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/telemetry") {
      try {
        const value = JSON.parse(await readBody(request, MAX_TELEMETRY_BYTES) || "{}");
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

    if (request.method === "GET" && url.pathname === "/api/lan/status") {
      sendJson(response, 200, {
        ...discovery.status(),
        protocol: PROTOCOL_VERSION,
        localRooms: roomManager.roomList().length,
        servicePort: actualPort,
        preferredPort: options.preferredPort ?? port,
        diagnostics: diagnosticsSnapshot()
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/lan/rooms") {
      sendJson(response, 200, lanRoomsPayload(request, discovery));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/lan/probe") {
      await discovery.probe(options.discoveryProbeWaitMs ?? 450);
      sendJson(response, 200, lanRoomsPayload(request, discovery));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      if (!canCreateRoom(remoteAddress(request))) {
        sendJson(response, 429, { error: "rate-limited", message: "创建房间过于频繁，请稍后再试" });
        return true;
      }
      try {
        const value = JSON.parse(await readBody(request) || "{}");
        const created = roomManager.createRoom(value);
        sendJson(response, 201, {
          ...created,
          protocol: PROTOCOL_VERSION,
          endpoint: websocketEndpoint(request, created.code, actualPort),
          endpoints: [websocketEndpoint(request, created.code, actualPort)],
          diagnostics: diagnosticsSnapshot()
        });
      } catch (error) {
        sendJson(response, error.message === "payload-too-large" ? 413 : 400, {
          error: "invalid-room-request",
          message: "创建房间参数无效"
        });
      }
      return true;
    }

    const roomMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{1,12})$/);
    if (roomMatch && request.method === "GET") {
      const room = roomManager.getRoom(roomMatch[1]);
      if (!room) sendJson(response, 404, { error: "room-not-found" });
      else sendJson(response, 200, { room: roomManager.publicLobby(room), protocol: PROTOCOL_VERSION });
      return true;
    }

    if (roomMatch && request.method === "DELETE") {
      const authorization = String(request.headers.authorization || "");
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      try {
        const removed = roomManager.deleteRoom(roomMatch[1], token);
        if (!removed) sendJson(response, 404, { error: "room-not-found" });
        else {
          response.writeHead(204, securityHeaders());
          response.end();
        }
      } catch (error) {
        const status = error instanceof ProtocolError ? 403 : 500;
        sendJson(response, status, { error: error.code || "server-error", message: error.message });
      }
      return true;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "not-found" });
      return true;
    }
    return false;
  }

  async function serveStatic(request, response, url) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "method-not-allowed" }, { Allow: "GET, HEAD" });
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    } catch {
      sendJson(response, 400, { error: "invalid-path" });
      return;
    }
    const filePath = resolve(frontendRoot, `.${pathname}`);
    if (filePath !== frontendRoot && !filePath.startsWith(`${frontendRoot}${sep}`)) {
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
      logger.error?.(error);
      sendJson(response, 500, { error: "internal-server-error" });
    }
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false, clientTracking: false });
  let discovery;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${requestHost(request, actualPort || port || 25555)}`);
      if (await handleApi(request, response, url, discovery)) return;
      await serveStatic(request, response, url);
    } catch (error) {
      logger.error?.(error);
      if (!response.headersSent) sendJson(response, 500, { error: "internal-server-error" });
      else response.destroy();
    }
  });

  server.on("upgrade", (request, socket, head) => {
    try {
      socket.setNoDelay?.(true);
      const url = new URL(request.url || "/", `http://${requestHost(request, actualPort || port || 25555)}`);
      const code = normalizeRoomCode(url.searchParams.get("room"));
      if (url.pathname !== "/ws" || code.length !== 6 || !roomManager.getRoom(code)) {
        socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      if (!allowedWebSocketOrigin(request.headers.origin, request)) {
        socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, webSocket => {
        roomManager.connectSocket(webSocket, code, { remoteAddress: remoteAddress(request) });
      });
    } catch {
      socket.destroy();
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    const onError = error => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
  const address = server.address();
  actualPort = typeof address === "object" && address ? address.port : port;

  discovery = options.discovery || new LanDiscovery({
    enabled: options.discoveryEnabled !== false,
    port: options.discoveryPort,
    roomProvider: () => roomManager.discoveryRooms(),
    servicePortProvider: () => actualPort,
    logger
  });
  try {
    await discovery.start();
  } catch (error) {
    logger.warn?.(`LAN discovery could not start: ${error.message}`);
  }
  broadcastRoomChanges = () => discovery.broadcast?.();
  roomManager.on("rooms-changed", broadcastRoomChanges);

  return {
    server,
    wss,
    roomManager,
    discovery,
    host,
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    async close() {
      if (closing) return;
      closing = true;
      await roomManager.close();
      if (broadcastRoomChanges) roomManager.off("rooms-changed", broadcastRoomChanges);
      await new Promise(resolveDelay => setTimeout(resolveDelay, 25));
      await discovery.close();
      await new Promise(resolveClose => {
        try { wss.close(resolveClose); } catch { resolveClose(); }
      });
      await new Promise(resolveClose => {
        if (!server.listening) return resolveClose();
        server.close(() => resolveClose());
        server.closeAllConnections?.();
      });
    }
  };
}

const directEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directEntry) {
  try {
    const controller = await startServer();
    console.log(`Star Cluster Arena is running at ${controller.url}`);
    console.log(`LAN multiplayer protocol ${PROTOCOL_VERSION}; WebGL2 rendering is preferred.`);
    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.on(signal, async () => {
        await controller.close();
        process.exit(0);
      });
    }
  } catch (error) {
    console.error(`Unable to start Star Cluster Arena on ${DEFAULT_HOST}:${DEFAULT_PORT}:`, error.message);
    process.exitCode = 1;
  }
}
