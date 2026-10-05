import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('../development/echo-expedition.html',import.meta.url),'utf8');
const context=vm.createContext({});
vm.runInContext(html.match(/<script id="echo-engine">([\s\S]*?)<\/script>/)[1],context);
const E=context.EchoExpedition,clone=x=>JSON.parse(JSON.stringify(x));
const base=()=>E.campaignBase({});
function prepared(){const b=base();for(const id of Object.keys(E.MISSIONS))b.campaign.cleared[id]=1;return b;}
function fixture(id='survey'){
  const s=E.createRun('campaign-fixture',prepared(),'scout',E.MISSIONS[id].risk,{operation:id});
  s.map=Array.from({length:E.H},(_,y)=>Array.from({length:E.W},(_,x)=>x===0||y===0||x===E.W-1||y===E.H-1?1:0));
  s.player.x=5;s.player.y=7;s.guards=[];s.caches=[];s.hazards=[];s.noises=[];s.alert=0;s.log=[];
  s.objectives.forEach((n,i)=>{n.x=6+i;n.y=7;});return s;
}
function guard(s,role,x=7,y=7){const g={id:s.guards.length+1,role,x,y,hp:E.GUARD_TYPES[role].hp,homeX:x,homeY:y,stunned:0,intent:{type:'wait',x,y,damage:0}};s.guards.push(g);return g;}
function ok(s,c){const r=E.act(s,c);assert.equal(r.ok,true,r.message);return r;}
function refused(s,c){const before=JSON.stringify(s);assert.equal(E.act(s,c).ok,false);assert.equal(JSON.stringify(s),before,'Refusal must not consume AP, energy, items or progress.');}
function invariants(s){assert.ok(s.ap>=0&&s.ap<=3);assert.ok(s.player.hp>=0&&s.player.hp<=s.player.maxHp);assert.ok(E.weight(s)<=s.player.capacity);const cells=new Set();for(const g of E.liveGuards(s)){assert.ok(E.passable(s,g.x,g.y));assert.notEqual(`${g.x},${g.y}`,`${s.player.x},${s.player.y}`);assert.ok(!cells.has(`${g.x},${g.y}`));cells.add(`${g.x},${g.y}`);}if(s.phase==='raid')assert.deepEqual(clone(s.base),clone(s.startBase),'Campaign records cannot be paid or committed before extraction.');}

