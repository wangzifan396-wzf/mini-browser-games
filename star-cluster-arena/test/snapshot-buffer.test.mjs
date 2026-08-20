import assert from "node:assert/strict";
import test from "node:test";

await import("../frontend/js/snapshot-buffer.js");

const { SnapshotBuffer } = globalThis.ScaSnapshotBuffer;

function cell(id, values = {}) {
  return {
    id,
    x: 0,
    y: 0,
    radius: 10,
    vx: 0,
    vy: 0,
    mass: 10,
    ...values
  };
}

function snapshot(serverTime, tick, values = {}) {
  return {
    type: "snapshot",
    serverTime,
    tick,
    world: { width: 5200, height: 5200 },
    groups: [{ id: "player-a", cells: [cell("cell-a")] }],
    ejected: [],
    ranking: [],
    ...values
  };
}

test("keeps a bounded chronological ring and rejects stale snapshots", () => {
  const buffer = new SnapshotBuffer({ capacity: 4 });
  for (let index = 0; index < 6; index += 1) {
    assert.equal(buffer.push(snapshot(1_000 + index * 100, index), index * 100), true);
  }

  assert.equal(buffer.push(snapshot(1_500, 5), 700), false);
  assert.equal(buffer.push(snapshot(1_400, 7), 700), false);
  assert.deepEqual(buffer.getStats(), {
    ...buffer.getStats(),
    queuedSnapshots: 4,
    receivedSnapshots: 6,
    rejectedSnapshots: 2,
    latestServerTime: 1_500,
    latestTick: 5
  });
  assert.equal(buffer.sampleAtServerTime(1_150).serverTime, 1_200);
});

test("interpolates position, radius, and velocity fields by entity id", () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snapshot(1_000, 1, {
    groups: [{ id: "player-a", cells: [cell("cell-a", { x: 0, y: 20, radius: 10, vx: 100, vy: 0 })] }],
    ejected: [cell("shot-a", { x: 20, y: 40, radius: 4, vx: 200, vy: -20 })]
  }), 10);
  buffer.push(snapshot(1_100, 2, {
    groups: [{ id: "player-a", cells: [cell("cell-a", { x: 100, y: 40, radius: 20, vx: 200, vy: 50 })] }],
    ejected: [cell("shot-a", { x: 60, y: 20, radius: 6, vx: 100, vy: 20 })]
  }), 110);

  const value = buffer.sampleAtServerTime(1_050);
  const playerCell = value.groups[0].cells[0];
  assert.equal(value.interpolationAlpha, 0.5);
  assert.deepEqual(
    { x: playerCell.x, y: playerCell.y, radius: playerCell.radius, vx: playerCell.vx, vy: playerCell.vy },
    { x: 50, y: 30, radius: 15, vx: 150, vy: 25 }
  );
  assert.deepEqual(
    Object.fromEntries(["x", "y", "radius", "vx", "vy"].map(key => [key, value.ejected[0][key]])),
    { x: 40, y: 30, radius: 5, vx: 150, vy: 0 }
  );
});

test("extrapolates moving entities for at most 50 milliseconds", () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snapshot(1_000, 1, {
    groups: [{ id: "player-a", cells: [cell("cell-a", { x: 100, y: 50, vx: 200, vy: -100 })] }]
  }), 0);

  const value = buffer.sampleAtServerTime(1_500);
  assert.equal(value.serverTime, 1_050);
  assert.equal(value.extrapolatedMs, 50);
  assert.equal(value.groups[0].cells[0].x, 110);
  assert.equal(value.groups[0].cells[0].y, 45);
});

test("uses an RFC 3550 jitter estimator and keeps adaptive delay inside bounds", () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snapshot(1_000, 1), 0);
  buffer.push(snapshot(1_100, 2), 100);
  buffer.push(snapshot(1_200, 3), 220);

  const stats = buffer.getStats();
  assert.equal(stats.jitterMs, 1.25);
  assert.ok(stats.snapshotHz > 9 && stats.snapshotHz < 11);
  assert.ok(stats.bufferDelayMs >= 80 && stats.bufferDelayMs <= 180);
});

test("uses the least-delayed samples for a stable server clock estimate", () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snapshot(1_000, 1), 100);
  buffer.push(snapshot(1_100, 2), 260); // 60 ms of extra transit delay
  buffer.push(snapshot(1_200, 3), 310); // 10 ms of extra transit delay

  assert.equal(buffer.getStats().clockOffsetMs, 900);
  assert.equal(buffer.estimatedServerTime(400), 1_300);
});

