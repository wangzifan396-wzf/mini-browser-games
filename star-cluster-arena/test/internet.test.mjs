import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import WebSocket from "ws";
import { startServer } from "../backend/server.mjs";
import { originAllowed, normalizePublicUrl } from "../backend/network-policy.mjs";
import "../frontend/js/connection-profile.js";

const profile = globalThis.ScaConnectionProfile;
test("invites round-trip service and room without accepting unsafe URLs", () => {
  const link = profile.inviteLink("https://game.example", "ABCD23");
  assert.deepEqual(profile.parseInvite(link), { origin: "https://game.example", code: "ABCD23" });
  assert.deepEqual(profile.parseInvite("abcd23"), { origin: "", code: "ABCD23" });
  for (const address of ["javascript:alert(1)", "https://name:password@game.example", "https://game.example/private", "http://0.0.0.0"]) assert.throws(() => profile.serverOrigin(address));
});
test("internet origins allow desktop clients and reject unrelated websites", () => {
  assert.equal(originAllowed("http://127.0.0.1:25555", { publicUrl: "https://game.example" }), true);
  assert.equal(originAllowed("https://game.example", { publicUrl: "https://game.example" }), true);
  assert.equal(originAllowed("https://attacker.example", { publicUrl: "https://game.example" }), false);
  assert.throws(() => normalizePublicUrl("https://game.example/path"));
});
test("request host cannot authorize an unrelated or malformed origin", () => {
  assert.equal(originAllowed("http://attacker.example", { requestOrigin: "http://attacker.example" }), false);
  for (const origin of ["null", "https://user:password@localhost", "http://localhost/path", "http://localhost?query=1", "http://localhost#fragment"]) {
    assert.equal(originAllowed(origin), false, origin);
  }
  assert.equal(originAllowed("http://192.168.1.7:25555"), true);
  assert.equal(originAllowed("http://trusted-machine:25555", { allowedOrigins: ["http://trusted-machine:25555"] }), true);
});
test("forged matching Host and Origin are refused by both HTTP and WebSocket", async () => {
  const server = await startServer({ host: "127.0.0.1", port: 0, discoveryEnabled: false, logger: { warn() {}, error() {} } });
  let socket;
  try {
    const status = await new Promise((resolve, reject) => {
      const request = httpRequest(`${server.url}/api/rooms`, { method: "POST", headers: { Host: "attacker.example", Origin: "http://attacker.example", "Content-Type": "application/json" } }, response => {
        response.resume(); resolve(response.statusCode);
      });
      request.on("error", reject); request.end("{}");
    });
    assert.equal(status, 403);
    assert.equal((await (await fetch(`${server.url}/api/rooms`)).json()).rooms.length, 0);
    const room = await (await fetch(`${server.url}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
    const upgradeStatus = await new Promise((resolve, reject) => {
      socket = new WebSocket(`${server.url.replace(/^http/, "ws")}/ws?room=${room.code}`, { origin: "http://attacker.example", headers: { Host: "attacker.example" } });
      const timeout = setTimeout(() => { socket.terminate(); reject(new Error("forged origin rejection timed out")); }, 5000);
      socket.once("open", () => { clearTimeout(timeout); reject(new Error("forged origin connected")); });
      socket.on("error", () => {});
      socket.once("unexpected-response", (_request, response) => {
        clearTimeout(timeout); response.resume(); socket.terminate(); resolve(response.statusCode);
      });
    });
    assert.equal(upgradeStatus, 403);
  } finally { socket?.terminate(); await server.close(); }
});
test("public server advertises WSS, supports desktop CORS and bounded rooms", async () => {
  const server = await startServer({ host: "127.0.0.1", port: 0, publicUrl: "https://game.example", discoveryEnabled: false, maxRooms: 1, logger: { warn() {}, error() {} } });
  try {
    const origin = "http://127.0.0.1:25555";
    const preflight = await fetch(`${server.url}/api/rooms`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    const response = await fetch(`${server.url}/api/rooms`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ name: "测试", mode: "blitz" }) });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.endpoint, `wss://game.example/ws?room=${created.code}`);
    const lookup = await (await fetch(`${server.url}/api/rooms/${created.code}`)).json();
    assert.equal(lookup.endpoint, created.endpoint);
    assert.equal((await (await fetch(`${server.url}/api/rooms`)).json()).rooms.length, 1);
    assert.equal((await fetch(`${server.url}/api/rooms`, { method: "POST", body: "{}" })).status, 503);
    assert.equal((await fetch(`${server.url}/api/rooms`, { headers: { Origin: "https://attacker.example" } })).status, 403);
    const runtime = await (await fetch(`${server.url}/api/runtime`)).json();
    assert.equal(runtime.multiplayer.simulationHz, 60);
    assert.equal(runtime.multiplayer.snapshotHz, 20);
  } finally { await server.close(); }
});
