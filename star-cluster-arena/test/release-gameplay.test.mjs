import test from "node:test";
import assert from "node:assert/strict";
import { createCanonicalSingleRuntime, CanonicalSingleAuthority } from "../backend/multiplayer/canonical-single-runtime.mjs";
import "../frontend/js/gameplay-core.js";

test("starting and replaying a match always removes the title and lobby overlays", () => {
  const runtime = createCanonicalSingleRuntime({ seed: 23 });
  assert.equal(runtime.snapshot().titleVisible, true);
  for (const mode of ["solo", "blitz", "team"]) {
    runtime.startMode(mode);
    const state = runtime.snapshot();
    assert.equal(state.menu, false);
    assert.equal(state.titleVisible, false);
    assert.equal(state.lobbyVisible, false);
  }
});

test("paused single-player time excludes real-world pause duration", () => {
  const runtime = createCanonicalSingleRuntime({ seed: 23, now: 1000 });
  runtime.startMode("blitz");
  const before = runtime.authoritySnapshot();
  runtime.setPaused(true);
  const paused = runtime.advanceWall(30_000);
  assert.equal(paused.serverTime, before.serverTime);
  assert.equal(paused.remaining, before.remaining);
  runtime.setPaused(false);
  const resumed = runtime.advanceWall(17);
  assert.ok(resumed.serverTime - before.serverTime < 20);
  assert.ok(resumed.remaining > before.remaining - 0.1);
});

test("all human participants receive the same mode start mass", () => {
  for (const mode of ["solo", "team", "survival", "battle", "blitz", "spore", "screen", "control", "giant", "demon"]) {
    const runtime = createCanonicalSingleRuntime({ seed: 21 });
    const initial = runtime.startAuthorityMode(mode, [{ id: "a" }, { id: "b" }, { id: "c" }]);
    const humans = initial.groups.filter(group => ["a", "b", "c"].includes(group.id));
    assert.equal(humans.length, 3);
    for (const group of humans) assert.equal(group.mass, humans[0].mass, mode);
  }
});

test("lifecycle protection is an explicit bounded debug fixture, not a normal spawn buff", () => {
  const runtime = createCanonicalSingleRuntime({ seed: 21 });
  const initial = runtime.startAuthorityMode("battle", [{ id: "host" }, { id: "guest" }]);
  assert.equal(initial.groups.find(group => group.id === "guest").invincibleRemaining, 0);
  const protectedState = runtime.setGroupFixture("guest", { invincibleSeconds: 5 });
  assert.equal(protectedState.groups.find(group => group.id === "guest").invincibleRemaining, 5);
  assert.equal(protectedState.groups.find(group => group.id === "host").invincibleRemaining, 0);
  const cleared = runtime.setGroupFixture("guest", { invincibleSeconds: -1 });
  assert.equal(cleared.groups.find(group => group.id === "guest").invincibleRemaining, 0);
});

test("duplicate input sequences never execute a one-shot action twice", () => {
  const runtime = createCanonicalSingleRuntime({ seed: 8 });
  const start = runtime.startAuthorityMode("screen", [{ id: "a" }]);
  const cell = start.groups[0].cells[0];
  const command = { seq: 1, split: true, targetX: cell.x + 800, targetY: cell.y };
  assert.equal(runtime.setInput("a", command), true);
  runtime.advance(1);
  assert.equal(runtime.setInput("a", command), false);
  const next = runtime.authorityStep(1);
  assert.equal(next.groups[0].cells.length, 2);
});

test("authority rule ticks defer large snapshot exports until needed", () => {
  const simulation = new CanonicalSingleAuthority({ mode: "solo", players: [{ id: "a" }], seed: 42 });
  for (let i = 0; i < 2; i++) {
    simulation.step();
    assert.equal(simulation.cachedSnapshot, null);
  }
  const snapshot = simulation.snapshot();
  assert.equal(snapshot.tick, 2);
  assert.ok(snapshot.foods.length > 2000);
  assert.equal(simulation.snapshot().serverTime, snapshot.serverTime);
});

