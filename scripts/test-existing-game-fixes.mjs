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
    globalThis.rules={fresh,shape,cellsFor,buildStats,enemyStats,startBattle,stepBattle,finishBattle,
      place,forge,roll,validateSave,exportCode,importCode,pauseBattle,fighting,act,damage,tickPeriodics,
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
      sellSelected,equip,validateSave,exportCode,importCode,pauseBattle,validPreview,
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

function gear(g, id, start, level = 1) {
  return {uid: `${id}-${start}`, id, rot: 0, level, cells: g.cellsFor(id, start, 0)};
}
function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);
}

test('backpack: prism amplifies armor, healing, food, poison and weapon sustain, not only damage', () => {
  for (const [id,field,value] of [['buckler','shield',14],['bread','hp',8],['poison','poison',3],['thorn','reflect',2],['pepper','damagePct',.1]]) {
    const g=backpack(),s=g.fresh('ranger');s.items=[gear(g,id,7),gear(g,'prism',0)];g.set(s);
    const stats=g.buildStats();assertClose(stats[field]-(field==='hp'?55:0),value*1.18);
  }
  const g=backpack(),s=g.fresh('ranger');s.items=[gear(g,'herb',7),gear(g,'prism',0)];g.set(s);
  assertClose(g.buildStats().heals[0].value,11.8);
  s.items=[gear(g,'sunblade',7),gear(g,'prism',0)];
  assertClose(g.buildStats().weapons[0].lifesteal,3*1.18);
});

test('backpack: strengthening and expansion consistently scale beneficial stats and gem outputs', () => {
  const g=backpack(),s=g.fresh('ranger');s.perks=['expand','craft','stamina'];
  s.items=[gear(g,'mail',0,2),gear(g,'bread',14,2),gear(g,'dagger',21),gear(g,'stone',23,2)];g.set(s);
  const p=g.buildStats(),mult=1.35*1.05;
  assertClose(p.hp,70+26*mult);assertClose(p.shield,10*mult);
  assertClose(p.regen,(3+.24*mult)*1.12);
  assertClose(p.weapons[0].damage,7*1.05+2*mult*1.3);
});

test('backpack: adjacent gems cannot recursively amplify each other', () => {
  const g=backpack(),s=g.fresh('ranger');s.items=[gear(g,'sword',7),gear(g,'prism',0),gear(g,'prism',2)];g.set(s);
  assertClose(g.buildStats().weapons[0].damage,14*1.36);
});

test('backpack: sapphire accelerates cheese and poison on their own real periodic timers', () => {
  for (const [id,interval] of [['cheese',5],['poison',2]]) {
    const g=backpack(),s=g.fresh('ranger');s.items=[gear(g,id,0),gear(g,'sapphire',1)];g.set(s);
    const p=g.buildStats();assertClose(p.periodics[0].cd,interval*.88);
    const r=combat({p:side({...p,max:100,cur:20}),e:side({max:1000,cur:1000})});g.set(s,r);
    const ticks=id==='cheese'?18:8;for(let i=0;i<ticks;i++)g.stepBattle();
    assert.equal(id==='cheese'?r.p.cur:r.e.cur,id==='cheese'?23:997);
    assert.ok(r.p.periodics[0].t<.25+.001,'fractional time remainder survives periodic trigger');
  }
});

test('backpack: potion-specific health thresholds are obeyed exactly', () => {
  for (const [id,threshold,value] of [['herb',.5,10],['potion',.45,22]]) {
    const g=backpack(),s=g.fresh('ranger');s.items=[gear(g,id,0)];g.set(s);const p=g.buildStats();
    const r=combat({p:side({...p,max:100,cur:threshold*100}),e:side({cur:100,max:100})});g.set(s,r);
    g.act(r.p,r.e);assert.equal(r.p.heals[0].used,0,'equal to threshold does not drink');
    r.p.cur-=1;g.act(r.p,r.e);assert.equal(r.p.cur,threshold*100-1+value);assert.equal(r.p.heals[0].used,1);
  }
});

test('backpack: alchemist has two independent full-dose low-health triggers, never a third', () => {
  const g=backpack(),s=g.fresh('alchemist');s.items=[gear(g,'herb',0)];g.set(s);const p=g.buildStats();
  const r=combat({p:side({...p,max:100,cur:40}),e:side({cur:100,max:100})});g.set(s,r);
  g.act(r.p,r.e);assert.equal(r.p.cur,50);assert.equal(r.p.heals[0].used,1);
  r.p.cur=30;g.act(r.p,r.e);assert.equal(r.p.cur,40);assert.equal(r.p.heals[0].used,2);
  r.p.cur=20;g.act(r.p,r.e);assert.equal(r.p.cur,20);assert.equal(r.p.heals[0].used,2);
});

