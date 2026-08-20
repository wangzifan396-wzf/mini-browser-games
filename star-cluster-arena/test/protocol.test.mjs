import test from "node:test";
import assert from "node:assert/strict";
import {
  PROTOCOL_VERSION,
  ProtocolError,
  createRoomCode,
  normalizeRoomCode,
  parseClientMessage,
  sanitizeName
} from "../backend/multiplayer/protocol.mjs";

test("room codes avoid ambiguous characters and normalize input", () => {
  for (let index = 0; index < 100; index += 1) {
    const code = createRoomCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  }
  assert.equal(normalizeRoomCode(" ab-c12! "), "ABC12");
});

test("player names are printable, compact and bounded", () => {
  assert.equal(sanitizeName("  星\u0000  团   玩家  "), "星 团 玩家");
  assert.equal(sanitizeName(""), "星友");
  assert.equal(sanitizeName("一".repeat(30)).length, 16);
});

test("client input is finite, normalized and typed", () => {
  const message = parseClientMessage(JSON.stringify({
    type: "input",
    seq: 7,
    dx: 2,
    dy: 2,
    split: 1,
    eject: 0,
    quickMerge: 1,
    special: true
  }));
  assert.equal(message.type, "input");
  assert.equal(message.seq, 7);
  assert.ok(Math.abs(Math.hypot(message.dx, message.dy) - 1) < 1e-9);
  assert.equal(message.split, true);
  assert.equal(message.eject, false);
  assert.equal(message.quickMerge, true);
  assert.equal(message.special, true);
});

test("host settings messages normalize supported room options", () => {
  assert.deepEqual(parseClientMessage(JSON.stringify({
    type: "update-settings",
    mode: " SCREEN ",
    botCount: 99
  })), {
    type: "update-settings",
    mode: "screen",
    botCount: 12
  });
  assert.deepEqual(parseClientMessage(JSON.stringify({ type: "update-settings", botCount: -2 })), {
    type: "update-settings",
    botCount: 0
  });
  assert.throws(
    () => parseClientMessage(JSON.stringify({ type: "update-settings", mode: "unknown" })),
    error => error.code === "invalid-mode"
  );
  assert.throws(
    () => parseClientMessage(JSON.stringify({ type: "update-settings" })),
    error => error.code === "invalid-settings"
  );
});

test("join messages preserve only bounded protocol fields", () => {
  const message = parseClientMessage(JSON.stringify({
    type: "join",
    protocol: PROTOCOL_VERSION,
    name: " 测试玩家 ",
    hostToken: "x".repeat(300),
    resumeToken: "y".repeat(300)
  }));
  assert.equal(message.name, "测试玩家");
  assert.equal(message.hostToken.length, 128);
  assert.equal(message.resumeToken.length, 128);
});

test("invalid JSON and unknown message types are rejected", () => {
  assert.throws(() => parseClientMessage("{"), ProtocolError);
  assert.throws(() => parseClientMessage(JSON.stringify({ type: "teleport" })), error => error.code === "unknown-message");
});

test("leave is a bounded first-class client message", () => {
  assert.deepEqual(parseClientMessage(JSON.stringify({ type: "leave", ignored: "value" })), { type: "leave" });
});

test("resync requests carry only bounded world revisions", () => {
  assert.deepEqual(parseClientMessage(JSON.stringify({
    type: "resync-request",
    foodRevision: 17,
    virusRevision: 4,
    ignored: "value"
  })), { type: "resync-request", foodRevision: 17, virusRevision: 4 });
});

test("ready and start messages are pinned to a room configuration version", () => {
  assert.deepEqual(parseClientMessage(JSON.stringify({
    type: "ready",
    ready: true,
    configVersion: 7
  })), { type: "ready", ready: true, configVersion: 7 });
  assert.deepEqual(parseClientMessage(JSON.stringify({
    type: "start",
    configVersion: 7
  })), { type: "start", configVersion: 7 });
});