test("the last surviving guest wins battle even after the first human is eliminated", () => {
  const runtime = createCanonicalSingleRuntime({ seed: 19 });
  runtime.startAuthorityMode("battle", [{ id: "host" }, { id: "guest" }]);
  runtime.setSurvivors(["guest"]);
  const result = runtime.authorityStep(1);
  assert.equal(result.finished, true);
  assert.equal(result.winnerId, "guest");
  assert.equal(result.finishReason, "成功吃鸡");
});

test("a surviving guest settles life mode; no survivors produce no invented winner", () => {
  for (const mode of ["survival", "battle"]) {
    const runtime = createCanonicalSingleRuntime({ seed: 19 });
    runtime.startAuthorityMode(mode, [{ id: "host" }, { id: "guest" }]);
    runtime.setSurvivors(["guest"]);
    assert.equal(runtime.authorityStep(1).winnerId, "guest");
    const empty = createCanonicalSingleRuntime({ seed: 20 });
    empty.startAuthorityMode(mode, [{ id: "host" }, { id: "guest" }]);
    empty.setSurvivors([]);
    assert.equal(empty.authorityStep(1).finished, true);
    assert.equal(empty.authoritySnapshot().winnerId, null);
  }
});

test("respawning matches do not end just because everybody else is temporarily dead", () => {
  for (const mode of ["solo", "team", "blitz", "spore", "screen", "control", "giant"]) {
    const runtime = createCanonicalSingleRuntime({ seed: 19 });
    runtime.startAuthorityMode(mode, [{ id: "host" }, { id: "guest" }]);
    runtime.setSurvivors(["host"]);
    assert.equal(runtime.authorityStep(1).finished, false, mode);
  }
});

test("shared camera frames separated split cells rather than only their largest body", () => {
  const core = globalThis.ScaGameplayCore;
  const camera = { x: 2000, y: 2000, zoom: 1 };
  const cells = [{ x: 1200, y: 2000, mass: 900, radius: 120 }, { x: 2800, y: 2000, mass: 900, radius: 120 }];
  const next = core.cameraStep(camera, cells, { width: 1280, height: 720, dt: 1 / 60, config: {} });
  assert.ok(next.zoom < camera.zoom);
  assert.ok(next.viewPressure > 0);
  assert.equal(next.x, 2000);
  assert.ok(Number.isFinite(next.spreadRatio));
});

test("four demon humans occupy heroes only, with all original bosses and minions preserved", () => {
  const runtime = createCanonicalSingleRuntime({ seed: 30 });
  const snapshot = runtime.startAuthorityMode("demon", ["a", "b", "c", "d"].map(id => ({ id })));
  assert.equal(snapshot.groups.filter(group => group.human).length, 4);
  assert.ok(snapshot.groups.filter(group => group.human).every(group => group.role === "player" && group.team === 0));
  assert.ok(snapshot.groups.some(group => group.role === "boss" && !group.human));
  assert.throws(() => runtime.startAuthorityMode("demon", ["a", "b", "c", "d", "e"].map(id => ({ id }))));
});

test("resonance upgrades survive reload at their declared twenty-level cap", () => {
  const runtime = createCanonicalSingleRuntime({ initialStorage: { ballArenaMeta: JSON.stringify({ metaVersion: 4, dust: 3000, perks: { resonance: 20, start: 999 }, unlockedSkins: "broken", crafted: 1e20, totalDust: "invalid" }) } });
  const profile = runtime.progressSnapshot();
  assert.equal(profile.perks.resonance, 20);
  assert.equal(profile.perks.start, 10);
  assert.equal(profile.dust, 3000);
  assert.equal(profile.crafted, 1_000_000);
  assert.equal(profile.totalDust, 3000);
  assert.ok(profile.unlockedSkins.includes("aqua"));
});

