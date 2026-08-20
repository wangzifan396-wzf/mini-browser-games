import assert from "node:assert/strict";
import test from "node:test";

import {
  ARENA_INDEX,
  CELL_INDEX,
  CONTROL_POINT_INDEX,
  DELTA_INDEX,
  EJECTED_INDEX,
  FOOD_INDEX,
  GROUP_INDEX,
  RANKING_INDEX,
  SAFE_ZONE_INDEX,
  SNAPSHOT_INDEX,
  SNAPSHOT_WIRE_INDEXES,
  SNAPSHOT_WIRE_VERSION,
  TEAM_INDEX,
  VIRUS_INDEX,
  WORLD_INDEX,
  compactSnapshot
} from "../backend/multiplayer/snapshot-wire.mjs";

await import("../frontend/js/snapshot-wire.js");

const { decodeSnapshot, indexes: browserIndexes } = globalThis.ScaSnapshotWire;

function createCell(id, offset = 0) {
  const radius = 20 + offset;
  return {
    id,
    x: 1_000 + offset * 3,
    y: 2_000 - offset * 2,
    vx: 120.5 - offset,
    vy: -40.5 + offset,
    radius,
    mass: (radius / 4) ** 2
  };
}

function createGroup(id = "player-a", cellCount = 2, offset = 0) {
  const cells = Array.from({ length: cellCount }, (_, index) => createCell(`${id}-cell-${index}`, offset + index));
  return {
    id,
    name: `Player ${id}`,
    color: "#44d7b6",
    human: offset % 2 === 0,
    connected: true,
    dead: false,
    eliminated: false,
    kills: offset,
    deaths: offset + 1,
    lives: 3,
    team: offset % 2,
    role: "player",
    ackInputSeq: 100 + offset,
    respawnRemaining: 0,
    quickMergeCooldown: 1.2,
    specialCooldown: 3.4,
    rank: offset + 1,
    mass: cells.reduce((sum, cell) => sum + cell.mass, 0),
    cells
  };
}

function createRanking(group) {
  return {
    id: group.id,
    name: group.name,
    mass: group.mass,
    kills: group.kills,
    deaths: group.deaths,
    lives: group.lives,
    connected: group.connected,
    human: group.human,
    color: group.color,
    team: group.team,
    teamRank: 1,
    role: group.role,
    eliminated: group.eliminated,
    score: 12.5
  };
}

function createSnapshot(overrides = {}) {
  const groups = [createGroup()];
  return {
    tick: 42,
    serverTime: 1_723_456_789_012,
    serverHz: 20,
    mode: "control",
    phase: "running",
    finished: false,
    finishReason: null,
    winnerId: null,
    world: { width: 5_200, height: 5_200 },
    arena: { type: "rect", x: 100, y: 200, width: 4_800, height: 4_600 },
    remaining: 237.5,
    groups,
    ejected: [{ id: "ejected-1", x: 300, y: 400, vx: 50, vy: -25, radius: 8, color: "#ffd166" }],
    safeZone: { x: 2_600, y: 2_600, radius: 1_700, targetRadius: 700 },
    controlPoints: [{ id: "point-a", x: 1_300, y: 2_200, radius: 180, owner: 0, captureTeam: 1, progress: 62.5, contested: true }],
    teams: [{ id: "team-0", team: 0, name: "Blue", color: "#44d7b6", mass: 500, kills: 2, score: 35.5, alive: 3 }],
    objective: { type: "control", label: "Control", description: "Hold points", activeEvent: null, targetScore: 240 },
    ranking: groups.map(createRanking),
    events: [{ event: "control-captured", data: { pointId: "point-a", team: 0 } }],
    foodRevision: 12,
    virusRevision: 4,
    matchId: "match-one",
    baselineId: "baseline-one",
    configVersion: 3,
    ...overrides
  };
}

function throughJson(snapshot) {
  const packet = JSON.parse(JSON.stringify({ type: "snapshot", ...compactSnapshot(snapshot) }));
  return decodeSnapshot(packet);
}

