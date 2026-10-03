import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/js/progression.js";
const progression = globalThis.ScaProgression;
test("single and network rewards share bounded match metrics", () => {
  assert.equal(progression.matchReward({ rank: 1, peakMass: 1200, kills: 2, forgeLevel: 1, multiplier: 1.16 }), Math.round((14 + 26 + 10 + 10 + 2) * 1.16));
  assert.equal(progression.matchReward({ rank: 99, peakMass: 0, kills: 0 }), 16);
  assert.equal(progression.matchReward({ demon: true, demonWin: true }) - progression.matchReward({ demon: true }), 95);
  assert.ok(Number.isFinite(progression.matchReward({ peakMass: Infinity, forgeLevel: Infinity, multiplier: Infinity })));
});
test("online rewards persist once per match and preserve cosmetics and perks", () => {
  const values = new Map([["ballArenaMeta", JSON.stringify({ dust: 150, totalDust: 150, forgeLevel: 1, unlockedSkins: ["dragon"], perks: { start: 3 } })]]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const reward = progression.grantLocalReward(storage, "match-1", { rank: 1, peakMass: 1200 });
  assert.ok(reward > 0); assert.equal(progression.grantLocalReward(storage, "match-1", {}), 0);
  const meta = JSON.parse(storage.getItem("ballArenaMeta"));
  assert.equal(meta.dust, 150 + reward); assert.equal(meta.perks.start, 3); assert.deepEqual(meta.unlockedSkins, ["dragon"]);
  assert.equal(progression.grantLocalReward({ getItem: () => "broken" }, "match-2", {}), 0);
});