test('backpack: elixir haste is granted only when drunk, once per charge', () => {
  const g=backpack(),s=g.fresh('ranger');s.items=[gear(g,'elixir',0)];g.set(s);const p=g.buildStats();
  assert.equal(p.speed,0);const r=combat({p:side({...p,max:100,cur:100}),e:side({cur:100,max:100})});g.set(s,r);
  g.act(r.p,r.e);assert.equal(r.p.speed,0);r.p.cur=40;g.act(r.p,r.e);assert.equal(r.p.cur,68);assertClose(r.p.speed,.15);
  r.p.cur=40;g.act(r.p,r.e);assert.equal(r.p.cur,40);assertClose(r.p.speed,.15);
});

test('backpack: weapon damage buffs and thorn reflection do not apply to poison ticks', () => {
  const g=backpack(),s=g.fresh('ranger');const r=combat({p:side({cur:100,max:100,damagePct:1}),e:side({cur:100,max:100,reflect:2})});g.set(s,r);
  g.damage(r.p,r.e,3,'毒素');assert.equal(r.e.cur,97);assert.equal(r.p.cur,100);
  g.damage(r.p,r.e,7,'短匕',true);assert.equal(r.e.cur,83);assert.equal(r.p.cur,98);
});

test('backpack: cooldown remainder is retained and exhaustion cannot bank unlimited attacks', () => {
  const g=backpack(),s=g.fresh('ranger');s.items=[gear(g,'dagger',0)];g.set(s);const p=g.buildStats();
  const r=combat({p:side({...p,max:1000,cur:1000,stamina:200,stamCur:200,regen:0}),e:side({cur:10000,max:10000})});g.set(s,r);
  for(let i=0;i<80;i++)g.act(r.p,r.e);assert.equal(r.p.weapons[0].count,11);assertClose(r.p.weapons[0].t,1.3);
  const w=r.p.weapons[0];w.count=0;w.t=0;r.p.stamCur=0;
  for(let i=0;i<100;i++)g.act(r.p,r.e);assert.ok(w.t<=w.cd);
  r.p.stamCur=10;g.act(r.p,r.e);assert.equal(w.count,1);assert.equal(r.p.stamCur,8);
});

test('backpack: extreme legitimate item levels remain finite and respect timing and resistance bounds', () => {
  const g=backpack(),s=g.fresh('ranger');s.items=[gear(g,'dragon',0,20),gear(g,'prism',15,20),gear(g,'dagger',21,20),gear(g,'sapphire',23,20)];g.set(s);
  const p=g.buildStats();assert.ok(p.resist<=.75);assert.ok(p.weapons[0].cd>=.25);
  for(const field of ['hp','shield','stamina','regen','resist','reflect','damagePct'])assert.ok(Number.isFinite(p[field]));
});

test('backpack: every opponent preview is actual legal equipment including a real weapon', () => {
  const g=backpack(),s=g.fresh('ranger');g.set(s);
  for(let round=1;round<=14;round++){
    s.round=round;const e=g.enemyStats();assert.ok(e.weapons.length>0);
    assert.deepEqual([...e.gear],[...e.equipment.map(it=>it.id)]);
    assert.ok(e.weapons.every(w=>e.equipment.some(it=>it.uid===w.uid&&it.id===w.id)),'no hidden fallback weapon');
    assert.doesNotThrow(()=>g.validateSave({q:{...s,items:e.equipment},profile:{wins:0,best:0,glory:0,seen:[]}}),'same ordinary shape, overlap, level and UID validators apply');
  }
});

test('backpack: enemy equipment uses the exact player item resolver with explicit schedule-only modifiers', () => {
  const g=backpack(),s=g.fresh('ranger');s.perks=['brew','tempo','expand','craft'];s.items=[gear(g,'sunblade',0,2)];g.set(s);
  for(let round=1;round<=14;round++){
    s.round=round;const before=JSON.stringify(s),e=g.enemyStats(),plain=g.buildStats({cls:'opponent',perks:[],items:e.equipment});
    assert.equal(JSON.stringify(s),before,'opponent generation must not mutate player build or perks');
    assertClose(e.hp,e.baseHp+plain.hp-55);assertClose(e.shield,e.baseShield+plain.shield);
    assertClose(e.scale,1+(round-1)*.105);
    for(const key of ['stamina','regen','reflect','resist','poison','tickHeal','damagePct','speed'])assertClose(e[key],plain[key]);
    assert.equal(JSON.stringify(e.heals),JSON.stringify(plain.heals));assert.equal(JSON.stringify(e.periodics),JSON.stringify(plain.periodics));
    for(let i=0;i<e.weapons.length;i++){
      assertClose(e.weapons[i].damage,plain.weapons[i].damage*e.scale);
      for(const key of ['cd','stam','crit','lifesteal','burst'])assertClose(e.weapons[i][key],plain.weapons[i][key]);
    }
  }
});

