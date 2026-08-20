import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { networkInterfaces } from "node:os";
import WebSocket from "ws";
import { startServer } from "../backend/server.mjs";
import { PROTOCOL_VERSION } from "../backend/multiplayer/protocol.mjs";

await import("../frontend/js/snapshot-wire.js");

const { decodeSnapshot } = globalThis.ScaSnapshotWire;

class TestClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.queue = [];
    this.waiters = [];
    this.configVersion = 0;
    this.socket.on("message", raw => {
      const parsed = JSON.parse(raw.toString("utf8"));
      const value = parsed?.type === "snapshot" ? decodeSnapshot(parsed) : parsed;
      if (value.type === "welcome" || value.type === "lobby") {
        this.configVersion = value.room?.configVersion || this.configVersion;
      }
      const waiterIndex = this.waiters.findIndex(waiter => waiter.predicate(value));
      if (waiterIndex >= 0) {
        const [waiter] = this.waiters.splice(waiterIndex, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(value);
      } else {
        this.queue.push(value);
      }
    });
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await once(this.socket, "open");
  }

  send(value) {
    if (["ready", "start"].includes(value.type) && !Object.hasOwn(value, "configVersion")) {
      value = { ...value, configVersion: this.configVersion };
    }
    this.socket.send(JSON.stringify(value));
  }

  waitFor(typeOrPredicate, timeoutMs = 3000) {
    const predicate = typeof typeOrPredicate === "function" ? typeOrPredicate : value => value.type === typeOrPredicate;
    const queuedIndex = this.queue.findIndex(predicate);
    if (queuedIndex >= 0) return Promise.resolve(this.queue.splice(queuedIndex, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error("Timed out waiting for WebSocket message"));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    const closed = once(this.socket, "close");
    this.socket.close();
    await closed;
  }
}

