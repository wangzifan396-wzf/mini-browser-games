import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const PROJECT_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SCRIPT_ORDER = [
  "frontend/js/safe-storage.js",
  "frontend/js/game-settings.js",
  "frontend/js/audio.js",
  "frontend/js/page-transition.js",
  "frontend/js/cosmetic-catalog.js",
  "frontend/js/cosmetic-renderer.js",
  "frontend/js/game-mode-catalog.js",
  "frontend/js/progression.js",
  "frontend/js/canonical-game-content.js",
  "frontend/js/gameplay-core.js",
  "frontend/js/game.js"
];

function loadScriptSources() {
  return SCRIPT_ORDER.map(relative => ({
    relative,
    source: readFileSync(join(PROJECT_ROOT, relative), "utf8")
  }));
}

const SCRIPT_SOURCES = loadScriptSources();

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function noOp() {}

function createClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    toggle(name, force) {
      const enabled = force === undefined ? !values.has(name) : Boolean(force);
      if (enabled) values.add(name);
      else values.delete(name);
      return enabled;
    },
    contains: name => values.has(name)
  };
}

function createDrawingContext() {
  const gradient = { addColorStop: noOp };
  const target = {
    canvas: null,
    measureText: value => ({ width: String(value ?? "").length * 8 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null
  };
  return new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      return noOp;
    },
    set(object, property, value) {
      object[property] = value;
      return true;
    }
  });
}

function createHeadlessDocument() {
  const elements = new Map();
  const makeElement = id => {
    if (elements.has(id)) return elements.get(id);
    const drawingContext = createDrawingContext();
    const formElements = new Proxy({}, { get: (_target, property) => makeElement(`${id}:form:${String(property)}`) });
    const style = { setProperty: noOp, removeProperty: noOp };
    const element = {
      id,
      style,
      dataset: {},
      classList: createClassList(),
      hidden: false,
      disabled: false,
      checked: false,
      value: "",
      textContent: "",
      innerHTML: "",
      width: id.toLowerCase().includes("canvas") ? 960 : 0,
      height: id.toLowerCase().includes("canvas") ? 640 : 0,
      elements: formElements,
      addEventListener: noOp,
      removeEventListener: noOp,
      appendChild: noOp,
      remove: noOp,
      removeAttribute: noOp,
      setAttribute: noOp,
      focus: noOp,
      click: noOp,
      requestSubmit: noOp,
      setPointerCapture: noOp,
      releasePointerCapture: noOp,
      closest: () => null,
      querySelector: selector => makeElement(`${id}:query:${selector}`),
      querySelectorAll: () => [],
      getContext: () => drawingContext,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 640 })
    };
    drawingContext.canvas = element;
    elements.set(id, element);
    return element;
  };
  const documentElement = makeElement("documentElement");
  return {
    documentElement,
    body: makeElement("body"),
    hidden: false,
    fullscreenElement: null,
    getElementById: id => makeElement(String(id)),
    querySelector: selector => makeElement(`document:query:${selector}`),
    querySelectorAll: () => [],
    createElement: tag => makeElement(`created:${tag}:${elements.size}`),
    addEventListener: noOp,
    removeEventListener: noOp,
    exitFullscreen: async () => {},
    __elements: elements
  };
}

function createStorage(initialStorage = {}) {
  const values = new Map(Object.entries(initialStorage));
  return {
    getItem: key => values.has(String(key)) ? values.get(String(key)) : null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key)),
    clear: () => values.clear()
  };
}

function createContext(seed, initialNow = 0, initialStorage = {}) {
  const document = createHeadlessDocument();
  const seededMath = Object.create(Math);
  seededMath.random = mulberry32(seed);
  const eventTarget = { addEventListener: noOp, removeEventListener: noOp };
  const clock = { now: Number(initialNow) || 0 };
  const context = {
    ...eventTarget,
    console,
    document,
    localStorage: createStorage(initialStorage),
    location: { protocol: "headless:", href: "headless://star-cluster/?debug", search: "?debug" },
    navigator: { userAgent: "StarClusterCanonicalHeadless", sendBeacon: null },
    performance: { now: () => clock.now },
    Math: seededMath,
    Date,
    URL,
    URLSearchParams,
    Blob,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Array,
    Object,
    Number,
    String,
    Boolean,
    JSON,
    RegExp,
    Error,
    TypeError,
    Promise,
    Uint8Array,
    Float32Array,
    structuredClone,
    innerWidth: 960,
    innerHeight: 640,
    devicePixelRatio: 1,
    requestAnimationFrame: noOp,
    cancelAnimationFrame: noOp,
    setTimeout: noOp,
    clearTimeout: noOp,
    setInterval: noOp,
    clearInterval: noOp,
    fetch: async () => ({ ok: true, json: async () => ({}) })
  };
  context.window = context;
  context.globalThis = context;
  return {
    clock,
    context: vm.createContext(context, { name: `star-cluster-canonical-${seed >>> 0}` })
  };
}

