/**
 * Manual, dated curation evidence; deliberately NOT part of daily/CI regression.
 * Run from any directory:
 *   node docs/curation-2026-10-23/verify-collection-evidence.mjs
 *
 * Executes the checked-out HTML's production functions in an isolated VM. The
 * inert DOM only lets their existing rendering calls return; there is no browser,
 * network, audio, foreground interaction, or third-party dependency. A tiny
 * detective bridge exposes the closure's existing functions and the same answer
 * assignments as its click handlers. It does not replace any game rule.
 *
 * These are oracle-assisted structural counterexamples, not human playtests,
 * normal-player difficulty measurements, or proof of subjective enjoyment.
 * Hashes identify the exact source inspected (UTF-8 BOM removed; CRLF -> LF).
 * If a game is deliberately remade later, archive this evidence rather than
 * changing its expected outcomes just to keep this historical check green.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const noop = () => {};
const plain = value => JSON.parse(JSON.stringify(value));

function loadGame(file, bridge = '') {
  const source = readFileSync(resolve(root, file), 'utf8')
    .replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const scripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\bsrc\s*=/.test(match[1]));
  assert.equal(scripts.length, 1, `${file}: expected one inline production script`);
  let script = scripts[0][2];
  if (bridge) {
    assert.match(script, /\}\)\(\);\s*$/, `${file}: IIFE boundary changed`);
    script = script.replace(/\}\)\(\);\s*$/, `${bridge}\n})();`);
  }

  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id, innerHTML: '', textContent: '', value: '', disabled: false,
      style: {}, dataset: {},
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      querySelectorAll: () => [], querySelector: () => null,
      addEventListener: noop, remove: noop, focus: noop, select: noop,
    });
    return elements.get(id);
  }
  const storage = new Map();
  const context = {
    console, structuredClone, TextEncoder, TextDecoder, Uint8Array,
    document: {
      getElementById: element, querySelectorAll: () => [], querySelector: () => null,
      createElement: element, body: { append: noop },
    },
    window: {}, navigator: { clipboard: { writeText: async () => {} } },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    // Presentation timers must not create pending work or synthesize game input.
    setTimeout: () => 0, clearTimeout: noop, addEventListener: noop,
    btoa: text => Buffer.from(text, 'binary').toString('base64'),
    atob: text => Buffer.from(text, 'base64').toString('binary'),
    escape, unescape,
  };
  // Some older pages use browser-created window globals for HTML element IDs.
  for (const match of source.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) {
    context[match[1]] = element(match[1]);
  }
  vm.runInNewContext(script, context, { filename: file, timeout: 5000 });
  return {
    file,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    window: context.window,
    element,
  };
}

const results = [];
{
  const game = loadGame('skyline-planner.html');
  const engine = game.window.__skylinePlanner;
  assert.ok(engine?.simulateReference, 'skyline production API missing');
  const plans = new Set(engine.SCENARIOS.map(item => JSON.stringify(item.reference)));
  const runs = engine.SCENARIOS.map((_, index) => plain(engine.simulateReference(index)));
  assert.equal(runs.length, 12);
  assert.equal(plans.size, 1, 'skyline no longer has one universal reference layout');
  assert.ok(runs.every(run => run.ok && run.stars === 3 && run.year === 1));
  results.push({
    file: game.file, sourceSha256: game.sourceSha256,
    scenarios: runs.length, uniqueReferenceLayouts: plans.size,
    threeStarCompletions: runs.length, completionYears: [...new Set(runs.map(run => run.year))],
    endingMoneyRange: [Math.min(...runs.map(run => run.money)), Math.max(...runs.map(run => run.money))],
  });
}
{
  const game = loadGame('wonder-park.html');
  const engine = game.window.__wonderPark;
  assert.ok(engine?.simulateReference, 'wonder production API missing');
  const plans = new Set(engine.SCENARIOS.map((_, index) => JSON.stringify(engine.referencePlan(index))));
  const runs = engine.SCENARIOS.map((_, index) => plain(engine.simulateReference(index)));
  assert.equal(runs.length, 6);
  assert.equal(plans.size, 1, 'wonder no longer has one universal reference layout');
  assert.ok(runs.every(run => run.ok && run.stars === 3 && run.day === 3 && run.guests === 144));
  assert.equal(new Set(runs.map(run => JSON.stringify(run.themes))).size, 1);
  results.push({
    file: game.file, sourceSha256: game.sourceSha256,
    scenarios: runs.length, uniqueReferenceLayouts: plans.size,
    threeStarCompletions: runs.length, completionDays: [3], visitorsEveryScenario: 144,
    endingMoneyRange: [Math.min(...runs.map(run => run.money)), Math.max(...runs.map(run => run.money))],
    reserveGoals: engine.SCENARIOS.map(item => item.goal.reserve),
  });
}
{
  const bridge = `
    window.__curationDetective = {
      CASES, fresh, search, selectEvidence, connectEvidence, accuse,
      start: index => { q = fresh(index); },
      state: () => q, profile: () => profile,
      answer: ([culprit, motive, method]) => { q.culprit = culprit; q.motive = motive; q.method = method; }
    };`;
  const game = loadGame('detective-desk.html', bridge);
  const engine = game.window.__curationDetective;
  const answers = plain(engine.CASES.map(item => item.sol));
  assert.deepEqual(answers, [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [1, 1, 0], [1, 0, 0]]);
  const outcomes = [];
  for (const [index, item] of engine.CASES.entries()) {
    engine.start(index);
    const initialInsight = engine.state().insight;
    for (const [scene] of item.sc.entries()) {
      const count = item.e.filter(entry => entry[3] === scene).length;
      for (let search = 0; search < count; search++) engine.search(scene);
    }
    assert.equal(engine.state().found.length, item.e.length);
    assert.equal(engine.state().insight, initialInsight, 'search acquired a new insight cost');
    for (const [a, b] of item.links) {
      engine.selectEvidence(a);
      engine.selectEvidence(b);
      engine.connectEvidence();
    }
    assert.equal(engine.state().questioned.length, 0);
    assert.equal(engine.state().deductions.length, item.links.length);
    engine.answer(item.sol);
    engine.accuse();
    const solved = plain(engine.profile().solved[index]);
    assert.deepEqual(solved, { score: 100, stars: 3 });
    assert.equal(engine.state().questioned.length, 0, 'questioning became required');
    outcomes.push(solved.stars);
  }
  results.push({
    file: game.file, sourceSha256: game.sourceSha256,
    cases: answers.length, answerIndices: answers,
    initialAllZeroAnswers: 4, firstMethodCorrectEveryCase: true,
    searchConsumesInsight: false, threeStarsWithoutQuestioning: outcomes,
  });
}
{
  const game = loadGame('starship-suspects.html');
  const engine = game.window.__starshipSuspects;
  assert.ok(engine?.linkEvidence, 'starship production API missing');
  assert.equal(engine.CASES.length, 6);
  const pattern = [['a', 'b'], ['c', 'd'], ['e', 'f']];
  const answer = item => {
    game.element('suspectSelect').value = String(item.culprit);
    game.element('methodSelect').value = item.method;
    game.element('motiveSelect').value = item.motive;
  };
  for (const [index, item] of engine.CASES.entries()) {
    assert.deepEqual(plain(item.links.map(link => link.slice(0, 2))), pattern);
    engine.chooseCase(index);
    for (const [a, b] of pattern) {
      engine.selectClue(a);
      engine.selectClue(b);
      engine.linkEvidence();
    }
    assert.equal(engine.run().links.length, 3);
    assert.equal(engine.run().errors, 0);
    answer(item);
    engine.accuse();
    assert.equal(engine.run().over, true);
    assert.equal(engine.profile().stars[index], 3);
  }
  // A fresh profile can clear the first case with the answer but no evidence links.
  const fresh = loadGame('starship-suspects.html');
  const freshEngine = fresh.window.__starshipSuspects;
  const first = freshEngine.CASES[0];
  fresh.element('suspectSelect').value = String(first.culprit);
  fresh.element('methodSelect').value = first.method;
  fresh.element('motiveSelect').value = first.motive;
  freshEngine.accuse();
  assert.equal(freshEngine.run().links.length, 0);
  assert.equal(freshEngine.run().over, true);
  assert.equal(freshEngine.profile().stars[0], 1);
  results.push({
    file: game.file, sourceSha256: game.sourceSha256,
    cases: 6, identicalLinkPatternEveryCase: pattern,
    culpritIndices: engine.CASES.map(item => item.culprit),
    threeStarCompletions: 6, firstCaseClearWithoutLinks: { stars: 1, links: 0 },
  });
}

console.log(JSON.stringify({
  auditDate: '2026-10-23', purpose: 'manual historical curation evidence, not CI',
  sourceNormalization: 'UTF-8 BOM removed, CRLF/CR converted to LF',
  productionRules: true, foregroundUsed: false,
}));
for (const result of results) console.log(JSON.stringify(result));
