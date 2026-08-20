import test from "node:test";
import assert from "node:assert/strict";
import { MODE_KEYS } from "../backend/multiplayer/modes.mjs";
import {
  AuthoritativeSimulation,
  SIMULATION_CONSTANTS,
  radiusFromMass
} from "../backend/multiplayer/simulation-v2.mjs";

const START_TIME = 1_000_000;
const EXPECTED_MODES = ["solo", "team", "survival", "battle", "blitz", "spore", "screen", "control", "giant", "demon"];

function players(count = 2) {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `玩家${index + 1}`
  }));
}

function createSimulation(mode, overrides = {}) {
  return new AuthoritativeSimulation({
    mode,
    players: players(2),
    botCount: mode === "demon" ? 4 : 0,
    seed: 0x5ca1ab1e,
    now: START_TIME,
    ...overrides
  });
}

function setCell(cell, { x = cell.x, y = cell.y, mass = cell.mass } = {}) {
  cell.x = x;
  cell.y = y;
  cell.mass = mass;
  cell.radius = radiusFromMass(mass);
  cell.vx = 0;
  cell.vy = 0;
  cell.dead = false;
  return cell;
}

function assertFiniteTree(value, path = "snapshot") {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} must be finite, received ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteTree(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) assertFiniteTree(nested, `${path}.${key}`);
  }
}

function serializedBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

test("all ten modes instantiate, tick and serialize finite bounded state", async t => {
  assert.deepEqual(MODE_KEYS, EXPECTED_MODES);

  for (const mode of EXPECTED_MODES) {
    await t.test(mode, () => {
      const simulation = createSimulation(mode, { botCount: mode === "demon" ? 4 : 2 });
      for (let tick = 0; tick < 80; tick += 1) {
        simulation.setInput("player-1", {
          seq: tick + 1,
          dx: Math.sin(tick / 13),
          dy: Math.cos(tick / 17),
          split: tick === 12,
          eject: tick >= 30 && tick < 34
        });
        simulation.step(START_TIME + (tick + 1) * 1000 / SIMULATION_CONSTANTS.SERVER_HZ);
      }

      const snapshot = simulation.snapshot({ foodMode: "delta" });
      assert.equal(snapshot.mode, mode);
      assert.equal(snapshot.serverHz, SIMULATION_CONSTANTS.SERVER_HZ);
      assert.ok(["running", "finished"].includes(snapshot.phase));
      assert.ok(snapshot.groups.length >= 2);
      assert.ok(snapshot.groups.every(group => group.cells.length <= SIMULATION_CONSTANTS.MAX_CELLS));
      assertFiniteTree(snapshot);

      const entityIds = [
        ...simulation.groups.map(group => group.id),
        ...simulation.groups.flatMap(group => group.cells.map(cell => cell.id)),
        ...simulation.foods.map(food => food.id),
        ...simulation.ejected.map(item => item.id),
        ...simulation.viruses.map(virus => virus.id)
      ];
      assert.equal(new Set(entityIds).size, entityIds.length, `${mode} emitted duplicate entity IDs`);

      for (const group of simulation.groups) {
        for (const cell of group.cells) {
          assert.ok(cell.x >= simulation.arena.x && cell.x <= simulation.arena.x + simulation.arena.width);
          assert.ok(cell.y >= simulation.arena.y && cell.y <= simulation.arena.y + simulation.arena.height);
          assert.ok(cell.mass >= 0);
          assert.ok(cell.radius > 0);
        }
      }
    });
  }
});

