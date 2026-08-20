import { getModeConfig, normalizeMode } from "./modes.mjs";

const WORLD_SIZE = 5200;
const SERVER_HZ = 20;
const STEP_SECONDS = 1 / SERVER_HZ;
const MAX_CELLS = 64;
const DEFAULT_MAX_CELLS = 16;
const MIN_CELL_MASS = 10;
const SPLIT_MIN_MASS = 36;
const EJECT_MIN_MASS = 32;
const FOOD_BUCKET_SIZE = 180;
const FULL_FOOD_SNAPSHOT_INTERVAL_TICKS = SERVER_HZ * 5;
const COLORS = ["#44d7b6", "#67e8f9", "#ffd166", "#ff7a90", "#a78bfa", "#f59e0b", "#7dd3fc", "#f472b6"];
const TEAM_COLORS = ["#44d7b6", "#ff7a90", "#67e8f9", "#ffd166", "#a78bfa", "#f59e0b", "#7dd3fc", "#f472b6", "#9cff6e", "#fb7185"];
const TEAM_NAMES = ["青曜", "赤潮", "蓝星", "金芒", "紫穹", "橙焰", "天河", "绯月", "翠光", "霜晶"];
const BOT_NAMES = ["青柠", "星火", "乌龙", "极光", "海盐", "月影", "薄荷", "北辰", "流星", "夜航", "银杏", "木星"];
const EVENT_ROTATION = [
  { key: "harvest", label: "丰收潮汐", durationTicks: SERVER_HZ * 10, foodScale: 1.35 },
  { key: "rush", label: "轻盈时间", durationTicks: SERVER_HZ * 9, speedScale: 1.14 },
  { key: "merge", label: "极速合球", durationTicks: SERVER_HZ * 9, mergeScale: 0.5 }
];

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function radiusFromMass(mass) {
  return Math.max(5, Math.sqrt(Math.max(1, mass)) * 4);
}