test('campaign integration is optional, original free raid base shape is unchanged',()=>{
  const s=E.createRun('old-free');assert.equal(s.operation,undefined);assert.equal(s.rules,undefined);assert.equal(s.base.campaign,undefined);
  assert.equal(E.parse(E.serialize(s.base,s)).run.operation,undefined);
  refused(s,{type:'interact'});refused(s,{type:'scan'});
  for(const id of ['campaign-button','free-raid-button','mission-choices','interact-button','scan-button'])assert.ok(html.includes(`id="${id}"`));
  assert.ok(html.includes('E.announcedThreats(s)'),'Renderer must not gate locked attack tiles on attacker visibility.');
});
test('campaign prerequisites use normalized finite records, not money or truthy invalid values',()=>{
  assert.equal(E.missionAvailable({credits:1000000},'archive'),false);
  assert.equal(E.missionAvailable({campaign:{cleared:{survey:true}}},'archive'),false);
  assert.equal(E.missionAvailable({campaign:{cleared:{survey:Infinity}}},'archive'),false);
  assert.throws(()=>E.createRun('no-proof',base(),'scout',2,{operation:'archive'}));
  assert.throws(()=>E.createRun('wrong-risk',prepared(),'scout',1,{operation:'archive'}));
  assert.throws(()=>E.createRun('bad',base(),'scout',1,{operation:'__proto__'}));
  assert.ok(E.missionAvailable(base(),'survey'));assert.ok(!E.missionAvailable(base(),'broadcast'));
  const b=base();b.campaign.cleared.survey=1;assert.ok(E.missionAvailable(b,'archive'));assert.ok(E.missionAvailable(b,'grid'));assert.ok(!E.missionAvailable(b,'broadcast'));
  b.campaign.cleared.archive=1;b.campaign.cleared.grid=1;assert.ok(E.missionAvailable(b,'broadcast'));
});
test('campaign normalization clamps counters and ignores prototype-named records',()=>{
  const b=E.campaignBase({campaign:{cleared:{survey:99999,archive:-1,grid:3,broadcast:NaN,__proto__:3}}});
  assert.deepEqual(clone(b.campaign.cleared),{survey:0,archive:0,grid:3,broadcast:0});
  assert.equal({}.polluted,undefined);assert.equal(E.missionAvailable(b,'__proto__'),false);
});
test('240 seeded campaign maps have reachable unique public sites and valid distinct enemy roles',()=>{
  for(let seed=0;seed<60;seed++)for(const [id,m] of Object.entries(E.MISSIONS)){
    const s=E.createRun('campaign-map-'+seed,prepared(),'scout',m.risk,{operation:id});invariants(s);
    const sites=new Set();for(const node of s.objectives){assert.ok(E.path(s,s.player,node).length>=5);assert.ok(s.seen[node.y][node.x]);const key=`${node.x},${node.y}`;assert.ok(!sites.has(key));sites.add(key);assert.ok(!s.caches.some(c=>c.x===node.x&&c.y===node.y));assert.ok(!E.liveGuards(s).some(g=>g.x===node.x&&g.y===node.y));}
    assert.ok(s.guards.every(g=>Object.hasOwn(E.GUARD_TYPES,g.role)));assert.ok(s.guards.some(g=>g.role==='drone'));assert.ok(s.guards.some(g=>g.role==='sentry'));
    assert.equal(JSON.stringify(E.createRun(s.seed,prepared(),'scout',m.risk,{operation:id})),JSON.stringify(s));
  }
});
test('survey is an actual paid nearby interaction and not a value threshold',()=>{
  const s=fixture();s.cargo=[{kind:'relic'}];assert.equal(E.objectiveState(s).ready,false);
  refused(s,{type:'interact',id:2});ok(s,{type:'interact',id:1});assert.equal(s.ap,2);assert.equal(E.objectiveState(s).progress,1);refused(s,{type:'interact',id:1});
  ok(s,{type:'move',dir:'right'});ok(s,{type:'interact',id:2});assert.ok(E.objectiveState(s).ready);assert.equal(s.base.campaign.cleared.survey,1,'No unextracted proof update.');
});
test('unextracted site records are lost on failure, not converted into progression',()=>{
  const s=fixture();s.startBase.campaign.cleared.survey=0;s.base.campaign.cleared.survey=0;
  ok(s,{type:'interact',id:1});ok(s,{type:'move',dir:'right'});ok(s,{type:'interact',id:2});s.player.hp=1;
  const g=guard(s,'patrol',8,7);g.intent={type:'aim',x:s.player.x,y:s.player.y,damage:2};ok(s,{type:'end'});
  assert.equal(s.phase,'defeated');assert.equal(s.base.campaign.cleared.survey,0);assert.equal(s.result.mission,0);assert.equal(s.result.missionComplete,false);
});
test('successful report-only survey can evacuate with no loot and pays once',()=>{
  const s=fixture();s.base.campaign.cleared.survey=0;s.startBase.campaign.cleared.survey=0;
  ok(s,{type:'interact',id:1});ok(s,{type:'move',dir:'right'});ok(s,{type:'interact',id:2});s.player.x=s.exits[0].x;s.player.y=s.exits[0].y;s.ap=3;
  ok(s,{type:'extract'});assert.equal(s.result.mission,130);assert.equal(s.result.goods,0);assert.equal(s.base.campaign.cleared.survey,1);assert.equal(s.base.credits,130);refused(s,{type:'extract'});assert.equal(E.parse(E.serialize(s.base,s)).run,null);
});
test('repeat first mission has bounded quarter reward and cannot purchase missing branch proofs',()=>{
  const s=fixture();s.objectives.forEach(n=>{n.done=true;n.progress=1;});s.player.x=s.exits[0].x;s.player.y=s.exits[0].y;
  assert.equal(E.objectiveState(s).reward,32);ok(s,{type:'extract'});assert.equal(s.result.mission,32);assert.equal(s.base.campaign.cleared.survey,2);
  const b=E.campaignBase({credits:1000000,campaign:{cleared:{survey:1}}});assert.equal(E.missionAvailable(b,'broadcast'),false);
});
test('archive needs two real stages across turns and two units of available capacity',()=>{
  const s=fixture('archive');ok(s,{type:'interact',id:1});assert.equal(s.ap,1);s.ap=3;refused(s,{type:'interact',id:1});ok(s,{type:'end'});
  s.cargo=Array.from({length:6},()=>({kind:'scrap'}));refused(s,{type:'interact',id:1});assert.equal(s.objectives[0].progress,1);ok(s,{type:'drop',index:0});ok(s,{type:'interact',id:1});assert.equal(s.objectives[0].progress,2);assert.equal(s.cargo.filter(i=>i.kind==='archive').length,1);assert.ok(E.objectiveState(s).ready);refused(s,{type:'interact',id:1});
});
test('dropping or selling unrelated loot cannot forge an archive proof; actual dropped box can be recovered',()=>{
  const s=fixture('archive');ok(s,{type:'interact'});ok(s,{type:'end'});ok(s,{type:'interact'});ok(s,{type:'drop',index:0});assert.equal(E.objectiveState(s).ready,false);s.ap=3;
  ok(s,{type:'collect',id:s.caches[0].id});assert.ok(E.objectiveState(s).ready);assert.equal(s.cargo[0].proof,'archive');assert.equal(s.caches[0].items.length,0);
});
test('two power nodes really stop electrical damage and disable sentries without globally freezing patrols',()=>{
  const s=fixture('grid');const sentry=guard(s,'sentry',8,7),patrol=guard(s,'patrol',10,7);s.hazards=[{x:6,y:7}];
  ok(s,{type:'interact',id:1});assert.equal(s.powerDisabled,false);assert.equal(sentry.stunned,2);assert.equal(patrol.stunned,0);ok(s,{type:'end'});ok(s,{type:'move',dir:'right'});ok(s,{type:'interact',id:2});assert.ok(s.powerDisabled);assert.equal(E.hazardActive(s),false);assert.equal(E.damageForecast(s).electric,0);
});
test('only extracted grid record gives future campaign buffer, never free-mode stat inflation',()=>{
  const b=prepared();const camp=E.createRun('buffer',b,'scout',3,{operation:'broadcast'}),free=E.createRun('buffer',b,'scout',3);
  assert.equal(camp.limit,E.REGIONS[3].turns+2);assert.equal(free.limit,E.REGIONS[3].turns);
  const n=base();n.campaign.cleared.survey=1;const grid=E.createRun('buffer',n,'scout',3,{operation:'grid'});assert.equal(grid.limit,E.REGIONS[3].turns);
});
test('broadcast cannot start before antennas, charge remotely, instantly finish, or pay via near exit',()=>{
  const s=fixture('broadcast');s.player.x=7;refused(s,{type:'interact',id:3});s.player.x=5;ok(s,{type:'interact',id:1});s.player.x=6;ok(s,{type:'interact',id:2});s.player.x=7;s.ap=3;ok(s,{type:'interact',id:3});
  assert.equal(s.objectives[2].progress,0);refused(s,{type:'interact',id:3});s.player.x=2;ok(s,{type:'end'});assert.equal(s.objectives[2].progress,0);
  s.player.x=7;ok(s,{type:'end'});assert.equal(s.objectives[2].progress,1);assert.equal(E.objectiveState(s).ready,false);ok(s,{type:'end'});assert.equal(s.objectives[2].progress,2);assert.equal(E.objectiveState(s).ready,true);
  s.player.x=s.exits[0].x;s.player.y=s.exits[0].y;ok(s,{type:'extract'});assert.equal(s.result.mission,0);assert.equal(s.result.missionComplete,false);
});
test('final broadcast needs alive held phases then actual remote evacuation, not an end command after death',()=>{
  const s=fixture('broadcast');s.objectives.filter(n=>n.kind==='antenna').forEach(n=>n.done=true);const station=s.objectives[2];s.player.x=station.x;s.ap=3;ok(s,{type:'interact',id:station.id});ok(s,{type:'end'});ok(s,{type:'end'});s.player.x=s.exits[1].x;s.player.y=s.exits[1].y;ok(s,{type:'extract'});assert.ok(s.result.missionComplete);assert.equal(s.result.mission,85);
  const t=fixture('broadcast');t.objectives.filter(n=>n.kind==='antenna').forEach(n=>n.done=true);t.player.x=t.objectives[2].x;ok(t,{type:'interact',id:3});t.player.hp=1;const g=guard(t,'patrol',9,7);g.intent={type:'aim',x:t.player.x,y:t.player.y,damage:3};ok(t,{type:'end'});assert.equal(t.phase,'defeated');assert.equal(t.objectives[2].progress,0);
});
test('scanner shares visibility and terrain reveal at distance seven through nine, expires and does not shoot farther',()=>{
  const s=fixture('archive');s.seen=Array.from({length:E.H},()=>Array(E.W).fill(false));s.player.x=2;s.player.y=7;const g=guard(s,'sentry',9,7);s.caches=[{id:1,x:10,y:7,items:[{kind:'data'}],supply:false}];
  assert.equal(E.visible(s,9,7),false);ok(s,{type:'scan'});assert.equal(s.ap,2);assert.equal(s.player.energy,2);
  for(const x of [9,10,11]){assert.ok(E.visible(s,x,7));assert.ok(s.seen[7][x]);}refused(s,{type:'shoot',id:g.id});refused(s,{type:'scan'});ok(s,{type:'end'});assert.equal(E.visible(s,9,7),false);assert.ok(s.seen[7][10],'Known cache stays explored, not currently visible.');
});
test('scanner obeys wall/corner visibility and cannot spend before archive record is earned',()=>{
  const s=fixture('survey');s.startBase.campaign.cleared.archive=0;s.base.campaign.cleared.archive=0;refused(s,{type:'scan'});
  const t=fixture('archive');t.map[7][7]=1;ok(t,{type:'scan'});assert.equal(E.visible(t,9,7),false);
  const u=fixture('archive');u.map[5][6]=1;u.map[6][5]=1;assert.equal(E.lineOfSight(u,{x:5,y:5},{x:6,y:6}),false);assert.equal(E.lineOfSight(u,{x:6,y:6},{x:5,y:5}),false);
  const old=E.createRun('old-corner');old.map=u.map;assert.equal(E.lineOfSight(old,{x:5,y:5},{x:6,y:6}),true,'Legacy v1 replay uses its old corner rule, not silent rules migration.');
});
test('campaign conservative LOS is symmetric over hundreds of rays',()=>{
  for(const id of ['survey','archive','grid','broadcast']){const s=E.createRun('los-check',prepared(),'scout',E.MISSIONS[id].risk,{operation:id});for(let i=0;i<160;i++){const a={x:1+i%15,y:1+i%13},b={x:17-i%11,y:15-i%9};assert.equal(E.lineOfSight(s,a,b),E.lineOfSight(s,b,a));}}
});
test('unseen attacker does not erase a visible locked threat or its exact damage forecast',()=>{
  const s=E.createRun('hidden-attacker',{},'scout',2);s.map=fixture().map;s.guards=[];s.hazards=[];s.player.x=8;s.player.y=7;const g=guard(s,'patrol',2,7);delete g.role;ok(s,{type:'end'});assert.equal(E.attackTiles(s,g).length,3);ok(s,{type:'move',dir:'right'});
  assert.equal(E.visible(s,g.x,g.y),false);assert.ok(E.announcedThreats(s).some(t=>t.x===9&&t.y===7));assert.equal(E.damageForecast(s).total,2);const hp=s.player.hp;ok(s,{type:'end'});assert.equal(hp-s.player.hp,2);
});
test('forecast and executed damage share cover, plating, electric and multiple-attack reductions',()=>{
  const s=fixture('grid');s.turn=2;s.base.research.plating=3;s.startBase.research.plating=3;s.player.hp=11;s.player.maxHp=11;s.hazards=[{x:5,y:7}];
  const a=guard(s,'patrol',7,7),b=guard(s,'patrol',5,5);for(const g of [a,b])g.intent={type:'aim',x:5,y:7,damage:3};ok(s,{type:'cover'});
  const forecast=E.damageForecast(s);assert.equal(forecast.total,2);assert.equal(forecast.electric,2);ok(s,{type:'end'});assert.equal(s.player.hp,9);
});
test('unseen fog does not display positions of the attacker or hidden attack tiles',()=>{
  const s=fixture();const g=guard(s,'sentry',14,7);g.intent={type:'aim',x:13,y:7,tiles:[{x:5,y:7},{x:13,y:7}],damage:2};const threats=clone(E.announcedThreats(s));assert.deepEqual(threats,[{x:5,y:7,damage:2}]);assert.equal(threats[0].id,undefined);
});
test('sentry waits in place; drones announce and execute both steps with collision checks',()=>{
  const s=fixture();s.player.x=1;s.player.y=1;const sentry=guard(s,'sentry',15,13),drone=guard(s,'drone',12,13);s.noises=[{x:9,y:13,radius:6,expires:3}];ok(s,{type:'end'});assert.equal(sentry.intent.type,'wait');assert.equal(drone.intent.path.length,2);const route=clone(drone.intent.path),before={x:drone.x,y:drone.y};
  assert.equal(E.distance(before,route[0]),1);assert.equal(E.distance(route[0],route[1]),1);s.map[route[1].y][route[1].x]=1;ok(s,{type:'end'});assert.equal(drone.x,route[0].x);assert.equal(drone.y,route[0].y);assert.equal(sentry.x,15);assert.equal(sentry.y,13);
});
test('bulwark armor and anchored push have readable real effects, EMP permits displacement',()=>{
  const s=fixture(),g=guard(s,'bulwark',6,7);ok(s,{type:'shoot',id:g.id});assert.equal(g.hp,4);ok(s,{type:'push',id:g.id});assert.equal(g.x,6);assert.equal(g.stunned,1);ok(s,{type:'end'});s.ap=3;ok(s,{type:'emp'});ok(s,{type:'push',id:g.id});assert.equal(g.x,7);assert.equal(g.intent.type,'wait');
});
test('collect target falls back from distant, empty and uncarryable selection to actual nearby goods',()=>{
  const s=fixture();s.caches=[{id:1,x:12,y:7,items:[{kind:'data'}],supply:false},{id:2,x:6,y:7,items:[{kind:'data'}],supply:false}];assert.equal(E.collectableCache(s,1).id,2);ok(s,{type:'collect'});assert.equal(s.cargo[0].kind,'data');assert.equal(E.collectableCache(s,2),null);
  s.cargo=Array.from({length:6},()=>({kind:'scrap'}));s.caches[1].supply=true;assert.equal(E.collectableCache(s,1).id,2);
});
test('new operation commands and progress roundtrip through actual same-source replay',()=>{
  for(const [id,m] of Object.entries(E.MISSIONS)){
    const s=E.createRun('campaign-replay',prepared(),'operator',m.risk,{operation:id});const dir=Object.entries(E.DIR).find(([,d])=>E.passable(s,s.player.x+d[0],s.player.y+d[1]))[0];ok(s,{type:'move',dir});ok(s,{type:'scan'});ok(s,{type:'end'});
    const saved=E.serialize(s.base,s);assert.equal(JSON.stringify(E.parse(saved).run),JSON.stringify(s));assert.equal(JSON.parse(saved).run.rules,2);
  }
});
test('invalid rule versions, operation changes, wrong risk or direct fake progress cannot bypass replay',()=>{
  const s=E.createRun('bad-replay',base(),'scout',1,{operation:'survey'}),raw=JSON.parse(E.serialize(s.base,s));
  for(const mutation of [r=>r.rules=3,r=>delete r.rules,r=>r.operation='__proto__',r=>r.risk=2,r=>r.operation='archive',r=>r.commands=[{type:'interact',id:1}],r=>r.commands=[{type:'interact',id:-1}],r=>r.commands=[{type:'teleport'}]]){const bad=clone(raw);mutation(bad.run);assert.throws(()=>E.parse(JSON.stringify(bad)));}
  const fake=clone(raw);fake.run.objectives=[{done:true}];fake.run.player={hp:999};fake.run.complete=true;assert.equal(E.objectiveState(E.parse(JSON.stringify(fake)).run).progress,0,'Imported direct fields are ignored; commands determine progress.');
});