test("team modes balance assignments and block friendly consumption", () => {
  const team = createSimulation("team", { players: players(8), botCount: 0 });
  const teamSizes = new Map();
  for (const group of team.groups) teamSizes.set(group.team, (teamSizes.get(group.team) || 0) + 1);
  assert.deepEqual([...teamSizes.entries()], [[0, 4], [1, 4]]);
  assert.ok(Math.max(...teamSizes.values()) - Math.min(...teamSizes.values()) <= 1);

  const predator = team.groups[0];
  const teammate = team.groups[2];
  const opponent = team.groups[1];
  assert.equal(predator.team, teammate.team);
  assert.notEqual(predator.team, opponent.team);
  setCell(predator.cells[0], { x: 2600, y: 2600, mass: 600 });
  setCell(teammate.cells[0], { x: 2600, y: 2600, mass: 20 });
  setCell(opponent.cells[0], { x: 2600, y: 2600, mass: 20 });
  for (const group of team.groups.slice(3)) setCell(group.cells[0], { x: 400, y: 400, mass: 20 });
  team.handleCellEating();
  assert.equal(teammate.dead, false, "same-team cells must not consume one another");
  assert.equal(teammate.cells.length, 1);
  assert.equal(opponent.eliminated, false, "team mode permits a defeated player to respawn");
  assert.equal(opponent.dead, true, "opposing cells remain consumable");

  const control = createSimulation("control", { players: players(8), botCount: 0 });
  assert.deepEqual(control.groups.map(group => group.team), [0, 1, 2, 3, 0, 1, 2, 3]);

  const demon = createSimulation("demon", { players: players(3), botCount: 4 });
  assert.ok(demon.groups.filter(group => group.human).every(group => group.team === 0 && group.role === "player"));
  assert.ok(demon.groups.filter(group => !group.human).every(group => group.team === 1));
  assert.equal(demon.groups.filter(group => group.role === "boss").length, 1);
  assert.equal(demon.groups.filter(group => group.role === "minion").length, 3);
});

test("survival spends lives, rewards kills and permanently eliminates at zero", () => {
  const simulation = createSimulation("survival");
  const victim = simulation.groups[0];
  const killer = simulation.groups[1];
  assert.equal(victim.lives, 3);
  assert.equal(killer.lives, 3);

  for (let death = 1; death <= 3; death += 1) {
    simulation.events = [];
    simulation.eliminateGroup(victim, killer);
    assert.equal(victim.lives, 3 - death);
    assert.equal(victim.deaths, death);
    assert.equal(killer.kills, death);
    assert.equal(killer.lives, Math.min(6, 3 + death));

    if (death < 3) {
      assert.equal(victim.eliminated, false);
      assert.ok(victim.respawnTick > simulation.tick);
      simulation.tick = victim.respawnTick;
      simulation.updateRespawns();
      assert.equal(victim.dead, false);
      assert.equal(victim.cells.length, 1);
    }
  }

  assert.equal(victim.lives, 0);
  assert.equal(victim.dead, true);
  assert.equal(victim.eliminated, true);
  assert.equal(victim.respawnTick, 0);
});

test("battle shrinks its safe zone, applies damage and ends with the last survivor", () => {
  const simulation = createSimulation("battle");
  const [survivor, victim] = simulation.groups;
  const initialRadius = simulation.safeZone.radius;
  assert.equal(simulation.config.respawn, false);

  setCell(survivor.cells[0], { x: simulation.safeZone.x, y: simulation.safeZone.y, mass: 200 });
  setCell(victim.cells[0], { x: simulation.safeZone.x, y: simulation.safeZone.y, mass: 200 });
  simulation.serverTime = simulation.startedAt + 40_000;
  simulation.updateSafeZone();
  const midRadius = simulation.safeZone.radius;
  assert.ok(midRadius < initialRadius);
  assert.ok(midRadius > simulation.safeZone.targetRadius);

  simulation.serverTime = simulation.startedAt + 100_000;
  simulation.updateSafeZone();
  assert.equal(simulation.safeZone.radius, simulation.safeZone.targetRadius);

  setCell(victim.cells[0], {
    x: simulation.arena.x + victim.cells[0].radius,
    y: simulation.safeZone.y,
    mass: 10.2
  });
  simulation.updateSafeZone();
  assert.equal(victim.dead, true);
  assert.equal(victim.eliminated, true);
  assert.equal(victim.respawnTick, 0);

  simulation.tick = SIMULATION_CONSTANTS.SERVER_HZ * 8;
  simulation.checkLastSurvivor();
  assert.equal(simulation.finished, true);
  assert.equal(simulation.finishReason, "last-survivor");
  assert.equal(simulation.winnerId, survivor.id);
});

