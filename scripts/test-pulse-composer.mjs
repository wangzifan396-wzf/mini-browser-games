import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('./pulse-composer-core.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const C = context.PulseComposerCore, copy = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => assert.deepEqual(copy(a), copy(b));
const near = (a, b, note = '') => assert.ok(Math.abs(a - b) < 1e-9, `${note}: ${a} != ${b}`);
function code(prefix, value) {
  const body = Buffer.from(JSON.stringify(value)).toString('base64');
  let hash = 2166136261;
  for (const char of body) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${prefix}.${body}.${(hash >>> 0).toString(36).toUpperCase()}`;
}

test('blank, seeded starter and sanitizer are isolated deterministic projects', () => {
  const a = C.blank(), b = C.blank(); a.patterns[0].steps[0][0] = 3;
  assert.equal(b.patterns[0].steps[0][0], 0);
  same(C.createProject('first'), C.createProject('first'));
  assert.notEqual(JSON.stringify(C.createProject('first')), JSON.stringify(C.createProject('second')));
  const sourceProject = C.createProject(), clean = C.sanitize(sourceProject);
  clean.patterns[0].steps[0][0] = 0;
  assert.equal(sourceProject.patterns[0].steps[0][0], 3);
  assert.ok(C.compile(sourceProject).steps.some(step => step.events.length));
});

test('strict finite scalar bounds reject partial, fractional, string and hostile shapes', () => {
  for (const [key, values] of Object.entries({ v: [0, '1', 2], bpm: [59, 181, 112.5, '112', NaN, Infinity],
    swing: [-.1, .451, NaN], kit: [-1, 4, 1.5], volume: [-1, .71, Infinity], root: [35, 73, 48.1], scale: ['__proto__', 'dorian', null] })) {
    for (const value of values) { const p = C.blank(); p[key] = value; assert.throws(() => C.sanitize(p), /作品数据无效/, `${key}=${value}`); }
  }
  for (const value of [null, [], 1, {}, new Date()]) assert.throws(() => C.sanitize(value));
  const p = C.blank(); p.title = '  中文\n节拍 🎵  '; p.patterns[0].name = ' '.repeat(50);
  const clean = C.sanitize(p); assert.equal(clean.title, '中文 节拍 🎵'); assert.equal(clean.patterns[0].name, 'A');
  p.title = '长'.repeat(100); assert.equal(C.sanitize(p).title.length, 64);
  p.title = 'x'.repeat(4097); assert.throws(() => C.sanitize(p));
  const hostile = JSON.parse(JSON.stringify(C.blank()).replace('"v":1', '"__proto__":{"polluted":true},"v":1'));
  assert.equal(Object.hasOwn(C.sanitize(hostile), '__proto__'), false); assert.equal({}.polluted, undefined);
});

test('matrices are exact dense bounded integers and tracks are exact typed state', () => {
  for (const mutate of [p => p.patterns.pop(), p => p.patterns[0].steps.pop(), p => p.patterns[0].steps[0].pop(),
    p => delete p.patterns[0].steps[0][3], p => p.patterns[0].steps[1][1] = 4, p => p.patterns[0].notes[3][1] = 8,
    p => p.patterns[0].notes[3][1] = .5, p => p.patterns[1] = null, p => p.tracks.pop(),
    p => p.tracks[0].mute = 1, p => p.tracks[0].solo = 'false', p => p.tracks[0].gain = 1.1]) {
    const p = C.blank(); mutate(p); assert.throws(() => C.sanitize(p));
  }
});

test('arrangement rejects invalid entries, bounds 32 bars, and compiles in real order', () => {
  for (const order of [[], Array(17).fill({ pattern: 0, repeats: 1 }), [{ pattern: 4, repeats: 1 }],
    [{ pattern: 0, repeats: 0 }], [{ pattern: 0, repeats: 1.5 }], Array(9).fill({ pattern: 0, repeats: 4 })]) {
    const p = C.blank(); p.order = order; assert.throws(() => C.sanitize(p));
  }
  const p = C.blank(); p.bpm = 60; p.order = Array.from({ length: 8 }, (_, i) => ({ pattern: i % 4, repeats: 4 }));
  const song = C.compile(p); assert.equal(song.steps.length, 32 * 16); near(song.duration, 128);
  assert.equal(song.steps[64].pattern, 1); assert.equal(song.steps[64].bar, 4);
  const single = C.compile(p, { pattern: 3 }); assert.equal(single.steps.length, 16); near(single.duration, 4);
  assert.throws(() => C.compile(p, { pattern: 1.5 }));
});

test('audio-clock event grid preserves straight/swing pair lengths and exact musical endpoint', () => {
  for (const bpm of [60, 112, 180]) for (const swing of [0, .17, .45]) {
    const p = C.createProject(); p.bpm = bpm; p.swing = swing; p.order = [{ pattern: 0, repeats: 4 }, { pattern: 2, repeats: 3 }];
    const song = C.compile(p), d = 60 / bpm / 4;
    for (let i = 0; i < song.steps.length; i++) {
      const step = song.steps[i]; assert.ok(step.duration > 0);
      near(step.time, Math.floor(i / 16) * d * 16 + (i % 16) * d + (i % 2 ? d * swing : 0));
      if (i % 2 === 0) near(step.duration + song.steps[i + 1].duration, 2 * d);
      if (i < song.steps.length - 1) near(step.time + step.duration, song.steps[i + 1].time);
    }
    near(song.steps.at(-1).time + song.steps.at(-1).duration, song.duration);
    near(song.duration, 7 * 240 / bpm);
  }
});

test('mute, solo, zero-gain and register/scale affect actual compiled events', () => {
  const p = C.blank(); p.volume = .1;
  for (let track = 0; track < 6; track++) { p.patterns[0].steps[track][0] = 2; p.patterns[0].notes[track][0] = 2; p.tracks[track].gain = .6; }
  const events = C.compile(p).steps[0].events;
  assert.equal(events.length, 6); assert.equal(events[3].midi, 39); assert.equal(events[4].midi, 51); assert.equal(events[5].midi, 63);
  assert.equal(events[0].gain, .6, 'master volume must not be applied twice');
  p.scale = 'major'; assert.equal(C.compile(p).steps[0].events[5].midi, 64);
  p.tracks[0].mute = true; p.tracks[1].gain = 0;
  same(C.compile(p).steps[0].events.map(e => e.track), [2, 3, 4, 5]);
  p.tracks[3].solo = true; same(C.compile(p).steps[0].events.map(e => e.track), [3]);
  p.tracks[3].mute = true; assert.equal(C.compile(p).steps[0].events.length, 0);
});

test('shift and seeded variations are pure, reversible where expected and preserve protected drums', () => {
  const p = C.createProject('source'), original = JSON.stringify(p);
  same(C.transform(C.transform(p, 0, 'left'), 0, 'right'), p);
  const shifted = C.transform(p, 0, 'right'); assert.equal(shifted.patterns[0].steps[0][1], 3);
  const a = C.transform(p, 0, 'variation', 'a'), b = C.transform(p, 0, 'variation', 'a'), c = C.transform(p, 0, 'variation', 'b');
  same(a, b); assert.notEqual(JSON.stringify(a), JSON.stringify(c)); assert.notEqual(JSON.stringify(a), original);
  same(a.patterns[0].steps[0], p.patterns[0].steps[0]); same(a.patterns[0].steps[1], p.patterns[0].steps[1]);
  same(a.patterns.slice(1), p.patterns.slice(1)); assert.equal(JSON.stringify(p), original);
  assert.notEqual(JSON.stringify(C.transform(C.blank(), 0, 'variation', 0)), JSON.stringify(C.blank()));
  assert.throws(() => C.transform(p, 0, 'nonsense')); assert.throws(() => C.transform(p, -1, 'left'));
});

test('full song share is canonical UTF-8, bounded, checked and preserves all creation state', () => {
  const p = C.createProject(); p.title = '自由创作 🎵 中文'; p.bpm = 139; p.swing = .33; p.tracks[4].solo = true;
  p.order = [{ pattern: 2, repeats: 3 }, { pattern: 0, repeats: 2 }]; p.patterns[2].notes[5][15] = 7;
  const encoded = C.encode(p); assert.match(encoded, /^PULSESONG1\./); same(C.decode(encoded), C.sanitize(p));
  assert.equal(C.encode(C.decode(encoded)), encoded); assert.equal(C.exportSong(p), encoded);
  assert.throws(() => C.decode(encoded.slice(0, -1) + (encoded.endsWith('Z') ? 'A' : 'Z')));
  assert.throws(() => C.decode('x'.repeat(81921))); assert.throws(() => C.decode(code('PULSESONG1', { ...p, bpm: 1.5 })));
  assert.throws(() => C.decode(code('PULSE2', p))); assert.throws(() => C.decode(code('PULSESONG1', null)));
  const boundary=C.createProject();boundary.title='a'.repeat(63)+'🎵';boundary.patterns[0].name='b'.repeat(23)+'🎵';
  const clipped=C.sanitize(boundary);assert.equal(clipped.title,'a'.repeat(63));assert.equal(clipped.patterns[0].name,'b'.repeat(23));same(C.decode(C.encode(boundary)),clipped);
  for(const invalid of ['broken\ud800','\udfffname']){boundary.title=invalid;assert.throws(()=>C.sanitize(boundary));}
});

test('PULSE2 and old local career migration preserve slots but discard unsafe progression and absent settings', () => {
  const slots = [C.createProject().patterns[0].steps, null, C.blank().patterns[0].steps]; slots[2][5][15] = 3;
  const legacy = { v: 2, u: 1.5, s: [99, '2', -1], f: 9e20, n: -1, k: 2, l: slots };
  const p = C.fromLegacy(code('PULSE2', legacy));
  same(p.patterns[0].steps, slots[0]); same(p.patterns[2].steps, slots[2]); assert.equal(p.kit, 2); assert.equal(p.bpm, 112);
  assert.equal(Object.hasOwn(p, 'stars'), false); assert.equal(Object.hasOwn(p, 'fans'), false);
  assert.equal(C.compile(p).steps.length, 16); assert.equal(p.patterns[0].notes[3][15], 7);
  same(C.fromLegacy({ v: 2, slots, kit: 2 }).patterns, p.patterns);
  assert.equal(C.fromLegacy({ v: 2, slots, kit: 2.5 }).kit, 0);
  assert.throws(() => C.fromLegacy({ v: 1, slots })); assert.throws(() => C.fromLegacy('PULSE2.broken.CHECK'));
});

test('many projects round-trip and compile finite chronological bounded pitches without mutation', () => {
  for (let seed = 0; seed < 160; seed++) {
    const p = C.createProject(seed); p.root = 36 + seed % 37; p.bpm = 60 + seed % 121; p.swing = (seed % 46) / 100;
    p.scale = seed % 2 ? 'major' : 'minor'; p.kit = seed % 4;
    p.order = [{ pattern: 0, repeats: 1 + seed % 4 }, { pattern: seed % 4, repeats: 1 }];
    p.patterns[0].notes[5][3] = seed % 8;
    const before = JSON.stringify(p), transformed = C.transform(p, seed % 4, 'variation', seed), compiled = C.compile(transformed);
    same(C.decode(C.encode(transformed)), transformed); assert.equal(JSON.stringify(p), before);
    for (let i = 0; i < compiled.steps.length; i++) {
      const step = compiled.steps[i]; assert.ok(Number.isFinite(step.time)); assert.ok(step.duration > 0);
      if (i) assert.ok(step.time > compiled.steps[i - 1].time);
      for (const event of step.events) {
        assert.ok(Number.isInteger(event.midi) && event.midi >= 24 && event.midi <= 96);
        assert.ok(Number.isFinite(event.gain) && event.gain >= 0 && event.gain <= 1);
      }
    }
  }
  assert.equal(Object.isFrozen(C.SCALES.minor), true); assert.equal(Object.isFrozen(C.SCALES), true);
});

test('PCM WAV is finite interleaved little-endian PCM16 with peak-safe uniform attenuation', () => {
  const pcm = [new Float32Array([0, .5, 2, -2]), new Float32Array([.25, -.5, 1, -1])];
  const result = C.pcmWav(pcm, 44100), view = new DataView(result.bytes.buffer);
  const word = (start, len) => String.fromCharCode(...result.bytes.slice(start, start + len));
  assert.equal(word(0, 4), 'RIFF'); assert.equal(word(8, 4), 'WAVE'); assert.equal(word(12, 4), 'fmt '); assert.equal(word(36, 4), 'data');
  assert.equal(view.getUint16(20, true), 1); assert.equal(view.getUint16(22, true), 2); assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(24, true), 44100); assert.equal(view.getUint32(28, true), 176400); assert.equal(view.getUint32(40, true), 16);
  assert.equal(result.bytes.length, 60); assert.equal(view.getUint32(4, true), 52); assert.equal(result.peak, 2); near(result.gain, .49);
  assert.equal(view.getInt16(44, true), 0); assert.equal(view.getInt16(46, true), Math.round(.25 * .49 * 32767));
  assert.equal(view.getInt16(52, true), Math.round(.98 * 32767)); assert.equal(view.getInt16(56, true), Math.round(-.98 * 32768));
  const silent = C.pcmWav([new Float32Array(2)], 22050); assert.equal(silent.peak, 0); assert.equal(silent.gain, 1); assert.equal(silent.bytes.length, 48);
  for (const channels of [[], [new Float32Array(0)], [new Float32Array([NaN])], [new Float32Array([Infinity])], [[0]], [new Float32Array(2), new Float32Array(3)]]) assert.throws(() => C.pcmWav(channels, 44100));
  assert.throws(() => C.pcmWav(pcm, 44100.5)); assert.throws(() => C.pcmWav(pcm, 192000));
});

test('single-file production embedding must exist and equal the canonical core', () => {
  const html = fs.readFileSync(new URL('../pulse-studio.html', import.meta.url), 'utf8');
  const embedded = html.match(/<script id="pulse-composer-core">\s*([\s\S]*?)<\/script>/);
  assert.ok(embedded, 'canonical core must be embedded, not loaded as a runtime dependency');
  assert.equal(embedded[1].trim(), source.trim());
});