function direction(a,b){return Object.entries(E.DIR).find(([,d])=>d[0]===b.x-a.x&&d[1]===b.y-a.y)?.[0];}
function endSafely(s,hold=null){
  const damage=E.damageForecast(s).total;
  if(damage&&s.ap>=2&&s.player.energy&&E.liveGuards(s).some(g=>E.distance(g,s.player)<=4))E.act(s,{type:'emp'});
  if(E.damageForecast(s).total&&s.ap>=1&&!s.player.cover)E.act(s,{type:'cover'});
  if(E.damageForecast(s).total&&s.ap>0){const free=Object.entries(E.DIR).map(([dir,d])=>({dir,x:s.player.x+d[0],y:s.player.y+d[1]})).filter(t=>E.passable(s,t.x,t.y)&&!E.liveGuards(s).some(g=>g.x===t.x&&g.y===t.y)&&(!hold||E.distance(t,hold)<=2&&E.lineOfSight(s,t,hold)));const safe=free.find(t=>!E.announcedThreats(s).some(a=>a.x===t.x&&a.y===t.y)&&!(E.hazardActive(s)&&s.hazards.some(h=>h.x===t.x&&h.y===t.y)));if(safe)E.act(s,{type:'move',dir:safe.dir});}
  E.act(s,{type:'end'});
}
function operationPolicy(seed,b,id){
  const s=E.createRun(seed,b,'operator',E.MISSIONS[id].risk,{operation:id});
  for(let decision=0;decision<700&&s.phase==='raid';decision++){
    invariants(s);
    if(s.player.hp<=s.player.maxHp-4&&s.player.meds&&s.ap>=1){ok(s,{type:'heal'});continue;}
    const state=E.objectiveState(s),station=s.objectives.find(n=>n.kind==='broadcast');
    if(station?.armed&&!station.done&&E.distance(s.player,station)<=2&&E.lineOfSight(s,s.player,station)){endSafely(s,station);continue;}
    const pending=s.objectives.filter(n=>!n.done&&(n.kind!=='broadcast'||s.objectives.filter(a=>a.kind==='antenna').every(a=>a.done)));
    const target=state.ready?s.exits[state.requiresRemote?1:0]:pending.map(n=>({n,d:E.path(s,s.player,n,true).length||999})).sort((a,b)=>a.d-b.d)[0]?.n;
    if(!target){endSafely(s);continue;}
    const interaction=E.distance(s.player,target)<=1;
    if(interaction){const cost=target===s.exits[0]||target===s.exits[1]?2:['archive','grid','broadcast'].includes(target.kind)?2:1;
      if(s.ap<cost||target.kind==='archive'&&target.lastTurn===s.turn){endSafely(s);continue;}
      const result=E.act(s,{type:target===s.exits[0]||target===s.exits[1]?'extract':'interact',id:target.id});if(result.ok)continue;endSafely(s);continue;
    }
    if(s.ap<(E.heavy(s)?2:1)){endSafely(s);continue;}
    const neighbors=Object.entries(E.DIR).map(([dir,d])=>({dir,x:s.player.x+d[0],y:s.player.y+d[1]})).filter(t=>E.passable(s,t.x,t.y)&&!E.liveGuards(s).some(g=>g.x===t.x&&g.y===t.y));
    const threats=E.announcedThreats(s),ranked=neighbors.map(t=>({t,d:E.path(s,t,target,true).length||999,risk:threats.filter(a=>a.x===t.x&&a.y===t.y).reduce((sum,a)=>sum+a.damage,0)+(E.hazardActive(s)&&s.hazards.some(h=>h.x===t.x&&h.y===t.y)?2:0)})).sort((a,b)=>a.d+(s.ap===1?a.risk*7:a.risk)-b.d-(s.ap===1?b.risk*7:b.risk));
    if(ranked[0]?.d<999){ok(s,{type:'move',dir:ranked[0].t.dir});continue;}
    const blocker=E.liveGuards(s).find(g=>E.distance(g,s.player)===1);if(blocker&&s.ap>=1&&E.act(s,{type:'push',id:blocker.id}).ok)continue;endSafely(s);
  }
  while(s.phase==='raid')endSafely(s);invariants(s);return s;
}
test('normal starter resources and real movement can complete full generated four-operation campaigns',()=>{
  let completed=0,totalTurns=0,totalEarnings=0,attempts=0;
  for(let seed=0;seed<24;seed++){
    let b=base();let all=true;
    for(const id of ['survey','archive','grid','broadcast']){
      let clear=false;for(let retry=0;retry<3;retry++){const s=operationPolicy(`full-${seed}-${retry}-${id}`,b,id);totalTurns+=s.turn;attempts++;if(s.result.missionComplete){b=s.base;totalEarnings+=s.result.earnings;clear=true;assert.ok(E.parse(E.serialize(b,s)).base.campaign.cleared[id]>0);break;}}
      if(!clear){all=false;break;}
    }
    if(all){completed++;assert.ok(b.campaign.cleared.broadcast>0);assert.ok(b.credits>=900&&b.credits<=1600,'First clear economy should remain bounded, not inflate to millions.');}
  }
  console.log(`Campaign mechanics policy: ${completed}/24 full campaigns, ${attempts} deployments, ${totalTurns} enemy turns, ${totalEarnings} returned credits. Omniscient commands, not subjective fun/difficulty proof.`);
  assert.ok(completed>=18,`At least 18 generated campaigns should be attainable without injecting HP/resources/proofs; got ${completed}.`);
});
test('random campaign action pressure preserves AP, proof isolation, collisions and replay determinism',()=>{
  let decisions=0;for(let seed=0;seed<8;seed++)for(const [id,m] of Object.entries(E.MISSIONS)){
    const a=E.createRun('pressure-'+seed,prepared(),'scout',m.risk,{operation:id}),b=E.createRun('pressure-'+seed,prepared(),'scout',m.risk,{operation:id});let rng=seed+29;
    for(let tick=0;tick<180&&a.phase==='raid';tick++){rng=(Math.imul(rng,1664525)+1013904223)>>>0;const choices=[{type:'end'},{type:'interact'},{type:'interact',id:99},{type:'scan'},{type:'cover'},{type:'emp'},{type:'collect'},{type:'extract'},...Object.keys(E.DIR).map(dir=>({type:'move',dir}))];const c=choices[rng%choices.length];assert.equal(E.act(a,c).ok,E.act(b,c).ok);assert.equal(JSON.stringify(a),JSON.stringify(b));invariants(a);decisions++;if(a.phase==='raid'&&tick%37===0)assert.equal(JSON.stringify(E.parse(E.serialize(a.base,a)).run),JSON.stringify(a));}
    while(a.phase==='raid')E.act(a,{type:'end'});assert.equal(E.parse(E.serialize(a.base,a)).run,null);
  }console.log(`Campaign stress: ${decisions} actual decisions across 32 deployments.`);
});
