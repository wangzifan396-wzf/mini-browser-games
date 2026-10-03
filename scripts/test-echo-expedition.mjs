import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const htmlPath=fileURLToPath(new URL('../development/echo-expedition.html',import.meta.url));
const html=fs.readFileSync(htmlPath,'utf8');
const match=html.match(/<script id="echo-engine">([\s\S]*?)<\/script>/);
assert.ok(match,'Rule engine must be in the same HTML used by the browser.');
const context=vm.createContext({});
vm.runInContext(match[1],context,{filename:'echo-expedition.html:engine',timeout:10000});
const E=context.EchoExpedition;
const clone=o=>JSON.parse(JSON.stringify(o));
const initial=()=>({credits:0,runs:0,best:0,research:{pack:0,plating:0,capacitor:0}});
function fixture(risk=1){
  const s=E.createRun('fixture',initial(),'scout',risk);
  s.map=Array.from({length:E.H},(_,y)=>Array.from({length:E.W},(_,x)=>x===0||y===0||x===E.W-1||y===E.H-1?1:0));
  s.seen=Array.from({length:E.H},()=>Array(E.W).fill(true));s.player.x=5;s.player.y=7;s.guards=[];s.caches=[];s.hazards=[];s.noises=[];s.messages=[];s.alert=0;s.log=[];return s;
}
function guard(s,x=5,y=5,damage=2){const g={id:1,x,y,hp:3,homeX:x,homeY:y,stunned:0,intent:{type:'aim',x:s.player.x,y:s.player.y,damage}};s.guards.push(g);return g;}
function ok(s,c){const r=E.act(s,c);assert.equal(r.ok,true,r.message);return r;}
function refuse(s,c){const before=JSON.stringify(s);assert.equal(E.act(s,c).ok,false);assert.equal(JSON.stringify(s),before,'Rejected command must not mutate simulation or spend anything.');}
function invariants(s){assert.ok(Number.isSafeInteger(s.ap)&&s.ap>=0&&s.ap<=3);assert.ok(s.player.hp>=0&&s.player.hp<=s.player.maxHp);assert.ok(s.player.energy>=0&&s.player.ammo>=0&&s.player.meds>=0);assert.ok(E.weight(s)<=s.player.capacity);assert.ok(E.passable(s,s.player.x,s.player.y));assert.ok(s.alert>=0&&s.alert<=100);const cells=new Set();for(const g of E.liveGuards(s)){assert.ok(E.passable(s,g.x,g.y));const key=g.x+','+g.y;assert.ok(!cells.has(key),'Guards must not occupy the same tile.');cells.add(key);assert.ok(g.x!==s.player.x||g.y!==s.player.y);assert.ok(g.intent&&['aim','strike','move','wait'].includes(g.intent.type));}if(s.phase==='raid')assert.equal(s.base.credits,s.startBase.credits,'Unsaved loot cannot be paid before extraction.');}

