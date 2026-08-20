import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  MAX_CATCH_UP_STEPS,
  RoomManager,
  ROOM_STATES,
  SNAPSHOT_BACKPRESSURE_LIMIT_BYTES
} from "../backend/multiplayer/room-manager.mjs";
import { PROTOCOL_VERSION, ProtocolError } from "../backend/multiplayer/protocol.mjs";

await import("../frontend/js/snapshot-wire.js");

const { decodeSnapshot } = globalThis.ScaSnapshotWire;

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.messages = [];
    this.closed = null;
    this.bufferedAmount = 0;
  }

  send(raw) {
    const message = typeof raw === "string" ? JSON.parse(raw) : raw;
    this.messages.push(message?.type === "snapshot" ? decodeSnapshot(message) : message);
  }

  close(code, reason) {
    this.readyState = 3;
    this.closed = { code, reason };
    this.emit("close");
  }

  clientSend(message) {
    if (this.room && ["ready", "start"].includes(message.type) && !Object.hasOwn(message, "configVersion")) {
      message = { ...message, configVersion: this.room.revision };
    }
    this.emit("message", Buffer.from(JSON.stringify(message)));
  }

  latest(type, code = null) {
    return this.messages.findLast(message => message.type === type && (!code || message.code === code));
  }
}

function join(manager, room, name, hostToken = "") {
  const socket = new FakeSocket();
  socket.room = room;
  manager.connectSocket(socket, room.code);
  socket.clientSend({ type: "join", protocol: PROTOCOL_VERSION, name, hostToken });
  return socket;
}

test("room capacity, host identity and public lobby are enforced", async t => {
  const manager = new RoomManager();
  t.after(() => manager.close());
  const created = manager.createRoom({ name: "房主", roomName: "容量测试", maxPlayers: 2, botCount: 99 });
  const room = manager.getRoom(created.code);
  assert.equal(room.settings.maxPlayers, 2);
  assert.equal(room.settings.botCount, 12);

  const host = join(manager, room, "房主", created.hostToken);
  const guest = join(manager, room, "客人");
  const overflow = join(manager, room, "第三人");
  assert.equal(host.latest("welcome").host, true);
  assert.equal(guest.latest("welcome").host, false);
  assert.equal(overflow.latest("error", "room-full").message, "房间已满");
  assert.equal(manager.publicLobby(room).players.length, 2);
  assert.equal(manager.stats().connections, 2);
});

test("only a ready host can start and invalid host tokens cannot delete", async t => {
  const manager = new RoomManager();
  t.after(() => manager.close());
  const created = manager.createRoom({ maxPlayers: 4, botCount: 0, seed: 42 });
  const room = manager.getRoom(created.code);
  const host = join(manager, room, "房主", created.hostToken);
  const guest = join(manager, room, "客人");

  host.clientSend({ type: "start" });
  assert.ok(host.latest("error", "players-not-ready"));
  guest.clientSend({ type: "start" });
  assert.ok(guest.latest("error", "host-only"));

  host.clientSend({ type: "ready", ready: true });
  guest.clientSend({ type: "ready", ready: true });
  host.clientSend({ type: "start" });
  assert.equal(room.state, ROOM_STATES.RUNNING);
  assert.ok(host.latest("match-start"));
  assert.ok(guest.latest("match-start"));

  assert.throws(() => manager.deleteRoom(created.code, "wrong-token"), error => {
    assert.ok(error instanceof ProtocolError);
    assert.equal(error.code, "host-token-required");
    return true;
  });
  assert.equal(manager.deleteRoom(created.code, created.hostToken), true);
  assert.equal(manager.getRoom(created.code), null);
});

test("voluntary guest leave is immediate and voluntary host leave closes the room", async t => {
  const manager = new RoomManager();
  t.after(() => manager.close());
  const created = manager.createRoom({ maxPlayers: 4, botCount: 0 });
  const room = manager.getRoom(created.code);
  const host = join(manager, room, "房主", created.hostToken);
  const guest = join(manager, room, "客人");
  const guestId = guest.latest("welcome").playerId;

  guest.clientSend({ type: "leave" });
  assert.equal(room.players.has(guestId), false);
  assert.equal(manager.publicLobby(room).players.length, 1);
  assert.equal(host.latest("lobby").room.players.length, 1);

  host.clientSend({ type: "leave" });
  assert.equal(manager.getRoom(created.code), null);
});

test("the host can update lobby mode and bots while ready state is invalidated", async t => {
  const manager = new RoomManager();
  t.after(() => manager.close());
  const created = manager.createRoom({ mode: "screen", maxPlayers: 4, botCount: 2, seed: 7 });
  const room = manager.getRoom(created.code);
  assert.equal(room.settings.mode, "screen");
  assert.equal(created.room.mode, "screen");
  assert.equal(created.room.configVersion, 1);

  const host = join(manager, room, "房主", created.hostToken);
  const guest = join(manager, room, "客人");
  host.clientSend({ type: "ready", ready: true });
  guest.clientSend({ type: "ready", ready: true });
  assert.ok([...room.players.values()].every(player => player.ready));

  guest.clientSend({ type: "update-settings", mode: "team", botCount: 1 });
  assert.ok(guest.latest("error", "host-only"));
  assert.equal(room.settings.mode, "screen");

  host.clientSend({ type: "update-settings", mode: "demon", botCount: 0 });
  assert.equal(room.settings.mode, "demon");
  assert.equal(room.settings.botCount, 4);
  assert.equal(room.revision, 2);
  assert.ok([...room.players.values()].every(player => !player.ready));
  assert.equal(guest.latest("lobby").room.settings.mode, "demon");
  assert.equal(guest.latest("lobby").room.settings.botCount, 4);
  assert.equal(guest.latest("lobby").room.configVersion, 2);

  host.clientSend({ type: "ready", ready: true });
  guest.clientSend({ type: "ready", ready: true });
  host.clientSend({ type: "start" });
  assert.equal(room.state, ROOM_STATES.RUNNING);
  assert.match(room.matchId, /^match-/);
  assert.match(room.baselineId, /^baseline-/);
  host.clientSend({ type: "update-settings", mode: "solo" });
  assert.ok(host.latest("error", "invalid-room-state"));
  assert.equal(room.settings.mode, "demon");
});

