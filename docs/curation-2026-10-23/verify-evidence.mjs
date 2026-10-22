/**
 * One-off curation evidence for the 2026-10-23 review.
 *
 * Run manually: node docs/curation-2026-10-23/verify-evidence.mjs
 * This is NOT a daily regression suite or a promise to maintain archived games.
 * It evaluates the reviewed HTML's production rule prefixes in isolated VMs;
 * it does not open a browser, mutate saves, edit sources, or reproduce the game
 * rules in a parallel test engine. Prefix boundaries are deliberately specific
 * to the reviewed snapshot and fail loudly when that source structure changes.
 * Hash normalization: remove an initial BOM; convert CRLF / CR to LF; retain all
 * other source bytes (including whitespace and the final newline).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const reviewed = [];

function readProduction(file, boundary, expression) {
  const source = readFileSync(resolve(root, file), 'utf8')
    .replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  const script = scripts.map(match => match[1])
    .find(text => /\(\s*\(\s*\)\s*=>\s*\{/.test(text));
  assert.ok(script, `${file}: reviewed inline IIFE was not found`);
  const opening = script.match(/\(\s*\(\s*\)\s*=>\s*\{/);
  const body = script.slice(opening.index + opening[0].length);
  const end = body.indexOf(boundary);
  assert.ok(end > 0, `${file}: reviewed rule boundary was not found: ${boundary}`);
  assert.equal(body.indexOf(boundary, end + boundary.length), -1,
    `${file}: rule boundary is ambiguous`);

  // Only the selected prefixes run: UI handlers/render calls after the boundary
  // are excluded. The tiny DOM and save-read shims satisfy top-level bindings;
  // unexpected rendering / writes are errors, not silently accepted operations.
  const context = vm.createContext({
    document: { getElementById: () => ({ getContext: () => ({}) }) },
    localStorage: {
      getItem: () => null,
      setItem: () => { throw new Error('Audit must not write a save'); },
    },
    TextEncoder,
    TextDecoder,
  }, { codeGeneration: { strings: false, wasm: false } });
  const raw = new vm.Script(`${body.slice(0, end)}\n;JSON.stringify(${expression});`,
    { filename: `${file}:reviewed-rules` }).runInContext(context, { timeout: 30_000 });
  const result = JSON.parse(raw);
  reviewed.push({
    file,
    sha256NormalizedSource: createHash('sha256').update(source, 'utf8').digest('hex'),
    evidence: result,
  });
  return result;
}

const post = readProduction('time-post.html', 'let save=loadSave()', `(() => {
  const groups = new Map();
  for (const m of missions) {
    const signature = JSON.stringify({
      slots:m.slots, tasks:m.tasks.map(({name,...rule}) => rule),
      reference:m.reference, target:m.target, blocks:m.blocks
    });
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(m.id);
  }
  return {missions:missions.length, distinctRuleSets:groups.size,
    identicalRuleGroups:[...groups.values()]};
})()`);
assert.equal(post.missions, 12);
assert.deepEqual(post.identicalRuleGroups, [
  ['p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8'], ['p9', 'p10', 'p11', 'p12'],
]);

const battery = readProduction('battery-cycle.html', 'function freshProfile()', `(() => {
  const references = CONTRACTS.map(c => c.reference);
  return {contracts:CONTRACTS.length,
    distinctOptimalReferences:new Set(references.map(r => JSON.stringify(r))).size,
    threeStarReferences:CONTRACTS.filter(c => evaluate(c.index,c.reference,0).stars===3).length,
    optimalModeUses:Object.fromEntries(Object.keys(MODES).map(mode => [mode,
      references.reduce((sum,r) => sum+r.filter(x => x===mode).length,0)]))};
})()`);
assert.equal(battery.contracts, 12);
assert.equal(battery.threeStarReferences, 12);
assert.equal(battery.distinctOptimalReferences, 5);
assert.deepEqual(battery.optimalModeUses,
  { rest: 20, slow: 32, fast: 0, load: 13, balance: 0, pulse: 7 });

const wind = readProduction('wind-tunnel-contracts.html', 'function freshProfile()', `(() => {
  let parameterSets=0, rowsChecked=0, speedIndependentMargins=0, maxScalingDeviation=0;
  for (const wing of Object.keys(WINGS)) for (const angle of ANGLES)
  for (const flap of FLAPS) for (const surface of Object.keys(SURF)) {
    const plan={wing,angle,flap,surface}, unit=run(plan,1);
    parameterSets++;
    for (const contract of CONTRACTS) {
      const rows=simulate(plan,contract).rows;
      if(rows.every(row => row.margin===unit.margin)) speedIndependentMargins++;
      for(const row of rows) {
        rowsChecked++;
        maxScalingDeviation=Math.max(maxScalingDeviation,
          Math.abs(row.lift-unit.lift*row.speed*row.speed),
          Math.abs(row.drag-unit.drag*row.speed*row.speed));
      }
    }
  }
  return {contracts:CONTRACTS.length,parameterSets,rowsChecked,speedIndependentMargins,
    maxDeviationFromSpeedSquaredAfterCentirounding:Number(maxScalingDeviation.toFixed(6)),
    threeStarReferences:CONTRACTS.filter(c=>evaluate(c.index,c.reference,0).stars===3).length};
})()`);
assert.equal(wind.contracts, 12);
assert.equal(wind.parameterSets, 180);
assert.equal(wind.rowsChecked, 6480);
assert.equal(wind.speedIndependentMargins, wind.contracts * wind.parameterSets);
assert.ok(wind.maxDeviationFromSpeedSquaredAfterCentirounding <= 0.02,
  'Three-speed lift/drag no longer differ only by speed² and centirounding');
assert.equal(wind.threeStarReferences, 12);

const rescue = readProduction('silent-rescue.html', 'function freshProfile()', `(() => {
  const targets={}, sensorSets={};
  for(const m of MISSIONS) {
    const target=[m.target.r,m.target.c].join(','), sensors=m.reference.join(',');
    targets[target]=(targets[target]||0)+1;
    sensorSets[sensors]=(sensorSets[sensors]||0)+1;
  }
  return {missions:MISSIONS.length,targetCounts:targets,optimalSensorSetCounts:sensorSets,
    threeStarReferences:MISSIONS.filter(m=>evaluate(m.index,m.reference,m.target,0).stars===3).length};
})()`);
assert.equal(rescue.missions, 12);
assert.deepEqual(rescue.targetCounts, { '0,1': 10, '0,2': 2 });
assert.deepEqual(rescue.optimalSensorSetCounts, { '0,1,3': 4, '0,1,2': 8 });
assert.equal(rescue.threeStarReferences, 12);

const strata = readProduction('stratigraphy-lab.html', 'function freshProfile()', `(() => {
  const completeChain=s => s.reference.slice(1).every((id,p) =>
    s.clues.some(c => c.older===s.reference[p]&&c.newer===id));
  const orderedAnswer=s => s.clues.slice(0,s.events.length-1).every((c,p) =>
    c.older===s.reference[p]&&c.newer===s.reference[p+1]);
  return {sites:SITES.length,explicitFullAnswerChains:SITES.filter(completeChain).length,
    answersAlreadyOrderedInFirstClues:SITES.filter(orderedAnswer).length,
    threeStarReferences:SITES.filter(s=>evaluate(s.index,s.reference,0,s.par).stars===3).length};
})()`);
assert.equal(strata.sites, 12);
assert.equal(strata.explicitFullAnswerChains, 12);
assert.equal(strata.answersAlreadyOrderedInFirstClues, 12);
assert.equal(strata.threeStarReferences, 12);

const stowage = readProduction('orbital-stowage.html', 'function freshProfile()', `(() => {
  const geometry=v => v.slots.map(({cold,...slot}) => slot);
  return {voyages:VOYAGES.length,
    identityReferences:VOYAGES.filter(v=>v.reference.every((id,i)=>id===i)).length,
    identityThreeStarWins:VOYAGES.filter(v=>evaluate(v.index,
      Array.from({length:10},(_,i)=>i),0,10).stars===3).length,
    distinctSlotLayoutsExcludingColdTags:new Set(VOYAGES.map(v=>JSON.stringify(geometry(v)))).size,
    distinctCargoWeightLists:new Set(VOYAGES.map(v=>JSON.stringify(v.cargoes.map(c=>c.weight)))).size};
})()`);
assert.equal(stowage.voyages, 12);
assert.equal(stowage.identityReferences, 12);
assert.equal(stowage.identityThreeStarWins, 12);
assert.equal(stowage.distinctSlotLayoutsExcludingColdTags, 1);
assert.equal(stowage.distinctCargoWeightLists, 1);

const skyline = readProduction('skyline-planner.html', 'function validateContent()', `(() => {
  const results=SCENARIOS.map((_,i)=>simulateReference(i));
  return {scenarios:SCENARIOS.length,
    distinctReferenceLayouts:new Set(SCENARIOS.map(s=>JSON.stringify(s.reference))).size,
    threeStarWinsAfterOneSettlement:results.filter(r=>r.ok&&r.stars===3&&r.year===1).length,
    years:results.map(r=>r.year),stars:results.map(r=>r.stars)};
})()`);
assert.equal(skyline.scenarios, 12);
assert.equal(skyline.distinctReferenceLayouts, 1);
assert.equal(skyline.threeStarWinsAfterOneSettlement, 12);

const park = readProduction('wonder-park.html', 'function applyReference()', `(() => {
  const results=SCENARIOS.map((_,i)=>simulateReference(i));
  return {scenarios:SCENARIOS.length,
    distinctReferenceLayouts:new Set(SCENARIOS.map((_,i)=>JSON.stringify(referencePlan(i)))).size,
    dayThreeThreeStarWins:results.filter(r=>r.ok&&r.stars===3&&r.day===3).length,
    days:results.map(r=>r.day),stars:results.map(r=>r.stars)};
})()`);
assert.equal(park.scenarios, 6);
assert.equal(park.distinctReferenceLayouts, 1);
assert.equal(park.dayThreeThreeStarWins, 6);

const detective = readProduction('detective-desk.html', 'const SKILLS=', `(() => {
  const codes=CASES.map(c=>c.sol.join(''));
  return {cases:CASES.length,answerCodes:codes,
    answerCodeCounts:Object.fromEntries([...new Set(codes)].map(code=>
      [code,codes.filter(c=>c===code).length]))};
})()`);
assert.equal(detective.cases, 6);
assert.deepEqual(detective.answerCodes, ['000', '000', '000', '000', '110', '100']);

const starship = readProduction('starship-suspects.html', 'let profile=load()', `(() => {
  const pairPattern=c => c.links.map(link=>link.slice(0,2).sort().join('+')).sort();
  return {cases:CASES.length,
    distinctEvidencePairPatterns:new Set(CASES.map(c=>JSON.stringify(pairPattern(c)))).size,
    sharedEvidencePairs:pairPattern(CASES[0]),
    culpritIndices:CASES.map(c=>c.culprit),
    methodIndices:CASES.map(c=>METHODS.indexOf(c.method)),
    motiveIndices:CASES.map(c=>MOTIVES.indexOf(c.motive))};
})()`);
assert.equal(starship.cases, 6);
assert.equal(starship.distinctEvidencePairPatterns, 1);
assert.deepEqual(starship.sharedEvidencePairs, ['a+b', 'c+d', 'e+f']);
assert.deepEqual(starship.culpritIndices, [0, 1, 2, 3, 4, 0]);
assert.deepEqual(starship.methodIndices, [0, 1, 2, 3, 4, 5]);
assert.deepEqual(starship.motiveIndices, [0, 1, 2, 3, 4, 5]);

console.log(JSON.stringify({
  auditDate: '2026-10-23',
  kind: 'one-off-manual-curation-evidence',
  passed: true,
  gamesReviewed: reviewed.length,
  foregroundUsed: false,
  sourceHashNormalization: 'UTF-8; remove initial BOM; CRLF/CR to LF; otherwise unchanged',
  // These measurements establish repetition, not objective judgments of fun,
  // literal cross-game code identity, or a substitute for human playtesting.
  reviewed,
}));
