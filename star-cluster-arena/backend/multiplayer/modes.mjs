import "../../frontend/js/game-mode-catalog.js";

const DEFAULT_MODE = "solo";
const modeCatalog = globalThis.ScaModeCatalog;
if (!modeCatalog) throw new Error("Shared mode catalog failed to load");

export const CANONICAL_MODES = modeCatalog.MODES;
export const MODE_KEYS = modeCatalog.MODE_KEYS;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function canonicalSafeZone(base) {
  if (!base.safeZone) return null;
  return {
    startRadius: base.safeZoneRadius ?? 0.58,
    targetRadius: base.safeZoneTargetRadius ?? (base.staticZone ? base.safeZoneRadius : 0.44),
    shrinkStartSeconds: (base.safeZoneShrinkStart ?? (base.staticZone ? 0 : 18_000)) / 1000,
    shrinkEndSeconds: (base.safeZoneShrinkEnd ?? (base.staticZone ? 0 : 64_000)) / 1000,
    damagePerSecond: 0.022,
    static: Boolean(base.staticZone)
  };
}

function canonicalViruses(base) {
  const count = base.virusCount ?? 54;
  return {
    count,
    maximum: base.virusMax ?? count,
    sporeOnly: Boolean(base.sporeVirusOnly),
    sporeChance: base.sporeVirusChance ?? 0,
    bigChance: 0.08,
    regenerationPerSecond: base.virusRegenRate ?? 0,
    massLossRatio: base.sporeVirusLossMin ?? 0.5,
    burstPiecesMinimum: base.sporeVirusBurstMin ?? 18,
    burstPiecesMaximum: base.sporeVirusBurstMax ?? 30,
    burstPieceMass: base.sporeVirusPieceMass ?? 17,
    massLossMinimum: base.sporeVirusLossMin ?? 0.5,
    massLossMaximum: base.sporeVirusLossMax ?? base.sporeVirusLossMin ?? 0.5,
    playerSmallPieces: base.virusPlayerPieces ?? 6,
    playerBigPieces: base.bigVirusPlayerPieces ?? 8
  };
}

function defineMode(key, config = {}) {
  const base = CANONICAL_MODES[key];
  if (!base) throw new Error(`Unknown canonical mode: ${key}`);
  const {
    lanAdaptation = {},
    viruses: virusOverrides = {},
    safeZone: safeZoneOverride,
    ...overrides
  } = config;
  const sharedSafeZone = canonicalSafeZone(base);
  return deepFreeze({
    key,
    label: base.label,
    short: base.short,
    canonicalDescription: base.description,
    description: base.description,
    durationSeconds: base.duration,
    ranking: base.ranking,
    startMass: base.playerStartMass,
    foodScale: base.foodTargetScale ?? 1,
    foodTargetScale: base.foodTargetScale ?? 1,
    foodRateScale: base.foodRateScale ?? 1,
    foodMassScale: base.foodMassScale ?? 1,
    lateFoodRamp: base.lateFoodRamp ?? 0,
    speedScale: base.speedScale ?? 1,
    mergeScale: base.mergeScale ?? 1,
    botMassScale: base.botMassScale ?? 1,
    aiAggroScale: base.aiAggroScale ?? 1,
    randomEvents: true,
    teams: base.teams ?? 0,
    teamSize: base.teamSize ?? 0,
    respawn: base.respawn !== false,
    respawnShield: base.respawnShield ?? 1.8,
    lives: base.lives ?? 0,
    maxCells: base.maxCells ?? 16,
    botMaxCells: base.botMaxCells ?? base.maxCells ?? 16,
    minimumHumans: 2,
    maximumHumans: base.demon ? 4 : 8,
    minimumBots: 0,
    maximumBots: 99,
    targetParticipants: Math.max(2, base.players ?? 8),
    recommendedParticipants: Math.max(2, base.players ?? 8),
    safeZone: safeZoneOverride === null
      ? null
      : (sharedSafeZone || safeZoneOverride) ? { ...(sharedSafeZone || {}), ...(safeZoneOverride || {}) } : null,
    rectArena: base.rectArena ? { widthScale: base.arenaWidth, heightScale: base.arenaHeight } : null,
    control: base.control ? { targetScore: base.controlScore, pointCount: 3 } : null,
    domination: base.domination ? { share: base.dominationShare, holdSeconds: base.dominationHold } : null,
    viruses: { ...canonicalViruses(base), ...virusOverrides },
    demon: base.demon ? { minimumBots: 4, maximumBosses: 4, maximumMinions: 3 } : null,
    parity: "single-source-runtime",
    execution: "frontend/js/game.js",
    canonical: {
      participants: base.players,
      teams: base.teams ?? 0,
      teamSize: base.teamSize ?? 0
    },
    ...overrides,
    lanAdaptation: {
      maximumHumans: base.demon ? 4 : 8,
      participantScale: "human-slots-only",
      ...lanAdaptation
    }
  });
}

