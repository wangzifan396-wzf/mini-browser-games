import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { MODE_KEYS } from "../backend/multiplayer/modes.mjs";
import { AuthoritativeSimulation } from "../backend/multiplayer/simulation.mjs";
import { compactSnapshot } from "../backend/multiplayer/snapshot-wire.mjs";

const TICKS = Number.parseInt(process.env.SCA_SOAK_TICKS || "1200", 10);
const TIERS = Object.freeze([
  { name: "release-8", humans: 2, bots: 6, dynamicP95Limit: 16 * 1024 },
  { name: "stress-16", humans: 8, bots: 8, dynamicP95Limit: 24 * 1024 }
]);

function percentile(values, ratio) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

const results = [];
for (const tier of TIERS) {
  const humans = Array.from({ length: tier.humans }, (_, index) => ({
    id: `human-${index + 1}`,
    name: `Human ${index + 1}`,
    connected: true
  }));
  for (const [modeIndex, mode] of MODE_KEYS.entries()) {
    const simulation = new AuthoritativeSimulation({
      players: humans,
      botCount: tier.bots,
      mode,
      seed: 3200 + modeIndex,
      now: 1_000_000
    });
    const packetBytes = [];
    const tickTimes = [];
    let maximumFullBytes = 0;
    for (let tick = 1; tick <= TICKS && !simulation.finished; tick += 1) {
      for (const [index, player] of humans.entries()) {
        const angle = (tick / 37) + index * Math.PI / 4;
        simulation.setInput(player.id, {
          seq: tick,
          dx: Math.cos(angle),
          dy: Math.sin(angle),
          split: tick % (137 + index) === 0,
          eject: tick % (41 + index) === 0,
          quickMerge: tick % 223 === 0,
          special: tick % 251 === 0
        });
      }
      const startedAt = performance.now();
      simulation.step(1_000_000 + tick * 50);
      tickTimes.push(performance.now() - startedAt);
      const full = tick % 100 === 0;
      const snapshot = simulation.snapshot({ foodMode: full ? "full" : "delta" });
      const bytes = Buffer.byteLength(JSON.stringify({ type: "snapshot", ...compactSnapshot(snapshot) }));
      if (full) maximumFullBytes = Math.max(maximumFullBytes, bytes);
      else packetBytes.push(bytes);
      simulation.clearFoodDelta();
    }
    const dynamicAverageBytes = Math.round(packetBytes.reduce((sum, value) => sum + value, 0) / Math.max(1, packetBytes.length));
    const result = {
      tier: tier.name,
      participants: tier.humans + tier.bots,
      mode,
      ticks: simulation.tick,
      dynamicAverageBytes,
      dynamicP95Bytes: percentile(packetBytes, 0.95),
      dynamicMaximumBytes: Math.max(...packetBytes),
      dynamicKiBps: Number((dynamicAverageBytes * 20 / 1024).toFixed(1)),
      fullMaximumBytes: maximumFullBytes,
      tickAverageMs: Number((tickTimes.reduce((sum, value) => sum + value, 0) / tickTimes.length).toFixed(3)),
      tickP95Ms: Number(percentile(tickTimes, 0.95).toFixed(3))
    };
    assert.ok(result.dynamicP95Bytes < tier.dynamicP95Limit, `${tier.name}/${mode} dynamic p95 exceeded its limit`);
    assert.ok(result.tickP95Ms < 50, `${tier.name}/${mode} tick p95 exceeded 50 ms`);
    results.push(result);
  }
}

console.table(results);
console.log(JSON.stringify({ requestedTicksPerMode: TICKS, tiers: TIERS, results }));
