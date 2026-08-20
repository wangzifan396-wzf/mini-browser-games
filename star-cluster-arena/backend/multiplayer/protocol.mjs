import { randomBytes } from "node:crypto";
import { MODE_KEYS, normalizeMode } from "./modes.mjs";

export const PROTOCOL_VERSION = "sca-lan-v2";
export const DISCOVERY_MAGIC = "SCA-LAN";
export const DISCOVERY_VERSION = 1;
export const MAX_CLIENT_MESSAGE_BYTES = 64 * 1024;
export const MAX_HUMAN_PLAYERS = 8;
export const MAX_BOTS = 12;

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

export class ProtocolError extends Error {
  constructor(code, message, closeCode = 1008) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
    this.closeCode = closeCode;
  }
}

export function secureToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export function createRoomCode(randomSource = randomBytes) {
  const source = randomSource(6);
  let result = "";
  for (let index = 0; index < 6; index += 1) {
    result += ROOM_ALPHABET[source[index] % ROOM_ALPHABET.length];
  }
  return result;
}

export function normalizeRoomCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function sanitizeName(value, fallback = "星友") {
  const cleaned = String(value || "")
    .replace(CONTROL_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
  return cleaned || fallback;
}

export function integerInRange(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function finiteDirection(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-1, Math.min(1, number));
}

export function parseClientMessage(raw) {
  const text = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");
  if (Buffer.byteLength(text) > MAX_CLIENT_MESSAGE_BYTES) {
    throw new ProtocolError("message-too-large", "消息过大", 1009);
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProtocolError("invalid-json", "消息不是有效 JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProtocolError("invalid-message", "消息结构无效");
  }

  switch (value.type) {
    case "join":
      return {
        type: "join",
        protocol: String(value.protocol || ""),
        name: sanitizeName(value.name),
        hostToken: typeof value.hostToken === "string" ? value.hostToken.slice(0, 128) : "",
        resumeToken: typeof value.resumeToken === "string" ? value.resumeToken.slice(0, 128) : ""
      };
    case "ready":
      return {
        type: "ready",
        ready: Boolean(value.ready),
        configVersion: integerInRange(value.configVersion, 0, Number.MAX_SAFE_INTEGER, 0)
      };
    case "start":
      return {
        type: "start",
        configVersion: integerInRange(value.configVersion, 0, Number.MAX_SAFE_INTEGER, 0)
      };
    case "leave":
      return { type: "leave" };
    case "resync-request":
      return {
        type: "resync-request",
        foodRevision: integerInRange(value.foodRevision, 0, Number.MAX_SAFE_INTEGER, 0),
        virusRevision: integerInRange(value.virusRevision, 0, Number.MAX_SAFE_INTEGER, 0)
      };
    case "update-settings": {
      const message = { type: "update-settings" };
      if (Object.hasOwn(value, "mode")) {
        const candidate = String(value.mode ?? "").trim().toLowerCase();
        if (!MODE_KEYS.includes(candidate)) throw new ProtocolError("invalid-mode", "不支持这个游戏模式");
        message.mode = normalizeMode(candidate);
      }
      if (Object.hasOwn(value, "botCount")) {
        message.botCount = integerInRange(value.botCount, 0, MAX_BOTS, 6);
      }
      if (!Object.hasOwn(message, "mode") && !Object.hasOwn(message, "botCount")) {
        throw new ProtocolError("invalid-settings", "没有可更新的房间设置");
      }
      return message;
    }
    case "input": {
      const dx = finiteDirection(value.dx);
      const dy = finiteDirection(value.dy);
      const length = Math.hypot(dx, dy);
      return {
        type: "input",
        seq: integerInRange(value.seq, 0, Number.MAX_SAFE_INTEGER, 0),
        dx: length > 1 ? dx / length : dx,
        dy: length > 1 ? dy / length : dy,
        split: Boolean(value.split),
        eject: Boolean(value.eject),
        quickMerge: Boolean(value.quickMerge),
        special: Boolean(value.special)
      };
    }
    case "ping":
      return {
        type: "ping",
        clientTime: Number.isFinite(Number(value.clientTime)) ? Number(value.clientTime) : 0
      };
    default:
      throw new ProtocolError("unknown-message", "未知消息类型");
  }
}

export function encodeMessage(type, payload = {}) {
  return JSON.stringify({ type, ...payload });
}

export function publicRoomSummary(room, endpoint = "") {
  const players = [...room.players.values()];
  return {
    code: room.code,
    name: room.name,
    state: room.state.toLowerCase(),
    players: players.filter(player => player.connected).length,
    maxPlayers: room.settings.maxPlayers,
    botCount: room.settings.botCount,
    mode: room.settings.mode,
    configVersion: room.revision || 1,
    endpoint,
    protocol: PROTOCOL_VERSION,
    createdAt: room.createdAt
  };
}