export function createCanonicalSingleRuntime({ seed = 1, now = 0, initialStorage = {} } = {}) {
  const headless = createContext(seed >>> 0, now, initialStorage);
  const { context } = headless;
  for (const script of SCRIPT_SOURCES) {
    vm.runInContext(script.source, context, { filename: join(PROJECT_ROOT, script.relative) });
  }
  const debug = context.__ballArenaDebug;
  if (!debug) throw new Error("Canonical single-player debug runtime failed to initialize");
  return Object.freeze({
    source: "frontend/js/game.js",
    startMode: mode => structuredClone(debug.startMode(mode)),
    progressSnapshot: () => structuredClone(debug.progressSnapshot()),
    startAuthorityMode: (mode, players) => structuredClone(debug.startAuthorityMode(mode, players)),
    configurePlayers: players => structuredClone(debug.configureAuthorityPlayers(players)),
    setInput: (playerId, input) => debug.setAuthorityInput(playerId, input),
    setConnected: (playerId, connected) => debug.setAuthorityConnected(playerId, connected),
    step: seconds => structuredClone(debug.step(seconds)),
    authorityStep: ticks => structuredClone(debug.authorityStep(ticks)),
    advance: ticks => structuredClone(debug.authorityAdvance(ticks)),
    authoritySnapshot: () => structuredClone(debug.authoritySnapshot()),
    ranking: () => structuredClone(debug.authorityRanking()),
    setGroupFixture: (id, values) => structuredClone(debug.setGroupFixture(id, values)),
    probeEjectedRules: (id, values) => structuredClone(debug.probeEjectedRules(id, values)),
    setSurvivors: ids => structuredClone(debug.setSurvivors(ids)),
    snapshot: () => structuredClone(debug.snapshot()),
    setPaused: paused => structuredClone(debug.setPaused(paused)),
    advanceWall: milliseconds => { headless.clock.now += milliseconds; return structuredClone(debug.renderFrame(headless.clock.now)); },
    triggerEvent: key => structuredClone(debug.triggerEvent(key)),
    virusHitPlayer: (mass, kind) => structuredClone(debug.virusHitPlayer(mass, kind)),
    virusHitRole: (role, mass, kind) => structuredClone(debug.authorityVirusHitRole(role, mass, kind)),
    forceTimeEnd: () => structuredClone(debug.forceTimeEnd()),
    close: noOp
  });
}

function entityDelta(previous, current, { updated = false } = {}) {
  const before = new Map((previous || []).map(item => [item.id, item]));
  const after = new Map((current || []).map(item => [item.id, item]));
  return {
    added: [...after.values()].filter(item => !before.has(item.id)),
    removed: [...before.keys()].filter(id => !after.has(id)),
    updated: updated ? [...after.values()].filter(item => before.has(item.id)) : []
  };
}

export const CANONICAL_AUTHORITY_CONSTANTS = Object.freeze({
  SERVER_HZ: 60,
  STEP_SECONDS: 1 / 60,
  NETWORK_SNAPSHOT_INTERVAL_TICKS: 3,
  SNAPSHOT_HZ: 20,
  FULL_FOOD_SNAPSHOT_INTERVAL_TICKS: 120,
  WORLD_SIZE: 7600,
  MAX_CELLS: 64
});

export class CanonicalSingleAuthority {
  constructor({ players = [], mode = "battle", seed = 1, now = 0 } = {}) {
    this.runtime = createCanonicalSingleRuntime({ seed, now });
    this.current = this.runtime.startAuthorityMode(mode, players);
    this.deltaBase = this.current;
    this.refreshPublicState();
  }

  get current() {
    if (!this.cachedSnapshot) this.cachedSnapshot = this.runtime.authoritySnapshot();
    return this.cachedSnapshot;
  }

  set current(value) {
    this.cachedSnapshot = value;
  }

  refreshPublicState() {
    this.tick = this.current.tick;
    this.serverTime = this.current.serverTime;
    this.finished = this.current.finished;
    this.finishReason = this.current.finishReason;
    this.winnerId = this.current.winnerId;
  }

  step() {
    const frame = this.runtime.advance(1);
    this.cachedSnapshot = null;
    this.tick = frame.tick;
    this.serverTime = frame.serverTime;
    this.finished = frame.finished;
    this.finishReason = frame.finishReason;
    this.winnerId = frame.winnerId;
    if (this.finished && !this.winnerId) this.winnerId = this.current.winnerId;
    return frame;
  }

  setInput(playerId, input) {
    return this.runtime.setInput(playerId, input);
  }

  setConnected(playerId, connected) {
    return this.runtime.setConnected(playerId, connected);
  }

  ranking() {
    return this.runtime.ranking();
  }

  finishMatch(reason = "finished", winnerId = null) {
    this.current = {
      ...this.current,
      phase: "finished",
      finished: true,
      finishReason: reason,
      winnerId: winnerId || this.current.winnerId || this.current.ranking?.[0]?.id || null
    };
    this.refreshPublicState();
  }

  snapshot({ foodMode = "full" } = {}) {
    const current = this.current;
    const { foods, viruses, ...dynamic } = current;
    const snapshot = structuredClone(dynamic);
    snapshot.foodRevision = current.tick;
    snapshot.virusRevision = current.tick;
    if (foodMode === "none") {
      delete snapshot.foods;
      delete snapshot.viruses;
      snapshot.foodBaseline = false;
      snapshot.virusBaseline = false;
      return snapshot;
    }
    if (foodMode === "delta") {
      const food = entityDelta(this.deltaBase.foods, foods);
      const virus = entityDelta(this.deltaBase.viruses, viruses, { updated: true });
      delete snapshot.foods;
      delete snapshot.viruses;
      snapshot.foodBaseline = false;
      snapshot.virusBaseline = false;
      snapshot.foodDelta = {
        fromRevision: this.deltaBase.tick,
        toRevision: this.current.tick,
        ...food
      };
      snapshot.virusDelta = {
        fromRevision: this.deltaBase.tick,
        toRevision: this.current.tick,
        ...virus
      };
      return snapshot;
    }
    snapshot.foods = structuredClone(foods);
    snapshot.viruses = structuredClone(viruses);
    snapshot.foodBaseline = true;
    snapshot.virusBaseline = true;
    return snapshot;
  }

  clearFoodDelta() {
    this.deltaBase = this.current;
  }
}