test("blitz events rotate deterministically and supremacy can finish the match", () => {
  const simulation = createSimulation("blitz");
  simulation.tick = simulation.nextEventTick;
  simulation.events = [];
  simulation.updateMatchEvent();
  assert.equal(simulation.activeEvent.key, "harvest");
  assert.equal(simulation.currentEventMultiplier("foodScale"), 1.35);
  assert.equal(simulation.events.at(-1).event, "match-event");

  simulation.tick = simulation.activeEvent.endsAtTick;
  simulation.updateMatchEvent();
  assert.equal(simulation.activeEvent, null);
  assert.equal(simulation.currentEventMultiplier("foodScale"), 1);
  assert.ok(simulation.events.some(event => event.event === "match-event-ended"));

  const [leader, runnerUp] = simulation.groups;
  setCell(leader.cells[0], { mass: 9000 });
  setCell(runnerUp.cells[0], { mass: 100 });
  simulation.serverTime = simulation.startedAt + (simulation.domination.graceSeconds + 1) * 1000;
  const requiredUpdates = Math.ceil(simulation.domination.holdSeconds / SIMULATION_CONSTANTS.STEP_SECONDS) + 1;
  for (let index = 0; index < requiredUpdates && !simulation.finished; index += 1) simulation.updateDomination();
  assert.equal(simulation.finished, true);
  assert.equal(simulation.finishReason, "domination");
  assert.equal(simulation.winnerId, leader.id);
  assert.ok(simulation.domination.share >= simulation.domination.targetShare);
});

test("spore viruses burst into configured, mass-conserving collectible pieces", () => {
  const simulation = createSimulation("spore");
  assert.equal(simulation.viruses.length, simulation.config.viruses.count);
  assert.ok(simulation.viruses.every(virus => virus.spore));

  const group = simulation.groups[0];
  const cell = group.cells[0];
  const virus = simulation.viruses[0];
  simulation.viruses = [virus];
  setCell(cell, { x: virus.x, y: virus.y, mass: 1000 });
  const beforeMass = cell.mass;
  simulation.events = [];
  simulation.handleVirusCollisions();

  const burstPieces = simulation.ejected.filter(item => item.id.startsWith("spore-"));
  assert.ok(burstPieces.length >= simulation.config.viruses.burstPiecesMinimum);
  assert.ok(burstPieces.length <= simulation.config.viruses.burstPiecesMaximum);
  assert.ok(cell.mass < beforeMass);
  const lostMass = beforeMass - cell.mass;
  const collectibleMass = burstPieces.reduce((sum, piece) => sum + piece.mass, 0);
  assert.ok(Math.abs(collectibleMass - lostMass * 0.9) < 1e-6);
  assert.ok(burstPieces.every(piece => piece.ownerId === null && piece.color === "#f472b6"));
  assert.ok(!simulation.viruses.some(candidate => candidate.id === virus.id));
  assert.ok(simulation.events.some(event => event.event === "virus-burst" && event.data.spore));
});

