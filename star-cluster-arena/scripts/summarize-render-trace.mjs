import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const [input, output] = process.argv.slice(2);
assert.ok(input && output, "Usage: node scripts/summarize-render-trace.mjs input.json summary.json");
const trace = JSON.parse(await readFile(input, "utf8"));
const groups = new Map();
for (const event of trace.traceEvents || []) {
  if (event.ph !== "X" || !Number.isFinite(event.dur) || event.dur <= 0) continue;
  const name = `${event.cat}:${event.name}`;
  if (!groups.has(name)) groups.set(name, []);
  groups.get(name).push(event.dur / 1000);
}
const events = [...groups].map(([name, durations]) => {
  durations.sort((a, b) => a - b);
  const totalMs = durations.reduce((a, b) => a + b, 0);
  return { name, count: durations.length, totalMs: Math.round(totalMs * 1000) / 1000,
    meanMs: Math.round(totalMs / durations.length * 1000) / 1000,
    p95Ms: durations[Math.min(durations.length - 1, Math.floor(durations.length * .95))],
    maximumMs: durations.at(-1) };
}).sort((a, b) => b.totalMs - a.totalMs).slice(0, 40);
const report = { generatedAt: new Date().toISOString(),
  note: "Electron contentTracing, selected Chromium GPU/compositor categories. Durations are inclusive, nested and multi-threaded; do not sum them as frame time. Tracing adds overhead, so this is diagnosis, not an FPS benchmark.", events };
await writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");
console.table(events.slice(0, 12));
