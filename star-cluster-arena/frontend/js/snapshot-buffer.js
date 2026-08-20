(function attachSnapshotBuffer(globalScope) {
  "use strict";

  const DEFAULT_CAPACITY = 32;
  const DEFAULT_INTERVAL_MS = 100;
  const MIN_DELAY_MS = 80;
  const MAX_DELAY_MS = 180;
  const MAX_EXTRAPOLATION_MS = 50;
  const INTERPOLATED_FIELDS = Object.freeze(["x", "y", "radius", "vx", "vy"]);

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function finite(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function localNow() {
    return globalScope.performance?.now?.() ?? Date.now();
  }

  class RingBuffer {
    constructor(capacity) {
      this.capacity = Math.max(4, Math.floor(finite(capacity, DEFAULT_CAPACITY)));
      this.values = new Array(this.capacity);
      this.start = 0;
      this.length = 0;
    }

    clear() {
      this.values.fill(undefined);
      this.start = 0;
      this.length = 0;
    }

    push(value) {
      if (this.length < this.capacity) {
        this.values[(this.start + this.length) % this.capacity] = value;
        this.length += 1;
        return;
      }
      this.values[this.start] = value;
      this.start = (this.start + 1) % this.capacity;
    }

    at(index) {
      if (index < 0) index = this.length + index;
      if (index < 0 || index >= this.length) return undefined;
      return this.values[(this.start + index) % this.capacity];
    }

    toArray() {
      return Array.from({ length: this.length }, (_, index) => this.at(index));
    }
  }

  function entityMap(values) {
    return new Map((Array.isArray(values) ? values : []).map(value => [value.id, value]));
  }

  function interpolateEntity(before, after, alpha) {
    if (!before) return { ...after };
    const result = { ...after };
    for (const field of INTERPOLATED_FIELDS) {
      if (Number.isFinite(before[field]) && Number.isFinite(after[field])) {
        result[field] = before[field] + (after[field] - before[field]) * alpha;
      }
    }
    return result;
  }

  function interpolateEntityList(beforeValues, afterValues, alpha) {
    const beforeById = entityMap(beforeValues);
    const result = (Array.isArray(afterValues) ? afterValues : []).map(after =>
      interpolateEntity(beforeById.get(after.id), after, alpha)
    );

    // Keep an entity that disappears in the later state until the interpolation
    // cursor actually reaches that state. This avoids making eaten cells vanish
    // one full snapshot interval too early.
    if (alpha < 1) {
      const afterIds = new Set(result.map(value => value.id));
      for (const before of Array.isArray(beforeValues) ? beforeValues : []) {
        if (!afterIds.has(before.id)) result.push({ ...before });
      }
    }
    return result;
  }

  function interpolateGroups(beforeGroups, afterGroups, alpha) {
    const beforeById = entityMap(beforeGroups);
    const result = (Array.isArray(afterGroups) ? afterGroups : []).map(after => {
      const before = beforeById.get(after.id);
      return {
        ...after,
        cells: interpolateEntityList(before?.cells, after.cells, alpha)
      };
    });
    if (alpha < 1) {
      const afterIds = new Set(result.map(value => value.id));
      for (const before of Array.isArray(beforeGroups) ? beforeGroups : []) {
        if (!afterIds.has(before.id)) result.push({ ...before, cells: (before.cells || []).map(cell => ({ ...cell })) });
      }
    }
    return result;
  }

  function interpolateSnapshots(before, after, serverTime) {
    const span = Math.max(0.0001, after.serverTime - before.serverTime);
    const alpha = clamp((serverTime - before.serverTime) / span, 0, 1);
    return {
      ...after,
      serverTime,
      interpolationAlpha: alpha,
      groups: interpolateGroups(before.groups, after.groups, alpha),
      ejected: interpolateEntityList(before.ejected, after.ejected, alpha),
      // Foods are discrete authoritative objects. Use the earlier materialized
      // cache until the cursor reaches the delta that added/removed them.
      foods: alpha < 1 ? before.foods : after.foods,
      viruses: alpha < 1 ? before.viruses : after.viruses
    };
  }

  function extrapolateEntity(entity, milliseconds) {
    const seconds = milliseconds / 1000;
    const result = { ...entity };
    if (Number.isFinite(entity.x) && Number.isFinite(entity.vx)) result.x = entity.x + entity.vx * seconds;
    if (Number.isFinite(entity.y) && Number.isFinite(entity.vy)) result.y = entity.y + entity.vy * seconds;
    return result;
  }

  function extrapolateSnapshot(snapshot, milliseconds) {
    const extrapolatedMs = clamp(milliseconds, 0, MAX_EXTRAPOLATION_MS);
    return {
      ...snapshot,
      serverTime: snapshot.serverTime + extrapolatedMs,
      extrapolatedMs,
      groups: (snapshot.groups || []).map(group => ({
        ...group,
        cells: (group.cells || []).map(cell => extrapolateEntity(cell, extrapolatedMs))
      })),
      ejected: (snapshot.ejected || []).map(entity => extrapolateEntity(entity, extrapolatedMs))
    };
  }

  function deltaList(delta, primary, alias) {
    const value = delta?.[primary] ?? delta?.[alias];
    return Array.isArray(value) ? value : [];
  }

  class SnapshotBuffer {
    constructor(options = {}) {
      this.capacity = Math.max(4, Math.floor(finite(options.capacity, DEFAULT_CAPACITY)));
      this.minimumDelayMs = clamp(finite(options.minimumDelayMs, MIN_DELAY_MS), MIN_DELAY_MS, MAX_DELAY_MS);
      this.maximumDelayMs = clamp(finite(options.maximumDelayMs, MAX_DELAY_MS), this.minimumDelayMs, MAX_DELAY_MS);
      this.maximumExtrapolationMs = clamp(finite(options.maximumExtrapolationMs, MAX_EXTRAPOLATION_MS), 0, MAX_EXTRAPOLATION_MS);
      this.snapshots = new RingBuffer(this.capacity);
      this.offsetSamples = new RingBuffer(24);
      this.foods = new Map();
      this.viruses = new Map();
      this.resetMetrics();
    }

    resetMetrics() {
      this.clockOffsetMs = null;
      this.lastTransitMs = null;
      this.jitterMs = 0;
      this.serverIntervalMs = DEFAULT_INTERVAL_MS;
      this.receiveIntervalMs = DEFAULT_INTERVAL_MS;
      this.lastReceivedAt = null;
      this.lastServerTime = null;
      this.lastTick = null;
      this.foodRevision = null;
      this.virusRevision = null;
      this.foodDesynced = false;
      this.virusDesynced = false;
      this.baselineDesyncs = 0;
      this.playbackDelayMs = clamp(DEFAULT_INTERVAL_MS * 1.25, this.minimumDelayMs, this.maximumDelayMs);
      this.playbackTime = null;
      this.lastSampledAt = null;
      this.bufferUnderruns = 0;
      this.underrunActive = false;
      this.receivedSnapshots = 0;
      this.rejectedSnapshots = 0;
    }

    clear() {
      this.snapshots.clear();
      this.offsetSamples.clear();
      this.foods.clear();
      this.viruses.clear();
      this.resetMetrics();
    }

    materializeFoods(snapshot) {
      const baseline = Array.isArray(snapshot.foodBaseline)
        ? snapshot.foodBaseline
        : Array.isArray(snapshot.foods) ? snapshot.foods : null;
      if (baseline) {
        this.foods.clear();
        for (const food of baseline) {
          if (food && food.id != null) this.foods.set(food.id, { ...food });
        }
        this.foodRevision = Number.isFinite(Number(snapshot.foodRevision)) ? Number(snapshot.foodRevision) : this.foodRevision;
        this.foodDesynced = false;
      }

      const delta = snapshot.foodDelta;
      const fromRevision = Number(delta?.fromRevision);
      const toRevision = Number(delta?.toRevision);
      if (delta && Number.isFinite(fromRevision) && this.foodRevision != null && fromRevision !== this.foodRevision) {
        if (!this.foodDesynced) this.baselineDesyncs += 1;
        this.foodDesynced = true;
        return [...this.foods.values()];
      }
      if (this.foodDesynced && !baseline) return [...this.foods.values()];
      for (const removed of deltaList(delta, "removed", "remove")) {
        this.foods.delete(typeof removed === "object" ? removed?.id : removed);
      }
      for (const food of [...deltaList(delta, "added", "add"), ...deltaList(delta, "updated", "update")]) {
        if (food && food.id != null) this.foods.set(food.id, { ...food });
      }
      if (delta && Number.isFinite(toRevision)) this.foodRevision = toRevision;
      return [...this.foods.values()];
    }

    materializeViruses(snapshot) {
      const baseline = Array.isArray(snapshot.virusBaseline)
        ? snapshot.virusBaseline
        : Array.isArray(snapshot.viruses) ? snapshot.viruses : null;
      if (baseline) {
        this.viruses.clear();
        for (const virus of baseline) {
          if (virus && virus.id != null) this.viruses.set(virus.id, { ...virus });
        }
        this.virusRevision = Number.isFinite(Number(snapshot.virusRevision)) ? Number(snapshot.virusRevision) : this.virusRevision;
        this.virusDesynced = false;
      }
      const delta = snapshot.virusDelta;
      const fromRevision = Number(delta?.fromRevision);
      const toRevision = Number(delta?.toRevision);
      if (delta && Number.isFinite(fromRevision) && this.virusRevision != null && fromRevision !== this.virusRevision) {
        if (!this.virusDesynced) this.baselineDesyncs += 1;
        this.virusDesynced = true;
        return [...this.viruses.values()];
      }
      if (this.virusDesynced && !baseline) return [...this.viruses.values()];
      for (const removed of deltaList(delta, "removed", "remove")) {
        this.viruses.delete(typeof removed === "object" ? removed?.id : removed);
      }
      for (const virus of [...deltaList(delta, "added", "add"), ...deltaList(delta, "updated", "update")]) {
        if (virus && virus.id != null) this.viruses.set(virus.id, { ...virus });
      }
      if (delta && Number.isFinite(toRevision)) this.virusRevision = toRevision;
      return [...this.viruses.values()];
    }

    updateTiming(serverTime, receivedAt) {
      const transit = receivedAt - serverTime;
      if (this.lastTransitMs != null) {
        // RFC 3550 interarrival jitter estimator: J = J + (|D| - J) / 16.
        const difference = Math.abs(transit - this.lastTransitMs);
        this.jitterMs += (difference - this.jitterMs) / 16;
      }
      this.lastTransitMs = transit;

      const offsetSample = serverTime - receivedAt;
      this.offsetSamples.push(offsetSample);
      const leastDelayedOffset = Math.max(...this.offsetSamples.toArray());
      if (this.clockOffsetMs == null) {
        this.clockOffsetMs = leastDelayedOffset;
      } else {
        // Move toward a newly observed low-delay path reasonably quickly, but
        // decay slowly when congestion makes every recent packet later.
        const amount = leastDelayedOffset >= this.clockOffsetMs ? 0.2 : 0.02;
        this.clockOffsetMs += (leastDelayedOffset - this.clockOffsetMs) * amount;
      }

      if (this.lastReceivedAt != null) {
        const receiveDelta = receivedAt - this.lastReceivedAt;
        if (receiveDelta > 0 && receiveDelta < 5_000) {
          this.receiveIntervalMs += (receiveDelta - this.receiveIntervalMs) / 8;
        }
      }
      if (this.lastServerTime != null) {
        const serverDelta = serverTime - this.lastServerTime;
        if (serverDelta > 0 && serverDelta < 5_000) {
          this.serverIntervalMs += (serverDelta - this.serverIntervalMs) / 8;
        }
      }

      const desiredDelay = clamp(
        this.serverIntervalMs * 1.25 + this.jitterMs * 2.5,
        this.minimumDelayMs,
        this.maximumDelayMs
      );
      this.playbackDelayMs += (desiredDelay - this.playbackDelayMs) / 8;
      this.lastReceivedAt = receivedAt;
      this.lastServerTime = serverTime;
    }

    push(snapshot, receivedAt = localNow()) {
      if (!snapshot || !Number.isFinite(Number(snapshot.serverTime))) {
        this.rejectedSnapshots += 1;
        return false;
      }
      const serverTime = Number(snapshot.serverTime);
      const tick = Number.isFinite(Number(snapshot.tick)) ? Number(snapshot.tick) : null;
      const latest = this.snapshots.at(-1);
      if ((latest && serverTime <= latest.serverTime) || (tick != null && this.lastTick != null && tick <= this.lastTick)) {
        this.rejectedSnapshots += 1;
        return false;
      }

      const materialized = {
        ...snapshot,
        serverTime,
        foods: this.materializeFoods(snapshot),
        viruses: this.materializeViruses(snapshot)
      };
      this.updateTiming(serverTime, Number(receivedAt));
      this.snapshots.push(materialized);
      this.lastTick = tick ?? this.lastTick;
      this.receivedSnapshots += 1;
      return true;
    }

    add(snapshot, receivedAt) {
      return this.push(snapshot, receivedAt);
    }

    estimatedServerTime(at = localNow()) {
      if (this.clockOffsetMs == null) return null;
      return Number(at) + this.clockOffsetMs;
    }

    findBracket(serverTime) {
      let before = this.snapshots.at(0);
      for (let index = 1; index < this.snapshots.length; index += 1) {
        const after = this.snapshots.at(index);
        if (serverTime <= after.serverTime) return { before, after };
        before = after;
      }
      return { before: this.snapshots.at(-1), after: null };
    }

    sampleAtServerTime(serverTime, { countUnderrun = false } = {}) {
      const oldest = this.snapshots.at(0);
      const latest = this.snapshots.at(-1);
      if (!oldest || !latest) return null;
      const target = Number(serverTime);
      if (target <= oldest.serverTime) return { ...oldest, foods: oldest.foods };
      if (target > latest.serverTime) {
        if (countUnderrun && !this.underrunActive) this.bufferUnderruns += 1;
        if (countUnderrun) this.underrunActive = true;
        return extrapolateSnapshot(latest, Math.min(target - latest.serverTime, this.maximumExtrapolationMs));
      }
      if (countUnderrun) this.underrunActive = false;
      const { before, after } = this.findBracket(target);
      if (!after || before === after) return { ...before, foods: before.foods };
      return interpolateSnapshots(before, after, target);
    }

    sample(at = localNow()) {
      const latest = this.snapshots.at(-1);
      const oldest = this.snapshots.at(0);
      if (!latest || !oldest || this.clockOffsetMs == null) return null;
      const sampledAt = Number(at);
      const desiredTime = this.estimatedServerTime(sampledAt) - this.playbackDelayMs;

      if (this.playbackTime == null) {
        this.playbackTime = clamp(desiredTime, oldest.serverTime, latest.serverTime);
      } else {
        const elapsed = clamp(sampledAt - this.lastSampledAt, 0, 250);
        const error = desiredTime - this.playbackTime;
        const playbackRate = clamp(1 + error / 1_000, 0.9, 1.1);
        this.playbackTime += elapsed * playbackRate;
        this.playbackTime = Math.max(oldest.serverTime, this.playbackTime);
        this.playbackTime = Math.min(latest.serverTime + this.maximumExtrapolationMs, this.playbackTime);
      }
      this.lastSampledAt = sampledAt;
      return this.sampleAtServerTime(this.playbackTime, { countUnderrun: true });
    }

    getStats() {
      const latest = this.snapshots.at(-1);
      return {
        snapshotHz: this.receiveIntervalMs > 0 ? 1_000 / this.receiveIntervalMs : 0,
        jitter: this.jitterMs,
        jitterMs: this.jitterMs,
        bufferDelayMs: this.playbackDelayMs,
        bufferDepthMs: latest && this.playbackTime != null ? Math.max(0, latest.serverTime - this.playbackTime) : 0,
        bufferUnderruns: this.bufferUnderruns,
        clockOffsetMs: this.clockOffsetMs,
        queuedSnapshots: this.snapshots.length,
        receivedSnapshots: this.receivedSnapshots,
        rejectedSnapshots: this.rejectedSnapshots,
        baselineDesyncs: this.baselineDesyncs,
        needsBaseline: this.foodDesynced || this.virusDesynced,
        foodRevision: this.foodRevision,
        virusRevision: this.virusRevision,
        latestServerTime: latest?.serverTime ?? null,
        latestTick: latest?.tick ?? null
      };
    }
  }

  const api = Object.freeze({
    SnapshotBuffer,
    interpolateSnapshots,
    constants: Object.freeze({
      DEFAULT_CAPACITY,
      MIN_DELAY_MS,
      MAX_DELAY_MS,
      MAX_EXTRAPOLATION_MS
    })
  });

  globalScope.ScaSnapshotBuffer = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
