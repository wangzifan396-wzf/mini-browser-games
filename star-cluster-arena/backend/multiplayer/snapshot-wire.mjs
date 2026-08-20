export const SNAPSHOT_WIRE_VERSION = 2;

// The wire contract deliberately uses fixed-position arrays. Keep every index
// in this module so a protocol change is explicit, reviewable, and testable.
export const SNAPSHOT_INDEX = Object.freeze({
  TICK: 0,
  SERVER_TIME: 1,
  SERVER_HZ: 2,
  MODE: 3,
  PHASE: 4,
  FINISHED: 5,
  FINISH_REASON: 6,
  WINNER_ID: 7,
  WORLD: 8,
  ARENA: 9,
  REMAINING: 10,
  GROUPS: 11,
  EJECTED: 12,
  SAFE_ZONE: 13,
  CONTROL_POINTS: 14,
  TEAMS: 15,
  OBJECTIVE: 16,
  RANKING: 17,
  EVENTS: 18,
  FOOD_REVISION: 19,
  VIRUS_REVISION: 20,
  FOODS: 21,
  FOOD_BASELINE: 22,
  VIRUSES: 23,
  VIRUS_BASELINE: 24,
  FOOD_DELTA: 25,
  VIRUS_DELTA: 26,
  MATCH_ID: 27,
  BASELINE_ID: 28,
  CONFIG_VERSION: 29,
  LENGTH: 30
});

export const WORLD_INDEX = Object.freeze({ WIDTH: 0, HEIGHT: 1, LENGTH: 2 });
export const ARENA_INDEX = Object.freeze({ TYPE: 0, X: 1, Y: 2, WIDTH: 3, HEIGHT: 4, LENGTH: 5 });
export const SAFE_ZONE_INDEX = Object.freeze({ X: 0, Y: 1, RADIUS: 2, TARGET_RADIUS: 3, LENGTH: 4 });
export const GROUP_INDEX = Object.freeze({
  ID: 0,
  NAME: 1,
  COLOR: 2,
  FLAGS: 3,
  KILLS: 4,
  DEATHS: 5,
  LIVES: 6,
  TEAM: 7,
  ROLE: 8,
  ACK_INPUT_SEQ: 9,
  RESPAWN_REMAINING: 10,
  QUICK_MERGE_COOLDOWN: 11,
  SPECIAL_COOLDOWN: 12,
  RANK: 13,
  MASS: 14,
  CELLS: 15,
  LENGTH: 16
});
export const GROUP_FLAGS = Object.freeze({ HUMAN: 1, CONNECTED: 2, DEAD: 4, ELIMINATED: 8 });
export const CELL_INDEX = Object.freeze({ ID: 0, X: 1, Y: 2, VX: 3, VY: 4, RADIUS: 5, LENGTH: 6 });
export const EJECTED_INDEX = Object.freeze({ ID: 0, X: 1, Y: 2, VX: 3, VY: 4, RADIUS: 5, COLOR: 6, LENGTH: 7 });
export const FOOD_INDEX = Object.freeze({ ID: 0, X: 1, Y: 2, RADIUS: 3, COLOR: 4, LENGTH: 5 });
export const VIRUS_INDEX = Object.freeze({ ID: 0, X: 1, Y: 2, RADIUS: 3, COLOR: 4, SPORE: 5, LENGTH: 6 });
export const DELTA_INDEX = Object.freeze({
  FROM_REVISION: 0,
  TO_REVISION: 1,
  ADDED: 2,
  REMOVED: 3,
  UPDATED: 4,
  LENGTH: 5
});
export const RANKING_INDEX = Object.freeze({
  ID: 0,
  NAME: 1,
  MASS: 2,
  KILLS: 3,
  DEATHS: 4,
  LIVES: 5,
  FLAGS: 6,
  COLOR: 7,
  TEAM: 8,
  TEAM_RANK: 9,
  ROLE: 10,
  SCORE: 11,
  LENGTH: 12
});
export const RANKING_FLAGS = Object.freeze({ CONNECTED: 1, HUMAN: 2, ELIMINATED: 4 });
export const TEAM_INDEX = Object.freeze({ ID: 0, TEAM: 1, NAME: 2, COLOR: 3, MASS: 4, KILLS: 5, SCORE: 6, ALIVE: 7, LENGTH: 8 });
export const CONTROL_POINT_INDEX = Object.freeze({
  ID: 0,
  X: 1,
  Y: 2,
  RADIUS: 3,
  OWNER: 4,
  CAPTURE_TEAM: 5,
  PROGRESS: 6,
  CONTESTED: 7,
  LENGTH: 8
});

