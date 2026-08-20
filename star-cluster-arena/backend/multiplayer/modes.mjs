const DEFAULT_MODE = "solo";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function defineMode(key, config) {
  return deepFreeze({
    key,
    minimumHumans: 2,
    minimumBots: 0,
    maximumBots: 12,
    maxCells: 16,
    foodScale: 1,
    foodMassScale: 1,
    speedScale: 1,
    teams: 0,
    teamSize: 0,
    respawn: true,
    lives: 0,
    safeZone: null,
    rectArena: null,
    control: null,
    domination: null,
    viruses: null,
    demon: null,
    ...config
  });
}

export const MULTIPLAYER_MODES = deepFreeze({
  solo: defineMode("solo", {
    label: "自由模式",
    short: "自由",
    description: "限时成长并反复复活，按个人总质量结算排名。",
    durationSeconds: 720,
    ranking: "mass",
    startMass: 160,
    foodScale: 1.06,
    foodMassScale: 1.06,
    recommendedParticipants: 8
  }),
  team: defineMode("team", {
    label: "团队战",
    short: "团队",
    description: "局域网适配为两队对抗，队友之间不会互相吞噬，按队伍总质量结算。",
    durationSeconds: 720,
    teams: 2,
    teamSize: 4,
    ranking: "teamMass",
    startMass: 170,
    foodScale: 1.14,
    foodMassScale: 1.08,
    speedScale: 1,
    recommendedParticipants: 8
  }),
  survival: defineMode("survival", {
    label: "生存模式",
    short: "生存",
    description: "每名玩家拥有三条生命，吞噬对手可加命，生命耗尽出局。",
    durationSeconds: 540,
    respawn: true,
    lives: 3,
    ranking: "kills",
    startMass: 180,
    foodScale: 1.14,
    foodMassScale: 1.12,
    viruses: { count: 54, maximum: 70, sporeOnly: false, sporeChance: 0.08 },
    recommendedParticipants: 10
  }),
  battle: defineMode("battle", {
    label: "大逃杀",
    short: "逃杀",
    description: "安全区持续收缩，圈外损失质量，无复活并以最后存活者获胜。",
    durationSeconds: 0,
    respawn: false,
    ranking: "mass",
    startMass: 220,
    foodScale: 1.08,
    foodMassScale: 1.12,
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
    label: "闪电乱斗",
    short: "闪电",
    description: "三分钟高资源快节奏乱斗，可通过不可逆优势提前制霸。",
    durationSeconds: 185,
    ranking: "mass",
    startMass: 320,
    foodScale: 1.42,
    foodMassScale: 1.12,
    speedScale: 1.16,
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
    label: "孢子风暴",
    short: "孢子",
    description: "全孢子刺球战场，撞刺会喷出一圈可争夺质量。",
    durationSeconds: 360,
    ranking: "mass",
    startMass: 260,
    foodScale: 1.24,
    foodMassScale: 1.25,
    speedScale: 1.06,
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
    label: "霸屏模式",
    short: "霸屏",
    description: "方形战场支持快速合球和冲刺种刺，取得绝对质量优势并维持即可获胜。",
    durationSeconds: 420,
    ranking: "mass",
    startMass: 980,
    foodScale: 1.3,
    foodMassScale: 1.42,
    maxCells: 64,
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
    label: "据点战",
    short: "据点",
    description: "四队争夺三个星核据点，率先达到目标分数的队伍获胜。",
    durationSeconds: 600,
    teams: 4,
    teamSize: 2,
    ranking: "control",
    startMass: 185,
    foodScale: 1.16,
    foodMassScale: 1.1,
    control: { targetScore: 240, pointCount: 3 },
    recommendedParticipants: 8
  }),
  giant: defineMode("giant", {
    label: "巨行星霸屏",
    short: "巨行星",
    description: "巨球开局，在固定圆形区域内完成并维持区域霸屏。",
    durationSeconds: 0,
    ranking: "mass",
    startMass: 4300,
    foodScale: 1,
    foodMassScale: 1.08,
    speedScale: 0.88,
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
    label: "魔王模式",
    short: "魔王",
    description: "所有真人组成勇者阵营，合作击败服务端控制的魔王与魔兵。",
    durationSeconds: 540,
    teams: 2,
    teamSize: 4,
    ranking: "demon",
    startMass: 340,
    foodScale: 1.28,
    foodMassScale: 2.15,
    minimumBots: 4,
    demon: { minimumBots: 4, maximumBosses: 4, maximumMinions: 3 },
    recommendedParticipants: 8
  })
});

export const MODE_KEYS = Object.freeze(Object.keys(MULTIPLAYER_MODES));

export function normalizeMode(value, fallback = DEFAULT_MODE) {
  const candidate = String(value ?? "").trim().toLowerCase();
  if (Object.hasOwn(MULTIPLAYER_MODES, candidate)) return candidate;
  const normalizedFallback = String(fallback ?? "").trim().toLowerCase();
  return Object.hasOwn(MULTIPLAYER_MODES, normalizedFallback) ? normalizedFallback : DEFAULT_MODE;
}

export function getModeConfig(value = DEFAULT_MODE) {
  return MULTIPLAYER_MODES[normalizeMode(value)];
}

const PUBLIC_MODE_CATALOG = deepFreeze(MODE_KEYS.map(key => {
  const mode = MULTIPLAYER_MODES[key];
  return {
    key: mode.key,
    label: mode.label,
    short: mode.short,
    description: mode.description,
    durationSeconds: mode.durationSeconds,
    teams: mode.teams,
    teamSize: mode.teamSize,
    minimumHumans: mode.minimumHumans,
    minimumBots: mode.minimumBots,
    maximumBots: mode.maximumBots,
    recommendedParticipants: mode.recommendedParticipants
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
