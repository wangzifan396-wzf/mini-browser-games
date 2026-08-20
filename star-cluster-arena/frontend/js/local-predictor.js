(function attachLocalPredictor(globalScope) {
  "use strict";

  const STEP_SECONDS = 0.05;
  const MAX_PREDICTION_MS = 180;
  const MODE_SPEED = Object.freeze({ blitz: 1.16, spore: 1.06, giant: 0.88 });

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
      width: finite(snapshot.world?.width, 5200),
      height: finite(snapshot.world?.height, 5200)
    };
    let direction = options.currentInput || { dx: 0, dy: 0 };
    const estimateInputTime = typeof options.estimateInputTime === "function"
      ? options.estimateInputTime
      : input => input.serverTime;
    const timedInputs = (options.inputHistory || [])
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
      segments.push({ milliseconds: input.serverTime - cursor, dx: finite(direction.dx), dy: finite(direction.dy) });
      cursor = input.serverTime;
      direction = input;
    }
    if (cursor < targetServerTime) {
      segments.push({ milliseconds: targetServerTime - cursor, dx: finite(direction.dx), dy: finite(direction.dy) });
    }

    const modeSpeed = MODE_SPEED[snapshot.mode] || 1;
    const predicted = {
      ...source,
      locallyPredictedMs: aheadMs,
      cells: source.cells.map(cell => {
        const result = { ...cell, vx: finite(cell.vx), vy: finite(cell.vy) };
        for (const segment of segments) {
          let remaining = segment.milliseconds / 1000;
          while (remaining > 0.0001) {
            const dt = Math.min(STEP_SECONDS, remaining);
            const tickFraction = dt / STEP_SECONDS;
            const response = 1 - Math.pow(0.8, tickFraction);
            const drag = Math.pow(0.965, tickFraction);
            const baseSpeed = 330 / (1 + finite(result.radius, 10) / 92) * modeSpeed;
            result.vx += (clamp(finite(segment.dx), -1, 1) * baseSpeed - result.vx) * response;
            result.vy += (clamp(finite(segment.dy), -1, 1) * baseSpeed - result.vy) * response;
            result.vx *= drag;
            result.vy *= drag;
            result.x = clamp(
              finite(result.x) + result.vx * dt,
              finite(arena.x) + finite(result.radius),
              finite(arena.x) + finite(arena.width) - finite(result.radius)
            );
            result.y = clamp(
              finite(result.y) + result.vy * dt,
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