function rounded(value) {
  return Math.round(value * 10) / 10;
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function clonePublic(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function safeNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export class AuthoritativeSimulation {
  constructor({ players, botCount = 0, seed = 1, now = Date.now(), durationSeconds, mode = "solo" } = {}) {
    this.seed = seed >>> 0;
    this.random = mulberry32(this.seed);
    this.mode = normalizeMode(mode);
    this.config = getModeConfig(this.mode);
    this.startedAt = now;
    this.serverTime = now;
    this.durationSeconds = Math.max(0, safeNumber(durationSeconds, this.config.durationSeconds));
    this.tick = 0;
    this.finished = false;
    this.finishReason = "";
    this.winnerId = null;
    this.entitySequence = 0;
    this.groups = [];
    this.foods = [];
    this.foodGrid = new Map();
    this.ejected = [];
    this.viruses = [];
    this.events = [];
    this.foodRevision = 0;
    this.foodDeltaFromRevision = 0;
    this.foodChangedThisTick = false;
    this.foodAdded = new Map();
    this.foodRemoved = new Set();
    this.virusRevision = 0;
    this.virusDeltaFromRevision = 0;
    this.virusChangedThisTick = false;
    this.virusAdded = new Map();
    this.virusRemoved = new Set();
    this.inStep = false;
    this.activeEvent = null;
    this.nextEventTick = SERVER_HZ * 16;
    this.eventSequence = 0;
    this.teamScores = new Map();
    this.domination = null;
    this.safeZone = null;
    this.controlPoints = [];
    this.arena = this.createArena();

    const humans = Array.isArray(players) ? players : [];
    const minimumBots = Math.max(0, Number(this.config.minimumBots) || 0);
    const totalBots = Math.max(minimumBots, Math.max(0, Math.floor(Number(botCount) || 0)));
    const participants = [
      ...humans.map(player => ({
        id: player.id,
        name: player.name,
        human: true,
        connected: player.connected !== false,
        role: "player"
      })),
      ...Array.from({ length: totalBots }, (_, index) => ({
        id: `bot-${index + 1}`,
        name: BOT_NAMES[index % BOT_NAMES.length] + (index >= BOT_NAMES.length ? String(Math.floor(index / BOT_NAMES.length) + 1) : ""),
        human: false,
        connected: true,
        role: this.mode === "demon"
          ? (index === 0 ? "boss" : index <= (this.config.demon?.maximumMinions || 3) ? "minion" : "ally")
          : "player"
      }))
    ];
    this.teamCount = this.resolveTeamCount(participants.length);

    participants.forEach((participant, index) => {
      const team = this.teamForParticipant(participant, index, humans.length);
      const color = team == null ? COLORS[index % COLORS.length] : TEAM_COLORS[team % TEAM_COLORS.length];
      this.groups.push(this.createGroup({ ...participant, team, color, index }));
      if (team != null && !this.teamScores.has(team)) this.teamScores.set(team, 0);
    });

    this.initializeObjectives();
    this.foodTargetBase = clamp(Math.round((420 + this.groups.length * 35) * (this.config.foodScale || 1)), 420, 900);
    while (this.foods.length < this.foodTargetBase) this.spawnFood({ track: false });
    this.foodRevision = 1;
    this.foodDeltaFromRevision = this.foodRevision;
    this.foodAdded.clear();
    this.foodRemoved.clear();
    this.initializeViruses();
    this.virusRevision = this.viruses.length ? 1 : 0;
    this.virusDeltaFromRevision = this.virusRevision;
    this.virusAdded.clear();
    this.virusRemoved.clear();
  }

  createArena() {
    const rectangle = this.config.rectArena;
    if (!rectangle) return { type: "rect", x: 0, y: 0, width: WORLD_SIZE, height: WORLD_SIZE };
    const width = WORLD_SIZE * clamp(rectangle.widthScale || 0.72, 0.45, 1);
    const height = WORLD_SIZE * clamp(rectangle.heightScale || 0.72, 0.45, 1);
    return {
      type: "rect",
      x: (WORLD_SIZE - width) / 2,
      y: (WORLD_SIZE - height) / 2,
      width,
      height
    };
  }

  resolveTeamCount(totalParticipants) {
    if (this.mode === "demon") return 2;
    const configured = Math.max(0, Number(this.config.teams) || 0);
    if (!configured) return 0;
    if (this.mode === "control") return configured;
    const teamSize = Math.max(1, Number(this.config.teamSize) || 4);
    return clamp(Math.ceil(totalParticipants / teamSize), 2, configured);
  }

  teamForParticipant(participant, index, humanCount) {
    if (!this.teamCount) return null;
    if (this.mode === "demon") return participant.human || participant.role === "ally" ? 0 : 1;
    if (this.mode === "control") return index % this.teamCount;
    if (index < humanCount) return index % this.teamCount;
    return index % this.teamCount;
  }

  initializeObjectives() {
    const zone = this.config.safeZone;
    if (zone) {
      this.safeZone = {
        x: WORLD_SIZE / 2,
        y: WORLD_SIZE / 2,
        radius: WORLD_SIZE * (zone.startRadius || 0.48),
        startRadius: WORLD_SIZE * (zone.startRadius || 0.48),
        targetRadius: WORLD_SIZE * (zone.targetRadius || zone.startRadius || 0.28),
        shrinkStartSeconds: Math.max(0, zone.shrinkStartSeconds || 0),
        shrinkEndSeconds: Math.max(1, zone.shrinkEndSeconds || this.durationSeconds || 300),
        damagePerSecond: Math.max(0.01, zone.damagePerSecond || 0.1),
        static: Boolean(zone.static)
      };
    }
    if (this.config.control) {
      const radius = 300;
      this.controlPoints = [
        { id: "A", x: WORLD_SIZE * 0.3, y: WORLD_SIZE * 0.36, radius, owner: null, captureTeam: null, progress: 0, contested: false },
        { id: "B", x: WORLD_SIZE * 0.7, y: WORLD_SIZE * 0.36, radius, owner: null, captureTeam: null, progress: 0, contested: false },
        { id: "C", x: WORLD_SIZE * 0.5, y: WORLD_SIZE * 0.7, radius, owner: null, captureTeam: null, progress: 0, contested: false }
      ];
    }
    if (this.config.domination || this.config.supremacy) {
      const rule = this.config.domination || this.config.supremacy;
      this.domination = {
        leaderId: null,
        share: 0,
        progressSeconds: 0,
        targetShare: rule.share || rule.massShare || 0.72,
        holdSeconds: rule.holdSeconds || 5,
        graceSeconds: rule.graceSeconds || 0,
        leadRatio: rule.leadRatio || 1
      };
    }
  }

  initializeViruses() {
    const target = Math.max(0, Math.min(92, Number(this.config.viruses?.count) || 0));
    while (this.viruses.length < target) this.spawnVirus({ track: false });
  }

  nextEntityId(prefix) {
    this.entitySequence += 1;
    return `${prefix}-${this.entitySequence}`;
  }

  randomBetween(minimum, maximum) {
    return minimum + this.random() * (maximum - minimum);
  }

  randomPoint(margin = 120) {
    const left = this.arena.x + margin;
    const right = this.arena.x + this.arena.width - margin;
    const top = this.arena.y + margin;
    const bottom = this.arena.y + this.arena.height - margin;
    return {
      x: this.randomBetween(Math.min(left, right), Math.max(left, right)),
      y: this.randomBetween(Math.min(top, bottom), Math.max(top, bottom))
    };
  }

  teamSpawnPoint(team) {
    if (team == null || !this.teamCount) return this.randomPoint(360);
    const angle = (Math.PI * 2 * team) / this.teamCount - Math.PI / 2;
    const distance = Math.min(this.arena.width, this.arena.height) * 0.31;
    return {
      x: clamp(WORLD_SIZE / 2 + Math.cos(angle) * distance + this.randomBetween(-120, 120), this.arena.x + 180, this.arena.x + this.arena.width - 180),
      y: clamp(WORLD_SIZE / 2 + Math.sin(angle) * distance + this.randomBetween(-120, 120), this.arena.y + 180, this.arena.y + this.arena.height - 180)
    };
  }

  startMassForRole(role) {
    if (role === "boss") return this.config.demon?.bossMass || 8500;
    if (role === "minion") return this.config.demon?.minionMass || 850;
    return this.config.startMass || 160;
  }

  createCell(group, x, y, mass = 130) {
    return {
      id: this.nextEntityId("cell"),
      groupId: group.id,
      x,
      y,
      vx: 0,
      vy: 0,
      mass,
      radius: radiusFromMass(mass),
      mergeTicks: 0,
      dead: false
    };
  }

  createGroup({ id, name, human, connected, color, team, role, index }) {
    const point = this.teamSpawnPoint(team);
    const lives = Math.max(1, Number(this.config.lives) || 1);
    const group = {
      id,
      name,
      human,
      connected,
      color,
      team,
      role,
      index,
      cells: [],
      input: { seq: 0, dx: 0, dy: 0, pendingSplit: false, eject: false, pendingQuickMerge: false, pendingSpecial: false },
      ai: { targetX: point.x, targetY: point.y, thinkTicks: 0 },
      kills: 0,
      deaths: 0,
      lives,
      dead: false,
      eliminated: false,
      respawnTick: 0,
      ejectCooldown: 0,
      quickMergeCooldown: 0,
      specialCooldown: 0,
      zoneExposureTicks: 0,
      bossAbilityTick: role === "boss" ? SERVER_HZ * 8 : 0
    };
    group.cells.push(this.createCell(group, point.x, point.y, this.startMassForRole(role)));
    return group;
  }

  maxCellsForGroup(group) {
    if (group.role === "boss") return 1;
    return clamp(Number(this.config.maxCells) || DEFAULT_MAX_CELLS, 1, MAX_CELLS);
  }

  foodKey(x, y) {
    return `${Math.floor(x / FOOD_BUCKET_SIZE)}:${Math.floor(y / FOOD_BUCKET_SIZE)}`;
  }

  addFoodToGrid(food) {
    const key = this.foodKey(food.x, food.y);
    let bucket = this.foodGrid.get(key);
    if (!bucket) {
      bucket = new Set();
      this.foodGrid.set(key, bucket);
    }
    bucket.add(food);
    food.gridKey = key;
  }

  publicFood(food) {
    return { id: food.id, x: rounded(food.x), y: rounded(food.y), radius: rounded(food.radius), color: food.color };
  }

  removeFood(food, { track = true } = {}) {
    const bucket = this.foodGrid.get(food.gridKey);
    if (bucket) {
      bucket.delete(food);
      if (!bucket.size) this.foodGrid.delete(food.gridKey);
    }
    const index = this.foods.indexOf(food);
    if (index >= 0) this.foods.splice(index, 1);
    if (!track) return;
    this.markFoodChanged();
    if (this.foodAdded.delete(food.id)) return;
    this.foodRemoved.add(food.id);
  }

  spawnFood({ track = true } = {}) {
    const point = this.randomPoint(45);
    const massScale = this.config.foodMassScale || 1;
    const mass = this.randomBetween(2.3, 5.4) * massScale;
    const food = {
      id: this.nextEntityId("food"),
      x: point.x,
      y: point.y,
      mass,
      radius: this.randomBetween(4, 6.4) * Math.sqrt(massScale),
      color: Math.floor(this.random() * COLORS.length)
    };
    this.foods.push(food);
    this.addFoodToGrid(food);
    if (track) {
      this.markFoodChanged();
      this.foodAdded.set(food.id, food);
    }
    return food;
  }

  publicVirus(virus) {
    return {
      id: virus.id,
      x: rounded(virus.x),
      y: rounded(virus.y),
      radius: rounded(virus.radius),
      color: virus.color,
      spore: virus.spore
    };
  }

  markFoodChanged() {
    if (this.inStep) this.foodChangedThisTick = true;
    else this.foodRevision += 1;
  }

  markVirusChanged() {
    if (this.inStep) this.virusChangedThisTick = true;
    else this.virusRevision += 1;
  }

  spawnVirus({ track = true, values = null } = {}) {
    const point = this.randomPoint(220);
    const spore = Boolean(this.config.viruses?.sporeOnly || this.mode === "spore");
    const virus = {
      id: this.nextEntityId("virus"),
      x: point.x,
      y: point.y,
      radius: spore ? this.randomBetween(48, 66) : this.randomBetween(56, 72),
      color: spore ? "#f472b6" : "#5eea80",
      spore,
      ...(values || {})
    };
    this.viruses.push(virus);
    if (track) {
      this.markVirusChanged();
      this.virusAdded.set(virus.id, virus);
    }
    return virus;
  }

  removeVirus(virus) {
    const index = this.viruses.indexOf(virus);
    if (index >= 0) this.viruses.splice(index, 1);
    this.markVirusChanged();
    if (this.virusAdded.delete(virus.id)) return;
    this.virusRemoved.add(virus.id);
  }

  setConnected(playerId, connected) {
    const group = this.groups.find(item => item.id === playerId && item.human);
    if (group) group.connected = Boolean(connected);
  }

  setInput(playerId, input) {
    const group = this.groups.find(item => item.id === playerId && item.human);
    if (!group || !group.connected || group.dead || group.eliminated) return false;
    if (input.seq < group.input.seq) return false;
    group.input.seq = input.seq;
    group.input.dx = clamp(Number(input.dx) || 0, -1, 1);
    group.input.dy = clamp(Number(input.dy) || 0, -1, 1);
    group.input.pendingSplit ||= Boolean(input.split);
    group.input.eject = Boolean(input.eject);
    group.input.pendingQuickMerge ||= Boolean(input.quickMerge);
    group.input.pendingSpecial ||= Boolean(input.special);
    return true;
  }

  groupMass(group) {
    return group.cells.reduce((sum, cell) => sum + (cell.dead ? 0 : cell.mass), 0);
  }

  groupCenter(group) {
    let mass = 0;
    let x = 0;
    let y = 0;
    for (const cell of group.cells) {
      if (cell.dead) continue;
      mass += cell.mass;
      x += cell.x * cell.mass;
      y += cell.y * cell.mass;
    }
    if (!mass) return { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, mass: 0 };
    return { x: x / mass, y: y / mass, mass };
  }

  sameTeam(first, second) {
    return this.teamCount > 0 && first.team != null && first.team === second.team;
  }

  currentEventMultiplier(field) {
    if (!this.activeEvent || this.tick >= this.activeEvent.endsAtTick) return 1;
    return this.activeEvent[field] || 1;
  }

  updateAi(group) {
    const center = this.groupCenter(group);
    group.ai.thinkTicks -= 1;
    if (group.ai.thinkTicks <= 0) {
      group.ai.thinkTicks = Math.floor(this.randomBetween(8, 24));
      let target = null;
      let targetDistance = Infinity;
      if (this.mode === "control" && this.controlPoints.length) {
        const point = this.controlPoints
          .filter(candidate => candidate.owner !== group.team)
          .sort((a, b) => distanceSquared(a, center) - distanceSquared(b, center))[0];
        if (point) target = point;
      }
      for (const other of this.groups) {
        if (other === group || other.dead || other.eliminated || this.sameTeam(group, other)) continue;
        const otherCenter = this.groupCenter(other);
        const distance = Math.hypot(otherCenter.x - center.x, otherCenter.y - center.y);
        const aggressive = group.role === "boss" || center.mass > otherCenter.mass * 1.24;
        if (aggressive && distance < targetDistance && distance < (group.role === "boss" ? 1600 : 900)) {
          target = otherCenter;
          targetDistance = distance;
        }
      }
      if (!target) target = this.randomPoint(180);
      group.ai.targetX = target.x;
      group.ai.targetY = target.y;
      if (this.safeZone) {
        const fromZone = Math.hypot(center.x - this.safeZone.x, center.y - this.safeZone.y);
        if (fromZone > this.safeZone.radius * 0.88) {
          group.ai.targetX = this.safeZone.x;
          group.ai.targetY = this.safeZone.y;
        }
      }
    }

    const dx = group.ai.targetX - center.x;
    const dy = group.ai.targetY - center.y;
    const length = Math.hypot(dx, dy) || 1;
    group.input.dx = dx / length;
    group.input.dy = dy / length;
    group.input.eject = false;
    if (group.role !== "boss" && this.random() < 0.002 && center.mass > 260) group.input.pendingSplit = true;
  }

  clampCell(cell) {
    cell.x = clamp(cell.x, this.arena.x + cell.radius, this.arena.x + this.arena.width - cell.radius);
    cell.y = clamp(cell.y, this.arena.y + cell.radius, this.arena.y + this.arena.height - cell.radius);
  }

  splitGroup(group) {
    if (group.role === "boss") return;
    const directionLength = Math.hypot(group.input.dx, group.input.dy) || 1;
    const dx = group.input.dx / directionLength;
    const dy = group.input.dy / directionLength;
    const sources = [...group.cells].filter(cell => !cell.dead && cell.mass >= SPLIT_MIN_MASS);
    const maximum = this.maxCellsForGroup(group);
    for (const cell of sources) {
      if (group.cells.length >= maximum) break;
      const half = cell.mass * 0.5;
      cell.mass = half;
      cell.radius = radiusFromMass(half);
      cell.mergeTicks = Math.round(160 * (this.config.mergeScale || 1) * this.currentEventMultiplier("mergeScale"));
      const child = this.createCell(group, cell.x + dx * (cell.radius + 14), cell.y + dy * (cell.radius + 14), half);
      this.clampCell(child);
      child.vx = cell.vx + dx * 560;
      child.vy = cell.vy + dy * 560;
      child.mergeTicks = cell.mergeTicks;
      group.cells.push(child);
    }
  }

  ejectMass(group) {
    if (group.ejectCooldown > 0 || group.role === "boss") return;
    group.ejectCooldown = 2;
    const length = Math.hypot(group.input.dx, group.input.dy) || 1;
    const dx = group.input.dx / length;
    const dy = group.input.dy / length;
    const cells = [...group.cells]
      .filter(cell => !cell.dead && cell.mass >= EJECT_MIN_MASS)
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 4);
    for (const cell of cells) {
      const amount = Math.min(13, Math.max(6, cell.mass * 0.08));
      if (cell.mass - amount < MIN_CELL_MASS * 2) continue;
      cell.mass -= amount;
      cell.radius = radiusFromMass(cell.mass);
      this.ejected.push({
        id: this.nextEntityId("ejected"),
        ownerId: group.id,
        x: cell.x + dx * (cell.radius + 12),
        y: cell.y + dy * (cell.radius + 12),
        vx: cell.vx * 0.25 + dx * 480,
        vy: cell.vy * 0.25 + dy * 480,
        mass: amount,
        radius: radiusFromMass(amount),
        ageTicks: 0,
        color: group.color
      });
    }
    if (this.ejected.length > 420) this.ejected.splice(0, this.ejected.length - 420);
  }

  useQuickMerge(group) {
    if (!this.config.abilities || group.quickMergeCooldown > 0) return;
    group.quickMergeCooldown = Math.round((this.config.abilities.quickMergeCooldownSeconds || 6.2) * SERVER_HZ);
    for (const cell of group.cells) cell.mergeTicks = 0;
    this.events.push({ event: "ability", data: { playerId: group.id, ability: "quick-merge" } });
  }

  useSpecial(group) {
    if (!this.config.abilities || group.specialCooldown > 0 || group.role === "boss") return;
    const costRatio = this.config.abilities.specialCostRatio || 0.012;
    const directionLength = Math.hypot(group.input.dx, group.input.dy) || 1;
    const dx = group.input.dx / directionLength;
    const dy = group.input.dy / directionLength;
    for (const cell of group.cells) {
      const cost = Math.max(0, cell.mass * costRatio);
      if (cell.mass - cost < MIN_CELL_MASS * 2) continue;
      cell.mass -= cost;
      cell.radius = radiusFromMass(cell.mass);
      cell.vx += dx * (this.config.abilities.specialImpulse || 520);
      cell.vy += dy * (this.config.abilities.specialImpulse || 520);
    }
    const center = this.groupCenter(group);
    if (this.config.abilities.spawnVirus !== false && center.mass > 60) {
      this.spawnVirus({ values: {
        x: clamp(center.x - dx * 120, this.arena.x + 60, this.arena.x + this.arena.width - 60),
        y: clamp(center.y - dy * 120, this.arena.y + 60, this.arena.y + this.arena.height - 60),
        radius: 52,
        color: "#5eea80",
        spore: false,
        expiresAtTick: this.tick + SERVER_HZ * 20
      } });
    }
    group.specialCooldown = Math.round((this.config.abilities.specialCooldownSeconds || 7.6) * SERVER_HZ);
    this.events.push({ event: "ability", data: { playerId: group.id, ability: "dash" } });
  }

  updateMovement(group) {
    if (group.dead || group.eliminated) return;
    if (!group.human || !group.connected) this.updateAi(group);
    if (group.input.pendingSplit) {
      this.splitGroup(group);
      group.input.pendingSplit = false;
    }
    if (group.input.pendingQuickMerge) {
      this.useQuickMerge(group);
      group.input.pendingQuickMerge = false;
    }
    if (group.input.pendingSpecial) {
      this.useSpecial(group);
      group.input.pendingSpecial = false;
    }
    if (group.input.eject) this.ejectMass(group);
    group.ejectCooldown = Math.max(0, group.ejectCooldown - 1);
    group.quickMergeCooldown = Math.max(0, group.quickMergeCooldown - 1);
    group.specialCooldown = Math.max(0, group.specialCooldown - 1);

    const modeSpeed = (this.config.speedScale || 1) * this.currentEventMultiplier("speedScale") * (group.role === "boss" ? 0.72 : 1);
    for (const cell of group.cells) {
      if (cell.dead) continue;
      const baseSpeed = 330 / (1 + cell.radius / 92) * modeSpeed;
      const targetVx = group.input.dx * baseSpeed;
      const targetVy = group.input.dy * baseSpeed;
      cell.vx += (targetVx - cell.vx) * 0.2;
      cell.vy += (targetVy - cell.vy) * 0.2;
      cell.vx *= 0.965;
      cell.vy *= 0.965;
      cell.x += cell.vx * STEP_SECONDS;
      cell.y += cell.vy * STEP_SECONDS;
      this.clampCell(cell);
      const decay = group.role === "boss" ? 0.0002 : 0.0012;
      cell.mass = Math.max(MIN_CELL_MASS, cell.mass * (1 - STEP_SECONDS * decay));
      cell.radius = radiusFromMass(cell.mass);
      cell.mergeTicks = Math.max(0, cell.mergeTicks - 1);
    }
  }

  nearbyFood(cell) {
    const reach = cell.radius + FOOD_BUCKET_SIZE;
    const minimumX = Math.floor((cell.x - reach) / FOOD_BUCKET_SIZE);
    const maximumX = Math.floor((cell.x + reach) / FOOD_BUCKET_SIZE);
    const minimumY = Math.floor((cell.y - reach) / FOOD_BUCKET_SIZE);
    const maximumY = Math.floor((cell.y + reach) / FOOD_BUCKET_SIZE);
    const result = [];
    for (let bucketX = minimumX; bucketX <= maximumX; bucketX += 1) {
      for (let bucketY = minimumY; bucketY <= maximumY; bucketY += 1) {
        const bucket = this.foodGrid.get(`${bucketX}:${bucketY}`);
        if (bucket) result.push(...bucket);
      }
    }
    return result;
  }

  desiredFoodTarget() {
    return clamp(Math.round(this.foodTargetBase * this.currentEventMultiplier("foodScale")), 420, 900);
  }

  handleFoodEating() {
    const eaten = new Set();
    for (const group of this.groups) {
      if (group.dead || group.eliminated) continue;
      for (const cell of group.cells) {
        if (cell.dead) continue;
        for (const food of this.nearbyFood(cell)) {
          if (eaten.has(food)) continue;
          const reach = Math.max(5, cell.radius - food.radius * 0.15);
          if (distanceSquared(cell, food) <= reach * reach) {
            cell.mass += food.mass;
            cell.radius = radiusFromMass(cell.mass);
            eaten.add(food);
          }
        }
      }
    }
    for (const food of eaten) this.removeFood(food);
    const target = this.desiredFoodTarget();
    while (this.foods.length < target) this.spawnFood();
    while (this.foods.length > target + 40) this.removeFood(this.foods[this.foods.length - 1]);
  }

  updateEjected() {
    for (let index = this.ejected.length - 1; index >= 0; index -= 1) {
      const item = this.ejected[index];
      item.ageTicks += 1;
      item.vx *= 0.92;
      item.vy *= 0.92;
      item.x += item.vx * STEP_SECONDS;
      item.y += item.vy * STEP_SECONDS;
      this.clampCell(item);
      let consumed = false;
      if (item.ageTicks > 5) {
        for (const group of this.groups) {
          if (group.dead || group.eliminated) continue;
          for (const cell of group.cells) {
            if (cell.dead || (group.id === item.ownerId && item.ageTicks < 18)) continue;
            const reach = Math.max(5, cell.radius - item.radius * 0.15);
            if (distanceSquared(cell, item) <= reach * reach) {
              cell.mass += item.mass;
              cell.radius = radiusFromMass(cell.mass);
              consumed = true;
              break;
            }
          }
          if (consumed) break;
        }
      }
      if (consumed || item.ageTicks > 300) this.ejected.splice(index, 1);
    }
  }

  burstVirus(group, cell, virus) {
    this.removeVirus(virus);
    const sporeMode = virus.spore || this.mode === "spore";
    const lossRatio = sporeMode ? 0.5 : 0.28;
    const loss = Math.min(cell.mass - MIN_CELL_MASS, Math.max(0, cell.mass * lossRatio));
    if (loss <= 0) return;
    cell.mass -= loss;
    cell.radius = radiusFromMass(cell.mass);
    const pieces = sporeMode ? Math.floor(this.randomBetween(18, 31)) : Math.floor(this.randomBetween(6, 11));
    const pieceMass = Math.max(2, loss / pieces * 0.9);
    for (let piece = 0; piece < pieces; piece += 1) {
      const angle = (Math.PI * 2 * piece) / pieces + this.randomBetween(-0.12, 0.12);
      this.ejected.push({
        id: this.nextEntityId("spore"),
        ownerId: null,
        x: cell.x + Math.cos(angle) * (cell.radius + 12),
        y: cell.y + Math.sin(angle) * (cell.radius + 12),
        vx: Math.cos(angle) * this.randomBetween(180, 380),
        vy: Math.sin(angle) * this.randomBetween(180, 380),
        mass: pieceMass,
        radius: radiusFromMass(pieceMass),
        ageTicks: 0,
        color: sporeMode ? "#f472b6" : "#5eea80"
      });
    }
    this.events.push({ event: "virus-burst", data: { playerId: group.id, virusId: virus.id, spore: sporeMode } });
    if (this.viruses.length < (this.config.viruses?.count || 0)) this.spawnVirus();
  }

  handleVirusCollisions() {
    if (!this.viruses.length) return;
    for (let virusIndex = this.viruses.length - 1; virusIndex >= 0; virusIndex -= 1) {
      const virus = this.viruses[virusIndex];
      if (virus.expiresAtTick && this.tick >= virus.expiresAtTick) {
        this.removeVirus(virus);
        continue;
      }
      let burst = false;
      for (const group of this.groups) {
        if (group.dead || group.eliminated || group.role === "boss") continue;
        for (const cell of group.cells) {
          if (cell.dead || cell.radius < virus.radius * 0.72) continue;
          const reach = Math.max(12, cell.radius - virus.radius * 0.18);
          if (distanceSquared(cell, virus) <= reach * reach) {
            this.burstVirus(group, cell, virus);
            burst = true;
            break;
          }
        }
        if (burst) break;
      }
    }
  }

  eliminateGroup(victim, killer, reason = "eaten") {
    if (victim.dead || victim.eliminated) return;
    victim.dead = true;
    victim.deaths += 1;
    victim.cells = [];
    if (killer) {
      killer.kills += 1;
      if (this.mode === "survival") killer.lives = Math.min(6, killer.lives + 1);
    }
    if (this.config.lives) victim.lives = Math.max(0, victim.lives - 1);
    const noLives = Boolean(this.config.lives && victim.lives <= 0);
    const canRespawn = Boolean(this.config.respawn && !noLives && victim.role !== "boss");
    victim.eliminated = !canRespawn;
    victim.respawnTick = canRespawn ? this.tick + SERVER_HZ * 3 : 0;
    this.events.push({
      event: victim.eliminated ? "eliminated" : "downed",
      data: {
        victimId: victim.id,
        victimName: victim.name,
        killerId: killer?.id || null,
        killerName: killer?.name || "星云",
        lives: victim.lives,
        reason
      }
    });
  }

  handleCellEating() {
    const wraps = [];
    for (const group of this.groups) {
      if (group.dead || group.eliminated) continue;
      for (const cell of group.cells) if (!cell.dead) wraps.push({ group, cell });
    }
    wraps.sort((a, b) => b.cell.mass - a.cell.mass);
    for (let predatorIndex = 0; predatorIndex < wraps.length; predatorIndex += 1) {
      const predator = wraps[predatorIndex];
      if (predator.cell.dead) continue;
      for (let preyIndex = wraps.length - 1; preyIndex >= 0; preyIndex -= 1) {
        const prey = wraps[preyIndex];
        if (prey.cell.dead || prey.group === predator.group || this.sameTeam(predator.group, prey.group)) continue;
        if (predator.cell.radius < prey.cell.radius * 1.12) continue;
        const reach = predator.cell.radius - prey.cell.radius * 0.28;
        if (reach <= 0 || distanceSquared(predator.cell, prey.cell) > reach * reach) continue;
        prey.cell.dead = true;
        predator.cell.mass += prey.cell.mass * 0.9;
        predator.cell.radius = radiusFromMass(predator.cell.mass);
        if (!prey.group.cells.some(cell => !cell.dead)) this.eliminateGroup(prey.group, predator.group);
      }
    }
    for (const group of this.groups) {
      if (!group.dead) group.cells = group.cells.filter(cell => !cell.dead);
    }
  }

  handleOwnCellSeparation() {
    for (const group of this.groups) {
      if (group.dead || group.eliminated || group.cells.length < 2) continue;
      for (let first = 0; first < group.cells.length; first += 1) {
        for (let second = first + 1; second < group.cells.length; second += 1) {
          const a = group.cells[first];
          const b = group.cells[second];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy) || 1;
          const overlap = a.radius + b.radius - distance;
          if (overlap <= 0) continue;
          if (a.mergeTicks <= 0 && b.mergeTicks <= 0) {
            const keep = a.mass >= b.mass ? a : b;
            const remove = keep === a ? b : a;
            keep.mass += remove.mass;
            keep.radius = radiusFromMass(keep.mass);
            remove.dead = true;
          } else {
            const nx = dx / distance;
            const ny = dy / distance;
            const push = overlap * 0.025;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
            this.clampCell(a);
            this.clampCell(b);
          }
        }
      }
      group.cells = group.cells.filter(cell => !cell.dead);
    }
  }

  updateRespawns() {
    for (const group of this.groups) {
      if (!group.dead || group.eliminated || this.tick < group.respawnTick) continue;
      const point = this.teamSpawnPoint(group.team);
      group.dead = false;
      group.zoneExposureTicks = 0;
      group.cells = [this.createCell(group, point.x, point.y, this.startMassForRole(group.role))];
      group.input.pendingSplit = false;
      this.events.push({ event: "respawned", data: { playerId: group.id, name: group.name, lives: group.lives } });
    }
  }

  updateSafeZone() {
    if (!this.safeZone) return;
    const elapsed = (this.serverTime - this.startedAt) / 1000;
    if (!this.safeZone.static) {
      const span = Math.max(1, this.safeZone.shrinkEndSeconds - this.safeZone.shrinkStartSeconds);
      const alpha = clamp((elapsed - this.safeZone.shrinkStartSeconds) / span, 0, 1);
      this.safeZone.radius = this.safeZone.startRadius + (this.safeZone.targetRadius - this.safeZone.startRadius) * alpha;
    }
    for (const group of this.groups) {
      if (group.dead || group.eliminated) continue;
      let outside = false;
      for (const cell of group.cells) {
        const distance = Math.hypot(cell.x - this.safeZone.x, cell.y - this.safeZone.y);
        if (distance <= this.safeZone.radius - Math.min(cell.radius, 30)) continue;
        outside = true;
        const damage = Math.max(4, cell.mass * this.safeZone.damagePerSecond) * STEP_SECONDS;
        cell.mass -= damage;
        if (cell.mass <= MIN_CELL_MASS + 0.2) cell.dead = true;
        else cell.radius = radiusFromMass(cell.mass);
      }
      group.zoneExposureTicks = outside ? group.zoneExposureTicks + 1 : Math.max(0, group.zoneExposureTicks - 2);
      group.cells = group.cells.filter(cell => !cell.dead);
      if (!group.cells.length) this.eliminateGroup(group, null, "zone");
    }
  }

  updateControlPoints() {
    if (!this.controlPoints.length || this.finished) return;
    const captureRate = this.config.control.capturePerSecond || 24;
    const scoreRate = this.config.control.scorePerSecond || 0.95;
    for (const point of this.controlPoints) {
      const pressure = new Map();
      for (const group of this.groups) {
        if (group.dead || group.eliminated || group.team == null) continue;
        for (const cell of group.cells) {
          if (distanceSquared(cell, point) <= point.radius * point.radius) {
            pressure.set(group.team, (pressure.get(group.team) || 0) + Math.sqrt(cell.mass));
          }
        }
      }
      const present = [...pressure.entries()].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
      point.contested = present.length > 1 && present[1][1] >= present[0][1] * 0.35;
      if (present.length && !point.contested) {
        const team = present[0][0];
        if (point.owner === team) {
          point.captureTeam = team;
          point.progress = 100;
        } else if (point.captureTeam === team) {
          point.progress = Math.min(100, point.progress + captureRate * STEP_SECONDS);
          if (point.progress >= 100) {
            point.owner = team;
            this.events.push({ event: "control-captured", data: { pointId: point.id, team } });
          }
        } else {
          point.progress = Math.max(0, point.progress - captureRate * 1.25 * STEP_SECONDS);
          if (point.progress <= 0) point.captureTeam = team;
        }
      }
      if (point.owner != null) this.teamScores.set(point.owner, (this.teamScores.get(point.owner) || 0) + scoreRate * STEP_SECONDS);
    }
    const targetScore = this.config.control.targetScore || 240;
    const winner = [...this.teamScores.entries()].find(([, score]) => score >= targetScore);
    if (winner) this.finishMatch("control-score", `team-${winner[0]}`);
  }

  updateDomination() {
    if (!this.domination || this.finished) return;
    const candidates = this.groups
      .filter(group => !group.dead && !group.eliminated)
      .map(group => ({ group, mass: this.groupMass(group) }))
      .sort((a, b) => b.mass - a.mass);
    const totalMass = candidates.reduce((sum, entry) => sum + entry.mass, 0);
    const leader = candidates[0];
    const share = leader && totalMass > 0 ? leader.mass / totalMass : 0;
    const elapsedSeconds = (this.serverTime - this.startedAt) / 1000;
    const runnerUpMass = candidates[1]?.mass || 0;
    const leadRatio = runnerUpMass > 0 ? leader?.mass / runnerUpMass : Infinity;
    const qualifies = Boolean(
      leader
      && candidates.length > 1
      && elapsedSeconds >= this.domination.graceSeconds
      && share >= this.domination.targetShare
      && leadRatio >= this.domination.leadRatio
    );
    if (qualifies && this.domination.leaderId === leader.group.id) {
      this.domination.progressSeconds += STEP_SECONDS;
    } else if (qualifies) {
      this.domination.leaderId = leader.group.id;
      this.domination.progressSeconds = STEP_SECONDS;
    } else {
      this.domination.progressSeconds = Math.max(0, this.domination.progressSeconds - STEP_SECONDS * 1.5);
      if (!this.domination.progressSeconds) this.domination.leaderId = leader?.group.id || null;
    }
    this.domination.share = share;
    if (this.domination.progressSeconds >= this.domination.holdSeconds) this.finishMatch("domination", leader.group.id);
  }

  updateDemon() {
    if (this.mode !== "demon" || this.finished) return;
    const bosses = this.groups.filter(group => group.role === "boss" && !group.eliminated);
    if (!bosses.length) {
      this.finishMatch("boss-defeated", "team-0");
      return;
    }
    for (const boss of bosses) {
      if (boss.dead || this.tick < boss.bossAbilityTick) continue;
      boss.bossAbilityTick = this.tick + Math.round(this.randomBetween(7.8, 11.8) * SERVER_HZ);
      const center = this.groupCenter(boss);
      for (const hero of this.groups.filter(group => group.team === 0 && !group.dead && !group.eliminated)) {
        for (const cell of hero.cells) {
          const dx = cell.x - center.x;
          const dy = cell.y - center.y;
          const distance = Math.hypot(dx, dy) || 1;
          if (distance > 900) continue;
          const force = (1 - distance / 900) * 480;
          cell.vx += dx / distance * force;
          cell.vy += dy / distance * force;
          cell.mass = Math.max(MIN_CELL_MASS, cell.mass * 0.96);
          cell.radius = radiusFromMass(cell.mass);
        }
      }
      this.events.push({ event: "boss-ability", data: { bossId: boss.id, ability: "gravity-pulse" } });
    }
  }

  updateMatchEvent() {
    if (!this.config.randomEvents && !["blitz", "spore"].includes(this.mode)) return;
    if (this.activeEvent && this.tick >= this.activeEvent.endsAtTick) {
      this.events.push({ event: "match-event-ended", data: { key: this.activeEvent.key } });
      this.activeEvent = null;
      this.nextEventTick = this.tick + Math.round(this.randomBetween(12, 18) * SERVER_HZ);
    }
    if (!this.activeEvent && this.tick >= this.nextEventTick) {
      const template = EVENT_ROTATION[this.eventSequence % EVENT_ROTATION.length];
      this.eventSequence += 1;
      this.activeEvent = { ...template, endsAtTick: this.tick + template.durationTicks };
      this.events.push({ event: "match-event", data: { key: template.key, label: template.label, duration: template.durationTicks / SERVER_HZ } });
    }
  }

  checkLastSurvivor() {
    if (this.config.respawn || this.finished || this.tick < SERVER_HZ * 8) return;
    const alive = this.groups.filter(group => !group.eliminated);
    if (alive.length <= 1) this.finishMatch("last-survivor", alive[0]?.id || null);
  }

  finishMatch(reason, winnerId = null) {
    if (this.finished) return;
    this.finished = true;
    this.finishReason = reason;
    this.winnerId = winnerId;
    const ranking = this.ranking();
    this.events.push({ event: "match-finished", data: { reason, winnerId, ranking: ranking.slice(0, 8) } });
  }

  step(now = this.serverTime + STEP_SECONDS * 1000) {
    if (this.finished) return;
    this.inStep = true;
    this.foodChangedThisTick = false;
    this.virusChangedThisTick = false;
    this.tick += 1;
    this.serverTime = now;
    this.events = [];
    this.updateMatchEvent();
    for (const group of this.groups) this.updateMovement(group);
    this.handleOwnCellSeparation();
    this.updateEjected();
    this.handleFoodEating();
    this.handleVirusCollisions();
    this.handleCellEating();
    this.updateSafeZone();
    this.updateRespawns();
    this.updateControlPoints();
    this.updateDomination();
    this.updateDemon();
    this.checkLastSurvivor();
    this.inStep = false;
    if (this.foodChangedThisTick) this.foodRevision += 1;
    if (this.virusChangedThisTick) this.virusRevision += 1;
    if (!this.finished && this.durationSeconds > 0 && (this.serverTime - this.startedAt) / 1000 >= this.durationSeconds) {
      const winner = this.ranking()[0];
      const winnerId = this.mode === "demon" ? "team-1" : winner?.id || null;
      this.finishMatch("time-limit", winnerId);
    }
  }

  teamSummaries() {
    if (!this.teamCount) return [];
    const result = [];
    for (let team = 0; team < this.teamCount; team += 1) {
      const members = this.groups.filter(group => group.team === team);
      const mass = members.reduce((sum, group) => sum + this.groupMass(group), 0);
      const kills = members.reduce((sum, group) => sum + group.kills, 0);
      result.push({
        id: `team-${team}`,
        team,
        name: this.mode === "demon" ? (team === 0 ? "勇者阵营" : "魔王阵营") : `${TEAM_NAMES[team % TEAM_NAMES.length]}队`,
        color: TEAM_COLORS[team % TEAM_COLORS.length],
        mass: rounded(mass),
        kills,
        score: rounded(this.teamScores.get(team) || 0),
        alive: members.filter(group => !group.eliminated).length
      });
    }
    const metric = this.mode === "control" ? "score" : "mass";
    return result.sort((a, b) => b[metric] - a[metric] || b.kills - a.kills || a.team - b.team);
  }

  ranking() {
    const teamRanks = new Map(this.teamSummaries().map((team, index) => [team.team, index + 1]));
    const entries = this.groups.map(group => ({
      id: group.id,
      name: group.name,
      mass: rounded(this.groupMass(group)),
      kills: group.kills,
      deaths: group.deaths,
      lives: group.lives,
      connected: group.connected,
      human: group.human,
      color: group.color,
      team: group.team,
      teamRank: group.team == null ? null : teamRanks.get(group.team),
      role: group.role,
      eliminated: group.eliminated,
      score: group.team == null ? 0 : rounded(this.teamScores.get(group.team) || 0)
    }));
    if (this.mode === "survival") {
      return entries.sort((a, b) => b.kills - a.kills || b.lives - a.lives || b.mass - a.mass);
    }
    if (this.mode === "control") {
      return entries.sort((a, b) => b.score - a.score || b.mass - a.mass || b.kills - a.kills);
    }
    if (this.teamCount) {
      return entries.sort((a, b) => (a.teamRank || 99) - (b.teamRank || 99) || b.mass - a.mass || b.kills - a.kills);
    }
    return entries.sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || b.mass - a.mass || b.kills - a.kills || a.name.localeCompare(b.name, "zh-CN"));
  }

  objectiveSnapshot() {
    const objective = {
      type: this.config.ranking || "mass",
      label: this.config.label,
      description: this.config.description,
      activeEvent: this.activeEvent ? {
        key: this.activeEvent.key,
        label: this.activeEvent.label,
        remaining: rounded((this.activeEvent.endsAtTick - this.tick) / SERVER_HZ)
      } : null
    };
    if (this.config.control) objective.targetScore = this.config.control.targetScore || 240;
    if (this.domination) objective.domination = clonePublic(this.domination);
    if (this.mode === "demon") {
      objective.bossesAlive = this.groups.filter(group => group.role === "boss" && !group.eliminated).length;
      objective.heroesAlive = this.groups.filter(group => group.team === 0 && !group.eliminated).length;
    }
    return objective;
  }

  snapshot({ foodMode = "full" } = {}) {
    const ranking = this.ranking();
    const ranks = new Map(ranking.map((entry, index) => [entry.id, index + 1]));
    const snapshot = {
      tick: this.tick,
      serverTime: this.serverTime,
      serverHz: SERVER_HZ,
      mode: this.mode,
      phase: this.finished ? "finished" : "running",
      finished: this.finished,
      finishReason: this.finishReason || null,
      winnerId: this.winnerId,
      world: { width: WORLD_SIZE, height: WORLD_SIZE },
      arena: clonePublic(this.arena),
      remaining: this.durationSeconds > 0
        ? Math.max(0, rounded(this.durationSeconds - (this.serverTime - this.startedAt) / 1000))
        : null,
      groups: this.groups.map(group => ({
        id: group.id,
        name: group.name,
        color: group.color,
        human: group.human,
        connected: group.connected,
        dead: group.dead,
        eliminated: group.eliminated,
        kills: group.kills,
        deaths: group.deaths,
        lives: group.lives,
        team: group.team,
        role: group.role,
        ackInputSeq: group.input.seq,
        respawnRemaining: group.dead && !group.eliminated ? rounded(Math.max(0, (group.respawnTick - this.tick) / SERVER_HZ)) : 0,
        quickMergeCooldown: rounded(group.quickMergeCooldown / SERVER_HZ),
        specialCooldown: rounded(group.specialCooldown / SERVER_HZ),
        rank: ranks.get(group.id) || ranking.length,
        mass: rounded(this.groupMass(group)),
        cells: group.cells.map(cell => ({
          id: cell.id,
          x: rounded(cell.x),
          y: rounded(cell.y),
          vx: rounded(cell.vx),
          vy: rounded(cell.vy),
          radius: rounded(cell.radius),
          mass: rounded(cell.mass)
        }))
      })),
      ejected: this.ejected.map(item => ({
        id: item.id,
        x: rounded(item.x),
        y: rounded(item.y),
        vx: rounded(item.vx),
        vy: rounded(item.vy),
        radius: rounded(item.radius),
        color: item.color
      })),
      safeZone: this.safeZone ? {
        x: rounded(this.safeZone.x),
        y: rounded(this.safeZone.y),
        radius: rounded(this.safeZone.radius),
        targetRadius: rounded(this.safeZone.targetRadius)
      } : null,
      controlPoints: this.controlPoints.map(point => ({
        id: point.id,
        x: rounded(point.x),
        y: rounded(point.y),
        radius: rounded(point.radius),
        owner: point.owner,
        captureTeam: point.captureTeam,
        progress: rounded(point.progress),
        contested: point.contested
      })),
      teams: this.teamSummaries(),
      objective: this.objectiveSnapshot(),
      ranking: ranking.slice(0, 10),
      events: this.events,
      foodRevision: this.foodRevision,
      virusRevision: this.virusRevision
    };
    if (foodMode === "full") {
      snapshot.foods = this.foods.map(food => this.publicFood(food));
      snapshot.foodBaseline = true;
      snapshot.viruses = this.viruses.map(virus => this.publicVirus(virus));
      snapshot.virusBaseline = true;
    } else if (foodMode === "delta") {
      snapshot.foodDelta = {
        fromRevision: this.foodDeltaFromRevision,
        toRevision: this.foodRevision,
        added: [...this.foodAdded.values()].map(food => this.publicFood(food)),
        removed: [...this.foodRemoved]
      };
      snapshot.virusDelta = {
        fromRevision: this.virusDeltaFromRevision,
        toRevision: this.virusRevision,
        added: [...this.virusAdded.values()].map(virus => this.publicVirus(virus)),
        removed: [...this.virusRemoved]
      };
    }
    return snapshot;
  }

  clearFoodDelta() {
    this.foodAdded.clear();
    this.foodRemoved.clear();
    this.foodDeltaFromRevision = this.foodRevision;
    this.virusAdded.clear();
    this.virusRemoved.clear();
    this.virusDeltaFromRevision = this.virusRevision;
  }
}

export const SIMULATION_CONSTANTS = Object.freeze({
  WORLD_SIZE,
  SERVER_HZ,
  SNAPSHOT_HZ: SERVER_HZ,
  STEP_SECONDS,
  MAX_CELLS,
  DEFAULT_MAX_CELLS,
  FULL_FOOD_SNAPSHOT_INTERVAL_TICKS
});

export { clamp, radiusFromMass };
