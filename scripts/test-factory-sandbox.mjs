import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../tiny-factory.html', import.meta.url));
function boot(options = {}) {
  const elements = new Map(), listeners = new Map(), intervals = new Map();
  const store = new Map(options.store || []);
  let intervalId = 0;
  function element() {
    let markup = '';
    const classes = new Set(['hidden']);
    const node = {
      style: { setProperty() {} }, dataset: {}, children: [], value: '', textContent: '',
      classList: { add: s => classes.add(s), remove: s => classes.delete(s), contains: s => classes.has(s), toggle(s, force) { if (force ?? !classes.has(s)) classes.add(s); else classes.delete(s); } },
      append(child) { this.children.push(child); }, insertAdjacentHTML() { this.children.push(element()); },
      querySelectorAll: () => [], setAttribute() {}, addEventListener() {}, remove() {}, select() {},
    };
    Object.defineProperty(node, 'innerHTML', { get: () => markup, set(value) { markup = value; node.children = []; } });
    return node;
  }
  function listen(type, handler) { const list = listeners.get(type) || []; list.push(handler); listeners.set(type, list); }
  const context = {
    console, Math, Date, JSON, Set, Map, Uint8Array, TextEncoder, TextDecoder, structuredClone,
    escape, unescape, encodeURIComponent, decodeURIComponent,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    setTimeout() {}, clearTimeout() {},
    setInterval(fn) { intervals.set(++intervalId, fn); return intervalId; }, clearInterval(id) { intervals.delete(id); },
    confirm: () => true,
    navigator: { clipboard: { writeText: async () => {} } },
    localStorage: { getItem(k) { if (options.storageError) throw new Error('blocked'); return store.get(k) ?? null; }, setItem(k, v) { if (options.storageError) throw new Error('blocked'); store.set(k, v); } },
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, querySelectorAll: () => [], createElement: element, addEventListener: listen, body: element(), hidden: false },
    addEventListener: listen,
  };
  context.window = context;
  vm.createContext(context);
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) vm.runInContext(match[1], context, { filename: file, timeout: 10_000 });
  return { api: context.__factorySandbox, old: context.__tinyFactory, context, elements, intervals, emit(type) { for (const handler of listeners.get(type) || []) handler({}); } };
}
function blank(api, research = []) { const state = api.fresh(123456); state.layout = {}; state.sim = null; state.credits = 10000; state.research = research; return api.sanitize(state); }
const json = value => JSON.parse(JSON.stringify(value));
function put(api, state, x, y, type, dir = 0, filter = 'plate') { assert.equal(api.build(state, x, y, type, dir, filter).ok, true); }