async function createRoom(server, name = "房主") {
  const response = await fetch(`${server.url}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, roomName: "集成测试房", maxPlayers: 8, botCount: 2 })
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function verifyHostDirection(server, label) {
  const created = await createRoom(server, `${label}房主`);
  const host = new TestClient(created.endpoint);
  const guest = new TestClient(created.endpoint);
  await Promise.all([host.open(), guest.open()]);
  host.send({ type: "join", protocol: PROTOCOL_VERSION, name: `${label}房主`, hostToken: created.hostToken });
  guest.send({ type: "join", protocol: PROTOCOL_VERSION, name: `${label}客人` });
  await Promise.all([host.waitFor("welcome"), guest.waitFor("welcome")]);

  const guestClosed = once(guest.socket, "close");
  guest.send({ type: "leave" });
  const lobby = await host.waitFor(value => value.type === "lobby" && value.room.players.length === 1);
  assert.equal(lobby.room.players[0].host, true);
  await guestClosed;

  const replacement = new TestClient(created.endpoint);
  await replacement.open();
  replacement.send({ type: "join", protocol: PROTOCOL_VERSION, name: `${label}新客人` });
  await replacement.waitFor("welcome");
  const hostClosed = once(host.socket, "close");
  const replacementClosed = once(replacement.socket, "close");
  host.send({ type: "leave" });
  const hostLeft = await replacement.waitFor(value => value.type === "error" && value.code === "host-left");
  assert.equal(hostLeft.message, "房主已离线");
  await Promise.all([hostClosed, replacementClosed]);
  assert.equal((await fetch(`${server.url}/api/rooms/${created.code}`)).status, 404);
}

test("HTTP and WebSocket complete a two-player authoritative match flow", async t => {
  const server = await startServer({ host: "127.0.0.1", port: 0, discoveryEnabled: false });
  t.after(() => server.close());

  const health = await fetch(`${server.url}/api/health`).then(response => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.protocol, PROTOCOL_VERSION);

  const created = await createRoom(server);
  const host = new TestClient(created.endpoint);
  const guest = new TestClient(created.endpoint);
  t.after(() => Promise.allSettled([host.close(), guest.close()]));
  await Promise.all([host.open(), guest.open()]);

  host.send({ type: "join", protocol: PROTOCOL_VERSION, name: "房主", hostToken: created.hostToken });
  const hostWelcome = await host.waitFor("welcome");
  assert.equal(hostWelcome.host, true);

  guest.send({ type: "join", protocol: PROTOCOL_VERSION, name: "客人" });
  const guestWelcome = await guest.waitFor("welcome");
  assert.equal(guestWelcome.host, false);

  guest.send({ type: "start" });
  const forbidden = await guest.waitFor(value => value.type === "error" && value.code === "host-only");
  assert.equal(forbidden.code, "host-only");

  host.send({ type: "ready", ready: true });
  guest.send({ type: "ready", ready: true });
  const readyLobby = await host.waitFor(value => value.type === "lobby" && value.room.players.length === 2 && value.room.players.every(player => player.ready));
  assert.equal(readyLobby.room.code, created.code);

  host.send({ type: "start" });
  await Promise.all([host.waitFor("match-start"), guest.waitFor("match-start")]);
  host.send({ type: "input", seq: 1, dx: 1, dy: 0, split: false, eject: false });
  const firstSnapshot = await host.waitFor("snapshot");
  const secondSnapshot = await host.waitFor(value => value.type === "snapshot" && value.tick > firstSnapshot.tick);
  assert.ok(secondSnapshot.groups.some(group => group.id === hostWelcome.playerId));
  assert.equal(firstSnapshot.foodBaseline, true);
  assert.ok(firstSnapshot.foods.length >= 480);
  assert.ok(secondSnapshot.foodDelta);
  assert.equal(Array.isArray(secondSnapshot.foods), false);
  assert.ok(secondSnapshot.tick > firstSnapshot.tick);

  await guest.close();
  const resumed = new TestClient(created.endpoint);
  t.after(() => resumed.close());
  await resumed.open();
  resumed.send({
    type: "join",
    protocol: PROTOCOL_VERSION,
    name: "客人",
    resumeToken: guestWelcome.resumeToken
  });
  const resumedWelcome = await resumed.waitFor("welcome");
  assert.equal(resumedWelcome.playerId, guestWelcome.playerId);
  const resumedStart = await resumed.waitFor("match-start");
  assert.equal(resumedStart.resumed, true);
  assert.equal(resumedStart.mode, "solo");
  const resumedSnapshot = await resumed.waitFor("snapshot");
  assert.equal(resumedSnapshot.foodBaseline, true);
  assert.ok(resumedSnapshot.foods.length >= 480);
  await Promise.all([host.close(), resumed.close()]);
  await server.close();
});

test("protocol mismatch is rejected with a readable error", async t => {
  const server = await startServer({ host: "127.0.0.1", port: 0, discoveryEnabled: false, allowSinglePlayerStart: true });
  t.after(() => server.close());
  const created = await createRoom(server, "协议测试");
  const client = new TestClient(created.endpoint);
  t.after(() => client.close());
  await client.open();
  client.send({ type: "join", protocol: "obsolete-v0", name: "旧客户端" });
  const error = await client.waitFor(value => value.type === "error" && value.code === "protocol-mismatch");
  assert.match(error.message, /协议不兼容/);
  await client.close();
  await server.close();
});

test("a LAN-bound server is reachable through a non-loopback IPv4 address", async t => {
  const address = Object.values(networkInterfaces()).flat()
    .find(record => record?.family === "IPv4" && !record.internal)?.address;
  if (!address) return t.skip("当前系统没有可用的局域网 IPv4 地址");
  const server = await startServer({ host: "0.0.0.0", port: 0, discoveryEnabled: false });
  t.after(() => server.close());
  const response = await fetch(`http://${address}:${server.port}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  await server.close();
});

test("two independent instances can host in both directions and voluntary leave is immediate", async t => {
  const serverA = await startServer({ host: "127.0.0.1", port: 0, discoveryEnabled: false });
  const serverB = await startServer({ host: "127.0.0.1", port: 0, discoveryEnabled: false });
  t.after(() => Promise.allSettled([serverA.close(), serverB.close()]));
  await verifyHostDirection(serverA, "A");
  await verifyHostDirection(serverB, "B");
  await Promise.all([serverA.close(), serverB.close()]);
});

test("LAN diagnostics, endpoint candidates and active probe are exposed through the API", async t => {
  const firewall = { status: "blocked", message: "测试阻止规则" };
  const server = await startServer({
    host: "127.0.0.1",
    port: 0,
    preferredPort: 25555,
    discoveryEnabled: false,
    discoveryProbeWaitMs: 0,
    networkDiagnostics: { firewall }
  });
  t.after(() => server.close());
  const status = await fetch(`${server.url}/api/lan/status`).then(response => response.json());
  assert.equal(status.preferredPort, 25555);
  assert.deepEqual(status.diagnostics.firewall, firewall);

  const created = await createRoom(server, "诊断房主");
  assert.deepEqual(created.endpoints, [created.endpoint]);
  assert.deepEqual(created.diagnostics.firewall, firewall);
  const probed = await fetch(`${server.url}/api/lan/probe`, { method: "POST" }).then(response => response.json());
  assert.ok(probed.rooms.some(room => room.code === created.code && room.endpoints.length === 1));
  await server.close();
});