test("materializes food and virus baselines and applies discrete deltas", () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snapshot(1_000, 1, {
    foodBaseline: [
      { id: "food-a", x: 10, y: 20, radius: 4, color: 0 },
      { id: "food-b", x: 30, y: 40, radius: 5, color: 1 }
    ],
    viruses: [{ id: "virus-a", x: 100, y: 200, radius: 60, color: "#5eea80" }]
  }), 0);
  buffer.push(snapshot(1_100, 2, {
    foodDelta: {
      removed: ["food-a"],
      added: [{ id: "food-c", x: 50, y: 60, radius: 6, color: 2 }]
    },
    virusDelta: {
      removed: ["virus-a"],
      added: [{ id: "virus-b", x: 300, y: 400, radius: 52, color: "#f472b6" }]
    }
  }), 100);

  assert.deepEqual(buffer.sampleAtServerTime(1_050).foods.map(food => food.id), ["food-a", "food-b"]);
  assert.deepEqual(buffer.sampleAtServerTime(1_100).foods.map(food => food.id), ["food-b", "food-c"]);
  assert.deepEqual(buffer.sampleAtServerTime(1_050).viruses.map(virus => virus.id), ["virus-a"]);
  assert.deepEqual(buffer.sampleAtServerTime(1_100).viruses.map(virus => virus.id), ["virus-b"]);
});

test("playback cursor stays smooth across bursty arrival times", () => {
  const buffer = new SnapshotBuffer();
  const arrivals = [30, 160, 175, 330, 380, 560, 575, 730];
  const source = arrivals.map((receivedAt, index) => ({
    receivedAt,
    value: snapshot(1_000 + index * 100, index + 1, {
      groups: [{ id: "player-a", cells: [cell("cell-a", { x: index * 25, vx: 250 })] }]
    })
  }));
  let sourceIndex = 0;
  let previousX = null;
  let maximumFrameMove = 0;

  for (let now = 0; now <= 800; now += 10) {
    while (sourceIndex < source.length && source[sourceIndex].receivedAt <= now) {
      buffer.push(source[sourceIndex].value, source[sourceIndex].receivedAt);
      sourceIndex += 1;
    }
    const rendered = buffer.sample(now);
    if (!rendered) continue;
    const x = rendered.groups[0].cells[0].x;
    if (previousX != null) {
      assert.ok(x >= previousX, `playback moved backwards from ${previousX} to ${x}`);
      maximumFrameMove = Math.max(maximumFrameMove, x - previousX);
    }
    previousX = x;
  }

  // At 250 px/s a 10 ms test frame is 2.5 px. The PLL is capped at 1.1x,
  // so normal jitter cannot cause a receipt-time teleport.
  assert.ok(maximumFrameMove <= 2.76, `unexpected frame jump: ${maximumFrameMove}`);
});

test("counts one underrun per starvation episode", () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snapshot(1_000, 1), 0);
  buffer.sampleAtServerTime(1_100, { countUnderrun: true });
  buffer.sampleAtServerTime(1_120, { countUnderrun: true });
  assert.equal(buffer.getStats().bufferUnderruns, 1);

  buffer.push(snapshot(1_200, 2), 200);
  buffer.sampleAtServerTime(1_150, { countUnderrun: true });
  buffer.sampleAtServerTime(1_300, { countUnderrun: true });
  assert.equal(buffer.getStats().bufferUnderruns, 2);
});

test("rejects a broken world revision chain until a fresh baseline arrives", () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snapshot(1_000, 1, {
    foodRevision: 3,
    foods: [{ id: "food-a", x: 1, y: 2, radius: 4, color: 0 }],
    virusRevision: 1,
    viruses: []
  }), 0);
  buffer.push(snapshot(1_100, 2, {
    foodDelta: {
      fromRevision: 2,
      toRevision: 4,
      removed: ["food-a"],
      added: [{ id: "food-b", x: 3, y: 4, radius: 5, color: 1 }]
    }
  }), 100);
  assert.equal(buffer.getStats().needsBaseline, true);
  assert.deepEqual(buffer.sampleAtServerTime(1_100).foods.map(food => food.id), ["food-a"]);

  buffer.push(snapshot(1_200, 3, {
    foodRevision: 5,
    foods: [{ id: "food-c", x: 5, y: 6, radius: 6, color: 2 }],
    virusRevision: 1,
    viruses: []
  }), 200);
  assert.equal(buffer.getStats().needsBaseline, false);
  assert.deepEqual(buffer.sampleAtServerTime(1_200).foods.map(food => food.id), ["food-c"]);
});