export const SNAPSHOT_WIRE_INDEXES = Object.freeze({
  snapshot: SNAPSHOT_INDEX,
  world: WORLD_INDEX,
  arena: ARENA_INDEX,
  safeZone: SAFE_ZONE_INDEX,
  group: GROUP_INDEX,
  cell: CELL_INDEX,
  ejected: EJECTED_INDEX,
  food: FOOD_INDEX,
  virus: VIRUS_INDEX,
  delta: DELTA_INDEX,
  ranking: RANKING_INDEX,
  team: TEAM_INDEX,
  controlPoint: CONTROL_POINT_INDEX
});

function booleanFlags(value, fields) {
  let flags = 0;
  for (const [field, bit] of fields) {
    if (value?.[field]) flags |= bit;
  }
  return flags;
}

function compactWorld(world) {
  return world == null ? null : [world.width, world.height];
}

function compactArena(arena) {
  return arena == null ? null : [arena.type, arena.x, arena.y, arena.width, arena.height];
}

function compactSafeZone(safeZone) {
  return safeZone == null ? null : [safeZone.x, safeZone.y, safeZone.radius, safeZone.targetRadius];
}

function compactCell(cell) {
  return [cell.id, cell.x, cell.y, cell.vx, cell.vy, cell.radius];
}

function compactGroup(group) {
  return [
    group.id,
    group.name,
    group.color,
    booleanFlags(group, [
      ["human", GROUP_FLAGS.HUMAN],
      ["connected", GROUP_FLAGS.CONNECTED],
      ["dead", GROUP_FLAGS.DEAD],
      ["eliminated", GROUP_FLAGS.ELIMINATED]
    ]),
    group.kills,
    group.deaths,
    group.lives,
    group.team,
    group.role,
    group.ackInputSeq,
    group.respawnRemaining,
    group.quickMergeCooldown,
    group.specialCooldown,
    group.rank,
    group.mass,
    (group.cells || []).map(compactCell)
  ];
}

function compactEjected(item) {
  return [item.id, item.x, item.y, item.vx, item.vy, item.radius, item.color];
}

function compactFood(food) {
  return [food.id, food.x, food.y, food.radius, food.color];
}

function compactVirus(virus) {
  return [virus.id, virus.x, virus.y, virus.radius, virus.color, virus.spore ? 1 : 0];
}

function compactDelta(delta, compactEntity) {
  if (delta == null) return null;
  return [
    delta.fromRevision,
    delta.toRevision,
    Array.isArray(delta.added) ? delta.added.map(compactEntity) : null,
    Array.isArray(delta.removed) ? delta.removed.map(value => typeof value === "object" ? value?.id : value) : null,
    Array.isArray(delta.updated) ? delta.updated.map(compactEntity) : null
  ];
}

function compactRanking(entry) {
  return [
    entry.id,
    entry.name,
    entry.mass,
    entry.kills,
    entry.deaths,
    entry.lives,
    booleanFlags(entry, [
      ["connected", RANKING_FLAGS.CONNECTED],
      ["human", RANKING_FLAGS.HUMAN],
      ["eliminated", RANKING_FLAGS.ELIMINATED]
    ]),
    entry.color,
    entry.team,
    entry.teamRank,
    entry.role,
    entry.score
  ];
}

