(function attachSnapshotWire(globalScope) {
  "use strict";

  const VERSION = 2;
  const SNAPSHOT = Object.freeze({
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
  const WORLD = Object.freeze({ WIDTH: 0, HEIGHT: 1, LENGTH: 2 });
  const ARENA = Object.freeze({ TYPE: 0, X: 1, Y: 2, WIDTH: 3, HEIGHT: 4, LENGTH: 5 });
  const SAFE_ZONE = Object.freeze({ X: 0, Y: 1, RADIUS: 2, TARGET_RADIUS: 3, LENGTH: 4 });
  const GROUP = Object.freeze({
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
  const GROUP_FLAGS = Object.freeze({ HUMAN: 1, CONNECTED: 2, DEAD: 4, ELIMINATED: 8 });
  const CELL = Object.freeze({ ID: 0, X: 1, Y: 2, VX: 3, VY: 4, RADIUS: 5, LENGTH: 6 });
  const EJECTED = Object.freeze({ ID: 0, X: 1, Y: 2, VX: 3, VY: 4, RADIUS: 5, COLOR: 6, LENGTH: 7 });
  const FOOD = Object.freeze({ ID: 0, X: 1, Y: 2, RADIUS: 3, COLOR: 4, LENGTH: 5 });
  const VIRUS = Object.freeze({ ID: 0, X: 1, Y: 2, RADIUS: 3, COLOR: 4, SPORE: 5, LENGTH: 6 });
  const DELTA = Object.freeze({ FROM_REVISION: 0, TO_REVISION: 1, ADDED: 2, REMOVED: 3, UPDATED: 4, LENGTH: 5 });
  const RANKING = Object.freeze({
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
  const RANKING_FLAGS = Object.freeze({ CONNECTED: 1, HUMAN: 2, ELIMINATED: 4 });
  const TEAM = Object.freeze({ ID: 0, TEAM: 1, NAME: 2, COLOR: 3, MASS: 4, KILLS: 5, SCORE: 6, ALIVE: 7, LENGTH: 8 });
  const CONTROL_POINT = Object.freeze({
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

  function hasFlag(flags, bit) {
    return (Number(flags) & bit) !== 0;
  }

  function list(value, decoder) {
    return Array.isArray(value) ? value.map(decoder) : [];
  }

  function decodeWorld(value) {
    return Array.isArray(value) ? { width: value[WORLD.WIDTH], height: value[WORLD.HEIGHT] } : null;
  }

  function decodeArena(value) {
    return Array.isArray(value) ? {
      type: value[ARENA.TYPE],
      x: value[ARENA.X],
      y: value[ARENA.Y],
      width: value[ARENA.WIDTH],
      height: value[ARENA.HEIGHT]
    } : null;
  }

  function decodeSafeZone(value) {
    return Array.isArray(value) ? {
      x: value[SAFE_ZONE.X],
      y: value[SAFE_ZONE.Y],
      radius: value[SAFE_ZONE.RADIUS],
      targetRadius: value[SAFE_ZONE.TARGET_RADIUS]
    } : null;
  }

  function decodeCell(value) {
    const radius = value[CELL.RADIUS];
    return {
      id: value[CELL.ID],
      x: value[CELL.X],
      y: value[CELL.Y],
      vx: value[CELL.VX],
      vy: value[CELL.VY],
      radius,
      mass: (radius / 4) ** 2
    };
  }

  function decodeGroup(value) {
    const flags = value[GROUP.FLAGS];
    return {
      id: value[GROUP.ID],
      name: value[GROUP.NAME],
      color: value[GROUP.COLOR],
      human: hasFlag(flags, GROUP_FLAGS.HUMAN),
      connected: hasFlag(flags, GROUP_FLAGS.CONNECTED),
      dead: hasFlag(flags, GROUP_FLAGS.DEAD),
      eliminated: hasFlag(flags, GROUP_FLAGS.ELIMINATED),
      kills: value[GROUP.KILLS],
      deaths: value[GROUP.DEATHS],
      lives: value[GROUP.LIVES],
      team: value[GROUP.TEAM],
      role: value[GROUP.ROLE],
      ackInputSeq: value[GROUP.ACK_INPUT_SEQ],
      respawnRemaining: value[GROUP.RESPAWN_REMAINING],
      quickMergeCooldown: value[GROUP.QUICK_MERGE_COOLDOWN],
      specialCooldown: value[GROUP.SPECIAL_COOLDOWN],
      rank: value[GROUP.RANK],
      mass: value[GROUP.MASS],
      cells: list(value[GROUP.CELLS], decodeCell)
    };
  }

  function decodeEjected(value) {
    return {
      id: value[EJECTED.ID],
      x: value[EJECTED.X],
      y: value[EJECTED.Y],
      vx: value[EJECTED.VX],
      vy: value[EJECTED.VY],
      radius: value[EJECTED.RADIUS],
      color: value[EJECTED.COLOR]
    };
  }

  function decodeFood(value) {
    return {
      id: value[FOOD.ID],
      x: value[FOOD.X],
      y: value[FOOD.Y],
      radius: value[FOOD.RADIUS],
      color: value[FOOD.COLOR]
    };
  }

  function decodeVirus(value) {
    return {
      id: value[VIRUS.ID],
      x: value[VIRUS.X],
      y: value[VIRUS.Y],
      radius: value[VIRUS.RADIUS],
      color: value[VIRUS.COLOR],
      spore: Boolean(value[VIRUS.SPORE])
    };
  }

  function decodeDelta(value, decoder) {
    if (!Array.isArray(value)) return null;
    const result = {
      fromRevision: value[DELTA.FROM_REVISION],
      toRevision: value[DELTA.TO_REVISION]
    };
    if (Array.isArray(value[DELTA.ADDED])) result.added = value[DELTA.ADDED].map(decoder);
    if (Array.isArray(value[DELTA.REMOVED])) result.removed = value[DELTA.REMOVED].slice();
    if (Array.isArray(value[DELTA.UPDATED])) result.updated = value[DELTA.UPDATED].map(decoder);
    return result;
  }

  function decodeRanking(value) {
    const flags = value[RANKING.FLAGS];
    return {
      id: value[RANKING.ID],
      name: value[RANKING.NAME],
      mass: value[RANKING.MASS],
      kills: value[RANKING.KILLS],
      deaths: value[RANKING.DEATHS],
      lives: value[RANKING.LIVES],
      connected: hasFlag(flags, RANKING_FLAGS.CONNECTED),
      human: hasFlag(flags, RANKING_FLAGS.HUMAN),
      color: value[RANKING.COLOR],
      team: value[RANKING.TEAM],
      teamRank: value[RANKING.TEAM_RANK],
      role: value[RANKING.ROLE],
      eliminated: hasFlag(flags, RANKING_FLAGS.ELIMINATED),
      score: value[RANKING.SCORE]
    };
  }

  function decodeTeam(value) {
    return {
      id: value[TEAM.ID],
      team: value[TEAM.TEAM],
      name: value[TEAM.NAME],
      color: value[TEAM.COLOR],
      mass: value[TEAM.MASS],
      kills: value[TEAM.KILLS],
      score: value[TEAM.SCORE],
      alive: value[TEAM.ALIVE]
    };
  }

  function decodeControlPoint(value) {
    return {
      id: value[CONTROL_POINT.ID],
      x: value[CONTROL_POINT.X],
      y: value[CONTROL_POINT.Y],
      radius: value[CONTROL_POINT.RADIUS],
      owner: value[CONTROL_POINT.OWNER],
      captureTeam: value[CONTROL_POINT.CAPTURE_TEAM],
      progress: value[CONTROL_POINT.PROGRESS],
      contested: Boolean(value[CONTROL_POINT.CONTESTED])
    };
  }

  function decodeSnapshot(packet) {
    if (!packet || packet.v !== VERSION || !Array.isArray(packet.s) || packet.s.length < SNAPSHOT.LENGTH) return packet;
    const value = packet.s;
    const snapshot = {
      tick: value[SNAPSHOT.TICK],
      serverTime: value[SNAPSHOT.SERVER_TIME],
      serverHz: value[SNAPSHOT.SERVER_HZ],
      mode: value[SNAPSHOT.MODE],
      phase: value[SNAPSHOT.PHASE],
      finished: Boolean(value[SNAPSHOT.FINISHED]),
      finishReason: value[SNAPSHOT.FINISH_REASON],
      winnerId: value[SNAPSHOT.WINNER_ID],
      world: decodeWorld(value[SNAPSHOT.WORLD]),
      arena: decodeArena(value[SNAPSHOT.ARENA]),
      remaining: value[SNAPSHOT.REMAINING],
      groups: list(value[SNAPSHOT.GROUPS], decodeGroup),
      ejected: list(value[SNAPSHOT.EJECTED], decodeEjected),
      safeZone: decodeSafeZone(value[SNAPSHOT.SAFE_ZONE]),
      controlPoints: list(value[SNAPSHOT.CONTROL_POINTS], decodeControlPoint),
      teams: list(value[SNAPSHOT.TEAMS], decodeTeam),
      objective: value[SNAPSHOT.OBJECTIVE],
      ranking: list(value[SNAPSHOT.RANKING], decodeRanking),
      events: Array.isArray(value[SNAPSHOT.EVENTS]) ? value[SNAPSHOT.EVENTS] : [],
      foodRevision: value[SNAPSHOT.FOOD_REVISION],
      virusRevision: value[SNAPSHOT.VIRUS_REVISION],
      matchId: value[SNAPSHOT.MATCH_ID],
      baselineId: value[SNAPSHOT.BASELINE_ID],
      configVersion: value[SNAPSHOT.CONFIG_VERSION]
    };
    if (Object.prototype.hasOwnProperty.call(packet, "type")) snapshot.type = packet.type;
    if (Array.isArray(value[SNAPSHOT.FOODS])) snapshot.foods = value[SNAPSHOT.FOODS].map(decodeFood);
    if (value[SNAPSHOT.FOOD_BASELINE] != null) snapshot.foodBaseline = Boolean(value[SNAPSHOT.FOOD_BASELINE]);
    if (Array.isArray(value[SNAPSHOT.VIRUSES])) snapshot.viruses = value[SNAPSHOT.VIRUSES].map(decodeVirus);
    if (value[SNAPSHOT.VIRUS_BASELINE] != null) snapshot.virusBaseline = Boolean(value[SNAPSHOT.VIRUS_BASELINE]);
    const foodDelta = decodeDelta(value[SNAPSHOT.FOOD_DELTA], decodeFood);
    const virusDelta = decodeDelta(value[SNAPSHOT.VIRUS_DELTA], decodeVirus);
    if (foodDelta) snapshot.foodDelta = foodDelta;
    if (virusDelta) snapshot.virusDelta = virusDelta;
    return snapshot;
  }

  globalScope.ScaSnapshotWire = Object.freeze({
    version: VERSION,
    decodeSnapshot,
    indexes: Object.freeze({
      snapshot: SNAPSHOT,
      world: WORLD,
      arena: ARENA,
      safeZone: SAFE_ZONE,
      group: GROUP,
      cell: CELL,
      ejected: EJECTED,
      food: FOOD,
      virus: VIRUS,
      delta: DELTA,
      ranking: RANKING,
      team: TEAM,
      controlPoint: CONTROL_POINT
    })
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