test("screen exposes the square arena, 64-cell cap and cooldown-gated skills", () => {
  const simulation = createSimulation("screen");
  const group = simulation.groups[0];
  assert.equal(simulation.maxCellsForGroup(group), 64);
  assert.ok(simulation.arena.width < SIMULATION_CONSTANTS.WORLD_SIZE);
  assert.equal(simulation.arena.width, simulation.arena.height);

  group.input.dx = 1;
  group.input.dy = 0;
  simulation.splitGroup(group);
  assert.equal(group.cells.length, 2);
  assert.ok(group.cells.every(cell => cell.mergeTicks > 0));

  simulation.events = [];
  assert.equal(simulation.setInput(group.id, { seq: 1, dx: 1, dy: 0, quickMerge: true }), true);
  simulation.updateMovement(group);
  assert.ok(group.cells.every(cell => cell.mergeTicks === 0));
  assert.ok(group.quickMergeCooldown > 0);
  assert.ok(simulation.events.some(event => event.event === "ability" && event.data.ability === "quick-merge"));

  const virusCount = simulation.viruses.length;
  const massBeforeDash = simulation.groupMass(group);
  simulation.events = [];
  assert.equal(simulation.setInput(group.id, { seq: 2, dx: 1, dy: 0, special: true }), true);
  simulation.updateMovement(group);
  assert.ok(simulation.groupMass(group) < massBeforeDash);
  assert.equal(simulation.viruses.length, virusCount + 1);
  assert.ok(group.specialCooldown > 0);
  assert.ok(simulation.events.some(event => event.event === "ability" && event.data.ability === "dash"));
});

test("control points contest, capture, score and settle exactly once", () => {
  const simulation = createSimulation("control", { players: players(4), botCount: 0 });
  const point = simulation.controlPoints[0];
  const teamZero = simulation.groups.find(group => group.team === 0);
  const teamOne = simulation.groups.find(group => group.team === 1);
  setCell(teamZero.cells[0], { x: point.x, y: point.y, mass: 200 });
  setCell(teamOne.cells[0], { x: point.x, y: point.y, mass: 200 });
  for (const group of simulation.groups.filter(group => ![teamZero, teamOne].includes(group))) {
    setCell(group.cells[0], { x: 300, y: 300, mass: 200 });
  }

  simulation.updateControlPoints();
  assert.equal(point.contested, true);
  assert.equal(point.owner, null);

  setCell(teamOne.cells[0], { x: 300, y: 300, mass: 200 });
  for (let index = 0; index < 100 && point.owner == null; index += 1) simulation.updateControlPoints();
  assert.equal(point.owner, 0);
  assert.equal(point.progress, 100);
  assert.ok((simulation.teamScores.get(0) || 0) > 0);

  simulation.teamScores.set(0, simulation.config.control.targetScore - 0.01);
  simulation.events = [];
  simulation.updateControlPoints();
  assert.equal(simulation.finished, true);
  assert.equal(simulation.finishReason, "control-score");
  assert.equal(simulation.winnerId, "team-0");
  const finishEvents = simulation.events.filter(event => event.event === "match-finished").length;
  simulation.updateControlPoints();
  assert.equal(simulation.events.filter(event => event.event === "match-finished").length, finishEvents);
});

test("giant keeps a static zone and requires 88 percent dominance for six seconds", () => {
  const simulation = createSimulation("giant");
  const [leader, runnerUp] = simulation.groups;
  assert.equal(leader.cells[0].mass, simulation.config.startMass);
  assert.equal(simulation.safeZone.static, true);
  const fixedRadius = simulation.safeZone.radius;
  simulation.serverTime += 120_000;
  simulation.updateSafeZone();
  assert.equal(simulation.safeZone.radius, fixedRadius);

  setCell(leader.cells[0], { x: simulation.safeZone.x, y: simulation.safeZone.y, mass: 10_000 });
  setCell(runnerUp.cells[0], { x: simulation.safeZone.x, y: simulation.safeZone.y, mass: 100 });
  const requiredUpdates = Math.ceil(simulation.domination.holdSeconds / SIMULATION_CONSTANTS.STEP_SECONDS) + 1;
  for (let index = 0; index < requiredUpdates && !simulation.finished; index += 1) simulation.updateDomination();
  assert.equal(simulation.finished, true);
  assert.equal(simulation.finishReason, "domination");
  assert.equal(simulation.winnerId, leader.id);
  assert.ok(simulation.domination.share >= 0.88);
});

