import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import dgram from "node:dgram";
import { networkInterfaces } from "node:os";
import { startServer } from "../backend/server.mjs";

async function availableUdpPort() {
  const socket = dgram.createSocket("udp4");
  socket.bind(0, "0.0.0.0");
  await once(socket, "listening");
  const port = socket.address().port;
  socket.close();
  await once(socket, "close");
  return port;
}

test("two instances actively discover and remove each other's rooms", { timeout: 7000 }, async t => {
  const hasLanAddress = Object.values(networkInterfaces()).flat().some(record => record?.family === "IPv4" && !record.internal && !record.address.startsWith("169.254."));
  if (!hasLanAddress) return t.skip("当前系统没有可广播的局域网 IPv4 地址");
  const discoveryPort = await availableUdpPort();
  const serverA = await startServer({ host: "0.0.0.0", port: 0, discoveryPort });
  const serverB = await startServer({ host: "0.0.0.0", port: 0, discoveryPort });
  t.after(() => Promise.allSettled([serverA.close(), serverB.close()]));
  assert.equal(serverA.discovery.status().listening, true);
  assert.equal(serverB.discovery.status().listening, true);

  const roomA = serverA.roomManager.createRoom({ name: "A房主", roomName: "A房间" });
  await serverB.discovery.probe(650);
  assert.ok(serverB.discovery.list().some(room => room.code === roomA.code));
  serverA.roomManager.deleteRoom(roomA.code, roomA.hostToken);
  await serverB.discovery.probe(650);
  assert.equal(serverB.discovery.list().some(room => room.code === roomA.code), false);

  const roomB = serverB.roomManager.createRoom({ name: "B房主", roomName: "B房间" });
  await serverA.discovery.probe(650);
  assert.ok(serverA.discovery.list().some(room => room.code === roomB.code));
  await Promise.all([serverA.close(), serverB.close()]);
});
