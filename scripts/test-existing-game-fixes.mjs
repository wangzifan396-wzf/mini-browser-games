import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

// UI is verified separately in a real browser. These fixtures run the original
// closure functions: no second implementation of combat or survival rules.
function fixture(file, marker, expose, saved = null, blockedStorage = false) {
  const html = readFileSync(root + file, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  const source = scripts.find(m => m[1].includes(marker))?.[1];
  assert.ok(source, `${file}: rule script found`);
  const nodes = new Map();
  function element() {
    const node = {children: [], style: {}, dataset: {}, value: '', textContent: '', disabled: false,
      classList: {add() {}, remove() {}, toggle() {}},
      append(child) {this.children.push(child);}, appendChild(child) {this.append(child);},
      insertAdjacentHTML() {this.children.push(element());},
      addEventListener() {}, setAttribute() {}, select() {}, focus() {},
      getBoundingClientRect() {return {width: 100, height: 100, left: 0, top: 0};}};
    Object.defineProperty(node, 'innerHTML', {get() {return this.html || '';}, set(v) {this.html = v; this.children = [];}});
    return node;
  }
  const document = {hidden: false,
    getElementById(id) {if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id);},
    querySelector() {return null;}, querySelectorAll() {return [];}, createElement: element,
    addEventListener() {}};
  const context = vm.createContext({console, document, navigator: {}, window: {},
    localStorage: {getItem() {if (blockedStorage) throw Error('SecurityError'); return saved;},
      setItem() {if (blockedStorage) throw Error('QuotaExceededError');}},
    structuredClone, setInterval() {return 1;}, clearInterval() {}, setTimeout() {return 1;},
    alert() {}, confirm() {return true;},
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    escape, unescape, performance: {now: () => 0}});
  vm.runInContext(source.replace(marker, `${expose}\n${marker}`), context, {timeout: 2000});
  return context.rules || context.window.__islandSurvival;
}

function backpack(options = {}) {
  return fixture('backpack-arena.html', 'load();classScreen();', `
    draw=()=>{};drawBattle=()=>{};showResult=()=>{};showPerk=()=>{};
    globalThis.rules={fresh,shape,cellsFor,buildStats,startBattle,stepBattle,finishBattle,
      place,forge,roll,validateSave,exportCode,importCode,pauseBattle,fighting,
      state:()=>q,profile:()=>profile,runtime:()=>runtime,
      set:(s,r=null)=>{q=s;runtime=r;battleTimer=null;profile={wins:0,best:0,glory:0,seen:[]}},
      offer:i=>selectedOffer=i,run:()=>battleTimer=1,
      rotate:()=>$('rotateBtn').onclick()};return;`, options.saved, options.blockedStorage);
}
function chess(options = {}) {
  return fixture('auto-chess-forge.html', 'load();commanderScreen();', `
    draw=()=>{};renderBattle=()=>{};showAugment=()=>{};
    globalThis.rules={fresh,unit,opponentTeam,startBattle,battleStep,finishBattle,merge,
      statsFor,traitCounts,hitUnit,cast,attackRange,distance,approach,buy,roll,deploy,takeAugment,
      sellSelected,equip,validateSave,exportCode,importCode,pauseBattle,
      state:()=>q,profile:()=>profile,units:()=>battleUnits,active:()=>battleActive,
      select:id=>selected=id,set:(s,units=[])=>{q=s;battleUnits=units;battleActive=false;
        battleTimer=null;profile={wins:0,best:0,rank:0}},
      combat:units=>{battleUnits=units;battleActive=true;battleTimer=1}};return;`, options.saved, options.blockedStorage);
}
function side(overrides = {}) {
  return {cur: 20, max: 55, shieldCur: 0, shield: 0, stamina: 10, stamCur: 10, regen: 3,
    weapons: [], heals: [], poison: 0, tickHeal: 0, damagePct: 0, speed: 0, ...overrides};
}
function combat(overrides = {}) {
  return {time: 0, finished: false, p: side(), e: side(), feed: [], ...overrides};
}
function fighter(id, pos, enemy = false, overrides = {}) {
  return {uid: `${enemy ? 'enemy' : 'ally'}-${pos}`, id, pos, enemy, star: 1, items: [],
    max: 100, hp: 100, a: 10, speed: 1, power: 1, mana: 0, armor: 0, stun: 0, ...overrides};
}