test("demon assigns one boss and settles hero defeat or timeout to the correct side", () => {
  const heroWin = createSimulation("demon", { players: players(2), botCount: 4 });
  const boss = heroWin.groups.find(group => group.role === "boss");
  assert.ok(boss);
  assert.equal(boss.cells[0].mass, 8500);
  boss.dead = true;
  boss.eliminated = true;
  boss.cells = [];
  heroWin.events = [];
  heroWin.updateDemon();
  assert.equal(heroWin.finished, true);
  assert.equal(heroWin.finishReason, "boss-defeated");
  assert.equal(heroWin.winnerId, "team-0");

  const timeout = createSimulation("demon", { players: players(2), botCount: 4 });
  timeout.step(timeout.startedAt + timeout.durationSeconds * 1000);
  assert.equal(timeout.finished, true);
  assert.equal(timeout.finishReason, "time-limit");
  assert.equal(timeout.winnerId, "team-1");
});

test("food full baseline and atomic delta rebuild identical food state", () => {
  const simulation = createSimulation("solo");
  const baseline = simulation.snapshot({ foodMode: "full" });
  assert.equal(baseline.foodBaseline, true);
  assert.equal(baseline.foods.length, simulation.foods.length);
  assert.equal(Object.hasOwn(baseline, "foodDelta"), false);

  const reconstructed = new Map(baseline.foods.map(food => [food.id, food]));
  simulation.clearFoodDelta();
  const removed = simulation.foods[0];
  const oldBucket = simulation.foodGrid.get(removed.gridKey);
  oldBucket.delete(removed);
  if (!oldBucket.size) simulation.foodGrid.delete(removed.gridKey);
  removed.x = simulation.groups[0].cells[0].x;
  removed.y = simulation.groups[0].cells[0].y;
  simulation.addFoodToGrid(removed);
  const previousRevision = simulation.foodRevision;
  simulation.step(simulation.serverTime + 50);
  const deltaSnapshot = simulation.snapshot({ foodMode: "delta" });
  assert.equal(Object.hasOwn(deltaSnapshot, "foods"), false);
  assert.equal(deltaSnapshot.foodDelta.fromRevision, previousRevision);
  assert.equal(deltaSnapshot.foodDelta.toRevision, previousRevision + 1);
  assert.deepEqual(deltaSnapshot.foodDelta.removed, [removed.id]);
  assert.equal(deltaSnapshot.foodDelta.added.length, 1);

  for (const id of deltaSnapshot.foodDelta.removed) reconstructed.delete(id);
  for (const food of deltaSnapshot.foodDelta.added) reconstructed.set(food.id, food);
  const currentFoods = simulation.snapshot({ foodMode: "full" }).foods;
  assert.deepEqual(
    [...reconstructed.values()].sort((a, b) => a.id.localeCompare(b.id)),
    [...currentFoods].sort((a, b) => a.id.localeCompare(b.id))
  );

  simulation.clearFoodDelta();
  const emptyDelta = simulation.snapshot({ foodMode: "delta" }).foodDelta;
  assert.equal(emptyDelta.fromRevision, previousRevision + 1);
  assert.equal(emptyDelta.toRevision, previousRevision + 1);
  assert.deepEqual(emptyDelta.added, []);
  assert.deepEqual(emptyDelta.removed, []);
});

test("compact dynamic snapshots omit full food and stay below the 16 KiB release hard limit", async t => {
  const releaseHardLimit = 16 * 1024;
  const eightHumans = players(8);

  for (const mode of EXPECTED_MODES) {
    await t.test(mode, () => {
      const simulation = createSimulation(mode, {
        players: eightHumans,
        botCount: 8,
        seed: 9000 + EXPECTED_MODES.indexOf(mode)
      });
      simulation.clearFoodDelta();
      const compact = simulation.snapshot({ foodMode: "delta" });
      const baseline = simulation.snapshot({ foodMode: "full" });
      const bytes = serializedBytes(compact);
      assert.equal(Object.hasOwn(compact, "foods"), false);
      assert.ok(bytes <= releaseHardLimit, `${mode} dynamic snapshot is ${bytes} B, above ${releaseHardLimit} B`);
      assert.ok(bytes < serializedBytes(baseline), `${mode} delta snapshot must be smaller than its full baseline`);
    });
  }
});
