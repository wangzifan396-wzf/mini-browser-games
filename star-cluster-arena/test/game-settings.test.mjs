import test from "node:test";
import assert from "node:assert/strict";

await import("../frontend/js/game-settings.js");

const settings = globalThis.ScaGameSettings;

test("shared settings normalize untrusted persisted values", () => {
  assert.deepEqual(settings.normalize({
    frameRate: "999",
    quality: "cinematic",
    displayMode: "exclusive",
    windowSize: "8000x8000",
    networkBuffer: "zero",
    showPerformance: false,
    screenShake: false,
    masterVolume: 0.7,
    musicVolume: 0.35,
    effectsVolume: 0.55
  }), {
    frameRate: "auto",
    quality: "auto",
    displayMode: "windowed",
    windowSize: "1440x900",
    networkBuffer: "balanced",
    showPerformance: false,
    screenShake: false,
    masterVolume: 0.7,
    musicVolume: 0.35,
    effectsVolume: 0.55
  });
});

test("display modes and window sizes accept only supported desktop values", () => {
  assert.equal(settings.normalize({ displayMode: "borderless-fullscreen" }).displayMode, "borderless-fullscreen");
  assert.equal(settings.normalize({ windowSize: "1920x1080" }).windowSize, "1920x1080");
  assert.equal(settings.normalize({ displayMode: "fullscreen" }).displayMode, "windowed");
});

test("automatic and explicit frame-rate targets share the 240 FPS ceiling", () => {
  assert.equal(settings.targetFps({ frameRate: "auto" }, 160), 160);
  assert.equal(settings.targetFps({ frameRate: "240" }, 60), 240);
  assert.equal(settings.displayRefresh("?refresh=360"), 240);
  assert.equal(settings.displayRefresh("?refresh=144"), 144);
});

test("quality and network profiles expose bounded rendering and buffering budgets", () => {
  assert.deepEqual(settings.qualityPreset({ quality: "auto" }), { pixelBudget: 3_200_000, maximumDpr: 1.25 });
  assert.deepEqual(settings.qualityPreset({ quality: "performance" }), { pixelBudget: 1_800_000, maximumDpr: 1 });
  assert.deepEqual(settings.qualityPreset({ quality: "high" }), { pixelBudget: 5_000_000, maximumDpr: 1.5 });
  assert.deepEqual(settings.networkPreset({ networkBuffer: "low" }), { minimumDelayMs: 55, maximumDelayMs: 125, maximumExtrapolationMs: 60 });
  assert.deepEqual(settings.networkPreset({ networkBuffer: "stable" }), { minimumDelayMs: 120, maximumDelayMs: 240, maximumExtrapolationMs: 40 });
});