test("wire v2 indices are locked and browser/server contracts agree", () => {
  assert.equal(SNAPSHOT_WIRE_VERSION, 2);
  assert.deepEqual(SNAPSHOT_INDEX, {
    TICK: 0, SERVER_TIME: 1, SERVER_HZ: 2, MODE: 3, PHASE: 4, FINISHED: 5,
    FINISH_REASON: 6, WINNER_ID: 7, WORLD: 8, ARENA: 9, REMAINING: 10,
    GROUPS: 11, EJECTED: 12, SAFE_ZONE: 13, CONTROL_POINTS: 14, TEAMS: 15,
    OBJECTIVE: 16, RANKING: 17, EVENTS: 18, FOOD_REVISION: 19, VIRUS_REVISION: 20,
    FOODS: 21, FOOD_BASELINE: 22, VIRUSES: 23, VIRUS_BASELINE: 24,
    FOOD_DELTA: 25, VIRUS_DELTA: 26, MATCH_ID: 27, BASELINE_ID: 28,
    CONFIG_VERSION: 29, LENGTH: 30
  });
  for (const [name, serverIndexes] of Object.entries(SNAPSHOT_WIRE_INDEXES)) {
    assert.deepEqual(browserIndexes[name], serverIndexes, `${name} indices drifted`);
  }
  assert.equal(WORLD_INDEX.LENGTH, 2);
  assert.equal(ARENA_INDEX.LENGTH, 5);
  assert.equal(SAFE_ZONE_INDEX.LENGTH, 4);
  assert.equal(GROUP_INDEX.LENGTH, 16);
  assert.equal(CELL_INDEX.LENGTH, 6);
  assert.equal(EJECTED_INDEX.LENGTH, 7);
  assert.equal(FOOD_INDEX.LENGTH, 5);
  assert.equal(VIRUS_INDEX.LENGTH, 6);
  assert.equal(DELTA_INDEX.LENGTH, 5);
  assert.equal(RANKING_INDEX.LENGTH, 12);
  assert.equal(TEAM_INDEX.LENGTH, 8);
  assert.equal(CONTROL_POINT_INDEX.LENGTH, 8);
});

test("normal dynamic snapshot round-trips existing snapshot semantics", () => {
  const source = createSnapshot();
  const decoded = throughJson(source);
  assert.deepEqual(decoded, { ...source, type: "snapshot" });
  assert.equal(Object.hasOwn(decoded, "foods"), false);
  assert.equal(Object.hasOwn(decoded, "foodDelta"), false);
});

test("full baseline snapshot round-trips foods and viruses", () => {
  const source = createSnapshot({
    foods: [
      { id: "food-1", x: 101.5, y: 202.5, radius: 5.4, color: 3 },
      { id: "food-2", x: 303.5, y: 404.5, radius: 6.1, color: "#f59e0b" }
    ],
    foodBaseline: true,
    viruses: [{ id: "virus-1", x: 800, y: 900, radius: 54, color: "#5eea80", spore: true }],
    virusBaseline: true
  });
  const decoded = throughJson(source);
  assert.deepEqual(decoded, { ...source, type: "snapshot" });
  assert.equal(Object.hasOwn(decoded, "foodDelta"), false);
  assert.equal(Object.hasOwn(decoded, "virusDelta"), false);
});

test("incremental snapshot round-trips revision chains and entity deltas", () => {
  const source = createSnapshot({
    foodDelta: {
      fromRevision: 12,
      toRevision: 13,
      added: [{ id: "food-new", x: 51, y: 52, radius: 4.5, color: 2 }],
      removed: ["food-old"],
      updated: [{ id: "food-updated", x: 61, y: 62, radius: 5.5, color: 4 }]
    },
    virusDelta: {
      fromRevision: 4,
      toRevision: 5,
      added: [{ id: "virus-new", x: 700, y: 701, radius: 48, color: "#5eea80", spore: false }],
      removed: ["virus-old"],
      updated: [{ id: "virus-updated", x: 702, y: 703, radius: 50, color: "#f472b6", spore: true }]
    }
  });
  const decoded = throughJson(source);
  assert.deepEqual(decoded, { ...source, type: "snapshot" });
  assert.equal(Object.hasOwn(decoded, "foods"), false);
  assert.equal(Object.hasOwn(decoded, "viruses"), false);
});

test("16 groups with 16 cells stay below the 24 KiB dynamic JSON budget", () => {
  const groups = Array.from({ length: 16 }, (_, index) => createGroup(`g${index}`, 16, index));
  const source = createSnapshot({
    groups,
    ranking: groups.slice(0, 10).map(createRanking),
    foodDelta: { fromRevision: 50, toRevision: 51, added: [], removed: ["food-1", "food-2"] },
    virusDelta: { fromRevision: 7, toRevision: 7, added: [], removed: [] }
  });
  const packet = JSON.stringify({ type: "snapshot", ...compactSnapshot(source) });
  const bytes = Buffer.byteLength(packet);
  assert.ok(bytes < 24 * 1024, `dynamic snapshot is ${bytes} bytes`);
  assert.equal(decodeSnapshot(JSON.parse(packet)).groups.flatMap(group => group.cells).length, 256);
});

test("legacy object snapshots pass through unchanged", () => {
  const legacy = { type: "snapshot", tick: 1, groups: [] };
  assert.equal(decodeSnapshot(legacy), legacy);
});
