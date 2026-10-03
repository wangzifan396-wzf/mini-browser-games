(function attachLocalPredictor(globalScope) {
  "use strict";

  const gameplayCore = globalScope.ScaGameplayCore;
  if (!gameplayCore) throw new Error("共享玩法内核未加载");
  const STEP_SECONDS = 1 / 60;
  const MAX_PREDICTION_MS = 180;
  const MODE_SPEED = gameplayCore.MODE_SPEED;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function finite(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function predictLocalPlayer(snapshot, options = {}) {
    if (!snapshot || !Array.isArray(snapshot.groups)) return snapshot;
    const playerId = String(options.playerId || "");
    const playerIndex = snapshot.groups.findIndex(group => group.id === playerId);
    const source = snapshot.groups[playerIndex];
    if (playerIndex < 0 || !source?.cells?.length) return snapshot;

    const authoritativeTime = finite(snapshot.serverTime, 0);
    const estimatedServerTime = finite(options.estimatedServerTime, authoritativeTime);
    const targetServerTime = authoritativeTime + clamp(estimatedServerTime - authoritativeTime, 0, MAX_PREDICTION_MS);
    const aheadMs = targetServerTime - authoritativeTime;
    if (aheadMs < 1) return snapshot;

    const arena = snapshot.arena || {
      x: 0,
      y: 0,
      width: finite(snapshot.world?.width, gameplayCore.WORLD_RULES.size),
      height: finite(snapshot.world?.height, gameplayCore.WORLD_RULES.size)
    };
    let direction = options.currentInput || { dx: 0, dy: 0 };
    const estimateInputTime = typeof options.estimateInputTime === "function"
      ? options.estimateInputTime
      : input => input.serverTime;
    const ackInputSeq = finite(source.ackInputSeq, -1);
    const timedInputs = (options.inputHistory || [])
      .filter(input => finite(input.seq, 0) > ackInputSeq)
      .map(input => ({ ...input, serverTime: finite(estimateInputTime(input), NaN) }))
      .filter(input => Number.isFinite(input.serverTime))
      .sort((left, right) => left.serverTime - right.serverTime || finite(left.seq) - finite(right.seq));

    for (const input of timedInputs) {
      if (input.serverTime > authoritativeTime) break;
      direction = input;
    }

    const segments = [];
    let cursor = authoritativeTime;
    for (const input of timedInputs) {
      if (input.serverTime <= cursor || input.serverTime > targetServerTime) continue;
      segments.push({
        milliseconds: input.serverTime - cursor,
        dx: finite(direction.dx),
        dy: finite(direction.dy),
        targetX: finite(direction.targetX, NaN),
        targetY: finite(direction.targetY, NaN)
      });
      cursor = input.serverTime;
      direction = input;
    }
    if (cursor < targetServerTime) {
      segments.push({
        milliseconds: targetServerTime - cursor,
        dx: finite(direction.dx),
        dy: finite(direction.dy),
        targetX: finite(direction.targetX, NaN),
        targetY: finite(direction.targetY, NaN)
      });
    }

    const modeSpeed = finite(snapshot.objective?.movementSpeedScale, MODE_SPEED[snapshot.mode] || 1);
    const predicted = {
      ...source,
      locallyPredictedMs: aheadMs,
      cells: source.cells.map(cell => {
        const result = { ...cell, vx: finite(cell.vx), vy: finite(cell.vy) };
        for (const segment of segments) {
          let remaining = segment.milliseconds / 1000;
          while (remaining > 0.0001) {
            const dt = Math.min(STEP_SECONDS, remaining);
            const target = gameplayCore.targetFromInput(segment, result);
            const movement = gameplayCore.movementStep(result, target, dt, {
              speedScale: modeSpeed,
              steerRate: gameplayCore.MOVEMENT.playerSteerRate
            });
            result.vx = movement.vx;
            result.vy = movement.vy;
            result.x = clamp(
              movement.x,
              finite(arena.x) + finite(result.radius),
              finite(arena.x) + finite(arena.width) - finite(result.radius)
            );
            result.y = clamp(
              movement.y,
              finite(arena.y) + finite(result.radius),
              finite(arena.y) + finite(arena.height) - finite(result.radius)
            );
            remaining -= dt;
          }
        }
        return result;
      })
    };

    const groups = snapshot.groups.slice();
    groups[playerIndex] = predicted;
    return { ...snapshot, groups };
  }

  globalScope.ScaLocalPredictor = Object.freeze({
    predictLocalPlayer,
    constants: Object.freeze({ STEP_SECONDS, MAX_PREDICTION_MS, MODE_SPEED })
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
