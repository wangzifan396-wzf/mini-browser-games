import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const order = ["SSS", "SS", "S", "A", "B", "C", "D", "E"];
const activeOrder = order.filter((tier) => tier !== "E");
const config = JSON.parse(await readFile(path.join(rootDir, "GAME_TIERS.json"), "utf8"));
const readme = await readFile(path.join(rootDir, "README.md"), "utf8");
const audit = await readFile(path.join(rootDir, "GAME_AUDIT.md"), "utf8");

assert.deepEqual(Object.keys(config.tiers), order, "tier order");
const entries = order.flatMap((tier) => config.tiers[tier].map((file) => ({ tier, file })));
const files = (await readdir(rootDir)).filter((file) => file.endsWith(".html") && file !== "index.html").sort();
assert.equal(entries.length, files.length, "configured game count");
assert.equal(new Set(entries.map(({ file }) => file)).size, entries.length, "each game appears once");
assert.deepEqual(entries.map(({ file }) => file).sort(), files, "all root games are classified");

const expected = new Map(entries.map(({ tier, file }) => [file, tier]));
const auditRows = new Map();
let auditTier = "";
for (const line of audit.split(/\r?\n/)) {
  const heading = line.match(/^### (SSS|SS|S|A|B|C|D|E) 级（(\d+) 款）/);
  if (heading) {
    auditTier = heading[1];
    assert.equal(Number(heading[2]), config.tiers[auditTier].length, `${auditTier} heading count`);
  }
  const row = line.match(/^\| [^|]+ \| `([^`]+\.html)` /);
  if (row && auditTier) auditRows.set(row[1], auditTier);
}
assert.equal(auditRows.size, entries.length, "audit row count");
for (const [file, tier] of expected) assert.equal(auditRows.get(file), tier, `${file} audit tier`);

const overview = readme.split("## 游戏总览")[1]?.split(/^## /m)[0] || "";
const activeRows = [...overview.matchAll(/^\|\s*(SSS|SS|S|A|B|C|D)\s*\|\s*\[[^\]]+\]\([^)]*\/([^/)]+\.html)\)/gm)]
  .map((match) => ({ tier: match[1], file: match[2] }));
const activeFiles = activeOrder.flatMap((tier) => config.tiers[tier]);
assert.equal(activeRows.length, activeFiles.length, "README active row count");
assert.equal(new Set(activeRows.map(({ file }) => file)).size, activeFiles.length, "README active rows are unique");
for (const { file, tier } of activeRows) assert.equal(expected.get(file), tier, `${file} README tier`);
assert.deepEqual(activeRows.map(({ file }) => file).sort(), activeFiles.slice().sort(), "README active coverage");

const archive = readme.split("## E 级历史废案")[1]?.split(/^## /m)[0] || "";
const archiveFiles = [...archive.matchAll(/\/([^/)]+\.html)\)/g)].map((match) => match[1]);
assert.deepEqual([...new Set(archiveFiles)].sort(), config.tiers.E.slice().sort(), "README E archive coverage");

console.log(JSON.stringify({
  checks: "PASS",
  total: entries.length,
  active: activeRows.length,
  archived: config.tiers.E.length,
  counts: Object.fromEntries(order.map((tier) => [tier, config.tiers[tier].length])),
}, null, 2));
