import test from "node:test";
import assert from "node:assert/strict";
import { AuthoritativeSimulation, SIMULATION_CONSTANTS } from "../backend/multiplayer/simulation.mjs";

function createSimulation(seed = 42) {
  return new AuthoritativeSimulation({
    players: [
      { id: "player-a", name: "甲" },
      { id: "player-b", name: "乙" }
    ],
    botCount: 2,
    seed,
    now: 1_000_000,
    durationSeconds: 30
  });
}

test("fixed seed and inputs produce deterministic snapshots", () => {
  const first = createSimulation(7788);
  const second = createSimulation(7788);
  for (let tick = 0; tick < 80; tick += 1) {
    const input = { seq: tick, dx: 0.8, dy: 0.2, split: tick === 8, eject: tick > 20 && tick < 28 };
    first.setInput("player-a", input);
    second.setInput("player-a", input);
    const now = 1_000_000 + (tick + 1) * SIMULATION_CONSTANTS.STEP_SECONDS * 1000;
    first.step(now);
    second.step(now);
  }
  assert.deepEqual(first.snapshot(), second.snapshot());
});

test("simulation preserves finite bounded entity state under load", () => {
  const simulation = createSimulation(9911);
  for (let tick = 0; tick < 600; tick += 1) {
    simulation.setInput("player-a", {
      seq: tick,
      dx: Math.sin(tick / 20),
      dy: Math.cos(tick / 20),
      split: tick % 90 === 0,
      eject: tick % 40 < 4
    });
    simulation.step(1_000_000 + (tick + 1) * 50);
  }
  const snapshot = simulation.snapshot();
  assert.ok(snapshot.foods.length >= 480 && snapshot.foods.length <= 900);
  assert.ok(snapshot.ejected.length <= 360);
  for (const group of snapshot.groups) {
    assert.ok(group.cells.length <= SIMULATION_CONSTANTS.MAX_CELLS);
    assert.ok(Number.isFinite(group.mass) && group.mass >= 0);
    for (const cell of group.cells) {
      assert.ok(Number.isFinite(cell.x) && cell.x >= 0 && cell.x <= snapshot.world.width);
      assert.ok(Number.isFinite(cell.y) && cell.y >= 0 && cell.y <= snapshot.world.height);
      assert.ok(Number.isFinite(cell.radius) && cell.radius > 0);
    }
  }
});

test("disconnected humans are controlled by AI and can reconnect", () => {
  const simulation = createSimulation(1234);
  const group = simulation.groups.find(item => item.id === "player-a");
  const before = simulation.groupCenter(group);
  simulation.setConnected("player-a", false);
  for (let index = 0; index < 30; index += 1) simulation.step(1_000_000 + (index + 1) * 50);
  const after = simulation.groupCenter(group);
  assert.notDeepEqual({ x: before.x, y: before.y }, { x: after.x, y: after.y });
  simulation.setConnected("player-a", true);
  assert.equal(simulation.setInput("player-a", { seq: 100, dx: 1, dy: 0, split: false, eject: false }), true);
});