test('backpack: all four rotations exist and return to the original asymmetric shape', () => {
  const g = backpack();
  const rotations = [0, 1, 2, 3].map(r => JSON.stringify([...g.shape('thorn', r)].sort()));
  assert.equal(new Set(rotations).size, 4);
  assert.equal(JSON.stringify(g.shape('thorn', 4)), JSON.stringify(g.shape('thorn', 0)));
});
test('backpack: recipe forging keeps the grid anchor after every rotation', () => {
  for(let rot=0;rot<4;rot++){
    const g=backpack(),s=g.fresh('ranger');
    s.items=[{uid:'blade',id:'sword',rot,cells:g.cellsFor('sword',0,rot),level:1},{uid:'stone',id:'stone',rot:0,cells:[27],level:1}];
    g.set(s);g.forge();assert.equal(s.items.length,1);assert.equal(s.items[0].id,'greatsword');
    assert.deepEqual([...s.items[0].cells],[...g.cellsFor('greatsword',0,rot)],`rotation ${rot} must not shift the forged equipment`);
  }
});

test('backpack: blocked recipe is atomic and does not erase upgraded component levels', () => {
  const g=backpack(),s=g.fresh('ranger');
  s.items=[{uid:'blade',id:'sword',rot:0,cells:[4,5,6],level:3},{uid:'stone',id:'stone',rot:0,cells:[0],level:1},{uid:'blocker',id:'herb',rot:0,cells:[13],level:1}];
  const inventory=()=>JSON.stringify({items:s.items,gold:s.gold,lives:s.lives,wins:s.wins});
  g.set(s);const before=inventory();g.forge();assert.equal(inventory(),before,'not enough output space must not mutate items, their levels, order or money; a feedback log is allowed');
});

test('backpack: expansion gives its promised 15 maximum HP', () => {
  const g = backpack(); const s = g.fresh('ranger'); s.perks = ['expand']; g.set(s);
  assert.equal(g.buildStats().hp, 70);
});
test('backpack: round twelve defeat on the last life is not a championship', () => {
  const g = backpack(); const s = g.fresh('ranger'); Object.assign(s, {round: 12, wins: 8, lives: 1, losses: 4});
  g.set(s, combat()); g.finishBattle(false);
  assert.equal(s.gameOver, true); assert.equal(s.champion, false); assert.equal(g.profile().wins, 0);
  const snapshot = JSON.stringify(s); g.finishBattle(true); assert.equal(JSON.stringify(s), snapshot);
});
test('backpack: ten actual wins, not an arbitrary round cap, earn the crown', () => {
  const g = backpack(); const s = g.fresh('ranger'); Object.assign(s, {round: 12, wins: 8, lives: 3});
  g.set(s, combat()); g.finishBattle(true); assert.equal(s.champion, false);
  g.set(s, combat()); g.finishBattle(true); assert.equal(s.champion, true); assert.equal(s.wins, 10);
});
test('backpack: cheese ticks at five seconds, not at the poison two-second interval', () => {
  const g = backpack(); const s = g.fresh('ranger');
  const r = combat({time: 1.75, p: side({tickHeal: 3})}); g.set(s, r);
  g.stepBattle(); assert.equal(r.p.cur, 20);
  r.time = 4.75; g.stepBattle(); assert.equal(r.p.cur, 23);
});
test('backpack: simultaneous deaths cannot award victory or be resurrected by cheese', () => {
  const g = backpack(); const s = g.fresh('ranger');
  g.set(s, combat({time: 4.75, p: side({cur: 0, tickHeal: 30}), e: side({cur: 0})}));
  g.stepBattle(); assert.equal(s.wins, 0); assert.equal(s.lives, 4);
});
test('backpack: moving, forging, rerolling and rotating do not mutate a live or paused build', () => {
  const g = backpack(); const s = g.fresh('ranger'); s.shop = ['thorn']; g.set(s, combat()); g.offer(0);
  const before = JSON.stringify(s); g.place(0); g.forge(); g.roll(); g.rotate();
  assert.equal(JSON.stringify(s), before); g.run(); g.pauseBattle();
  assert.equal(g.fighting(), true); g.place(0); assert.equal(JSON.stringify(s), before);
  assert.throws(() => g.importCode(g.exportCode()), /战斗/);
});
test('backpack: current saves round-trip, malformed placement is rejected atomically', () => {
  const g = backpack(); const s = g.fresh('ranger');
  s.items = [{uid: 'test', id: 'thorn', rot: 0, level: 1, cells: [0, 1, 8]}]; g.set(s);
  const code = g.exportCode(); g.importCode(code); assert.equal(g.state().items[0].id, 'thorn');
  assert.throws(() => g.importCode(code + 'x'));
  const bad = JSON.parse(JSON.stringify({q: g.state(), profile: g.profile()})); bad.q.items[0].cells = [6, 7, 14];
  assert.throws(() => g.validateSave(bad), /形状/);
});
test('backpack: blocked persistence is not a gameplay exception', () => {
  const g = backpack({blockedStorage: true}); const s = g.fresh('ranger'); g.set(s, combat());
  assert.doesNotThrow(() => g.finishBattle(false)); assert.equal(s.lives, 4);
});
test('backpack: a defeated fighter cannot use a healing potion to resurrect', () => {
  const g = backpack(); const s = g.fresh('alchemist');
  const r = combat({p: side({cur: 0, heals: [{value: 100, used: 0}]}), e: side()});
  g.set(s, r); g.stepBattle(); assert.equal(r.p.cur, 0); assert.equal(s.wins, 0);
});
test('backpack: forty real-rule fights terminate and keep all combat numbers finite', () => {
  for (let i = 0; i < 40; i++) {
    const g = backpack(); const s = g.fresh(['berserker', 'ranger', 'alchemist'][i % 3]);
    s.round = 1 + i % 12;
    const ids = ['dagger', 'sword', 'bow', 'greatsword', 'crossbow', 'sunblade', 'moonbow'];
    s.items = [{uid: 'weapon', id: ids[i % ids.length], level: 1 + i % 3, rot: 0, cells: []}];
    g.set(s); s.items[0].cells = g.cellsFor(s.items[0].id, 0, 0); g.startBattle();
    for (let tick = 0; tick < 142 && g.fighting(); tick++) g.stepBattle();
    assert.equal(g.fighting(), false, `fight ${i} terminates`);
    for (const side of [g.runtime().p, g.runtime().e]) {
      for (const key of ['cur', 'max', 'stamCur', 'shieldCur']) assert.ok(Number.isFinite(side[key]));
    }
  }
});

