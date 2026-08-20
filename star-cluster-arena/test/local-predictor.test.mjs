import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../frontend/js/local-predictor.js", import.meta.url), "utf8");
const context = { globalThis: {} };
vm.runInNewContext(source, context, { filename: "local-predictor.js" });
const { predictLocalPlayer } = context.globalThis.ScaLocalPredictor;

function snapshot(overrides = {}) {
  return {
    serverTime: 1000,
    mode: "solo",
    world: { width: 1000, height: 1000 },
    arena: { x: 0, y: 0, width: 1000, height: 1000 },
    groups: [
      { id: "me", cells: [{ id: "c1", x: 500, y: 500, radius: 20, vx: 0, vy: 0 }] },
      { id: "remote", cells: [{ id: "c2", x: 400, y: 400, radius: 20, vx: 4, vy: 5 }] }
    ],
    ...overrides
  };
}

test("predicts only the local player and preserves remote interpolation", () => {
  const original = snapshot();
  const result = predictLocalPlayer(original, {
    playerId: "me",
    estimatedServerTime: 1100,
    currentInput: { dx: 1, dy: 0 }
  });
  assert.ok(result.groups[0].cells[0].x > 500);
  assert.equal(result.groups[0].cells[0].y, 500);
  assert.equal(result.groups[0].locallyPredictedMs, 100);
  assert.deepEqual(result.groups[1], original.groups[1]);
  assert.equal(original.groups[0].cells[0].x, 500);
});

test("replays input direction changes on their estimated server timeline", () => {
  const result = predictLocalPlayer(snapshot(), {
    playerId: "me",
    estimatedServerTime: 1150,
    currentInput: { dx: 0, dy: 1 },
    inputHistory: [
      { seq: 1, serverTime: 1000, dx: 1, dy: 0 },
      { seq: 2, serverTime: 1050, dx: 0, dy: 1 }
    ]
  });
  const cell = result.groups[0].cells[0];
  assert.ok(cell.x > 500);
  assert.ok(cell.y > 500);
});

test("caps prediction lead and clamps cells to the arena", () => {
  const original = snapshot();
  original.groups[0].cells[0].x = 979;
  const result = predictLocalPlayer(original, {
    playerId: "me",
    estimatedServerTime: 5000,
    currentInput: { dx: 1, dy: 0 }
  });
  assert.equal(result.groups[0].locallyPredictedMs, 180);
  assert.ok(result.groups[0].cells[0].x <= 980);
});

test("returns the same snapshot when there is no controllable local player", () => {
  const original = snapshot();
  assert.equal(predictLocalPlayer(original, { playerId: "missing", estimatedServerTime: 1100 }), original);
  assert.equal(predictLocalPlayer(null, { playerId: "me" }), null);
});
