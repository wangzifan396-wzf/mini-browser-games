import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const PROFILE_KEYS = Object.freeze([
  "ballArenaMeta", "ballArenaSkin", "ballArenaSpore", "ballArenaHalo", "ballArenaTrail", "ballArenaMusic",
  "starClusterGameSettingsV1", "starClusterPlayerName", "starClusterConnectionV1", "starClusterHelpSeenV1"
]);
const allowed = new Set(PROFILE_KEYS);
const MAX_BYTES = 128 * 1024;

function validate(value) {
  if (value?.schema !== 1 || !value.values || typeof value.values !== "object" || Array.isArray(value.values)) throw new Error("invalid-profile");
  const values = {};
  for (const key of PROFILE_KEYS) {
    if (typeof value.values[key] === "string" && Buffer.byteLength(value.values[key]) <= 64 * 1024) values[key] = value.values[key];
  }
  return values;
}

export async function createProfileStore(directory, { logger = console } = {}) {
  const path = join(directory, "profile.json");
  const backupPath = join(directory, "profile.backup.json");
  let values = {}, lastGood = null, timer = null, dirty = false, chain = Promise.resolve();
  for (const candidate of [path, backupPath]) {
    try {
      const raw = await readFile(candidate, "utf8");
      if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error("profile-too-large");
      values = validate(JSON.parse(raw)); lastGood = JSON.stringify({ schema: 1, values });
      break;
    } catch (error) { if (error.code !== "ENOENT") logger.warn?.(`存档读取失败 (${candidate === path ? "主存档" : "备份"})：${error.message}`); }
  }
  async function flush() {
    clearTimeout(timer); timer = null;
    if (!dirty) return chain;
    dirty = false;
    const next = JSON.stringify({ schema: 1, values });
    chain = chain.then(async () => {
      await mkdir(directory, { recursive: true });
      if (lastGood) {
        await writeFile(`${backupPath}.tmp`, lastGood, "utf8");
        await rename(`${backupPath}.tmp`, backupPath);
      }
      await writeFile(`${path}.tmp`, next, "utf8");
      await rename(`${path}.tmp`, path);
      lastGood = next;
    }).catch(error => { dirty = true; logger.error?.(`存档写入失败：${error.message}`); });
    return chain;
  }
  return Object.freeze({
    snapshot: () => ({ ...values }),
    set(key, value) {
      if (!allowed.has(key) || typeof value !== "string" || Buffer.byteLength(value) > 64 * 1024) return false;
      if (values[key] === value) return true;
      const next = { ...values, [key]: value };
      if (Buffer.byteLength(JSON.stringify(next)) > MAX_BYTES - 1024) return false;
      values = next; dirty = true; clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, 150); timer.unref();
      return true;
    },
    flush
  });
}