function compactTeam(team) {
  return [team.id, team.team, team.name, team.color, team.mass, team.kills, team.score, team.alive];
}

function compactControlPoint(point) {
  return [point.id, point.x, point.y, point.radius, point.owner, point.captureTeam, point.progress, point.contested ? 1 : 0];
}

export function compactSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError("snapshot must be an object");
  }

  const wire = new Array(SNAPSHOT_INDEX.LENGTH).fill(null);
  wire[SNAPSHOT_INDEX.TICK] = snapshot.tick;
  wire[SNAPSHOT_INDEX.SERVER_TIME] = snapshot.serverTime;
  wire[SNAPSHOT_INDEX.SERVER_HZ] = snapshot.serverHz;
  wire[SNAPSHOT_INDEX.MODE] = snapshot.mode;
  wire[SNAPSHOT_INDEX.PHASE] = snapshot.phase;
  wire[SNAPSHOT_INDEX.FINISHED] = snapshot.finished ? 1 : 0;
  wire[SNAPSHOT_INDEX.FINISH_REASON] = snapshot.finishReason;
  wire[SNAPSHOT_INDEX.WINNER_ID] = snapshot.winnerId;
  wire[SNAPSHOT_INDEX.WORLD] = compactWorld(snapshot.world);
  wire[SNAPSHOT_INDEX.ARENA] = compactArena(snapshot.arena);
  wire[SNAPSHOT_INDEX.REMAINING] = snapshot.remaining;
  wire[SNAPSHOT_INDEX.GROUPS] = (snapshot.groups || []).map(compactGroup);
  wire[SNAPSHOT_INDEX.EJECTED] = (snapshot.ejected || []).map(compactEjected);
  wire[SNAPSHOT_INDEX.SAFE_ZONE] = compactSafeZone(snapshot.safeZone);
  wire[SNAPSHOT_INDEX.CONTROL_POINTS] = (snapshot.controlPoints || []).map(compactControlPoint);
  wire[SNAPSHOT_INDEX.TEAMS] = (snapshot.teams || []).map(compactTeam);
  wire[SNAPSHOT_INDEX.OBJECTIVE] = snapshot.objective ?? null;
  wire[SNAPSHOT_INDEX.RANKING] = (snapshot.ranking || []).map(compactRanking);
  wire[SNAPSHOT_INDEX.EVENTS] = snapshot.events || [];
  wire[SNAPSHOT_INDEX.FOOD_REVISION] = snapshot.foodRevision;
  wire[SNAPSHOT_INDEX.VIRUS_REVISION] = snapshot.virusRevision;
  wire[SNAPSHOT_INDEX.FOODS] = Array.isArray(snapshot.foods) ? snapshot.foods.map(compactFood) : null;
  wire[SNAPSHOT_INDEX.FOOD_BASELINE] = snapshot.foodBaseline ? 1 : null;
  wire[SNAPSHOT_INDEX.VIRUSES] = Array.isArray(snapshot.viruses) ? snapshot.viruses.map(compactVirus) : null;
  wire[SNAPSHOT_INDEX.VIRUS_BASELINE] = snapshot.virusBaseline ? 1 : null;
  wire[SNAPSHOT_INDEX.FOOD_DELTA] = compactDelta(snapshot.foodDelta, compactFood);
  wire[SNAPSHOT_INDEX.VIRUS_DELTA] = compactDelta(snapshot.virusDelta, compactVirus);
  wire[SNAPSHOT_INDEX.MATCH_ID] = snapshot.matchId ?? null;
  wire[SNAPSHOT_INDEX.BASELINE_ID] = snapshot.baselineId ?? null;
  wire[SNAPSHOT_INDEX.CONFIG_VERSION] = snapshot.configVersion ?? null;

  return { v: SNAPSHOT_WIRE_VERSION, s: wire };
}