test('backpack: the hunter really gains ruby adjacency and cheese regeneration', () => {
  const g=backpack(),s=g.fresh('ranger');s.round=8;g.set(s);const e=g.enemyStats();
  assertClose(e.weapons[0].damage,14*e.scale);assertClose(e.weapons[0].cd,1.9,'opponent has no player ranger cooldown perk');
  assert.deepEqual([...e.gear],['bow','ruby','cheese']);assert.equal(e.periodics[0].kind,'heal');assert.equal(e.periodics[0].value,3);
  const r=combat({p:side({cur:100,max:100}),e:side({...e,cur:20,max:100})});g.set(s,r);
  for(let i=0;i<20;i++)g.tickPeriodics(r.e,r.p);assert.equal(r.e.cur,23);
});

test('backpack: the champion really gains sapphire cooldown and elixir after-drinking haste', () => {
  const g=backpack(),s=g.fresh('alchemist');s.round=6;g.set(s);const e=g.enemyStats();
  assert.deepEqual([...e.gear],['crossbow','sapphire','elixir']);assertClose(e.weapons[0].cd,2.2*.88);
  assert.equal(e.speed,0);assert.equal(e.heals[0].maxUses,1,'opponent cannot inherit the player alchemist profession');
  const r=combat({p:side({cur:1000,max:1000}),e:side({...e,cur:40,max:100})});g.set(s,r);
  g.act(r.e,r.p);assert.equal(r.e.cur,68);assertClose(r.e.speed,.15);assert.equal(r.e.heals[0].used,1);
});

test('backpack: enemy poison and thorn are real item effects, not invisible style bonuses', () => {
  const g=backpack(),s=g.fresh('ranger');s.round=3;g.set(s);const poison=g.enemyStats();
  assert.deepEqual([...poison.gear],['dagger','poison']);assert.equal(poison.poison,3);assert.equal(poison.heals.length,0);
  const r=combat({p:side({cur:100,max:100}),e:side({...poison,cur:100,max:100})});g.set(s,r);
  for(let i=0;i<8;i++)g.tickPeriodics(r.e,r.p);assert.equal(r.p.cur,97);
  s.round=5;const thorn=g.enemyStats();assert.ok(thorn.gear.includes('thorn'));assert.equal(thorn.reflect,2);
  s.round=1;const wall=g.enemyStats();assert.equal(wall.resist,0,'no unseen wall-style resistance is added');
});

test('chess: 25 percent attack speed yields five equal-damage attacks over four base ticks', () => {
  for (const [speed,hits] of [[1,4],[1.25,5],[2,8]]) {
    const g=chess(),s=g.fresh('merchant'),a=fighter(0,24,false,{speed}),b=fighter(0,16,true,{hp:10000,max:10000,stun:100});g.set(s);g.combat([a,b]);
    for(let tick=1;tick<=4;tick++){a.mana=0;g.battleStep(tick)}
    assert.equal(b.hp,10000-10*hits);assert.ok(a.actionProgress>=0&&a.actionProgress<1);
  }
});

test('chess: attack speed never speeds movement or banks a long-range catch-up burst', () => {
  const g=chess(),s=g.fresh('merchant'),a=fighter(0,40,false,{speed:3}),b=fighter(0,0,true,{stun:100});g.set(s);g.combat([a,b]);
  g.battleStep(1);assert.equal(g.distance(a,{pos:40}),1);assert.equal(b.hp,100);assert.equal(a.actionProgress,0);
});

test('chess: stun freezes the action clock, and ramp cannot exceed three times base speed', () => {
  const g=chess(),s=g.fresh('merchant'),a=fighter(1,24,false,{speed:2.9,stun:2,actionProgress:.5}),b=fighter(0,16,true,{hp:10000,max:10000,stun:100});g.set(s);g.combat([a,b]);
  g.battleStep(1);assert.equal(a.actionProgress,.5);assert.equal(b.hp,10000);
  for(let i=0;i<50;i++)g.cast(a,b,[b]);assert.equal(a.speed,3);assert.equal(a.mana,0,'skills do not gain attack mana from their own damage');
});

