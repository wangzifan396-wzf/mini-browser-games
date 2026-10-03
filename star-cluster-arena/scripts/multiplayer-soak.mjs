import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { MODE_KEYS, getModeConfig } from "../backend/multiplayer/modes.mjs";
import { AuthoritativeSimulation, SIMULATION_CONSTANTS } from "../backend/multiplayer/simulation.mjs";
import { compactSnapshot } from "../backend/multiplayer/snapshot-wire.mjs";

const TICKS = Number.parseInt(process.env.SCA_SOAK_TICKS || "1200", 10);
const selectedModes = process.env.SCA_SOAK_MODES ? process.env.SCA_SOAK_MODES.split(",").map(value => value.trim()) : MODE_KEYS;
assert.ok(selectedModes.length && selectedModes.every(mode => MODE_KEYS.includes(mode)), "Invalid soak mode selection");
const DYNAMIC_P95_LIMIT = 96 * 1024;
const NETWORK_BYTES_PER_SECOND_LIMIT = 2 * 1024 * 1024;
// A 60 Hz authority has 16.67 ms per physics tick. Keep p95 below 72% of
// that wall-clock budget so snapshot work and event-loop jitter retain headroom.
const TICK_P95_LIMIT_MS = 12;

function percentile(values, ratio) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

const results = [];
for (const [modeIndex, mode] of selectedModes.entries()) {
  const config = getModeConfig(mode);
  const humanCount = Math.min(Math.max(2, Number(process.env.SCA_SOAK_HUMANS) || 2), config.maximumHumans);
  const botCount = config.targetParticipants - humanCount;
  const humans = Array.from({ length: humanCount }, (_, index) => ({
    id: `human-${index + 1}`,
    name: `Human ${index + 1}`,
    connected: true
  }));
  const simulation = new AuthoritativeSimulation({
    players: humans,
    botCount,
    mode,
    seed: 3200 + modeIndex,
    now: 1_000_000
  });
  const packetBytes = [];
  const tickTimes = [];
  const networkTimes = [];
  let maximumFullBytes = 0;
  for (let tick = 1; tick <= TICKS && !simulation.finished; tick += 1) {
    for (const [index, player] of humans.entries()) {
      const angle = (tick / 37) + index * Math.PI / 4;
      simulation.setInput(player.id, {
        seq: tick,
        dx: Math.cos(angle),
        dy: Math.sin(angle),
        targetX: 2600 + Math.cos(angle) * 2200,
        targetY: 2600 + Math.sin(angle) * 2200,
        split: tick % (137 + index) === 0,
        eject: tick % (41 + index) === 0,
        quickMerge: tick % 223 === 0,
        special: tick % 251 === 0
      });
    }
    const startedAt = performance.now();
    simulation.step(1_000_000 + tick * 1000 / SIMULATION_CONSTANTS.SERVER_HZ);
    tickTimes.push(performance.now() - startedAt);
    if (tick % SIMULATION_CONSTANTS.NETWORK_SNAPSHOT_INTERVAL_TICKS !== 0 && !simulation.finished) continue;
    const networkStarted = performance.now();
    const full = tick % SIMULATION_CONSTANTS.FULL_FOOD_SNAPSHOT_INTERVAL_TICKS === 0;
    const snapshot = simulation.snapshot({ foodMode: full ? "full" : "delta" });
    for (const group of snapshot.groups) for (const cell of group.cells) {
      assert.ok([cell.x, cell.y, cell.mass, cell.radius, cell.vx, cell.vy].every(Number.isFinite), `${mode} non-finite entity`);
      assert.ok(cell.mass > 0 && cell.radius > 0, `${mode} invalid cell size`);
    }
    const bytes = Buffer.byteLength(JSON.stringify({ type: "snapshot", ...compactSnapshot(snapshot) }));
    if (full) maximumFullBytes = Math.max(maximumFullBytes, bytes);
    else packetBytes.push(bytes);
    simulation.clearFoodDelta();
    networkTimes.push(performance.now() - networkStarted);
  }
  const dynamicAverageBytes = Math.round(packetBytes.reduce((sum, value) => sum + value, 0) / Math.max(1, packetBytes.length));
  const finalSnapshot = simulation.snapshot({ foodMode: "none" });
  const result = {
    tier: "canonical-target",
    participants: finalSnapshot.groups.length,
    humans: humanCount,
    bots: botCount,
    mode,
    ticks: simulation.tick,
    simulatedSeconds: Number((simulation.tick / SIMULATION_CONSTANTS.SERVER_HZ).toFixed(1)),
    finished: finalSnapshot.finished,
    finishReason: finalSnapshot.finishReason,
    winnerId: finalSnapshot.winnerId,
    alive: finalSnapshot.groups.filter(group => !group.dead).length,
    cells: finalSnapshot.groups.reduce((sum, group) => sum + group.cells.length, 0),
    dynamicAverageBytes,
    dynamicP95Bytes: percentile(packetBytes, 0.95),
    dynamicMaximumBytes: Math.max(...packetBytes),
    dynamicKiBps: Number((dynamicAverageBytes * SIMULATION_CONSTANTS.SNAPSHOT_HZ / 1024).toFixed(1)),
    fullMaximumBytes: maximumFullBytes,
    tickAverageMs: Number((tickTimes.reduce((sum, value) => sum + value, 0) / tickTimes.length).toFixed(3)),
    tickP95Ms: Number(percentile(tickTimes, 0.95).toFixed(3)),
    snapshotP95Ms: Number(percentile(networkTimes, 0.95).toFixed(3))
  };
  assert.equal(result.participants, config.targetParticipants, `${mode} did not keep its canonical participant target`);
  if (config.durationSeconds > 0 && TICKS > config.durationSeconds * SIMULATION_CONSTANTS.SERVER_HZ) {
    assert.equal(result.finished, true, `${mode} did not settle by its time limit`);
    assert.ok(result.finishReason, `${mode} settled without an explanation`);
  }
  if (result.finished && result.winnerId) assert.ok(finalSnapshot.groups.some(group => group.id === result.winnerId), `${mode} invented a winner`);
  assert.ok(result.dynamicP95Bytes < DYNAMIC_P95_LIMIT, `${mode} dynamic p95 exceeded 96 KiB`);
  assert.ok(result.dynamicAverageBytes * SIMULATION_CONSTANTS.SNAPSHOT_HZ < NETWORK_BYTES_PER_SECOND_LIMIT, `${mode} exceeded 2 MiB/s`);
  assert.ok(result.tickP95Ms < TICK_P95_LIMIT_MS, `${mode} tick p95 exceeded ${TICK_P95_LIMIT_MS} ms`);
  results.push(result);
  console.log(`SOAK_MODE_OK ${JSON.stringify(result)}`);
}

console.table(results);
const report = {
  version: "1.0.0",
  generatedAt: new Date().toISOString(),
  requestedTicksPerMode: TICKS,
  simulationHz: SIMULATION_CONSTANTS.SERVER_HZ,
  snapshotHz: SIMULATION_CONSTANTS.SNAPSHOT_HZ,
  budgets: { dynamicP95Bytes: DYNAMIC_P95_LIMIT, networkBytesPerSecond: NETWORK_BYTES_PER_SECOND_LIMIT, tickP95Ms: TICK_P95_LIMIT_MS },
  results
};
if (process.env.SCA_SOAK_REPORT) {
  const reportPath = resolve(process.env.SCA_SOAK_REPORT);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report));