export const MULTIPLAYER_MODES = deepFreeze({
  solo: defineMode("solo", {
    description: "限时成长并反复复活，按个人总质量结算排名。",
    recommendedParticipants: 8
  }),
  team: defineMode("team", {
    description: "10 队 4 人，队友之间不会互相吞噬，按队伍总质量结算。"
  }),
  survival: defineMode("survival", {
    description: "每名玩家拥有三条生命，吞噬对手可加命，生命耗尽出局。",
    viruses: { count: 54, maximum: 70, sporeOnly: false, sporeChance: 0.08 },
    recommendedParticipants: 10
  }),
  battle: defineMode("battle", {
    description: "安全区持续收缩，圈外损失质量，无复活并以最后存活者获胜。",
    safeZone: {
      startRadius: 0.58,
      targetRadius: 0.44,
      shrinkStartSeconds: 18,
      shrinkEndSeconds: 64,
      damagePerSecond: 0.022,
      static: false
    },
    recommendedParticipants: 10
  }),
  blitz: defineMode("blitz", {
    description: "三分钟高资源快节奏乱斗，可通过不可逆优势提前制霸。",
    safeZone: {
      startRadius: 0.44,
      targetRadius: 0.28,
      shrinkStartSeconds: 6.5,
      shrinkEndSeconds: 30,
      damagePerSecond: 0.022,
      static: false
    },
    viruses: { count: 54, maximum: 72, sporeOnly: false, sporeChance: 0.16 },
    supremacy: { graceSeconds: 45, massShare: 0.68, leadRatio: 4.2, holdSeconds: 3 },
    recommendedParticipants: 10
  }),
  spore: defineMode("spore", {
    description: "全孢子刺球战场，撞刺会喷出一圈可争夺质量。",
    viruses: {
      count: 62,
      maximum: 92,
      sporeOnly: true,
      sporeChance: 1,
      regenerationPerSecond: 0.9,
      massLossRatio: 0.5,
      burstPiecesMinimum: 18,
      burstPiecesMaximum: 30
    },
    recommendedParticipants: 10
  }),
  screen: defineMode("screen", {
    description: "方形战场支持快速合球和冲刺种刺，取得绝对质量优势并维持即可获胜。",
    rectArena: { widthScale: 0.72, heightScale: 0.72 },
    domination: { share: 0.88, holdSeconds: 6 },
    viruses: { count: 20, maximum: 34, sporeOnly: false, sporeChance: 0.1 },
    abilities: {
      quickMergeCooldownSeconds: 6.2,
      specialCooldownSeconds: 7.6,
      specialDurationSeconds: 1.25
    },
    recommendedParticipants: 8
  }),
  control: defineMode("control", {
    description: "四队七人争夺三个星核据点，率先达到目标分数的队伍获胜。"
  }),
  giant: defineMode("giant", {
    description: "巨球开局，在固定圆形区域内完成并维持区域霸屏。",
    safeZone: {
      startRadius: 0.38,
      targetRadius: 0.38,
      shrinkStartSeconds: 0,
      shrinkEndSeconds: 0,
      damagePerSecond: 0.022,
      static: true
    },
    domination: { share: 0.88, holdSeconds: 6 },
    viruses: { count: 44, maximum: 58, sporeOnly: false, sporeChance: 0.08 },
    recommendedParticipants: 8
  }),
  demon: defineMode("demon", {
    description: "所有真人组成勇者阵营，合作击败服务端控制的魔王与魔兵。",
    minimumBots: 4,
    recommendedParticipants: 4
  })
});

export function normalizeMode(value, fallback = DEFAULT_MODE) {
  const candidate = String(value ?? "").trim().toLowerCase();
  if (Object.hasOwn(MULTIPLAYER_MODES, candidate)) return candidate;
  const normalizedFallback = String(fallback ?? "").trim().toLowerCase();
  return Object.hasOwn(MULTIPLAYER_MODES, normalizedFallback) ? normalizedFallback : DEFAULT_MODE;
}

export function getModeConfig(value = DEFAULT_MODE) {
  return MULTIPLAYER_MODES[normalizeMode(value)];
}

const SHARED_RULES = deepFreeze([
  "mode-catalog",
  "movement",
  "radius",
  "split-threshold",
  "split-impulse",
  "merge-cooldown",
  "virus-split",
  "spore-burst",
  "ejected-pickup",
  "ejected-virus-feed",
  "virus-launch"
]);
const PUBLIC_MODE_CATALOG = deepFreeze(MODE_KEYS.map(key => {
  const mode = MULTIPLAYER_MODES[key];
  return {
    key: mode.key,
    label: mode.label,
    short: mode.short,
    description: mode.description,
    canonicalDescription: mode.canonicalDescription,
    durationSeconds: mode.durationSeconds,
    teams: mode.teams,
    teamSize: mode.teamSize,
    minimumHumans: mode.minimumHumans,
    maximumHumans: mode.maximumHumans,
    minimumBots: mode.minimumBots,
    maximumBots: mode.maximumBots,
    targetParticipants: mode.targetParticipants,
    recommendedParticipants: mode.recommendedParticipants,
    canonical: mode.canonical,
    lanAdaptation: mode.lanAdaptation,
    parity: mode.parity,
    execution: mode.execution,
    sharedRules: SHARED_RULES
  };
}));

export function publicModeCatalog() {
  return PUBLIC_MODE_CATALOG;
}

export function normalizeBotCountForMode(mode, value, fallback = 6) {
  const config = getModeConfig(mode);
  const parsed = Number.parseInt(value, 10);
  const requested = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(config.maximumBots, Math.max(config.minimumBots, requested));
}

export function automaticBotCountForMode(mode, humanCount = 0) {
  const config = getModeConfig(mode);
  const humans = Math.max(0, Math.floor(Number(humanCount) || 0));
  const roleMinimum = config.demon?.minimumBots || config.minimumBots || 0;
  return Math.min(config.maximumBots, Math.max(roleMinimum, config.targetParticipants - humans));
}