test('chess: multi-hit skills stop on death and splash primary damage follows the selected target', () => {
  const g=chess(),s=g.fresh('merchant'),a=fighter(7,24,false,{a:15}),b=fighter(0,16,true,{hp:7});g.set(s);g.combat([a,b]);
  g.cast(a,b,[b]);assert.equal(b.hp,-3);assert.equal(b.mana,5);assert.equal(a.mana,0);
  const caster=fighter(4,24),primary=fighter(0,16,true),secondary=fighter(0,25,true);g.combat([caster,primary,secondary]);
  g.cast(caster,primary,[secondary,primary]);assert.equal(primary.hp,87);assert.equal(secondary.hp,93);
});

test('chess: invalid archived previews are repaired without allowing overlapping cells, duplicate UIDs or excess equipment', () => {
  const g=chess(),s=g.fresh('vanguard');g.set(s);const good=JSON.parse(JSON.stringify(g.opponentTeam()));assert.equal(g.validPreview(good),true);
  for(const mutate of [p=>p[1].pos=p[0].pos,p=>p[1].uid=p[0].uid,p=>p[0].uid='',p=>p[0].items=['blade','blade','blade','blade']]) {
    const preview=structuredClone(good);mutate(preview);assert.equal(g.validPreview(preview),false);
    const data={q:{...s,enemyPreview:preview,previewRound:s.round},profile:{wins:0,best:0,rank:0}};
    const clean=g.validateSave(data);assert.equal(clean.q.enemyPreview,undefined);g.set(clean.q);
    assert.equal(g.validPreview(g.opponentTeam()),true,'new valid snapshot is generated once');
  }
});

test('chess: golden ticket grants one manual refresh each round, unaffected by automatic shop refill', () => {
  const g=chess(),s=g.fresh('merchant');g.set(s);
  assert.equal(g.takeAugment('rerolls'),true);assert.equal(s.freeRoll,true);
  const initial=s.gold;g.roll(true);assert.equal(s.freeRoll,true);assert.equal(s.gold,initial);
  g.roll();assert.equal(s.freeRoll,false);assert.equal(s.gold,initial);
  g.roll();assert.equal(s.gold,initial-2);
  g.combat([]);g.finishBattle(true,0);assert.equal(s.freeRoll,true,'new round automatically refills shop without consuming manual refresh');
  const next=s.gold;g.roll();assert.equal(s.gold,next);assert.equal(s.freeRoll,false);
});

test('chess: free refresh entitlement survives export and import, legacy saves remain valid', () => {
  const g=chess(),s=g.fresh('merchant');g.set(s);g.takeAugment('rerolls');
  const code=g.exportCode();g.importCode(code);assert.equal(g.state().freeRoll,true);
  const gold=g.state().gold;g.roll();assert.equal(g.state().gold,gold);assert.equal(g.state().freeRoll,false);
  const consumed=g.exportCode();g.importCode(consumed);assert.equal(g.state().freeRoll,false);
  const legacy={q:g.fresh('merchant'),profile:{wins:0,best:0,rank:0}};delete legacy.q.freeRoll;
  assert.equal(g.validateSave(legacy).q.freeRoll,false);
  legacy.q.freeRoll='yes';assert.throws(()=>g.validateSave(legacy),/免费刷新/);
});

test('chess: automatic merging retains a deployed unit rather than silently removing its formation', () => {
  const g=chess(),s=g.fresh('merchant');s.units=[{...g.unit(0),uid:'bench'},{...g.unit(0,32),uid:'deployed'},{...g.unit(0),uid:'new'}];g.set(s);
  g.merge();assert.equal(s.units.length,1);assert.equal(s.units[0].uid,'deployed');assert.equal(s.units[0].pos,32);assert.equal(s.units[0].star,2);
});

test('chess: stale inventory actions cannot duplicate equipment or consume a different item', () => {
  const g=chess(),s=g.fresh('vanguard');s.items=['blade','plate'];g.set(s);g.select(s.units[0].uid);
  g.equip('blade',0);assert.deepEqual([...s.units[0].items],['blade']);assert.deepEqual([...s.items],['plate']);
  g.equip('blade',0);g.equip('plate',99);g.equip('constructor',0);
  assert.deepEqual([...s.units[0].items],['blade']);assert.deepEqual([...s.items],['plate']);
});

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
