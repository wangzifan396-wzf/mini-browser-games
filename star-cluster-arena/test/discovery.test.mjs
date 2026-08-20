import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import dgram from "node:dgram";
import { LanDiscovery, localBroadcastAddresses, parseDiscoveryPacket, rankLanAddresses } from "../backend/multiplayer/lan-discovery.mjs";
import { DISCOVERY_MAGIC, DISCOVERY_VERSION, PROTOCOL_VERSION } from "../backend/multiplayer/protocol.mjs";

test("valid discovery packets use the UDP source as the endpoint", () => {
  const packet = Buffer.from(JSON.stringify({
    magic: DISCOVERY_MAGIC,
    version: DISCOVERY_VERSION,
    protocol: PROTOCOL_VERSION,
    instanceId: "test-instance",
    port: 30123,
    rooms: [{ code: "ABC234", name: "测试房", state: "lobby", players: 2, maxPlayers: 8, botCount: 4, mode: "solo" }]
  }));
  const parsed = parseDiscoveryPacket(packet, "192.168.50.23", 1000);
  assert.equal(parsed.remoteAddress, "192.168.50.23");
  assert.equal(parsed.port, 30123);
  assert.equal(parsed.rooms[0].code, "ABC234");
});

test("malformed and incompatible discovery packets are ignored", () => {
  assert.equal(parseDiscoveryPacket(Buffer.from("not-json"), "10.0.0.2"), null);
  assert.equal(parseDiscoveryPacket(Buffer.from(JSON.stringify({ magic: DISCOVERY_MAGIC, version: 99 })), "10.0.0.2"), null);
});

test("directed broadcast addresses are derived from interface netmasks", () => {
  const addresses = localBroadcastAddresses({
    Ethernet: [{ family: "IPv4", internal: false, address: "192.168.5.27", netmask: "255.255.255.0" }]
  });
  assert.ok(addresses.includes("255.255.255.255"));
  assert.ok(addresses.includes("192.168.5.255"));
});

test("same-subnet addresses rank ahead of unrelated and link-local addresses", () => {
  const interfaces = {
    WLAN: [{ family: "IPv4", internal: false, address: "192.168.5.27", netmask: "255.255.255.0" }]
  };
  const ranked = rankLanAddresses(["10.20.30.40", "169.254.1.2", "192.168.5.44"], { interfaces });
  assert.deepEqual(ranked, ["192.168.5.44", "10.20.30.40"]);
});

test("query packets are recognized without requiring a room list", () => {
  const parsed = parseDiscoveryPacket(Buffer.from(JSON.stringify({
    magic: DISCOVERY_MAGIC,
    version: DISCOVERY_VERSION,
    protocol: PROTOCOL_VERSION,
    kind: "query",
    instanceId: "query-instance"
  })), "192.168.5.8", 2000);
  assert.equal(parsed.kind, "query");
  assert.equal(parsed.instanceId, "query-instance");
});

test("an empty announcement immediately removes stale rooms from the same instance", () => {
  const interfaces = () => ({
    WLAN: [{ family: "IPv4", internal: false, address: "192.168.5.27", netmask: "255.255.255.0" }]
  });
  const discovery = new LanDiscovery({ interfacesProvider: interfaces });
  const packet = rooms => Buffer.from(JSON.stringify({
    magic: DISCOVERY_MAGIC,
    version: DISCOVERY_VERSION,
    protocol: PROTOCOL_VERSION,
    kind: "announce",
    instanceId: "remote-instance",
    port: 25555,
    addresses: ["192.168.5.44"],
    rooms
  }));
  discovery.handlePacket(packet([{ code: "ABC234", name: "测试房", state: "lobby" }]), { address: "192.168.5.44" });
  assert.equal(discovery.list().length, 1);
  assert.equal(discovery.list()[0].endpoints[0], "ws://192.168.5.44:25555/ws?room=ABC234");
  discovery.handlePacket(packet([]), { address: "192.168.5.44" });
  assert.equal(discovery.list().length, 0);
});

test("a discovery bind failure rejects promptly and leaves no live socket", async () => {
  const blocker = dgram.createSocket("udp4");
  blocker.bind({ port: 0, address: "0.0.0.0", exclusive: true });
  await once(blocker, "listening");
  const discovery = new LanDiscovery({ port: blocker.address().port, logger: { warn() {} } });
  try {
    await assert.rejects(discovery.start(), error => ["EADDRINUSE", "EACCES"].includes(error.code));
    assert.equal(discovery.status().listening, false);
    await discovery.close();
  } finally {
    blocker.close();
    await once(blocker, "close");
  }
});
