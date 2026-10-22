import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Audio-graph/clock contracts only: these mocks do not claim subjective sound QA.
const source = await readFile(new URL('./pulse-audio-engine.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('./pulse-composer-core.js', import.meta.url), 'utf8');
let passed = 0;
async function test(name, exercise) {
  await exercise(); passed++; console.log('PASS ' + name);
}
function environment(options = {}) {
  let now = 0, serial = 0;
  const tasks = new Map(), contexts = [], nodes = [], sources = [];
  class Param {
    constructor(value = 0) { this.value = value; this.calls = []; }
    call(method, value, at) { assert.ok(Number.isFinite(value)); assert.ok(Number.isFinite(at)); this.value = value; this.calls.push({method, value, at}); }
    setValueAtTime(value, at) { this.call('set', value, at); }
    linearRampToValueAtTime(value, at) { this.call('linear', value, at); }
    exponentialRampToValueAtTime(value, at) { assert.ok(value > 0); this.call('exponential', value, at); }
    setTargetAtTime(value, at, constant) { assert.ok(constant > 0); this.call('target', value, at); }
    cancelScheduledValues(at) { this.calls.push({method:'cancel', at}); }
    cancelAndHoldAtTime(at) { this.calls.push({method:'hold', at}); }
  }
  class Node {
    constructor(context, kind) { this.context = context; this.kind = kind; this.connections = []; this.disconnected = false; nodes.push(this); }
    connect(other) { assert.ok(other); this.connections.push(other); return other; }
    disconnect() { this.disconnected = true; this.connections = []; }
  }
  class Source extends Node {
    constructor(context, kind) { super(context, kind); this.frequency = new Param(); sources.push(this); }
    start(at) { assert.ok(Number.isFinite(at)); assert.equal(this.startAt, undefined); this.startAt = at; }
    stop(at) { assert.ok(Number.isFinite(at)); this.stopAt = at; }
  }
  class Context {
    constructor() { this.state = options.suspended ? 'suspended' : 'running'; this.sampleRate = 44100; this.destination = {context:this}; contexts.push(this); }
    get currentTime() { return now / 1000; }
    createGain() { const node = new Node(this, 'gain'); node.gain = new Param(1); return node; }
    createBiquadFilter() { const node = new Node(this, 'filter'); node.frequency = new Param(); node.Q = new Param(); return node; }
    createOscillator() { return new Source(this, 'oscillator'); }
    createBufferSource() { return new Source(this, 'bufferSource'); }
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({length:channels}, () => new Float32Array(length));
      return {numberOfChannels:channels, length, sampleRate, duration:length / sampleRate, getChannelData:index => data[index]};
    }
    async resume() { if (options.resumeGate) await options.resumeGate; this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  class OfflineContext extends Context {
    constructor(channels, length, rate) { super(); this.sampleRate = rate; this.rendered = this.createBuffer(channels, length, rate); }
    async startRendering() { if (options.renderError) throw new Error('render failed');if(options.beforeRenderComplete)await options.beforeRenderComplete({sources,nodes}); return this.rendered; }
  }
  function setTimer(fn, delay) { const id = ++serial; tasks.set(id, {fn, at:now + delay}); return id; }
  function settleSources() {
    for (const item of sources) if (!item.ended && item.stopAt <= now / 1000) { item.ended = true; if (item.onended) item.onended(); }
  }
  function advance(ms) {
    const target = now + ms;
    let iterations = 0;
    while (true) {
      const upcoming = Array.from(tasks.entries()).filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!upcoming) break;
      assert.ok(++iterations < 10000, 'bounded timer loop');
      now = Math.max(now, upcoming[1].at); tasks.delete(upcoming[0]); settleSources(); upcoming[1].fn(now);
    }
    now = target; settleSources();
  }
  const sandbox = {setTimeout:setTimer, clearTimeout:id => tasks.delete(id), requestAnimationFrame:fn => setTimer(fn, 16), cancelAnimationFrame:id => tasks.delete(id)};
  if (!options.noAudio) sandbox.AudioContext = Context;
  if (!options.noOffline) sandbox.OfflineAudioContext = OfflineContext;
  vm.runInNewContext(source, sandbox, {filename:'pulse-audio-engine.js'});
  vm.runInNewContext(coreSource, sandbox, {filename:'pulse-composer-core.js'});
  return {engine:sandbox.PulseAudioEngine, core:sandbox.PulseComposerCore, contexts, nodes, sources, tasks, advance,
    jump(ms) { now += ms; settleSources(); }, get now() { return now / 1000; }};
}
function event(track = 5, kit = 0) { return {track, level:2, degree:0, midi:60, kit, gain:0.8, duration:0.125}; }
function song() {
  return {duration:0.5, barDuration:0.5, steps:Array.from({length:4}, (_, step) => ({time:step * 0.125, duration:0.125, pattern:0, step, bar:0, events:[event()]}))};
}

await test('all six tracks and four kits create finite, bounded audio graphs', () => {
  const env = environment();
  // Obtain a mock context through the actual player constructor, then use its destination.
  return env.engine.createPlayer().start(song()).then(() => {
    const audio = env.contexts[0], synth = env.engine.createSynth(audio, audio.destination);
    for (let kit = 0; kit < 4; kit++) for (let track = 0; track < 6; track++) synth.play(event(track, kit), 0.2);
    assert.ok(env.sources.length > 24);
    for (const item of env.sources) { assert.ok(item.stopAt > item.startAt); assert.ok(item.stopAt - item.startAt < 1); }
    synth.dispose();
    assert.ok(env.sources.filter(item => item.startAt === 0.2).every(item => item.disconnected));
  });
});
await test('noise is deterministic across contexts and cached inside a context', async () => {
  const a = environment(), b = environment();
  const pa = a.engine.createPlayer(), pb = b.engine.createPlayer();
  await pa.start(song()); await pb.start(song());
  const sa = a.engine.createSynth(a.contexts[0], a.contexts[0].destination), sb = b.engine.createSynth(b.contexts[0], b.contexts[0].destination);
  sa.play(event(1), 0.2); sa.play(event(2), 0.3); sb.play(event(1), 0.2);
  const ab = a.sources.filter(item => item.buffer), bb = b.sources.filter(item => item.buffer);
  assert.equal(ab[0].buffer, ab[1].buffer);
  assert.deepEqual(ab[0].buffer.getChannelData(0), bb[0].buffer.getChannelData(0));
  assert.ok(ab[0].buffer.getChannelData(0).some(value => Math.abs(value) > 0.9));
  await pa.dispose(); await pb.dispose(); sa.dispose(); sb.dispose();
});
await test('audio lookahead schedules sound ahead, UI follows actual audio time', async () => {
  const env = environment(), observed = [], states = [];
  const player = env.engine.createPlayer({onStep:step => observed.push(step), onState:state => states.push(state)});
  assert.equal(await player.start(song()), true);
  assert.equal(env.sources[0].startAt, 0.04);
  assert.equal(observed.length, 0);
  env.advance(110);
  assert.equal(env.sources.length, 2, 'second sixteenth scheduled within lookahead');
  assert.equal(observed.length, 1, 'not visually advanced before sound');
  assert.equal(observed[0].step, 0);
  env.advance(70); assert.equal(observed[1].step, 1);
  assert.equal(states[0].state, 'playing');
  player.stop(); env.advance(30);
  assert.equal(player.status().state, 'stopped');
  assert.equal(env.tasks.size, 0, 'timers, rAF and disposal cleaned');
  assert.ok(env.sources.every(item => item.disconnected));
});
await test('start uses a data snapshot, not mutable UI project references', async () => {
  const env = environment(), compiled = song(), player = env.engine.createPlayer();
  await player.start(compiled);
  compiled.steps[3].events[0].midi = 100; compiled.steps.length = 1;
  env.advance(400);
  const last = env.sources.find(item => Math.abs(item.startAt - 0.415) < 1e-9);
  assert.ok(last);
  assert.ok(Math.abs(last.frequency.calls[0].value - 261.6255653005986) < 1e-9);
  await player.dispose();
});
await test('stop cancels future voices and restarting cannot resurrect old callbacks', async () => {
  const env = environment(), player = env.engine.createPlayer();
  await player.start(song()); env.advance(100);
  const old = env.sources.slice();
  player.stop();
  assert.ok(old.every(item => item.stopAt <= env.now + 0.012 + 1e-9));
  await player.start(song(), {volume:0.2}); env.advance(300);
  assert.equal(player.status().state, 'playing');
  assert.ok(old.every(item => item.disconnected));
  player.setVolume(0); assert.equal(env.nodes.filter(item => item.kind === 'gain').some(item => item.gain.calls.some(call => call.method === 'target' && call.value === 0)), true);
  assert.throws(() => player.setVolume(NaN), /音量/);
  await player.dispose(); env.advance(30); assert.equal(env.tasks.size, 0);
});
await test('late scheduler stops instead of bursting missed notes', async () => {
  const env = environment(), errors = [], player = env.engine.createPlayer({onError:error => errors.push(error.message)});
  await player.start(song()); const count = env.sources.length;
  env.jump(1000); env.advance(0);
  assert.equal(player.status().state, 'stopped');
  assert.equal(env.sources.length, count);
  assert.match(errors[0], /调度中断/); env.advance(30); assert.equal(env.tasks.size, 0);
});
await test('non-looping playback ends after its natural tail', async () => {
  const env = environment(), states = [], player = env.engine.createPlayer({onState:state => states.push(state)});
  await player.start(song(), {loop:false}); env.advance(1500);
  assert.equal(env.sources.length, 4);
  assert.equal(player.status().state, 'stopped');
  assert.equal(states.at(-1).reason, 'ended');
});
await test('stop during asynchronous audio permission cannot start stale playback', async () => {
  let allow;
  const gate = new Promise(resolve => { allow = resolve; });
  const env = environment({suspended:true, resumeGate:gate}), states = [];
  const player = env.engine.createPlayer({onState:state => states.push(state)});
  const starting = player.start(song());
  assert.equal(player.status().state, 'starting');
  player.stop(); allow();
  assert.equal(await starting, false);
  assert.equal(player.status().state, 'stopped'); assert.equal(env.sources.length, 0);
  assert.equal(states.at(-1).state, 'stopped');
  await player.dispose();
});
await test('overlapping async starts keep only the newest requested score', async () => {
  let allow;
  const gate = new Promise(resolve => { allow = resolve; });
  const env = environment({suspended:true, resumeGate:gate}), player = env.engine.createPlayer();
  const first = player.start(song());
  const newer = song(); newer.steps[0].events[0].midi = 72;
  const second = player.start(newer); allow();
  assert.equal(await first, false); assert.equal(await second, true);
  assert.equal(env.contexts.length, 1);
  assert.ok(env.sources[0].frequency.calls[0].value > 500);
  await player.dispose();
});
await test('invalid clock, volume and score values fail before allocating audio', async () => {
  const env = environment(), player = env.engine.createPlayer();
  for (const mutate of [s => s.duration = NaN, s => s.duration = 181, s => s.steps[0].time = -1,
    s => s.steps[1].time = 0, s => s.steps[1].duration = Infinity,
    s => s.steps[0].events[0].midi = NaN, s => s.steps[0].events[0].gain = 2,
    s => s.steps[0].events[0].track = 6, s => s.steps[0].events[0].duration = -1]) {
    const compiled = song(); mutate(compiled); await assert.rejects(player.start(compiled));
  }
  await assert.rejects(player.start(song(), {volume:1}));
  assert.equal(env.contexts.length, 0); assert.equal(env.tasks.size, 0);
});
await test('invalid new score does not destroy already playing score', async () => {
  const env = environment(), player = env.engine.createPlayer(); await player.start(song());
  const invalid = song(); invalid.steps[0].time = Infinity;
  await assert.rejects(player.start(invalid));
  assert.equal(player.status().state, 'playing'); await player.dispose();
});
await test('canonical composition compiler remains compatible across tempo and swing limits', async () => {
  for (const bpm of [60, 112, 180]) for (const swing of [0, 0.45]) {
    const env = environment(), project = env.core.createProject(123);
    project.bpm = bpm; project.swing = swing;
    project.order = Array.from({length:8}, (_, index) => ({pattern:index % 4, repeats:4}));
    const compiled = env.core.compile(project), player = env.engine.createPlayer();
    assert.equal(compiled.steps.length, 512);
    assert.equal(await player.start(compiled), true);
    await player.dispose();
  }
});
await test('offline rendering uses mono deterministic live synthesis and finite sample count', async () => {
  const env = environment(), compiled = song();
  compiled.steps[0].events = Array.from({length:6}, (_, track) => event(track, 2));
  const buffer = await env.engine.render(compiled, {volume:0.3, sampleRate:22050, tail:0.6});
  assert.equal(buffer.numberOfChannels, 1); assert.equal(buffer.sampleRate, 22050);
  assert.equal(buffer.length, Math.ceil(1.1 * 22050));
  assert.equal(env.contexts.length, 1);
  assert.ok(env.sources.every(item => Number.isFinite(item.startAt) && item.disconnected));
  assert.equal(env.sources.filter(item => item.startAt === 0).length, 9, 'six instruments include snare body and three chord oscillators');
  assert.equal(env.tasks.size, 0);
});
await test('offline ended callbacks cannot disconnect the graph before rendering completes', async () => {
  const env=environment({beforeRenderComplete({sources,nodes}) {
    for(const source of sources)source.onended?.();
    assert.ok(nodes.every(node=>!node.disconnected),'offline graph remains connected until the rendering promise resolves');
  }});
  await env.engine.render(song());assert.ok(env.nodes.every(node=>node.disconnected),'completed render releases all nodes');
});
await test('offline export bounds and feature failures are explicit and cleanup-safe', async () => {
  const env = environment();
  await assert.rejects(env.engine.render(song(), {sampleRate:48000}), /采样率/);
  await assert.rejects(env.engine.render(song(), {tail:NaN}), /尾音/);
  await assert.rejects(env.engine.render(song(), {volume:-0.1}), /音量/);
  assert.equal(env.contexts.length, 0);
  const noOffline = environment({noOffline:true}); await assert.rejects(noOffline.engine.render(song()), /不支持离线/);
  const broken = environment({renderError:true}); await assert.rejects(broken.engine.render(song()), /render failed/);
  assert.ok(broken.nodes.every(item => item.disconnected));
  const noAudio = environment({noAudio:true}), errors = [];
  await assert.rejects(noAudio.engine.createPlayer({onError:error => errors.push(error.message)}).start(song()), /不支持 Web Audio/);
  assert.equal(errors.length, 1);
});
console.log(`Pulse audio: ${passed} contracts passed (mock graph/clock; real browser PCM QA is separate).`);