test('chess: the preview is cached for the entire round and is the real opponent', () => {
  const g = chess(); const s = g.fresh('vanguard'); g.set(s);
  const preview = JSON.stringify(g.opponentTeam()); g.roll(true);
  assert.equal(JSON.stringify(g.opponentTeam()), preview); g.startBattle();
  const actual = g.units().filter(u => u.enemy).map(({uid, id, star, pos, items}) => ({uid, id, star, pos, items}));
  assert.equal(JSON.stringify(actual), preview);
});
test('chess: a new round generates a new persisted opponent snapshot', () => {
  const g = chess(); const s = g.fresh('vanguard'); g.set(s); const first = g.opponentTeam();
  s.round++; assert.notEqual(g.opponentTeam(), first); assert.equal(s.previewRound, 2);
});
test('chess: merging returns all six excess equipped items instead of deleting them', () => {
  const g = chess(); const s = g.fresh('merchant'); s.units = [0, 1, 2].map(i => ({...g.unit(0), uid: String(i), items: ['blade', 'plate', 'orb']}));
  g.set(s); g.merge(); assert.equal(s.units.length, 1); assert.equal(s.units[0].star, 2);
  assert.equal(s.units[0].items.length + s.items.length, 9); assert.equal(s.items.length, 6);
});
test('chess: battle and paused battle reject roster/economy/equipment changes', () => {
  const g = chess(); const s = g.fresh('vanguard'); s.shop = [0]; s.items = ['blade']; g.set(s); g.startBattle();
  g.select(s.units[0].uid); const before = JSON.stringify(s);
  g.buy(0); g.roll(); g.deploy(s.units[0].uid, 47); g.equip('blade', 0); g.sellSelected();
  assert.equal(JSON.stringify(s), before); g.pauseBattle(); g.buy(0); assert.equal(JSON.stringify(s), before);
  assert.throws(() => g.importCode(g.exportCode()), /战斗/);
});
test('chess: distant melee troops move one valid cell without globally hitting low HP targets', () => {
  const g = chess(); const s = g.fresh('merchant'); const a = fighter(0, 40), b = fighter(0, 0, true);
  g.set(s); g.combat([a, b]); g.battleStep(1);
  assert.equal(a.hp, 100); assert.equal(b.hp, 100);
  assert.equal(g.distance(a, {pos: 40}), 1); assert.equal(g.distance(b, {pos: 0}), 1);
  assert.notEqual(a.pos, b.pos);
});
test('chess: ranged troops can hit only within their actual attack range', () => {
  const g = chess(); const s = g.fresh('merchant'); const a = fighter(2, 24), b = fighter(0, 0, true);
  g.set(s); g.combat([a, b]); g.battleStep(1); assert.ok(b.hp < 100);
  assert.equal(g.attackRange(a), 3); assert.equal(g.attackRange(b), 1);
});
test('chess: pathfinding respects occupied cells and cannot wrap board edges', () => {
  const g = chess(); const s = g.fresh('merchant'); const a = fighter(0, 40), target = fighter(0, 0, true);
  const blockers = [32, 41].map(pos => fighter(0, pos)); g.set(s); g.combat([a, target, ...blockers]);
  assert.equal(g.approach(a, target), false); assert.equal(a.pos, 40);
});
test('chess: the vanguard bonus applies to the first two deployment rows, not the back two', () => {
  const g = chess(); const s = g.fresh('vanguard'); g.set(s);
  assert.equal(g.statsFor({...g.unit(0), pos: 24}).armor, .12);
  assert.equal(g.statsFor({...g.unit(0), pos: 40}).armor, 0);
});
test('chess: shield absorbs damage, and the promised taunt protects nearby allies', () => {
  const g = chess(); const s = g.fresh('merchant'); const a = fighter(0, 24), b = fighter(0, 16, true);
  g.set(s); g.combat([a, b]); g.cast(a, b, [b]); const oldHp = a.hp;
  g.hitUnit(b, a, 10); assert.equal(a.hp, oldHp); assert.ok(a.shield > 0);
  const guard = fighter(5, 25); g.combat([a, b, guard]); g.cast(guard, b, [b]); assert.equal(a.guardTurns, 3);
});
test('chess: timeout uses remaining health proportion; a living ally is not an automatic win', () => {
  const g = chess(); const s = g.fresh('merchant'); const a = fighter(0, 24, false, {hp: 5}), b = fighter(0, 16, true);
  g.set(s); g.combat([a, b]); g.battleStep(151); assert.equal(s.lastWin, false); assert.ok(s.life < 100);
});
test('chess: equal timeout is a draw and does not damage the commander', () => {
  const g = chess(); const s = g.fresh('merchant'); g.set(s); g.combat([fighter(0, 24), fighter(0, 16, true)]);
  g.battleStep(151); assert.equal(s.lastWin, null); assert.equal(s.life, 100); assert.equal(s.streak, 0);
});
test('chess: death at the end of round twenty precedes crowning; settlement is once only', () => {
  const g = chess(); const s = g.fresh('merchant'); Object.assign(s, {round: 20, life: 1});
  g.set(s); g.combat([]); g.finishBattle(false, 9);
  assert.equal(s.gameOver, true); assert.equal(s.win, false); assert.equal(g.profile().wins, 0);
  const before = JSON.stringify(s); g.finishBattle(true, 0); assert.equal(JSON.stringify(s), before);
});
test('chess: current archive survives a round-trip and malformed hero data is rejected', () => {
  const g = chess(); const s = g.fresh('vanguard'); g.set(s); g.opponentTeam();
  const code = g.exportCode(); g.importCode(code); assert.equal(g.state().units.length, 1);
  assert.throws(() => g.importCode(code + 'x'));
  const bad = JSON.parse(JSON.stringify({q: g.state(), profile: g.profile()})); bad.q.units[0].pos = 99;
  assert.throws(() => g.validateSave(bad), /英雄/);
});
test('chess: blocked storage does not crash round settlement', () => {
  const g = chess({blockedStorage: true}); const s = g.fresh('merchant'); g.set(s); g.combat([]);
  assert.doesNotThrow(() => g.finishBattle(false, 1)); assert.ok(s.life < 100);
});
test('chess: forty varied formations complete with finite stats, legal cells and no overlaps', () => {
  for (let i = 0; i < 40; i++) {
    const g = chess(); const s = g.fresh('merchant'); s.round = 1 + i % 20; s.lv = 7;
    s.units = Array.from({length: 6}, (_, j) => ({...g.unit((i + j * 3) % 18, 40 + j), star: 1 + i % 3}));
    g.set(s); g.startBattle();
    for (let tick = 1; tick <= 152 && g.active(); tick++) {
      g.battleStep(tick);
      const alive = g.units().filter(u => u.hp > 0);
      assert.equal(new Set(alive.map(u => u.pos)).size, alive.length, `formation ${i} does not overlap`);
      for (const u of alive) {
        assert.ok(Number.isInteger(u.pos) && u.pos >= 0 && u.pos < 48);
        assert.ok(Number.isFinite(u.hp) && Number.isFinite(u.mana) && Number.isFinite(u.shield));
      }
    }
    assert.equal(g.active(), false, `formation ${i} terminates`);
  }
});

