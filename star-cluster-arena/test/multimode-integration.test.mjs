import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import WebSocket from "ws";
import { startServer } from "../backend/server.mjs";
import { MODE_KEYS } from "../backend/multiplayer/modes.mjs";
import { PROTOCOL_VERSION } from "../backend/multiplayer/protocol.mjs";

await import("../frontend/js/snapshot-wire.js");
const { decodeSnapshot } = globalThis.ScaSnapshotWire;

class Client {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.queue = [];
    this.waiters = [];
    this.configVersion = 0;
    this.socket.on("message", raw => {
      const wireBytes = raw.length;
      const parsed = JSON.parse(raw.toString("utf8"));
      const message = parsed.type === "snapshot" ? decodeSnapshot(parsed) : parsed;
      if (message.type === "welcome" || message.type === "lobby") {
        this.configVersion = message.room?.configVersion || this.configVersion;
      }
      if (message.type === "snapshot") message.wireBytes = wireBytes;
      const index = this.waiters.findIndex(waiter => waiter.predicate(message));
      if (index >= 0) {
        const [waiter] = this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        this.queue.push(message);
      }
    });
  }

  async open() {
    await once(this.socket, "open");
  }

  send(message) {
    if (["ready", "start"].includes(message.type) && !Object.hasOwn(message, "configVersion")) {
      message = { ...message, configVersion: this.configVersion };
    }
    this.socket.send(JSON.stringify(message));
  }

  waitFor(typeOrPredicate, timeoutMs = 3000) {
    const predicate = typeof typeOrPredicate === "function" ? typeOrPredicate : value => value.type === typeOrPredicate;
    const index = this.queue.findIndex(predicate);
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        const pending = this.waiters.indexOf(waiter);
        if (pending >= 0) this.waiters.splice(pending, 1);
        reject(new Error(`Timed out waiting for ${String(typeOrPredicate)}`));
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

function assertModeState(mode, snapshot) {
  assert.equal(snapshot.mode, mode);
  assert.ok(Array.isArray(snapshot.ranking));
  assert.ok(snapshot.objective && typeof snapshot.objective === "object");
  if (["team", "control"].includes(mode)) assert.ok(snapshot.teams.length >= 2);
  if (["survival", "battle"].includes(mode)) assert.ok(snapshot.groups.every(group => group.lives >= 0));
  if (["battle", "giant"].includes(mode)) assert.ok(snapshot.safeZone?.radius > 0);
  if (["survival", "spore"].includes(mode)) assert.ok(snapshot.viruses.length > 0);
  if (mode === "screen") assert.equal(snapshot.arena.type, "rect");
  if (mode === "control") assert.equal(snapshot.controlPoints.length, 3);
  if (mode === "demon") assert.ok(snapshot.groups.some(group => group.role === "boss"));
}

test("the public API and real WebSocket flow support all ten LAN modes", async t => {
  const server = await startServer({
    host: "127.0.0.1",
    port: 0,
    discoveryEnabled: false,
    roomCreatesPerMinute: 30
  });
  t.after(() => server.close());

  const catalog = await fetch(`${server.url}/api/modes`).then(response => response.json());
  assert.equal(catalog.protocol, PROTOCOL_VERSION);
  assert.deepEqual(catalog.modes.map(mode => mode.key), MODE_KEYS);

  for (const mode of MODE_KEYS) {
    const response = await fetch(`${server.url}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "host", roomName: `${mode}-e2e`, mode, maxPlayers: 2, botCount: 4, seed: 320 })
    });
    assert.equal(response.status, 201, mode);
    const room = await response.json();
    const host = new Client(room.endpoint);
    const guest = new Client(room.endpoint);
    await Promise.all([host.open(), guest.open()]);
    host.send({ type: "join", protocol: PROTOCOL_VERSION, name: "host", hostToken: room.hostToken });
    guest.send({ type: "join", protocol: PROTOCOL_VERSION, name: "guest" });
    const [hostWelcome] = await Promise.all([host.waitFor("welcome"), guest.waitFor("welcome")]);
    assert.equal(hostWelcome.room.settings.mode, mode);

    host.send({ type: "ready", ready: true });
    guest.send({ type: "ready", ready: true });
    await host.waitFor(value => value.type === "lobby" && value.room.players.every(player => player.ready));
    host.send({ type: "start" });
    const started = await host.waitFor("match-start");
    assert.equal(started.mode, mode);
    assert.equal(started.configVersion, host.configVersion);
    assert.match(started.matchId, /^match-/);
    assert.match(started.baselineId, /^baseline-/);

    const baseline = await host.waitFor(value => value.type === "snapshot" && value.foodBaseline);
    const dynamic = await host.waitFor(value => value.type === "snapshot" && value.tick > baseline.tick && !value.foodBaseline);
    assert.equal(dynamic.matchId, started.matchId);
    assert.equal(dynamic.baselineId, started.baselineId);
    assert.equal(dynamic.configVersion, started.configVersion);
    assert.equal(dynamic.foodDelta.fromRevision <= dynamic.foodDelta.toRevision, true);
    assert.equal(dynamic.virusDelta.fromRevision <= dynamic.virusDelta.toRevision, true);
    assert.ok(dynamic.wireBytes < 16 * 1024, `${mode}: ${dynamic.wireBytes} bytes`);
    assertModeState(mode, baseline);
    await Promise.all([host.close(), guest.close()]);
  }
});
