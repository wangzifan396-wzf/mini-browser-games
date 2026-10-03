(function () {
  "use strict";
  const localStorage = window.ScaStorage || window.localStorage;

  const gameplayCore = window.ScaGameplayCore;
  if (!gameplayCore) throw new Error("共享玩法内核未加载");
  const settingsApi = window.ScaGameSettings;
  if (!settingsApi) throw new Error("共享游戏设置未加载");
  const gameSettings = settingsApi.load();
  const sharedCosmeticRenderer = window.ScaCosmeticRenderer;
  if (!sharedCosmeticRenderer) throw new Error("共享外观渲染器未加载");
  const pageTransition = window.ScaPageTransition;
  if (!pageTransition) throw new Error("页面过渡模块未加载");

  const gpuCanvas = document.getElementById("gpuCanvas");
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", {
    alpha: true,
    desynchronized: true,
    willReadFrequently: false
  });
  const miniCanvas = document.getElementById("miniCanvas");
  const miniCtx = miniCanvas.getContext("2d", { alpha: false, desynchronized: true });
  const gpuRenderer = window.GPUArenaRenderer && gpuCanvas
    ? new window.GPUArenaRenderer(gpuCanvas)
    : null;
  const renderBadge = document.getElementById("renderBadge");
  const eventBanner = document.getElementById("eventBanner");
  const lobbyToast = document.getElementById("lobbyToast");
  const titleScreen = document.getElementById("titleScreen");
  const titleRuntimeStatus = document.getElementById("titleRuntimeStatus");
  const settingsForm = document.getElementById("gameSettingsForm");

  const massValue = document.getElementById("massValue");
  const rankValue = document.getElementById("rankValue");
  const cellValue = document.getElementById("cellValue");
  const killValue = document.getElementById("killValue");
  const rankList = document.getElementById("rankList");
  const tagList = document.getElementById("tagList");
  const pauseBtn = document.getElementById("pauseBtn");
  const splitBtn = document.getElementById("splitBtn");
  const ejectBtn = document.getElementById("ejectBtn");
  const musicBtn = document.getElementById("musicBtn");
  const joystickEl = document.getElementById("joystick");
  const joystickStick = document.getElementById("joystickStick");
  const overlay = document.getElementById("overlay");
  const resultTitle = document.getElementById("resultTitle");
  const resultText = document.getElementById("resultText");
  const finalMass = document.getElementById("finalMass");
  const metaStrip = document.getElementById("metaStrip");
  const lobbyTabs = document.getElementById("lobbyTabs");
  const lobbyPanels = [...document.querySelectorAll("[data-lobby-panel]")];
  const musicLobbyBtn = document.getElementById("musicLobbyBtn");
  const randomLookBtn = document.getElementById("randomLookBtn");
  const modeGrid = document.getElementById("modeGrid");
  const playAgainBtn = document.getElementById("playAgainBtn");
  const menuBtn = document.getElementById("menuBtn");
  const skinGrid = document.getElementById("skinGrid");
  const sporeGrid = document.getElementById("sporeGrid");
  const haloGrid = document.getElementById("haloGrid");
  const trailGrid = document.getElementById("trailGrid");
  const shopPanel = document.getElementById("shopPanel");
  const forgePanel = document.getElementById("forgePanel");
  const progressPanel = document.getElementById("progressPanel");
  const lobbyBackBtn = document.getElementById("lobbyBackBtn");
  const modeButtons = [...document.querySelectorAll("[data-mode]")];

  const WORLD = gameplayCore.WORLD_RULES.size;
  const FOOD_BASE_COUNT = 2100;
  const FOOD_MAX_COUNT = 3600;
  const FOOD_BUCKET = 180;
  const CELL_BUCKET = 460;
  const BOT_COUNT = 99;
  const VIRUS_COUNT = 54;
  const MAX_CELLS = 16;
  const VIRUS_MASS = 95;
  const BIG_VIRUS_MASS = 260;
  const MIN_CELL_MASS = 9;
  const SPLIT_MIN_MASS = gameplayCore.MOVEMENT.splitMinimumMass;
  const EJECT_MIN_MASS = gameplayCore.MOVEMENT.ejectMinimumMass;
  const EJECT_INTERVAL = 68;
  const MAX_EJECTED = 720;
  const MAX_PARTICLES = 560;
  const MAX_RINGS = 96;
  const MINIMAP_FAST_INTERVAL = 130;
  const MINIMAP_SLOW_INTERVAL = 280;
  const SIMULATION_STEP = 1 / 60;
  const MAX_SIMULATION_STEPS = 3;
  const REQUESTED_REFRESH_RATE = settingsApi.displayRefresh();
  const TARGET_RENDER_FPS = gameplayCore.renderBudgetFor(settingsApi.targetFps(gameSettings, REQUESTED_REFRESH_RATE));
  const TARGET_FRAME_MS = 1000 / TARGET_RENDER_FPS;
  const TARGET_RENDER_INTERVAL = 1000 / TARGET_RENDER_FPS;
  const GPU_CACHE_FPS = Math.min(80, TARGET_RENDER_FPS);
  const QUALITY_PRESET = settingsApi.qualityPreset(gameSettings);
  const MAX_FOREGROUND_PIXELS = QUALITY_PRESET.pixelBudget;
  const PLAYER_NAME = "你";
  const COLORS = ["#44d7b6", "#67e8f9", "#ffd166", "#ff7a90", "#a78bfa", "#f59e0b", "#7dd3fc", "#f472b6", "#34d399"];
  const TEAM_COLORS = ["#44d7b6", "#ff7a90", "#7dd3fc", "#ffd166", "#a78bfa", "#f59e0b", "#f472b6", "#34d399", "#e5e7eb", "#94a3b8"];
  const TEAM_NAMES = ["青队", "红队", "蓝队", "金队", "紫队", "橙队", "粉队", "绿队", "白队", "灰队"];
  const BOT_NAMES = ["青柠", "星火", "乌龙", "极光", "米粒", "山竹", "海盐", "月影", "薄荷", "赤焰", "云雀", "琥珀", "珊瑚", "北辰", "白桃", "竹叶", "蓝莓", "流星", "夜航", "银杏", "松子", "木星", "海雾"];
  const SKINS = [
    { key: "aqua", name: "青荧", color: "#44d7b6", type: "basic" },
    { key: "solar", name: "日冕", color: "#ffd166", type: "basic" },
    { key: "rose", name: "绯星", color: "#ff7a90", type: "basic" },
    { key: "violet", name: "紫晶", color: "#a78bfa", type: "basic" },
    { key: "frost", name: "霜蓝", color: "#67e8f9", type: "basic" },
    { key: "ember", name: "熔火", color: "#f59e0b", type: "basic" },
    { key: "jade", name: "玉环", color: "#34d399", type: "basic" },
    { key: "void", name: "幽紫", color: "#8b5cf6", type: "basic" },
    { key: "nova", name: "绯光", color: "#fb7185", type: "basic" },
    { key: "comet", name: "彗星航线", color: "#3b82f6", accent: "#f8fafc", type: "special", pattern: "comet", tier: "common", rarity: "普通" },
    { key: "mecha", name: "机甲星环", color: "#64748b", accent: "#67e8f9", type: "special", pattern: "mecha", tier: "common", rarity: "普通" },
    { key: "tide", name: "潮汐之心", color: "#0f766e", accent: "#5eead4", type: "special", pattern: "tide", tier: "rare", rarity: "稀有" },
    { key: "flare", name: "赤焰风暴", color: "#ef4444", accent: "#ffd166", type: "special", pattern: "flare", tier: "epic", rarity: "史诗" },
    { key: "crown", name: "王冠星域", color: "#7c3aed", accent: "#ffd166", type: "special", pattern: "crown", tier: "epic", rarity: "史诗" },
    { key: "pixel", name: "像素矩阵", color: "#0f172a", accent: "#58edc8", type: "special", pattern: "mecha", tier: "rare", rarity: "稀有" },
    { key: "lotus", name: "莲华星盘", color: "#be185d", accent: "#f9a8d4", type: "special", pattern: "crown", tier: "epic", rarity: "史诗" },
    { key: "prism", name: "棱镜幻面", color: "#2563eb", accent: "#f0abfc", type: "special", pattern: "comet", tier: "epic", rarity: "史诗" },
    { key: "honeycomb", name: "蜂巢矩阵", color: "#92400e", accent: "#fde68a", type: "special", pattern: "mecha", tier: "rare", rarity: "稀有" },
    { key: "thunder", name: "雷霆球核", color: "#4338ca", accent: "#fef08a", type: "special", pattern: "flare", tier: "epic", rarity: "史诗" },
    { key: "ocean", name: "深海潮核", color: "#0e7490", accent: "#a7f3d0", type: "special", pattern: "tide", tier: "rare", rarity: "稀有" },
    { key: "celestial", name: "天穹星眼", color: "#1e1b4b", accent: "#e0e7ff", type: "special", pattern: "abyss", tier: "legendary", rarity: "传说" },
    { key: "abyss", name: "深渊脉冲", color: "#111827", accent: "#a78bfa", type: "special", pattern: "abyss", tier: "legendary", rarity: "传说" },
    { key: "dragon", name: "龙焰天幕", color: "#7f1d1d", accent: "#facc15", type: "special", pattern: "flare", tier: "legendary", rarity: "传说" }
  ];
  const SPORES = [
    { key: "mint", name: "薄荷孢子", color: "#7dd3fc", type: "basic" },
    { key: "gold", name: "金糖孢子", color: "#ffd166", type: "basic" },
    { key: "pink", name: "桃雾孢子", color: "#f472b6", type: "basic" },
    { key: "lime", name: "青芽孢子", color: "#9cff6e", type: "basic" },
    { key: "ash", name: "银尘孢子", color: "#d7e1ea", type: "basic" },
    { key: "hot", name: "焰点孢子", color: "#ff7a5c", type: "basic" },
    { key: "star", name: "星砂孢子", color: "#c084fc", type: "basic" },
    { key: "wave", name: "潮光孢子", color: "#22d3ee", type: "basic" },
    { key: "cinder", name: "余烬孢子", color: "#fb923c", type: "basic" },
    { key: "meteor", name: "流星尾焰", color: "#fb923c", accent: "#fff7ed", type: "special", pattern: "meteor", tier: "common", rarity: "普通" },
    { key: "bubble", name: "水晶泡泡", color: "#38bdf8", accent: "#e0f2fe", type: "special", pattern: "bubble", tier: "common", rarity: "普通" },
    { key: "spark", name: "电弧火花", color: "#a78bfa", accent: "#fef08a", type: "special", pattern: "spark", tier: "rare", rarity: "稀有" },
    { key: "vine", name: "藤蔓星种", color: "#34d399", accent: "#dcfce7", type: "special", pattern: "vine", tier: "epic", rarity: "史诗" },
    { key: "aurora", name: "极光羽片", color: "#22d3ee", accent: "#f0abfc", type: "special", pattern: "aurora", tier: "epic", rarity: "史诗" },
    { key: "pearl", name: "珍珠泡影", color: "#e0f2fe", accent: "#38bdf8", type: "special", pattern: "bubble", tier: "rare", rarity: "稀有" },
    { key: "rune", name: "符文星屑", color: "#c084fc", accent: "#fef3c7", type: "special", pattern: "spark", tier: "epic", rarity: "史诗" },
    { key: "candy", name: "糖星碎粒", color: "#fb7185", accent: "#fef3c7", type: "special", pattern: "bubble", tier: "common", rarity: "普通" },
    { key: "snowflake", name: "雪晶孢子", color: "#bae6fd", accent: "#ffffff", type: "special", pattern: "spark", tier: "rare", rarity: "稀有" },
    { key: "gear-spore", name: "齿轮孢子", color: "#94a3b8", accent: "#67e8f9", type: "special", pattern: "royal", tier: "epic", rarity: "史诗" },
    { key: "dragon-ash", name: "龙烬孢子", color: "#f97316", accent: "#fef08a", type: "special", pattern: "meteor", tier: "legendary", rarity: "传说" },
    { key: "royal", name: "王冠碎金", color: "#facc15", accent: "#ffffff", type: "special", pattern: "royal", tier: "legendary", rarity: "传说" },
    { key: "void-spore", name: "虚空碎片", color: "#312e81", accent: "#e0e7ff", type: "special", pattern: "meteor", tier: "legendary", rarity: "传说" }
  ];
  const HALOS = [
    { key: "none", name: "无光环", color: "#94a3b8", type: "basic" },
    { key: "orbit", name: "星轨光环", color: "#38bdf8", accent: "#e0f2fe", type: "special", pattern: "orbit", tier: "common", rarity: "普通" },
    { key: "frost-ring", name: "霜轮光环", color: "#67e8f9", accent: "#ffffff", type: "special", pattern: "frost", tier: "common", rarity: "普通" },
    { key: "pulse-ring", name: "磁暴光环", color: "#a78bfa", accent: "#fef08a", type: "special", pattern: "pulse", tier: "rare", rarity: "稀有" },
    { key: "sun-crown", name: "日冕光环", color: "#fb923c", accent: "#fff7ed", type: "special", pattern: "sun", tier: "epic", rarity: "史诗" },
    { key: "halo-crown", name: "王冠光环", color: "#ffd166", accent: "#ffffff", type: "special", pattern: "crown", tier: "epic", rarity: "史诗" },
    { key: "nebula-ring", name: "星云光环", color: "#db2777", accent: "#f0abfc", type: "special", pattern: "pulse", tier: "rare", rarity: "稀有" },
    { key: "lotus-ring", name: "莲华光环", color: "#be185d", accent: "#f9a8d4", type: "special", pattern: "crown", tier: "epic", rarity: "史诗" },
    { key: "chrono-ring", name: "时轮光环", color: "#0f766e", accent: "#99f6e4", type: "special", pattern: "orbit", tier: "rare", rarity: "稀有" },
    { key: "gear-ring", name: "齿轮光环", color: "#475569", accent: "#67e8f9", type: "special", pattern: "frost", tier: "epic", rarity: "史诗" },
    { key: "thunder-ring", name: "雷纹光环", color: "#4338ca", accent: "#fef08a", type: "special", pattern: "pulse", tier: "epic", rarity: "史诗" },
    { key: "gravity", name: "引力黑环", color: "#111827", accent: "#c084fc", type: "special", pattern: "gravity", tier: "legendary", rarity: "传说" },
    { key: "void-gate", name: "虚空门环", color: "#020617", accent: "#818cf8", type: "special", pattern: "gravity", tier: "legendary", rarity: "传说" }
  ];
  const TRAILS = [
    { key: "none", name: "无拖尾", color: "#94a3b8", type: "basic" },
    { key: "stardust", name: "星尘尾迹", color: "#7dd3fc", accent: "#f8fafc", type: "special", pattern: "dots", tier: "common", rarity: "普通" },
    { key: "sakura", name: "樱粉尾迹", color: "#f472b6", accent: "#fff1f2", type: "special", pattern: "petals", tier: "common", rarity: "普通" },
    { key: "bubble-trail", name: "泡泡航迹", color: "#38bdf8", accent: "#e0f2fe", type: "special", pattern: "bubbles", tier: "rare", rarity: "稀有" },
    { key: "arc", name: "电弧残影", color: "#a78bfa", accent: "#fef08a", type: "special", pattern: "arc", tier: "rare", rarity: "稀有" },
    { key: "flame-trail", name: "火焰航迹", color: "#f97316", accent: "#fef3c7", type: "special", pattern: "flame", tier: "epic", rarity: "史诗" },
    { key: "aurora-trail", name: "极光缎带", color: "#22d3ee", accent: "#f0abfc", type: "special", pattern: "ribbon", tier: "epic", rarity: "史诗" },
    { key: "data-trail", name: "数据残影", color: "#58edc8", accent: "#0f172a", type: "special", pattern: "squares", tier: "epic", rarity: "史诗" },
    { key: "ink-trail", name: "水墨流痕", color: "#0f172a", accent: "#e5e7eb", type: "special", pattern: "ribbon", tier: "rare", rarity: "稀有" },
    { key: "snow-trail", name: "雪雾拖尾", color: "#bae6fd", accent: "#ffffff", type: "special", pattern: "bubbles", tier: "common", rarity: "普通" },
    { key: "crown-trail", name: "碎金王迹", color: "#facc15", accent: "#ffffff", type: "special", pattern: "dots", tier: "epic", rarity: "史诗" },
    { key: "demon-trail", name: "魔焰裂痕", color: "#7f1d1d", accent: "#f97316", type: "special", pattern: "rift", tier: "legendary", rarity: "传说" },
    { key: "rift-trail", name: "裂隙拖尾", color: "#111827", accent: "#c084fc", type: "special", pattern: "rift", tier: "legendary", rarity: "传说" }
  ];

  SKINS.push(
    { key: "neon-grid", name: "霓虹棋盘", color: "#111827", accent: "#22d3ee", type: "special", pattern: "mecha", tier: "rare", rarity: "稀有" },
    { key: "phoenix", name: "凤焰星羽", color: "#b91c1c", accent: "#fde68a", type: "special", pattern: "flare", tier: "epic", rarity: "史诗" },
    { key: "glacier", name: "冰川晶冠", color: "#0e7490", accent: "#e0f2fe", type: "special", pattern: "tide", tier: "epic", rarity: "史诗" },
    { key: "sakura-moon", name: "樱月绮面", color: "#9d174d", accent: "#fbcfe8", type: "special", pattern: "crown", tier: "rare", rarity: "稀有" },
    { key: "cosmic-koi", name: "星河锦鲤", color: "#0f766e", accent: "#fef08a", type: "special", pattern: "tide", tier: "legendary", rarity: "传说" },
    { key: "storm-eye", name: "风暴之眼", color: "#1d4ed8", accent: "#bae6fd", type: "special", pattern: "abyss", tier: "legendary", rarity: "传说" },
    { key: "candy-pop", name: "糖果爆弹", color: "#db2777", accent: "#fef3c7", type: "special", pattern: "comet", tier: "common", rarity: "普通" },
    { key: "jade-dragon", name: "青玉龙鳞", color: "#047857", accent: "#bbf7d0", type: "special", pattern: "mecha", tier: "epic", rarity: "史诗" },
    { key: "zero-code", name: "零号代码", color: "#020617", accent: "#58edc8", type: "special", pattern: "mecha", tier: "legendary", rarity: "传说" },
    { key: "sunset", name: "落霞星幕", color: "#c2410c", accent: "#fed7aa", type: "special", pattern: "flare", tier: "rare", rarity: "稀有" },
    { key: "spore-nebula", name: "孢子星云", color: "#be185d", accent: "#fdf2f8", type: "special", pattern: "comet", tier: "epic", rarity: "史诗" },
    { key: "blitz-crown", name: "闪电王冠", color: "#1e3a8a", accent: "#fde047", type: "special", pattern: "crown", tier: "legendary", rarity: "传说" }
  );

  SPORES.push(
    { key: "firework", name: "烟火碎星", color: "#f97316", accent: "#fff7ed", type: "special", pattern: "spark", tier: "rare", rarity: "稀有" },
    { key: "lotus-seed", name: "莲心星种", color: "#f472b6", accent: "#fdf2f8", type: "special", pattern: "vine", tier: "rare", rarity: "稀有" },
    { key: "quartz", name: "石英泡影", color: "#e0f2fe", accent: "#a78bfa", type: "special", pattern: "bubble", tier: "common", rarity: "普通" },
    { key: "phoenix-ash", name: "凤焰灰烬", color: "#ef4444", accent: "#fde68a", type: "special", pattern: "meteor", tier: "epic", rarity: "史诗" },
    { key: "neon-bit", name: "霓虹字节", color: "#22d3ee", accent: "#58edc8", type: "special", pattern: "spark", tier: "epic", rarity: "史诗" },
    { key: "storm-pearl", name: "风暴珍珠", color: "#2563eb", accent: "#fef08a", type: "special", pattern: "royal", tier: "legendary", rarity: "传说" },
    { key: "koi-scale", name: "锦鲤鳞片", color: "#fb923c", accent: "#bbf7d0", type: "special", pattern: "bubble", tier: "epic", rarity: "史诗" },
    { key: "blackhole-dust", name: "黑洞星砂", color: "#020617", accent: "#c084fc", type: "special", pattern: "meteor", tier: "legendary", rarity: "传说" },
    { key: "spore-burst", name: "孢子爆花", color: "#f472b6", accent: "#ffffff", type: "special", pattern: "spark", tier: "epic", rarity: "史诗" }
  );

  HALOS.push(
    { key: "phoenix-ring", name: "凤焰光环", color: "#ef4444", accent: "#fde68a", type: "special", pattern: "sun", tier: "epic", rarity: "史诗" },
    { key: "koi-ring", name: "锦鲤游环", color: "#0f766e", accent: "#facc15", type: "special", pattern: "orbit", tier: "rare", rarity: "稀有" },
    { key: "mirror-ring", name: "镜月光环", color: "#64748b", accent: "#e0f2fe", type: "special", pattern: "frost", tier: "rare", rarity: "稀有" },
    { key: "neon-ring", name: "霓虹电环", color: "#22d3ee", accent: "#58edc8", type: "special", pattern: "pulse", tier: "epic", rarity: "史诗" },
    { key: "lotus-crown", name: "莲华冠环", color: "#be185d", accent: "#fdf2f8", type: "special", pattern: "crown", tier: "legendary", rarity: "传说" },
    { key: "storm-ring", name: "风眼光环", color: "#1d4ed8", accent: "#bae6fd", type: "special", pattern: "gravity", tier: "legendary", rarity: "传说" },
    { key: "candy-ring", name: "糖霜光环", color: "#fb7185", accent: "#fef3c7", type: "special", pattern: "pulse", tier: "common", rarity: "普通" },
    { key: "jade-ring", name: "青玉光环", color: "#047857", accent: "#bbf7d0", type: "special", pattern: "orbit", tier: "epic", rarity: "史诗" },
    { key: "blitz-ring", name: "制霸电冕", color: "#2563eb", accent: "#fde047", type: "special", pattern: "crown", tier: "legendary", rarity: "传说" }
  );

  TRAILS.push(
    { key: "phoenix-trail", name: "凤焰长羽", color: "#ef4444", accent: "#fde68a", type: "special", pattern: "flame", tier: "epic", rarity: "史诗" },
    { key: "koi-trail", name: "锦鲤水痕", color: "#0f766e", accent: "#facc15", type: "special", pattern: "bubbles", tier: "rare", rarity: "稀有" },
    { key: "mirror-trail", name: "镜月残光", color: "#94a3b8", accent: "#e0f2fe", type: "special", pattern: "arc", tier: "rare", rarity: "稀有" },
    { key: "neon-trail", name: "霓虹脉线", color: "#22d3ee", accent: "#58edc8", type: "special", pattern: "squares", tier: "epic", rarity: "史诗" },
    { key: "lotus-trail", name: "莲华花路", color: "#be185d", accent: "#fdf2f8", type: "special", pattern: "petals", tier: "epic", rarity: "史诗" },
    { key: "storm-trail", name: "风暴电尾", color: "#1d4ed8", accent: "#bae6fd", type: "special", pattern: "arc", tier: "legendary", rarity: "传说" },
    { key: "candy-trail", name: "糖霜泡带", color: "#fb7185", accent: "#fef3c7", type: "special", pattern: "dots", tier: "common", rarity: "普通" },
    { key: "blackhole-trail", name: "黑洞拖影", color: "#020617", accent: "#c084fc", type: "special", pattern: "rift", tier: "legendary", rarity: "传说" },
    { key: "spore-trail", name: "孢子流萤", color: "#be185d", accent: "#fdf2f8", type: "special", pattern: "bubbles", tier: "epic", rarity: "史诗" }
  );

  const sharedCosmetics = globalThis.ScaCosmeticCatalog;
  if (!sharedCosmetics) throw new Error("Shared cosmetic catalog failed to load");
  SKINS.splice(0, SKINS.length, ...sharedCosmetics.SKINS);
  SPORES.splice(0, SPORES.length, ...sharedCosmetics.SPORES);
  HALOS.splice(0, HALOS.length, ...sharedCosmetics.HALOS);
  TRAILS.splice(0, TRAILS.length, ...sharedCosmetics.TRAILS);

  const modeCatalog = globalThis.ScaModeCatalog;
  if (!modeCatalog) throw new Error("Shared mode catalog failed to load");
  const GAME_MODES = modeCatalog.MODES;

  const canonicalContent = globalThis.ScaCanonicalGameContent;
  if (!canonicalContent) throw new Error("Canonical game content failed to load");
  const MATCH_EVENTS = canonicalContent.MATCH_EVENTS;
  const RARITY_CONFIG = {
    common: { label: "普通", chance: 0.58, exp: 18, color: "#94a3b8" },
    rare: { label: "稀有", chance: 0.28, exp: 36, color: "#38bdf8" },
    epic: { label: "史诗", chance: 0.11, exp: 72, color: "#c084fc" },
    legendary: { label: "传说", chance: 0.03, exp: 160, color: "#ffd166" }
  };
  const DEMON_TEMPLATES = canonicalContent.DEMON_TEMPLATES;
  const RARITY_ORDER = ["common", "rare", "epic", "legendary"];
  const FORGE_LEVEL_XP = [0, 90, 220, 390, 610, 880, 1200, 1580, 2020, 2520];
  const FORGE_LEVEL_REWARDS = {
    2: { dust: 80, tickets: 1 },
    3: { dust: 110, tickets: 1 },
    4: { dust: 140, tickets: 1 },
    5: { dust: 170, tickets: 2 },
    6: { dust: 210, tickets: 2 },
    7: { dust: 250, tickets: 2 },
    8: { dust: 300, tickets: 3 },
    9: { dust: 360, tickets: 3 },
    10: { dust: 500, tickets: 5 }
  };
  const FORGE_THEMES = [
    { name: "旧铁小炉", color: "#94a3b8" },
    { name: "青铜火膛", color: "#b45309" },
    { name: "银纹炉台", color: "#d7e1ea" },
    { name: "星尘砧座", color: "#58edc8" },
    { name: "赤焰工坊", color: "#fb923c" },
    { name: "霜轮锻炉", color: "#67e8f9" },
    { name: "符文熔炉", color: "#c084fc" },
    { name: "王冠炉心", color: "#ffd166" },
    { name: "极光天炉", color: "#22d3ee" },
    { name: "深渊黑炉", color: "#818cf8" },
    { name: "莲华炉庭", color: "#f472b6" },
    { name: "龙焰锻堂", color: "#facc15" },
    { name: "星轨圣炉", color: "#7dd3fc" },
    { name: "虚空门炉", color: "#a78bfa" },
    { name: "彗星铸台", color: "#f8fafc" },
    { name: "潮汐工坊", color: "#5eead4" },
    { name: "魔王熔炉", color: "#ef4444" },
    { name: "星界工坊", color: "#f0abfc" },
    { name: "创世火种", color: "#fff7ed" },
    { name: "无尽炉心", color: "#ffffff" }
  ];
  const REDEEM_CODES = {
    STARS2026: { label: "十连星尘补给", dust: 1200, tickets: 10, xp: 280 },
    FORGE777: { label: "铁匠铺十连包", dust: 777, tickets: 10, xp: 350, unlock: 1 },
    BALL16X: { label: "爆发豪华包", dust: 1600, tickets: 16, xp: 500, unlock: 2 },
    HALO888: { label: "光环补给", dust: 888, tickets: 8, xp: 220, unlock: 1 },
    TRAIL999: { label: "拖尾补给", dust: 999, tickets: 9, xp: 260, unlock: 1 },
    ARENA2026: { label: "星团大礼包", dust: 2026, tickets: 20, xp: 720, unlock: 3 },
    MUSIC2026: { label: "BGM 庆典包", dust: 888, tickets: 10, xp: 260, unlock: 1 },
    HUNTER888: { label: "生存猎手包", dust: 1088, tickets: 8, xp: 320, unlock: 1 },
    GIANT999: { label: "巨星训练包", dust: 999, tickets: 9, xp: 360, unlock: 1 },
    NEON777: { label: "霓虹外观包", dust: 777, tickets: 7, xp: 220, unlock: 1 },
    KOI2026: { label: "锦鲤幸运包", dust: 2026, tickets: 12, xp: 520, unlock: 2 }
  };
  const SHOP_DIRECT_ITEMS = [
    { action: "buy-halo-orbit", type: "halo", key: "orbit", cost: 760, desc: "普通光环" },
    { action: "buy-trail-aurora", type: "trail", key: "aurora-trail", cost: 1180, desc: "史诗拖尾" },
    { action: "buy-skin-thunder", type: "skin", key: "thunder", cost: 1560, desc: "史诗皮肤" },
    { action: "buy-halo-void", type: "halo", key: "void-gate", cost: 2380, desc: "传说光环" },
    { action: "buy-trail-demon", type: "trail", key: "demon-trail", cost: 2280, desc: "传说拖尾" },
    { action: "buy-skin-crown", type: "skin", key: "crown", cost: 1280, desc: "史诗皮肤" },
    { action: "buy-spore-royal", type: "spore", key: "royal", cost: 1680, desc: "传说孢子" },
    { action: "buy-skin-phoenix", type: "skin", key: "phoenix", cost: 1480, desc: "史诗皮肤" },
    { action: "buy-halo-neon", type: "halo", key: "neon-ring", cost: 1320, desc: "史诗光环" },
    { action: "buy-trail-koi", type: "trail", key: "koi-trail", cost: 980, desc: "稀有拖尾" },
    { action: "buy-spore-storm", type: "spore", key: "storm-pearl", cost: 1880, desc: "传说孢子" },
    { action: "buy-skin-zero", type: "skin", key: "zero-code", cost: 2600, desc: "传说皮肤" },
    { action: "buy-halo-lotus", type: "halo", key: "lotus-crown", cost: 2360, desc: "传说光环" },
    { action: "buy-trail-blackhole", type: "trail", key: "blackhole-trail", cost: 2480, desc: "传说拖尾" }
  ];
  const PERK_SHOP_ITEMS = [
    { key: "start", name: "开局补给仓", desc: "每级开局质量 +40。", baseCost: 520, max: 10 },
    { key: "reward", name: "星尘结算仪", desc: "每级结算星尘 +8%。", baseCost: 680, max: 10 },
    { key: "rebate", name: "锻造返利炉", desc: "每级锻造消耗降低 3.5%。", baseCost: 620, max: 10 },
    { key: "daily", name: "每日补给扩容", desc: "每日补给随等级增加星尘、经验和券。", baseCost: 480, max: 10 },
    { key: "luck", name: "人品护符", desc: "每级提高人品积累速度。", baseCost: 720, max: 10 },
    { key: "resonance", name: "星图共鸣", desc: "每级同时提高开局质量、星尘结算和每日补给。", baseCost: 860, max: 20 }
  ];
  const META_VERSION = 4;

  let dpr = 1;
  let view = { w: 0, h: 0 };
  let camera = { x: WORLD / 2, y: WORLD / 2 };
  let zoom = 0.82;
  let pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let groups = [];
  let playerGroup;
  let foods = [];
  let foodGrid = new Map();
  let foodSpawnBank = 0;
  let viruses = [];
  let virusRespawnQueue = [];
  let ejected = [];
  let particles = [];
  let rings = [];
  let lastCellSpace = null;
  let renderCells = [];
  const gpuFoodSprites = [];
  const gpuFrameState = { time: 0, camera: { x: 0, y: 0 }, zoom: 1, foods: null };
  const visibleCellBuffer = [];
  const ejectedCandidateBuffer = [];
  const ejectedVirusCandidateBuffer = [];
  const cellCandidateBuffer = [];
  const virusCandidateBuffer = [];
  const virusCollisionSpace = { grid: new Map(), bucketPool: [], bucketCount: 0, maxRadius: 0 };
  const cellSpacePool = [
    { cells: [], grid: new Map(), bucketPool: [], bucketCount: 0, maxRadius: 0 },
    { cells: [], grid: new Map(), bucketPool: [], bucketCount: 0, maxRadius: 0 }
  ];
  let cellSpacePoolIndex = 0;
  let perf = {
    avgFrame: 16,
    avgWork: 8,
    lowQuality: false,
    nextMiniDraw: 0,
    nextStatusUpdate: 0,
    nextQualityCheck: 0,
    drawnFood: 0,
    drawnCells: 0,
    maxFrame: 0,
    longFrames: 0,
    pixelRatioCap: renderRatioCeiling(),
    qualityPressure: 0,
    qualityRecovery: 0,
    scaleChanges: 0,
    backingStoreResizes: 0,
    renderedFrames: 0,
    skippedRenderFrames: 0,
    lastRankHtml: "",
    lastTagHtml: ""
  };
  let input = { ejectHeld: false };
  let joystick = { active: false, pointerId: null, x: 0, y: 0 };
  let game = {};
  let safeZone = {};
  let controlPoints = [];
  let teamScores = [];
  let matchEvent = { active: null, nextAt: 0, endsAt: 0, recent: [], virusBank: 0 };
  let activeMode = "battle";
  let selectedMode = "battle";
  let activeLobbyPanel = "play";
  let meta = loadMeta();
  let selectedSkin = localStorage.getItem("ballArenaSkin") || "aqua";
  let selectedSpore = localStorage.getItem("ballArenaSpore") || "mint";
  let selectedHalo = localStorage.getItem("ballArenaHalo") || "none";
  let selectedTrail = localStorage.getItem("ballArenaTrail") || "none";
  if (!meta.unlockedSkins.includes(selectedSkin)) selectedSkin = "aqua";
  if (!meta.unlockedSpores.includes(selectedSpore)) selectedSpore = "mint";
  if (!meta.unlockedHalos.includes(selectedHalo)) selectedHalo = "none";
  if (!meta.unlockedTrails.includes(selectedTrail)) selectedTrail = "none";
  let lastFrame = performance.now();
  let lastRenderedAt = 0;
  let nextRenderAt = 0;
  let lastPlayerEject = 0;
  let hudTimer = 0;
  let runId = 0;
  let entitySequence = 0;
  let authorityTick = 0;
  let authorityMode = false;
  const authorityPlayers = new Map();
  let eventBannerTimer = 0;
  let lobbyToastTimer = 0;
  let musicEnabled = localStorage.getItem("ballArenaMusic") === "on";
  let simulationAccumulator = 0;
  let simulationNow = lastFrame;
  let authorityNow = lastFrame;
  let previousCameraX = camera.x;
  let previousCameraY = camera.y;
  let previousZoom = zoom;
  let frameCameraX = camera.x;
  let frameCameraY = camera.y;
  let frameZoom = zoom;
  let gpuLayerReady = false;
  let gpuLayerHasFood = false;
  let lastGpuFrame = -Infinity;

  function renderRatioCeiling() {
    const deviceRatio = window.devicePixelRatio || 1;
    const cssPixels = Math.max(1, window.innerWidth * window.innerHeight);
    const pixelBudgetRatio = Math.sqrt(MAX_FOREGROUND_PIXELS / cssPixels);
    return clamp(pixelBudgetRatio, 0.65, Math.min(QUALITY_PRESET.maximumDpr, deviceRatio));
  }

  function resize() {
    const ratioCeiling = renderRatioCeiling();
    perf.pixelRatioCap = Math.min(perf.pixelRatioCap, ratioCeiling);
    dpr = Math.min(perf.pixelRatioCap, window.devicePixelRatio || 1);
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    const targetWidth = Math.max(1, Math.floor(view.w * dpr));
    const targetHeight = Math.max(1, Math.floor(view.h * dpr));
    const backingStoreChanged = canvas.width !== targetWidth || canvas.height !== targetHeight;
    if (backingStoreChanged) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      perf.backingStoreResizes += 1;
    }
    canvas.style.width = `${view.w}px`;
    canvas.style.height = `${view.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    if (backingStoreChanged) {
      ctx.fillStyle = "#061015";
      ctx.fillRect(0, 0, view.w, view.h);
    }
    const qualityDrop = Math.max(0, ratioCeiling - perf.pixelRatioCap);
    const gpuRatioCeiling = gameplayCore.gpuPixelRatioCeiling(gpuRenderer?.info().device);
    const gpuRatio = clamp(Math.min(gpuRatioCeiling, dpr) - qualityDrop * 1.5, 0.6, gpuRatioCeiling);
    if (gpuRenderer) gpuRenderer.resize(view.w, view.h, gpuRatio);
    if (gpuRenderer) {
      gpuLayerReady = false;
      gpuLayerHasFood = false;
      lastGpuFrame = -Infinity;
    }
    document.documentElement.classList.toggle("performance-mode", view.w * view.h * dpr * dpr > 2200000);
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function nextEntityId(prefix) {
    entitySequence += 1;
    return `${prefix}-${runId}-${entitySequence}`;
  }

  function isGameplayHuman(group) {
    return authorityMode ? Boolean(group?.authorityParticipant) : Boolean(group?.isPlayer);
  }

  function isHumanControlled(group) {
    return authorityMode
      ? Boolean(group?.authorityParticipant && group.connected !== false)
      : Boolean(group?.isPlayer);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function damp(rate, dt) {
    return 1 - Math.exp(-rate * dt);
  }

  function easeInOut(t) {
    return t * t * (3 - 2 * t);
  }

  function radiusFromMass(mass) {
    return gameplayCore.radiusFromMass(mass);
  }

  function distSq(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function distance(a, b) {
    return Math.sqrt(distSq(a, b));
  }

  function norm(dx, dy) {
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length, length };
  }

  function rectArenaBounds(margin = 0) {
    const config = modeConfig();
    if (!config.rectArena) return null;
    const width = WORLD * (config.arenaWidth || 0.78);
    const height = WORLD * (config.arenaHeight || 0.54);
    const safeMargin = Math.min(Math.max(0, margin || 0), Math.max(0, Math.min(width, height) / 2 - 24));
    return {
      left: (WORLD - width) / 2 + safeMargin,
      right: (WORLD + width) / 2 - safeMargin,
      top: (WORLD - height) / 2 + safeMargin,
      bottom: (WORLD + height) / 2 - safeMargin
    };
  }

  function randomWorldPoint(margin) {
    const m = margin || 80;
    const rect = rectArenaBounds(m);
    if (rect) return { x: rand(rect.left, rect.right), y: rand(rect.top, rect.bottom) };
    return { x: rand(m, WORLD - m), y: rand(m, WORLD - m) };
  }

  function randomPointInZone(margin) {
    if (rectArenaBounds()) return randomWorldPoint(margin);
    if (!safeZone || !safeZone.radius || safeZone.enabled === false) return randomWorldPoint(margin);
    const r = Math.max(80, safeZone.radius - (margin || 120));
    const angle = rand(0, Math.PI * 2);
    const dist = Math.sqrt(Math.random()) * r;
    return {
      x: clamp(safeZone.x + Math.cos(angle) * dist, margin || 80, WORLD - (margin || 80)),
      y: clamp(safeZone.y + Math.sin(angle) * dist, margin || 80, WORLD - (margin || 80))
    };
  }

  function clampPlayablePoint(x, y, margin = 80) {
    const rect = rectArenaBounds(margin);
    if (rect) {
      return {
        x: clamp(x, rect.left, rect.right),
        y: clamp(y, rect.top, rect.bottom)
      };
    }
    return {
      x: clamp(x, margin, WORLD - margin),
      y: clamp(y, margin, WORLD - margin)
    };
  }

  function randomColor(index) {
    return COLORS[index % COLORS.length];
  }

  function botName(index) {
    const base = BOT_NAMES[index % BOT_NAMES.length];
    const round = Math.floor(index / BOT_NAMES.length);
    return round ? `${base}${round + 1}` : base;
  }

  function modeConfig() {
    return GAME_MODES[activeMode] || GAME_MODES.battle;
  }

  function selectedModeConfig() {
    return GAME_MODES[selectedMode] || GAME_MODES.battle;
  }

  function sameTeam(a, b) {
    const config = modeConfig();
    return config.teams > 0 && a.team !== null && a.team !== undefined && a.team === b.team;
  }

  function groupInvincible(group, now = authorityNow) {
    return !group.dead && (group.invincibleUntil || 0) > now;
  }

  function activeEventFactor(key, fallback = 1) {
    return matchEvent.active && matchEvent.active[key] !== undefined ? matchEvent.active[key] : fallback;
  }

  function maxCellsFor(group) {
    const config = modeConfig();
    const cap = group && !isGameplayHuman(group) && config.botMaxCells ? config.botMaxCells : config.maxCells;
    return Math.max(1, Math.floor(cap || MAX_CELLS));
  }

  function showEventBanner(title, desc, color) {
    clearTimeout(eventBannerTimer);
    eventBanner.textContent = `${title} · ${desc}`;
    eventBanner.style.borderColor = color || "rgba(255, 255, 255, 0.22)";
    eventBanner.style.boxShadow = `0 18px 60px rgba(0, 0, 0, 0.42), 0 0 24px ${color || "rgba(255, 255, 255, 0.24)"}`;
    eventBanner.classList.add("show");
    eventBannerTimer = setTimeout(() => eventBanner.classList.remove("show"), 2600);
  }

  function showLobbyToast(message, color = "#ffd166") {
    clearTimeout(lobbyToastTimer);
    lobbyToast.textContent = message;
    lobbyToast.style.borderColor = color;
    lobbyToast.style.boxShadow = `0 18px 60px rgba(0, 0, 0, 0.42), 0 0 28px ${color}`;
    lobbyToast.classList.add("show");
    lobbyToastTimer = setTimeout(() => lobbyToast.classList.remove("show"), 2400);
  }

  async function copyText(value) {
    if (window.starClusterDesktop?.copyText) return window.starClusterDesktop.copyText(value);
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    }
  }

  function updateMusicButtons() {
    const label = musicEnabled ? "BGM 开" : "BGM 关";
    musicBtn.textContent = musicEnabled ? "乐" : "音";
    musicBtn.classList.toggle("active", musicEnabled);
    musicLobbyBtn.textContent = label;
    musicLobbyBtn.classList.toggle("active", musicEnabled);
  }

  function startMusic() { window.ScaAudio?.setMusic(true); }
  function stopMusic() { window.ScaAudio?.setMusic(false); }
  function setMusic(enabled) {
    musicEnabled = Boolean(enabled);
    localStorage.setItem("ballArenaMusic", musicEnabled ? "on" : "off");
    window.ScaAudio?.setMusic(musicEnabled);
    updateMusicButtons();
  }

  function toggleMusic() {
    setMusic(!musicEnabled);
  }

  function forgeLevelFromXp(xp) {
    const safeXp = Math.max(0, Number(xp) || 0);
    let level = 1;
    while (safeXp >= forgeXpForLevel(level + 1) && level < 999) {
      level += 1;
    }
    return level;
  }

  function forgeXpForLevel(level) {
    const target = Math.max(1, Math.floor(level));
    let total = 0;
    for (let i = 1; i < target; i++) {
      total += 80 + i * 45 + Math.floor(Math.pow(i, 1.35) * 18);
    }
    return total;
  }

  function forgeLevelProgress() {
    const xp = Math.max(0, Number(meta.forgeXp) || 0);
    const level = forgeLevelFromXp(xp);
    const currentFloor = forgeXpForLevel(level);
    const next = forgeXpForLevel(level + 1);
    return {
      level,
      xp,
      current: xp - currentFloor,
      needed: next - currentFloor,
      pct: clamp(((xp - currentFloor) / (next - currentFloor)) * 100, 0, 100),
      maxed: false
    };
  }

  function defaultMeta() {
    return {
      metaVersion: META_VERSION,
      dust: 150,
      forgeLevel: 1,
      forgeLuck: 0,
      forgeXp: 0,
      forgeTickets: 2,
      forgePityEpic: 0,
      forgePityLegend: 0,
      unlockedSkins: SKINS.filter(skin => skin.type !== "special").map(skin => skin.key),
      unlockedSpores: SPORES.filter(spore => spore.type !== "special").map(spore => spore.key),
      unlockedHalos: HALOS.filter(halo => halo.type !== "special").map(halo => halo.key),
      unlockedTrails: TRAILS.filter(trail => trail.type !== "special").map(trail => trail.key),
      crafted: 0,
      totalDust: 150,
      redeemedCodes: [],
      dailyPackDate: "",
      perks: { start: 0, reward: 0, rebate: 0, daily: 0, luck: 0, resonance: 0 },
      shopMessage: "",
      lastForge: null
    };
  }

  function loadMeta() {
    try {
      const saved = JSON.parse(localStorage.getItem("ballArenaMeta") || "null");
      const base = defaultMeta();
      if (!saved || typeof saved !== "object") return base;
      const migratedDust = Number.isFinite(saved.dust) ? saved.dust + (saved.metaVersion === META_VERSION ? 0 : 90) : base.dust;
      const migratedXp = Number.isFinite(saved.forgeXp)
        ? saved.forgeXp
        : Math.max(0, ((Number(saved.forgeLevel) || 1) - 1) * 120);
      const validSkins = new Set(SKINS.map(skin => skin.key));
      const validSpores = new Set(SPORES.map(spore => spore.key));
      const validHalos = new Set(HALOS.map(halo => halo.key));
      const validTrails = new Set(TRAILS.map(trail => trail.key));
      const forgeXp = clamp(migratedXp, 0, 100_000_000);
      return {
        ...base,
        ...saved,
        metaVersion: META_VERSION,
        dust: clamp(migratedDust, 0, 100_000_000),
        totalDust: clamp(Number(saved.totalDust) || migratedDust, 0, 100_000_000),
        crafted: clamp(Math.floor(Number(saved.crafted) || 0), 0, 1_000_000),
        forgeLuck: clamp(Number(saved.forgeLuck) || 0, 0, 99),
        forgeXp,
        forgeLevel: forgeLevelFromXp(forgeXp),
        forgeTickets: Number.isFinite(saved.forgeTickets) ? clamp(Math.floor(saved.forgeTickets), 0, 1_000_000) : base.forgeTickets,
        forgePityEpic: clamp(Number(saved.forgePityEpic) || 0, 0, 10),
        forgePityLegend: clamp(Number(saved.forgePityLegend) || 0, 0, 40),
        perks: Object.fromEntries(Object.keys(base.perks).map(key => [
          key,
          clamp(Math.floor(Number(saved.perks && saved.perks[key]) || 0), 0, PERK_SHOP_ITEMS.find(item => item.key === key)?.max || 10)
        ])),
        redeemedCodes: Array.isArray(saved.redeemedCodes) ? saved.redeemedCodes : [],
        dailyPackDate: saved.dailyPackDate || "",
        shopMessage: saved.shopMessage || "",
        unlockedSkins: [...new Set([...(Array.isArray(saved.unlockedSkins) ? saved.unlockedSkins : []), ...base.unlockedSkins])].filter(key => validSkins.has(key)),
        unlockedSpores: [...new Set([...(Array.isArray(saved.unlockedSpores) ? saved.unlockedSpores : []), ...base.unlockedSpores])].filter(key => validSpores.has(key)),
        unlockedHalos: [...new Set([...(Array.isArray(saved.unlockedHalos) ? saved.unlockedHalos : []), ...base.unlockedHalos])].filter(key => validHalos.has(key)),
        unlockedTrails: [...new Set([...(Array.isArray(saved.unlockedTrails) ? saved.unlockedTrails : []), ...base.unlockedTrails])].filter(key => validTrails.has(key))
      };
    } catch (_) {
      return defaultMeta();
    }
  }

  function saveMeta() {
    localStorage.setItem("ballArenaMeta", JSON.stringify(meta));
  }

  function skinUnlocked(key) {
    return meta.unlockedSkins.includes(key);
  }

  function sporeUnlocked(key) {
    return meta.unlockedSpores.includes(key);
  }

  function haloUnlocked(key) {
    return meta.unlockedHalos.includes(key);
  }

  function trailUnlocked(key) {
    return meta.unlockedTrails.includes(key);
  }

  function selectedSkinDef() {
    return SKINS.find(skin => skin.key === selectedSkin) || SKINS[0];
  }

  function selectedSporeDef() {
    return SPORES.find(spore => spore.key === selectedSpore) || SPORES[0];
  }

  function selectedHaloDef() {
    return HALOS.find(halo => halo.key === selectedHalo) || HALOS[0];
  }

  function selectedTrailDef() {
    return TRAILS.find(trail => trail.key === selectedTrail) || TRAILS[0];
  }

  function isSpecial(item) {
    return item && item.type === "special";
  }

  function forgeSkins() {
    return SKINS.filter(isSpecial);
  }

  function forgeSpores() {
    return SPORES.filter(isSpecial);
  }

  function forgeHalos() {
    return HALOS.filter(isSpecial);
  }

  function forgeTrails() {
    return TRAILS.filter(isSpecial);
  }

  function swatchStyle(item) {
    if (isSpecial(item)) {
      const accent = item.accent || "#ffffff";
      return `color:${accent};background:radial-gradient(circle at 30% 25%, ${accent}, ${item.color} 45%, #0f172a 100%)`;
    }
    return `color:${item.color};background:${item.color}`;
  }

  function cosmeticLabel(item) {
    return item.name;
  }

  function cosmeticStateLabel(item, unlocked) {
    if (!isSpecial(item)) return "基础";
    return rarityText(item);
  }

  function ownedSpecialCount() {
    return forgeSkins().filter(item => skinUnlocked(item.key)).length +
      forgeSpores().filter(item => sporeUnlocked(item.key)).length +
      forgeHalos().filter(item => haloUnlocked(item.key)).length +
      forgeTrails().filter(item => trailUnlocked(item.key)).length;
  }

  function totalSpecialCount() {
    return forgeSkins().length + forgeSpores().length + forgeHalos().length + forgeTrails().length;
  }

  function perkLevel(key) {
    return clamp(Math.floor(Number(meta.perks && meta.perks[key]) || 0), 0, PERK_SHOP_ITEMS.find(item => item.key === key)?.max || 10);
  }

  function perkCost(offer) {
    const level = perkLevel(offer.key);
    return Math.floor(offer.baseCost * (1 + level * 0.72));
  }

  function growthStats() {
    const owned = ownedSpecialCount();
    const total = totalSpecialCount();
    const forgeLevel = Math.max(1, meta.forgeLevel || 1);
    const crafted = Math.max(0, meta.crafted || 0);
    const totalDust = Math.max(0, meta.totalDust || 0);
    const resonance = perkLevel("resonance");
    const level = Math.max(1,
      Math.floor(owned / 3) +
      Math.floor(forgeLevel / 2) +
      Math.floor(crafted / 10) +
      Math.floor(totalDust / 2200) +
      Math.floor(resonance / 2)
    );
    const startMass = Math.round(
      24 +
      owned * 5 +
      forgeLevel * 12 +
      Math.floor(crafted / 2.5) +
      Math.floor(totalDust / 720) +
      perkLevel("start") * 40 +
      resonance * 18
    );
    const rewardPct = Math.round(
      12 +
      owned * 2.4 +
      forgeLevel * 4 +
      Math.floor(crafted / 4) * 3 +
      Math.floor(totalDust / 950) * 3 +
      perkLevel("reward") * 8 +
      resonance * 3
    );
    return { owned, total, level, startMass, rewardPct, forgeLevel, crafted, totalDust };
  }

  function playerStartMassFor(config) {
    return (config.playerStartMass || 220) + growthStats().startMass;
  }

  function growthRewardMultiplier() {
    return 1 + growthStats().rewardPct / 100;
  }

  function renderProgress() {
    const stats = growthStats();
    const theme = forgeThemeForLevel(meta.forgeLevel || 1);
    const nodes = [4, 12, 24, 40, 60].map(target => ({
      target,
      active: stats.owned >= target,
      label: `${target} 外观`
    }));
    progressPanel.innerHTML = `
      <div class="progress-grid">
        <div class="progress-card"><strong>Lv.${stats.level}</strong><span>收藏等级，外观和铁匠铺共同提升。</span></div>
        <div class="progress-card"><strong>${stats.owned}/${stats.total}</strong><span>特殊外观收藏进度。</span></div>
        <div class="progress-card"><strong>+${stats.startMass}</strong><span>每局开局质量加成。</span></div>
        <div class="progress-card"><strong>+${stats.rewardPct}%</strong><span>结算星尘加成。</span></div>
      </div>
      <div class="progress-grid">
        <div class="progress-card"><strong>${theme.name}</strong><span>当前铁匠铺外观。</span></div>
        <div class="progress-card"><strong>${Math.floor(meta.crafted || 0)}</strong><span>累计锻造次数。</span></div>
        <div class="progress-card"><strong>${Math.floor(meta.totalDust || 0)}</strong><span>累计获得星尘。</span></div>
        <div class="progress-card"><strong>${Math.floor(meta.forgeTickets || 0)}</strong><span>可用锻造券。</span></div>
      </div>
      <div class="progress-grid">
        <div class="progress-card"><strong>Lv.${perkLevel("start")}</strong><span>开局补给仓。</span></div>
        <div class="progress-card"><strong>Lv.${perkLevel("reward")}</strong><span>星尘结算仪。</span></div>
        <div class="progress-card"><strong>Lv.${perkLevel("rebate")}</strong><span>锻造返利炉。</span></div>
        <div class="progress-card"><strong>Lv.${perkLevel("luck")}</strong><span>人品护符。</span></div>
        <div class="progress-card"><strong>Lv.${perkLevel("resonance")}</strong><span>星图共鸣。</span></div>
      </div>
      <div class="progress-road">
        ${nodes.map(node => `<div class="progress-node${node.active ? " active" : ""}"><strong>${node.label}</strong><br>${node.active ? "已激活" : `还差 ${Math.max(0, node.target - stats.owned)}`}</div>`).join("")}
      </div>
    `;
  }

  function chooseOwned(items, unlockedFn) {
    const owned = items.filter(item => unlockedFn(item.key));
    return randomItem(owned.length ? owned : items);
  }

  function randomizeOwnedLook() {
    selectedSkin = chooseOwned(SKINS, skinUnlocked).key;
    selectedSpore = chooseOwned(SPORES, sporeUnlocked).key;
    selectedHalo = chooseOwned(HALOS, haloUnlocked).key;
    selectedTrail = chooseOwned(TRAILS, trailUnlocked).key;
    localStorage.setItem("ballArenaSkin", selectedSkin);
    localStorage.setItem("ballArenaSpore", selectedSpore);
    localStorage.setItem("ballArenaHalo", selectedHalo);
    localStorage.setItem("ballArenaTrail", selectedTrail);
    renderCosmetics();
    showLobbyToast("已随机切换一套已拥有外观", "#58edc8");
  }

  function rarityText(item) {
    return item && item.rarity ? item.rarity : "基础";
  }

  function tierClass(item) {
    return item && item.tier ? item.tier : "common";
  }

  function renderMetaStrip() {
    const progress = forgeLevelProgress();
    const growth = growthStats();
    metaStrip.innerHTML = `
      <div class="meta-pill">星尘 ${Math.floor(meta.dust)}<span>对局与补给获得</span></div>
      <div class="meta-pill">锻造券 ${Math.floor(meta.forgeTickets || 0)}<span>锻造优先消耗</span></div>
      <div class="meta-pill">铁匠铺 Lv.${progress.level}<span>${progress.maxed ? `总经验 ${Math.floor(progress.xp)}` : `${Math.floor(progress.current)}/${progress.needed}`}</span></div>
      <div class="meta-pill">收藏 Lv.${growth.level}<span>开局 +${growth.startMass} · 星尘 +${growth.rewardPct}%</span></div>
    `;
  }

  function renderCosmetics() {
    skinGrid.innerHTML = SKINS.map(skin => `
      <button class="cosmetic-card${skin.key === selectedSkin ? " active" : ""}${isSpecial(skin) ? " special" : ""}${skinUnlocked(skin.key) && isSpecial(skin) ? " owned" : ""}" type="button" data-skin="${skin.key}" ${skinUnlocked(skin.key) ? "" : "disabled"} title="${skin.name} ${rarityText(skin)}">
        <i class="swatch${isSpecial(skin) ? " special" : ""}" style="${swatchStyle(skin)}"></i>
        <span>${cosmeticLabel(skin)}</span>
        <small>${cosmeticStateLabel(skin, skinUnlocked(skin))}</small>
      </button>
    `).join("");
    sporeGrid.innerHTML = SPORES.map(spore => `
      <button class="cosmetic-card${spore.key === selectedSpore ? " active" : ""}${isSpecial(spore) ? " special" : ""}${sporeUnlocked(spore.key) && isSpecial(spore) ? " owned" : ""}" type="button" data-spore="${spore.key}" ${sporeUnlocked(spore.key) ? "" : "disabled"} title="${spore.name} ${rarityText(spore)}">
        <i class="swatch${isSpecial(spore) ? " special" : ""}" style="${swatchStyle(spore)}"></i>
        <span>${cosmeticLabel(spore)}</span>
        <small>${cosmeticStateLabel(spore, sporeUnlocked(spore))}</small>
      </button>
    `).join("");
    haloGrid.innerHTML = HALOS.map(halo => `
      <button class="cosmetic-card${halo.key === selectedHalo ? " active" : ""}${isSpecial(halo) ? " special" : ""}${haloUnlocked(halo.key) && isSpecial(halo) ? " owned" : ""}" type="button" data-halo="${halo.key}" ${haloUnlocked(halo.key) ? "" : "disabled"} title="${halo.name} ${rarityText(halo)}">
        <i class="swatch${isSpecial(halo) ? " special" : ""}" style="${swatchStyle(halo)}"></i>
        <span>${cosmeticLabel(halo)}</span>
        <small>${cosmeticStateLabel(halo, haloUnlocked(halo))}</small>
      </button>
    `).join("");
    trailGrid.innerHTML = TRAILS.map(trail => `
      <button class="cosmetic-card${trail.key === selectedTrail ? " active" : ""}${isSpecial(trail) ? " special" : ""}${trailUnlocked(trail.key) && isSpecial(trail) ? " owned" : ""}" type="button" data-trail="${trail.key}" ${trailUnlocked(trail.key) ? "" : "disabled"} title="${trail.name} ${rarityText(trail)}">
        <i class="swatch${isSpecial(trail) ? " special" : ""}" style="${swatchStyle(trail)}"></i>
        <span>${cosmeticLabel(trail)}</span>
        <small>${cosmeticStateLabel(trail, trailUnlocked(trail))}</small>
      </button>
    `).join("");
    renderMetaStrip();
    renderForge();
    renderShop();
    renderProgress();
  }

  function forgeCost(type) {
    const level = Math.max(1, meta.forgeLevel || 1);
    let base;
    if (type === "skin") base = 82 + level * 8;
    else if (type === "spore") base = 68 + level * 7;
    else if (type === "halo") base = 88 + level * 9;
    else if (type === "trail") base = 80 + level * 8;
    else base = 76 + level * 8;
    return Math.max(25, Math.round(base * (1 - perkLevel("rebate") * 0.035)));
  }

  function canPayForge(type) {
    return (meta.forgeTickets || 0) > 0 || meta.dust >= forgeCost(type);
  }

  function forgePaymentText(type) {
    return (meta.forgeTickets || 0) > 0 ? "券" : `${forgeCost(type)}`;
  }

  function spendForgePayment(type) {
    if ((meta.forgeTickets || 0) > 0) {
      meta.forgeTickets -= 1;
      return { ticket: true, cost: 0 };
    }
    const cost = forgeCost(type);
    if (meta.dust < cost) return null;
    meta.dust -= cost;
    return { ticket: false, cost };
  }

  function forgePool(type) {
    if (type === "spore") return forgeSpores();
    if (type === "halo") return forgeHalos();
    if (type === "trail") return forgeTrails();
    return forgeSkins();
  }

  function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)] || items[0];
  }

  function rollForgeTier() {
    if ((meta.forgePityLegend || 0) >= 39) return "legendary";
    if ((meta.forgePityEpic || 0) >= 9) return Math.random() < 0.16 ? "legendary" : "epic";
    let roll = Math.random();
    for (const tier of RARITY_ORDER) {
      roll -= RARITY_CONFIG[tier].chance;
      if (roll <= 0) return tier;
    }
    return "common";
  }

  function updateForgePity(tier) {
    if (tier === "legendary") {
      meta.forgePityLegend = 0;
      meta.forgePityEpic = 0;
    } else {
      meta.forgePityLegend = clamp((meta.forgePityLegend || 0) + 1, 0, 40);
      meta.forgePityEpic = tier === "epic" ? 0 : clamp((meta.forgePityEpic || 0) + 1, 0, 10);
    }
  }

  function pickForgeItem(type) {
    const pool = forgePool(type);
    let tier = rollForgeTier();
    let items = pool.filter(item => tierClass(item) === tier);
    if (!items.length) {
      tier = "common";
      items = pool.filter(item => tierClass(item) === tier);
    }
    updateForgePity(tier);
    return randomItem(items.length ? items : pool);
  }

  function rollBurstMultiplier() {
    const luck = clamp(meta.forgeLuck || 0, 0, 99);
    const roll = Math.random();
    const boost = (luck + perkLevel("luck") * 5) / 1000;
    let multiplier = 1;
    if (roll < 0.004 + boost * 0.12) multiplier = 16;
    else if (roll < 0.014 + boost * 0.22) multiplier = 8;
    else if (roll < 0.05 + boost * 0.38) multiplier = 4;
    else if (roll < 0.16 + boost * 0.58) multiplier = 2;
    meta.forgeLuck = multiplier > 1 ? 0 : clamp(luck + 9 + perkLevel("luck"), 0, 99);
    return multiplier;
  }

  function forgeRewardForLevel(level) {
    return FORGE_LEVEL_REWARDS[level] || {
      dust: Math.min(1200, 240 + level * 42),
      tickets: Math.min(8, 1 + Math.floor(level / 4))
    };
  }

  function grantForgeLevelRewards(fromLevel, toLevel) {
    const rewards = [];
    for (let level = fromLevel + 1; level <= toLevel; level++) {
      const reward = forgeRewardForLevel(level);
      meta.dust += reward.dust || 0;
      meta.forgeTickets = (meta.forgeTickets || 0) + (reward.tickets || 0);
      rewards.push(`Lv.${level} +${reward.dust || 0}星尘 +${reward.tickets || 0}券`);
    }
    return rewards;
  }

  function addForgeXp(amount) {
    const gain = Math.max(0, Math.floor(amount));
    const before = forgeLevelFromXp(meta.forgeXp || 0);
    meta.forgeXp = Math.max(0, (meta.forgeXp || 0) + gain);
    const after = forgeLevelFromXp(meta.forgeXp);
    meta.forgeLevel = after;
    return {
      xp: gain,
      levelBefore: before,
      levelAfter: after,
      rewards: grantForgeLevelRewards(before, after)
    };
  }

  function forgeThemeForLevel(level) {
    if (level <= FORGE_THEMES.length) return FORGE_THEMES[level - 1];
    return {
      name: `无尽炉心 +${level - FORGE_THEMES.length}`,
      color: FORGE_THEMES[FORGE_THEMES.length - 1].color
    };
  }

  function hasForgeItem(type, key) {
    if (type === "spore") return sporeUnlocked(key);
    if (type === "halo") return haloUnlocked(key);
    if (type === "trail") return trailUnlocked(key);
    return skinUnlocked(key);
  }

  function cosmeticByType(type, key) {
    if (type === "spore") return SPORES.find(item => item.key === key);
    if (type === "halo") return HALOS.find(item => item.key === key);
    if (type === "trail") return TRAILS.find(item => item.key === key);
    return SKINS.find(item => item.key === key);
  }

  function unlockForgeItem(type, item) {
    if (type === "trail") {
      if (!trailUnlocked(item.key)) meta.unlockedTrails.push(item.key);
      selectedTrail = item.key;
      localStorage.setItem("ballArenaTrail", selectedTrail);
    } else if (type === "halo") {
      if (!haloUnlocked(item.key)) meta.unlockedHalos.push(item.key);
      selectedHalo = item.key;
      localStorage.setItem("ballArenaHalo", selectedHalo);
    } else if (type === "spore") {
      if (!sporeUnlocked(item.key)) meta.unlockedSpores.push(item.key);
      selectedSpore = item.key;
      localStorage.setItem("ballArenaSpore", selectedSpore);
    } else {
      if (!skinUnlocked(item.key)) meta.unlockedSkins.push(item.key);
      selectedSkin = item.key;
      localStorage.setItem("ballArenaSkin", selectedSkin);
    }
  }

  function formatForgeLog() {
    if (!meta.lastForge) return "暂无锻造记录";
    const parts = [`${meta.lastForge.type}：${meta.lastForge.item}`];
    if (meta.lastForge.duplicate) parts.push(`重复转经验 +${meta.lastForge.xp}`);
    else parts.push(`获得经验 +${meta.lastForge.xp}`);
    if (meta.lastForge.burst > 1) parts.push(`人品大爆发 x${meta.lastForge.burst}`);
    if (meta.lastForge.rewards && meta.lastForge.rewards.length) parts.push(meta.lastForge.rewards.join("，"));
    return parts.join("，");
  }

  function renderForge() {
    const specialSkins = forgeSkins();
    const specialSpores = forgeSpores();
    const specialHalos = forgeHalos();
    const specialTrails = forgeTrails();
    const lockedSkins = specialSkins.filter(skin => !skinUnlocked(skin.key));
    const lockedSpores = specialSpores.filter(spore => !sporeUnlocked(spore.key));
    const lockedHalos = specialHalos.filter(halo => !haloUnlocked(halo.key));
    const lockedTrails = specialTrails.filter(trail => !trailUnlocked(trail.key));
    const progress = forgeLevelProgress();
    const theme = forgeThemeForLevel(progress.level);
    const luck = clamp(meta.forgeLuck || 0, 0, 99);
    const last = formatForgeLog();
    const nextEpic = Math.max(1, 10 - (meta.forgePityEpic || 0));
    const nextLegend = Math.max(1, 40 - (meta.forgePityLegend || 0));
    const upcomingRewards = [1, 2, 3, 4].map(step => {
      const level = progress.level + step;
      const reward = forgeRewardForLevel(level);
      const rewardTheme = forgeThemeForLevel(level);
      return { level, reward, rewardTheme };
    });
    forgePanel.style.setProperty("--forge-theme", theme.color);
    forgePanel.innerHTML = `
      <div class="forge-row">
        <strong>星尘 ${Math.floor(meta.dust)}</strong>
        <span>锻造券 ${Math.floor(meta.forgeTickets || 0)} · 人品 ${luck}/100</span>
      </div>
      <div class="forge-skin">
        <span>工坊皮肤</span>
        <strong>${theme.name}</strong>
      </div>
      <div class="forge-stats">
        <div class="forge-stat">Lv.${progress.level}<span>${progress.maxed ? "满级经验继续累积" : "铁匠铺等级"}</span></div>
        <div class="forge-stat">${Math.floor(meta.forgeXp || 0)}<span>累计经验</span></div>
        <div class="forge-stat">${nextEpic}<span>史诗保底</span></div>
        <div class="forge-stat">${nextLegend}<span>传说保底</span></div>
      </div>
      <div class="forge-layout">
        <div class="forge-core">
          <div class="forge-slots">
            <span class="forge-slot">普通 58%</span>
            <span class="forge-slot">稀有 28%</span>
            <span class="forge-slot">爆发 x2-x16</span>
          </div>
          <div class="forge-meter level"><i style="width:${progress.pct}%"></i></div>
          <div class="pity-grid">
            <div class="pity-box">史诗 11%<span>10 抽内保底</span></div>
            <div class="pity-box">传说 3%<span>40 抽内保底</span></div>
          </div>
          <div class="rarity-row">
            ${RARITY_ORDER.map(tier => `<span class="rarity-chip">${RARITY_CONFIG[tier].label} ${Math.round(RARITY_CONFIG[tier].chance * 100)}%</span>`).join("")}
          </div>
          <div class="forge-note">重复外观会转为铁匠铺经验，升级自动发星尘和锻造券。</div>
          <div class="forge-prize-title" style="margin-top:10px">后续等级奖励</div>
          <div class="forge-prize-list compact">
            ${upcomingRewards.map(entry => `<span class="forge-prize unlocked">Lv.${entry.level} ${entry.rewardTheme.name}<br>+${entry.reward.dust || 0}星尘 +${entry.reward.tickets || 0}券</span>`).join("")}
          </div>
        </div>
        <div class="forge-prizes">
          <div class="forge-prize-title">皮肤 ${specialSkins.length - lockedSkins.length}/${specialSkins.length} · 孢子 ${specialSpores.length - lockedSpores.length}/${specialSpores.length} · 光环 ${specialHalos.length - lockedHalos.length}/${specialHalos.length} · 拖尾 ${specialTrails.length - lockedTrails.length}/${specialTrails.length}</div>
          <div class="forge-prize-list">
            ${[...specialSkins.map(item => ({ type: "skin", item })), ...specialSpores.map(item => ({ type: "spore", item })), ...specialHalos.map(item => ({ type: "halo", item })), ...specialTrails.map(item => ({ type: "trail", item }))].map(entry => `<span class="forge-prize ${tierClass(entry.item)}${hasForgeItem(entry.type, entry.item.key) ? " unlocked" : ""}">${entry.item.name}</span>`).join("")}
          </div>
        </div>
      </div>
      <div class="forge-actions">
        <button type="button" data-forge="skin" ${canPayForge("skin") ? "" : "disabled"}>锻皮肤 ${forgePaymentText("skin")}</button>
        <button type="button" data-forge="spore" ${canPayForge("spore") ? "" : "disabled"}>锻孢子 ${forgePaymentText("spore")}</button>
        <button type="button" data-forge="halo" ${canPayForge("halo") ? "" : "disabled"}>锻光环 ${forgePaymentText("halo")}</button>
        <button type="button" data-forge="trail" ${canPayForge("trail") ? "" : "disabled"}>锻拖尾 ${forgePaymentText("trail")}</button>
        <button type="button" data-forge="mixed" ${canPayForge("mixed") ? "" : "disabled"}>混合一锤 ${forgePaymentText("mixed")}</button>
      </div>
      <div class="forge-log">${last}</div>
    `;
  }

  function craftForge(type) {
    const actualType = type === "mixed" ? randomItem(["skin", "spore", "halo", "trail"]) : type;
    if (actualType !== "skin" && actualType !== "spore" && actualType !== "halo" && actualType !== "trail") return;
    const payment = spendForgePayment(type === "mixed" ? "mixed" : actualType);
    if (!payment) return;
    const item = pickForgeItem(actualType);
    if (!item) return;
    const duplicate = hasForgeItem(actualType, item.key);
    const burst = rollBurstMultiplier();
    const config = RARITY_CONFIG[tierClass(item)] || RARITY_CONFIG.common;
    const xpBase = duplicate ? config.exp : Math.max(8, Math.round(config.exp * 0.42));
    const xpGain = Math.max(1, Math.round(xpBase * burst));
    const levelResult = addForgeXp(xpGain);
    if (!duplicate) unlockForgeItem(actualType, item);
    meta.crafted += 1;
    meta.lastForge = {
      type: actualType === "trail" ? "特殊拖尾" : actualType === "halo" ? "特殊光环" : actualType === "spore" ? "特殊孢子" : "特殊皮肤",
      item: `${item.name} · ${rarityText(item)}`,
      duplicate,
      xp: xpGain,
      burst,
      ticket: payment.ticket,
      cost: payment.cost,
      rewards: levelResult.rewards
    };
    if (burst > 1) showLobbyToast(`人品大爆发 x${burst}！${item.name}`, RARITY_CONFIG[tierClass(item)]?.color || "#ffd166");
    else if (levelResult.rewards.length) showLobbyToast(`铁匠铺升至 Lv.${levelResult.levelAfter}`, "#58edc8");
    saveMeta();
    renderCosmetics();
  }

  function todayKey() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function renderShop() {
    const claimed = meta.dailyPackDate === todayKey();
    const dailyLevel = perkLevel("daily");
    const resonanceLevel = perkLevel("resonance");
    const dailyDust = 120 + dailyLevel * 45 + resonanceLevel * 20;
    const dailyTickets = 1 + Math.floor(dailyLevel / 3);
    const dailyXp = dailyLevel * 28;
    const directCards = SHOP_DIRECT_ITEMS.map(offer => {
      const item = cosmeticByType(offer.type, offer.key);
      if (!item) return "";
      const owned = hasForgeItem(offer.type, offer.key);
      return `
        <div class="shop-card">
          <strong>${item.name}</strong>
          <span>直购${offer.desc}，消耗 ${offer.cost} 星尘。</span>
          <button type="button" data-shop="${offer.action}" ${owned || meta.dust < offer.cost ? "disabled" : ""}>${owned ? "已拥有" : "直购"}</button>
        </div>
      `;
    }).join("");
    const perkCards = PERK_SHOP_ITEMS.map(offer => {
      const level = perkLevel(offer.key);
      const maxed = level >= offer.max;
      const cost = perkCost(offer);
      return `
        <div class="shop-card">
          <strong>${offer.name} Lv.${level}</strong>
          <span>${offer.desc}${maxed ? " 已满级。" : ` 下级消耗 ${cost} 星尘。`}</span>
          <button type="button" data-shop="perk-${offer.key}" ${maxed || meta.dust < cost ? "disabled" : ""}>${maxed ? "已满级" : "升级"}</button>
        </div>
      `;
    }).join("");
    shopPanel.innerHTML = `
      <div class="shop-grid">
        <div class="shop-card">
          <strong>每日补给</strong>
          <span>星尘 ${dailyDust}，锻造券 ${dailyTickets}${dailyXp ? `，经验 ${dailyXp}` : ""}。</span>
          <button type="button" data-shop="daily" ${claimed ? "disabled" : ""}>${claimed ? "已领取" : "领取"}</button>
        </div>
        <div class="shop-card">
          <strong>十连券包</strong>
          <span>消耗 900 星尘，锻造券 +10。</span>
          <button type="button" data-shop="ticket10" ${meta.dust >= 900 ? "" : "disabled"}>兑换</button>
        </div>
        <div class="shop-card">
          <strong>锻造券</strong>
          <span>消耗 120 星尘，锻造券 +1。</span>
          <button type="button" data-shop="ticket" ${meta.dust >= 120 ? "" : "disabled"}>兑换</button>
        </div>
        <div class="shop-card">
          <strong>匠心教材</strong>
          <span>消耗 160 星尘，铁匠铺经验 +90。</span>
          <button type="button" data-shop="xp" ${meta.dust >= 160 ? "" : "disabled"}>购买</button>
        </div>
        <div class="shop-card">
          <strong>工坊冲刺包</strong>
          <span>消耗 520 星尘，经验 +360，锻造券 +2。</span>
          <button type="button" data-shop="forge-boost" ${meta.dust >= 520 ? "" : "disabled"}>购买</button>
        </div>
        <div class="shop-card">
          <strong>随机特殊外观</strong>
          <span>消耗 1280 星尘，随机解锁一个未拥有特殊外观。</span>
          <button type="button" data-shop="random-special" ${meta.dust >= 1280 ? "" : "disabled"}>购买</button>
        </div>
        <div class="shop-card">
          <strong>传说火种</strong>
          <span>消耗 760 星尘，传说保底进度 +10。</span>
          <button type="button" data-shop="legend-seed" ${meta.dust >= 760 ? "" : "disabled"}>购买</button>
        </div>
        ${perkCards}
        ${directCards}
      </div>
      <div class="redeem-box">
        <div class="redeem-row">
          <input class="code-input" id="redeemCodeInput" maxlength="18" autocomplete="off" placeholder="兑换码">
          <button type="button" data-shop="redeem">兑换</button>
        </div>
        <div class="shop-message">${meta.shopMessage || "可用：STARS2026、FORGE777、BALL16X、HALO888、TRAIL999、ARENA2026、MUSIC2026、HUNTER888、GIANT999、NEON777、KOI2026"}</div>
      </div>
      <div class="redeem-box">
        <div class="redeem-row">
          <input class="code-input" id="exportSaveInput" readonly placeholder="点击导出生成存档码">
          <button type="button" data-shop="export-save">导出</button>
        </div>
        <div class="redeem-row">
          <input class="code-input" id="importSaveInput" autocomplete="off" placeholder="粘贴存档码">
          <button type="button" data-shop="import-save">导入</button>
        </div>
      </div>
    `;
  }

  function setShopMessage(message) {
    meta.shopMessage = message;
    const messageEl = shopPanel.querySelector(".shop-message");
    if (messageEl) messageEl.textContent = message;
  }

  function applyReward(reward) {
    const parts = [];
    if (reward.dust) {
      meta.dust += reward.dust;
      meta.totalDust = (meta.totalDust || 0) + reward.dust;
      parts.push(`星尘 +${reward.dust}`);
    }
    if (reward.tickets) {
      meta.forgeTickets = (meta.forgeTickets || 0) + reward.tickets;
      parts.push(`锻造券 +${reward.tickets}`);
    }
    if (reward.xp) {
      const levelResult = addForgeXp(reward.xp);
      parts.push(`经验 +${levelResult.xp}`);
      if (levelResult.rewards.length) parts.push(levelResult.rewards.join("，"));
    }
    if (reward.unlock) {
      const count = Math.max(1, Math.floor(Number(reward.unlock) || 1));
      const names = [];
      let fallback = 0;
      for (let i = 0; i < count; i++) {
        const item = unlockRandomSpecial();
        if (item) names.push(item.name);
        else fallback += 1;
      }
      if (names.length) parts.push(`外观 ${names.join("、")}`);
      if (fallback) parts.push(`全收集转经验 +${fallback * 120}`);
    }
    return parts.join("，");
  }

  function unlockRandomSpecial() {
    const locked = [
      ...forgeSkins().filter(item => !skinUnlocked(item.key)).map(item => ({ type: "skin", item })),
      ...forgeSpores().filter(item => !sporeUnlocked(item.key)).map(item => ({ type: "spore", item })),
      ...forgeHalos().filter(item => !haloUnlocked(item.key)).map(item => ({ type: "halo", item })),
      ...forgeTrails().filter(item => !trailUnlocked(item.key)).map(item => ({ type: "trail", item }))
    ];
    if (!locked.length) {
      addForgeXp(120);
      return null;
    }
    const result = randomItem(locked);
    unlockForgeItem(result.type, result.item);
    return result.item;
  }

  function encodeSaveCode() {
    const payload = {
      meta,
      selectedSkin,
      selectedSpore,
      selectedHalo,
      selectedTrail
    };
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }

  function decodeSaveCode(code) {
    return JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  }

  function exportSaveCode() {
    const input = shopPanel.querySelector("#exportSaveInput");
    if (!input) return;
    input.value = encodeSaveCode();
    input.focus();
    if (input.select) input.select();
    setShopMessage("存档码已生成，可复制到其他设备导入。");
  }

  function importSaveCode() {
    const input = shopPanel.querySelector("#importSaveInput");
    const raw = input ? input.value.trim() : "";
    if (!raw || raw.length > 128 * 1024) {
      setShopMessage("请先粘贴存档码。");
      return;
    }
    try {
      const payload = decodeSaveCode(raw);
      if (!payload || typeof payload !== "object" || !payload.meta) throw new Error("bad save");
      localStorage.setItem("ballArenaMeta", JSON.stringify(payload.meta));
      meta = loadMeta();
      selectedSkin = SKINS.some(item => item.key === payload.selectedSkin) && skinUnlocked(payload.selectedSkin) ? payload.selectedSkin : "aqua";
      selectedSpore = SPORES.some(item => item.key === payload.selectedSpore) && sporeUnlocked(payload.selectedSpore) ? payload.selectedSpore : "mint";
      selectedHalo = HALOS.some(item => item.key === payload.selectedHalo) && haloUnlocked(payload.selectedHalo) ? payload.selectedHalo : "none";
      selectedTrail = TRAILS.some(item => item.key === payload.selectedTrail) && trailUnlocked(payload.selectedTrail) ? payload.selectedTrail : "none";
      localStorage.setItem("ballArenaSkin", selectedSkin);
      localStorage.setItem("ballArenaSpore", selectedSpore);
      localStorage.setItem("ballArenaHalo", selectedHalo);
      localStorage.setItem("ballArenaTrail", selectedTrail);
      saveMeta();
      setShopMessage("存档导入成功。");
    } catch (_) {
      setShopMessage("存档码无法识别。");
    }
  }

  function handleShopAction(action) {
    if (action === "export-save") {
      exportSaveCode();
      saveMeta();
      return;
    }
    if (action === "import-save") {
      importSaveCode();
      renderCosmetics();
      return;
    }
    if (action === "daily") {
      if (meta.dailyPackDate === todayKey()) return;
      meta.dailyPackDate = todayKey();
      const dailyLevel = perkLevel("daily");
      const resonanceLevel = perkLevel("resonance");
      setShopMessage(`每日补给：${applyReward({
        dust: 120 + dailyLevel * 45 + resonanceLevel * 20,
        tickets: 1 + Math.floor(dailyLevel / 3),
        xp: dailyLevel * 28
      })}`);
    } else if (action === "ticket") {
      if (meta.dust < 120) return;
      meta.dust -= 120;
      meta.forgeTickets = (meta.forgeTickets || 0) + 1;
      setShopMessage("锻造券 +1");
    } else if (action === "ticket10") {
      if (meta.dust < 900) return;
      meta.dust -= 900;
      meta.forgeTickets = (meta.forgeTickets || 0) + 10;
      setShopMessage("十连券包：锻造券 +10");
    } else if (action === "xp") {
      if (meta.dust < 160) return;
      meta.dust -= 160;
      const levelResult = addForgeXp(90);
      setShopMessage(`铁匠铺经验 +${levelResult.xp}${levelResult.rewards.length ? `，${levelResult.rewards.join("，")}` : ""}`);
    } else if (action === "forge-boost") {
      if (meta.dust < 520) return;
      meta.dust -= 520;
      meta.forgeTickets = (meta.forgeTickets || 0) + 2;
      const levelResult = addForgeXp(360);
      setShopMessage(`工坊冲刺：锻造券 +2，经验 +${levelResult.xp}${levelResult.rewards.length ? `，${levelResult.rewards.join("，")}` : ""}`);
    } else if (action === "random-special") {
      if (meta.dust < 1280) return;
      meta.dust -= 1280;
      const item = unlockRandomSpecial();
      setShopMessage(item ? `随机外观：${item.name}` : "特殊外观已全收集，转为经验 +120");
    } else if (action === "legend-seed") {
      if (meta.dust < 760) return;
      meta.dust -= 760;
      meta.forgePityLegend = clamp((meta.forgePityLegend || 0) + 10, 0, 39);
      meta.forgePityEpic = clamp((meta.forgePityEpic || 0) + 3, 0, 9);
      setShopMessage(`传说火种：传说保底进度 ${meta.forgePityLegend}/40`);
    } else {
      const perkOffer = PERK_SHOP_ITEMS.find(item => `perk-${item.key}` === action);
      if (perkOffer) {
        const level = perkLevel(perkOffer.key);
        const cost = perkCost(perkOffer);
        if (level >= perkOffer.max || meta.dust < cost) return;
        meta.dust -= cost;
      meta.perks = { ...(meta.perks || {}), [perkOffer.key]: level + 1 };
        setShopMessage(`${perkOffer.name} 升至 Lv.${level + 1}`);
        saveMeta();
        renderCosmetics();
        return;
      }
      const offer = SHOP_DIRECT_ITEMS.find(item => item.action === action);
      if (!offer) {
        if (action !== "redeem") return;
      } else {
        const item = cosmeticByType(offer.type, offer.key);
        if (!item || hasForgeItem(offer.type, offer.key) || meta.dust < offer.cost) return;
        meta.dust -= offer.cost;
        unlockForgeItem(offer.type, item);
        setShopMessage(`直购成功：${item.name}`);
      }
    }
    if (action === "redeem") {
      const input = shopPanel.querySelector("#redeemCodeInput");
      const code = (input ? input.value : "").trim().toUpperCase();
      const reward = REDEEM_CODES[code];
      if (!code) {
        setShopMessage("请输入兑换码。");
      } else if (!reward) {
        setShopMessage("兑换码无效。");
      } else if ((meta.redeemedCodes || []).includes(code)) {
        setShopMessage("这个兑换码已经领取过。");
      } else {
        meta.redeemedCodes = [...(meta.redeemedCodes || []), code];
        setShopMessage(`${reward.label}：${applyReward(reward)}`);
      }
    }
    saveMeta();
    renderCosmetics();
  }

  function sporeColorFor(group) {
    if (group?.cosmetics?.spore) return sharedCosmetics.definition("spore", group.cosmetics.spore)?.color || group.color;
    return group.isPlayer ? selectedSporeDef().color : group.color;
  }

  function sporePatternFor(group) {
    const spore = group?.cosmetics?.spore
      ? sharedCosmetics.definition("spore", group.cosmetics.spore)
      : group.isPlayer ? selectedSporeDef() : null;
    return isSpecial(spore) ? spore.pattern : "round";
  }

  function makeAiState(point) {
    return {
      target: { x: point.x, y: point.y },
      mode: "游走",
      think: rand(0.1, 0.6),
      splitCooldown: rand(0.8, 2.2),
      ejectCooldown: rand(0.1, 1.2),
      virusInterest: Math.random(),
      bravery: rand(0.72, 1.2),
      accuracy: rand(0.78, 1.14),
      teamwork: rand(0.62, 1.28),
      rallyOffset: rand(-1, 1),
      controlBias: Math.random()
    };
  }

  function eventTag() {
    if (!matchEvent.active) return null;
    const left = Math.max(0, matchEvent.endsAt - authorityNow) / 1000;
    return `${matchEvent.active.label}: ${matchEvent.active.desc} ${Math.ceil(left)}s`;
  }

  function teamSpawnPoint(team) {
    const bases = [
      { x: WORLD * 0.22, y: WORLD * 0.50 },
      { x: WORLD * 0.78, y: WORLD * 0.50 },
      { x: WORLD * 0.50, y: WORLD * 0.22 },
      { x: WORLD * 0.50, y: WORLD * 0.78 }
    ];
    const base = bases[team % bases.length];
    const angle = rand(0, Math.PI * 2);
    const dist = rand(40, 360);
    return {
      x: clamp(base.x + Math.cos(angle) * dist, 160, WORLD - 160),
      y: clamp(base.y + Math.sin(angle) * dist, 160, WORLD - 160)
    };
  }

  function modeColor(index, isPlayer) {
    const config = modeConfig();
    if (config.teams > 0) return TEAM_COLORS[index % config.teams];
    if (isPlayer) return selectedSkinDef().color;
    return randomColor(index + 2);
  }

  function mergeCooldown(mass, type) {
    const eventMult = activeEventFactor("mergeMult", 1);
    const modeMult = modeConfig().mergeScale || 1;
    return gameplayCore.mergeCooldownSeconds(mass, type, {
      eventMultiplier: eventMult,
      modeMultiplier: modeMult
    });
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(safe / 60);
    return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function botStartMass(index, config) {
    const range = gameplayCore.botStartMassRange(index, config);
    return rand(range.minimum, range.maximum);
  }

  function rollDemonBossCount() {
    const roll = Math.random();
    if (roll < 0.045) return 4;
    if (roll < 0.22) return 2;
    return 1;
  }

  function setupDemonMode(config) {
    const enemyGroups = groups.filter(group => !group.isPlayer && group.team === 1);
    const bossCount = rollDemonBossCount();
    while (enemyGroups.length < bossCount) {
      const index = enemyGroups.length + 1;
      const angle = (index / Math.max(1, bossCount)) * Math.PI * 2;
      const group = makeGroup(`demon-boss-extra-${index}`, `魔王${index}`, TEAM_COLORS[1], false, 1000, {
        x: clamp(WORLD * 0.72 + Math.cos(angle) * 520, 160, WORLD - 160),
        y: clamp(WORLD * 0.52 + Math.sin(angle) * 980, 160, WORLD - 160)
      }, 1);
      groups.push(group);
      enemyGroups.push(group);
    }
    const bosses = enemyGroups.slice(0, bossCount);
    if (!bosses.length) return;
    const templates = [...DEMON_TEMPLATES].sort(() => Math.random() - 0.5);
    game.demonBossIds = bosses.map(group => group.id);
    game.demonBossBurst = bossCount;
    game.nextDemonSkillAt = authorityNow + 9000;
    for (let i = 0; i < bosses.length; i++) {
      const boss = bosses[i];
      const template = templates[i % templates.length];
      const angle = bossCount === 1 ? 0 : (i / bossCount) * Math.PI * 2;
      const point = {
        x: clamp(WORLD * 0.72 + Math.cos(angle) * (bossCount > 2 ? 680 : 260), 220, WORLD - 220),
        y: clamp(WORLD * 0.52 + Math.sin(angle) * (bossCount > 2 ? 1180 : 620), 220, WORLD - 220)
      };
      boss.name = template.name;
      boss.color = template.color;
      boss.isBoss = true;
      boss.demonSkill = template.skill;
      boss.demonLabel = template.label;
      const massScale = bossCount > 2 ? 0.72 : bossCount > 1 ? 0.86 : 1;
      boss.demonBaseMass = template.mass * massScale;
      boss.demonMassFloor = boss.demonBaseMass * (template.skill === "titan" ? 0.68 : 0.58);
      boss.cells = [makeCell(boss, point.x, point.y, boss.demonBaseMass)];
      boss.ai.bravery = 1.55;
      boss.ai.accuracy = 1.14;
      boss.ai.virusInterest = 0.92;
      boss.ai.teamwork = 0.25;
      boss.ai.target = { x: WORLD * 0.45, y: WORLD * 0.5 };
      boss.ai.mode = "魔王压迫";
    }
    game.demonBossStartMass = bosses.reduce((sum, boss) => sum + groupMass(boss), 0);

    let minionIndex = 1;
    let allyIndex = 1;
    for (const group of groups) {
      if (group === playerGroup || group.isBoss) continue;
      if (group.team === 1) {
      if (minionIndex > 3) {
        group.dead = true;
        group.cells = [];
        continue;
      }
      const boss = bosses[minionIndex % bosses.length] || bosses[0];
        const center = groupCenter(boss);
        const angle = (minionIndex / 8) * Math.PI * 2;
        const dist = rand(360, 900);
        group.name = `魔兵${minionIndex}`;
        group.color = minionIndex % 2 ? "#ef4444" : "#a855f7";
        group.isDemonMinion = true;
        group.cells = [makeCell(group, clamp(center.x + Math.cos(angle) * dist, 160, WORLD - 160), clamp(center.y + Math.sin(angle) * dist, 160, WORLD - 160), rand(420, 860))];
        group.ai.bravery = rand(1.0, 1.35);
        minionIndex += 1;
      } else {
        const base = { x: WORLD * 0.28, y: WORLD * 0.5 };
        const angle = (allyIndex / 9) * Math.PI * 2;
        group.name = `勇者${allyIndex}`;
        group.color = TEAM_COLORS[0];
        group.cells = [makeCell(group, clamp(base.x + Math.cos(angle) * rand(120, 820), 160, WORLD - 160), clamp(base.y + Math.sin(angle) * rand(120, 820), 160, WORLD - 160), rand(180, 440))];
        group.ai.teamwork = rand(1.0, 1.45);
        allyIndex += 1;
      }
    }
    syncRadii();
  }

  function teamForParticipant(index, config) {
    if (!config.teams) return null;
    const size = config.teamSize || Math.max(1, Math.ceil(config.players / config.teams));
    return Math.min(config.teams - 1, Math.floor(index / size));
  }

  function liveCellCount(group) {
    return group.cells.reduce((count, cell) => count + (!cell.dead ? 1 : 0), 0);
  }

  function lighten(hex, amount) {
    const raw = hex.replace("#", "");
    const num = parseInt(raw, 16);
    const r = clamp((num >> 16) + amount, 0, 255);
    const g = clamp(((num >> 8) & 255) + amount, 0, 255);
    const b = clamp((num & 255) + amount, 0, 255);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function makeCell(group, x, y, mass) {
    return {
      id: `${group.id}-cell-${Math.random().toString(16).slice(2)}`,
      x,
      y,
      vx: 0,
      vy: 0,
      mass,
      radius: radiusFromMass(mass),
      mergeDelay: 0,
      mergeMax: 0,
      dead: false,
      killedBy: null
    };
  }

  function makeGroup(id, name, color, isPlayer, startMass, position, team) {
    const p = position || randomPointInZone(220);
    const group = {
      id,
      name,
      color,
      isPlayer,
      team: team === undefined ? null : team,
      cells: [],
      dead: false,
      respawnAt: 0,
      invincibleUntil: 0,
      lives: 0,
      kills: 0,
      ai: isPlayer ? null : makeAiState(p)
    };
    group.cells.push(makeCell(group, p.x, p.y, startMass));
    return group;
  }

  function elapsedSeconds(now) {
    return game.startedAt ? Math.max(0, (now - game.startedAt) / 1000) : 0;
  }

  function foodTargetCount(now) {
    return gameplayCore.foodTargetCount({
      config: modeConfig(),
      elapsedSeconds: elapsedSeconds(now),
      phase: safeZone.phase || 1,
      eventTargetMultiplier: activeEventFactor("foodTargetMult", 1),
      baseCount: FOOD_BASE_COUNT,
      maximumCount: FOOD_MAX_COUNT
    });
  }

  function foodSpawnRate(now) {
    return gameplayCore.foodSpawnRate({
      config: modeConfig(),
      elapsedSeconds: elapsedSeconds(now),
      phase: safeZone.phase || 1,
      eventRateMultiplier: activeEventFactor("foodRateMult", 1)
    });
  }

  function foodBucketKey(bucketX, bucketY) {
    return bucketX * 256 + bucketY;
  }

  function foodKey(x, y) {
    return foodBucketKey(Math.floor(x / FOOD_BUCKET), Math.floor(y / FOOD_BUCKET));
  }

  function addFood(food) {
    const key = foodKey(food.x, food.y);
    let bucket = foodGrid.get(key);
    if (!bucket) {
      bucket = [];
      foodGrid.set(key, bucket);
    }
    food.index = foods.length;
    food.gridKey = key;
    food.bucketIndex = bucket.length;
    foods.push(food);
    bucket.push(food);
  }

  function removeFood(food) {
    const bucket = foodGrid.get(food.gridKey);
    if (bucket) {
      const lastBucketFood = bucket.pop();
      if (lastBucketFood && lastBucketFood !== food) {
        bucket[food.bucketIndex] = lastBucketFood;
        lastBucketFood.bucketIndex = food.bucketIndex;
      }
      if (!bucket.length) foodGrid.delete(food.gridKey);
    }

    const lastFood = foods.pop();
    if (lastFood && lastFood !== food) {
      foods[food.index] = lastFood;
      lastFood.index = food.index;
    }
  }

  function makeFood() {
    const p = Math.random() < 0.78 ? randomPointInZone(60) : randomWorldPoint(60);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const config = modeConfig();
    const elapsed = elapsedSeconds(authorityNow);
    const ramp = config.lateFoodRamp ? clamp((elapsed - (config.dominationWarmup || 55)) / 240, 0, 1) : 0;
    const lateChance = clamp(0.018 + (safeZone.phase || 1) * 0.006 + elapsed / 9000 + ramp * 0.055 + activeEventFactor("richChanceAdd", 0) + (config.domination ? 0.055 : 0), 0.02, config.domination ? 0.34 : 0.20);
    const rich = Math.random() < lateChance;
    const massMult = activeEventFactor("foodMassMult", 1);
    const baseMass = config.domination
      ? (rich ? rand(82 + ramp * 55, 170 + ramp * 120) : rand(18 + ramp * 7, 44 + ramp * 18))
      : (rich ? rand(5.8, 10.5) : rand(2.2, 5.2));
    const mass = baseMass * massMult * (config.foodMassScale || 1);
    const radiusScale = config.domination ? 2.25 : 1;
    return {
      id: nextEntityId("food"),
      x: p.x,
      y: p.y,
      mass,
      radius: (rich ? rand(6.2, 8.6) : rand(4.2, 6.4)) * Math.sqrt(massMult * (config.foodMassScale || 1)) * radiusScale,
      color,
      pulse: rand(0, Math.PI * 2),
      rich
    };
  }

  function makeBonusFood(event) {
    const center = safeZone.enabled ? safeZone : { x: WORLD / 2, y: WORLD / 2, radius: WORLD * 0.38 };
    const angle = rand(0, Math.PI * 2);
    const dist = Math.sqrt(Math.random()) * Math.max(260, (center.radius || WORLD * 0.38) * 0.48);
    const base = makeFood();
    const massMult = event.burstMassMult || 2.4;
    const point = clampPlayablePoint(center.x + Math.cos(angle) * dist, center.y + Math.sin(angle) * dist, 90);
    base.x = point.x;
    base.y = point.y;
    base.mass *= massMult;
    base.radius *= Math.sqrt(massMult) * 1.08;
    base.rich = true;
    base.color = event.color || base.color;
    return base;
  }

  function randomVirusKind(bigChance = 0.24) {
    const config = modeConfig();
    if (config.sporeVirusOnly) return "spore";
    const sporeChance = (config.sporeVirusChance || 0) + activeEventFactor("sporeVirusChanceAdd", 0);
    if (config.sporeVirus && Math.random() < sporeChance) return "spore";
    return Math.random() < bigChance ? "big" : "small";
  }

  function makeVirus(kind) {
    const finalKind = kind || randomVirusKind();
    const big = finalKind === "big";
    const spore = finalKind === "spore";
    const p = Math.random() < 0.82 ? randomPointInZone(big ? 250 : 160) : randomWorldPoint(big ? 250 : 160);
    return {
      id: nextEntityId("virus"),
      x: p.x,
      y: p.y,
      radius: spore ? rand(42, 54) : big ? rand(68, 86) : rand(38, 50),
      mass: spore ? VIRUS_MASS * 0.92 : big ? BIG_VIRUS_MASS : VIRUS_MASS,
      baseMass: spore ? VIRUS_MASS * 0.92 : big ? BIG_VIRUS_MASS : VIRUS_MASS,
      spin: rand(0, Math.PI * 2),
      kind: finalKind
    };
  }

  function virusLimit() {
    const config = modeConfig();
    return Math.max(0, Math.floor(config.virusMax || config.virusCount || VIRUS_COUNT));
  }

  function addVirus(kind) {
    if (viruses.length >= virusLimit()) return false;
    viruses.push(makeVirus(kind));
    return true;
  }

  function trimEjectedMass() {
    while (ejected.length > MAX_EJECTED) {
      const playerId = playerGroup?.id;
      let index = ejected.findIndex(mass => mass.ownerId !== playerId && mass.age > 1.5);
      if (index < 0) index = ejected.findIndex(mass => mass.ownerId !== playerId);
      if (index < 0) index = ejected.findIndex(mass => mass.age > 8);
      if (index < 0) index = 0;
      ejected.splice(index, 1);
    }
  }

  function startGame(modeKey, options) {
    const now = performance.now();
    authorityNow = now;
    const opts = options || {};
    activeMode = GAME_MODES[modeKey] ? modeKey : selectedMode;
    selectedMode = activeMode;
    setModeSelection(selectedMode);
    const config = modeConfig();
    const playerTeam = teamForParticipant(0, config);
    const start = config.control ? teamSpawnPoint(playerTeam || 0) : { x: WORLD / 2, y: WORLD / 2 };
    runId += 1;
    entitySequence = 0;
    authorityTick = 0;
    authorityMode = false;
    authorityPlayers.clear();
    groups = [];
    foods = [];
    foodGrid = new Map();
    foodSpawnBank = 0;
    viruses = [];
    virusRespawnQueue = [];
    ejected = [];
    particles = [];
    rings = [];
    lastCellSpace = null;
    renderCells = [];
    perf.avgFrame = 16;
    perf.avgWork = 8;
    perf.lowQuality = false;
    perf.nextMiniDraw = 0;
    perf.nextQualityCheck = now + 5000;
    perf.qualityPressure = 0;
    perf.qualityRecovery = 0;
    perf.scaleChanges = 0;
    perf.backingStoreResizes = 0;
    perf.drawnFood = 0;
    perf.drawnCells = 0;
    perf.maxFrame = 0;
    perf.longFrames = 0;
    perf.renderedFrames = 0;
    perf.skippedRenderFrames = 0;
    lastRenderedAt = 0;
    nextRenderAt = 0;
    input.ejectHeld = false;
    lastPlayerEject = 0;
    controlPoints = [];
    teamScores = [];
    matchEvent = { active: null, nextAt: 0, endsAt: 0, recent: [], virusBank: 0 };
    hudTimer = 0;
    lastFrame = now;
    ejectBtn.classList.remove("active");

    const zoneRadius = WORLD * (config.safeZone ? (config.safeZoneRadius || 0.58) : 0.75);
    const zoneTargetRadius = WORLD * (config.safeZone ? (config.safeZoneTargetRadius || 0.44) : 0.75);
    safeZone = {
      enabled: config.safeZone,
      x: WORLD / 2,
      y: WORLD / 2,
      radius: zoneRadius,
      fromX: WORLD / 2,
      fromY: WORLD / 2,
      fromRadius: zoneRadius,
      targetX: WORLD / 2 + rand(-420, 420),
      targetY: WORLD / 2 + rand(-420, 420),
      targetRadius: zoneTargetRadius,
      phase: 1,
      static: !!config.staticZone,
      shrinking: false,
      shrinkStart: now + (config.safeZoneShrinkStart || 18000),
      shrinkEnd: now + (config.safeZoneShrinkEnd || 64000)
    };
    initControlPoints(config);
    resetMatchEvents(now, config);

    const playerStartMass = playerStartMassFor(config);
    playerGroup = makeGroup("player", PLAYER_NAME, modeColor(playerTeam || 0, true), true, playerStartMass, start, playerTeam);
    playerGroup.lives = config.lives || 0;
    groups.push(playerGroup);

    const botCount = config.players - 1;
    for (let i = 0; i < botCount; i++) {
      const participant = i + 1;
      const team = teamForParticipant(participant, config);
      const position = config.control ? teamSpawnPoint(team || 0) : null;
      const group = makeGroup(`bot-${i}`, botName(i), modeColor(team ?? i, false), false, botStartMass(i, config), position, team);
      group.lives = config.lives || 0;
      groups.push(group);
    }

    game = {
      paused: false,
      over: false,
      startedAt: now,
      duration: config.duration || 0,
      endsAt: config.duration ? now + config.duration * 1000 : 0,
      kills: 0,
      foodEaten: 0,
      peakMass: playerStartMass,
      shake: 0,
      splitFlash: 0,
      zonePulse: 0,
      quickMergeReadyAt: now,
      screenSkillReadyAt: now,
      screenSkillUntil: 0,
      winnerShown: false,
      dustRewarded: false,
      blitzSupremacy: { hold: 0, share: 0, lead: 1 },
      domination: { leaderId: null, currentLeaderId: null, currentLeaderName: "", hold: 0, share: 0, areaShare: 0, playerShare: 0 },
      menu: !!opts.menu
    };
    if (config.demon) setupDemonMode(config);

    const initialFood = Math.floor(FOOD_BASE_COUNT * (config.initialFoodScale || Math.min(1.25, config.foodTargetScale || 1)));
    for (let i = 0; i < initialFood; i++) addFood(makeFood());
    const initialViruses = Math.min(Math.floor(config.virusCount || VIRUS_COUNT), virusLimit());
    for (let i = 0; i < initialViruses; i++) addVirus(config.sporeVirusOnly ? "spore" : i % 4 === 0 ? "big" : randomVirusKind(0.08));

    camera = { ...start };
    zoom = 0.82;
    pointer = { x: view.w / 2, y: view.h / 2 };
    resetJoystick();

    if (opts.menu) {
      game.paused = true;
      if (opts.title) showTitleScreen();
      else showStartOverlay();
    } else {
      document.documentElement.classList.remove("title-active");
      titleScreen.hidden = true;
      titleScreen.style.display = "none";
      window.ScaAudio?.arm();
      window.ScaAudio?.reset();
      window.ScaMatchGuide?.show(activeMode);
      document.querySelector(".hud")?.removeAttribute("aria-hidden");
      overlay.style.display = "none";
      modeGrid.style.display = "none";
      finalMass.style.display = "block";
      if (musicEnabled) startMusic();
      if (config.dominationWarmup) {
        showEventBanner("霸屏预热", `${Math.ceil(config.dominationWarmup)}秒后开启胜利判定`, "#67e8f9");
      }
    }
    pauseBtn.textContent = "停";
    simulationAccumulator = 0;
    simulationNow = now;
    authorityNow = now;
    captureSimulationState();
    updateHud(now, true);
  }

  function resetMatchEvents(now, config) {
    matchEvent = {
      active: null,
      nextAt: now + (config.eventDelay || (config.control ? 9000 : 12000)),
      endsAt: 0,
      recent: [],
      virusBank: 0
    };
  }

  function chooseMatchEvent() {
    const pool = MATCH_EVENTS.filter(event => !matchEvent.recent.includes(event.key));
    const source = pool.length ? pool : MATCH_EVENTS;
    return source[Math.floor(Math.random() * source.length)];
  }

  function activateMatchEvent(event, now) {
    matchEvent.active = event;
    matchEvent.endsAt = now + event.duration * 1000;
    matchEvent.virusBank = 0;
    matchEvent.recent.push(event.key);
    if (matchEvent.recent.length > 2) matchEvent.recent.shift();
    if (event.virusBurst) {
      const config = modeConfig();
      for (let i = 0; i < event.virusBurst; i++) addVirus(config.sporeVirusOnly ? "spore" : i % 5 === 0 ? "big" : randomVirusKind(0.08));
    }
    if (event.sporeVirusBurst) {
      for (let i = 0; i < event.sporeVirusBurst; i++) addVirus("spore");
    }
    if (event.foodBurst) {
      const cap = Math.floor(foodTargetCount(now) * 1.2);
      for (let i = 0; i < event.foodBurst && foods.length < cap; i++) addFood(makeBonusFood(event));
    }
    ring(safeZone.enabled ? safeZone.x : WORLD / 2, safeZone.enabled ? safeZone.y : WORLD / 2, event.color || "#ffffff", 360);
    showEventBanner(event.label, event.desc, event.color);
  }

  function updateMatchEvents(dt, now) {
    if (game.menu || game.over) return;
    if (matchEvent.active && now >= matchEvent.endsAt) {
      matchEvent.active = null;
      const config = modeConfig();
      matchEvent.nextAt = now + rand(config.eventIntervalMin || 34000, config.eventIntervalMax || 52000);
      matchEvent.virusBank = 0;
    }
    if (!matchEvent.active && now >= matchEvent.nextAt) {
      activateMatchEvent(chooseMatchEvent(), now);
    }
    if (matchEvent.active && (matchEvent.active.key === "thorn" || matchEvent.active.key === "thornstorm" || matchEvent.active.key === "thornwave" || matchEvent.active.key === "sporethorn")) {
      matchEvent.virusBank += dt * 0.34;
      while (matchEvent.virusBank >= 1 && viruses.length < virusLimit()) {
        addVirus(randomVirusKind(0.18));
        matchEvent.virusBank -= 1;
      }
      if (viruses.length >= virusLimit()) matchEvent.virusBank = Math.min(matchEvent.virusBank, 1);
    }
    const regen = modeConfig().virusRegenRate || 0;
    if (regen > 0 && viruses.length < virusLimit()) {
      matchEvent.virusBank += dt * regen;
      while (matchEvent.virusBank >= 1 && viruses.length < virusLimit()) {
        addVirus(randomVirusKind(0.22));
        matchEvent.virusBank -= 1;
      }
    }
  }

  function initControlPoints(config) {
    teamScores = Array.from({ length: config.teams || 0 }, () => 0);
    controlPoints = [];
    if (!config.control) return;
    const points = [
      { label: "A", x: WORLD * 0.36, y: WORLD * 0.36 },
      { label: "B", x: WORLD * 0.50, y: WORLD * 0.50 },
      { label: "C", x: WORLD * 0.64, y: WORLD * 0.64 }
    ];
    controlPoints = points.map(point => ({
      ...point,
      radius: point.radius || 390,
      owner: null,
      captureTeam: null,
      capture: 0,
      contested: false,
      pressure: 0
    }));
  }

  function updateControlPoints(dt) {
    const config = modeConfig();
    if (!config.control || !controlPoints.length || game.over) return;
    for (const point of controlPoints) {
      const masses = Array.from({ length: config.teams }, () => 0);
      for (const group of groups) {
        if (group.dead || group.team === null || group.team === undefined) continue;
        for (const cell of group.cells) {
          if (cell.dead) continue;
          const reach = point.radius + cell.radius * 0.45;
          if (distSq(point, cell) < reach * reach) masses[group.team] += cell.mass;
        }
      }

      const order = masses
        .map((mass, team) => ({ team, mass }))
        .sort((a, b) => b.mass - a.mass);
      const top = order[0] || { team: null, mass: 0 };
      const second = order[1] || { team: null, mass: 0 };
      const hasPressure = top.team !== null && top.mass > 55 && top.mass > second.mass * 1.16 + 30;
      point.contested = !hasPressure && top.mass > 45 && second.mass > 35;
      point.pressure = top.mass;

      if (hasPressure) {
        if (point.owner === top.team) {
          point.captureTeam = top.team;
          point.capture = 100;
        } else {
          if (point.captureTeam !== top.team) {
            point.captureTeam = top.team;
            point.capture = Math.max(0, point.capture * 0.35);
          }
          point.capture += dt * (17 + Math.min(38, top.mass / 170));
          if (point.capture >= 100) {
            point.owner = top.team;
            point.capture = 100;
            ring(point.x, point.y, TEAM_COLORS[top.team % TEAM_COLORS.length], 250);
          }
        }
      } else if (point.owner === null) {
        point.capture = Math.max(0, point.capture - dt * 16);
      }

      if (point.owner !== null) {
        teamScores[point.owner] = (teamScores[point.owner] || 0) + dt * 0.95;
      }
    }
  }

  function bestControlPointFor(group, center) {
    const config = modeConfig();
    if (!config.control || !controlPoints.length || group.team === null || group.team === undefined) return null;
    let best = null;
    let bestScore = -Infinity;
    const ownScore = teamScores[group.team] || 0;
    const topScore = Math.max(...teamScores, 0);
    for (let i = 0; i < controlPoints.length; i++) {
      const point = controlPoints[i];
      const d = Math.max(1, distance(center, point));
      const enemyOwned = point.owner !== null && point.owner !== group.team;
      const allyOwned = point.owner === group.team;
      const behind = topScore - ownScore > 34 ? 1.2 : 0;
      const bias = group.ai ? Math.sin(group.ai.controlBias * Math.PI * 2 + i * 2.1) * 0.85 : 0;
      const score =
        (enemyOwned ? 4.5 : allyOwned ? 0.75 : 3.1) +
        (point.contested ? 2.6 : 0) +
        (point.captureTeam === group.team ? 0.8 : 0) +
        bias +
        behind -
        d / 2600;
      if (score > bestScore) {
        bestScore = score;
        best = point;
      }
    }
    return best;
  }

  function groupMass(group) {
    return group.cells.reduce((sum, cell) => sum + (cell.dead ? 0 : cell.mass), 0);
  }

  function groupCenter(group) {
    let x = 0;
    let y = 0;
    let total = 0;
    let largest = 0;
    let largestCell = null;
    for (const cell of group.cells) {
      if (cell.dead) continue;
      total += cell.mass;
      x += cell.x * cell.mass;
      y += cell.y * cell.mass;
      if (cell.radius > largest) {
        largest = cell.radius;
        largestCell = cell;
      }
    }
    total = Math.max(1, total);
    const center = group.centerCache || (group.centerCache = {});
    center.x = x / total;
    center.y = y / total;
    center.mass = total;
    center.largest = largest;
    center.largestCell = largestCell;
    return center;
  }

  function allLiveGroups() {
    return groups.filter(group => !group.dead && group.cells.length > 0);
  }

  function allCells() {
    const list = [];
    for (const group of groups) {
      if (group.dead) continue;
      for (const cell of group.cells) {
        if (!cell.dead) list.push({ group, cell });
      }
    }
    return list;
  }

  function cellBucketKey(bucketX, bucketY) {
    return bucketX * 128 + bucketY;
  }

  function buildCellGrid() {
    const space = cellSpacePool[cellSpacePoolIndex];
    cellSpacePoolIndex = (cellSpacePoolIndex + 1) % cellSpacePool.length;
    const cells = space.cells;
    const grid = space.grid;
    cells.length = 0;
    grid.clear();
    space.bucketCount = 0;
    let maxRadius = 0;
    for (const group of groups) {
      if (group.dead) continue;
      for (const cell of group.cells) {
        if (cell.dead) continue;
        const wrap = cell.spatialWrap || (cell.spatialWrap = { group, cell });
        cells.push(wrap);
        if (cell.radius > maxRadius) maxRadius = cell.radius;
        const key = cellBucketKey(Math.floor(cell.x / CELL_BUCKET), Math.floor(cell.y / CELL_BUCKET));
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = space.bucketPool[space.bucketCount] || [];
          space.bucketPool[space.bucketCount] = bucket;
          space.bucketCount += 1;
          bucket.length = 0;
          grid.set(key, bucket);
        }
        bucket.push(wrap);
      }
    }
    space.maxRadius = maxRadius;
    return space;
  }

  function nearbyCells(grid, point, range, output) {
    const list = output || [];
    list.length = 0;
    const minX = Math.floor((point.x - range) / CELL_BUCKET);
    const maxX = Math.floor((point.x + range) / CELL_BUCKET);
    const minY = Math.floor((point.y - range) / CELL_BUCKET);
    const maxY = Math.floor((point.y + range) / CELL_BUCKET);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const bucket = grid.get(cellBucketKey(x, y));
        if (bucket) list.push(...bucket);
      }
    }
    return list;
  }

  function buildVirusCollisionGrid() {
    const space = virusCollisionSpace;
    space.grid.clear();
    space.bucketCount = 0;
    space.maxRadius = 0;
    for (let index = 0; index < viruses.length; index++) {
      const virus = viruses[index];
      const wrap = virus.ejectedCollisionWrap || (virus.ejectedCollisionWrap = { virus, index });
      wrap.virus = virus;
      wrap.index = index;
      space.maxRadius = Math.max(space.maxRadius, virus.radius || 0);
      const key = cellBucketKey(Math.floor(virus.x / CELL_BUCKET), Math.floor(virus.y / CELL_BUCKET));
      let bucket = space.grid.get(key);
      if (!bucket) {
        bucket = space.bucketPool[space.bucketCount] || [];
        space.bucketPool[space.bucketCount] = bucket;
        space.bucketCount += 1;
        bucket.length = 0;
        space.grid.set(key, bucket);
      }
      bucket.push(wrap);
    }
    return space;
  }

  function nearbyViruses(space, point, output) {
    const list = output || [];
    list.length = 0;
    const range = (point.radius || 0) + space.maxRadius + 4;
    const minX = Math.floor((point.x - range) / CELL_BUCKET);
    const maxX = Math.floor((point.x + range) / CELL_BUCKET);
    const minY = Math.floor((point.y - range) / CELL_BUCKET);
    const maxY = Math.floor((point.y + range) / CELL_BUCKET);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const bucket = space.grid.get(cellBucketKey(x, y));
        if (bucket) list.push(...bucket);
      }
    }
    list.sort((left, right) => right.index - left.index);
    return list;
  }

  function screenToWorld(x, y) {
    return {
      x: (x - view.w / 2) / zoom + camera.x,
      y: (y - view.h / 2) / zoom + camera.y
    };
  }

  function cursorPoint() {
    if (playerGroup && (Math.abs(joystick.x) > 0.04 || Math.abs(joystick.y) > 0.04)) {
      const center = groupCenter(playerGroup);
      return {
        x: center.x + joystick.x * 920,
        y: center.y + joystick.y * 920
      };
    }
    return screenToWorld(pointer.x, pointer.y);
  }

  function authorityTargetFor(group) {
    const center = groupCenter(group);
    const inputState = group.authorityInput || {};
    if (Number.isFinite(inputState.targetX) && Number.isFinite(inputState.targetY)) {
      return clampPlayablePoint(inputState.targetX, inputState.targetY, 24);
    }
    const dx = clamp(Number(inputState.dx) || 0, -1, 1);
    const dy = clamp(Number(inputState.dy) || 0, -1, 1);
    return clampPlayablePoint(center.x + dx * 920, center.y + dy * 920, 24);
  }

  function applyAuthorityInputs(now) {
    if (!authorityMode) return;
    for (const group of authorityPlayers.values()) {
      if (!isHumanControlled(group) || group.dead || !group.cells.length) continue;
      const inputState = group.authorityInput || {};
      const target = authorityTargetFor(group);
      if (inputState.pendingSplit) {
        splitGroup(group, target, { power: 1 });
        inputState.pendingSplit = false;
      }
      if (inputState.ejectHeld) ejectMass(group, target, now);
      if (inputState.pendingQuickMerge) {
        quickMergeGroup(group, now, false);
        inputState.pendingQuickMerge = false;
      }
      if (inputState.pendingSpecial) {
        screenDashGroup(group, target, now, false);
        inputState.pendingSpecial = false;
      }
    }
  }

  function update(dt, now) {
    syncRadii();
    applyAuthorityInputs(now);
    // AI decisions tolerate a one-frame-old spatial index. Reusing it avoids
    // rebuilding the largest collision structure twice during every frame.
    const aiSpace = lastCellSpace || buildCellGrid();
    updateMatchEvents(dt, now);
    updateSafeZone(now, dt);
    updateDemonMode(dt, now);
    updateAi(dt, now, aiSpace);
    updateGroupMovement(dt, now);
    updateEjected(dt);
    const worldSpace = buildCellGrid();
    handleFoodEating(now, worldSpace.cells);
    updateFoodSpawns(dt, now);
    handleEjectedEating(worldSpace);
    handleCellEating(worldSpace, now);
    handleVirusHits(dt, now, worldSpace);
    updateVirusRespawns(now);
    lastCellSpace = worldSpace;
    renderCells = worldSpace.cells;
    updateGroupSeparation(dt);
    updateControlPoints(dt);
    applyZoneDamage(dt);
    cleanupGroups();
    updateRespawns(now);
    updateEffects(dt);
    updateCamera(dt);
    updateDomination(dt, now);
    updateBlitzSupremacy(dt, now);
    if (input.ejectHeld && !playerGroup.dead) ejectMass(playerGroup, cursorPoint(), now);

    const playerMass = groupMass(playerGroup);
    if (playerMass > game.peakMass) game.peakMass = playerMass;
    if (!playerGroup.dead && playerGroup.cells.length === 0) eliminateGroup(playerGroup, null);
    maybeEndGame(now);

    game.splitFlash = Math.max(0, game.splitFlash - dt);
    game.shake = Math.max(0, game.shake - dt * 18);
    hudTimer += dt;
    if (hudTimer > 0.2) {
      updateHud(now, false);
      hudTimer = 0;
    }
  }

  function syncRadii() {
    for (const group of groups) {
      if (group.dead) continue;
      for (const cell of group.cells) {
        if (!cell.dead) cell.radius = radiusFromMass(cell.mass);
      }
    }
    for (const mass of ejected) {
      mass.radius = radiusFromMass(mass.mass);
    }
  }

  function updateSafeZone(now, dt) {
    if (!safeZone.enabled) {
      game.zonePulse = (game.zonePulse + dt * 1.4) % (Math.PI * 2);
      return;
    }

    if (safeZone.static) {
      game.zonePulse = (game.zonePulse + dt * 1.8) % (Math.PI * 2);
      return;
    }

    if (!safeZone.shrinking && now >= safeZone.shrinkStart) {
      safeZone.shrinking = true;
    }

    if (safeZone.shrinking) {
      const t = clamp((now - safeZone.shrinkStart) / (safeZone.shrinkEnd - safeZone.shrinkStart), 0, 1);
      const e = easeInOut(t);
      safeZone.x = lerp(safeZone.fromX, safeZone.targetX, e);
      safeZone.y = lerp(safeZone.fromY, safeZone.targetY, e);
      safeZone.radius = lerp(safeZone.fromRadius, safeZone.targetRadius, e);

      if (t >= 1) {
        const oldRadius = safeZone.targetRadius;
        safeZone.fromX = safeZone.targetX;
        safeZone.fromY = safeZone.targetY;
        safeZone.fromRadius = oldRadius;
        const nextRadius = Math.max(390, oldRadius * 0.73);
        const drift = Math.max(80, oldRadius - nextRadius - 60);
        const angle = rand(0, Math.PI * 2);
        safeZone.targetX = clamp(safeZone.fromX + Math.cos(angle) * rand(40, drift), nextRadius + 80, WORLD - nextRadius - 80);
        safeZone.targetY = clamp(safeZone.fromY + Math.sin(angle) * rand(40, drift), nextRadius + 80, WORLD - nextRadius - 80);
        safeZone.targetRadius = nextRadius;
        safeZone.phase += 1;
        safeZone.shrinking = false;
        safeZone.shrinkStart = now + Math.max(5200, 11500 - safeZone.phase * 900);
        safeZone.shrinkEnd = safeZone.shrinkStart + Math.max(15000, 28000 - safeZone.phase * 1200);
      }
    }

    game.zonePulse = (game.zonePulse + dt * 2.4) % (Math.PI * 2);
  }

  function updateDemonMode(dt, now) {
    const config = modeConfig();
    if (!config.demon || game.over || game.menu) return;
    const bosses = groups.filter(group => group.isBoss && !group.dead && group.cells.length);
    for (const boss of bosses) {
      for (const cell of boss.cells) {
        if (!cell.dead && boss.demonMassFloor) cell.mass = Math.max(cell.mass, boss.demonMassFloor / Math.max(1, boss.cells.length));
      }
    }
    if (!bosses.length || now < (game.nextDemonSkillAt || 0)) return;
    const boss = bosses[Math.floor(Math.random() * bosses.length)];
    castDemonSkill(boss);
    game.nextDemonSkillAt = now + rand(7800, 11800);
  }

  function spendDemonSkillMass(boss) {
    if (!boss.demonBaseMass || !boss.cells.length) return;
    const floor = (boss.demonMassFloor || 0) / Math.max(1, boss.cells.length);
    const cost = boss.demonBaseMass * (boss.demonSkill === "titan" ? 0.008 : 0.012);
    const perCell = cost / Math.max(1, boss.cells.length);
    for (const cell of boss.cells) {
      if (!cell.dead) cell.mass = Math.max(floor, cell.mass - perCell);
    }
  }

  function castDemonSkill(boss) {
    const center = groupCenter(boss);
    spendDemonSkillMass(boss);
    showEventBanner(boss.demonLabel || "魔王技能", boss.name, boss.color);
    ring(center.x, center.y, boss.color, 430);
    if (boss.demonSkill === "summon") {
      let revived = 0;
      for (const group of groups) {
        if (revived >= 2) break;
        if (!group.isDemonMinion || !group.dead) continue;
        const angle = rand(0, Math.PI * 2);
        group.dead = false;
        group.respawnAt = 0;
        group.cells = [makeCell(group, clamp(center.x + Math.cos(angle) * rand(280, 520), 160, WORLD - 160), clamp(center.y + Math.sin(angle) * rand(280, 520), 160, WORLD - 160), rand(380, 720))];
        revived += 1;
      }
      for (let i = 0; i < 2; i++) addVirus(i ? "small" : "big");
    } else if (boss.demonSkill === "flare") {
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        ejected.push({
          id: nextEntityId("ejected"),
          x: center.x + Math.cos(angle) * (center.largest + 22),
          y: center.y + Math.sin(angle) * (center.largest + 22),
          vx: Math.cos(angle) * rand(340, 520),
          vy: Math.sin(angle) * rand(340, 520),
          mass: rand(8, 18),
          radius: 8,
          age: 0.2,
          color: boss.color,
          accent: "#fef3c7",
          spore: "meteor",
          ownerId: boss.id
        });
      }
      trimEjectedMass();
    } else if (boss.demonSkill === "frost") {
      for (const group of groups) {
        if (group.dead || group.team === boss.team) continue;
        for (const cell of group.cells) {
          if (distSq(cell, center) > 980 * 980) continue;
          cell.vx *= 0.48;
          cell.vy *= 0.48;
          cell.mergeDelay = Math.max(cell.mergeDelay || 0, 1.6);
        }
      }
    } else if (boss.demonSkill === "gravity") {
      for (const group of groups) {
        if (group.dead || group.team === boss.team) continue;
        for (const cell of group.cells) {
          if (distSq(cell, center) > 1180 * 1180) continue;
          const n = norm(center.x - cell.x, center.y - cell.y);
          cell.vx += n.x * 220;
          cell.vy += n.y * 220;
        }
      }
    } else if (boss.demonSkill === "thorn") {
      for (let i = 0; i < 5; i++) addVirus(i % 2 ? "small" : "big");
    } else if (boss.demonSkill === "drain" || boss.demonSkill === "poison" || boss.demonSkill === "doom") {
      let stolen = 0;
      for (const group of groups) {
        if (group.dead || group.team === boss.team) continue;
        for (const cell of group.cells) {
          if (distSq(cell, center) > 980 * 980 || cell.mass < MIN_CELL_MASS * 3) continue;
          const bite = Math.min(cell.mass * 0.035, boss.demonSkill === "doom" ? 18 : 10);
          cell.mass -= bite;
          stolen += bite;
        }
      }
      const main = boss.cells[0];
      if (main) main.mass += stolen * 0.85;
    } else if (boss.demonSkill === "titan") {
      game.shake = Math.max(game.shake, 16);
      for (const group of groups) {
        if (group.dead || group.team === boss.team) continue;
        for (const cell of group.cells) {
          if (distSq(cell, center) > 1280 * 1280) continue;
          const n = norm(cell.x - center.x, cell.y - center.y);
          cell.vx += n.x * 360;
          cell.vy += n.y * 360;
          cell.mergeDelay = Math.max(cell.mergeDelay || 0, 1.2);
        }
      }
      for (const cell of boss.cells) cell.mass += 160;
    } else if (boss.demonSkill === "storm") {
      game.shake = Math.max(game.shake, 12);
      for (const group of groups) {
        if (group.dead || group.team === boss.team) continue;
        for (const cell of group.cells) {
          if (distSq(cell, center) > 900 * 900) continue;
          const angle = rand(0, Math.PI * 2);
          cell.vx += Math.cos(angle) * 260;
          cell.vy += Math.sin(angle) * 260;
        }
      }
    } else if (boss.demonSkill === "mirror" || boss.demonSkill === "command") {
      const dead = groups.find(group => group.isDemonMinion && group.dead);
      if (dead) {
        const angle = rand(0, Math.PI * 2);
        dead.dead = false;
        dead.respawnAt = 0;
        dead.cells = [makeCell(dead, clamp(center.x + Math.cos(angle) * 430, 160, WORLD - 160), clamp(center.y + Math.sin(angle) * 430, 160, WORLD - 160), rand(520, 940))];
      }
      for (const minion of groups.filter(group => group.isDemonMinion && !group.dead)) {
        minion.ai.target = { x: playerGroup.cells[0]?.x || center.x, y: playerGroup.cells[0]?.y || center.y };
        minion.ai.mode = "王令追击";
      }
    } else if (boss.demonSkill === "meteor" || boss.demonSkill === "rift" || boss.demonSkill === "aurora") {
      const shots = boss.demonSkill === "meteor" ? 16 : 10;
      for (let i = 0; i < shots; i++) {
        const angle = (i / shots) * Math.PI * 2 + rand(-0.1, 0.1);
        ejected.push({
          id: nextEntityId("ejected"),
          x: center.x + Math.cos(angle) * (center.largest + 24),
          y: center.y + Math.sin(angle) * (center.largest + 24),
          vx: Math.cos(angle) * rand(260, 520),
          vy: Math.sin(angle) * rand(260, 520),
          mass: rand(7, boss.demonSkill === "meteor" ? 22 : 15),
          radius: 8,
          age: 0.2,
          color: boss.color,
          accent: "#ffffff",
          spore: boss.demonSkill === "aurora" ? "aurora" : "meteor",
          ownerId: boss.id
        });
      }
      trimEjectedMass();
    } else if (boss.demonSkill === "tide" || boss.demonSkill === "core") {
      boss.demonMassFloor *= boss.demonSkill === "core" ? 1.04 : 1.02;
      for (const cell of boss.cells) cell.mass += boss.demonSkill === "core" ? 90 : 45;
    }
  }

  function chooseDemonTarget(group, now, space) {
    if (group.isBoss) {
      chooseDemonBossTarget(group, now, space);
      return;
    }

    chooseAiTarget(group, now, space);
    if (group.isDemonMinion) {
      refineDemonMinionTarget(group, space);
    } else if (group.team === 0) {
      refineDemonHeroTarget(group, space);
    }
  }

  function demonHeroes() {
    return groups.filter(group => !group.dead && group.team === 0 && group.cells.length);
  }

  function demonBosses() {
    return groups.filter(group => group.isBoss && !group.dead && group.cells.length);
  }

  function demonMinions() {
    return groups.filter(group => group.isDemonMinion && !group.dead && group.cells.length);
  }

  function demonEnemyCells(group, center, range, space) {
    const scanBuffer = group.ai.demonScanBuffer || (group.ai.demonScanBuffer = []);
    const pool = space ? nearbyCells(space.grid, center, range, scanBuffer) : allCells();
    let writeIndex = 0;
    for (const wrap of pool) {
      if (wrap.group === group || wrap.group.dead || wrap.cell.dead || sameTeam(group, wrap.group)) continue;
      pool[writeIndex++] = wrap;
    }
    pool.length = writeIndex;
    return pool;
  }

  function demonPassiveMode(mode) {
    return mode === "吃点" || mode === "游走" || mode === "集结" || mode === "重组" || mode === "进圈";
  }

  function bestDemonCellTarget(group, candidates, center, range, ai) {
    const largest = center.largestCell;
    if (!largest) return null;
    let best = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      if (candidate === group || candidate.dead || !candidate.cells.length) continue;
      for (const cell of candidate.cells) {
        if (cell.dead) continue;
        const d = Math.max(1, distance(largest, cell));
        if (d > range) continue;
        const canEatNow = largest.radius > cell.radius * 1.09;
        const canSplit = canSplitEatCell(largest, cell, ai);
        if (!canEatNow && !canSplit) continue;
        const playerBonus = isGameplayHuman(candidate) ? 1.2 : 0;
        const bossBonus = candidate.isBoss ? 0.85 : 0;
        const splitBonus = canSplit ? 1.55 : 0;
        const score = cell.mass / Math.max(90, d) + playerBonus + bossBonus + splitBonus;
        if (score > bestScore) {
          bestScore = score;
          best = { group: candidate, cell, distance: d, canSplit };
        }
      }
    }
    return bestScore > 1.05 ? best : null;
  }

  function chooseDemonBossTarget(boss, now, space) {
    const ai = boss.ai;
    const center = groupCenter(boss);
    const largest = center.largestCell;
    if (!ai || !largest) return;

    const heroes = demonHeroes();
    if (!heroes.length) {
      ai.target = randomPointInZone(160);
      ai.mode = "游走";
      ai.prey = null;
      return;
    }

    let threat = null;
    let prey = null;
    let threatScore = 0;
    let preyScore = 0;
    const scanRange = center.largest * (11.2 + ai.bravery) + 1500;
    const cells = demonEnemyCells(boss, center, scanRange, space);

    for (const wrap of cells) {
      const d = Math.max(1, distance(largest, wrap.cell));
      const centerD = Math.max(1, distance(center, wrap.cell));
      const enemyCanSplit = canSplitEatCell(wrap.cell, largest, { bravery: 1.08, accuracy: 1.02 }) && centerD < wrap.cell.radius * 6.1 + 520;
      const fragmentThreat = boss.cells.length > 1 && wrap.cell.radius > largest.radius * 0.92 && centerD < wrap.cell.radius * 6.2 + 560;
      const isThreat = (wrap.cell.radius > largest.radius * 1.05 || enemyCanSplit || fragmentThreat) && centerD < wrap.cell.radius * 7.2 + 760;
      if (isThreat) {
        const score = (wrap.cell.radius / Math.max(1, largest.radius)) * 1650 / centerD + (enemyCanSplit ? 2.4 : 0) + (fragmentThreat ? 1.4 : 0);
        if (score > threatScore) {
          threatScore = score;
          threat = wrap;
        }
      }

      const canEat = largest.radius > wrap.cell.radius * 1.08 && d < largest.radius * (7.8 + ai.bravery * 0.38) + 1040;
      const canSplit = canSplitEatCell(largest, wrap.cell, ai) && d < largest.radius * (6.3 + ai.bravery * 0.72) + 760;
      if (canEat || canSplit) {
        const score = wrap.cell.mass / Math.max(100, d) + (isGameplayHuman(wrap.group) ? 1.35 : 0) + (canSplit ? 1.8 : 0) + Math.max(0, 1600 - d) / 1600;
        if (score > preyScore) {
          preyScore = score;
          prey = wrap;
        }
      }
    }

    if (threat && threatScore > 2.15) {
      const counterVirus = bestVirusShot(center, threat.cell);
      if (counterVirus && ai.ejectCooldown <= 0) {
        ai.target = { x: counterVirus.x, y: counterVirus.y };
        ai.mode = "炸刺反打";
        ai.prey = threat;
        return;
      }

      const away = norm(center.x - threat.cell.x, center.y - threat.cell.y);
      ai.target = {
        x: clamp(center.x + away.x * 920 + (WORLD * 0.56 - center.x) * 0.12, 100, WORLD - 100),
        y: clamp(center.y + away.y * 920 + (WORLD * 0.50 - center.y) * 0.12, 100, WORLD - 100)
      };
      ai.mode = "魔王回撤";
      ai.prey = null;
      return;
    }

    if (prey) {
      const attackVirus = bestVirusShot(center, prey.cell);
      if (attackVirus && ai.ejectCooldown <= 0 && prey.cell.mass > 240) {
        ai.target = { x: attackVirus.x, y: attackVirus.y };
        ai.mode = "炸刺进攻";
        ai.prey = prey;
        return;
      }
      ai.target = leadPoint(prey.cell, boss.cells.length > 1 ? 0.7 : 0.52);
      ai.mode = "魔王追击";
      ai.prey = prey;
      return;
    }

    const pressure = heroes
      .map(hero => {
        const heroCenter = groupCenter(hero);
        const d = Math.max(1, distance(center, heroCenter));
        return { group: hero, center: heroCenter, distance: d, score: heroCenter.mass / d + (isGameplayHuman(hero) ? 0.55 : 0) };
      })
      .sort((a, b) => b.score - a.score)[0];
    if (pressure && pressure.center.largestCell) {
      const lead = leadPoint(pressure.center.largestCell, 0.72);
      ai.target = {
        x: clamp(lead.x, 120, WORLD - 120),
        y: clamp(lead.y, 120, WORLD - 120)
      };
      ai.mode = "魔王压迫";
      ai.prey = { group: pressure.group, cell: pressure.center.largestCell };
      return;
    }

    const food = nearestFood(center);
    ai.target = food ? { x: food.x, y: food.y } : randomPointInZone(160);
    ai.mode = food ? "吃点" : "游走";
    ai.prey = null;
  }

  function refineDemonHeroTarget(group, space) {
    const ai = group.ai;
    if (!ai || !demonPassiveMode(ai.mode)) return;
    const center = groupCenter(group);
    if (!center.largestCell) return;

    const minionPrey = bestDemonCellTarget(group, demonMinions(), center, center.largest * 8.2 + 1080, ai);
    if (minionPrey) {
      ai.target = leadPoint(minionPrey.cell, 0.48);
      ai.mode = "清魔兵";
      ai.prey = minionPrey;
      return;
    }

    const bossPrey = bestDemonCellTarget(group, demonBosses(), center, center.largest * 7.2 + 780, ai);
    if (bossPrey) {
      const attackVirus = bestVirusShot(center, bossPrey.cell);
      if (attackVirus && center.mass > 230 && ai.ejectCooldown <= 0) {
        ai.target = { x: attackVirus.x, y: attackVirus.y };
        ai.mode = "炸刺进攻";
        ai.prey = bossPrey;
        return;
      }
      ai.target = leadPoint(bossPrey.cell, 0.5);
      ai.mode = "合力打王";
      ai.prey = bossPrey;
    }
  }

  function refineDemonMinionTarget(group, space) {
    const ai = group.ai;
    if (!ai || !demonPassiveMode(ai.mode)) return;
    const center = groupCenter(group);
    if (!center.largestCell) return;

    const heroPrey = bestDemonCellTarget(group, demonHeroes(), center, center.largest * 7.6 + 900, ai);
    if (heroPrey) {
      ai.target = leadPoint(heroPrey.cell, 0.45);
      ai.mode = "魔兵追击";
      ai.prey = heroPrey;
      return;
    }

    const boss = demonBosses()
      .map(item => ({ group: item, center: groupCenter(item), d: distance(center, groupCenter(item)) }))
      .sort((a, b) => a.d - b.d)[0];
    if (boss && boss.center.largestCell) {
      if (center.mass > 150 && boss.d < 1260) {
        ai.target = { x: boss.center.x, y: boss.center.y };
        ai.mode = "喂球";
        ai.prey = { group: boss.group, cell: boss.center.largestCell };
        return;
      }
      const angle = Math.atan2(center.y - boss.center.y, center.x - boss.center.x) + group.ai.rallyOffset * 0.7;
      const radius = clamp(boss.center.largest * 2.2 + 320, 520, 1150);
      ai.target = {
        x: clamp(boss.center.x + Math.cos(angle) * radius, 120, WORLD - 120),
        y: clamp(boss.center.y + Math.sin(angle) * radius, 120, WORLD - 120)
      };
      ai.mode = "护王游走";
      ai.prey = null;
    }
  }

  function aiAttackMode(mode) {
    return mode === "追击" || mode === "围猎" || mode === "护航" || mode === "魔王追击" || mode === "魔王压迫" || mode === "魔兵追击" || mode === "清魔兵" || mode === "合力打王" || mode === "王令追击" || mode === "锁定勇者";
  }

  function aiEjectMode(mode) {
    return mode === "炸刺反打" || mode === "炸刺进攻" || mode === "喂球" || mode === "支援" || mode === "救援";
  }

  function leadPoint(cell, seconds) {
    return {
      x: cell.x + (cell.vx || 0) * seconds,
      y: cell.y + (cell.vy || 0) * seconds
    };
  }

  function canSplitEatCell(attacker, target, ai) {
    if (!attacker || !target || attacker.mass < SPLIT_MIN_MASS) return false;
    const childMass = attacker.mass * 0.5;
    const childRadius = radiusFromMass(childMass);
    const precision = ai ? (ai.accuracy - 1) * 0.035 : 0;
    const courage = ai ? (ai.bravery - 1) * 0.055 : 0;
    return childRadius > target.radius * (1.08 - precision) && childMass > target.mass * (1.1 - courage);
  }

  function tryAiSplitAttack(group, ai) {
    if (!aiAttackMode(ai.mode) || !ai.prey || ai.splitCooldown > 0 || group.cells.length >= maxCellsFor(group)) return;
    if (!ai.prey.cell || !ai.prey.group || ai.prey.group.dead || ai.prey.cell.dead || sameTeam(group, ai.prey.group)) return;
    const center = groupCenter(group);
    const largest = center.largestCell;
    if (!largest || !canSplitEatCell(largest, ai.prey.cell, ai)) return;

    const d = distance(largest, ai.prey.cell);
    const dominationBoost = modeConfig().domination ? 420 : 0;
    const modeBoost = group.isBoss ? 620 : group.isDemonMinion ? 330 : ai.mode === "围猎" ? 430 : ai.mode === "护航" ? 360 : 290;
    const reach = largest.radius * (5.2 + ai.bravery * (group.isBoss ? 1.05 : 0.85)) + modeBoost + dominationBoost;
    if (d > reach) return;

    const target = leadPoint(ai.prey.cell, group.isBoss ? 0.68 : ai.mode === "围猎" ? 0.62 : 0.44);
    const power = group.isBoss
      ? clamp(1.14 * ai.accuracy, 1.04, 1.32)
      : clamp(1.03 * ai.accuracy + (ai.mode === "护航" ? 0.05 : 0), 0.96, 1.24);
    if (splitGroup(group, target, { onlyLargest: true, power: power + (modeConfig().domination ? 0.04 : 0) })) {
      ai.splitCooldown = group.isBoss ? rand(2.4, 4.4) : ai.mode === "护航" ? rand(1.15, 2.1) : modeConfig().domination ? rand(1.05, 2.2) : rand(1.35, 2.75);
      ai.think = 0.04;
    }
  }

  function updateAi(dt, now, space) {
    for (const group of groups) {
      if (isHumanControlled(group) || group.dead) continue;
      if (!group.ai) group.ai = makeAiState(groupCenter(group));
      const ai = group.ai;
      ai.think -= dt;
      ai.splitCooldown = Math.max(0, ai.splitCooldown - dt);
      ai.ejectCooldown = Math.max(0, ai.ejectCooldown - dt);

      if (ai.think <= 0) {
        const demonOverride = modeConfig().demon && (group.isBoss || group.isDemonMinion || group.team === 0);
        if (demonOverride) {
          chooseDemonTarget(group, now, space);
        } else {
          chooseAiTarget(group, now, space);
        }
        ai.think = group.isBoss ? rand(0.06, 0.22) : rand(0.1, 0.42);
      }

      tryAiSplitAttack(group, ai);

      if (aiEjectMode(ai.mode) && ai.ejectCooldown <= 0) {
        const target = (ai.mode === "炸刺反打" || ai.mode === "炸刺进攻") ? ai.target : (ai.prey ? ai.prey.cell : ai.target);
        ejectMass(group, target, now);
        ai.ejectCooldown = (ai.mode === "支援" || ai.mode === "救援" || ai.mode === "喂球") ? rand(0.2, 0.48) : rand(0.14, 0.42);
      }
    }
  }

  function chooseAiTarget(group, now, space) {
    const ai = group.ai;
    const center = groupCenter(group);
    const largest = center.largestCell;
    if (!largest) return;
    const config = modeConfig();

    const zoneDist = Math.hypot(center.x - safeZone.x, center.y - safeZone.y);
    const zoneEdge = safeZone.radius - center.largest * 1.25;
    const zonePressure = zoneDist > zoneEdge || (safeZone.shrinking && zoneDist > safeZone.radius * 0.76);
    if (zonePressure) {
      ai.target = {
        x: lerp(center.x, safeZone.x, 0.82),
        y: lerp(center.y, safeZone.y, 0.82)
      };
      ai.mode = "进圈";
      ai.prey = null;
      return;
    }

    let threat = null;
    let prey = null;
    let threatScore = 0;
    let preyScore = 0;
    const aggression = (config.domination ? 1.28 : config.respawn ? 1.08 : 1) * (config.aiAggroScale || 1) * activeEventFactor("aiAggroMult", 1);
    const scanRange = center.largest * (10.5 + ai.bravery) * aggression + 1100;
    const scanBuffer = ai.scanBuffer || (ai.scanBuffer = []);
    const cells = space ? nearbyCells(space.grid, center, scanRange, scanBuffer) : allCells();

    for (const wrap of cells) {
      if (wrap.group === group) continue;
      if (sameTeam(group, wrap.group)) continue;
      const d = Math.max(1, distance(largest, wrap.cell));
      const centerD = Math.max(1, distance(center, wrap.cell));
      const enemyCanSplit = canSplitEatCell(wrap.cell, largest, { bravery: 1.08, accuracy: 1.02 }) && centerD < wrap.cell.radius * 6.1 + 460;
      const isThreat = (wrap.cell.radius > center.largest * 1.05 || enemyCanSplit) && centerD < wrap.cell.radius * 7.4 + 760;
      if (isThreat) {
        const score = (wrap.cell.radius / center.largest) * 1450 / centerD + (enemyCanSplit ? 1.8 : 0);
        if (score > threatScore) {
          threatScore = score;
          threat = wrap;
        }
      }

      const canEat = center.largest > wrap.cell.radius * 1.08 && d < center.largest * (9.4 + ai.bravery) * aggression + 820;
      const canSplit = canSplitEatCell(largest, wrap.cell, ai) && d < center.largest * (5.9 + ai.bravery * 0.9) * aggression + 470;
      if (canEat || canSplit) {
        const score = (wrap.cell.mass * (1.75 + ai.bravery * 0.34)) / d + (isGameplayHuman(wrap.group) ? 1.2 : 0) + (canSplit ? (config.domination ? 2.35 : 1.75) : 0);
        if (score > preyScore) {
          preyScore = score;
          prey = wrap;
        }
      }
    }

    if (threat) {
      const counterVirus = bestVirusShot(center, threat.cell);
      if (counterVirus && center.mass > 210 && ai.virusInterest > 0.18) {
        ai.target = { x: counterVirus.x, y: counterVirus.y };
        ai.mode = "炸刺反打";
        ai.prey = threat;
        return;
      }

      const shelter = bestTeamShelter(group, center, threat);
      if (shelter) {
        const away = norm(center.x - threat.cell.x, center.y - threat.cell.y);
        ai.target = clampPlayablePoint(shelter.center.x + away.x * 260, shelter.center.y + away.y * 260, 80);
        ai.mode = "抱团避险";
        ai.prey = null;
        return;
      }

      const away = norm(center.x - threat.cell.x, center.y - threat.cell.y);
      ai.target = clampPlayablePoint(
        center.x + away.x * (config.domination ? 1180 : 900) + (safeZone.x - center.x) * 0.18,
        center.y + away.y * (config.domination ? 1180 : 900) + (safeZone.y - center.y) * 0.18,
        80
      );
      ai.mode = "逃跑";
      ai.prey = null;
      return;
    }

    if (config.control) {
      const point = bestControlPointFor(group, center);
      if (point) {
        const angle = rand(0, Math.PI * 2);
        const radius = rand(0, point.radius * 0.42);
        ai.target = {
          x: clamp(point.x + Math.cos(angle) * radius, 80, WORLD - 80),
          y: clamp(point.y + Math.sin(angle) * radius, 80, WORLD - 80)
        };
        ai.mode = point.owner === group.team ? "守点" : "占点";
        ai.prey = null;
        return;
      }
    }

    if (config.teams > 0) {
      const fragment = bestAllyFragment(group, center);
      if (fragment) {
        ai.target = leadPoint(fragment.cell, 0.3);
        ai.mode = "接分身";
        ai.prey = { group: fragment.group, cell: fragment.cell };
        return;
      }

      const rescue = bestAllyRescue(group, center, cells);
      if (rescue) {
        if (canSplitEatCell(largest, rescue.threat.cell, ai) && group.cells.length < maxCellsFor(group)) {
          ai.target = leadPoint(rescue.threat.cell, 0.45);
          ai.mode = "护航";
          ai.prey = rescue.threat;
          return;
        }
        if (center.mass > 145) {
          ai.target = { x: rescue.allyCenter.x, y: rescue.allyCenter.y };
          ai.mode = "救援";
          ai.prey = { group: rescue.ally, cell: rescue.allyCenter.largestCell || rescue.ally.cells[0] };
          return;
        }
      }
    }

    if (prey) {
      const attackVirus = bestVirusShot(center, prey.cell);
      if (attackVirus && center.mass > 185 && prey.cell.mass > center.mass * 0.45 && ai.virusInterest > 0.22) {
        ai.target = { x: attackVirus.x, y: attackVirus.y };
        ai.mode = "炸刺进攻";
        ai.prey = prey;
        return;
      }

      ai.target = leadPoint(prey.cell, 0.55);
      ai.mode = "追击";
      ai.prey = prey;
      return;
    }

    if (config.teams > 0) {
      const hunt = bestTeamHunt(group, center, cells);
      if (hunt) {
        ai.target = hunt.target;
        ai.mode = "围猎";
        ai.prey = hunt.prey;
        return;
      }

      const ally = bestAllySupport(group, center);
      if (ally && center.mass > 145) {
        ai.target = { x: ally.center.x, y: ally.center.y };
        ai.mode = ally.mode;
        ai.prey = { group: ally.group, cell: ally.center.largestCell || ally.group.cells[0] };
        return;
      }
    }

    const virus = nearestVirus(center);
    if (virus && group.cells.length < maxCellsFor(group) - 2 && center.mass > 280 && ai.virusInterest > 0.32 && distance(center, virus) < 820) {
      ai.target = { x: virus.x, y: virus.y };
      ai.mode = "炸刺";
      ai.prey = null;
      return;
    }

    if (group.cells.length > 5 && group.cells.some(cell => cell.mergeDelay > 0)) {
      ai.target = { x: center.x, y: center.y };
      ai.mode = "重组";
      ai.prey = null;
      return;
    }

    if (config.teams > 0) {
      const rally = teamRallyPoint(group, center);
      if (rally) {
        ai.target = rally.target;
        ai.mode = "集结";
        ai.prey = null;
        return;
      }
    }

    const lateAlly = bestAllySupport(group, center);
    if (lateAlly && center.mass > 145) {
      ai.target = { x: lateAlly.center.x, y: lateAlly.center.y };
      ai.mode = lateAlly.mode;
      ai.prey = { group: lateAlly.group, cell: lateAlly.center.largestCell || lateAlly.group.cells[0] };
      return;
    }

    const food = nearestFood(center);
    if (food) {
      ai.target = { x: food.x, y: food.y };
      ai.mode = "吃点";
      ai.prey = null;
    } else {
      ai.target = randomPointInZone(120);
      ai.mode = "游走";
      ai.prey = null;
    }
  }

  function bestVirusShot(center, threat) {
    if (!viruses.length) return null;
    const toThreat = norm(threat.x - center.x, threat.y - center.y);
    const threatDist = toThreat.length;
    let best = null;
    let bestScore = Infinity;

    for (const virus of viruses) {
      if (virus.launched) continue;
      const dx = virus.x - center.x;
      const dy = virus.y - center.y;
      const projection = dx * toThreat.x + dy * toThreat.y;
      if (projection < center.largest + 60 || projection > threatDist - threat.radius * 0.35) continue;
      const perpendicular = Math.abs(dx * toThreat.y - dy * toThreat.x);
      if (perpendicular > virus.radius + 95) continue;
      const score = perpendicular * 4 + Math.abs(projection - threatDist * 0.48);
      if (score < bestScore) {
        bestScore = score;
        best = virus;
      }
    }

    return best;
  }

  function teamSide(group) {
    let hash = 0;
    for (let i = 0; i < group.id.length; i++) hash += group.id.charCodeAt(i) * (i + 1);
    return hash % 2 === 0 ? 1 : -1;
  }

  function alliedGroups(group) {
    const config = modeConfig();
    if (!config.teams) return [];
    return groups.filter(ally => ally !== group && !ally.dead && ally.team === group.team && ally.cells.length > 0);
  }

  function bestTeamAnchor(group, center) {
    let best = null;
    let bestScore = 0;
    for (const ally of alliedGroups(group)) {
      const allyCenter = groupCenter(ally);
      const d = Math.max(1, distance(center, allyCenter));
      const score = allyCenter.mass * (isGameplayHuman(ally) ? 1.32 : 1) / Math.max(420, d);
      if (score > bestScore) {
        bestScore = score;
        best = { group: ally, center: allyCenter, distance: d };
      }
    }
    return best;
  }

  function bestTeamShelter(group, center, threat) {
    if (!threat || !modeConfig().teams) return null;
    let best = null;
    let bestScore = 0;
    for (const ally of alliedGroups(group)) {
      const allyCenter = groupCenter(ally);
      if (!allyCenter.largestCell || allyCenter.largest < center.largest * 1.02) continue;
      const d = distance(center, allyCenter);
      if (d > 1450) continue;
      const threatDistance = distance(threat.cell, allyCenter);
      const canContest = allyCenter.largest > threat.cell.radius * 0.86 || canSplitEatCell(allyCenter.largestCell, threat.cell, { bravery: 1.05, accuracy: 1.02 });
      const score = (canContest ? 2.2 : 0.8) + (isGameplayHuman(ally) ? 0.6 : 0) + Math.max(0, 1450 - d) / 650 - threatDistance / 2400;
      if (score > bestScore) {
        bestScore = score;
        best = { group: ally, center: allyCenter };
      }
    }
    return bestScore > 1.45 ? best : null;
  }

  function bestAllyFragment(group, center) {
    const config = modeConfig();
    if (!config.teams || !center.largestCell) return null;
    let best = null;
    let bestScore = 0;
    for (const ally of alliedGroups(group)) {
      const liveCount = liveCellCount(ally);
      if (liveCount <= 1) continue;
      for (const cell of ally.cells) {
        if (cell.dead) continue;
        const splitFragment = cell.mergeDelay > 0 || liveCount > 2 || cell.mass < groupMass(ally) * 0.34;
        if (!splitFragment) continue;
        if (center.largestCell.radius <= cell.radius * 1.01) continue;
        const d = Math.max(1, distance(center.largestCell, cell));
        if (d > center.largest * 5.8 + 760) continue;
        const score = (isGameplayHuman(ally) ? 2.2 : 1) + (cell.mergeDelay > 0 ? 1.25 : 0.45) + cell.mass / Math.max(120, d) + Math.max(0, 720 - d) / 650;
        if (score > bestScore) {
          bestScore = score;
          best = { group: ally, cell };
        }
      }
    }
    return bestScore > 1.7 ? best : null;
  }

  function bestAllyRescue(group, center, cells) {
    const config = modeConfig();
    if (!config.teams || !cells) return null;
    let best = null;
    let bestScore = 0;

    for (const ally of alliedGroups(group)) {
      const allyCenter = groupCenter(ally);
      if (!allyCenter.largestCell) continue;
      const allyDistance = distance(center, allyCenter);
      if (allyDistance > (isGameplayHuman(ally) ? 1900 : 1350)) continue;

      for (const wrap of cells) {
        if (wrap.group === group || sameTeam(group, wrap.group) || wrap.group.dead || wrap.cell.dead) continue;
        const d = Math.max(1, distance(allyCenter, wrap.cell));
        const enemySplitThreat = canSplitEatCell(wrap.cell, allyCenter.largestCell, { bravery: 1.04, accuracy: 1 }) && d < wrap.cell.radius * 5.8 + 410;
        const enemyCloseThreat = wrap.cell.radius > allyCenter.largest * 1.06 && d < wrap.cell.radius * 6.6 + 640;
        const fragmentThreat = liveCellCount(ally) > 1 && ally.cells.some(cell => !cell.dead && cell.mergeDelay > 0 && wrap.cell.radius > cell.radius * 1.08 && distance(wrap.cell, cell) < wrap.cell.radius * 4.4 + 420);
        if (!enemySplitThreat && !enemyCloseThreat && !fragmentThreat) continue;

        const canAnswer = canSplitEatCell(center.largestCell, wrap.cell, group.ai) || center.largest > wrap.cell.radius * 0.9;
        const score = (isGameplayHuman(ally) ? 3.2 : 1.4) + (fragmentThreat ? 1.2 : 0) + (canAnswer ? 1.4 : 0.35) + Math.max(0, 1600 - allyDistance) / 650 + wrap.cell.mass / 300;
        if (score > bestScore) {
          bestScore = score;
          best = { ally, allyCenter, threat: wrap };
        }
      }
    }

    return bestScore > 2.6 ? best : null;
  }

  function bestTeamHunt(group, center, cells) {
    const config = modeConfig();
    if (!config.teams || !cells || !center.largestCell) return null;
    const allies = alliedGroups(group).map(ally => {
      const allyCenter = groupCenter(ally);
      return { group: ally, center: allyCenter, distance: distance(center, allyCenter) };
    }).filter(item => item.distance < 1550);
    if (!allies.length) return null;

    let best = null;
    let bestScore = 0;
    for (const wrap of cells) {
      if (wrap.group === group || sameTeam(group, wrap.group) || wrap.group.dead || wrap.cell.dead) continue;
      const d = Math.max(1, distance(center, wrap.cell));
      if (d > 1850) continue;

      let localPower = center.mass;
      let biggest = center.largest;
      let allyPressure = 0;
      for (const ally of allies) {
        const ad = Math.max(1, distance(ally.center, wrap.cell));
        const weight = clamp((1750 - ad) / 1750, 0, 1);
        localPower += ally.center.mass * weight * 0.72;
        biggest = Math.max(biggest, ally.center.largest);
        allyPressure += weight * (isGameplayHuman(ally.group) ? 1.35 : 1);
      }

      const vulnerable = wrap.cell.mass < localPower * 0.44 || wrap.cell.radius < biggest * 1.16;
      const tooDangerous = wrap.cell.radius > center.largest * 1.42 && d < wrap.cell.radius * 4.7;
      if (!vulnerable || tooDangerous || allyPressure < 0.62) continue;

      const score = localPower / Math.max(120, wrap.cell.mass) + allyPressure * 1.15 + (isGameplayHuman(wrap.group) ? 0.7 : 0) - d / 1600;
      if (score > bestScore) {
        const toward = norm(wrap.cell.x - center.x, wrap.cell.y - center.y);
        const side = teamSide(group);
        const offset = clamp(wrap.cell.radius * 1.45 + center.largest * 0.45, 90, 280);
        const lead = leadPoint(wrap.cell, 0.52);
        bestScore = score;
        best = {
          prey: wrap,
          target: {
            x: clamp(lead.x - toward.y * offset * side, 80, WORLD - 80),
            y: clamp(lead.y + toward.x * offset * side, 80, WORLD - 80)
          }
        };
      }
    }

    return bestScore > 2.25 ? best : null;
  }

  function bestAllySupport(group, center) {
    const config = modeConfig();
    if (!config.teams || !group.ai) return null;
    let best = null;
    let bestScore = 0;
    for (const ally of alliedGroups(group)) {
      const allyCenter = groupCenter(ally);
      const d = Math.max(1, distance(center, allyCenter));
      if (d > 1360) continue;
      const allyIsCarry = isGameplayHuman(ally) || allyCenter.mass > center.mass * 1.02;
      const needsMass = allyIsCarry || ally.cells.some(cell => cell.mergeDelay > 0) || allyCenter.mass < center.mass * 0.62;
      if (!needsMass || center.mass < 118) continue;
      const playerBonus = isGameplayHuman(ally) ? 1.15 : 0;
      const feedMode = allyIsCarry ? "喂球" : "支援";
      const score = (allyIsCarry ? 1.4 : 0.75) + playerBonus + group.ai.teamwork * 0.65 + Math.max(0, 760 - d) / 560 - Math.max(0, allyCenter.mass - center.mass * 2.6) / 900;
      if (score > bestScore) {
        bestScore = score;
        best = { group: ally, center: allyCenter, mode: feedMode };
      }
    }
    return bestScore > 1.72 ? best : null;
  }

  function teamRallyPoint(group, center) {
    const anchor = bestTeamAnchor(group, center);
    if (!anchor) return null;
    const wantsRally = anchor.distance > 980 || (center.mass < anchor.center.mass * 0.54 && anchor.distance > 540);
    if (!wantsRally) return null;
    const angle = Math.atan2(center.y - anchor.center.y, center.x - anchor.center.x) + group.ai.rallyOffset * 0.9;
    const radius = clamp(anchor.center.largest * 3.2 + 260, 420, 860);
    return {
      target: {
        x: clamp(anchor.center.x + Math.cos(angle) * radius, 80, WORLD - 80),
        y: clamp(anchor.center.y + Math.sin(angle) * radius, 80, WORLD - 80)
      },
      anchor
    };
  }

  function nearestFood(point) {
    let best = null;
    let bestD = Infinity;
    const bx = Math.floor(point.x / FOOD_BUCKET);
    const by = Math.floor(point.y / FOOD_BUCKET);

    for (let radius = 0; radius <= 4; radius++) {
      for (let gx = bx - radius; gx <= bx + radius; gx++) {
        for (let gy = by - radius; gy <= by + radius; gy++) {
          if (radius > 0 && gx > bx - radius && gx < bx + radius && gy > by - radius && gy < by + radius) continue;
          const bucket = foodGrid.get(foodBucketKey(gx, gy));
          if (!bucket) continue;
          for (const food of bucket) {
            const d = distSq(point, food);
            if (d < bestD) {
              bestD = d;
              best = food;
            }
          }
        }
      }
      if (best) return best;
    }

    const sample = Math.min(90, foods.length);
    for (let i = 0; i < sample; i++) {
      const food = foods[Math.floor(Math.random() * foods.length)];
      if (!food) continue;
      const d = distSq(point, food);
      if (d < bestD) {
        bestD = d;
        best = food;
      }
    }
    return best;
  }

  function nearestVirus(point) {
    let best = null;
    let bestD = Infinity;
    for (const virus of viruses) {
      const d = distSq(point, virus);
      if (d < bestD) {
        bestD = d;
        best = virus;
      }
    }
    return best;
  }

  function virusBaseMass(virus) {
    if (virus.kind === "spore") return virus.baseMass || VIRUS_MASS * 0.92;
    return virus.baseMass || (virus.kind === "big" ? BIG_VIRUS_MASS : VIRUS_MASS);
  }

  function virusColor(virus) {
    if (virus.tactical) return "#86efac";
    if (virus.kind === "spore") return "#f472b6";
    return virus.kind === "big" ? "#c7ff6f" : "#5eea80";
  }

  function updateGroupMovement(dt, now) {
    const playerTarget = cursorPoint();
    for (const group of groups) {
      if (group.dead) continue;
      const human = isGameplayHuman(group);
      const target = authorityMode && isHumanControlled(group)
        ? authorityTargetFor(group)
        : group.isPlayer && !authorityMode ? playerTarget : group.ai.target;
      for (const cell of group.cells) {
        const demonMoveBoost = group.isBoss ? 1.28 : group.isDemonMinion ? 1.12 : 1;
        const modeSpeed = modeConfig().speedScale || 1;
        const skillBoost = human && (group.screenSkillUntil || (group === playerGroup ? game.screenSkillUntil : 0)) > now ? 1.18 : 1;
        gameplayCore.applyMovement(cell, target, dt, {
          speedScale: activeEventFactor("speedMult", 1) * modeSpeed * demonMoveBoost * skillBoost,
          steerRate: human ? gameplayCore.MOVEMENT.playerSteerRate : gameplayCore.MOVEMENT.aiSteerRate
        });
        cell.mergeDelay = Math.max(0, cell.mergeDelay - dt);
        if (cell.mergeDelay <= 0) cell.mergeMax = 0;
        if (!group.isBoss) {
          cell.mass *= 1 - dt * (human ? 0.0014 : 0.0011);
        } else if (group.demonMassFloor) {
          cell.mass = Math.max(cell.mass, group.demonMassFloor / Math.max(1, group.cells.length));
        }
        keepInside(cell);
      }
    }
  }

  function updateEjected(dt) {
    let virusSpace = buildVirusCollisionGrid();
    for (let i = ejected.length - 1; i >= 0; i--) {
      const mass = ejected[i];
      mass.age += dt;
      mass.x += mass.vx * dt;
      mass.y += mass.vy * dt;
      mass.vx *= Math.pow(0.035, dt);
      mass.vy *= Math.pow(0.035, dt);
      keepInside(mass);

      const nearby = nearbyViruses(virusSpace, mass, ejectedVirusCandidateBuffer);
      for (const candidate of nearby) {
        const v = candidate.index;
        const virus = candidate.virus;
        if (viruses[v] !== virus) continue;
        if (gameplayCore.ejectedHitsVirus(mass, virus)) {
          const color = virusColor(virus);
          const baseMass = virusBaseMass(virus);
          const feed = gameplayCore.virusFeedPlan({
            kind: virus.kind,
            currentMass: virus.mass,
            baseMass,
            ejectedMass: mass.mass
          });
          sparkle(mass.x, mass.y, color, 6, 130);
          viruses[v].mass = feed.nextMass;
          ejected.splice(i, 1);
          if (feed.shouldLaunch) {
            launchVirus(v, mass);
            virusSpace = buildVirusCollisionGrid();
          }
          break;
        }
      }

      const ownerGroup = mass.ownerGroup || (mass.ownerGroup = groups.find(group => group.id === mass.ownerId));
      const lifetime = isGameplayHuman(ownerGroup) ? 30 : 20;
      if (i < ejected.length && mass.age > lifetime) ejected.splice(i, 1);
    }
  }

  function launchVirus(index, seed) {
    const virus = viruses[index];
    const big = virus.kind === "big";
    const baseMass = virusBaseMass(virus);
    const launch = gameplayCore.virusLaunchPlan({
      virus,
      seed,
      baseMass,
      bigRadius: big ? rand(62, 76) : undefined,
      minimumX: 120,
      maximumX: WORLD - 120,
      minimumY: 120,
      maximumY: WORLD - 120
    });
    const extra = {
      ...launch,
      id: nextEntityId("virus"),
      spin: rand(0, Math.PI * 2),
      age: 0
    };
    delete extra.ageSeconds;
    virus.mass = baseMass;
    virus.baseMass = baseMass;
    if (viruses.length < virusLimit()) viruses.push(extra);
    ring(virus.x, virus.y, virusColor(virus), big ? 210 : 170);
  }

  function updateFoodSpawns(dt, now) {
    const target = foodTargetCount(now);
    const spawn = gameplayCore.advanceFoodSpawnBank({
      bank: foodSpawnBank,
      dt,
      rate: foodSpawnRate(now),
      shortage: target - foods.length
    });
    foodSpawnBank = spawn.bank;
    for (let i = 0; i < spawn.count; i++) addFood(makeFood());
  }

  function handleFoodEating(now, cells) {
    cells = cells || allCells();
    for (const wrap of cells) {
      const cell = wrap.cell;
      if (cell.dead) continue;
      if (groupInvincible(wrap.group, now)) continue;
      const reach = (cell.radius + 18) * activeEventFactor("eatReachMult", 1);
      const minX = Math.floor((cell.x - reach) / FOOD_BUCKET);
      const maxX = Math.floor((cell.x + reach) / FOOD_BUCKET);
      const minY = Math.floor((cell.y - reach) / FOOD_BUCKET);
      const maxY = Math.floor((cell.y + reach) / FOOD_BUCKET);

      for (let bx = minX; bx <= maxX; bx++) {
        for (let by = minY; by <= maxY; by++) {
          const bucket = foodGrid.get(foodBucketKey(bx, by));
          if (!bucket) continue;
          for (let i = bucket.length - 1; i >= 0; i--) {
            const food = bucket[i];
            if (distSq(cell, food) < (cell.radius + food.radius * 0.45) ** 2) {
              cell.mass += food.mass;
              if (isGameplayHuman(wrap.group)) game.foodEaten += 1;
              if (isGameplayHuman(wrap.group) || isNearCamera(food, 120)) {
                sparkle(food.x, food.y, food.color, food.rich ? 7 : 4, food.rich ? 130 : 90);
              }
              removeFood(food);
              foodSpawnBank += food.rich ? 0.7 : 0.35;
            }
          }
        }
      }
    }
  }

  function handleEjectedEating(space) {
    const collisionSpace = space || buildCellGrid();
    const { grid } = collisionSpace;
    const scanRange = clamp((collisionSpace.maxRadius || 360) + 70, 140, 760);
    for (let i = ejected.length - 1; i >= 0; i--) {
      const mass = ejected[i];
      const ownerGroup = mass.ownerGroup || (mass.ownerGroup = groups.find(item => item.id === mass.ownerId));
      const cells = nearbyCells(grid, mass, scanRange, ejectedCandidateBuffer);
      let eater = null;
      let eaterSameOwner = false;
      let largestEaterRadius = -1;
      for (const wrap of cells) {
        if (wrap.cell.dead) continue;
        if (groupInvincible(wrap.group)) continue;
        const sameOwner = mass.ownerId === wrap.group.id;
        const playerOwned = isGameplayHuman(ownerGroup);
        if (gameplayCore.canCollectEjected({
          sameOwner,
          playerOwned,
          ageSeconds: mass.age,
          cellRadius: wrap.cell.radius,
          itemRadius: mass.radius,
          distanceSquared: distSq(wrap.cell, mass)
        })) {
          if (wrap.cell.radius <= largestEaterRadius) continue;
          largestEaterRadius = wrap.cell.radius;
          eater = wrap;
          eaterSameOwner = sameOwner;
        }
      }
      if (eater) {
        const multiplier = eaterSameOwner ? 1 : ownerGroup && sameTeam(eater.group, ownerGroup) ? 0.96 : 0.92;
        eater.cell.mass += mass.mass * multiplier;
        if (isGameplayHuman(eater.group) || isNearCamera(mass, 120)) sparkle(mass.x, mass.y, eater.group.color, 5, 110);
        ejected.splice(i, 1);
      }
    }
  }

  function handleCellEating(space, now = authorityNow) {
    const { cells, grid } = space || buildCellGrid();
    cells.sort((a, b) => b.cell.radius - a.cell.radius);
    for (let i = 0; i < cells.length; i++) {
      const big = cells[i];
      if (big.cell.dead) continue;
      const candidates = nearbyCells(grid, big.cell, big.cell.radius + 80, cellCandidateBuffer);
      for (const small of candidates) {
        if (small === big) continue;
        if (small.cell.dead || small.group === big.group) continue;
        const teammate = sameTeam(big.group, small.group);
        if (groupInvincible(big.group, now) || groupInvincible(small.group, now)) continue;
        if (teammate && liveCellCount(small.group) <= 1) continue;
        if (teammate ? canEatTeammate(big.cell, small.cell) : canEat(big.cell, small.cell)) {
          big.cell.mass += small.cell.mass * (teammate ? 0.96 : 0.84);
          small.cell.dead = true;
          small.cell.killedBy = teammate ? null : big.group;
          if (!teammate && isGameplayHuman(big.group)) {
            game.foodEaten += Math.max(3, Math.round(small.cell.mass / 18));
            game.shake = Math.max(game.shake, 4);
          }
          if (!teammate && isGameplayHuman(small.group)) game.shake = Math.max(game.shake, 9);
          if (teammate && (isGameplayHuman(big.group) || isGameplayHuman(small.group))) game.shake = Math.max(game.shake, 3);
          if (isGameplayHuman(big.group) || isGameplayHuman(small.group) || isNearCamera(small.cell, 180)) {
            sparkle(small.cell.x, small.cell.y, small.group.color, 24, 230);
            ring(small.cell.x, small.cell.y, small.group.color, 120);
          }
        }
      }
    }
  }

  function canEat(big, small) {
    if (big.radius <= small.radius * 1.08) return false;
    const d = distance(big, small);
    return d < big.radius - small.radius * 0.22;
  }

  function canEatTeammate(big, small) {
    if (big.radius <= small.radius * 1.01) return false;
    const d = distance(big, small);
    return d < big.radius - small.radius * 0.05;
  }

  function handleVirusHits(dt, now, space) {
    const currentSpace = space || buildCellGrid();
    for (let v = viruses.length - 1; v >= 0; v--) {
      const virus = viruses[v];
      if (virus.launched) {
        const motion = gameplayCore.advanceLaunchedVirus({ ...virus, ageSeconds: virus.age }, dt);
        virus.age = motion.ageSeconds;
        virus.x = motion.x;
        virus.y = motion.y;
        virus.vx = motion.vx;
        virus.vy = motion.vy;
        virus.launched = motion.launched;
        keepInside(virus);
      }

      const scanRange = virus.radius + (currentSpace.maxRadius || 360) + 110;
      const cells = nearbyCells(currentSpace.grid, virus, scanRange, virusCandidateBuffer).sort((a, b) => b.cell.radius - a.cell.radius);
      for (const wrap of cells) {
        const cell = wrap.cell;
        if (cell.dead) continue;
        if (groupInvincible(wrap.group, now)) continue;
        const hitScale = virus.kind === "big" ? 0.94 : virus.kind === "spore" ? 1.0 : 1.08;
        const biteScale = virus.kind === "big" ? 0.42 : virus.kind === "spore" ? 0.38 : 0.35;
        if (cell.radius > virus.radius * hitScale && distSq(cell, virus) < (cell.radius + virus.radius * biteScale) ** 2) {
          if (virus.kind === "spore") burstCellBySporeVirus(wrap.group, cell, virus, now);
          else splitCellByVirus(wrap.group, cell, virus, now);
          consumeVirus(v, virus);
          break;
        }
      }
    }
  }

  function burstCellBySporeVirus(group, cell, virus, now) {
    const color = virusColor(virus);
    const config = modeConfig();
    const lossMin = config.sporeVirusLossMin !== undefined ? config.sporeVirusLossMin : 0.5;
    const lossMax = config.sporeVirusLossMax !== undefined ? config.sporeVirusLossMax : 0.5;
    const plan = gameplayCore.sporeBurstPlan({
      cellMass: cell.mass,
      lossMinimum: lossMin,
      lossMaximum: lossMax,
      minimumPieces: config.sporeVirusBurstMin || 16,
      maximumPieces: config.sporeVirusBurstMax || 30,
      pieceMass: config.sporeVirusPieceMass || 17
    });
    const { lossRatio, loss, pieces, pieceMass } = plan;
    if (!plan.canBurst) {
      cell.mass += virusBaseMass(virus) * 0.42;
      return;
    }
    cell.mass -= loss;
    cell.mergeDelay = Math.max(cell.mergeDelay, mergeCooldown(cell.mass, "virus") * 0.42);
    cell.mergeMax = Math.max(cell.mergeMax || 0, cell.mergeDelay);

    for (let i = 0; i < pieces; i++) {
      const angle = (Math.PI * 2 * i) / pieces + rand(-0.18, 0.18);
      const speed = rand(420, 720);
      ejected.push({
        id: nextEntityId("ejected"),
        x: cell.x + Math.cos(angle) * (cell.radius + 12),
        y: cell.y + Math.sin(angle) * (cell.radius + 12),
        vx: cell.vx * 0.18 + Math.cos(angle) * speed,
        vy: cell.vy * 0.18 + Math.sin(angle) * speed,
        mass: pieceMass,
        radius: radiusFromMass(pieceMass),
        age: isGameplayHuman(group) ? 0.18 : 0,
        color: sporeColorFor(group),
        accent: group.cosmetics?.spore
          ? sharedCosmetics.definition("spore", group.cosmetics.spore)?.accent || group.color
          : group === playerGroup ? selectedSporeDef().accent || "#ffffff" : group.color,
        spore: sporePatternFor(group),
        ownerId: group.id,
        sporeBurst: true
      });
    }
    trimEjectedMass();
    sparkle(virus.x, virus.y, color, isGameplayHuman(group) ? 48 : 60, 280);
    ring(virus.x, virus.y, color, 210);
    if (isGameplayHuman(group)) {
      game.shake = Math.max(game.shake, 8);
      game.splitFlash = Math.max(game.splitFlash, 0.24);
      showEventBanner("孢子刺球", `命中分身损失 ${Math.round(lossRatio * 100)}% 质量`, color);
    } else if (group.ai) {
      group.ai.splitCooldown = Math.max(group.ai.splitCooldown, 1.4);
      group.ai.mode = "回收孢子";
    }
  }

  function splitCellByVirus(group, cell, virus, now) {
    const index = group.cells.indexOf(cell);
    if (index === -1) return;
    const big = virus.kind === "big";
    const color = virusColor(virus);
    const available = maxCellsFor(group) - group.cells.length + 1;
    const config = modeConfig();
    const plan = gameplayCore.virusSplitPlan({
      cellMass: cell.mass,
      virusMass: virusBaseMass(virus),
      big,
      player: isGameplayHuman(group),
      available,
      playerPieceCap: big ? config.bigVirusPlayerPieces : config.virusPlayerPieces
    });
    const { totalMass, pieces, pieceMass } = plan;
    sparkle(virus.x, virus.y, color, big ? 68 : 40, big ? 310 : 250);
    ring(virus.x, virus.y, color, big ? 230 : 170);

    if (!plan.split) {
      cell.mass = totalMass;
      cell.mergeDelay = Math.max(cell.mergeDelay, mergeCooldown(totalMass, big ? "virus-big" : "virus"));
      cell.mergeMax = Math.max(cell.mergeMax || 0, cell.mergeDelay);
      return;
    }

    group.cells.splice(index, 1);

    for (let i = 0; i < pieces; i++) {
      const angle = (Math.PI * 2 * i) / pieces + rand(-0.16, 0.16);
      const c = makeCell(group, cell.x + Math.cos(angle) * cell.radius * 0.18, cell.y + Math.sin(angle) * cell.radius * 0.18, pieceMass);
      c.vx = cell.vx * 0.24 + Math.cos(angle) * (big ? rand(390, 640) : rand(330, 560));
      c.vy = cell.vy * 0.24 + Math.sin(angle) * (big ? rand(390, 640) : rand(330, 560));
      c.mergeDelay = mergeCooldown(pieceMass, big ? "virus-big" : "virus");
      c.mergeMax = c.mergeDelay;
      group.cells.push(c);
    }

    if (isGameplayHuman(group)) {
      game.shake = 12;
      game.splitFlash = 0.32;
    } else {
      group.ai.splitCooldown = Math.max(group.ai.splitCooldown, 2.2);
      group.ai.target = { x: safeZone.x, y: safeZone.y };
      group.ai.mode = "重组";
    }
  }

  function consumeVirus(index, virus) {
    virus.dead = true;
    viruses.splice(index, 1);
    virusRespawnQueue.push(authorityNow + 900 + Math.random() * 1300);
    virusRespawnQueue.sort((a, b) => a - b);
  }

  function updateVirusRespawns(now) {
    while (virusRespawnQueue.length && virusRespawnQueue[0] <= now) {
      virusRespawnQueue.shift();
      if (!game.over) addVirus();
    }
  }

  function updateGroupSeparation(dt) {
    for (const group of groups) {
      if (group.dead) continue;
      const liveCells = group.cells.filter(cell => !cell.dead);
      const allReady = liveCells.length > 1 && liveCells.every(cell => cell.mergeDelay <= 0);
      if (allReady) {
        const center = groupCenter(group);
        for (const cell of liveCells) {
          const pull = norm(center.x - cell.x, center.y - cell.y);
          if (pull.length < 1) continue;
          const strength = clamp(pull.length / Math.max(240, center.largest * 3.8), 0.1, 1);
          const accel = (isGameplayHuman(group) ? 185 : 205) * strength / (1 + cell.radius / 180);
          cell.vx += pull.x * accel * dt;
          cell.vy += pull.y * accel * dt;
        }
      }

      for (let i = 0; i < group.cells.length; i++) {
        for (let j = i + 1; j < group.cells.length; j++) {
          const a = group.cells[i];
          const b = group.cells[j];
          if (a.dead || b.dead) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const n = norm(dx, dy);
          const bothReady = a.mergeDelay <= 0 && b.mergeDelay <= 0;
          const mergeDistance = Math.max(16, (a.radius + b.radius) * 0.56);

          if (bothReady && n.length < mergeDistance) {
            const keep = a.mass >= b.mass ? a : b;
            const gone = keep === a ? b : a;
            keep.mass += gone.mass;
            keep.vx = (keep.vx + gone.vx) * 0.45;
            keep.vy = (keep.vy + gone.vy) * 0.45;
            gone.dead = true;
            ring(keep.x, keep.y, group.color, 80);
            continue;
          }

          if (bothReady) {
            const pullRange = (a.radius + b.radius) * 4.4;
            if (n.length < pullRange) {
              const total = Math.max(1, a.mass + b.mass);
              const pull = clamp((pullRange - n.length) / pullRange, 0, 1) * 260 * dt;
              a.vx += n.x * pull * (b.mass / total);
              a.vy += n.y * pull * (b.mass / total);
              b.vx -= n.x * pull * (a.mass / total);
              b.vy -= n.y * pull * (a.mass / total);
            }
            continue;
          }

          const minDist = (a.radius + b.radius) * 0.74;
          if (n.length < minDist) {
            const push = (minDist - n.length) * 0.5;
            a.x -= n.x * push * dt * 4.6;
            a.y -= n.y * push * dt * 4.6;
            b.x += n.x * push * dt * 4.6;
            b.y += n.y * push * dt * 4.6;
          }
        }
      }
    }
  }

  function applyZoneDamage(dt) {
    if (!safeZone.enabled) return;
    for (const group of groups) {
      if (group.dead) continue;
      for (const cell of group.cells) {
        if (cell.dead) continue;
        const d = Math.hypot(cell.x - safeZone.x, cell.y - safeZone.y);
        const outside = d + cell.radius - safeZone.radius;
        if (outside > 0) {
          const loss = dt * (0.55 + outside / 240) * Math.max(3, cell.mass * 0.022);
          cell.mass -= loss;
          if (particles.length < MAX_PARTICLES && isNearCamera(cell, 260) && Math.random() < 0.18) {
            particles.push({
              x: cell.x + rand(-cell.radius, cell.radius),
              y: cell.y + rand(-cell.radius, cell.radius),
              vx: rand(-40, 40),
              vy: rand(-40, 40),
              radius: rand(3, 6),
              color: "#ff5f7a",
              life: 0.9,
              decay: rand(1.2, 2.4)
            });
          }
          if (cell.mass < MIN_CELL_MASS) {
            cell.dead = true;
            cell.killedBy = null;
          }
        }
      }
    }
  }

  function cleanupGroups() {
    for (const group of groups) {
      if (group.dead) continue;
      let killer = null;
      const liveCells = [];
      for (const cell of group.cells) {
        if (cell.dead || cell.mass <= MIN_CELL_MASS * 0.6) {
          if (!killer && cell.killedBy) killer = cell.killedBy;
        } else {
          liveCells.push(cell);
        }
      }
      group.cells = liveCells;
      if (group.cells.length === 0) {
        eliminateGroup(group, killer);
      }
    }
  }

  function respawnPosition(group) {
    const config = modeConfig();
    if (config.domination) {
      let best = randomPointInZone(260);
      let bestScore = -Infinity;
      const threats = groups
        .filter(item => item !== group && !item.dead && item.cells.length)
        .map(item => ({ item, center: groupCenter(item) }))
        .sort((a, b) => b.center.mass - a.center.mass)
        .slice(0, 8);
      for (let i = 0; i < 16; i++) {
        const point = randomPointInZone(300);
        let nearest = Infinity;
        for (const threat of threats) {
          const d = distance(point, threat.center) - threat.center.largest * 1.35;
          nearest = Math.min(nearest, d);
        }
        const centerPull = safeZone.enabled ? distance(point, safeZone) / Math.max(1, safeZone.radius) : 0;
        const score = nearest - centerPull * 220 + rand(-60, 60);
        if (score > bestScore) {
          bestScore = score;
          best = point;
        }
      }
      return best;
    }
    if (config.teams > 0 && group.team !== null && group.team !== undefined) {
      const allies = groups.filter(item => item !== group && !item.dead && item.team === group.team && item.cells.length);
      if (allies.length) {
        const ally = groupCenter(allies[Math.floor(Math.random() * allies.length)]);
        const angle = rand(0, Math.PI * 2);
        return {
          x: clamp(ally.x + Math.cos(angle) * rand(220, 560), 120, WORLD - 120),
          y: clamp(ally.y + Math.sin(angle) * rand(220, 560), 120, WORLD - 120)
        };
      }
    }
    return randomPointInZone(220);
  }

  function respawnGroup(group, now = authorityNow) {
    const config = modeConfig();
    const p = respawnPosition(group);
    let mass = isGameplayHuman(group) ? playerStartMassFor(config) : botStartMass(24, config);
    let comebackScale = 1;
    if (config.comebackRespawn) {
      const leaderMass = groups
        .filter(item => item !== group && !item.dead && item.cells.length)
        .reduce((best, item) => Math.max(best, groupMass(item)), 0);
      comebackScale = clamp(1 + Math.max(0, leaderMass / Math.max(1, mass) - 3) * (config.comebackMassScale || 0.16), 1, config.comebackMaxScale || 2.2);
      mass *= comebackScale;
    }
    group.dead = false;
    group.respawnAt = 0;
    group.invincibleUntil = now + (config.respawnShield || 1.8) * 1000;
    group.cells = [makeCell(group, p.x, p.y, mass)];
    if (group.ai) {
      group.ai.target = randomPointInZone(120);
      group.ai.mode = "重生";
      group.ai.think = rand(0.2, 0.8);
      group.ai.splitCooldown = Math.max(group.ai.splitCooldown || 0, config.respawnShield || 1.8);
    }
    if (isGameplayHuman(group)) {
      camera = { x: p.x, y: p.y };
      game.shake = Math.max(game.shake, 4);
      if (comebackScale > 1.08) showEventBanner("翻盘补给", `复活质量 x${comebackScale.toFixed(1)}`, "#ffd166");
    }
  }

  function updateRespawns(now) {
    const config = modeConfig();
    if (!config.respawn || game.over) return;
    for (const group of groups) {
      if (!group.dead || !group.respawnAt || now < group.respawnAt) continue;
      if (config.lives && group.lives <= 0) continue;
      respawnGroup(group, now);
    }
  }

  function eliminateGroup(group, killer) {
    if (group.dead) return;
    const config = modeConfig();
    if (killer && killer !== group && !killer.dead) {
      killer.kills += 1;
      if (isGameplayHuman(killer)) game.kills += 1;
      if (config.lives) killer.lives = Math.min(9, (killer.lives || 0) + 1);
    }

    group.dead = true;
    group.deaths = (group.deaths || 0) + 1;
    group.cells = [];

    if (config.demon && group.isBoss) {
      const livingBosses = groups.filter(item => item !== group && item.isBoss && !item.dead && item.cells.length);
      if (!livingBosses.length) endGame("魔王讨伐");
      return;
    }

    if (config.respawn) {
      if (config.lives) {
        group.lives = Math.max(0, (group.lives || 0) - 1);
        if (!authorityMode && group.isPlayer && group.lives <= 0) {
          endGame("生命耗尽");
          return;
        }
        if (group.lives <= 0) return;
      }
      group.respawnAt = authorityNow + (isGameplayHuman(group) ? 1350 : rand(1000, 2600));
      return;
    }

    if (!authorityMode && group.isPlayer) {
      endGame("被淘汰");
    }
  }

  function groupScreenCoverage(group) {
    const visible = group.cells
      .filter(cell => !cell.dead)
      .map(cell => ({
        x: (cell.x - camera.x) * zoom + view.w / 2,
        y: (cell.y - camera.y) * zoom + view.h / 2,
        r: cell.radius * zoom
      }))
      .filter(cell => cell.x + cell.r >= 0 && cell.x - cell.r <= view.w && cell.y + cell.r >= 0 && cell.y - cell.r <= view.h);
    if (!visible.length) return 0;
    const screenArea = Math.max(1, view.w * view.h);
    const areaShare = clamp(
      visible.reduce((sum, cell) => sum + Math.PI * cell.r * cell.r, 0) / screenArea,
      0,
      1
    );
    const cols = 16;
    const rows = 10;
    let covered = 0;
    for (let y = 0; y < rows; y++) {
      const sy = ((y + 0.5) / rows) * view.h;
      for (let x = 0; x < cols; x++) {
        const sx = ((x + 0.5) / cols) * view.w;
        for (const cell of visible) {
          const dx = sx - cell.x;
          const dy = sy - cell.y;
          if (dx * dx + dy * dy <= cell.r * cell.r) {
            covered += 1;
            break;
          }
        }
      }
    }
    const sampleShare = covered / (cols * rows);
    return clamp(Math.max(sampleShare, areaShare * (modeConfig().coverageAreaWeight || 0.72)), 0, 1);
  }

  function dominationArea() {
    const rect = rectArenaBounds();
    if (rect) {
      return {
        type: "rect",
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        area: Math.max(1, (rect.right - rect.left) * (rect.bottom - rect.top))
      };
    }
    if (safeZone.enabled) {
      return {
        type: "circle",
        x: safeZone.x,
        y: safeZone.y,
        radius: safeZone.radius,
        area: Math.max(1, Math.PI * safeZone.radius * safeZone.radius)
      };
    }
    return { type: "rect", left: 0, right: WORLD, top: 0, bottom: WORLD, area: WORLD * WORLD };
  }

  function groupArenaCoverage(group) {
    const config = modeConfig();
    const area = dominationArea();
    const radiusMult = config.coverageRadiusMult || 1.08;
    const radiusBonus = config.coverageRadiusBonus || 12;
    const cells = group.cells
      .filter(cell => !cell.dead)
      .map(cell => ({
        x: cell.x,
        y: cell.y,
        actualRadius: cell.radius,
        radius: cell.radius * radiusMult + radiusBonus
      }))
      .filter(cell => {
        if (area.type === "circle") {
          return distSq(cell, area) <= (area.radius + cell.radius) * (area.radius + cell.radius);
        }
        const x = clamp(cell.x, area.left, area.right);
        const y = clamp(cell.y, area.top, area.bottom);
        return distSq(cell, { x, y }) <= cell.radius * cell.radius;
      });
    if (!cells.length) return { score: 0, sampleShare: 0, areaShare: 0, controlAreaShare: 0 };
    const areaShare = clamp(cells.reduce((sum, cell) => sum + Math.PI * cell.actualRadius * cell.actualRadius, 0) / area.area, 0, 1);
    const controlAreaShare = clamp(cells.reduce((sum, cell) => sum + Math.PI * cell.radius * cell.radius, 0) / area.area, 0, 1);
    const samples = config.coverageSamples || 24;
    const cols = samples;
    const rows = samples;
    let total = 0;
    let covered = 0;
    for (let y = 0; y < rows; y++) {
      const py = area.type === "circle"
        ? area.y - area.radius + ((y + 0.5) / rows) * area.radius * 2
        : area.top + ((y + 0.5) / rows) * (area.bottom - area.top);
      for (let x = 0; x < cols; x++) {
        const px = area.type === "circle"
          ? area.x - area.radius + ((x + 0.5) / cols) * area.radius * 2
          : area.left + ((x + 0.5) / cols) * (area.right - area.left);
        if (area.type === "circle" && distSq({ x: px, y: py }, area) > area.radius * area.radius) continue;
        total += 1;
        for (const cell of cells) {
          const dx = px - cell.x;
          const dy = py - cell.y;
          if (dx * dx + dy * dy <= cell.radius * cell.radius) {
            covered += 1;
            break;
          }
        }
      }
    }
    const sampleShare = total ? covered / total : 0;
    const boostLimit = config.coverageBoostLimit || 0.1;
    const areaBoost = clamp(controlAreaShare - sampleShare, 0, boostLimit) * (config.coverageAreaWeight || 0.82);
    return {
      score: clamp(sampleShare + areaBoost, 0, 1),
      sampleShare,
      areaShare,
      controlAreaShare
    };
  }

  function updateDomination(dt, now = authorityNow) {
    const config = modeConfig();
    if (!config.domination || game.over || game.menu) return;
    const alive = groups
      .filter(group => !group.dead && group.cells.length)
      .map(group => ({ group, mass: groupMass(group) }))
      .filter(entry => entry.mass > 0)
      .sort((a, b) => b.mass - a.mass);
    const total = alive.reduce((sum, entry) => sum + entry.mass, 0);
    if (!alive.length || total <= 0) return;

    const topMass = alive[0].mass;
    const candidateLimit = config.dominationCandidates || 10;
    const candidates = alive.filter((entry, index) =>
      index < candidateLimit ||
      isGameplayHuman(entry.group) ||
      entry.mass >= topMass * 0.18
    );
    let leader = null;
    let playerCoverage = null;
    for (const entry of candidates) {
      const coverage = groupArenaCoverage(entry.group);
      const share = coverage.score || 0;
      if (isGameplayHuman(entry.group)) playerCoverage = coverage;
      if (
        !leader ||
        share > leader.share + 0.01 ||
        (Math.abs(share - leader.share) <= 0.01 && entry.mass > leader.mass)
      ) {
        leader = { ...entry, share, coverage };
      }
    }
    if (!leader) return;

    const massShare = leader.mass / Math.max(1, total);
    const screenShare = isGameplayHuman(leader.group) ? groupScreenCoverage(leader.group) : 0;
    const areaShare = leader.share;
    const targetShare = config.dominationShare || 0.88;
    const previousLeader = game.domination.currentLeaderId;
    const previousShare = game.domination.share || 0;
    const smoothing = clamp(dt * (areaShare >= previousShare ? 5.4 : 2.8), 0, 1);
    const share = previousLeader === leader.group.id
      ? previousShare + (areaShare - previousShare) * smoothing
      : areaShare;
    game.domination.currentLeaderId = leader.group.id;
    game.domination.currentLeaderName = leader.group.name;
    game.domination.share = share;
    game.domination.rawShare = areaShare;
    game.domination.massShare = massShare;
    game.domination.screenShare = screenShare;
    game.domination.areaShare = areaShare;
    game.domination.sampleShare = leader.coverage.sampleShare || 0;
    game.domination.controlAreaShare = leader.coverage.controlAreaShare || 0;
    game.domination.playerShare = playerCoverage ? playerCoverage.score || 0 : 0;
    game.domination.targetShare = targetShare;
    const warmupLeft = Math.max(0, (config.dominationWarmup || 0) - elapsedSeconds(now));
    game.domination.warmupLeft = warmupLeft;
    if (warmupLeft > 0) {
      game.domination.leaderId = null;
      game.domination.hold = 0;
      return;
    }
    const softShare = Math.max(0, targetShare - (config.dominationHysteresis || 0.045));
    if (areaShare >= targetShare) {
      if (game.domination.leaderId === leader.group.id) {
        game.domination.hold += dt;
      } else {
        game.domination.leaderId = leader.group.id;
        game.domination.hold = dt;
        game.domination.alertLeaderId = leader.group.id;
        showEventBanner(
          isGameplayHuman(leader.group) ? "霸屏压制" : "霸屏警报",
          `${leader.group.name} 已达标，维持 ${config.dominationHold || 6} 秒`,
          isGameplayHuman(leader.group) ? "#67e8f9" : "#ff5f7a"
        );
      }
    } else if (game.domination.leaderId === leader.group.id && areaShare >= softShare) {
      game.domination.hold = Math.max(0, game.domination.hold - dt * 0.18);
    } else {
      game.domination.leaderId = null;
      game.domination.alertLeaderId = null;
      game.domination.hold = 0;
    }
    if (game.domination.hold >= (config.dominationHold || 7)) {
      game.domination.winnerName = leader.group.name;
      game.domination.winShare = share;
      game.winnerId = leader.group.id;
      endGame(isGameplayHuman(leader.group) ? "霸屏胜利" : "被霸屏");
    }
  }

  function updateBlitzSupremacy(dt, now) {
    const config = modeConfig();
    if (!config.blitzSupremacy || game.over || game.menu) return;
    const state = game.blitzSupremacy || (game.blitzSupremacy = { hold: 0, share: 0, lead: 1 });
    if (elapsedSeconds(now) < (config.supremacyGrace || 45)) {
      state.hold = 0;
      return;
    }

    const entries = groups
      .filter(group => !group.dead && group.cells.length)
      .map(group => ({ group, mass: groupMass(group) }))
      .filter(entry => entry.mass > 0)
      .sort((a, b) => b.mass - a.mass);
    const leader = entries[0];
    if (!leader) return;
    const total = entries.reduce((sum, entry) => sum + entry.mass, 0);
    const second = entries.find(entry => entry.group !== leader.group);
    const secondMass = second ? second.mass : 0;
    const share = leader.mass / Math.max(1, total);
    const lead = leader.mass / Math.max(1, secondMass);
    const almostEmpty = entries.length <= 2 || secondMass < Math.max(260, leader.mass * 0.018);
    const runaway = share >= (config.supremacyShare || 0.68) && lead >= (config.supremacyLead || 4.2);
    const absoluteLock = leader.mass >= 42000 && lead >= 7.5 && share >= 0.54;
    if (state.leaderId && state.leaderId !== leader.group.id) state.hold = 0;
    state.share = share;
    state.lead = lead;
    state.leaderId = leader.group.id;
    state.leaderName = leader.group.name;
    state.leaderIsPlayer = isGameplayHuman(leader.group);
    if (almostEmpty || runaway || absoluteLock) {
      const wasEmpty = state.hold <= 0;
      state.hold += dt;
      if (wasEmpty) {
        showEventBanner(
          isGameplayHuman(leader.group) ? "闪电制霸" : "制霸警报",
          `${leader.group.name} 优势已不可逆，维持读秒提前结算`,
          isGameplayHuman(leader.group) ? "#ffd166" : "#ff5f7a"
        );
      }
    } else {
      state.hold = Math.max(0, state.hold - dt * 1.2);
    }
    if (state.hold >= (config.supremacyHold || 3)) {
      game.winnerId = leader.group.id;
      endGame(isGameplayHuman(leader.group) ? "闪电制霸" : "被闪电制霸");
    }
  }

  function maybeEndGame(now) {
    if (game.over) return;
    const config = modeConfig();
    if (config.demon) {
      const bosses = groups.filter(group => group.isBoss);
      const livingBosses = bosses.filter(group => !group.dead && group.cells.length);
      if (bosses.length && !livingBosses.length) {
        endGame("魔王讨伐");
        return;
      }
      if (game.endsAt && now >= game.endsAt) {
        endGame("讨伐失败");
        return;
      }
    }
    if (config.control) {
      const winner = teamScores.findIndex(score => score >= config.controlScore);
      if (winner >= 0) {
        game.winnerId = representativeForTeam(winner)?.id || null;
        endGame(winner === playerGroup.team ? "据点胜利" : "据点结算");
        return;
      }
    }
    if (game.endsAt && now >= game.endsAt) {
      if (config.domination) {
        endGame("霸屏结算");
      } else if (config.teams > 0) {
        const rank = teamRank(playerGroup.team);
        endGame(rank === 1 ? (config.control ? "据点胜利" : "团队胜利") : (config.control ? "据点结算" : "团队结算"));
      } else if (config.ranking === "kills") {
        const rank = personalRank();
        endGame(rank === 1 ? "生存第一" : "生存结算");
      } else {
        const rank = personalRank();
        const name = activeMode === "blitz" ? "闪电" : activeMode === "spore" ? "孢子" : "自由";
        endGame(rank === 1 ? `${name}第一` : `${name}结算`);
      }
      return;
    }

    if (!authorityMode && playerGroup.dead) return;
    if (config.domination) return;
    if (config.respawn && config.ranking === "kills") {
      let contenderCount = 0;
      let contender = null;
      for (const group of groups) {
        if (group.dead && (group.lives || 0) <= 0) continue;
        contenderCount += 1;
        contender = group;
      }
      if (contenderCount === 1 && (authorityMode || contender === playerGroup)) {
        game.winnerId = contender.id;
        endGame("生存第一");
      } else if (authorityMode && contenderCount === 0) {
        game.noWinner = true;
        endGame("无人存活");
      }
      return;
    }
    if (config.respawn) return; // Waiting to respawn is not elimination.

    let aliveCount = 0;
    let lastAlive = null;
    for (const group of groups) {
      if (group.dead || !group.cells.length) continue;
      aliveCount += 1;
      lastAlive = group;
      if (aliveCount > 1) break;
    }
    if (aliveCount === 1 && (authorityMode || lastAlive === playerGroup)) {
      game.winnerId = lastAlive.id;
      endGame("成功吃鸡");
    } else if (authorityMode && aliveCount === 0) {
      game.noWinner = true;
      endGame("无人存活");
    }
  }

  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.18, dt);
      p.vy *= Math.pow(0.18, dt);
      p.life -= dt * p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt * 1.45;
      r.radius += dt * r.speed;
      if (r.life <= 0) rings.splice(i, 1);
    }
  }

  function updateCamera(dt) {
    if (playerGroup.dead || !playerGroup.cells.length) return;
    const next = gameplayCore.cameraStep({ ...camera, zoom }, playerGroup.cells, {
      config: modeConfig(), maxCells: maxCellsFor(playerGroup), width: view.w, height: view.h, dt
    });
    camera.x = next.x;
    camera.y = next.y;
    zoom = next.zoom;
    game.cameraViewPressure = next.viewPressure;
    game.cameraSpreadRatio = next.spreadRatio;
  }

  function splitGroup(group, target, options) {
    if (group.dead || game.paused || game.over) return false;
    const opts = options || {};
    const sources = [...group.cells]
      .filter(cell => !cell.dead && cell.mass >= SPLIT_MIN_MASS)
      .sort((a, b) => b.mass - a.mass);
    if (!sources.length || group.cells.length >= maxCellsFor(group)) return false;

    let didSplit = false;
    const limit = opts.onlyLargest ? 1 : sources.length;
    for (let i = 0; i < sources.length && i < limit; i++) {
      if (group.cells.length >= maxCellsFor(group)) break;
      const cell = sources[i];
      if (cell.dead || cell.mass < SPLIT_MIN_MASS) continue;
      const n = norm(target.x - cell.x, target.y - cell.y);
      const newMass = cell.mass * 0.5;
      const cooldown = mergeCooldown(newMass, "split");
      cell.mass = newMass;
      cell.mergeDelay = cooldown;
      cell.mergeMax = cooldown;
      cell.vx -= n.x * 50;
      cell.vy -= n.y * 50;

      const child = makeCell(group, cell.x + n.x * (radiusFromMass(newMass) + 10), cell.y + n.y * (radiusFromMass(newMass) + 10), newMass);
      const launch = gameplayCore.splitVelocity(cell, target, opts.power || 1);
      child.vx = launch.vx;
      child.vy = launch.vy;
      child.mergeDelay = cooldown;
      child.mergeMax = cooldown;
      group.cells.push(child);
      didSplit = true;
    }

    if (didSplit) {
      const c = groupCenter(group);
      ring(c.x, c.y, group.color, 160);
      if (group.isPlayer) {
        game.splitFlash = 0.26;
        game.shake = Math.max(game.shake, 5);
      }
    }
    return didSplit;
  }

  function quickMergeGroup(group, now = authorityNow, feedback = false) {
    const config = modeConfig();
    if (!config.quickMerge || game.menu || game.over || game.paused || group.dead) return false;
    if (group.cells.length <= 1) {
      if (feedback) showEventBanner("快速合球", "当前只有一个球", "#67e8f9");
      return false;
    }
    const readyAt = group.quickMergeReadyAt || (group === playerGroup ? game.quickMergeReadyAt : 0) || 0;
    if (now < readyAt) {
      if (feedback) showEventBanner("快速合球", `${Math.ceil((readyAt - now) / 1000)}秒后可用`, "#67e8f9");
      return false;
    }
    const center = groupCenter(group);
    const keep = center.largestCell || group.cells[0];
    const total = groupMass(group);
    for (const cell of group.cells) {
      if (cell !== keep) cell.dead = true;
    }
    keep.mass = Math.max(MIN_CELL_MASS, total * 0.985);
    keep.x = center.x;
    keep.y = center.y;
    keep.vx = 0;
    keep.vy = 0;
    keep.mergeDelay = 0;
    keep.mergeMax = 0;
    group.cells = [keep];
    group.quickMergeReadyAt = now + (config.quickMergeCooldown || 6200) * activeEventFactor("quickMergeCooldownMult", 1);
    if (group === playerGroup) game.quickMergeReadyAt = group.quickMergeReadyAt;
    if (feedback) {
      game.shake = Math.max(game.shake, 5);
      game.splitFlash = Math.max(game.splitFlash, 0.22);
    }
    syncRadii();
    keepInside(keep);
    const accent = group.cosmetics?.skin
      ? sharedCosmetics.definition("skin", group.cosmetics.skin)?.accent || group.color
      : group === playerGroup ? selectedSkinDef().accent || "#67e8f9" : group.color;
    ring(keep.x, keep.y, accent, 240);
    if (feedback) {
      showEventBanner("快速合球", "A 键回收完成", "#67e8f9");
      updateHud(now, true);
    }
    return true;
  }

  function quickMergePlayer() {
    return quickMergeGroup(playerGroup, authorityNow, true);
  }

  function screenDashGroup(group, target, now = authorityNow, feedback = false) {
    const config = modeConfig();
    if (!config.screenSkill || game.menu || game.over || game.paused || group.dead) return false;
    const readyAt = group.screenSkillReadyAt || (group === playerGroup ? game.screenSkillReadyAt : 0) || 0;
    if (now < readyAt) {
      if (feedback) showEventBanner("破阵冲刺", `${Math.ceil((readyAt - now) / 1000)}秒后可用`, "#f472b6");
      return false;
    }
    const center = groupCenter(group);
    const aim = norm(target.x - center.x, target.y - center.y);
    if (aim.length < 18) return false;
    const impulse = config.screenSkillImpulse || 500;
    const cost = config.screenSkillCost || 0.012;
    for (const cell of group.cells) {
      const n = norm(target.x - cell.x, target.y - cell.y);
      cell.vx += n.x * impulse;
      cell.vy += n.y * impulse;
      cell.mass = Math.max(MIN_CELL_MASS, cell.mass * (1 - cost));
    }
    if (config.screenSkillVirus && viruses.length < virusLimit() && center.mass > 520) {
      const seedDist = clamp(center.largest * 2.2 + 180, 260, 620);
      const point = clampPlayablePoint(center.x + aim.x * seedDist, center.y + aim.y * seedDist, 170);
      const seedCost = Math.min(config.screenSkillVirusCost || 42, center.mass * 0.035);
      const largest = center.largestCell || group.cells[0];
      if (largest && largest.mass > seedCost + MIN_CELL_MASS * 4) largest.mass -= seedCost;
      viruses.push({
        id: nextEntityId("virus"),
        x: point.x,
        y: point.y,
        radius: rand(40, 48),
        mass: VIRUS_MASS + seedCost * 0.35,
        baseMass: VIRUS_MASS,
        spin: rand(0, Math.PI * 2),
        kind: "small",
        tactical: true
      });
      sparkle(point.x, point.y, "#5eea80", 18, 180);
      ring(point.x, point.y, "#5eea80", 190);
    }
    group.screenSkillUntil = now + (config.screenSkillDuration || 1.2) * 1000;
    group.screenSkillReadyAt = now + (config.screenSkillCooldown || 7600) * activeEventFactor("skillCooldownMult", 1);
    if (group === playerGroup) {
      game.screenSkillUntil = group.screenSkillUntil;
      game.screenSkillReadyAt = group.screenSkillReadyAt;
    }
    if (feedback) game.shake = Math.max(game.shake, 4);
    syncRadii();
    ring(center.x, center.y, "#f472b6", 260);
    if (feedback) {
      showEventBanner("破阵冲刺", config.screenSkillVirus ? "D 键冲刺并种刺" : "D 键爆发加速", "#f472b6");
      updateHud(now, true);
    }
    return true;
  }

  function screenDashPlayer() {
    return screenDashGroup(playerGroup, cursorPoint(), authorityNow, true);
  }

  function ejectMass(group, target, now) {
    if (group.dead || game.paused || game.over) return false;
    const config = modeConfig();
    const ejectInterval = EJECT_INTERVAL * activeEventFactor("ejectMult", 1);
    const human = isGameplayHuman(group);
    const lastEjectAt = group === playerGroup && !authorityMode ? lastPlayerEject : (group.lastEjectAt || 0);
    if (human && now - lastEjectAt < ejectInterval) return false;
    if (human) {
      if (group === playerGroup && !authorityMode) lastPlayerEject = now;
      else group.lastEjectAt = now;
    }

    let didEject = false;
    let cells = [...group.cells]
      .filter(cell => !cell.dead && cell.mass >= EJECT_MIN_MASS)
      .sort((a, b) => b.mass - a.mass);
    const ejectLimit = human ? (config.ejectCellLimit || 14) : (config.botEjectCellLimit || cells.length);
    cells = cells.slice(0, ejectLimit);
    for (const cell of cells) {
      const n = norm(target.x - cell.x, target.y - cell.y);
      const amount = Math.min(14, Math.max(6, cell.mass * 0.09));
      if (cell.mass - amount < MIN_CELL_MASS * 2) continue;
      cell.mass -= amount;
      ejected.push({
        id: nextEntityId("ejected"),
        x: cell.x + n.x * (cell.radius + 16),
        y: cell.y + n.y * (cell.radius + 16),
        vx: cell.vx * 0.3 + n.x * 560,
        vy: cell.vy * 0.3 + n.y * 560,
        mass: amount,
        radius: radiusFromMass(amount),
        age: 0,
        color: sporeColorFor(group),
        accent: group.cosmetics?.spore
          ? sharedCosmetics.definition("spore", group.cosmetics.spore)?.accent || group.color
          : group.isPlayer ? selectedSporeDef().accent || "#ffffff" : group.color,
        spore: sporePatternFor(group),
        ownerId: group.id
      });
      trimEjectedMass();
      if (Math.random() < 0.42) sparkle(cell.x + n.x * cell.radius, cell.y + n.y * cell.radius, sporeColorFor(group), 3, 110);
      didEject = true;
    }
    if (didEject && !authorityMode && group === playerGroup) window.ScaAudio?.play("eject");
    return didEject;
  }

  function keepInside(entity) {
    const r = entity.radius || 8;
    const rect = rectArenaBounds(r);
    if (rect) {
      entity.x = clamp(entity.x, rect.left, rect.right);
      entity.y = clamp(entity.y, rect.top, rect.bottom);
      return;
    }
    entity.x = clamp(entity.x, r, WORLD - r);
    entity.y = clamp(entity.y, r, WORLD - r);
  }

  function awardDust(rank, peakMass, config) {
    if (game.dustRewarded || game.menu) return 0;
    const livingBosses = config.demon ? groups.filter(group => group.isBoss && !group.dead && group.cells.length) : [];
    const reward = window.ScaProgression.matchReward({ rank, peakMass, kills: game.kills, controlScore: config.control ? teamScores[playerGroup.team] || 0 : 0, demon: config.demon, demonWin: !livingBosses.length, forgeLevel: meta.forgeLevel, multiplier: growthRewardMultiplier() });
    meta.dust += reward;
    meta.totalDust = (meta.totalDust || 0) + reward;
    game.dustRewarded = true;
    saveMeta();
    return reward;
  }

  function representativeForTeam(team) {
    return groups.filter(group => group.team === team)
      .sort((a, b) => Number(a.dead) - Number(b.dead) || groupMass(b) - groupMass(a))[0] || null;
  }

  function endGame(reason) {
    if (game.over) return;
    const config = modeConfig();
    if (config.demon && (reason === "魔王讨伐" || reason === "讨伐失败")) {
      game.winnerId = representativeForTeam(reason === "魔王讨伐" ? 0 : 1)?.id || null;
    }
    game.over = true;
    game.finishReason = reason;
    game.paused = false;
    game.menu = false;
    input.ejectHeld = false;
    ejectBtn.classList.remove("active");
    pauseBtn.textContent = "停";

    const mass = Math.round(Math.max(game.peakMass, groupMass(playerGroup)));
    const rows = buildRanking();
    const rank = config.teams > 0 ? teamRank(playerGroup.team) : personalRank();
    const teamRow = config.teams > 0 ? rows.find(row => row.team === playerGroup.team) : null;
    const dustReward = awardDust(rank, mass, config);
    resultTitle.textContent = reason;
    finalMass.style.display = "block";
    if (config.domination) {
      const share = Math.round(((game.domination && (game.domination.winShare || game.domination.share)) || 0) * 100);
      finalMass.textContent = `${share}%`;
      const winner = game.domination?.winnerName || "无人";
      const metricText = config.dominationMetric === "arena" ? "区域占领" : "霸屏进度";
      resultText.textContent = reason === "霸屏胜利"
        ? `你完成霸屏，${metricText} ${share}%，最高质量 ${mass}，星尘 +${dustReward}。`
        : `${reason === "霸屏结算" ? "时间到，未形成霸屏。" : `${winner} 完成霸屏。`} 你的最高质量 ${mass}，当前${metricText} ${share}%，星尘 +${dustReward}。`;
    } else if (config.demon) {
      const bossMass = Math.round(groups.filter(group => group.isBoss && !group.dead).reduce((sum, boss) => sum + groupMass(boss), 0));
      finalMass.textContent = bossMass ? bossMass : mass;
      resultText.textContent = bossMass
        ? `魔王剩余质量 ${bossMass}，个人最高质量 ${mass}，淘汰 ${game.kills}，星尘 +${dustReward}。`
        : `魔王已被吞噬，个人最高质量 ${mass}，淘汰 ${game.kills}，星尘 +${dustReward}。`;
    } else if (config.control) {
      const score = Math.floor(teamScores[playerGroup.team] || 0);
      finalMass.textContent = score;
      resultText.textContent = `队伍第 ${rank} 名，据点分 ${score}/${config.controlScore}，个人最高质量 ${mass}，淘汰 ${game.kills}，星尘 +${dustReward}。`;
    } else if (config.blitzSupremacy && (reason === "闪电制霸" || reason === "被闪电制霸")) {
      const share = Math.round((game.blitzSupremacy?.share || 0) * 100);
      const lead = Math.max(1, game.blitzSupremacy?.lead || 1).toFixed(1);
      const leaderName = game.blitzSupremacy?.leaderName || "领跑者";
      finalMass.textContent = mass;
      resultText.textContent = reason === "闪电制霸"
        ? `你已形成闪电制霸，质量占比 ${share}%，领先 ${lead}x，最高质量 ${mass}，淘汰 ${game.kills}，星尘 +${dustReward}。`
        : `${leaderName} 已形成闪电制霸，质量占比 ${share}%，领先 ${lead}x。你的最高质量 ${mass}，淘汰 ${game.kills}，星尘 +${dustReward}。`;
    } else if (config.teams > 0) {
      finalMass.textContent = Math.round(teamRow ? teamRow.mass : groupMass(playerGroup));
      resultText.textContent = `队伍第 ${rank} 名，个人最高质量 ${mass}，淘汰 ${game.kills}，星尘 +${dustReward}。`;
    } else if (config.ranking === "kills") {
      finalMass.textContent = game.kills;
      const lifeText = config.lives ? `，剩余生命 ${playerGroup.lives || 0}` : "";
      resultText.textContent = `${config.short}第 ${rank} 名${lifeText}，最高质量 ${mass}，淘汰 ${game.kills}，星尘 +${dustReward}。`;
    } else {
      finalMass.textContent = mass;
      resultText.textContent = `个人第 ${rank} 名，最高质量 ${mass}，淘汰 ${game.kills}，吃点 ${game.foodEaten}，星尘 +${dustReward}。`;
    }
    renderCosmetics();
    showLobbyPanel("play");
    playAgainBtn.textContent = "再来一局";
    overlay.style.display = "grid";
    updateHud(performance.now(), true);
  }

  function togglePause() {
    window.ScaMatchGuide?.hide();
    if (game.over || game.menu) return;
    game.paused = !game.paused;
    input.ejectHeld = false;
    ejectBtn.classList.remove("active");
    const session = document.getElementById("singleSessionMenu");
    if (session) session.hidden = !game.paused;
    if (game.paused) {
      document.getElementById("singleSessionDescription").textContent = `${modeConfig().label} · ${modeConfig().description} 对局时间已冻结，Esc 或 P 继续。`;
      document.getElementById("singleResumeBtn")?.focus({ preventScroll: true });
    } else {
      lastFrame = performance.now();
      simulationAccumulator = 0;
    }
    pauseBtn.textContent = game.paused ? "续" : "停";
    updateHud(authorityNow, true);
  }

  function returnToLobby() {
    game.menu = true;
    game.paused = true;
    game.over = false;
    input.ejectHeld = false;
    ejectBtn.classList.remove("active");
    pauseBtn.textContent = "停";
    showTitleScreen();
    updateHud(performance.now(), true);
  }

  function multiplayerUrl() {
    const url = new URL("./multiplayer.html", location.href);
    const params = new URLSearchParams(location.search);
    if (params.has("desktop")) url.searchParams.set("desktop", params.get("desktop"));
    if (params.has("refresh")) url.searchParams.set("refresh", params.get("refresh"));
    if (params.has("debug")) url.searchParams.set("debug", params.get("debug"));
    return url.href;
  }

  function showTitlePanel(name) {
    const panelName = ["home", "settings", "controls", "about"].includes(name) ? name : "home";
    for (const panel of titleScreen.querySelectorAll("[data-title-panel]")) {
      const active = panel.dataset.titlePanel === panelName;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    }
    if (panelName === "settings") populateSettingsForm();
    const activePanel = titleScreen.querySelector(`[data-title-panel="${panelName}"]`);
    requestAnimationFrame(() => activePanel?.querySelector("button, select, input, a")?.focus({ preventScroll: true }));
  }

  function showTitleScreen(panelName = "home") {
    const session = document.getElementById("singleSessionMenu");
    if (session) session.hidden = true;
    game.menu = true;
    game.paused = true;
    overlay.style.display = "none";
    document.documentElement.classList.add("title-active");
    document.querySelector(".hud")?.setAttribute("aria-hidden", "true");
    titleScreen.hidden = false;
    titleScreen.style.display = "grid";
    showTitlePanel(panelName);
    titleRuntimeStatus.textContent = `图形目标 ${TARGET_RENDER_FPS} FPS · 单人物理 60 Hz · ${gpuRenderer?.info().active ? "硬件加速已启用" : "正在检测渲染器"}`;
  }

  function openSingleLobby() {
    document.documentElement.classList.remove("title-active");
    document.querySelector(".hud")?.removeAttribute("aria-hidden");
    titleScreen.hidden = true;
    titleScreen.style.display = "none";
    showStartOverlay();
  }

  function openPersonalCenter() {
    openSingleLobby();
    document.documentElement.classList.add("title-active");
    document.querySelector(".hud")?.setAttribute("aria-hidden", "true");
    resultTitle.textContent = "个人中心";
    resultText.textContent = "外观、成长、商店与锻造使用同一份本地存档，当前装备会自动带入单人和联机。";
    showLobbyPanel("outfit");
  }

  function displayDescription(state) {
    const output = state?.display;
    if (!output) return `检测到显示器刷新率 ${REQUESTED_REFRESH_RATE} Hz；当前图形目标 ${TARGET_RENDER_FPS} FPS。`;
    const mode = state.fullscreen ? "无边框全屏" : "窗口化";
    const size = state.contentBounds || state.bounds;
    const windowText = size ? `${size.width} × ${size.height}` : "未知";
    return `当前 ${mode} · 窗口 ${windowText} · 显示器 ${output.width} × ${output.height} @ ${output.refreshRate || REQUESTED_REFRESH_RATE} Hz（缩放 ${Math.round((output.scaleFactor || 1) * 100)}%）。`;
  }

  function refreshDisplayNote(state) {
    const note = document.getElementById("displayRefreshNote");
    if (!note) return;
    const renderWidth = canvas.width || Math.round(window.innerWidth * dpr);
    const renderHeight = canvas.height || Math.round(window.innerHeight * dpr);
    note.textContent = `${displayDescription(state)} 当前内部渲染 ${renderWidth} × ${renderHeight}（${dpr.toFixed(2)}×）；窗口大小与渲染清晰度彼此独立。`;
  }

  let displaySyncSequence = 0;

  function syncDisplayControls(state) {
    if (!settingsForm || !state?.mode) return;
    settingsForm.elements.displayMode.value = state.mode;
    settingsForm.elements.windowSize.disabled = state.mode !== "windowed";
  }

  function populateSettingsForm() {
    if (!settingsForm) return;
    const saved = settingsApi.load();
    settingsForm.elements.displayMode.value = saved.displayMode;
    settingsForm.elements.windowSize.value = saved.windowSize;
    settingsForm.elements.frameRate.value = saved.frameRate;
    settingsForm.elements.quality.value = saved.quality;
    settingsForm.elements.networkBuffer.value = saved.networkBuffer;
    settingsForm.elements.showPerformance.checked = saved.showPerformance;
    settingsForm.elements.screenShake.checked = saved.screenShake;
    for (const key of ["masterVolume", "musicVolume", "effectsVolume"]) settingsForm.elements[key].value = saved[key];
    settingsForm.elements.windowSize.disabled = saved.displayMode !== "windowed";
    refreshDisplayNote();
    if (window.starClusterDesktop?.getDisplayState) {
      const sequence = ++displaySyncSequence;
      void window.starClusterDesktop.getDisplayState().then(state => {
        if (sequence !== displaySyncSequence) return;
        syncDisplayControls(state);
        refreshDisplayNote(state);
      }).catch(() => refreshDisplayNote());
    }
  }

  function updateFullscreenButton(state) {
    const button = document.getElementById("titleFullscreenBtn");
    if (!button) return;
    const fullscreen = state?.fullscreen ?? Boolean(document.fullscreenElement);
    button.textContent = fullscreen ? "退出全屏" : "无边框全屏";
    button.setAttribute("aria-pressed", String(fullscreen));
  }

  function setModeSelection(modeKey) {
    selectedMode = GAME_MODES[modeKey] ? modeKey : "battle";
    for (const button of modeButtons) {
      button.classList.toggle("active", button.dataset.mode === selectedMode);
    }
    const hint = document.getElementById("selectedModeHint");
    if (hint) hint.textContent = `${GAME_MODES[selectedMode].label} · ${GAME_MODES[selectedMode].players} 位参赛者`;
  }

  function showLobbyPanel(panel) {
    activeLobbyPanel = ["play", "outfit", "shop", "forge", "growth"].includes(panel) ? panel : "play";
    for (const button of lobbyTabs.querySelectorAll("[data-lobby]")) {
      button.classList.toggle("active", button.dataset.lobby === activeLobbyPanel);
    }
    for (const panelEl of lobbyPanels) {
      panelEl.classList.toggle("active", panelEl.dataset.lobbyPanel === activeLobbyPanel);
    }
    if (activeLobbyPanel === "play") modeGrid.style.display = "grid";
    playAgainBtn.style.display = activeLobbyPanel === "play" ? "inline-block" : "none";
  }

  function showStartOverlay() {
    const config = selectedModeConfig();
    resultTitle.textContent = "星团大作战";
    finalMass.style.display = "none";
    resultText.textContent = `${config.description} 随机事件会在开局十几秒后自动出现。`;
    modeGrid.style.display = "grid";
    renderCosmetics();
    showLobbyPanel("play");
    playAgainBtn.textContent = "开始游戏";
    overlay.style.display = "grid";
  }

  function sparkle(x, y, color, count, speed) {
    const visible = isNearCamera({ x, y, radius: 1 }, 240);
    if (!visible && particles.length > MAX_PARTICLES * 0.45) return;
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
    const actualCount = Math.min(count, Math.max(0, MAX_PARTICLES - particles.length), visible ? count : 3);
    for (let i = 0; i < actualCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = rand(speed * 0.25, speed);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        radius: rand(3, 7),
        color,
        life: 1,
        decay: rand(1.1, 2.4)
      });
    }
  }

  function ring(x, y, color, speed) {
    const visible = isNearCamera({ x, y, radius: 1 }, 260);
    if (!visible && rings.length > MAX_RINGS * 0.45) return;
    while (rings.length >= MAX_RINGS) rings.shift();
    rings.push({
      x,
      y,
      color,
      radius: 12,
      speed,
      life: 1
    });
  }

  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const shakeX = gameSettings.screenShake && game.shake ? (Math.random() - 0.5) * game.shake : 0;
    const shakeY = gameSettings.screenShake && game.shake ? (Math.random() - 0.5) * game.shake : 0;
    const useGpuFood = Boolean(gpuRenderer && gpuRenderer.active && gpuRenderer.supportsSprites);
    const gpuFrameFps = perf.lowQuality ? Math.min(60, GPU_CACHE_FPS) : GPU_CACHE_FPS;
    const updateGpuLayer = gpuRenderer && gpuRenderer.active && (now - lastGpuFrame >= 1000 / gpuFrameFps || !gpuLayerReady);
    if (updateGpuLayer) {
      const foodSprites = useGpuFood ? collectGpuFoodSprites() : null;
      gpuFrameState.time = now;
      gpuFrameState.camera.x = camera.x - shakeX / Math.max(0.08, zoom);
      gpuFrameState.camera.y = camera.y - shakeY / Math.max(0.08, zoom);
      gpuFrameState.zoom = zoom;
      gpuFrameState.foods = foodSprites;
      if (gpuRenderer.render(gpuFrameState)) {
        gpuLayerReady = true;
        gpuLayerHasFood = useGpuFood;
        lastGpuFrame = now;
        if (foodSprites) perf.drawnFood = foodSprites.length;
      }
    }
    if (!gpuRenderer || !gpuRenderer.active) gpuLayerReady = false;
    const gpuBackground = gpuLayerReady;
    const gpuFoodRendered = Boolean(gpuBackground && gpuLayerHasFood);
    if (gpuBackground) {
      ctx.clearRect(0, 0, view.w, view.h);
    } else {
      ctx.fillStyle = "#061015";
      ctx.fillRect(0, 0, view.w, view.h);
    }

    ctx.save();
    ctx.translate(view.w / 2 + shakeX, view.h / 2 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-camera.x, -camera.y);
    drawWorld(now, gpuBackground);
    drawZone(now);
    drawControlPoints(now);
    if (!gpuFoodRendered) drawFoods(now);
    drawEjected();
    drawViruses(now);
    drawCells(now);
    drawEffects();
    drawPlayerGuides(now);
    ctx.restore();

    if (game.paused) drawPauseLayer();
    if (game.splitFlash > 0) drawSplitFlash();
    drawFinalPointers(now);
    if (now >= perf.nextMiniDraw || game.paused || game.over || game.menu) {
      drawMinimap();
      perf.nextMiniDraw = now + (perf.lowQuality ? MINIMAP_SLOW_INTERVAL : MINIMAP_FAST_INTERVAL);
    }
  }

  function visibleBounds(pad) {
    const p = pad || 180;
    return {
      left: camera.x - view.w / 2 / zoom - p,
      right: camera.x + view.w / 2 / zoom + p,
      top: camera.y - view.h / 2 / zoom - p,
      bottom: camera.y + view.h / 2 / zoom + p
    };
  }

  function drawWorld(now, gpuBackground) {
    const bounds = visibleBounds(0);
    if (!gpuBackground) {
      const small = 70;
      const large = 280;
      const gradient = ctx.createRadialGradient(camera.x, camera.y, 80, camera.x, camera.y, Math.max(view.w, view.h) / zoom);
      gradient.addColorStop(0, "rgba(68, 215, 182, 0.075)");
      gradient.addColorStop(1, "rgba(68, 215, 182, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);

      drawGridPath(bounds, small, "rgba(255, 255, 255, 0.032)");
      drawGridPath(bounds, large, "rgba(93, 214, 190, 0.075)");
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.24)";
    ctx.lineWidth = 8 / zoom;
    ctx.strokeRect(0, 0, WORLD, WORLD);

    ctx.save();
    ctx.globalAlpha = 0.08 + Math.sin(now / 600) * 0.02;
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(12, 12, WORLD - 24, WORLD - 24);
    ctx.restore();
  }

  function drawGridPath(bounds, spacing, color) {
    ctx.beginPath();
    for (let x = Math.floor(bounds.left / spacing) * spacing; x <= bounds.right; x += spacing) {
      ctx.moveTo(x, bounds.top);
      ctx.lineTo(x, bounds.bottom);
    }
    for (let y = Math.floor(bounds.top / spacing) * spacing; y <= bounds.bottom; y += spacing) {
      ctx.moveTo(bounds.left, y);
      ctx.lineTo(bounds.right, y);
    }
    ctx.lineWidth = 1 / zoom;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function drawZone(now) {
    const rect = rectArenaBounds();
    if (rect) {
      ctx.save();
      ctx.fillStyle = "rgba(103, 232, 249, 0.06)";
      ctx.fillRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
      ctx.strokeStyle = "#67e8f9";
      ctx.lineWidth = 7 / zoom;
      ctx.globalAlpha = 0.78 + Math.sin(now / 360) * 0.12;
      ctx.strokeRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([24 / zoom, 18 / zoom]);
      ctx.strokeRect(rect.left + 24, rect.top + 24, rect.right - rect.left - 48, rect.bottom - rect.top - 48);
      ctx.restore();
      return;
    }
    if (!safeZone.enabled) return;
    ctx.save();
    ctx.fillStyle = "rgba(255, 67, 102, 0.13)";
    ctx.beginPath();
    ctx.rect(0, 0, WORLD, WORLD);
    ctx.arc(safeZone.x, safeZone.y, safeZone.radius, 0, Math.PI * 2, true);
    ctx.fill("evenodd");

    ctx.globalAlpha = 0.78 + Math.sin(game.zonePulse) * 0.16;
    ctx.strokeStyle = safeZone.shrinking ? "#ff5f7a" : "#ffd166";
    ctx.lineWidth = (safeZone.shrinking ? 8 : 5) / zoom;
    ctx.beginPath();
    ctx.arc(safeZone.x, safeZone.y, safeZone.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    ctx.arc(safeZone.targetX, safeZone.targetY, safeZone.targetRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawControlPoints(now) {
    if (!controlPoints.length) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const point of controlPoints) {
      const ownerColor = point.owner === null ? "rgba(255, 255, 255, 0.72)" : TEAM_COLORS[point.owner % TEAM_COLORS.length];
      const captureColor = point.captureTeam === null ? ownerColor : TEAM_COLORS[point.captureTeam % TEAM_COLORS.length];
      const pulse = 0.5 + Math.sin(now / 420 + point.x * 0.001) * 0.08;

      ctx.globalAlpha = point.contested ? 0.22 : 0.14;
      ctx.fillStyle = ownerColor;
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.78;
      ctx.strokeStyle = ownerColor;
      ctx.lineWidth = (point.contested ? 9 : 6) / zoom;
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
      ctx.stroke();

      if (point.capture > 0 && point.captureTeam !== null) {
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = captureColor;
        ctx.lineWidth = 12 / zoom;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.radius + 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(point.capture / 100, 0, 1));
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(4, 10, 16, 0.72)";
      ctx.beginPath();
      ctx.arc(point.x, point.y, 72 + pulse * 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = captureColor;
      ctx.lineWidth = 4 / zoom;
      ctx.stroke();

      ctx.font = `900 ${34 / zoom}px Microsoft YaHei, Segoe UI, sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(point.label, point.x, point.y - 8 / zoom);
      ctx.font = `700 ${17 / zoom}px Microsoft YaHei, Segoe UI, sans-serif`;
      ctx.fillStyle = point.contested ? "#ffd166" : "rgba(255, 255, 255, 0.86)";
      ctx.fillText(point.contested ? "争夺" : point.owner === null ? "中立" : TEAM_NAMES[point.owner] || `队伍 ${point.owner + 1}`, point.x, point.y + 30 / zoom);
    }
    ctx.restore();
  }

  function collectGpuFoodSprites() {
    gpuFoodSprites.length = 0;
    const bounds = visibleBounds(40);
    const minX = Math.floor(bounds.left / FOOD_BUCKET);
    const maxX = Math.floor(bounds.right / FOOD_BUCKET);
    const minY = Math.floor(bounds.top / FOOD_BUCKET);
    const maxY = Math.floor(bounds.bottom / FOOD_BUCKET);
    const maxDraw = perf.lowQuality ? 1400 : 2400;
    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        const bucket = foodGrid.get(foodBucketKey(bx, by));
        if (!bucket) continue;
        for (const food of bucket) {
          if (!isVisible(food, bounds, 20)) continue;
          if (gpuFoodSprites.length >= maxDraw && !food.rich) continue;
          gpuFoodSprites.push(food);
        }
      }
    }
    return gpuFoodSprites;
  }

  function drawFoods(now) {
    const bounds = visibleBounds(30);
    const minX = Math.floor(bounds.left / FOOD_BUCKET);
    const maxX = Math.floor(bounds.right / FOOD_BUCKET);
    const minY = Math.floor(bounds.top / FOOD_BUCKET);
    const maxY = Math.floor(bounds.bottom / FOOD_BUCKET);
    const maxDraw = perf.lowQuality ? 720 : 1500;
    const batches = new Map();
    const richFoods = [];
    let drawn = 0;

    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        const bucket = foodGrid.get(foodBucketKey(bx, by));
        if (!bucket) continue;
        for (const food of bucket) {
          if (!isVisible(food, bounds, 20)) continue;
          if (drawn >= maxDraw && !food.rich) continue;
          let batch = batches.get(food.color);
          if (!batch) {
            batch = [];
            batches.set(food.color, batch);
          }
          const pulse = 1 + Math.sin(now / 420 + food.pulse) * 0.12;
          batch.push({ food, radius: food.radius * pulse });
          if (food.rich) richFoods.push({ food, radius: food.radius * pulse });
          drawn += 1;
        }
      }
    }

    // One compound path per color replaces hundreds of save/fill/shadow calls.
    ctx.save();
    ctx.globalAlpha = 0.84;
    for (const [color, batch] of batches) {
      ctx.fillStyle = color;
      if (!perf.lowQuality) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8 / zoom;
      }
      ctx.beginPath();
      for (const item of batch) {
        ctx.moveTo(item.food.x + item.radius, item.food.y);
        ctx.arc(item.food.x, item.food.y, item.radius, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    if (richFoods.length) {
      ctx.globalAlpha = 0.58;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
      ctx.lineWidth = 1.4 / zoom;
      ctx.beginPath();
      for (const item of richFoods) {
        const radius = item.radius * 1.55;
        ctx.moveTo(item.food.x + radius, item.food.y);
        ctx.arc(item.food.x, item.food.y, radius, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    ctx.restore();
    perf.drawnFood = drawn;
  }

  function drawEjected() {
    const bounds = visibleBounds(60);
    for (const mass of ejected) {
      if (!isVisible(mass, bounds, 26)) continue;
      sharedCosmeticRenderer.drawEjected({
        context: ctx, x: mass.x, y: mass.y, radius: mass.radius, color: mass.color,
        pattern: mass.spore, accent: mass.accent, lineScale: 1 / zoom, lowQuality: perf.lowQuality
      });
    }
  }

  function drawViruses(now) {
    const bounds = visibleBounds(140);
    let drawn = 0;
    const limit = modeConfig().domination ? (perf.lowQuality ? 42 : 62) : (perf.lowQuality ? 58 : 110);
    for (const virus of viruses) {
      if (!isVisible(virus, bounds, virus.radius + 90)) continue;
      if (drawn >= limit) continue;
      drawVirus(virus, now);
      drawn += 1;
    }
  }

  function drawVirus(virus, now) {
    const big = virus.kind === "big";
    const spore = virus.kind === "spore";
    const spikes = perf.lowQuality ? (big ? 19 : spore ? 13 : 15) : (big ? 31 : spore ? 19 : 23);
    const spin = virus.spin + now / (big ? 3400 : 2600);
    const color = virusColor(virus);
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = perf.lowQuality ? 0 : (big ? 26 : spore ? 22 : 18) / zoom;
    ctx.beginPath();
    for (let i = 0; i < spikes; i++) {
      const angle = spin + (i / spikes) * Math.PI * 2;
      const r = i % 2 === 0
        ? virus.radius * (big ? 1.18 : spore ? 1.12 : 1.24)
        : virus.radius * (big ? 0.76 : spore ? 0.72 : 0.82);
      const x = virus.x + Math.cos(angle) * r;
      const y = virus.y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = big ? "rgba(255, 255, 255, 0.46)" : spore ? "rgba(255, 255, 255, 0.58)" : "rgba(255, 255, 255, 0.34)";
    ctx.lineWidth = (big ? 3 : 2) / zoom;
    ctx.stroke();

    ctx.globalAlpha = big ? 0.22 : spore ? 0.28 : 0.16;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 / zoom;
    for (let i = 0; i < (big ? 3 : spore ? 3 : 2); i++) {
      ctx.beginPath();
      ctx.arc(virus.x, virus.y, virus.radius * (0.35 + i * 0.18), now / 1900 + i, Math.PI * 1.2 + now / 1700 + i);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.38;
    ctx.fillStyle = big ? "#f7ffd7" : spore ? "#fdf2f8" : "#d8ffe0";
    ctx.beginPath();
    ctx.arc(virus.x - virus.radius * 0.18, virus.y - virus.radius * 0.22, virus.radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
    if (spore && !perf.lowQuality) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 5; i++) {
        const angle = -spin * 0.7 + (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(virus.x + Math.cos(angle) * virus.radius * 0.48, virus.y + Math.sin(angle) * virus.radius * 0.48, virus.radius * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawCells(now) {
    const bounds = visibleBounds(160);
    const source = renderCells.length ? renderCells : allCells();
    visibleCellBuffer.length = 0;
    for (const wrap of source) {
      const cell = wrap.cell;
      if (wrap.group.dead || cell.dead) continue;
      if (!isVisible(cell, bounds, cell.radius + 80)) continue;
      visibleCellBuffer.push(wrap);
    }
    visibleCellBuffer.sort((a, b) => a.cell.radius - b.cell.radius);
    for (const wrap of visibleCellBuffer) drawCell(wrap.group, wrap.cell, now);
    perf.drawnCells = visibleCellBuffer.length;
  }

  function drawCell(group, cell, now) {
    const r = cell.radius;
    ctx.save();
    if (!(perf.lowQuality && !group.isPlayer && r < 44)) {
      drawTrailPattern(group, cell, now);
      drawHaloPattern(group, cell, now);
    }
    sharedCosmeticRenderer.drawCellBody({
      context: ctx, x: cell.x, y: cell.y, radius: r, color: group.color,
      own: group.isPlayer, lowQuality: perf.lowQuality, now, lineScale: 1 / zoom,
      invincibleRemaining: groupInvincible(group, now) ? Math.max(0, group.invincibleUntil - now) / 1000 : 0,
      mergeDelay: cell.mergeDelay, mergeMax: cell.mergeMax
    });
    drawSkinPattern(group, cell, now);
    if (group.isPlayer || !perf.lowQuality || r > 34 || (r > 24 && zoom > 0.7)) drawCellLabel(group, cell);
    ctx.restore();
  }

  function drawTrailPattern(group, cell, now) {
    if (!group.isPlayer) return false;
    {
      const definition = selectedTrailDef();
      return sharedCosmeticRenderer.drawTrail({
        context: ctx,
        definition,
        x: cell.x,
        y: cell.y,
        radius: cell.radius,
        worldRadius: cell.radius,
        vx: cell.vx,
        vy: cell.vy,
        now,
        lineScale: 1 / zoom,
        splitCount: playerGroup?.cells.length || 1,
        lowQuality: perf.lowQuality,
        baseColor: group.color
      });
    }
  }

  function drawHaloPattern(group, cell, now) {
    if (!group.isPlayer) return false;
    {
      const definition = selectedHaloDef();
      return sharedCosmeticRenderer.drawHalo({
        context: ctx,
        definition,
        x: cell.x,
        y: cell.y,
        radius: cell.radius,
        worldRadius: cell.radius,
        now,
        lineScale: 1 / zoom,
        splitCount: playerGroup?.cells.length || 1,
        lowQuality: perf.lowQuality,
        baseColor: group.color
      });
    }
  }

  function drawSkinPattern(group, cell, now) {
    if (!group.isPlayer) return false;
    {
      const definition = selectedSkinDef();
      return sharedCosmeticRenderer.drawSkin({
        context: ctx,
        definition,
        x: cell.x,
        y: cell.y,
        radius: cell.radius,
        worldRadius: cell.radius,
        now,
        lineScale: 1 / zoom,
        splitCount: playerGroup?.cells.length || 1,
        lowQuality: perf.lowQuality,
        baseColor: group.color
      });
    }
  }

  function drawCellLabel(group, cell) {
    return sharedCosmeticRenderer.drawCellLabel({ context: ctx, x: cell.x, y: cell.y, radius: cell.radius,
      name: group.name, mass: cell.mass, own: group.isPlayer, lineScale: 1 / zoom,
      showName: group.cells.length <= 4 || cell.radius >= 64 });
  }

  function drawEffects() {
    const bounds = visibleBounds(120);
    for (const p of particles) {
      if (!isVisible(p, bounds, 18)) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      if (!perf.lowQuality) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10 / zoom;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const r of rings) {
      if (!isVisible(r, bounds, r.radius + 20)) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, r.life * 0.55);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 4 / zoom;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function worldToScreen(point) {
    return {
      x: (point.x - camera.x) * zoom + view.w / 2,
      y: (point.y - camera.y) * zoom + view.h / 2
    };
  }

  function drawPlayerGuides(now) {
    if (!playerGroup || playerGroup.dead || game.menu || game.over || game.paused) return;
    const center = groupCenter(playerGroup);
    const source = center.largestCell;
    if (!source || source.mass < 32 || playerGroup.cells.length >= maxCellsFor(playerGroup)) return;
    const target = cursorPoint();
    const n = norm(target.x - source.x, target.y - source.y);
    if (n.length < 24) return;
    const reach = clamp(source.radius * 1.3 + 90, 130, 260);
    const land = clampPlayablePoint(source.x + n.x * reach, source.y + n.y * reach, source.radius);
    const ghostRadius = radiusFromMass(source.mass * 0.5);
    const pulse = 0.55 + Math.sin(now / 180) * 0.12;

    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([10 / zoom, 12 / zoom]);
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(land.x, land.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.18 + pulse * 0.16;
    ctx.fillStyle = playerGroup.color;
    ctx.beginPath();
    ctx.arc(land.x, land.y, ghostRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3 / zoom;
    ctx.beginPath();
    ctx.arc(land.x, land.y, ghostRadius + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawFinalPointers(now) {
    if (!safeZone.enabled || game.menu || game.over || game.paused || !playerGroup || playerGroup.dead) return;
    const enemies = allLiveGroups().filter(group => group !== playerGroup && !sameTeam(group, playerGroup));
    if (enemies.length < 1 || enemies.length > 4) return;
    const margin = 42;
    const playerCenter = groupCenter(playerGroup);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const group of enemies) {
      const center = groupCenter(group);
      const screen = worldToScreen(center);
      const inside = screen.x > margin && screen.x < view.w - margin && screen.y > margin && screen.y < view.h - margin;
      const x = clamp(screen.x, margin, view.w - margin);
      const y = clamp(screen.y, margin + 16, view.h - margin);
      const angle = Math.atan2(screen.y - view.h / 2, screen.x - view.w / 2);
      const dist = Math.hypot(center.x - playerCenter.x, center.y - playerCenter.y);

      ctx.save();
      ctx.translate(inside ? screen.x : x, inside ? screen.y : y);
      ctx.rotate(angle);
      ctx.fillStyle = group.color;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.font = "800 12px Microsoft YaHei, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
      ctx.lineWidth = 4;
      const label = `${Math.round(dist / 100)}格`;
      ctx.strokeText(label, inside ? screen.x : x, (inside ? screen.y : y) + 24);
      ctx.fillText(label, inside ? screen.x : x, (inside ? screen.y : y) + 24);
    }
    ctx.restore();
  }

  function drawPauseLayer() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "rgba(2, 6, 10, 0.42)";
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.fillStyle = "#eef5ff";
    ctx.textAlign = "center";
    ctx.font = "800 42px Microsoft YaHei, Segoe UI, sans-serif";
    ctx.fillText("已暂停", view.w / 2, view.h / 2);
    ctx.font = "500 15px Microsoft YaHei, Segoe UI, sans-serif";
    ctx.fillStyle = "#9fb1c9";
    ctx.fillText("P / Esc 继续，暂停菜单可确认重开", view.w / 2, view.h / 2 + 34);
    ctx.restore();
  }

  function drawSplitFlash() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = game.splitFlash * 0.5;
    ctx.strokeStyle = "#44d7b6";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(view.w / 2, view.h / 2, Math.min(view.w, view.h) * (0.28 + game.splitFlash), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawMinimap() {
    const w = miniCanvas.width;
    const h = miniCanvas.height;
    miniCtx.clearRect(0, 0, w, h);
    miniCtx.fillStyle = "rgba(4, 10, 16, 0.92)";
    miniCtx.fillRect(0, 0, w, h);
    miniCtx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    miniCtx.strokeRect(0.5, 0.5, w - 1, h - 1);

    if (safeZone.enabled) {
      miniCtx.save();
      miniCtx.strokeStyle = safeZone.shrinking ? "#ff5f7a" : "#ffd166";
      miniCtx.lineWidth = 1.4;
      miniCtx.beginPath();
      miniCtx.arc((safeZone.x / WORLD) * w, (safeZone.y / WORLD) * h, (safeZone.radius / WORLD) * w, 0, Math.PI * 2);
      miniCtx.stroke();
      miniCtx.restore();
    }
    const rect = rectArenaBounds();
    if (rect) {
      miniCtx.save();
      miniCtx.strokeStyle = "#67e8f9";
      miniCtx.lineWidth = 1.4;
      miniCtx.strokeRect(
        (rect.left / WORLD) * w,
        (rect.top / WORLD) * h,
        ((rect.right - rect.left) / WORLD) * w,
        ((rect.bottom - rect.top) / WORLD) * h
      );
      miniCtx.restore();
    }

    if (modeConfig().domination && game.domination?.currentLeaderId) {
      const leader = groups.find(group => group.id === game.domination.currentLeaderId);
      if (leader && !leader.dead) {
        miniCtx.save();
        miniCtx.globalAlpha = 0.2;
        miniCtx.fillStyle = leader.isPlayer ? "#ffffff" : leader.color;
        miniCtx.strokeStyle = leader.isPlayer ? "rgba(255, 255, 255, 0.82)" : leader.color;
        miniCtx.lineWidth = 0.8;
        for (const cell of leader.cells) {
          if (cell.dead) continue;
          miniCtx.beginPath();
          miniCtx.arc((cell.x / WORLD) * w, (cell.y / WORLD) * h, Math.max(2.2, (cell.radius / WORLD) * w), 0, Math.PI * 2);
          miniCtx.fill();
          miniCtx.stroke();
        }
        miniCtx.restore();
      }
    }

    for (const point of controlPoints) {
      const color = point.owner === null ? "rgba(255, 255, 255, 0.78)" : TEAM_COLORS[point.owner % TEAM_COLORS.length];
      miniCtx.strokeStyle = color;
      miniCtx.lineWidth = 1.2;
      miniCtx.beginPath();
      miniCtx.arc((point.x / WORLD) * w, (point.y / WORLD) * h, 5.2, 0, Math.PI * 2);
      miniCtx.stroke();
      if (point.captureTeam !== null) miniDot(point.x, point.y, TEAM_COLORS[point.captureTeam % TEAM_COLORS.length], 2.8);
    }

    for (const virus of viruses) miniDot(virus.x, virus.y, virusColor(virus), virus.kind === "big" ? 3.4 : 2);
    for (const group of groups) {
      if (group.dead) continue;
      const center = groupCenter(group);
      miniDot(center.x, center.y, group.isPlayer ? "#ffffff" : group.color, group.isPlayer ? 4.5 : clamp(center.largest / 25, 2.2, 5));
    }

    const boundsW = view.w / zoom;
    const boundsH = view.h / zoom;
    miniCtx.strokeStyle = "rgba(255, 255, 255, 0.62)";
    miniCtx.lineWidth = 1;
    miniCtx.strokeRect(
      ((camera.x - boundsW / 2) / WORLD) * w,
      ((camera.y - boundsH / 2) / WORLD) * h,
      (boundsW / WORLD) * w,
      (boundsH / WORLD) * h
    );
  }

  function miniDot(x, y, color, size) {
    miniCtx.fillStyle = color;
    miniCtx.beginPath();
    miniCtx.arc((x / WORLD) * miniCanvas.width, (y / WORLD) * miniCanvas.height, size, 0, Math.PI * 2);
    miniCtx.fill();
  }

  function isVisible(entity, bounds, pad) {
    const p = pad || entity.radius || 0;
    return entity.x + p >= bounds.left && entity.x - p <= bounds.right && entity.y + p >= bounds.top && entity.y - p <= bounds.bottom;
  }

  function isNearCamera(entity, pad) {
    return isVisible(entity, visibleBounds(pad || 0), pad || entity.radius || 0);
  }

  function buildRanking() {
    const config = modeConfig();
    if (config.teams > 0) {
      const masses = Array.from({ length: config.teams }, () => 0);
      const counts = Array.from({ length: config.teams }, () => 0);
      for (const group of groups) {
        if (group.dead || group.team === null || group.team === undefined || !group.cells.length) continue;
        masses[group.team] += groupMass(group);
        counts[group.team] += 1;
      }
      const rows = [];
      for (let team = 0; team < config.teams; team++) {
        const score = teamScores[team] || 0;
        rows.push({
          name: `${TEAM_NAMES[team] || `队伍 ${team + 1}`} ${counts[team]}人`,
          mass: masses[team],
          value: config.control ? score * 100000 + masses[team] : masses[team],
          valueLabel: config.control ? `${Math.floor(score)}/${config.controlScore}` : null,
          color: TEAM_COLORS[team % TEAM_COLORS.length],
          player: team === playerGroup.team,
          team
        });
      }
      rows.sort((a, b) => (b.value || b.mass) - (a.value || a.mass));
      return rows;
    }

    const source = config.ranking === "kills"
      ? groups.filter(group => group === playerGroup || !group.dead || (group.lives || 0) > 0)
      : config.respawn
        ? groups.filter(group => group === playerGroup || !group.dead || group.respawnAt)
        : allLiveGroups();
    const rows = source.map(group => {
      const mass = groupMass(group);
      return {
        name: group.name,
        mass,
        value: config.ranking === "kills" ? group.kills * 10000 + (group.lives || 0) * 100 + mass : mass,
        valueLabel: config.ranking === "kills" ? (config.lives ? `${group.kills}/${group.lives || 0}` : `${group.kills}杀`) : null,
        color: group.color,
        player: group.isPlayer
      };
    });
    rows.sort((a, b) => (b.value || b.mass) - (a.value || a.mass));
    return rows;
  }

  function personalRank() {
    const rows = buildRanking();
    const index = rows.findIndex(row => row.player);
    return index >= 0 ? index + 1 : rows.length + 1;
  }

  function teamRank(team) {
    const rows = buildRanking();
    const index = rows.findIndex(row => row.team === team);
    return index >= 0 ? index + 1 : rows.length + 1;
  }

  function zoneText(now) {
    if (rectArenaBounds()) {
      const config = modeConfig();
      return Math.abs((config.arenaWidth || 0) - (config.arenaHeight || 0)) < 0.01 ? "方形霸屏区" : "矩形霸屏区";
    }
    if (!safeZone.enabled) return `${modeConfig().short}模式`;
    if (safeZone.static) return "固定霸屏区";
    if (safeZone.shrinking) {
      const left = Math.max(0, Math.ceil((safeZone.shrinkEnd - now) / 1000));
      return `安全区收缩 ${left}s`;
    }
    const left = Math.max(0, Math.ceil((safeZone.shrinkStart - now) / 1000));
    return `下次收缩 ${left}s`;
  }

  function updateHud(now, force) {
    if (!force && game.over) return;
    const config = modeConfig();
    const rows = buildRanking();
    const rankIndex = config.teams > 0
      ? rows.findIndex(row => row.team === playerGroup.team)
      : rows.findIndex(row => row.player);
    const rank = rankIndex >= 0 ? rankIndex + 1 : rows.length + 1;
    const mass = groupMass(playerGroup);
    if (!authorityMode && !game.menu && !game.paused) window.ScaAudio?.observe({ ...playerGroup, mass });
    massValue.textContent = Math.round(mass);
    rankValue.textContent = playerGroup.dead ? "-" : rank;
    cellValue.textContent = playerGroup.cells.length;
    killValue.textContent = game.kills;

    const rankHtml = rows.slice(0, 8).map((row, index) => `
      <div class="rank-row${row.player ? " player" : ""}">
        <span>${index + 1}</span>
        <span><i class="dot" style="color:${row.color};background:${row.color}"></i> ${row.name}</span>
        <span>${row.valueLabel || Math.round(row.mass)}</span>
      </div>
    `).join("");
    if (rankHtml !== perf.lastRankHtml) {
      rankList.innerHTML = rankHtml;
      perf.lastRankHtml = rankHtml;
    }

    const elapsed = Math.max(0, Math.floor((now - game.startedAt) / 1000));
    const minutes = Math.floor(elapsed / 60);
    const seconds = String(elapsed % 60).padStart(2, "0");
    const tags = [];
    tags.push(`<span class="tag${safeZone.shrinking ? " danger" : ""}">${zoneText(now)}</span>`);
    if (config.domination) {
      const share = Math.round((game.domination?.share || 0) * 100);
      const massShare = Math.round((game.domination?.massShare || 0) * 100);
      const playerShare = Math.round((game.domination?.playerShare || 0) * 100);
      const hold = Math.max(0, Math.ceil((config.dominationHold || 7) - (game.domination?.hold || 0)));
      const target = Math.round((config.dominationShare || 0.52) * 100);
      const warmup = Math.ceil(game.domination?.warmupLeft || 0);
      const leaderName = escapeHtml(game.domination?.currentLeaderName || "无人");
      const fill = clamp((share / Math.max(1, target)) * 100, 0, 100);
      const timerText = warmup > 0
        ? `预热 ${warmup}s`
        : share >= target || (game.domination?.hold || 0) > 0
          ? `维持 ${hold}s`
          : `差 ${Math.max(0, target - share)}%`;
      tags.push(`
        <div class="domination-meter">
          <div class="meter-head">
            <span>霸屏 ${share}%/${target}%</span>
            <span>${timerText}</span>
          </div>
          <div class="meter-track"><div class="meter-fill${share >= target ? " ready" : ""}" style="--p:${fill}%"></div></div>
        </div>
      `);
      tags.push(`<span class="tag">领跑 ${leaderName} · 我的区域 ${playerShare}% · 质量 ${massShare}%</span>`);
    }
    if (config.quickMerge) {
      const readyAt = game.quickMergeReadyAt || 0;
      tags.push(`<span class="tag">A 快合 ${now >= readyAt ? "就绪" : `${Math.ceil((readyAt - now) / 1000)}s`}</span>`);
    }
    if (config.screenSkill) {
      const readyAt = game.screenSkillReadyAt || 0;
      const active = game.screenSkillUntil > now;
      tags.push(`<span class="tag${active ? " danger" : ""}">D 冲刺 ${active ? "爆发" : now >= readyAt ? "就绪" : `${Math.ceil((readyAt - now) / 1000)}s`}</span>`);
    }
    if (config.blitzSupremacy) {
      const state = game.blitzSupremacy || {};
      const holdLeft = Math.max(0, Math.ceil((config.supremacyHold || 3) - (state.hold || 0)));
      if ((state.hold || 0) > 0) {
        tags.push(`<span class="tag danger">闪电制霸 ${holdLeft}s · ${escapeHtml(state.leaderName || "领跑者")} ${Math.max(1, state.lead || 1).toFixed(1)}x</span>`);
      }
    }
    const activeTag = eventTag();
    if (activeTag) tags.push(`<span class="tag danger">${activeTag}</span>`);
    else if (matchEvent.nextAt) tags.push(`<span class="tag">事件 ${Math.max(0, Math.ceil((matchEvent.nextAt - now) / 1000))}s</span>`);
    if (game.endsAt) tags.push(`<span class="tag">剩余 ${formatTime((game.endsAt - now) / 1000)}</span>`);
    if (config.lives) tags.push(`<span class="tag">生命 ${playerGroup.lives || 0}</span>`);
    if (groupInvincible(playerGroup, now)) tags.push(`<span class="tag">复活护盾 ${Math.ceil((playerGroup.invincibleUntil - now) / 1000)}s</span>`);
    if (config.control) {
      tags.push(`<span class="tag">据点分 ${Math.floor(teamScores[playerGroup.team] || 0)}/${config.controlScore}</span>`);
      const owned = controlPoints.filter(point => point.owner === playerGroup.team).length;
      tags.push(`<span class="tag">我方据点 ${owned}/${controlPoints.length}</span>`);
    }
    if (config.demon) {
      const bossMass = Math.round(groups.filter(group => group.isBoss && !group.dead).reduce((sum, boss) => sum + groupMass(boss), 0));
      tags.push(`<span class="tag danger">魔王 ${bossMass}</span>`);
    }
    if (playerGroup.dead && playerGroup.respawnAt && !game.over) {
      tags.push(`<span class="tag">重生 ${formatTime((playerGroup.respawnAt - now) / 1000)}</span>`);
    }
    let aliveCount = 0;
    const aliveTeams = config.teams > 0 ? new Set() : null;
    for (const group of groups) {
      if (group.dead || !group.cells.length) continue;
      aliveCount += 1;
      if (aliveTeams && group.team !== null && group.team !== undefined) aliveTeams.add(group.team);
    }
    if (config.teams > 0) {
      tags.push(`<span class="tag">队伍 ${aliveTeams.size}/${config.teams}</span>`);
    }
    tags.push(`<span class="tag">存活 ${aliveCount}/${config.players}</span>`);
    tags.push(`<span class="tag">食点 ${foods.length}/${foodTargetCount(now)}</span>`);
    tags.push(`<span class="tag">刷新 ${Math.round(foodSpawnRate(now))}/s</span>`);
    tags.push(`<span class="tag">时间 ${minutes}:${seconds}</span>`);
    if (input.ejectHeld) tags.push(`<span class="tag">连续吐球</span>`);
    if (playerGroup.cells.some(cell => cell.mergeDelay > 0)) tags.push(`<span class="tag">重组中</span>`);
    if (game.paused) tags.push(`<span class="tag">暂停</span>`);
    const tagHtml = tags.join("");
    if (tagHtml !== perf.lastTagHtml) {
      tagList.innerHTML = tagHtml;
      perf.lastTagHtml = tagHtml;
    }
  }

  function pointerFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
  }

  function resetJoystick() {
    joystick.active = false;
    joystick.pointerId = null;
    joystick.x = 0;
    joystick.y = 0;
    if (joystickStick) {
      joystickStick.style.left = "50%";
      joystickStick.style.top = "50%";
    }
  }

  function updateJoystick(event) {
    const rect = joystickEl.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const max = rect.width * 0.34;
    const rawX = event.clientX - rect.left - cx;
    const rawY = event.clientY - rect.top - cy;
    const len = Math.hypot(rawX, rawY);
    const scale = len > max ? max / len : 1;
    const dx = rawX * scale;
    const dy = rawY * scale;
    joystick.x = dx / max;
    joystick.y = dy / max;
    joystickStick.style.left = `${cx + dx}px`;
    joystickStick.style.top = `${cy + dy}px`;
  }

  canvas.addEventListener("mousemove", pointerFromEvent);
  canvas.addEventListener("mousedown", pointerFromEvent);

  canvas.addEventListener("touchstart", event => {
    const t = event.touches[0];
    if (t) pointerFromEvent(t);
    event.preventDefault();
  }, { passive: false });

  joystickEl.addEventListener("pointerdown", event => {
    event.preventDefault();
    event.stopPropagation();
    joystick.active = true;
    joystick.pointerId = event.pointerId;
    joystickEl.setPointerCapture(event.pointerId);
    updateJoystick(event);
  });

  joystickEl.addEventListener("pointermove", event => {
    if (!joystick.active || event.pointerId !== joystick.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    updateJoystick(event);
  });

  function releaseJoystick(event) {
    if (event && joystick.pointerId !== null && event.pointerId !== joystick.pointerId) return;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    resetJoystick();
  }

  joystickEl.addEventListener("pointerup", releaseJoystick);
  joystickEl.addEventListener("pointercancel", releaseJoystick);
  joystickEl.addEventListener("lostpointercapture", releaseJoystick);

  canvas.addEventListener("touchmove", event => {
    const t = event.touches[0];
    if (t) pointerFromEvent(t);
    event.preventDefault();
  }, { passive: false });

  document.addEventListener("keydown", event => {
    if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
    const key = event.key.toLowerCase();
    if (event.key === "Escape") {
      event.preventDefault();
      if (!titleScreen.hidden && titleScreen.style.display !== "none") {
        showTitlePanel("home");
      } else if (overlay.style.display === "grid" && (game.menu || game.over)) {
        showTitleScreen();
      } else if (!game.menu && !game.over) {
        togglePause();
      }
    } else if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat && !game.menu) splitGroup(playerGroup, cursorPoint(), { power: 1 });
    } else if (key === "a" && modeConfig().quickMerge) {
      event.preventDefault();
      if (!event.repeat) quickMergePlayer();
    } else if (key === "d" && modeConfig().screenSkill) {
      event.preventDefault();
      if (!event.repeat) screenDashPlayer();
    } else if (key === "w") {
      event.preventDefault();
      if (game.menu || game.over || game.paused) return;
      input.ejectHeld = true;
      ejectBtn.classList.add("active");
    } else if (key === "p") {
      if (!event.repeat) togglePause();
    } else if (key === "r" && !event.repeat && !game.menu && !game.over) {
      if (!game.paused) togglePause();
    }
  });

  document.addEventListener("keyup", event => {
    if (event.key.toLowerCase() === "w") {
      input.ejectHeld = false;
      ejectBtn.classList.remove("active");
    }
  });

  function triggerSplit(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (game.menu || game.over || game.paused || playerGroup.dead) return;
    splitGroup(playerGroup, cursorPoint(), { power: 1 });
  }

  splitBtn.addEventListener("pointerdown", triggerSplit);
  splitBtn.addEventListener("contextmenu", event => event.preventDefault());

  function startEjectHold(event) {
    event.preventDefault();
    event.stopPropagation();
    if (game.menu || game.over || game.paused) return;
    if (event.pointerId !== undefined && ejectBtn.setPointerCapture) {
      try {
        ejectBtn.setPointerCapture(event.pointerId);
      } catch (error) {
        // Some browsers reject capture for synthetic pointer events.
      }
    }
    input.ejectHeld = true;
    ejectBtn.classList.add("active");
    ejectMass(playerGroup, cursorPoint(), authorityNow);
  }

  function stopEjectHold(event) {
    if (event && event.currentTarget !== window) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (event && event.pointerId !== undefined && ejectBtn.releasePointerCapture) {
      try {
        ejectBtn.releasePointerCapture(event.pointerId);
      } catch (error) {
        // The pointer may already be released by the browser.
      }
    }
    input.ejectHeld = false;
    ejectBtn.classList.remove("active");
  }

  ejectBtn.addEventListener("pointerdown", startEjectHold);
  ejectBtn.addEventListener("pointerup", stopEjectHold);
  ejectBtn.addEventListener("pointercancel", stopEjectHold);
  ejectBtn.addEventListener("lostpointercapture", stopEjectHold);
  ejectBtn.addEventListener("contextmenu", event => event.preventDefault());
  window.addEventListener("pointerup", stopEjectHold);
  window.addEventListener("blur", () => {
    stopEjectHold();
    resetJoystick();
    if (!authorityMode && !game.menu && !game.over && !game.paused) togglePause();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopEjectHold();
      if (!authorityMode && !game.menu && !game.over && !game.paused) togglePause();
    }
  });
  pauseBtn.addEventListener("click", togglePause);
  document.getElementById("singleResumeBtn")?.addEventListener("click", () => { if (game.paused) togglePause(); });
  document.getElementById("singleLeaveBtn")?.addEventListener("click", returnToLobby);
  document.getElementById("singleRestartBtn")?.addEventListener("click", () => {
    const session = document.getElementById("singleSessionMenu");
    if (session) session.hidden = true;
    startGame(activeMode);
  });
  musicBtn.addEventListener("click", toggleMusic);
  musicLobbyBtn.addEventListener("click", toggleMusic);
  randomLookBtn.addEventListener("click", randomizeOwnedLook);
  menuBtn.addEventListener("click", () => { if (!game.menu && !game.over && !game.paused) togglePause(); else if (game.menu || game.over) returnToLobby(); });
  document.getElementById("restartBtn").addEventListener("click", () => { if (game.menu || game.over) startGame(selectedMode); else if (!game.paused) togglePause(); });
  playAgainBtn.addEventListener("click", () => startGame(selectedMode));
  document.getElementById("titleSingleBtn")?.addEventListener("click", openSingleLobby);
  document.getElementById("heroStartBtn")?.addEventListener("click", openSingleLobby);
  document.getElementById("titleProfileBtn")?.addEventListener("click", openPersonalCenter);
  document.getElementById("titleOnlineBtn")?.addEventListener("click", () => pageTransition.navigate(multiplayerUrl()));
  document.querySelector(".online-entry")?.addEventListener("click", event => {
    event.preventDefault();
    pageTransition.navigate(multiplayerUrl());
  });
  titleScreen?.addEventListener("click", async event => {
    const openButton = event.target.closest("[data-title-open]");
    if (openButton) showTitlePanel(openButton.dataset.titleOpen);
    if (event.target.closest("[data-title-back]")) showTitlePanel("home");
    const copyButton = event.target.closest("[data-copy-text]");
    if (copyButton) {
      event.preventDefault();
      const value = copyButton.dataset.copyText || "";
      try {
        const copied = await copyText(value);
        showLobbyToast(copied ? `已复制：${value}` : `复制失败，请手动记录：${value}`, copied ? "#58edc8" : "#ff7a90");
      } catch {
        showLobbyToast(`复制失败，请手动记录：${value}`, "#ff7a90");
      }
      return;
    }
    const external = event.target.closest("a[data-external]");
    if (external && window.starClusterDesktop?.openExternal) {
      event.preventDefault();
      try {
        const result = await window.starClusterDesktop.openExternal(external.href);
        showLobbyToast(result?.ok ? "已在系统浏览器中打开" : result?.error || "无法打开外部链接", result?.ok ? "#58edc8" : "#ff7a90");
      } catch {
        showLobbyToast("无法打开外部链接", "#ff7a90");
      }
    }
  });
  settingsForm?.elements.displayMode?.addEventListener("change", () => {
    displaySyncSequence += 1;
    settingsForm.elements.windowSize.disabled = settingsForm.elements.displayMode.value !== "windowed";
  });
  settingsForm?.addEventListener("submit", async event => {
    event.preventDefault();
    displaySyncSequence += 1;
    const previous = settingsApi.load();
    const requested = settingsApi.normalize({
      displayMode: settingsForm.elements.displayMode.value,
      windowSize: settingsForm.elements.windowSize.value,
      frameRate: settingsForm.elements.frameRate.value,
      quality: settingsForm.elements.quality.value,
      networkBuffer: settingsForm.elements.networkBuffer.value,
      showPerformance: settingsForm.elements.showPerformance.checked,
      screenShake: settingsForm.elements.screenShake.checked,
      masterVolume: settingsForm.elements.masterVolume.value,
      musicVolume: settingsForm.elements.musicVolume.value,
      effectsVolume: settingsForm.elements.effectsVolume.value
    });
    let displayState = null;
    if (window.starClusterDesktop?.setDisplayMode) {
      try {
        displayState = await window.starClusterDesktop.setDisplayMode({ mode: requested.displayMode, windowSize: requested.windowSize });
        updateFullscreenButton(displayState);
        refreshDisplayNote(displayState);
        if (!displayState?.ok) throw new Error(displayState?.error || "系统未确认显示模式切换");
      } catch {
        const actualMode = displayState?.mode || previous.displayMode;
        settingsApi.save({ ...requested, displayMode: actualMode });
        settingsForm.elements.displayMode.value = actualMode;
        settingsForm.elements.windowSize.disabled = actualMode !== "windowed";
        showLobbyToast(displayState?.error || "显示模式应用失败，仍可使用 F11 切换", "#ff7a90");
        return;
      }
    } else {
      try {
        const wantsFullscreen = requested.displayMode === "borderless-fullscreen";
        if (wantsFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen();
        if (!wantsFullscreen && document.fullscreenElement) await document.exitFullscreen();
        const fullscreen = Boolean(document.fullscreenElement);
        displayState = { ok: fullscreen === wantsFullscreen, fullscreen, mode: fullscreen ? "borderless-fullscreen" : "windowed" };
        updateFullscreenButton(displayState);
        if (!displayState.ok) throw new Error("浏览器未确认全屏切换");
      } catch {
        const actualMode = document.fullscreenElement ? "borderless-fullscreen" : "windowed";
        settingsApi.save({ ...requested, displayMode: actualMode });
        settingsForm.elements.displayMode.value = actualMode;
        showLobbyToast("浏览器拒绝了全屏请求，可按 F11 使用浏览器全屏", "#ff7a90");
        return;
      }
    }
    const saved = settingsApi.save({ ...requested, displayMode: displayState?.mode || requested.displayMode });
    const runtimeChanged = ["frameRate", "quality", "showPerformance", "screenShake", "masterVolume", "musicVolume", "effectsVolume"]
      .some(key => previous[key] !== saved[key]);
    if (runtimeChanged) {
      showLobbyToast("设置已保存，正在重新载入渲染器", "#58edc8");
      setTimeout(() => location.reload(), 180);
      return;
    }
    showTitlePanel("home");
    showLobbyToast("显示设置已应用", "#58edc8");
  });
  document.getElementById("titleFullscreenBtn")?.addEventListener("click", async () => {
    try {
      if (window.starClusterDesktop?.toggleFullscreen) {
        const state = await window.starClusterDesktop.toggleFullscreen();
        updateFullscreenButton(state);
        refreshDisplayNote(state);
        if (!state?.ok) throw new Error(state?.error || "系统未确认全屏切换");
      } else if (!document.fullscreenElement) {
        if (!document.documentElement.requestFullscreen) throw new Error("浏览器不支持全屏 API");
        await document.documentElement.requestFullscreen();
        const fullscreen = Boolean(document.fullscreenElement);
        updateFullscreenButton({ fullscreen });
        if (!fullscreen) throw new Error("浏览器未确认全屏切换");
      } else {
        if (!document.exitFullscreen) throw new Error("浏览器不支持退出全屏 API");
        await document.exitFullscreen();
        const fullscreen = Boolean(document.fullscreenElement);
        updateFullscreenButton({ fullscreen });
        if (fullscreen) throw new Error("浏览器未确认退出全屏");
      }
      showLobbyToast("显示模式已切换", "#58edc8");
    } catch {
      showLobbyToast("全屏切换失败，桌面版仍可按 F11", "#ff7a90");
    }
  });
  lobbyBackBtn?.addEventListener("click", () => showTitleScreen());
  document.getElementById("titleQuitBtn")?.addEventListener("click", () => window.starClusterDesktop?.quitApp?.());
  lobbyTabs.addEventListener("click", event => {
    const button = event.target.closest("[data-lobby]");
    if (!button) return;
    showLobbyPanel(button.dataset.lobby);
  });
  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      setModeSelection(button.dataset.mode);
      if (game.menu || game.over) showStartOverlay();
    });
  }
  skinGrid.addEventListener("click", event => {
    const button = event.target.closest("[data-skin]");
    if (!button) return;
    if (!skinUnlocked(button.dataset.skin)) return;
    selectedSkin = button.dataset.skin;
    localStorage.setItem("ballArenaSkin", selectedSkin);
    renderCosmetics();
  });
  sporeGrid.addEventListener("click", event => {
    const button = event.target.closest("[data-spore]");
    if (!button) return;
    if (!sporeUnlocked(button.dataset.spore)) return;
    selectedSpore = button.dataset.spore;
    localStorage.setItem("ballArenaSpore", selectedSpore);
    renderCosmetics();
  });
  haloGrid.addEventListener("click", event => {
    const button = event.target.closest("[data-halo]");
    if (!button) return;
    if (!haloUnlocked(button.dataset.halo)) return;
    selectedHalo = button.dataset.halo;
    localStorage.setItem("ballArenaHalo", selectedHalo);
    renderCosmetics();
  });
  trailGrid.addEventListener("click", event => {
    const button = event.target.closest("[data-trail]");
    if (!button) return;
    if (!trailUnlocked(button.dataset.trail)) return;
    selectedTrail = button.dataset.trail;
    localStorage.setItem("ballArenaTrail", selectedTrail);
    renderCosmetics();
  });
  forgePanel.addEventListener("click", event => {
    const button = event.target.closest("[data-forge]");
    if (!button) return;
    craftForge(button.dataset.forge);
  });
  shopPanel.addEventListener("click", event => {
    const button = event.target.closest("[data-shop]");
    if (!button) return;
    handleShopAction(button.dataset.shop);
  });
  shopPanel.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    if (!event.target.closest("#redeemCodeInput")) return;
    handleShopAction("redeem");
  });
  let resizeFrame = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(resize);
  }, { passive: true });
  document.addEventListener("fullscreenchange", () => updateFullscreenButton());
  if (window.starClusterDesktop?.onDisplayState) {
    window.starClusterDesktop.onDisplayState(state => {
      displaySyncSequence += 1;
      updateFullscreenButton(state);
      refreshDisplayNote(state);
      syncDisplayControls(state);
      const saved = settingsApi.load();
      if (state?.mode && saved.displayMode !== state.mode) settingsApi.save({ ...saved, displayMode: state.mode });
    });
  }
  if (window.starClusterDesktop?.setDisplayMode) {
    const saved = settingsApi.load();
    void window.starClusterDesktop.setDisplayMode({ mode: saved.displayMode, windowSize: saved.windowSize })
      .then(updateFullscreenButton)
      .catch(() => updateFullscreenButton());
  } else {
    updateFullscreenButton();
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      lastFrame = performance.now();
      simulationAccumulator = 0;
      captureSimulationState();
    }
  });

  function canonicalTeamSummaries() {
    const config = modeConfig();
    if (!config.teams) return [];
    const summaries = [];
    for (let team = 0; team < config.teams; team += 1) {
      const members = groups.filter(group => group.team === team);
      summaries.push({
        id: `team-${team}`,
        team,
        name: config.demon ? (team === 0 ? "勇者阵营" : "魔王阵营") : `${TEAM_NAMES[team % TEAM_NAMES.length]}队`,
        color: TEAM_COLORS[team % TEAM_COLORS.length],
        mass: Math.round(members.reduce((sum, group) => sum + groupMass(group), 0) * 10) / 10,
        kills: members.reduce((sum, group) => sum + (group.kills || 0), 0),
        score: Math.round((teamScores[team] || 0) * 10) / 10,
        alive: members.filter(group => !group.dead && group.cells.length).length
      });
    }
    const metric = config.control ? "score" : "mass";
    return summaries.sort((a, b) => b[metric] - a[metric] || b.kills - a.kills || a.team - b.team);
  }

  function canonicalRanking() {
    const config = modeConfig();
    const teams = canonicalTeamSummaries();
    const teamRanks = new Map(teams.map((team, index) => [team.team, index + 1]));
    const entries = groups.map(group => ({
      id: group.id,
      name: group.name,
      mass: Math.round(groupMass(group) * 10) / 10,
      kills: group.kills || 0,
      deaths: group.deaths || 0,
      lives: group.lives || 0,
      connected: group.connected !== false,
      human: Boolean(group.isPlayer || group.authorityParticipant),
      color: group.color,
      team: group.team,
      teamRank: group.team == null ? null : teamRanks.get(group.team),
      role: group.isBoss ? "boss" : group.isDemonMinion ? "minion" : "player",
      eliminated: Boolean(group.eliminated || (group.dead && (!config.respawn || (config.lives && group.lives <= 0)))),
      score: group.team == null ? 0 : Math.round((teamScores[group.team] || 0) * 10) / 10
    }));
    if (config.ranking === "kills") return entries.sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || b.kills - a.kills || b.lives - a.lives || b.mass - a.mass);
    if (config.control) return entries.sort((a, b) => b.score - a.score || b.mass - a.mass || b.kills - a.kills);
    if (config.teams) return entries.sort((a, b) => (a.teamRank || 99) - (b.teamRank || 99) || b.mass - a.mass || b.kills - a.kills);
    return entries.sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || b.mass - a.mass || b.kills - a.kills || a.name.localeCompare(b.name, "zh-CN"));
  }

  function configureAuthorityPlayers(participants) {
    const source = Array.isArray(participants) ? participants : [];
    if (!source.length) throw new Error("Authority runtime requires at least one human participant");
    authorityMode = true;
    authorityPlayers.clear();
    const idChanges = new Map();
    const humanStartMass = groupMass(groups[0]);
    const humanSlots = modeConfig().demon ? groups.filter(group => group.team === 0 && !group.isBoss && !group.isDemonMinion) : groups;
    if (source.length > humanSlots.length) throw new Error("该模式没有足够的真人席位");
    const count = source.length;
    for (let index = 0; index < count; index += 1) {
      const participant = source[index] || {};
      const group = humanSlots[index];
      const oldId = group.id;
      const id = String(participant.id || `authority-player-${index + 1}`);
      idChanges.set(oldId, id);
      group.id = id;
      group.name = String(participant.name || `玩家${index + 1}`).slice(0, 16);
      group.authorityParticipant = true;
      group.connected = participant.connected !== false;
      if (index > 0 && !group.isBoss && !group.isDemonMinion) {
        for (const cell of group.cells) {
          cell.mass = humanStartMass / Math.max(1, group.cells.length);
          cell.radius = radiusFromMass(cell.mass);
        }
      }
      group.cosmetics = sharedCosmetics.normalizeProfile(participant.cosmetics || {});
      const skin = sharedCosmetics.definition("skin", group.cosmetics.skin);
      if (skin?.color) group.color = skin.color;
      const center = groupCenter(group);
      group.authorityInput = {
        seq: 0,
        dx: 0,
        dy: 0,
        targetX: center.x,
        targetY: center.y,
        ejectHeld: false,
        pendingSplit: false,
        pendingQuickMerge: false,
        pendingSpecial: false
      };
      group.quickMergeReadyAt = authorityNow;
      group.screenSkillReadyAt = authorityNow;
      group.screenSkillUntil = 0;
      group.lastEjectAt = 0;
      for (const cell of group.cells) cell.id = nextEntityId(`${id}-cell`);
      authorityPlayers.set(id, group);
    }
    for (const group of groups) {
      if (authorityPlayers.has(group.id)) continue;
      group.authorityParticipant = false;
      if (!group.ai) group.ai = makeAiState(groupCenter(group));
    }
    if (Array.isArray(game.demonBossIds)) {
      game.demonBossIds = game.demonBossIds.map(id => idChanges.get(id) || id);
    }
    playerGroup = groups[0];
    return canonicalAuthoritySnapshot();
  }

  function setAuthorityInput(playerId, nextInput) {
    const group = authorityPlayers.get(String(playerId));
    if (!group || !group.authorityParticipant) return false;
    const current = group.authorityInput || {};
    const sequence = Math.max(0, Math.floor(Number(nextInput?.seq) || 0));
    if (sequence <= (current.seq || 0)) return false;
    current.seq = sequence;
    current.dx = clamp(Number(nextInput?.dx) || 0, -1, 1);
    current.dy = clamp(Number(nextInput?.dy) || 0, -1, 1);
    current.targetX = nextInput?.targetX != null && Number.isFinite(Number(nextInput.targetX)) ? Number(nextInput.targetX) : null;
    current.targetY = nextInput?.targetY != null && Number.isFinite(Number(nextInput.targetY)) ? Number(nextInput.targetY) : null;
    current.ejectHeld = Boolean(nextInput?.eject);
    current.pendingSplit ||= Boolean(nextInput?.split);
    current.pendingQuickMerge ||= Boolean(nextInput?.quickMerge);
    current.pendingSpecial ||= Boolean(nextInput?.special);
    group.authorityInput = current;
    return true;
  }

  function setAuthorityConnected(playerId, connected) {
    const group = authorityPlayers.get(String(playerId));
    if (!group) return false;
    group.connected = Boolean(connected);
    if (!group.connected && group.authorityInput) {
      const center = groupCenter(group);
      Object.assign(group.authorityInput, { dx: 0, dy: 0, targetX: center.x, targetY: center.y, ejectHeld: false, pendingSplit: false, pendingQuickMerge: false, pendingSpecial: false });
    }
    return true;
  }

  function canonicalAuthoritySnapshot() {
    const config = modeConfig();
    const ranking = canonicalRanking();
    const ranks = new Map(ranking.map((entry, index) => [entry.id, index + 1]));
    const rect = rectArenaBounds();
    const active = matchEvent.active;
    return {
      tick: authorityTick,
      serverTime: authorityNow,
      serverHz: 60,
      mode: activeMode,
      phase: game.over ? "finished" : "running",
      finished: Boolean(game.over),
      finishReason: game.finishReason || null,
      winnerId: game.over ? game.noWinner ? null : game.winnerId || ranking[0]?.id || null : null,
      world: { width: WORLD, height: WORLD },
      arena: rect
        ? { type: "rect", x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top }
        : { type: "rect", x: 0, y: 0, width: WORLD, height: WORLD },
      remaining: game.endsAt ? Math.max(0, Math.round((game.endsAt - authorityNow) / 100) / 10) : null,
      groups: groups.map(group => ({
        id: group.id,
        name: group.name,
        color: group.color,
        human: Boolean(group.isPlayer || group.authorityParticipant),
        connected: group.connected !== false,
        dead: Boolean(group.dead),
        eliminated: Boolean(group.eliminated || (group.dead && (!config.respawn || (config.lives && group.lives <= 0)))),
        kills: group.kills || 0,
        deaths: group.deaths || 0,
        lives: group.lives || 0,
        team: group.team,
        role: group.isBoss ? "boss" : group.isDemonMinion ? "minion" : "player",
        cosmetics: group.cosmetics || (group.isPlayer ? {
          skin: selectedSkin,
          spore: selectedSpore,
          halo: selectedHalo,
          trail: selectedTrail
        } : null),
        ackInputSeq: group.authorityInput?.seq || 0,
        respawnRemaining: group.dead && group.respawnAt ? Math.max(0, Math.round((group.respawnAt - authorityNow) / 100) / 10) : 0,
        invincibleRemaining: Math.max(0, Math.round(((group.invincibleUntil || 0) - authorityNow) / 100) / 10),
        quickMergeCooldown: Math.max(0, Math.round(((group.quickMergeReadyAt || 0) - authorityNow) / 100) / 10),
        specialCooldown: Math.max(0, Math.round(((group.screenSkillReadyAt || 0) - authorityNow) / 100) / 10),
        rank: ranks.get(group.id) || ranking.length,
        mass: Math.round(groupMass(group) * 10) / 10,
        cells: group.cells.filter(cell => !cell.dead).map(cell => ({
          id: cell.id,
          x: Math.round(cell.x * 10) / 10,
          y: Math.round(cell.y * 10) / 10,
          vx: Math.round(cell.vx * 10) / 10,
          vy: Math.round(cell.vy * 10) / 10,
          radius: Math.round(cell.radius * 10) / 10,
          mass: Math.round(cell.mass * 10) / 10,
          mergeDelay: Math.max(0, Math.round((cell.mergeDelay || 0) * 10) / 10),
          mergeMax: Math.max(0, Math.round((cell.mergeMax || 0) * 10) / 10)
        }))
      })),
      foods: foods.map(food => ({
        id: food.id,
        x: Math.round(food.x * 10) / 10,
        y: Math.round(food.y * 10) / 10,
        radius: Math.round(food.radius * 10) / 10,
        mass: Math.round(food.mass * 10) / 10,
        color: food.color,
        rich: Boolean(food.rich),
        pulse: Math.round((food.pulse || 0) * 1000) / 1000
      })),
      foodBaseline: true,
      foodRevision: authorityTick,
      viruses: viruses.map(virus => ({
        id: virus.id || `virus-legacy-${viruses.indexOf(virus)}`,
        x: Math.round(virus.x * 10) / 10,
        y: Math.round(virus.y * 10) / 10,
        radius: Math.round(virus.radius * 10) / 10,
        color: virusColor(virus),
        kind: virus.kind,
        tactical: Boolean(virus.tactical),
        spore: virus.kind === "spore"
      })),
      virusBaseline: true,
      virusRevision: authorityTick,
      ejected: ejected.map(item => ({
        id: item.id || `ejected-legacy-${ejected.indexOf(item)}`,
        x: Math.round(item.x * 10) / 10,
        y: Math.round(item.y * 10) / 10,
        vx: Math.round(item.vx * 10) / 10,
        vy: Math.round(item.vy * 10) / 10,
        radius: Math.round(item.radius * 10) / 10,
        color: item.color,
        ownerId: item.ownerId,
        spore: item.spore,
        accent: item.accent
      })),
      safeZone: safeZone.enabled ? {
        x: Math.round(safeZone.x * 10) / 10,
        y: Math.round(safeZone.y * 10) / 10,
        radius: Math.round(safeZone.radius * 10) / 10,
        targetRadius: Math.round((safeZone.targetRadius || safeZone.radius) * 10) / 10,
        phase: safeZone.phase || 1,
        shrinking: Boolean(safeZone.shrinking)
      } : null,
      controlPoints: controlPoints.map((point, index) => ({
        id: point.id || point.label || `control-${index}`,
        label: point.label,
        x: Math.round(point.x * 10) / 10,
        y: Math.round(point.y * 10) / 10,
        radius: Math.round(point.radius * 10) / 10,
        owner: point.owner,
        captureTeam: point.captureTeam,
        progress: Math.round((point.capture || 0) * 10) / 10,
        contested: Boolean(point.contested)
      })),
      teams: canonicalTeamSummaries(),
      objective: {
        type: config.ranking || "mass",
        label: config.label,
        description: config.description,
        movementSpeedScale: (config.speedScale || 1) * activeEventFactor("speedMult", 1),
        activeEvent: active ? {
          key: active.key,
          label: active.label,
          remaining: Math.max(0, Math.round((matchEvent.endsAt - authorityNow) / 100) / 10)
        } : null,
        ...(config.control ? { targetScore: config.controlScore || 240 } : {}),
        ...(config.domination ? {
          domination: {
            ...(game.domination || {}),
            leaderId: game.domination?.currentLeaderId || game.domination?.leaderId || null,
            progressSeconds: game.domination?.hold || 0,
            holdSeconds: config.dominationHold || 6
          }
        } : {}),
        ...(config.demon ? {
          bossesAlive: groups.filter(group => group.isBoss && !group.dead).length,
          heroesAlive: groups.filter(group => group.team === 0 && !group.dead).length
        } : {})
      },
      ranking: ranking.slice(0, 10),
      events: []
    };
  }

  if (new URLSearchParams(window.location.search).has("debug")) {
    window.__ballArenaDebug = {
      snapshot() {
        const now = authorityNow;
        return {
          world: WORLD,
          mode: activeMode,
          selectedMode,
          selectedSkin,
          selectedSpore,
          selectedHalo,
          selectedTrail,
          skinType: selectedSkinDef().type,
          sporeType: selectedSporeDef().type,
          haloType: selectedHaloDef().type,
          trailType: selectedTrailDef().type,
          lobbyPanel: activeLobbyPanel,
          dust: Math.floor(meta.dust),
          forgeLevel: meta.forgeLevel,
          forgeLuck: Math.floor(meta.forgeLuck || 0),
          forgeXp: Math.floor(meta.forgeXp || 0),
          forgeTickets: Math.floor(meta.forgeTickets || 0),
          forgePityEpic: Math.floor(meta.forgePityEpic || 0),
          forgePityLegend: Math.floor(meta.forgePityLegend || 0),
          forgeTheme: forgeThemeForLevel(meta.forgeLevel || 1).name,
          lastForge: meta.lastForge,
          unlockedSkins: meta.unlockedSkins.length,
          unlockedSpores: meta.unlockedSpores.length,
          unlockedHalos: meta.unlockedHalos.length,
          unlockedTrails: meta.unlockedTrails.length,
          forgeLockedSkins: forgeSkins().filter(skin => !skinUnlocked(skin.key)).length,
          forgeLockedSpores: forgeSpores().filter(spore => !sporeUnlocked(spore.key)).length,
          forgeLockedHalos: forgeHalos().filter(halo => !haloUnlocked(halo.key)).length,
          forgeLockedTrails: forgeTrails().filter(trail => !trailUnlocked(trail.key)).length,
          menu: !!game.menu,
          titleVisible: !titleScreen.hidden && titleScreen.style.display !== "none",
          lobbyVisible: overlay.style.display !== "none",
          paused: !!game.paused,
          over: !!game.over,
          targetPlayers: modeConfig().players,
          teams: modeConfig().teams,
          duration: game.duration,
          timeLeft: game.endsAt ? Math.max(0, Math.round((game.endsAt - now) / 1000)) : 0,
          maxCells: maxCellsFor(playerGroup),
          foodBase: FOOD_BASE_COUNT,
          foodMax: FOOD_MAX_COUNT,
          foodCount: foods.length,
          foodTarget: foodTargetCount(now),
          foodRate: Math.round(foodSpawnRate(now) * 10) / 10,
          leaderMass: Math.round(groups.reduce((best, group) => group.dead ? best : Math.max(best, groupMass(group)), 0)),
          totalMass: Math.round(groups.reduce((sum, group) => sum + groupMass(group), 0)),
          totalKills: groups.reduce((sum, group) => sum + (group.kills || 0), 0),
          playerMass: Math.round(groupMass(playerGroup) * 10) / 10,
          playerColor: playerGroup.color,
          playerTeam: playerGroup.team,
          playerTeamColor: playerGroup.team === null || playerGroup.team === undefined ? null : TEAM_COLORS[playerGroup.team % TEAM_COLORS.length],
          playerCells: playerGroup.cells.length,
          playerCellMasses: playerGroup.cells.map(cell => Math.round(cell.mass * 10) / 10),
          playerLives: playerGroup.lives || 0,
          playerRank: modeConfig().teams > 0 ? teamRank(playerGroup.team) : personalRank(),
          playerDead: playerGroup.dead,
          respawnIn: playerGroup.respawnAt ? Math.max(0, Math.round((playerGroup.respawnAt - now) / 1000)) : 0,
          camera: {
            x: Math.round(camera.x),
            y: Math.round(camera.y),
            zoom: Math.round(zoom * 1000) / 1000,
            viewPressure: Math.round((game.cameraViewPressure || 0) * 1000) / 1000,
            spreadRatio: Math.round((game.cameraSpreadRatio || 0) * 1000) / 1000
          },
          ejectHeld: input.ejectHeld,
          viruses: viruses.length,
          smallViruses: viruses.filter(virus => virus.kind !== "big").length,
          bigViruses: viruses.filter(virus => virus.kind === "big").length,
          ejected: ejected.length,
          maxEjected: MAX_EJECTED,
          lowQuality: perf.lowQuality,
          avgFrame: Math.round(perf.avgFrame * 10) / 10,
          avgWork: Math.round(perf.avgWork * 10) / 10,
          maxFrame: Math.round(perf.maxFrame * 10) / 10,
          longFrames: perf.longFrames,
          pixelRatio: Math.round(dpr * 100) / 100,
          backingStoreResizes: perf.backingStoreResizes,
          targetFps: TARGET_RENDER_FPS,
          renderedFrames: perf.renderedFrames,
          skippedRenderFrames: perf.skippedRenderFrames,
          simulationFps: Math.round(1 / SIMULATION_STEP),
          renderer: gpuRenderer ? gpuRenderer.info() : { active: false, backend: "Canvas 2D" },
          drawnFood: perf.drawnFood,
          drawnCells: perf.drawnCells,
          alive: allLiveGroups().length,
          safeZone: {
            enabled: !!safeZone.enabled,
            x: Math.round(safeZone.x),
            y: Math.round(safeZone.y),
            radius: Math.round(safeZone.radius),
            shrinking: safeZone.shrinking
          },
          event: {
            active: matchEvent.active ? matchEvent.active.key : null,
            label: matchEvent.active ? matchEvent.active.label : null,
            nextIn: matchEvent.nextAt ? Math.max(0, Math.round((matchEvent.nextAt - now) / 1000)) : 0
          },
          domination: {
            enabled: !!modeConfig().domination,
            leader: game.domination?.currentLeaderName || null,
            leaderId: game.domination?.currentLeaderId || null,
            share: Math.round((game.domination?.share || 0) * 1000) / 10,
            rawShare: Math.round((game.domination?.rawShare || 0) * 1000) / 10,
            playerShare: Math.round((game.domination?.playerShare || 0) * 1000) / 10,
            target: Math.round((game.domination?.targetShare || modeConfig().dominationShare || 0) * 1000) / 10,
            hold: Math.round((game.domination?.hold || 0) * 10) / 10
          },
          control: {
            scores: teamScores.map(score => Math.round(score)),
            seekers: groups.filter(group => group.ai && (group.ai.mode === "占点" || group.ai.mode === "守点")).length,
            points: controlPoints.map(point => ({
              label: point.label,
              owner: point.owner,
              captureTeam: point.captureTeam,
              capture: Math.round(point.capture),
              contested: point.contested
            }))
          },
          demon: {
            bosses: groups.filter(group => group.isBoss && !group.dead).length,
            bossMass: Math.round(groups.filter(group => group.isBoss && !group.dead).reduce((sum, boss) => sum + groupMass(boss), 0)),
            minions: groups.filter(group => group.isDemonMinion && !group.dead).length
          },
          ai: groups.filter(group => !group.isPlayer && !group.dead).slice(0, 6).map(group => ({
            name: group.name,
            mode: group.ai.mode,
            cells: group.cells.length,
            mass: Math.round(groupMass(group))
          }))
        };
      },
      authoritySnapshot() {
        return canonicalAuthoritySnapshot();
      },
      progressSnapshot() { return { perks: { ...meta.perks }, totalDust: meta.totalDust, crafted: meta.crafted, dust: meta.dust, unlockedSkins: [...meta.unlockedSkins] }; },
      startAuthorityMode(modeKey = "battle", participants = []) {
        startGame(modeKey);
        return configureAuthorityPlayers(participants);
      },
      configureAuthorityPlayers(participants = []) {
        return configureAuthorityPlayers(participants);
      },
      setAuthorityInput(playerId, nextInput = {}) {
        return setAuthorityInput(playerId, nextInput);
      },
      setAuthorityConnected(playerId, connected) {
        return setAuthorityConnected(playerId, connected);
      },
      authorityRanking() {
        return canonicalRanking();
      },
      setGroupFixture(id, values = {}) {
        const group = groups.find(entry => entry.id === id);
        if (!group) throw new Error("Unknown fixture participant");
        if (Number.isFinite(values.invincibleSeconds)) group.invincibleUntil = authorityNow + clamp(values.invincibleSeconds, 0, 700) * 1000;
        if (Number.isFinite(values.mass) && group.cells.length) {
          for (const cell of group.cells) {
            cell.mass = Math.max(1, values.mass) / group.cells.length;
            cell.radius = radiusFromMass(cell.mass);
          }
        }
        if (Number.isFinite(values.kills)) group.kills = Math.max(0, Math.floor(values.kills));
        if (Number.isFinite(values.teamScore) && group.team != null) teamScores[group.team] = Math.max(0, values.teamScore);
        return canonicalAuthoritySnapshot();
      },
      probeEjectedRules(ownerId, { ageSeconds = 0, eaterId = ownerId, lifetime = false } = {}) {
        const eater = groups.find(group => group.id === eaterId);
        const cell = eater.cells[0];
        const original = { x: cell.x, y: cell.y, invincibleUntil: eater.invincibleUntil };
        cell.x = WORLD + 2000; cell.y = WORLD + 2000; eater.invincibleUntil = 0;
        const item = { id: nextEntityId("fixture-spore"), x: lifetime ? 20 : cell.x, y: lifetime ? 20 : cell.y, vx: 0, vy: 0, radius: 3, mass: 5, age: ageSeconds, ownerId };
        ejected = [item];
        const before = cell.mass;
        if (lifetime) updateEjected(0); else handleEjectedEating();
        const result = { remaining: ejected.length, gainedMass: cell.mass - before };
        cell.x = original.x; cell.y = original.y; eater.invincibleUntil = original.invincibleUntil;
        return result;
      },
      setSurvivors(ids) {
        const survivors = new Set(ids);
        for (const group of groups) {
          if (survivors.has(group.id)) continue;
          group.dead = true;
          group.cells = [];
          group.lives = 0;
          group.respawnAt = 0;
        }
        return canonicalAuthoritySnapshot();
      },
      setPaused(paused) {
        if (game.paused !== Boolean(paused)) togglePause();
        return this.snapshot();
      },
      protectPerfProbe(seconds = 30) {
        playerGroup.invincibleUntil = authorityNow + clamp(Number(seconds) || 30, 1, 700) * 1000;
      },
      renderFrame(now) { loop(now); return canonicalAuthoritySnapshot(); },
      authorityStep(ticks = 1) {
        this.authorityAdvance(ticks);
        return canonicalAuthoritySnapshot();
      },
      authorityAdvance(ticks = 1) {
        const count = clamp(Math.floor(Number(ticks) || 1), 1, 600);
        for (let index = 0; index < count && !game.over; index += 1) {
          authorityNow += SIMULATION_STEP * 1000;
          authorityTick += 1;
          update(SIMULATION_STEP, authorityNow);
        }
        syncRadii();
        return { tick: authorityTick, serverTime: authorityNow, finished: Boolean(game.over), finishReason: game.finishReason || null, winnerId: game.winnerId || null };
      },
      startMode(modeKey = "battle") {
        startGame(modeKey);
        return this.snapshot();
      },
      equipSkin(key) {
        const item = SKINS.find(skin => skin.key === key);
        if (!item) return null;
        if (!skinUnlocked(key)) meta.unlockedSkins.push(key);
        selectedSkin = key;
        localStorage.setItem("ballArenaSkin", selectedSkin);
        saveMeta();
        renderCosmetics();
        return this.snapshot();
      },
      equipSpore(key) {
        const item = SPORES.find(spore => spore.key === key);
        if (!item) return null;
        if (!sporeUnlocked(key)) meta.unlockedSpores.push(key);
        selectedSpore = key;
        localStorage.setItem("ballArenaSpore", selectedSpore);
        saveMeta();
        renderCosmetics();
        return this.snapshot();
      },
      equipHalo(key) {
        const item = HALOS.find(halo => halo.key === key);
        if (!item) return null;
        if (!haloUnlocked(key)) meta.unlockedHalos.push(key);
        selectedHalo = key;
        localStorage.setItem("ballArenaHalo", selectedHalo);
        saveMeta();
        renderCosmetics();
        return this.snapshot();
      },
      equipTrail(key) {
        const item = TRAILS.find(trail => trail.key === key);
        if (!item) return null;
        if (!trailUnlocked(key)) meta.unlockedTrails.push(key);
        selectedTrail = key;
        localStorage.setItem("ballArenaTrail", selectedTrail);
        saveMeta();
        renderCosmetics();
        return this.snapshot();
      },
      forgeOnce(type = "skin") {
        meta.dust = Math.max(meta.dust, forgeCost(type));
        craftForge(type);
        return {
          lastForge: meta.lastForge,
          snapshot: this.snapshot()
        };
      },
      shopAction(action = "daily") {
        handleShopAction(action);
        return this.snapshot();
      },
      triggerEvent(key = "spore") {
        const event = MATCH_EVENTS.find(item => item.key === key) || MATCH_EVENTS[0];
        activateMatchEvent(event, authorityNow);
        updateHud(authorityNow, true);
        return this.snapshot();
      },
      controlPointCheck() {
        startGame("control");
        const point = controlPoints[0];
        playerGroup.cells = [makeCell(playerGroup, point.x, point.y, 320)];
        syncRadii();
        updateControlPoints(8);
        updateHud(performance.now(), true);
        return this.snapshot();
      },
      forceTimeEnd() {
        if (game.endsAt) game.endsAt = authorityNow - 100;
        maybeEndGame(authorityNow);
        return {
          snapshot: this.snapshot(),
          title: resultTitle.textContent,
          text: resultText.textContent
        };
      },
      simulatePlayerDeath() {
        const killer = groups.find(group => !group.isPlayer && !group.dead) || null;
        eliminateGroup(playerGroup, killer);
        return {
          snapshot: this.snapshot(),
          killerLives: killer ? killer.lives || 0 : 0,
          killerKills: killer ? killer.kills || 0 : 0,
          title: resultTitle.textContent
        };
      },
      teamCoopCheck() {
        startGame("team");
        const ally = groups.find(group => !group.isPlayer && group.team === playerGroup.team);
        if (!ally) return null;
        for (const group of groups) {
          if (group !== playerGroup && group !== ally) {
            group.dead = true;
            group.cells = [];
          }
        }
        playerGroup.dead = false;
        ally.dead = false;
        const base = { x: WORLD / 2, y: WORLD / 2 };
        playerGroup.cells = [
          makeCell(playerGroup, base.x, base.y, 520),
          makeCell(playerGroup, base.x + 24, base.y, 82)
        ];
        ally.cells = [makeCell(ally, base.x + 24, base.y, 360)];
        syncRadii();
        handleCellEating(buildCellGrid());
        cleanupGroups();
        const afterFragment = {
          playerCells: playerGroup.cells.length,
          allyMass: Math.round(groupMass(ally) * 10) / 10
        };

        playerGroup.dead = false;
        ally.dead = false;
        playerGroup.cells = [makeCell(playerGroup, base.x, base.y, 82)];
        ally.cells = [makeCell(ally, base.x, base.y, 520)];
        syncRadii();
        handleCellEating(buildCellGrid());
        cleanupGroups();
        return {
          afterFragment,
          lastCellProtected: playerGroup.cells.length === 1 && !playerGroup.dead,
          snapshot: this.snapshot()
        };
      },
      teamAiFragmentCheck() {
        startGame("team");
        const ally = groups.find(group => !group.isPlayer && group.team === playerGroup.team);
        if (!ally) return null;
        for (const group of groups) {
          if (group !== playerGroup && group !== ally) {
            group.dead = true;
            group.cells = [];
          }
        }
        const base = { x: WORLD / 2, y: WORLD / 2 };
        playerGroup.dead = false;
        ally.dead = false;
        playerGroup.cells = [
          makeCell(playerGroup, base.x, base.y, 420),
          makeCell(playerGroup, base.x + 120, base.y, 72)
        ];
        playerGroup.cells[1].mergeDelay = 12;
        ally.cells = [makeCell(ally, base.x + 250, base.y, 360)];
        ally.ai.think = 0;
        syncRadii();
        chooseAiTarget(ally, performance.now(), buildCellGrid());
        return {
          mode: ally.ai.mode,
          targetIsPlayerFragment: ally.ai.prey && ally.ai.prey.group === playerGroup,
          targetMass: ally.ai.prey && ally.ai.prey.cell ? Math.round(ally.ai.prey.cell.mass) : 0,
          snapshot: this.snapshot()
        };
      },
      teamAiRescueCheck() {
        startGame("team");
        const ally = groups.find(group => !group.isPlayer && group.team === playerGroup.team);
        const enemy = groups.find(group => !group.isPlayer && group.team !== playerGroup.team);
        if (!ally || !enemy) return null;
        for (const group of groups) {
          if (group !== playerGroup && group !== ally && group !== enemy) {
            group.dead = true;
            group.cells = [];
          }
        }
        const base = { x: WORLD / 2, y: WORLD / 2 };
        playerGroup.dead = false;
        ally.dead = false;
        enemy.dead = false;
        playerGroup.cells = [makeCell(playerGroup, base.x, base.y, 170)];
        ally.cells = [makeCell(ally, base.x - 460, base.y, 1200)];
        enemy.cells = [makeCell(enemy, base.x + 260, base.y, 360)];
        ally.ai.think = 0;
        syncRadii();
        chooseAiTarget(ally, performance.now(), buildCellGrid());
        return {
          mode: ally.ai.mode,
          preyIsEnemy: ally.ai.prey && ally.ai.prey.group === enemy,
          allyCells: ally.cells.length,
          snapshot: this.snapshot()
        };
      },
      aiAggressionCheck() {
        startGame("battle");
        const hunter = groups.find(group => !group.isPlayer && !group.dead);
        if (!hunter) return null;
        for (const group of groups) {
          if (group !== playerGroup && group !== hunter) {
            group.dead = true;
            group.cells = [];
          }
        }
        const base = { x: WORLD / 2, y: WORLD / 2 };
        playerGroup.dead = false;
        hunter.dead = false;
        playerGroup.cells = [makeCell(playerGroup, base.x + 330, base.y, 120)];
        hunter.cells = [makeCell(hunter, base.x, base.y, 820)];
        hunter.ai.think = 0;
        hunter.ai.splitCooldown = 0;
        syncRadii();
        chooseAiTarget(hunter, performance.now(), buildCellGrid());
        tryAiSplitAttack(hunter, hunter.ai);
        syncRadii();
        return {
          mode: hunter.ai.mode,
          preyIsPlayer: hunter.ai.prey && hunter.ai.prey.group === playerGroup,
          cells: hunter.cells.length,
          snapshot: this.snapshot()
        };
      },
      stressLateGame(modeKey = "battle") {
        startGame(modeKey);
        const now = performance.now();
        for (const group of groups) {
          if (group.dead || !group.cells.length) continue;
          const center = groupCenter(group);
          const total = Math.max(groupMass(group), group.isPlayer ? 3600 : rand(620, 1800));
          const pieces = group.isPlayer ? maxCellsFor(group) : Math.floor(rand(5, 12));
          group.cells = [];
          for (let i = 0; i < pieces; i++) {
            const angle = (Math.PI * 2 * i) / pieces + rand(-0.22, 0.22);
            const dist = rand(24, 190);
            const point = clampPlayablePoint(center.x + Math.cos(angle) * dist, center.y + Math.sin(angle) * dist, 120);
            const cell = makeCell(group, point.x, point.y, total / pieces);
            cell.vx = Math.cos(angle) * rand(40, 180);
            cell.vy = Math.sin(angle) * rand(40, 180);
            cell.mergeDelay = rand(2, 12);
            group.cells.push(cell);
          }
          if (group.ai) {
            group.ai.think = 0;
            group.ai.splitCooldown = 0;
            group.ai.ejectCooldown = 0;
          }
        }
        while (foods.length < FOOD_MAX_COUNT) addFood(makeFood());
        ejected = [];
        for (let i = 0; i < MAX_EJECTED; i++) {
          const owner = groups[Math.floor(Math.random() * groups.length)] || playerGroup;
          const p = randomPointInZone(120);
          const angle = rand(0, Math.PI * 2);
          ejected.push({
            id: nextEntityId("ejected"),
            x: p.x,
            y: p.y,
            vx: Math.cos(angle) * rand(60, 360),
            vy: Math.sin(angle) * rand(60, 360),
            mass: rand(6, 14),
            radius: 8,
            age: rand(0.2, 9),
            color: owner.color || "#44d7b6",
            ownerId: owner.id || "stress"
          });
        }
        syncRadii();
        renderCells = allCells();
        game.startedAt = now - 520000;
        return this.snapshot();
      },
      resetPlayer(mass = 1024) {
        const center = groupCenter(playerGroup).largestCell || { x: WORLD / 2, y: WORLD / 2 };
        game.over = false;
        game.paused = false;
        game.menu = false;
        input.ejectHeld = false;
        lastPlayerEject = 0;
        ejected = [];
        overlay.style.display = "none";
        pauseBtn.textContent = "停";
        ejectBtn.classList.remove("active");
        playerGroup.dead = false;
        playerGroup.respawnAt = 0;
        if (modeConfig().lives && playerGroup.lives <= 0) playerGroup.lives = modeConfig().lives;
        playerGroup.cells = [makeCell(playerGroup, center.x, center.y, mass)];
        camera = { x: center.x, y: center.y };
        syncRadii();
        return this.snapshot();
      },
      forceMergeReady() {
        for (const cell of playerGroup.cells) cell.mergeDelay = 0;
        return this.snapshot();
      },
      quietArena() {
        let keeper = null;
        for (const group of groups) {
          if (group.isPlayer) continue;
          if (!keeper) {
            keeper = group;
            group.dead = false;
            group.cells = [makeCell(group, WORLD - 620, WORLD - 620, 42)];
            if (group.ai) {
              group.ai.target = { x: WORLD - 620, y: WORLD - 620 };
              group.ai.mode = "游走";
            }
          } else {
            group.dead = true;
            group.cells = [];
          }
        }
        viruses = [];
        ejected = [];
        particles = [];
        rings = [];
        game.over = false;
        game.paused = false;
        game.menu = false;
        overlay.style.display = "none";
        return this.snapshot();
      },
      step(seconds = 1) {
        let left = Math.max(0, seconds);
        while (left > 0) {
          const dt = Math.min(0.05, left);
          authorityNow += dt * 1000;
          authorityTick += 1;
          update(dt, authorityNow);
          left -= dt;
        }
        syncRadii();
        return this.snapshot();
      },
      splitPlayer(times = 1) {
        for (let i = 0; i < times; i++) {
          syncRadii();
          const center = groupCenter(playerGroup);
          splitGroup(playerGroup, { x: center.x + 620, y: center.y + 80 }, { power: 1 });
        }
        syncRadii();
        return this.snapshot();
      },
      ejectPlayer(times = 8) {
        let now = performance.now();
        for (let i = 0; i < times; i++) {
          lastPlayerEject = 0;
          const center = groupCenter(playerGroup);
          ejectMass(playerGroup, { x: center.x + 420, y: center.y }, now);
          now += EJECT_INTERVAL + 8;
        }
        syncRadii();
        return this.snapshot();
      },
      virusHitPlayer(mass = 720, kind = "small") {
        this.resetPlayer(mass);
        const cell = groupCenter(playerGroup).largestCell;
        const big = kind === "big";
        const spore = kind === "spore";
        const virus = {
          x: cell.x,
          y: cell.y,
          radius: big ? 76 : spore ? 48 : 42,
          mass: big ? BIG_VIRUS_MASS : spore ? VIRUS_MASS * 0.92 : VIRUS_MASS,
          baseMass: big ? BIG_VIRUS_MASS : spore ? VIRUS_MASS * 0.92 : VIRUS_MASS,
          kind: big ? "big" : spore ? "spore" : "small",
          spin: 0,
          debugId: `player-virus-${Math.random()}`
        };
        viruses.push(virus);
        const beforeMass = groupMass(playerGroup);
        const beforeViruses = viruses.length;
        handleVirusHits(0.016, performance.now());
        syncRadii();
        return {
          beforeMass: Math.round(beforeMass * 10) / 10,
          afterMass: Math.round(groupMass(playerGroup) * 10) / 10,
          cells: playerGroup.cells.length,
          kind: virus.kind,
          virusRemoved: !viruses.includes(virus),
          virusesBefore: beforeViruses,
          virusesAfter: viruses.length,
          ejected: ejected.length
        };
      },
      virusHitAi(mass = 720, kind = "small") {
        const group = groups.find(item => !item.isPlayer && !item.dead);
        if (!group) return null;
        const center = groupCenter(group).largestCell || { x: WORLD / 2 + 300, y: WORLD / 2 };
        group.cells = [makeCell(group, center.x, center.y, mass)];
        const big = kind === "big";
        const spore = kind === "spore";
        const virus = {
          x: center.x,
          y: center.y,
          radius: big ? 76 : spore ? 48 : 42,
          mass: big ? BIG_VIRUS_MASS : spore ? VIRUS_MASS * 0.92 : VIRUS_MASS,
          baseMass: big ? BIG_VIRUS_MASS : spore ? VIRUS_MASS * 0.92 : VIRUS_MASS,
          kind: big ? "big" : spore ? "spore" : "small",
          spin: 0,
          debugId: `ai-virus-${Math.random()}`
        };
        viruses.push(virus);
        const beforeMass = groupMass(group);
        handleVirusHits(0.016, performance.now());
        syncRadii();
        return {
          name: group.name,
          beforeMass: Math.round(beforeMass * 10) / 10,
          afterMass: Math.round(groupMass(group) * 10) / 10,
          cells: group.cells.length,
          kind: virus.kind,
          mode: group.ai.mode,
          virusRemoved: !viruses.includes(virus),
          ejected: ejected.length
        };
      },
      authorityVirusHitRole(role = "boss", mass = 720, kind = "small") {
        const group = role === "boss"
          ? groups.find(item => item.isBoss && !item.dead)
          : role === "minion"
            ? groups.find(item => item.isDemonMinion && !item.dead)
            : groups.find(item => !item.isBoss && !item.isDemonMinion && !item.dead);
        if (!group) return null;
        const center = groupCenter(group).largestCell || { x: WORLD / 2, y: WORLD / 2 };
        group.cells = [makeCell(group, center.x, center.y, mass)];
        const big = kind === "big";
        const spore = kind === "spore";
        const virus = {
          id: nextEntityId("virus"),
          x: center.x,
          y: center.y,
          radius: big ? 76 : spore ? 48 : 42,
          mass: big ? BIG_VIRUS_MASS : spore ? VIRUS_MASS * 0.92 : VIRUS_MASS,
          baseMass: big ? BIG_VIRUS_MASS : spore ? VIRUS_MASS * 0.92 : VIRUS_MASS,
          kind: big ? "big" : spore ? "spore" : "small",
          spin: 0
        };
        viruses.push(virus);
        const beforeMass = groupMass(group);
        handleVirusHits(SIMULATION_STEP, authorityNow);
        syncRadii();
        return {
          role,
          beforeMass: Math.round(beforeMass * 10) / 10,
          afterMass: Math.round(groupMass(group) * 10) / 10,
          cells: group.cells.length,
          virusRemoved: !viruses.includes(virus)
        };
      },
      lateFoodPreview(seconds = 210) {
        const originalStartedAt = game.startedAt;
        game.startedAt -= seconds * 1000;
        safeZone.phase += 3;
        const now = performance.now();
        const result = {
          foodTarget: foodTargetCount(now),
          foodRate: Math.round(foodSpawnRate(now) * 10) / 10
        };
        game.startedAt = originalStartedAt;
        safeZone.phase -= 3;
        return result;
      },
      zoneDamagePlayer(seconds = 1) {
        const cell = groupCenter(playerGroup).largestCell;
        const originalZone = { ...safeZone };
        safeZone.enabled = true;
        safeZone.x = WORLD / 2;
        safeZone.y = WORLD / 2;
        safeZone.radius = 360;
        cell.x = safeZone.x + safeZone.radius + cell.radius + 180;
        cell.y = safeZone.y;
        const before = cell.mass;
        applyZoneDamage(seconds);
        Object.assign(safeZone, originalZone);
        syncRadii();
        return {
          before: Math.round(before * 10) / 10,
          after: Math.round(cell.mass * 10) / 10,
          lost: Math.round((before - cell.mass) * 10) / 10
        };
      }
    };
  }

  function captureSimulationState() {
    previousCameraX = camera.x;
    previousCameraY = camera.y;
    previousZoom = zoom;
    for (const group of groups) {
      for (const cell of group.cells) {
        cell.previousX = cell.x;
        cell.previousY = cell.y;
        cell.previousRadius = cell.radius;
      }
    }
    for (const entity of ejected) {
      entity.previousX = entity.x;
      entity.previousY = entity.y;
      entity.previousRadius = entity.radius;
    }
    for (const entity of viruses) {
      entity.previousX = entity.x;
      entity.previousY = entity.y;
      entity.previousRadius = entity.radius;
    }
    for (const entity of particles) {
      entity.previousX = entity.x;
      entity.previousY = entity.y;
      entity.previousRadius = entity.radius;
    }
  }

  function interpolateFrameEntity(entity, amount) {
    if (!Number.isFinite(entity.previousX) || !Number.isFinite(entity.previousY)) return;
    entity.frameX = entity.x;
    entity.frameY = entity.y;
    entity.frameRadius = entity.radius;
    entity.frameInterpolated = true;
    entity.x = lerp(entity.previousX, entity.x, amount);
    entity.y = lerp(entity.previousY, entity.y, amount);
    if (Number.isFinite(entity.previousRadius) && Number.isFinite(entity.radius)) {
      entity.radius = lerp(entity.previousRadius, entity.radius, amount);
    }
  }

  function applyInterpolatedFrame(alpha) {
    const amount = clamp(alpha, 0, 1);

    for (const group of groups) {
      for (const cell of group.cells) interpolateFrameEntity(cell, amount);
    }
    for (const entity of ejected) interpolateFrameEntity(entity, amount);
    for (const entity of viruses) interpolateFrameEntity(entity, amount);
    for (const entity of particles) interpolateFrameEntity(entity, amount);

    frameCameraX = camera.x;
    frameCameraY = camera.y;
    frameZoom = zoom;
    camera.x = lerp(previousCameraX, frameCameraX, amount);
    camera.y = lerp(previousCameraY, frameCameraY, amount);
    zoom = lerp(previousZoom, frameZoom, amount);
  }

  function restoreFrameEntity(entity) {
    if (!entity.frameInterpolated) return;
    entity.x = entity.frameX;
    entity.y = entity.frameY;
    entity.radius = entity.frameRadius;
    entity.frameInterpolated = false;
  }

  function restoreInterpolatedFrame() {
    for (const group of groups) {
      for (const cell of group.cells) restoreFrameEntity(cell);
    }
    for (const entity of ejected) restoreFrameEntity(entity);
    for (const entity of viruses) restoreFrameEntity(entity);
    for (const entity of particles) restoreFrameEntity(entity);
    camera.x = frameCameraX;
    camera.y = frameCameraY;
    zoom = frameZoom;
  }

  function syncRenderStatus(now) {
    if (!renderBadge || now < perf.nextStatusUpdate) return;
    perf.nextStatusUpdate = now + 500;
    const fps = Math.min(240, Math.max(1, Math.round(1000 / Math.max(1, perf.avgFrame))));
    const info = gpuRenderer ? gpuRenderer.info() : { active: false, backend: "Canvas 2D", device: "" };
    const rtxName = info.device.match(/RTX\s+\d{4}(?:\s+(?:Ti|SUPER))?/i);
    const gpuName = rtxName ? rtxName[0] : info.backend;
    renderBadge.textContent = info.active ? `${gpuName} · ${fps} FPS` : `2D 兼容 · ${fps} FPS`;
    renderBadge.classList.toggle("fallback", !info.active);
    renderBadge.title = info.active
      ? `硬件加速已启用：${info.device}｜渲染倍率 ${dpr.toFixed(2)}x｜物理 60Hz｜画质预算 ${TARGET_RENDER_FPS} FPS`
      : "WebGL 不可用，已自动切换到 Canvas 2D";
  }

  function adaptRenderScale(now) {
    if (now < perf.nextQualityCheck) return;
    perf.nextQualityCheck = now + 5000;
    // 对局中的动态降级只调整绘制细节，不再周期性重建 Canvas 像素缓冲。
    // 改写 canvas.width/height 会清空 2D 与 WebGL 后备缓冲，是偶发整屏闪烁的主要风险点。
    perf.qualityPressure = 0;
    perf.qualityRecovery = 0;
  }

  function reportRuntime() {
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    const info = gpuRenderer ? gpuRenderer.info() : { active: false, backend: "Canvas 2D", device: "" };
    const payload = JSON.stringify({
      fps: Math.round(1000 / Math.max(1, perf.avgFrame)),
      workMs: Math.round(perf.avgWork * 10) / 10,
      renderer: info.backend,
      gpu: info.active,
      device: info.device,
      dpr: Math.round(dpr * 100) / 100,
      targetFps: TARGET_RENDER_FPS,
      simulationFps: Math.round(1 / SIMULATION_STEP),
      spriteBatching: Boolean(info.spriteBatching),
      maxFrame: Math.round(perf.maxFrame * 10) / 10,
      longFrames: perf.longFrames,
      lowQuality: perf.lowQuality,
      scaleChanges: perf.scaleChanges,
      backingStoreResizes: perf.backingStoreResizes,
      renderedFrames: perf.renderedFrames,
      skippedRenderFrames: perf.skippedRenderFrames,
      gpuPixelRatio: info.pixelRatio || 0,
      gpuFrameFps: perf.lowQuality ? Math.min(60, GPU_CACHE_FPS) : GPU_CACHE_FPS
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/telemetry", new Blob([payload], { type: "application/json" }));
    }
  }

  function loop(now) {
    const workStartedAt = performance.now();
    const frameElapsed = now - lastFrame || SIMULATION_STEP * 1000;
    const dt = Math.min(0.05, frameElapsed / 1000);
    lastFrame = now;
    perf.maxFrame = Math.max(perf.maxFrame, frameElapsed);
    if (frameElapsed > 80) perf.longFrames += 1;

    let interpolation = 1;
    if (!game.paused && !game.over) {
      simulationAccumulator = Math.min(0.1, simulationAccumulator + dt);
      let steps = 0;
      while (simulationAccumulator >= SIMULATION_STEP && steps < MAX_SIMULATION_STEPS) {
        captureSimulationState();
        simulationNow += SIMULATION_STEP * 1000;
        authorityNow = simulationNow;
        authorityTick += 1;
        update(SIMULATION_STEP, simulationNow);
        simulationAccumulator -= SIMULATION_STEP;
        steps += 1;
      }
      if (steps === MAX_SIMULATION_STEPS && simulationAccumulator >= SIMULATION_STEP) {
        simulationAccumulator %= SIMULATION_STEP;
        // 丢弃积压步长，但保持本局逻辑时钟连续。
      }
      interpolation = simulationAccumulator / SIMULATION_STEP;
    } else {
      simulationAccumulator = 0;
      // 暂停只冻结逻辑时钟，不能把现实时间计入倒计时、缩圈和技能冷却。
    }

    const renderInterval = game.menu ? 1000 / 24 : game.paused ? 1000 / 30 : TARGET_RENDER_INTERVAL;
    const cadence = gameplayCore.advanceRenderCadence(now, nextRenderAt, renderInterval);
    nextRenderAt = cadence.nextRenderAt;
    if (cadence.due) {
      const renderedElapsed = lastRenderedAt ? now - lastRenderedAt : TARGET_RENDER_INTERVAL;
      lastRenderedAt = now;
      perf.avgFrame += (renderedElapsed - perf.avgFrame) * 0.06;
      perf.renderedFrames += 1;
      const highSplitMode = maxCellsFor(playerGroup) > 32;
      const cellPressure = renderCells.length > (highSplitMode ? 500 : 620) || (playerGroup && playerGroup.cells.length > 42);
      const objectPressure = ejected.length > 260 || particles.length > MAX_PARTICLES * 0.78;
      if (perf.avgFrame > TARGET_FRAME_MS * 1.4 || perf.avgWork > TARGET_FRAME_MS * 0.85 || cellPressure || objectPressure) {
        perf.lowQuality = true;
      } else if (perf.avgFrame < TARGET_FRAME_MS * 1.12 && perf.avgWork < TARGET_FRAME_MS * 0.62 && renderCells.length < (highSplitMode ? 340 : 420) && ejected.length < 170 && particles.length < MAX_PARTICLES * 0.42 && (!playerGroup || playerGroup.cells.length < 28)) {
        perf.lowQuality = false;
      }

      applyInterpolatedFrame(interpolation);
      draw(now);
      restoreInterpolatedFrame();
    } else {
      perf.skippedRenderFrames += 1;
    }
    const work = performance.now() - workStartedAt;
    perf.avgWork += (work - perf.avgWork) * 0.06;
    adaptRenderScale(now);
    syncRenderStatus(now);
    requestAnimationFrame(loop);
  }

  if (location.protocol === "http:" || location.protocol === "https:") {
    fetch("/api/runtime", { cache: "no-store" }).catch(() => null);
  }
  window.addEventListener("pagehide", reportRuntime, { once: true });
  resize();
  document.documentElement.classList.toggle("hide-performance", !gameSettings.showPerformance);
  document.documentElement.classList.toggle("desktop-env", Boolean(window.starClusterDesktop?.desktop));
  updateMusicButtons();
  setModeSelection("battle");
  startGame(selectedMode, { menu: true, title: true });
  requestAnimationFrame(now => {
    lastFrame = now;
    simulationNow = now;
    requestAnimationFrame(loop);
  });
})();