test('backpack: inherited object keys are not valid equipment, classes or perks', () => {
  const g = backpack();
  for (const key of ['constructor', '__proto__', 'toString']) {
    const data = {q: g.fresh('ranger'), profile: {wins: 0, best: 0, glory: 0, seen: [key]}};
    assert.throws(() => g.validateSave(data));
    data.profile.seen = []; data.q.cls = key; assert.throws(() => g.validateSave(data));
    data.q.cls = 'ranger'; data.q.perks = [key]; assert.throws(() => g.validateSave(data));
    data.q.perks = []; data.q.shop = [key]; assert.throws(() => g.validateSave(data));
  }
});

test('chess: bad inherited identifiers and negative resources cannot enter a save', () => {
  const g=chess();
  for(const key of ['constructor','__proto__','toString']){
    const d={q:g.fresh('merchant'),profile:{wins:0,best:0,rank:0}};
    d.q.commander=key;assert.throws(()=>g.validateSave(d));d.q.commander='merchant';
    d.q.items=[key];assert.throws(()=>g.validateSave(d));d.q.items=[];
    d.q.augments=[key];assert.throws(()=>g.validateSave(d));d.q.augments=[];
    d.q.shop=[key];assert.throws(()=>g.validateSave(d));
  }
  const d={q:g.fresh('merchant'),profile:{wins:0,best:0,rank:0}};
  d.q.gold=-1;assert.throws(()=>g.validateSave(d));
});