test("demon timeout awards the demons even when the heroes have greater mass", () => {
  const runtime = createCanonicalSingleRuntime({ seed: 51 });
  runtime.startAuthorityMode("demon", [{ id: "hero" }]);
  runtime.setGroupFixture("hero", { mass: 100_000 });
  runtime.forceTimeEnd();
  const result = runtime.authoritySnapshot();
  assert.equal(result.finishReason, "讨伐失败");
  assert.equal(result.groups.find(group => group.id === result.winnerId).team, 1);
});

test("demon defeat awards heroes even when no hero is currently alive", () => {
  const runtime = createCanonicalSingleRuntime({ seed: 52 });
  runtime.startAuthorityMode("demon", [{ id: "hero" }]);
  runtime.setSurvivors([]);
  const result = runtime.authorityStep(1);
  assert.equal(result.finishReason, "魔王讨伐");
  assert.equal(result.groups.find(group => group.id === result.winnerId).team, 0);
});

test("exhausted life-mode players are eliminated, not endlessly waiting to respawn", () => {
  const runtime = createCanonicalSingleRuntime({ seed: 53 });
  runtime.startAuthorityMode("survival", [{ id: "host" }, { id: "guest" }]);
  runtime.setGroupFixture("host", { kills: 100 });
  const result = runtime.setSurvivors(["guest", "bot-1"]);
  assert.equal(result.groups.find(group => group.id === "host").eliminated, true);
  const order = runtime.ranking().map(group => group.id);
  assert.ok(order.indexOf("host") > order.indexOf("guest"));
  runtime.forceTimeEnd();
  assert.notEqual(runtime.authoritySnapshot().winnerId, "host");
});

test("control selects the team that actually triggered the score threshold", () => {
  const runtime = createCanonicalSingleRuntime({ seed: 54 });
  const start = runtime.startAuthorityMode("control", [{ id: "host" }, { id: "guest" }]);
  const other = start.groups.find(group => group.team === 1);
  runtime.setGroupFixture("host", { teamScore: 240 });
  runtime.setGroupFixture(other.id, { teamScore: 300 });
  const result = runtime.authorityStep(1);
  assert.equal(result.groups.find(group => group.id === result.winnerId).team, 0);
});

test("guest spores use the same human pickup window and lifetime as host spores", () => {
  const runtime = createCanonicalSingleRuntime({ seed: 55 });
  runtime.startAuthorityMode("solo", [{ id: "host" }, { id: "guest" }]);
  for (const id of ["host", "guest"]) {
    assert.equal(runtime.probeEjectedRules(id, { ageSeconds: 0.3 }).remaining, 1);
    assert.equal(runtime.probeEjectedRules(id, { ageSeconds: 0.35 }).remaining, 0);
    assert.equal(runtime.probeEjectedRules(id, { ageSeconds: 0.35, eaterId: "bot-2" }).remaining, 1);
    assert.equal(runtime.probeEjectedRules(id, { ageSeconds: 0.45, eaterId: "bot-2" }).remaining, 0);
    assert.equal(runtime.probeEjectedRules(id, { ageSeconds: 25, lifetime: true }).remaining, 1);
    assert.equal(runtime.probeEjectedRules(id, { ageSeconds: 31, lifetime: true }).remaining, 0);
  }
});

test("reconnection does not replay one-shot actions queued before disconnection", () => {
  const runtime = createCanonicalSingleRuntime({ seed: 56 });
  runtime.startAuthorityMode("screen", [{ id: "host" }, { id: "guest" }]);
  runtime.setInput("guest", { seq: 1, split: true, special: true, eject: true });
  runtime.setConnected("guest", false);
  runtime.setConnected("guest", true);
  const guest = runtime.authorityStep(1).groups.find(group => group.id === "guest");
  assert.equal(guest.cells.length, 1);
  assert.equal(guest.specialCooldown, 0);
  runtime.setConnected("host", false);
  const disconnected = runtime.authorityStep(30).groups.find(group => group.id === "host");
  assert.equal(disconnected.connected, false);
  assert.equal(disconnected.human, true);
  assert.ok(disconnected.cells.every(cell => [cell.x, cell.y, cell.mass].every(Number.isFinite)));
});
