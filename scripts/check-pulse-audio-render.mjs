import assert from 'node:assert/strict';
import {chromium} from '../promo-video/node_modules/playwright/index.mjs';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

// Isolated, muted headless Web Audio PCM checks. No user browser or foreground.
// Signal correctness is measurable here; pleasant timbre is not an automated claim.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'output/pulse-audio-render');
await mkdir(output, {recursive:true});
let browser;
try { browser = await chromium.launch({channel:process.env.BROWSER_TEST_CHANNEL==='chromium'?undefined:'msedge',timeout:15000, headless:true, args:['--mute-audio']}); }
catch { browser = await chromium.launch({headless:true, args:['--mute-audio']}); }
const errors = [], external = [];
const context = await browser.newContext({viewport:{width:1280, height:900}});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
let results;
try {
  await page.goto(pathToFileURL(path.join(root, 'pulse-studio.html')).href, {waitUntil:'load'});
  await page.waitForFunction(() => globalThis.PulseComposerCore && globalThis.PulseAudioEngine);
  results = await page.evaluate(async () => {
    const C = globalThis.PulseComposerCore, A = globalThis.PulseAudioEngine, reports = [];
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const close = (a, b, tolerance = 1e-7) => Math.abs(a - b) <= tolerance;
    function inspect(buffer) {
      const samples = buffer.getChannelData(0);
      let peak = 0, sum = 0, nonzero = 0, hash = 2166136261;
      const bits = new Uint32Array(samples.buffer, samples.byteOffset, samples.length);
      for (let i = 0; i < samples.length; i++) {
        const value = samples[i]; assert(Number.isFinite(value), 'nonfinite PCM sample');
        peak = Math.max(peak, Math.abs(value)); sum += value * value;
        if (value !== 0) nonzero++;
        hash = Math.imul(hash ^ bits[i], 16777619);
      }
      return {frames:buffer.length, sampleRate:buffer.sampleRate, channels:buffer.numberOfChannels,
        duration:buffer.duration, peak, rms:Math.sqrt(sum / samples.length), nonzero, hash:(hash >>> 0).toString(16)};
    }
    function same(a, b, label) {
      assert(a.length === b.length, label + ': PCM length');
      let delta = 0;
      for (let i = 0; i < a.length; i++) delta = Math.max(delta, Math.abs(a[i] - b[i]));
      assert(delta <= 1e-7, label + ': PCM differs by ' + delta);
      return delta;
    }
    function project(track, kit) {
      const p = C.blank(); p.bpm = 120; p.kit = kit; p.volume = 0.7;
      p.patterns[0].steps[track][0] = 3; p.tracks[track].gain = 1;
      return p;
    }
    async function render(p, options = {}) {
      const compiled = C.compile(p);
      const buffer = await A.render(compiled, {volume:p.volume, sampleRate:44100, tail:0.6, ...options});
      assert(buffer.numberOfChannels === 1, 'mono export');
      const rate = options.sampleRate || 44100;
      assert(buffer.length === Math.ceil((compiled.duration + 0.6) * rate), 'musical length plus tail');
      return buffer;
    }
    for (let track = 0; track < 6; track++) {
      const timbres = new Set();
      for (let kit = 0; kit < 4; kit++) {
        const p = project(track, kit), first = await render(p), second = await render(p);
        const signal = inspect(first), delta = same(first.getChannelData(0), second.getChannelData(0), 'track ' + track + ' kit ' + kit);
        assert(signal.peak > 0.0001 && signal.rms > 0.00001, 'instrument must be audible, not a silent graph');
        assert(signal.peak <= 0.98, 'conservative single-instrument level');
        timbres.add(signal.hash);
        reports.push({name:'track-' + track + '-kit-' + kit, pass:true, ...signal, repeatMaxDelta:delta});
      }
      assert(timbres.size === 4, 'four kits must not render as one renamed timbre, track ' + track);
    }
    const mixed = C.blank(); mixed.bpm = 120;
    for (let track = 0; track < 6; track++) mixed.patterns[0].steps[track][0] = 3;
    const allMuted = C.sanitize(mixed); allMuted.tracks.forEach(track => { track.mute = true; });
    const zeroMaster = C.sanitize(mixed); zeroMaster.volume = 0;
    const zeroTrack = C.sanitize(mixed); zeroTrack.tracks.forEach(track => { track.gain = 0; });
    for (const [name, p] of [['mute', allMuted], ['master-zero', zeroMaster], ['track-gain-zero', zeroTrack]]) {
      const signal = inspect(await render(p)); assert(signal.peak === 0 && signal.nonzero === 0, name + ' must be sample-exact silence');
      reports.push({name, pass:true, ...signal});
    }
    const solo = C.sanitize(mixed); solo.tracks[3].solo = true;
    const isolated = C.sanitize(mixed); isolated.patterns[0].steps.forEach((row, track) => { if (track !== 3) row.fill(0); });
    const soloBuffer = await render(solo), isolatedBuffer = await render(isolated);
    reports.push({name:'solo-equals-isolated-track', pass:true, maxDelta:same(soloBuffer.getChannelData(0), isolatedBuffer.getChannelData(0), 'solo')});
    const normal = await render(mixed), quiet = C.sanitize(mixed); quiet.volume = mixed.volume / 2;
    const half = await render(quiet), normalData = normal.getChannelData(0), halfData = half.getChannelData(0);
    let halfDelta = 0;
    for (let i = 0; i < normalData.length; i++) halfDelta = Math.max(halfDelta, Math.abs(normalData[i] * 0.5 - halfData[i]));
    assert(halfDelta <= 1e-7, 'volume must be applied exactly once at master; PCM delta=' + halfDelta);
    reports.push({name:'master-volume-linear', pass:true, maxDelta:halfDelta});

    function frequency(buffer) {
      const data = buffer.getChannelData(0), crossings = [], rate = buffer.sampleRate;
      for (let i = Math.floor(rate * 0.025); i < Math.floor(rate * 0.09); i++) {
        if (data[i] <= 0 && data[i + 1] > 0) crossings.push(i + -data[i] / (data[i + 1] - data[i]));
      }
      assert(crossings.length > 8, 'enough cycles for pitch estimate');
      return rate * (crossings.length - 1) / (crossings.at(-1) - crossings[0]);
    }
    const low = project(5, 0), high = C.sanitize(low); high.root += 12;
    const lowHz = frequency(await render(low)), highHz = frequency(await render(high));
    assert(close(lowHz, 261.6255653, 0.5), 'MIDI60 must render around C4, got ' + lowHz);
    assert(close(highHz, 523.2511306, 0.8), 'MIDI72 must render around C5, got ' + highHz);
    assert(close(highHz / lowHz, 2, 0.01), 'octave must double measured frequency');
    reports.push({name:'actual-lead-pitch', pass:true, lowHz, highHz, octaveRatio:highHz / lowHz});

    const before = performance.now(), long = C.createProject(20261023); long.bpm = 60; long.swing = 0.45;
    long.order = Array.from({length:8}, (_, index) => ({pattern:index % 4, repeats:4}));
    const longBuffer = await render(long), longSignal = inspect(longBuffer), renderMs = performance.now() - before;
    assert(close(longSignal.duration, 128.6, 1 / 44100), '32 bars at 60 BPM plus tail');
    assert(longSignal.frames === Math.ceil(128.6 * 44100), 'exact long render frame count');
    assert(longSignal.peak > 0 && longSignal.peak <= 0.98, 'long export finite and conservatively gained');
    const wav = C.pcmWav([longBuffer.getChannelData(0)], longBuffer.sampleRate), view = new DataView(wav.bytes.buffer);
    const fourcc = offset => String.fromCharCode(...wav.bytes.slice(offset, offset + 4));
    assert(fourcc(0) === 'RIFF' && fourcc(8) === 'WAVE' && fourcc(12) === 'fmt ' && fourcc(36) === 'data', 'actual WAV chunk headers');
    assert(view.getUint16(20, true) === 1 && view.getUint16(22, true) === 1 && view.getUint16(34, true) === 16, 'PCM16 mono WAV');
    assert(view.getUint32(24, true) === 44100 && view.getUint32(28, true) === 88200, 'WAV sample/byte rate');
    assert(view.getUint32(4, true) === wav.bytes.length - 8 && view.getUint32(40, true) === longBuffer.length * 2, 'WAV declared data length');
    assert(wav.bytes.length === 44 + longBuffer.length * 2, 'WAV actual data length');
    reports.push({name:'max-32-bars-and-real-WAV', pass:true, ...longSignal, renderAndScanMs:renderMs, wavBytes:wav.bytes.length, pcmBufferBytes:longBuffer.length * 4});
    const overloaded = new Float32Array([0, 2, -1.5, 0.5]), limited = C.pcmWav([overloaded], 44100), limitedView = new DataView(limited.bytes.buffer);
    assert(close(limited.peak, 2) && close(limited.gain, 0.49), 'whole-buffer attenuation ratio');
    assert(Math.abs(limitedView.getInt16(46, true)) <= Math.round(32767 * 0.98), 'positive clipping prevented');
    assert(Math.abs(limitedView.getInt16(48, true)) < 32768, 'negative clipping prevented');
    assert(overloaded[1] === 2 && overloaded[2] === -1.5, 'WAV export does not mutate original PCM');
    reports.push({name:'WAV-overload-normalization', pass:true, peak:limited.peak, appliedGain:limited.gain});
    return {checks:reports, actualOfflineAudioContext:true, foregroundUsed:false, audibleOutput:false, subjectiveListeningTest:false};
  });
  assert.deepEqual(errors, [], 'no page or console errors');
  assert.deepEqual(external, [], 'single-file app must not request external audio or runtime');
  results.browserVersion = browser.version(); results.externalRequests = 0; results.pageErrors = [];
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  for (const item of results.checks) console.log('PASS ' + item.name);
  console.log(`Pulse real PCM: ${results.checks.length} checks passed in muted isolated headless browser; no subjective sound claim.`);
} catch (error) {
  await writeFile(path.join(output, 'results.json'), JSON.stringify({pass:false, error:error.stack, pageErrors:errors, externalRequests:external}, null, 2));
  throw error;
} finally { await context.close(); await browser.close(); }
