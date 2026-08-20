import dgram from "node:dgram";
import { networkInterfaces } from "node:os";
import { randomUUID } from "node:crypto";
import { DISCOVERY_MAGIC, DISCOVERY_VERSION, PROTOCOL_VERSION } from "./protocol.mjs";

const DEFAULT_PORT = 25556;
const DEFAULT_INTERVAL_MS = 1500;
const DEFAULT_TTL_MS = 5000;
const DEFAULT_PROBE_WAIT_MS = 450;
const QUERY_RESPONSE_THROTTLE_MS = 200;
const MAX_PACKET_BYTES = 8192;
const MAX_ENDPOINTS = 3;

function ipv4Parts(address) {
  const parts = String(address || "").split(".");
  if (parts.length !== 4) return null;
  const values = parts.map(part => Number.parseInt(part, 10));
  if (values.some((part, index) => !Number.isInteger(part) || part < 0 || part > 255 || String(part) !== String(Number(parts[index])))) return null;
  return values;
}

function ipv4Integer(address) {
  const parts = ipv4Parts(address);
  if (!parts) return null;
  return (((parts[0] << 24) >>> 0) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function isUsableLanAddress(address) {
  const parts = ipv4Parts(address);
  if (!parts) return false;
  if (parts[0] === 0 || parts[0] === 127 || parts[0] >= 224) return false;
  if (parts[0] === 169 && parts[1] === 254) return false;
  if (parts.every(part => part === 255)) return false;
  return true;
}

function isPrivateAddress(address) {
  const parts = ipv4Parts(address);
  if (!parts) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

function prefixLength(netmask) {
  const value = ipv4Integer(netmask);
  if (value === null) return 0;
  let bits = 0;
  for (let index = 31; index >= 0 && (value & (1 << index)) !== 0; index -= 1) bits += 1;
  return bits;
}

function sameSubnet(left, right, netmask) {
  const leftValue = ipv4Integer(left);
  const rightValue = ipv4Integer(right);
  const maskValue = ipv4Integer(netmask);
  return leftValue !== null && rightValue !== null && maskValue !== null && (leftValue & maskValue) === (rightValue & maskValue);
}

export function localAddressRecords(interfaces = networkInterfaces()) {
  const records = [];
  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    for (const record of entries || []) {
      if (!["IPv4", 4].includes(record.family) || record.internal || !record.netmask || !isUsableLanAddress(record.address)) continue;
      records.push({ interfaceName, address: record.address, netmask: record.netmask });
    }
  }
  return records;
}

export function localIPv4Addresses(interfaces = networkInterfaces()) {
  return [...new Set(localAddressRecords(interfaces).map(record => record.address))];
}

function directedBroadcastAddress(address, netmask) {
  const addressParts = ipv4Parts(address);
  const maskParts = ipv4Parts(netmask);
  if (!addressParts || !maskParts) return null;
  return addressParts.map((part, index) => (part & maskParts[index]) | (~maskParts[index] & 255)).join(".");
}

export function localBroadcastAddresses(interfaces = networkInterfaces()) {
  const addresses = new Set(["255.255.255.255"]);
  for (const record of localAddressRecords(interfaces)) {
    const broadcast = directedBroadcastAddress(record.address, record.netmask);
    if (broadcast) addresses.add(broadcast);
  }
  return [...addresses];
}

export function rankLanAddresses(addresses, { interfaces = networkInterfaces(), preferredAddress = "", maximum = MAX_ENDPOINTS } = {}) {
  const locals = localAddressRecords(interfaces);
  const unique = [...new Set((addresses || []).map(String).filter(isUsableLanAddress))];
  return unique
    .map(address => {
      let score = isPrivateAddress(address) ? 1000 : 100;
      for (const local of locals) {
        if (sameSubnet(address, local.address, local.netmask)) score = Math.max(score, 10_000 + prefixLength(local.netmask));
      }
      if (address === preferredAddress) score += 5000;
      return { address, score };
    })
    .sort((left, right) => right.score - left.score || left.address.localeCompare(right.address))
    .slice(0, Math.max(1, maximum))
    .map(entry => entry.address);
}

export function parseDiscoveryPacket(buffer, remoteAddress, now = Date.now()) {
  if (!buffer || buffer.length > MAX_PACKET_BYTES) return null;
  let value;
  try {
    value = JSON.parse(buffer.toString("utf8"));
  } catch {
    return null;
  }
  if (value?.magic !== DISCOVERY_MAGIC || value.version !== DISCOVERY_VERSION || value.protocol !== PROTOCOL_VERSION) return null;
  const instanceId = String(value.instanceId || "").slice(0, 64);
  if (!instanceId) return null;
  const kind = value.kind === "query" ? "query" : "announce";
  if (kind === "query") return { kind, instanceId, remoteAddress, seenAt: now };

  const port = Number.parseInt(value.port, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (!Array.isArray(value.rooms) || value.rooms.length > 32) return null;
  const declaredAddresses = Array.isArray(value.addresses) ? value.addresses.slice(0, 8) : [];
  const addresses = rankLanAddresses([remoteAddress, ...declaredAddresses], { preferredAddress: remoteAddress });
  const rooms = value.rooms
    .map(room => ({
      code: String(room.code || "").toUpperCase().slice(0, 6),
      name: String(room.name || "局域网房间").slice(0, 28),
      state: String(room.state || "lobby").slice(0, 16),
      players: Math.max(0, Number.parseInt(room.players, 10) || 0),
      maxPlayers: Math.max(1, Number.parseInt(room.maxPlayers, 10) || 8),
      botCount: Math.max(0, Number.parseInt(room.botCount, 10) || 0),
      mode: String(room.mode || "solo").slice(0, 16)
    }))
    .filter(room => /^[A-Z0-9]{6}$/.test(room.code));
  return { kind, instanceId, remoteAddress, port, addresses, rooms, seenAt: now };
}

export class LanDiscovery {
  constructor({
    port = DEFAULT_PORT,
    intervalMs = DEFAULT_INTERVAL_MS,
    ttlMs = DEFAULT_TTL_MS,
    roomProvider = () => [],
    servicePortProvider = () => 0,
    enabled = true,
    logger = console,
    interfacesProvider = networkInterfaces
  } = {}) {
    this.port = port;
    this.intervalMs = intervalMs;
    this.ttlMs = ttlMs;
    this.roomProvider = roomProvider;
    this.servicePortProvider = servicePortProvider;
    this.enabled = enabled;
    this.logger = logger;
    this.interfacesProvider = interfacesProvider;
    this.instanceId = randomUUID();
    this.socket = null;
    this.timer = null;
    this.discovered = new Map();
    this.lastError = null;
    this.started = false;
    this.lastPacketAt = 0;
    this.lastAnnouncementAt = 0;
    this.lastQueryResponseAt = 0;
  }

  async start() {
    if (!this.enabled || this.started) return;
    this.started = true;
    this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    this.socket.on("message", (buffer, remote) => this.handlePacket(buffer, remote));
    this.socket.on("error", error => {
      this.lastError = error.message;
      this.logger.warn?.(`LAN discovery warning: ${error.message}`);
    });
    try {
      await new Promise((resolve, reject) => {
        const onListening = () => {
          this.socket?.off("error", onBindError);
          resolve();
        };
        const onBindError = error => {
          this.socket?.off("listening", onListening);
          reject(error);
        };
        this.socket.once("listening", onListening);
        this.socket.once("error", onBindError);
        this.socket.bind(this.port, "0.0.0.0");
      });
    } catch (error) {
      const failedSocket = this.socket;
      this.socket = null;
      this.started = false;
      try { failedSocket?.close(); } catch {}
      throw error;
    }
    try {
      this.socket.setBroadcast(true);
    } catch (error) {
      this.lastError = error.message;
    }
    this.timer = setInterval(() => this.broadcast(), this.intervalMs);
    this.timer.unref?.();
    this.broadcast();
  }

  handlePacket(buffer, remote) {
    const packet = parseDiscoveryPacket(buffer, remote.address);
    if (!packet || packet.instanceId === this.instanceId) return;
    this.lastPacketAt = packet.seenAt;
    if (packet.kind === "query") {
      const now = Date.now();
      if (now - this.lastQueryResponseAt >= QUERY_RESPONSE_THROTTLE_MS) {
        this.lastQueryResponseAt = now;
        this.broadcast();
      }
      return;
    }

    const sourceKey = `${packet.instanceId}:${packet.port}`;
    const advertisedCodes = new Set(packet.rooms.map(room => room.code));
    for (const [key, room] of this.discovered) {
      if (room.sourceKey === sourceKey && !advertisedCodes.has(room.code)) this.discovered.delete(key);
    }
    for (const room of packet.rooms) {
      if (!packet.addresses.length) continue;
      const endpoints = packet.addresses.map(address => `ws://${address}:${packet.port}/ws?room=${room.code}`);
      this.discovered.set(`${sourceKey}:${room.code}`, {
        ...room,
        instanceId: packet.instanceId,
        sourceKey,
        endpoint: endpoints[0],
        endpoints,
        address: packet.addresses[0],
        addresses: packet.addresses,
        port: packet.port,
        seenAt: packet.seenAt,
        source: "lan"
      });
    }
    this.prune();
  }

  packet(kind = "announce") {
    const base = {
      magic: DISCOVERY_MAGIC,
      version: DISCOVERY_VERSION,
      protocol: PROTOCOL_VERSION,
      kind,
      instanceId: this.instanceId
    };
    if (kind === "query") return Buffer.from(JSON.stringify(base));
    return Buffer.from(JSON.stringify({
      ...base,
      port: this.servicePortProvider(),
      addresses: localIPv4Addresses(this.interfacesProvider()),
      rooms: this.roomProvider()
    }));
  }

  sendPacket(packet) {
    if (!this.socket) return;
    for (const address of localBroadcastAddresses(this.interfacesProvider())) {
      this.socket.send(packet, this.port, address, error => {
        if (error) this.lastError = error.message;
      });
    }
  }

  broadcast() {
    if (!this.socket || !this.servicePortProvider()) return;
    const packet = this.packet("announce");
    if (packet.length > MAX_PACKET_BYTES) return;
    this.lastAnnouncementAt = Date.now();
    this.sendPacket(packet);
  }

  async probe(waitMs = DEFAULT_PROBE_WAIT_MS) {
    if (!this.socket) return this.list();
    this.sendPacket(this.packet("query"));
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, Math.min(2000, Math.max(0, waitMs))));
    return this.list();
  }

  prune(now = Date.now()) {
    for (const [key, room] of this.discovered) {
      if (now - room.seenAt > this.ttlMs) this.discovered.delete(key);
    }
  }

  list(now = Date.now()) {
    this.prune(now);
    return [...this.discovered.values()]
      .map(({ sourceKey: _sourceKey, ...room }) => room)
      .sort((left, right) => right.seenAt - left.seenAt || left.code.localeCompare(right.code));
  }

  status() {
    return {
      enabled: this.enabled,
      listening: Boolean(this.socket),
      port: this.port,
      instanceId: this.instanceId,
      addresses: localIPv4Addresses(this.interfacesProvider()),
      servicePort: this.servicePortProvider(),
      discoveredRooms: this.list().length,
      lastPacketAt: this.lastPacketAt,
      lastAnnouncementAt: this.lastAnnouncementAt,
      lastError: this.lastError
    };
  }

  async close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
    this.discovered.clear();
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    await new Promise(resolve => {
      try {
        socket.close(resolve);
      } catch {
        resolve();
      }
    });
  }
}
