import test from "node:test";
import assert from "node:assert/strict";
import {
  MODE_KEYS,
  MULTIPLAYER_MODES,
  getModeConfig,
  normalizeBotCountForMode,
  normalizeMode,
  publicModeCatalog
} from "../backend/multiplayer/modes.mjs";

const EXPECTED_MODES = ["solo", "team", "survival", "battle", "blitz", "spore", "screen", "control", "giant", "demon"];

test("all ten LAN modes are registered in stable order", () => {
  assert.deepEqual(MODE_KEYS, EXPECTED_MODES);
  assert.deepEqual(Object.keys(MULTIPLAYER_MODES), EXPECTED_MODES);
  for (const key of MODE_KEYS) {
    const mode = getModeConfig(key);
    assert.equal(mode.key, key);
    assert.ok(mode.label);
    assert.ok(mode.description);
    assert.ok(Number.isFinite(mode.durationSeconds));
    assert.ok(mode.recommendedParticipants >= mode.minimumHumans);
  }
});

test("mode lookup normalizes trusted input and falls back to solo", () => {
  assert.equal(normalizeMode(" SCREEN "), "screen");
  assert.equal(normalizeMode("not-a-mode"), "solo");
  assert.equal(getModeConfig("CONTROL"), MULTIPLAYER_MODES.control);
});

test("mode configs and the public catalog are deeply immutable", () => {
  const battle = getModeConfig("battle");
  assert.ok(Object.isFrozen(battle));
  assert.ok(Object.isFrozen(battle.safeZone));
  assert.throws(() => { battle.safeZone.static = true; }, TypeError);

  const catalog = publicModeCatalog();
  assert.equal(catalog.length, 10);
  assert.ok(Object.isFrozen(catalog));
  assert.ok(Object.isFrozen(catalog[0]));
  assert.deepEqual(catalog.map(mode => mode.key), EXPECTED_MODES);
});

test("mode bot constraints preserve normal rooms and protect demon roles", () => {
  assert.equal(normalizeBotCountForMode("solo", -3), 0);
  assert.equal(normalizeBotCountForMode("solo", 99), 12);
  assert.equal(normalizeBotCountForMode("demon", 0), 4);
  assert.equal(getModeConfig("demon").demon.minimumBots, 4);
});