test('all 12 legacy reference contracts remain three-star with the shared simulator', () => {
  const { old } = boot(); const result = old.validateContent();
  assert.equal(result.valid, true); assert.equal(result.contracts, 12);
  assert.ok(result.references.every(row => row.stars === 3));
  assert.match(old.encode(), /^FACTORY2\./); assert.equal(old.decode(old.encode()).v, 2);
});
test('seeded terrain is deterministic and the four starter veins exist', () => {
  const { api } = boot(); assert.deepEqual(json(api.world(42)), json(api.world(42)));
  assert.notDeepEqual(json(api.world(42)), json(api.world(43)));
  assert.equal(api.world(42)['1,3'], 'ore'); assert.equal(api.world(42)['1,5'], 'coal');
  assert.equal(api.world(42)['1,8'], 'copper'); assert.equal(api.world(42)['8,10'], 'stone');
});
test('starter factory produces indefinitely and pays only new deliveries', () => {
  const { api } = boot(); const state = api.fresh(42), start = state.credits;
  api.step(state, 160); assert.ok(state.sold.plate > 20); assert.equal(state.sim.complete, false);
  assert.equal(state.credits, start + state.sold.plate * api.PRICES.plate);
  const paid = state.sold.plate, credits = state.credits;
  api.step(state, 160); assert.ok(state.sold.plate > paid);
  assert.equal(state.credits - credits, (state.sold.plate - paid) * api.PRICES.plate);
});
test('miner placement, occupied cells, boundaries, tech and costs are enforced', () => {
  const { api } = boot(); const state = blank(api);
  assert.equal(api.build(state, 0, 0, 'miner').ok, Boolean(api.world(state.seed)['0,0']));
  assert.equal(api.build(state, 24, 0, 'belt').ok, false);
  assert.equal(api.build(state, 1.5, 2, 'belt').ok, false);
  assert.equal(api.build(state, 3, 2, 'drone').ok, false);
  assert.equal(api.build(state, 3, 2, '__proto__').ok, false);
  put(api, state, 2, 2, 'belt'); assert.equal(api.build(state, 2, 2, 'belt').ok, false);
  state.credits = 0; assert.equal(api.build(state, 2, 3, 'furnace').ok, false);
});
test('empty/no-depot worksites do not complete or stop ticking', () => {
  const { api } = boot(); const state = blank(api); api.step(state, 10);
  assert.equal(state.sim.tick, 10); assert.equal(state.sim.complete, false);
  put(api, state, 1, 3, 'miner'); api.step(state, 20);
  assert.equal(state.sim.tick, 30); assert.equal(state.sim.devices['1,3'].out.length, 4);
  assert.ok(api.diagnostics(state).blocked > 0);
});
test('items advance at most one tile per transaction and queues do not overflow', () => {
  const { api } = boot(); const state = blank(api);
  put(api, state, 1, 1, 'belt'); put(api, state, 2, 1, 'belt'); put(api, state, 3, 1, 'depot');
  state.sim.tiles['1,1'].item = 'plate'; api.step(state);
  assert.equal(state.sim.tiles['2,1'].item, 'plate'); assert.equal(state.sold.plate || 0, 0);
  api.step(state); assert.equal(state.sold.plate, 1);
  put(api, state, 5, 5, 'buffer'); state.sim.tiles['5,5'].queue = Array(6).fill('plate');
  put(api, state, 4, 5, 'belt'); state.sim.tiles['4,5'].item = 'plate'; api.step(state);
  assert.equal(state.sim.tiles['5,5'].queue.length, 6); assert.equal(state.sim.tiles['4,5'].item, 'plate');
});
test('filtered cargo goes straight and nonmatching cargo turns right', () => {
  const { api } = boot(); const state = blank(api, ['logistics']);
  put(api, state, 2, 2, 'filter', 0, 'plate'); put(api, state, 3, 2, 'belt'); put(api, state, 4, 2, 'depot');
  put(api, state, 2, 3, 'belt', 1); put(api, state, 2, 4, 'depot');
  state.sim.tiles['2,2'].item = 'plate'; api.step(state, 2);
  assert.equal(state.sim.devices['4,2'].delivered.plate, 1);
  state.sim.tiles['2,2'].item = 'coal'; api.step(state, 2);
  assert.equal(state.sim.devices['2,4'].delivered.coal, 1);
});
test('splitters alternate output without cloning cargo', () => {
  const { api } = boot(); const state = blank(api, ['logistics']);
  put(api, state, 2, 2, 'splitter'); put(api, state, 3, 2, 'depot'); put(api, state, 2, 3, 'depot');
  for (let i = 0; i < 10; i++) { state.sim.tiles['2,2'].item = 'plate'; api.step(state); }
  assert.equal(state.sim.devices['3,2'].delivered.plate, 5); assert.equal(state.sim.devices['2,3'].delivered.plate, 5);
  assert.equal(state.sold.plate, 10);
});
test('a blocked splitter branch cannot starve its open branch', () => {
  const { api } = boot(); const state = blank(api, ['logistics']);
  put(api, state, 2, 2, 'splitter'); put(api, state, 3, 2, 'depot'); put(api, state, 2, 3, 'buffer');
  state.sim.tiles['2,3'].queue = Array(6).fill('plate');
  for (let i = 0; i < 20; i++) { state.sim.tiles['2,2'].item = 'plate'; api.step(state); }
  assert.equal(state.sim.devices['3,2'].delivered.plate, 20); assert.equal(state.sim.tiles['2,3'].queue.length, 6);
});
test('production requires every input, respects recipe time, and consumes once', () => {
  const { api } = boot(); const state = blank(api);
  put(api, state, 2, 2, 'furnace'); put(api, state, 3, 2, 'depot');
  state.sim.devices['2,2'].buffer = ['ore']; api.step(state, 10); assert.equal(state.sold.plate || 0, 0);
  state.sim.devices['2,2'].buffer.push('coal'); api.step(state, 3); assert.equal(state.sold.plate || 0, 0);
  api.step(state); assert.equal(state.sold.plate, 1); assert.equal(state.sim.devices['2,2'].buffer.length, 0);
});
test('blocked production holds finished progress and resumes without loss or duplicates', () => {
  const { api } = boot(); const state = blank(api); put(api, state, 2, 2, 'furnace');
  state.sim.devices['2,2'].buffer = ['ore', 'coal', 'ore', 'coal', 'ore', 'coal']; api.step(state, 100);
  assert.equal(state.sim.devices['2,2'].out.length, 2); assert.equal(state.sim.devices['2,2'].progress, 3);
  const restored = api.decode(api.encode(state)); put(api, state, 3, 2, 'depot'); put(api, restored, 3, 2, 'depot');
  api.step(state, 10); api.step(restored, 10); assert.equal(state.sold.plate, 3); assert.equal(restored.sold.plate, 3);
});
test('research is gated and repeated research cannot debit resources twice', () => {
  const { api } = boot(); const state = blank(api);
  assert.equal(api.research(state, 'electronics').ok, false);
  assert.equal(api.research(state, 'mechanics').ok, true); assert.equal(api.research(state, 'electronics').ok, false);
  state.sold.gear = 5; assert.equal(api.research(state, 'electronics').ok, true);
  state.science = 15; assert.equal(api.research(state, 'expansion').ok, true);
  assert.equal(state.width, 24); assert.equal(state.height, 18); const credits = state.credits;
  assert.equal(api.research(state, 'expansion').ok, false); assert.equal(state.credits, credits);
  put(api, state, 23, 17, 'belt');
});
test('rotation and unrelated construction retain active production and cargo', () => {
  const { api } = boot(); const state = api.fresh(42); api.step(state, 31);
  const before = json(state.sim.devices['3,3']); put(api, state, 10, 10, 'belt');
  assert.deepEqual(json(state.sim.devices['3,3']), before);
  const tile = state.sim.tiles['2,3'], item = tile.item; api.rotate(state, 2, 3);
  assert.equal(state.sim.tiles['2,3'].item, item); assert.equal(state.layout['2,3'].dir, 1);
});
test('demolition refunds once and cannot duplicate machine inputs or finished stock', () => {
  const { api } = boot(); const state = blank(api); put(api, state, 2, 2, 'furnace');
  state.sim.devices['2,2'].buffer = ['ore', 'coal']; state.sim.devices['2,2'].out = ['plate'];
  const before = state.credits; assert.equal(api.demolish(state, 2, 2).ok, true);
  assert.equal(state.credits - before, 64 + 1 + 1 + 5); const after = state.credits;
  assert.equal(api.demolish(state, 2, 2).ok, false); assert.equal(state.credits, after);
});
test('savecode roundtrip resumes in-flight production without replaying revenue', () => {
  const { api } = boot(); const left = api.fresh(987); api.step(left, 103);
  const right = api.decode(api.encode(left));
  assert.equal(right.sim.tick, left.sim.tick); assert.deepEqual(json(right.layout), json(left.layout));
  api.step(left, 90); api.step(right, 90);
  assert.equal(right.credits, left.credits); assert.deepEqual(json(right.sold), json(api.sanitize(left).sold));
  assert.deepEqual(json(right.sim.devices['3,3'].buffer), json(left.sim.devices['3,3'].buffer));
});
test('science delivery creates research points, not cash', () => {
  const { api } = boot(); const state = blank(api);
  put(api, state, 1, 1, 'belt'); put(api, state, 2, 1, 'depot');
  state.sim.tiles['1,1'].item = 'science'; const cash = state.credits; api.step(state);
  assert.equal(state.science, 1); assert.equal(state.credits, cash); assert.equal(state.sold.science, 1);
});
test('corrupt archives reject cleanly; imported values, inventory and tile types are bounded', () => {
  const { api } = boot(); assert.throws(() => api.decode('FACTORYFREE1.bad.bad'));
  const raw = api.fresh(42); raw.credits = -1; raw.science = 'Infinity'; raw.layout['0,0'] = { type: '__proto__', dir: 99 };
  raw.sim.devices['1,3'].out = Array(100).fill('drone'); raw.sim.devices['3,3'].buffer = Array(100).fill('coal');
  const clean = api.sanitize(raw); assert.equal(clean.credits, 0); assert.equal(clean.science, 0);
  assert.equal(clean.layout['0,0'], undefined); assert.equal(clean.sim.devices['1,3'].out.length, 0);
  assert.equal(clean.sim.devices['3,3'].buffer.length, 10);
});
test('both blocked localStorage and malformed legacy progress cannot crash startup', () => {
  const blocked = boot({ storageError: true }); assert.equal(blocked.api.save(), false);
  const malformed = boot({ store: [['tinyFactoryContractsV2', JSON.stringify({ v: 2, profile: { stars: [999], unlocked: -99 }, q: { contract: 1000 } })]] });
  assert.equal(malformed.old.profile().unlocked, 1); assert.equal(malformed.old.profile().stars[0], 3);
});
test('losing focus or hiding the tab stops the timer without offline income', () => {
  const game = boot(); game.elements.get('sbRunBtn').onclick(); assert.equal(game.intervals.size, 1);
  const tick = game.api.state().sim.tick; game.emit('blur'); assert.equal(game.intervals.size, 0);
  assert.equal(game.api.state().sim.tick, tick);
  game.elements.get('sbRunBtn').onclick(); game.context.document.hidden = true; game.emit('visibilitychange');
  assert.equal(game.intervals.size, 0);
});
test('facility inspector explains missing fuel, blocked outputs and research opportunity cost', () => {
  const { api } = boot(); const state = blank(api, ['mechanics', 'electronics']);
  put(api, state, 2, 2, 'furnace'); state.sim.devices['2,2'].buffer = ['ore'];
  assert.match(api.inspect(state, '2,2'), /缺料：煤×1/);
  state.sim.devices['2,2'].out = ['plate', 'plate']; assert.match(api.inspect(state, '2,2'), /成品口满/);
  put(api, state, 4, 4, 'science'); assert.match(api.inspect(state, '4,4'), /15资金/);
  assert.match(api.guide(state), /启动预铺/); state.sold.plate = 1; assert.match(api.guide(state), /齿轮厂/);
});
test('clicking an existing facility inspects it without accidentally changing the route', () => {
  const game = boot(), before = game.api.state().layout['3,3'].dir;
  const cell = game.elements.get('sbGrid').children.find(node => node.dataset.cell === '3,3');
  cell.onclick(); assert.equal(game.api.state().layout['3,3'].dir, before);
  assert.match(game.elements.get('sbInspector').textContent, /铁炉/);
  game.elements.get('sbInspectRotate').onclick(); assert.equal(game.api.state().layout['3,3'].dir, (before + 1) % 4);
});
test('custom throughput target is measured from actual deliveries over a full window', () => {
  const { api } = boot(); const state = api.fresh(42);
  assert.equal(api.setGoal(state, 'plate', 10).ok, true);
  assert.equal(api.setGoal(state, 'plate', Infinity).ok, false);
  api.step(state, 250); const stats = api.diagnostics(state);
  assert.ok(stats.observedTicks >= 100); assert.ok(stats.rates.plate >= 20);
  assert.ok(state.bestRates.plate >= 20);
  const copy = api.decode(api.encode(state)); assert.equal(copy.goal.item, 'plate'); assert.equal(copy.goal.per100, 10);
  assert.equal(copy.bestRates.plate, state.bestRates.plate);
});
test('starting money and real production can reach electronics, expansion and drones without injected materials', () => {
  const { api } = boot(); const state = api.fresh(42);
  const funds = amount => { for (let i = 0; state.credits < amount && i < 40; i++) api.step(state, 100); assert.ok(state.credits >= amount); };
  assert.equal(api.research(state, 'mechanics').ok, true);
  assert.equal(api.demolish(state, 5, 3).ok, true);
  put(api, state, 5, 3, 'belt'); put(api, state, 6, 3, 'gear'); put(api, state, 7, 3, 'belt'); put(api, state, 8, 3, 'depot');
  api.step(state, 200); assert.ok(state.sold.gear >= 5); funds(400);
  assert.equal(api.research(state, 'logistics').ok, true); assert.equal(api.research(state, 'electronics').ok, true); funds(1000);
  // One coal mine is split between both furnaces. Plate output is split between gear income and the circuit chain.
  api.demolish(state, 2, 5); put(api, state, 2, 5, 'splitter');
  put(api, state, 2, 6, 'belt', 1); put(api, state, 2, 7, 'belt'); put(api, state, 3, 7, 'belt', 1);
  put(api, state, 1, 8, 'miner'); put(api, state, 2, 8, 'belt'); put(api, state, 3, 8, 'copperFurnace');
  for (let x = 4; x <= 9; x++) put(api, state, x, 8, 'belt', x === 9 ? 3 : 0);
  api.demolish(state, 5, 3); put(api, state, 5, 3, 'splitter');
  put(api, state, 5, 4, 'belt', 1); put(api, state, 5, 5, 'belt', 1); put(api, state, 5, 6, 'belt');
  for (let x = 6; x <= 8; x++) put(api, state, x, 6, 'belt', x === 8 ? 1 : 0);
  put(api, state, 8, 7, 'belt'); put(api, state, 9, 7, 'circuit');
  put(api, state, 10, 7, 'belt'); put(api, state, 11, 7, 'science'); put(api, state, 12, 7, 'belt'); put(api, state, 13, 7, 'depot');
  api.step(state, 1200); assert.ok(state.sold.science >= 35, JSON.stringify({sold:state.sold,devices:state.sim.devices,diagnostics:api.diagnostics(state)})); funds(1100);
  assert.equal(api.research(state, 'expansion').ok, true); assert.equal(api.research(state, 'engineering').ok, true);
  // Route some gears north and some circuits around the research chain; keep both revenue and science outputs.
  api.demolish(state, 7, 3); put(api, state, 7, 3, 'splitter', 3); put(api, state, 7, 2, 'belt', 3);
  for (let x = 7; x <= 13; x++) put(api, state, x, 1, 'belt');
  put(api, state, 14, 1, 'engine'); put(api, state, 15, 1, 'belt'); put(api, state, 16, 1, 'depot');
  api.demolish(state, 10, 7); put(api, state, 10, 7, 'splitter', 3);
  for (let y = 6; y >= 2; y--) put(api, state, 10, y, 'belt', y === 2 ? 0 : 3);
  for (let x = 11; x <= 14; x++) put(api, state, x, 2, 'belt', x === 14 ? 3 : 0);
  api.step(state, 2000); assert.ok(state.sold.engine > 2); assert.ok(state.science >= 20);
  funds(1300);
  for (let i = 0; state.science < 60 && i < 40; i++) api.step(state, 100);
  assert.equal(api.research(state, 'automation').ok, true);
  api.demolish(state, 13, 2); put(api, state, 13, 2, 'splitter');
  for (let x = 13; x <= 17; x++) put(api, state, x, 3, 'belt', x === 17 ? 3 : 0);
  put(api, state, 17, 2, 'belt', 3); api.demolish(state, 16, 1); put(api, state, 16, 1, 'belt');
  put(api, state, 17, 1, 'drone'); put(api, state, 18, 1, 'belt'); put(api, state, 19, 1, 'depot');
  api.step(state, 3000); assert.ok(state.sold.drone >= 5); assert.ok(state.sold.gear >= 50);
  assert.ok(state.credits >= 0); assert.equal(state.sim.wrong, 0);
});
test('every advertised processing facility executes its actual recipe twice, including composite materials', () => {
  const { api } = boot();
  for (const [type, tool] of Object.entries(api.TOOLS).filter(([, data]) => data.recipe)) {
    const state = blank(api, Object.keys(api.RESEARCH)), recipe = api.recipes[tool.recipe];
    put(api, state, 2, 2, type); put(api, state, 3, 2, 'depot');
    state.sim.devices['2,2'].buffer = Object.entries(recipe.inputs).flatMap(([id, n]) => Array(n * 2).fill(id));
    const before = state.credits; api.step(state, recipe.time * 3 + 4);
    assert.equal(state.sold[recipe.out], 2, `${type} must process its actual inputs`);
    assert.equal(state.credits - before, 2 * api.PRICES[recipe.out]);
    if (recipe.out === 'science') assert.equal(state.science, 2);
  }
});
