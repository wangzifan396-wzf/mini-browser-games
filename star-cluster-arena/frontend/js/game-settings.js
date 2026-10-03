(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ScaGameSettings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const STORAGE_KEY = "starClusterGameSettingsV1";
  const FRAME_RATE_VALUES = Object.freeze(["auto", "60", "90", "120", "144", "165", "240"]);
  const QUALITY_VALUES = Object.freeze(["auto", "performance", "balanced", "high"]);
  const NETWORK_VALUES = Object.freeze(["low", "balanced", "stable"]);
  const DISPLAY_MODE_VALUES = Object.freeze(["windowed", "borderless-fullscreen"]);
  const WINDOW_SIZE_VALUES = Object.freeze(["current", "1280x720", "1440x900", "1600x900", "1920x1080"]);
  const DEFAULTS = Object.freeze({
    frameRate: "auto",
    quality: "auto",
    displayMode: "windowed",
    windowSize: "1440x900",
    showPerformance: true,
    networkBuffer: "balanced",
    screenShake: true,
    masterVolume: 0.7,
    musicVolume: 0.35,
    effectsVolume: 0.55
  });
  const QUALITY_PRESETS = Object.freeze({
    auto: Object.freeze({ pixelBudget: 3_200_000, maximumDpr: 1.25 }),
    performance: Object.freeze({ pixelBudget: 1_800_000, maximumDpr: 1 }),
    balanced: Object.freeze({ pixelBudget: 3_200_000, maximumDpr: 1.25 }),
    high: Object.freeze({ pixelBudget: 5_000_000, maximumDpr: 1.5 })
  });
  const NETWORK_PRESETS = Object.freeze({
    low: Object.freeze({ minimumDelayMs: 55, maximumDelayMs: 125, maximumExtrapolationMs: 60 }),
    balanced: Object.freeze({ minimumDelayMs: 80, maximumDelayMs: 180, maximumExtrapolationMs: 50 }),
    stable: Object.freeze({ minimumDelayMs: 120, maximumDelayMs: 240, maximumExtrapolationMs: 40 })
  });

  function inList(value, list, fallback) {
    const normalized = String(value || "");
    return list.includes(normalized) ? normalized : fallback;
  }

  function normalize(value) {
    const source = value && typeof value === "object" ? value : {};
    return Object.freeze({
      frameRate: inList(source.frameRate, FRAME_RATE_VALUES, DEFAULTS.frameRate),
      quality: inList(source.quality, QUALITY_VALUES, DEFAULTS.quality),
      displayMode: inList(source.displayMode, DISPLAY_MODE_VALUES, DEFAULTS.displayMode),
      windowSize: inList(source.windowSize, WINDOW_SIZE_VALUES, DEFAULTS.windowSize),
      showPerformance: source.showPerformance !== false,
      networkBuffer: inList(source.networkBuffer, NETWORK_VALUES, DEFAULTS.networkBuffer),
      screenShake: source.screenShake !== false,
      masterVolume: volume(source.masterVolume, DEFAULTS.masterVolume),
      musicVolume: volume(source.musicVolume, DEFAULTS.musicVolume),
      effectsVolume: volume(source.effectsVolume, DEFAULTS.effectsVolume)
    });
  }

  function volume(value, fallback) {
    return value != null && Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;
  }

  function storage() {
    try {
      return root.ScaStorage || root.localStorage || null;
    } catch {
      return null;
    }
  }

  function load() {
    try {
      const raw = storage()?.getItem(STORAGE_KEY);
      return normalize(raw ? JSON.parse(raw) : DEFAULTS);
    } catch {
      return normalize(DEFAULTS);
    }
  }

  function save(value) {
    const settings = normalize(value);
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // 无痕模式或禁用存储时仍允许本次会话继续。
    }
    try {
      root.dispatchEvent?.(new CustomEvent("sca-settings-change", { detail: settings }));
    } catch {
      // 非浏览器测试环境没有 CustomEvent。
    }
    return settings;
  }

  function displayRefresh(search) {
    const params = new URLSearchParams(search === undefined ? root.location?.search || "" : search);
    const value = Number(params.get("refresh"));
    return Math.min(240, Math.max(60, Number.isFinite(value) && value > 0 ? Math.round(value) : 60));
  }

  function targetFps(settings = load(), refresh = displayRefresh()) {
    const value = normalize(settings).frameRate;
    return value === "auto" ? Math.min(240, Math.max(60, Math.round(refresh))) : Number(value);
  }

  function qualityPreset(settings = load()) {
    return QUALITY_PRESETS[normalize(settings).quality];
  }

  function networkPreset(settings = load()) {
    return NETWORK_PRESETS[normalize(settings).networkBuffer];
  }

  return Object.freeze({
    STORAGE_KEY,
    DEFAULTS,
    FRAME_RATE_VALUES,
    QUALITY_VALUES,
    NETWORK_VALUES,
    DISPLAY_MODE_VALUES,
    WINDOW_SIZE_VALUES,
    QUALITY_PRESETS,
    NETWORK_PRESETS,
    normalize,
    load,
    save,
    displayRefresh,
    targetFps,
    qualityPreset,
    networkPreset
  });
});