test('chess: life-cost augment is refused when lethal, and duplicate rewards never pay twice', () => {
  const g=chess(),s=g.fresh('merchant');s.life=8;g.set(s);const gold=s.gold;
  assert.equal(g.takeAugment('rich'),false);assert.equal(s.life,8);assert.equal(s.gold,gold);assert.equal(s.augments.length,0);
  s.life=9;assert.equal(g.takeAugment('rich'),true);assert.equal(s.life,1);assert.equal(s.gold,gold+18);
  assert.equal(g.takeAugment('rich'),false);assert.equal(s.gold,gold+18);
  g.combat([]);assert.equal(g.takeAugment('forge'),false);assert.equal(s.items.length,0);
});

test('island: one beneficial event increments the count exactly once', () => {
  const g = fixture('island-survival.html', '        renderAll();\n      })();', 'renderAll=()=>{};');
  const state = g.state(); state.event = {title: '测试', choices: [['帮助', {eventsHelped: 1}]]};
  g.dispatch({type: 'EVENT', choice: 0});
  assert.equal(state.eventsHelped, 1);
});
test('island: corrupt negative route progress is normalized before creating a run', () => {
  const g = fixture('island-survival.html', '        renderAll();\n      })();', 'renderAll=()=>{};', JSON.stringify({v: 2, unlocked: -99, stars: [], clears: -1}));
  assert.equal(g.profile().unlocked, 0); assert.equal(g.profile().clears, 0); assert.equal(g.state().day, 1);
});
test('island: blocked storage does not interrupt progress or score settlement', () => {
  const g = fixture('island-survival.html', '        renderAll();\n      })();', 'renderAll=()=>{};', null, true);
  assert.doesNotThrow(() => g.finish()); assert.equal(g.state().mode, 'result');
});