test("snapshots use one shared encoding per food kind and recover slow clients with a full baseline", async t => {
  let currentTime = 1_000;
  const manager = new RoomManager({ now: () => currentTime });
  t.after(() => manager.close());
  const created = manager.createRoom({ maxPlayers: 4, botCount: 0, seed: 11 });
  const room = manager.getRoom(created.code);
  const host = join(manager, room, "host", created.hostToken);
  const guest = join(manager, room, "guest");
  host.clientSend({ type: "ready", ready: true });
  guest.clientSend({ type: "ready", ready: true });
  host.clientSend({ type: "start" });
  clearInterval(room.interval);
  room.interval = null;

  const initial = host.latest("snapshot");
  assert.equal(initial.foodBaseline, true);
  assert.ok(initial.foods.length >= 420);

  const calls = [];
  const originalSnapshot = room.simulation.snapshot.bind(room.simulation);
  room.simulation.snapshot = options => {
    calls.push(options?.foodMode);
    return originalSnapshot(options);
  };

  guest.bufferedAmount = SNAPSHOT_BACKPRESSURE_LIMIT_BYTES + 1;
  room.simulation.step(room.simulation.serverTime + 50);
  manager.broadcastSnapshot(room);
  assert.equal(room.players.get(guest.latest("welcome").playerId).needsFullSnapshot, true);
  assert.equal(manager.stats().snapshotDrops, 1);
  assert.deepEqual(calls, ["delta"]);

  calls.length = 0;
  guest.bufferedAmount = 0;
  room.simulation.step(room.simulation.serverTime + 50);
  manager.broadcastSnapshot(room);
  assert.deepEqual(calls.sort(), ["delta", "full"]);
  assert.equal(room.players.get(guest.latest("welcome").playerId).needsFullSnapshot, false);
  assert.equal(guest.latest("snapshot").foodBaseline, true);
  assert.ok(manager.stats().bytes > 0);
});

test("the fixed-step accumulator emits every retained tick and clamps permanent catch-up debt", async t => {
  let currentTime = 5_000;
  const manager = new RoomManager({ now: () => currentTime });
  t.after(() => manager.close());
  const created = manager.createRoom({ maxPlayers: 2, botCount: 0, seed: 19 });
  const room = manager.getRoom(created.code);
  const host = join(manager, room, "host", created.hostToken);
  const guest = join(manager, room, "guest");
  host.clientSend({ type: "ready", ready: true });
  guest.clientSend({ type: "ready", ready: true });
  host.clientSend({ type: "start" });
  clearInterval(room.interval);
  room.interval = null;

  currentTime += 300;
  assert.equal(manager.runRoomLoop(room, currentTime), MAX_CATCH_UP_STEPS);
  assert.equal(room.simulation.tick, 4);
  assert.equal(manager.stats().tickDrift, 0);
  assert.equal(manager.stats().skippedSimulationMs, 100);
  assert.equal(manager.stats().catchUpClamps, 1);

  currentTime += 50;
  assert.equal(manager.runRoomLoop(room, currentTime), 1);
  assert.equal(room.simulation.tick, 5);
  const ticks = host.messages.filter(message => message.type === "snapshot").map(message => message.tick);
  assert.deepEqual(ticks, [0, 1, 2, 3, 4, 5]);
  assert.equal(manager.stats().tickDrift, 0);
});

test("finished matches return connected players to the same lobby for a rematch", async t => {
  const manager = new RoomManager();
  t.after(() => manager.close());
  const created = manager.createRoom({ maxPlayers: 2, botCount: 0, seed: 23 });
  const room = manager.getRoom(created.code);
  const host = join(manager, room, "host", created.hostToken);
  const guest = join(manager, room, "guest");
  host.clientSend({ type: "ready", ready: true });
  guest.clientSend({ type: "ready", ready: true });
  host.clientSend({ type: "start" });
  clearInterval(room.interval);
  room.interval = null;
  const firstMatchId = room.matchId;

  room.simulation.finishMatch("test-finished", host.latest("welcome").playerId);
  manager.finishRoom(room);
  assert.equal(room.state, ROOM_STATES.FINISHED);
  assert.ok(host.latest("event"));
  assert.equal(manager.returnRoomToLobby(room), true);
  assert.equal(room.state, ROOM_STATES.LOBBY);
  assert.equal(room.simulation, null);
  assert.ok([...room.players.values()].every(player => !player.ready));
  assert.equal(host.readyState, 1);
  assert.equal(guest.readyState, 1);

  host.clientSend({ type: "ready", ready: true });
  guest.clientSend({ type: "ready", ready: true });
  host.clientSend({ type: "start" });
  clearInterval(room.interval);
  room.interval = null;
  assert.equal(room.state, ROOM_STATES.RUNNING);
  assert.notEqual(room.matchId, firstMatchId);
});
