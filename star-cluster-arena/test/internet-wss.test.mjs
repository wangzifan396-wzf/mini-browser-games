import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer as httpsServer, request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { once } from "node:events";
import WebSocket from "ws";
import { startServer } from "../backend/server.mjs";
import { PROTOCOL_VERSION } from "../backend/multiplayer/protocol.mjs";
import "../frontend/js/snapshot-wire.js";

class Peer {
  constructor(url, cert) {
    this.socket = new WebSocket(url, { ca: cert, origin: "http://127.0.0.1:25555" });
    this.queue = []; this.waiters = [];
    this.socket.on("message", raw => {
      const parsed = JSON.parse(String(raw));
      const value = parsed.type === "snapshot" ? globalThis.ScaSnapshotWire.decodeSnapshot(parsed) : parsed;
      const index = this.waiters.findIndex(item => item.type === value.type);
      if (index < 0) this.queue.push(value);
      else { const [item] = this.waiters.splice(index, 1); clearTimeout(item.timer); item.resolve(value); }
    });
  }
  send(value) { this.socket.send(JSON.stringify(value)); }
  next(type) {
    const index = this.queue.findIndex(item => item.type === type);
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const item = { type, resolve, timer: setTimeout(() => reject(new Error(`No WSS ${type}`)), 5000) };
      this.waiters.push(item);
    });
  }
}

test("two clients play the canonical battle through trusted TLS and a real reverse proxy", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/localhost-tls.json", import.meta.url), "utf8"));
  let backend = null;
  const sockets = new Set();
  const proxy = httpsServer({ key: fixture.key, cert: fixture.cert }, (request, response) => {
    const upstream = httpRequest(new URL(request.url, backend.url), { method: request.method, headers: request.headers }, result => {
      response.writeHead(result.statusCode, result.headers); result.pipe(response);
    });
    upstream.on("error", () => { response.writeHead(502); response.end(); });
    request.pipe(upstream);
  });
  proxy.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  proxy.on("upgrade", (request, socket, head) => {
    const upstream = connect(backend.port, "127.0.0.1", () => {
      upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${request.rawHeaders.reduce((s, value, i) => s + value + (i % 2 ? "\r\n" : ": "), "")}\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream); upstream.pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("close", () => upstream.destroy());
  });
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const publicUrl = `https://127.0.0.1:${proxy.address().port}`;
  const peers = [];
  try {
    backend = await startServer({ port: 0, host: "127.0.0.1", publicUrl, discoveryEnabled: false, logger: {} });
    const created = await new Promise((resolve, reject) => {
      const request = httpsRequest(`${publicUrl}/api/rooms`, { method: "POST", ca: fixture.cert, headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:25555" } }, response => {
        let body = ""; response.on("data", chunk => { body += chunk; });
        response.on("end", () => { assert.equal(response.statusCode, 201); resolve(JSON.parse(body)); });
      });
      request.on("error", reject); request.end(JSON.stringify({ name: "房主", mode: "battle", private: true }));
    });
    assert.ok(created.endpoint.startsWith(`${publicUrl.replace("https:", "wss:")}/ws?room=`));
    const host = new Peer(created.endpoint, fixture.cert), guest = new Peer(created.endpoint, fixture.cert);
    peers.push(host, guest);
    await Promise.all(peers.map(peer => once(peer.socket, "open")));
    host.send({ type: "join", protocol: PROTOCOL_VERSION, hostToken: created.hostToken, name: "房主" });
    guest.send({ type: "join", protocol: PROTOCOL_VERSION, name: "客人", cosmetics: { skin: "dragon" } });
    const [hostWelcome, guestWelcome] = await Promise.all(peers.map(peer => peer.next("welcome")));
    assert.notEqual(hostWelcome.playerId, guestWelcome.playerId);
    for (const peer of peers) peer.send({ type: "ready", ready: true, configVersion: hostWelcome.room.configVersion });
    await new Promise(resolve => setTimeout(resolve, 30));
    host.send({ type: "start", configVersion: hostWelcome.room.configVersion });
    await Promise.all(peers.map(peer => peer.next("match-start")));
    const snapshots = await Promise.all(peers.map(peer => peer.next("snapshot")));
    for (const snapshot of snapshots) {
      assert.equal(snapshot.groups.length, 100);
      assert.equal(snapshot.serverHz, 60);
      assert.equal(snapshot.groups.find(group => group.id === guestWelcome.playerId).cosmetics.skin, "dragon");
      assert.ok(snapshot.foods.length > 2000);
    }
    assert.equal((await (await fetch(`${backend.url}/api/rooms`)).json()).rooms.length, 0, "private rooms must not leak into public listings");
  } finally {
    for (const peer of peers) peer.socket.terminate();
    await backend?.close();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => proxy.close(resolve));
  }
});
