import assert from "node:assert/strict";

const PREFIX = "WAPP";
const CURRENT_VERSION = "1";
const MAX_CODE_LENGTH = 12_000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("state must be a plain object");
  }
  const themes = new Set(["light", "dark", "system"]);
  const allowedPanels = new Set(["tasks", "calendar", "notes", "stats"]);
  const rawPanels = Array.isArray(value.panels) ? value.panels : [];
  const panels = [...new Set(rawPanels)]
    .filter((item) => allowedPanels.has(item))
    .slice(0, 4);
  return {
    theme: themes.has(value.theme) ? value.theme : "system",
    fontScale: clamp(Number.isFinite(Number(value.fontScale)) ? Number(value.fontScale) : 1, 0.8, 1.6),
    panels,
    note: typeof value.note === "string" ? value.note.slice(0, 500) : ""
  };
}

function utf8ToBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlToUtf8(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("payload is not base64url");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function checksum(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function encodeVersion(version, rawState) {
  const payload = utf8ToBase64Url(JSON.stringify(rawState));
  const signedPart = `${version}.${payload}`;
  return `${PREFIX}.${signedPart}.${checksum(signedPart)}`;
}

function encodePortableState(rawState) {
  return encodeVersion(CURRENT_VERSION, normalizeState(rawState));
}

const versionReaders = {
  "0": (legacy) => normalizeState({
    theme: legacy.dark ? "dark" : "light",
    fontScale: legacy.scale,
    panels: legacy.widgets,
    note: legacy.memo
  }),
  "1": normalizeState
};

function decodePortableState(code) {
  if (typeof code !== "string" || code.length === 0 || code.length > MAX_CODE_LENGTH) {
    throw new Error("archive length is invalid");
  }
  const parts = code.trim().split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) throw new Error("archive prefix is invalid");
  const [, version, payload, receivedChecksum] = parts;
  const reader = versionReaders[version];
  if (!reader) throw new Error(`unsupported archive version: ${version}`);
  const signedPart = `${version}.${payload}`;
  if (checksum(signedPart) !== receivedChecksum) throw new Error("archive checksum mismatch");
  const parsed = JSON.parse(base64UrlToUtf8(payload));
  return reader(parsed);
}

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function mutatePayload(code, offset) {
  const parts = code.split(".");
  const index = offset % parts[2].length;
  const original = parts[2][index];
  parts[2] = `${parts[2].slice(0, index)}${original === "A" ? "B" : "A"}${parts[2].slice(index + 1)}`;
  return parts.join(".");
}

const random = makeRandom(0x20260723);
const themes = ["light", "dark", "system"];
const panelPool = ["tasks", "calendar", "notes", "stats"];
let roundTrips = 0;
let corruptionsRejected = 0;

for (let sample = 0; sample < 1000; sample += 1) {
  const state = {
    theme: themes[Math.floor(random() * themes.length)],
    fontScale: 0.8 + random() * 0.8,
    panels: panelPool.filter(() => random() > 0.35),
    note: `第 ${sample} 条：离线、中文与 emoji 🚀 ${"数据".repeat(sample % 7)}`
  };
  const normalized = normalizeState(state);
  const code = encodePortableState(state);
  assert.deepEqual(decodePortableState(code), normalized);
  roundTrips += 1;
  assert.throws(() => decodePortableState(mutatePayload(code, sample)), /checksum/u);
  corruptionsRejected += 1;
}

const legacyCode = encodeVersion("0", {
  dark: true,
  scale: 1.25,
  widgets: ["notes", "tasks", "unknown"],
  memo: "旧版中文数据"
});
assert.deepEqual(decodePortableState(legacyCode), {
  theme: "dark",
  fontScale: 1.25,
  panels: ["notes", "tasks"],
  note: "旧版中文数据"
});

const sanitized = decodePortableState(encodeVersion("1", {
  theme: "hacked",
  fontScale: 99,
  panels: ["tasks", "tasks", "admin", "calendar", "notes", "stats", "extra"],
  note: "x".repeat(900),
  token: "must-not-survive"
}));
assert.equal(sanitized.theme, "system");
assert.equal(sanitized.fontScale, 1.6);
assert.deepEqual(sanitized.panels, ["tasks", "calendar", "notes", "stats"]);
assert.equal(sanitized.note.length, 500);
assert.equal("token" in sanitized, false);

const exampleState = {
  theme: "dark",
  fontScale: 1.1,
  panels: ["tasks", "calendar", "notes"],
  note: "周五前整理离线资料 🚀"
};
const exampleCode = encodePortableState(exampleState);
const exampleJsonBytes = new TextEncoder().encode(JSON.stringify(normalizeState(exampleState))).length;

const result = {
  protocol: `${PREFIX}.${CURRENT_VERSION}.<base64url>.<checksum>`,
  seed: "0x20260723",
  roundTrips,
  corruptionsRejected,
  legacyMigrations: 1,
  sanitizationAssertions: 5,
  example: {
    jsonBytes: exampleJsonBytes,
    archiveCharacters: exampleCode.length,
    code: exampleCode
  },
  limitations: [
    "FNV-1a detects accidental corruption; it does not provide authenticity.",
    "Base64url is an encoding, not encryption.",
    "The example has no conflict resolution or multi-user synchronization."
  ]
};

console.log(JSON.stringify(result, null, 2));

export {
  normalizeState,
  encodePortableState,
  decodePortableState,
  checksum
};