test('every inline script parses; canvas and accessible touch controls exist',()=>{
  for(const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
  for(const id of ['start-button','map','end-turn-button','extract-button','dialog-backdrop','resume-button'])assert.ok(html.includes(`id="${id}"`));
  assert.equal((html.match(/data-dir="(up|right|down|left)"/g)||[]).length,4);
  assert.ok(html.includes('max-width:680px'));assert.ok(!/<script[^>]+src=/.test(html));assert.ok(!/fetch\(/.test(match[1]));
});
test('same seed, equipment and base reproduce the entire initial simulation',()=>{
  assert.equal(JSON.stringify(E.createRun('雨后港口',initial(),'scout',2)),JSON.stringify(E.createRun('雨后港口',initial(),'scout',2)));
  assert.notEqual(JSON.stringify(E.createRun('rain',initial(),'scout',1).map),JSON.stringify(E.createRun('sun',initial(),'scout',1).map));
});
test('300 generated areas have connected floors, both exits, reachable caches, distinct patrols and a nearby first cache',()=>{
  for(let seed=0;seed<100;seed++)for(let risk=1;risk<=3;risk++){
    const s=E.createRun('map-'+seed,initial(),'scout',risk);invariants(s);
    const connected=new Set(),queue=[{x:s.player.x,y:s.player.y}];connected.add(s.player.y*E.W+s.player.x);
    for(let i=0;i<queue.length;i++)for(const [dx,dy] of Object.values(E.DIR)){const x=queue[i].x+dx,y=queue[i].y+dy,key=y*E.W+x;if(E.passable(s,x,y)&&!connected.has(key)){connected.add(key);queue.push({x,y});}}
    let floors=0;for(let y=0;y<E.H;y++)for(let x=0;x<E.W;x++)if(E.passable(s,x,y)){floors++;assert.ok(connected.has(y*E.W+x));}
    assert.ok(floors>120);for(const e of s.exits)assert.ok(E.path(s,s.player,e).length>0);for(const c of s.caches)assert.ok(E.path(s,s.player,c).length>0);
    const nearest=E.path(s,s.player,s.caches[0]).length-1;assert.ok(nearest>=4&&nearest<=7,`seed ${seed} risk ${risk} nearby crate distance ${nearest}`);
    assert.equal(E.liveGuards(s).length,E.REGIONS[risk].guards);
  }
});
test('line of sight is symmetric and blocked by walls, including reversed diagonal rays',()=>{
  const s=fixture();s.map[6][6]=1;assert.equal(E.lineOfSight(s,{x:5,y:5},{x:7,y:7}),false);
  for(let i=0;i<90;i++){const a={x:1+i%15,y:1+i%13},b={x:17-i%11,y:15-i%9};assert.equal(E.lineOfSight(s,a,b),E.lineOfSight(s,b,a));}
});
test('walking costs one AP, obeys walls and occupied tiles; refused moves change nothing',()=>{
  const s=fixture();ok(s,{type:'move',dir:'left'});assert.equal(s.ap,2);assert.equal(s.player.x,4);
  s.map[7][3]=1;refuse(s,{type:'move',dir:'left'});guard(s,4,6);refuse(s,{type:'move',dir:'up'});refuse(s,{type:'move',dir:'__proto__'});
});
test('running moves at most two tiles, never leaps a wall, and has an explicit noise/alert cost',()=>{
  const s=fixture();s.map[7][7]=1;ok(s,{type:'dash',dir:'right'});assert.equal(s.player.x,6);assert.equal(s.ap,1);assert.equal(s.alert,5);assert.equal(s.noises.at(-1).radius,8);refuse(s,{type:'dash',dir:'left'});
});
test('carried weight changes movement cost without silently exceeding capacity',()=>{
  const s=fixture();s.cargo=Array.from({length:5},()=>({kind:'scrap'}));assert.equal(E.heavy(s),true);ok(s,{type:'move',dir:'left'});assert.equal(s.ap,1);refuse(s,{type:'move',dir:'left'});
  s.ap=3;ok(s,{type:'dash',dir:'right'});assert.equal(s.ap,0);assert.equal(E.weight(s),10);
});
test('AP exhaustion does not auto-execute enemy attacks; only explicit end advances a round',()=>{
  const s=fixture();for(let i=0;i<3;i++)ok(s,{type:'move',dir:'left'});assert.equal(s.ap,0);assert.equal(s.turn,1);refuse(s,{type:'move',dir:'right'});ok(s,{type:'end'});assert.equal(s.turn,2);assert.equal(s.ap,3);
});
test('telegraphed attacks hit the locked tile, not a player who moved after planning',()=>{
  const s=fixture();const g=guard(s);const locked=clone(g.intent);ok(s,{type:'move',dir:'left'});assert.deepEqual(clone(g.intent),locked);ok(s,{type:'end'});assert.equal(s.player.hp,s.player.maxHp);assert.equal(g.intent.x,s.player.x);
});
test('staying on an attack tile takes the promised damage; cover is paid and resets each round',()=>{
  const s=fixture();guard(s);ok(s,{type:'cover'});assert.equal(s.ap,2);refuse(s,{type:'cover'});ok(s,{type:'end'});assert.equal(s.player.hp,8);assert.equal(s.player.cover,0);ok(s,{type:'end'});assert.equal(s.player.hp,6);
});
test('EMP cancels two enemy phases but does not permanently erase patrol threats',()=>{
  const s=fixture();const g=guard(s);ok(s,{type:'emp'});assert.equal(s.ap,1);assert.equal(s.player.energy,2);assert.equal(g.intent.type,'wait');ok(s,{type:'end'});assert.equal(g.stunned,1);ok(s,{type:'end'});assert.equal(g.stunned,0);assert.equal(s.player.hp,8);assert.equal(g.intent.type,'aim');ok(s,{type:'end'});assert.equal(s.player.hp,6);
});
test('deeper guard volleys deny visible tiles, lock the area for the turn, and EMP really cancels it',()=>{
  for(const risk of [2,3]){
    const s=fixture(risk);const g=guard(s);g.intent={type:'wait',x:g.x,y:g.y,damage:0};
    ok(s,{type:'end'});
    const planned=clone(g.intent);assert.equal(E.attackTiles(s,g).length,risk===2?3:5);
    ok(s,{type:'move',dir:risk===2?'up':'right'});
    assert.equal(JSON.stringify(g.intent),JSON.stringify(planned),'intent cannot secretly track movement');
    ok(s,{type:'end'});assert.equal(s.player.hp,8-(risk===3?3:2),'a marked neighboring tile is genuinely dangerous');
    ok(s,{type:'emp'});assert.equal(E.attackTiles(s,g).length,0);const hp=s.player.hp;ok(s,{type:'end'});assert.equal(s.player.hp,hp);
  }
  const t=fixture(3),g=guard(t);g.intent={type:'aim',x:5,y:7,damage:3,tiles:[{x:5,y:7},{x:4,y:7},{x:5,y:6}]};t.map[7][4]=1;
  assert.equal(E.attackTiles(t,g).some(p=>p.x===4&&p.y===7),false,'walls cannot be attack tiles');
});

test('empty EMP use is refused without consuming AP or charge',()=>{const s=fixture();refuse(s,{type:'emp'});});
test('push cancels the announced strike, relocates a guard and obeys obstacles',()=>{
  const s=fixture();const g=guard(s,5,6,3);ok(s,{type:'push',id:1});assert.equal(g.y,5);assert.equal(g.intent.type,'wait');ok(s,{type:'end'});assert.equal(s.player.hp,8);
  const t=fixture();const h=guard(t,5,6,3);t.map[5][5]=1;ok(t,{type:'push',id:1});assert.equal(h.y,6);assert.equal(h.hp,2);assert.equal(h.intent.type,'wait');
});
test('shooting does not cancel surviving guards or shoot through walls',()=>{
  const s=fixture();const g=guard(s);ok(s,{type:'shoot',id:1});assert.equal(g.hp,1);assert.equal(g.intent.type,'aim');assert.equal(s.player.ammo,2);assert.equal(s.alert,10);ok(s,{type:'move',dir:'left'});ok(s,{type:'end'});assert.equal(s.player.hp,8);
  const t=fixture();guard(t);t.map[6][5]=1;refuse(t,{type:'shoot',id:1});
});
test('noise is spatial and temporary, not a permanently omniscient pursuit flag',()=>{
  const s=fixture();guard(s,12,7);s.map[7][8]=1;ok(s,{type:'dash',dir:'left'});assert.equal(s.noises.length,1);ok(s,{type:'end'});assert.equal(s.noises.length,1);ok(s,{type:'end'});ok(s,{type:'end'});assert.equal(s.noises.length,0);
});
test('loot collection permits deliberate individual selection and never duplicates goods',()=>{
  const s=fixture();s.caches=[{id:1,x:6,y:7,items:[{kind:'scrap'},{kind:'data'},{kind:'relic'}],supply:false}];
  ok(s,{type:'collect',id:1,item:1});assert.equal(s.cargo.length,1);assert.equal(s.cargo[0].kind,'data');assert.equal(s.caches[0].items.length,2);assert.equal(E.value(s),18);
  ok(s,{type:'collect',id:1});assert.equal(s.cargo.length,3);assert.equal(s.caches[0].items.length,0);refuse(s,{type:'collect',id:1});
});
test('capacity rejection keeps the cache intact, and distant collection cannot cheat',()=>{
  const s=fixture();s.cargo=Array.from({length:6},()=>({kind:'scrap'}));s.caches=[{id:1,x:6,y:7,items:[{kind:'data'}],supply:false},{id:2,x:12,y:7,items:[{kind:'relic'}],supply:false}];refuse(s,{type:'collect',id:1});refuse(s,{type:'collect',id:2});
});
test('dropped cargo remains in the world and can be recovered exactly once',()=>{
  const s=fixture();s.cargo=[{kind:'relic'}];ok(s,{type:'drop',index:0});assert.equal(E.value(s),0);assert.equal(s.caches[0].items[0].kind,'relic');ok(s,{type:'collect',id:s.caches[0].id});assert.equal(E.value(s),65);assert.equal(s.caches[0].items.length,0);
});
test('supply crates are single-use and treatment cannot consume at full health',()=>{
  const s=fixture();refuse(s,{type:'heal'});s.caches=[{id:1,x:5,y:7,items:[],supply:true}];ok(s,{type:'collect',id:1});assert.equal(s.player.ammo,5);assert.equal(s.player.energy,4);assert.equal(s.player.meds,3);refuse(s,{type:'collect',id:1});s.player.hp=3;ok(s,{type:'heal'});assert.equal(s.player.hp,7);assert.equal(s.player.meds,2);
});
test('extraction requires actual proximity, two AP and some cargo',()=>{
  const s=fixture();s.cargo=[{kind:'data'}];refuse(s,{type:'extract'});s.player.x=1;s.player.y=E.H-2;s.ap=1;refuse(s,{type:'extract'});s.ap=3;s.cargo=[];refuse(s,{type:'extract'});
});
test('a successful extraction pays goods, optional commission and remote bonus only once',()=>{
  const s=fixture();s.cargo=[{kind:'relic'},{kind:'data'}];s.player.x=E.W-2;s.player.y=1;ok(s,{type:'extract'});assert.equal(s.phase,'extracted');assert.equal(s.result.goods,83);assert.equal(s.result.bonus,25);assert.equal(s.result.remote,20);assert.equal(s.base.credits,128);assert.equal(s.base.runs,1);refuse(s,{type:'extract'});refuse(s,{type:'end'});assert.equal(s.base.credits,128);
});
test('failure and lockdown never pay unextracted loot or damage existing base research',()=>{
  const s=fixture();s.base.credits=123;s.startBase.credits=123;s.cargo=[{kind:'relic'}];s.player.hp=2;guard(s);ok(s,{type:'end'});assert.equal(s.phase,'defeated');assert.equal(s.base.credits,123);assert.equal(s.result.earnings,0);
  const t=fixture();t.cargo=[{kind:'data'}];t.turn=t.limit;ok(t,{type:'end'});assert.equal(t.phase,'defeated');assert.equal(t.result.reason,'封锁已完成');assert.equal(t.base.runs,0);
});
test('core-zone electric danger follows the advertised 2/5/8 cadence and ignores cover',()=>{
  const s=fixture(3);s.hazards=[{x:5,y:7}];ok(s,{type:'end'});assert.equal(s.player.hp,8);ok(s,{type:'cover'});ok(s,{type:'end'});assert.equal(s.player.hp,6);ok(s,{type:'end'});assert.equal(s.player.hp,6);
});
test('reinforcements are announced two rounds before entry and never immediately attack',()=>{
  const s=fixture();s.alert=35;ok(s,{type:'end'});assert.equal(s.guards.length,0);assert.equal(s.reinforcements.length,1);assert.equal(s.reinforcements[0].at,4);ok(s,{type:'end'});assert.equal(s.guards.length,0);ok(s,{type:'end'});assert.equal(s.guards.length,1);assert.equal(s.player.hp,8);assert.ok(s.guards[0].intent);
});
test('research prices, caps, starter tradeoffs and finite imported numbers are enforced',()=>{
  const b={...initial(),credits:1000};const upgrade=E.upgrade(b,'pack');assert.equal(upgrade.ok,true);assert.equal(upgrade.base.credits,910);assert.equal(upgrade.base.research.pack,1);assert.equal(b.research.pack,0,'Upgrade must not mutate the input base.');assert.equal(E.createRun('gear',upgrade.base).player.capacity,14);
  assert.equal(E.upgrade(initial(),'pack').ok,false);assert.equal(E.upgrade(b,'__proto__').ok,false);assert.equal(E.upgrade({...b,research:{pack:3}},'pack').ok,false);
  const n=E.normalizeBase({credits:Infinity,runs:-5,best:'999',research:{pack:100,plating:NaN,capacitor:2}});assert.equal(n.credits,0);assert.equal(n.research.pack,0);assert.equal(n.research.capacitor,2);
});
test('active save restores by replaying the same rules rather than trusting imported map or HP fields',()=>{
  const s=E.createRun('save-roundtrip',initial(),'operator',2);const free=Object.entries(E.DIR).find(([,d])=>E.passable(s,s.player.x+d[0],s.player.y+d[1]));ok(s,{type:'move',dir:free[0]});ok(s,{type:'cover'});ok(s,{type:'end'});
  const restored=E.parse(E.serialize(s.base,s));assert.equal(JSON.stringify(restored.run),JSON.stringify(s));assert.deepEqual(clone(restored.base),initial());
});
test('JSON injection, wrong schema, oversized saves, mismatched bases and impossible replay are rejected safely',()=>{
  for(const value of ['null','[]','not JSON','{"version":1}', 'x'.repeat(250001)])assert.throws(()=>E.parse(value));
  const s=E.createRun('save',initial());const raw=JSON.parse(E.serialize(s.base,s));raw.run.commands=[{type:'teleport',x:1,y:1}];assert.throws(()=>E.parse(JSON.stringify(raw)));
  raw.run.commands=[{type:'extract'}];assert.throws(()=>E.parse(JSON.stringify(raw)));raw.run.commands=[];raw.base.credits=10;assert.throws(()=>E.parse(JSON.stringify(raw)));raw.base.credits=0;raw.run.risk='__proto__';assert.throws(()=>E.parse(JSON.stringify(raw)));
  const malicious='{"schema":"echo-expedition","version":1,"base":{"__proto__":{"polluted":true},"credits":-999,"research":{"pack":999}},"run":null}';const saved=E.parse(malicious);assert.equal(saved.base.credits,0);assert.equal(saved.base.research.pack,0);assert.equal({}.polluted,undefined);
});
test('a settled run is saved as base only and cannot be restored to pay twice',()=>{
  const s=fixture();s.player.x=1;s.player.y=15;s.cargo=[{kind:'data'}];ok(s,{type:'extract'});const restored=E.parse(E.serialize(s.base,s));assert.equal(restored.run,null);assert.equal(restored.base.credits,18);
});

function nextDirection(a,b){return Object.entries(E.DIR).find(([,d])=>d[0]===b.x-a.x&&d[1]===b.y-a.y)?.[0];}
function safeRound(s){
  const danger=E.liveGuards(s).some(g=>E.attackTiles(s,g).some(p=>p.x===s.player.x&&p.y===s.player.y));
  if(danger&&s.ap>=1&&!s.player.cover)E.act(s,{type:'cover'});
  E.act(s,{type:'end'});
}
function simpleRaid(seed,loadout='scout'){
  const s=E.createRun(seed,initial(),loadout,1);let target=s.caches[0],looted=false;
  for(let i=0;i<230&&s.phase==='raid';i++){
    if(!looted&&E.distance(s.player,target)<=1){if(s.ap<1){safeRound(s);continue;}const pick=E.act(s,{type:'collect',id:target.id});if(pick.ok)looted=true;else safeRound(s);continue;}
    const goal=looted?s.exits[0]:target;
    if(looted&&E.distance(s.player,goal)<=1){if(s.ap<2){safeRound(s);continue;}E.act(s,{type:'extract'});continue;}
    const route=E.path(s,s.player,goal,true);
    if(route.length<2){const adjacent=E.liveGuards(s).find(g=>E.distance(g,s.player)===1);if(adjacent&&s.ap>=1)E.act(s,{type:'push',id:adjacent.id});else safeRound(s);continue;}
    const cost=E.heavy(s)?2:1;if(s.ap<cost){safeRound(s);continue;}
    const moved=E.act(s,{type:'move',dir:nextDirection(s.player,route[1])});if(!moved.ok)safeRound(s);
    invariants(s);
  }
  return s;
}
test('beginner short raids can actually collect and return through hundreds of real enemy turns',()=>{
  let wins=0,turns=0,profit=0;
  for(let i=0;i<80;i++){const s=simpleRaid('beginner-'+i,i%3===0?'operator':i%3===1?'breacher':'scout');assert.notEqual(s.phase,'raid','Beginner route must finish rather than softlock.');turns+=s.turn;invariants(s);if(s.phase==='extracted'){wins++;profit+=s.result.earnings;assert.ok(s.result.goods>0);}}
  console.log(`Beginner policy: ${wins}/80 extractions; ${turns} enemy rounds; mean successful payout ${Math.round(profit/Math.max(1,wins))}. This is a mechanics check, not human fun validation.`);
  assert.ok(wins>=64,`Simple risk-1 retrieval should be learnable, got ${wins}/80.`);
});
function committedRaid(seed,risk,fillPack=false){
  const s=E.createRun(seed,initial(),'scout',risk);
  let looted=false,maxWeight=0;
  for(let decisions=0;decisions<500&&s.phase==='raid';decisions++){
    invariants(s);maxWeight=Math.max(maxWeight,E.weight(s));
    if(s.player.hp<=s.player.maxHp-4&&s.player.meds&&s.ap>=1){E.act(s,{type:'heal'});continue;}
    const haveObjective=E.contractComplete(s);
    const enough=fillPack?E.heavy(s):haveObjective;
    const candidates=s.caches.filter(c=>c.items.some(i=>E.ITEMS[i.kind].weight+E.weight(s)<=s.player.capacity));
    const useful=candidates.filter(c=>fillPack||risk===1||c.items.some(i=>i.kind===(risk===2?'data':'relic')));
    const ordered=useful.map(c=>({c,steps:E.path(s,s.player,c,true).length})).filter(t=>t.steps>0).sort((a,b)=>a.steps-b.steps);
    const target=enough||(!ordered.length&&s.cargo.length)?s.exits[1]:ordered[0]?.c;
    if(!target){safeRound(s);continue;}
    if(E.distance(s.player,target)<=1){
      const cost=target===s.exits[1]?2:1;
      if(s.ap<cost){safeRound(s);continue;}
      if(target===s.exits[1])E.act(s,{type:'extract'});
      else{E.act(s,{type:'collect',id:target.id});looted=true;}
      continue;
    }
    const route=E.path(s,s.player,target,true),cost=E.heavy(s)?2:1;
    if(route.length<2||s.ap<cost){
      const blocker=E.liveGuards(s).find(g=>E.distance(s.player,g)===1);
      if(blocker&&s.ap>=1&&E.act(s,{type:'push',id:blocker.id}).ok)continue;
      safeRound(s);continue;
    }
    if(!E.act(s,{type:'move',dir:nextDirection(s.player,route[1])}).ok)safeRound(s);
  }
  while(s.phase==='raid')safeRound(s);
  invariants(s);return{s,looted,maxWeight};
}

test('three regions support actual objective loot and remote extraction without injected resources',()=>{
  for(let risk=1;risk<=3;risk++){
    let success=0,earned=0,turns=0;
    for(let i=0;i<24;i++){
      const{s}=committedRaid('remote-'+i,risk);turns+=s.turn;
      if(s.phase==='extracted'){success++;earned+=s.result.earnings;assert.ok(s.result.remote>0);assert.ok(s.result.bonus>0);assert.equal(s.base.runs,1);}
      else assert.equal(s.base.credits,0);
      assert.equal(E.parse(E.serialize(s.base,s)).run,null);
    }
    console.log(`Remote objective policy, region ${risk}: ${success}/24 extractions, ${turns} enemy turns, successful mean payout ${Math.round(earned/Math.max(success,1))}. Omniscient automated route, NOT human difficulty/fun evidence.`);
    assert.ok(success>=12,`Region ${risk} must permit a majority of reasonable remote objective routes, got ${success}/24.`);
  }
});

test('full packs remain playable across generated maps, with real slower movement and a finish state',()=>{
  let heavy=0,success=0;
  for(let i=0;i<24;i++){
    const{s,maxWeight}=committedRaid('loaded-'+i,1,true);
    if(maxWeight>=Math.ceil(s.player.capacity*.8))heavy++;
    if(s.phase==='extracted')success++;
    assert.notEqual(s.phase,'raid');assert.ok(s.turn<=s.limit);assert.ok(s.log.length<1400);
  }
  console.log(`Loaded policy: ${heavy}/24 reached heavy load, ${success}/24 remote extractions.`);
  assert.ok(heavy>=18);assert.ok(success>=12);
});

test('random action stress preserves invariants and determinism over 72 runs, three risk levels and thousands of decisions',()=>{
  let decisions=0,rounds=0;
  for(let seed=0;seed<24;seed++)for(let risk=1;risk<=3;risk++){
    const a=E.createRun('stress-'+seed,initial(),Object.keys(E.LOADOUTS)[seed%3],risk),b=E.createRun('stress-'+seed,initial(),Object.keys(E.LOADOUTS)[seed%3],risk);let rng=seed+99;
    for(let i=0;i<260&&a.phase==='raid';i++){
      rng=(Math.imul(rng,1664525)+1013904223)>>>0;const commands=[{type:'end'},{type:'move',dir:'up'},{type:'move',dir:'down'},{type:'move',dir:'left'},{type:'move',dir:'right'},{type:'dash',dir:'left'},{type:'collect'},{type:'cover'},{type:'emp'},{type:'heal'},{type:'extract'}];
      const g=E.liveGuards(a).find(t=>E.visible(a,t.x,t.y));if(g)commands.push({type:'shoot',id:g.id},{type:'push',id:g.id});if(a.cargo.length)commands.push({type:'drop',index:0});const command=commands[rng%commands.length];
      const ar=E.act(a,command),br=E.act(b,command);assert.equal(ar.ok,br.ok);assert.equal(JSON.stringify(a),JSON.stringify(b));invariants(a);decisions++;if(command.type==='end'&&ar.ok)rounds++;
      if(a.phase==='raid'&&i%43===0)assert.equal(JSON.stringify(E.parse(E.serialize(a.base,a)).run),JSON.stringify(a));
    }
    while(a.phase==='raid'){ok(a,{type:'end'});rounds++;invariants(a);}assert.ok(a.settled);assert.equal(E.parse(E.serialize(a.base,a)).run,null);
  }
  console.log(`Stress: ${decisions} decisions, ${rounds} enemy rounds; no promise of browser render/performance coverage.`);
});
