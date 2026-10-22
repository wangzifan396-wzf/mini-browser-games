/* Canonical DOM-free composition rules. Embedded verbatim in pulse-studio.html. */
(() => {
  'use strict';
  const SCALES = Object.freeze({ minor: Object.freeze([0, 2, 3, 5, 7, 8, 10, 12]), major: Object.freeze([0, 2, 4, 5, 7, 9, 11, 12]) });
  const MAX_CODE = 80 * 1024, MAX_BARS = 32;
  const grid = () => Array.from({ length: 6 }, () => Array(16).fill(0));
  const fail = name => { throw new Error(`作品数据无效：${name}`); };
  function object(value, name) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') fail(name);
    return value;
  }
  function number(value, min, max, integer, name) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(name);
    return value;
  }
  function text(value, limit, fallback, name) {
    if (typeof value !== 'string' || value.length > 4096) fail(name);
    return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) || fallback;
  }
  function matrix(value, max, name) {
    if (!Array.isArray(value) || value.length !== 6) fail(name);
    return Array.from({ length: 6 }, (_, row) => {
      if (!Array.isArray(value[row]) || value[row].length !== 16) fail(name);
      return Array.from({ length: 16 }, (_, step) => number(value[row][step], 0, max, true, name));
    });
  }
  function blank() {
    return { v: 1, title: '未命名作品', bpm: 112, swing: 0, kit: 0, volume: .35, root: 48, scale: 'minor',
      patterns: Array.from({ length: 4 }, (_, index) => ({ name: String.fromCharCode(65 + index), steps: grid(), notes: grid() })),
      order: [{ pattern: 0, repeats: 1 }], tracks: Array.from({ length: 6 }, () => ({ mute: false, solo: false, gain: .8 })) };
  }
  function sanitize(value) {
    const p = object(value, '项目');
    if (p.v !== 1) fail('版本');
    const clean = { v: 1, title: text(p.title, 64, '未命名作品', '名称'),
      bpm: number(p.bpm, 60, 180, true, 'BPM'), swing: number(p.swing, 0, .45, false, '摇摆'),
      kit: number(p.kit, 0, 3, true, '音色'), volume: number(p.volume, 0, .7, false, '总音量'),
      root: number(p.root, 36, 72, true, '调性'), scale: p.scale };
    if (p.scale !== 'minor' && p.scale !== 'major') fail('音阶');
    if (!Array.isArray(p.patterns) || p.patterns.length !== 4) fail('片段');
    clean.patterns = Array.from({ length: 4 }, (_, index) => {
      const pattern = object(p.patterns[index], '片段');
      return { name: text(pattern.name, 24, String.fromCharCode(65 + index), '片段名'),
        steps: matrix(pattern.steps, 3, '力度'), notes: matrix(pattern.notes, 7, '音级') };
    });
    if (!Array.isArray(p.order) || p.order.length < 1 || p.order.length > 16) fail('编排长度');
    clean.order = Array.from(p.order, item => {
      const entry = object(item, '编排');
      return { pattern: number(entry.pattern, 0, 3, true, '片段序号'), repeats: number(entry.repeats, 1, 4, true, '重复次数') };
    });
    const bars = clean.order.reduce((sum, item) => sum + item.repeats, 0);
    if (bars > MAX_BARS || bars * 240 / clean.bpm > 180) fail('歌曲时长');
    if (!Array.isArray(p.tracks) || p.tracks.length !== 6) fail('轨道');
    clean.tracks = Array.from(p.tracks, value => {
      const track = object(value, '轨道');
      if (typeof track.mute !== 'boolean' || typeof track.solo !== 'boolean') fail('静音/独奏');
      return { mute: track.mute, solo: track.solo, gain: number(track.gain, 0, 1, false, '轨道音量') };
    });
    return clean;
  }
  function random(seed) {
    const source = String(seed === undefined ? 20261023 : seed);
    let state = 2166136261;
    for (let index = 0; index < source.length; index++) state = Math.imul(state ^ source.charCodeAt(index), 16777619);
    state = (state >>> 0) || 0x9e3779b9;
    return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  }
  function createProject(seed) {
    const p = blank(), a = p.patterns[0], rng = random(seed);
    p.title = '第一束脉冲';
    for (const step of [0, 4, 8, 12]) a.steps[0][step] = step === 0 ? 3 : 2;
    for (const step of [4, 12]) a.steps[1][step] = 2;
    for (const step of [2, 6, 10, 14]) a.steps[2][step] = 1;
    a.steps[2][15] = rng() > .5 ? 1 : 0;
    for (const step of [0, 8]) { a.steps[3][step] = 2; a.notes[3][step] = step ? 4 : 0; }
    a.steps[4][0] = 1;
    for (const step of [3, 7, 11, 14]) { a.steps[5][step] = 1; a.notes[5][step] = Math.floor(rng() * 6); }
    return p;
  }
  function compile(project, options = {}) {
    const p = sanitize(project), opts = object(options, '播放选项');
    const order = opts.pattern === undefined ? p.order : [{ pattern: number(opts.pattern, 0, 3, true, '试听片段'), repeats: 1 }];
    const stepDuration = 60 / p.bpm / 4, barDuration = stepDuration * 16, steps = [], solo = p.tracks.some(track => track.solo);
    let bar = 0;
    for (const entry of order) for (let repeat = 0; repeat < entry.repeats; repeat++, bar++) {
      const pattern = p.patterns[entry.pattern];
      for (let step = 0; step < 16; step++) {
        const time = bar * barDuration + step * stepDuration + (step % 2 ? stepDuration * p.swing : 0);
        const duration = stepDuration * (step % 2 ? 1 - p.swing : 1 + p.swing), events = [];
        for (let track = 0; track < 6; track++) {
          const channel = p.tracks[track], level = pattern.steps[track][step], degree = pattern.notes[track][step];
          if (!level || channel.mute || (solo && !channel.solo) || channel.gain === 0) continue;
          const register = track === 3 ? -12 : track === 5 ? 12 : 0;
          events.push({ track, level, degree, midi: p.root + register + SCALES[p.scale][degree], kit: p.kit, gain: channel.gain, duration });
        }
        steps.push({ time, duration, pattern: entry.pattern, step, bar, events });
      }
    }
    return { steps, duration: bar * barDuration, barDuration };
  }
  function transform(project, patternIndex, kind, seed) {
    const p = sanitize(project), index = number(patternIndex, 0, 3, true, '片段序号'), pattern = p.patterns[index];
    if (kind === 'left' || kind === 'right' || kind === 'shift-left' || kind === 'shift-right') {
      const offset = kind === 'left' || kind === 'shift-left' ? 1 : 15;
      for (const field of ['steps', 'notes']) pattern[field] = pattern[field].map(row => row.map((_, step) => row[(step + offset) % 16]));
    } else if (kind === 'variation') {
      const rng = random(seed), before = JSON.stringify(pattern);
      for (let step = 1; step < 16; step += 2) if (rng() < .45) pattern.steps[2][step] = pattern.steps[2][step] ? 0 : 1;
      for (let step = 0; step < 16; step++) if (pattern.steps[5][step] && rng() < .6) {
        pattern.notes[5][step] = (pattern.notes[5][step] + (rng() < .5 ? 1 : 7)) % 8;
      }
      if (JSON.stringify(pattern) === before) {
        const step = Math.floor(rng() * 8) * 2 + 1;
        pattern.steps[2][step] = pattern.steps[2][step] ? 0 : 1;
      }
    } else fail('变化类型');
    return p;
  }
  function checksum(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(36).toUpperCase();
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function toBase64(value) {
    const binary = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    let output = '';
    for (let i = 0; i < binary.length; i += 3) {
      const a = binary.charCodeAt(i), b = binary.charCodeAt(i + 1), c = binary.charCodeAt(i + 2);
      output += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (Number.isNaN(b) ? 0 : b >> 4)] +
        (Number.isNaN(b) ? '=' : alphabet[((b & 15) << 2) | (Number.isNaN(c) ? 0 : c >> 6)]) + (Number.isNaN(c) ? '=' : alphabet[c & 63]);
    }
    return output;
  }
  function fromBase64(value) {
    if (!value || value.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail('编码');
    let encoded = '';
    for (let i = 0; i < value.length; i += 4) {
      const a = alphabet.indexOf(value[i]), b = alphabet.indexOf(value[i + 1]), c = alphabet.indexOf(value[i + 2]), d = alphabet.indexOf(value[i + 3]);
      const bytes = [(a << 2) | (b >> 4)];
      if (value[i + 2] !== '=') bytes.push(((b & 15) << 4) | (c >> 2));
      if (value[i + 3] !== '=') bytes.push(((c & 3) << 6) | d);
      encoded += bytes.map(byte => '%' + byte.toString(16).padStart(2, '0')).join('');
    }
    try { return decodeURIComponent(encoded); } catch (_) { return fail('UTF-8'); }
  }
  function readCode(code, prefix) {
    if (typeof code !== 'string' || code.length > MAX_CODE) fail('档案大小');
    const parts = code.trim().split('.');
    if (parts.length !== 3 || parts[0] !== prefix || checksum(parts[1]) !== parts[2]) fail('档案校验');
    try { return JSON.parse(fromBase64(parts[1])); } catch (_) { return fail('档案内容'); }
  }
  function encode(project) {
    const body = toBase64(JSON.stringify(sanitize(project)));
    return `PULSESONG1.${body}.${checksum(body)}`;
  }
  function decode(code) { return sanitize(readCode(code, 'PULSESONG1')); }
  function fromLegacy(value) {
    const old = object(typeof value === 'string' ? readCode(value, 'PULSE2') : value, '旧版档案');
    if (old.v !== 2 || (!Array.isArray(old.slots) && !Array.isArray(old.l))) fail('旧版版本');
    const p = blank(), slots = Array.isArray(old.slots) ? old.slots : old.l;
    p.title = '巡演旧作品';
    p.kit = Number.isInteger(old.kit ?? old.k) && (old.kit ?? old.k) >= 0 && (old.kit ?? old.k) <= 3 ? old.kit ?? old.k : 0;
    for (let index = 0; index < 3; index++) {
      try { p.patterns[index].steps = matrix(slots[index], 3, '旧作品槽'); } catch (_) { continue; }
      p.patterns[index].name = `旧槽位 ${index + 1}`;
      for (let track = 3; track < 6; track++) for (let step = 0; step < 16; step++) p.patterns[index].notes[track][step] = track === 4 ? Math.floor(step / 2) % 8 : step % 8;
    }
    return p;
  }
  function pcmWav(channels, sampleRate) {
    number(sampleRate, 8000, 96000, true, '采样率');
    if (!Array.isArray(channels) || channels.length < 1 || channels.length > 2) fail('PCM声道');
    const frames = channels[0]?.length;
    if (!Number.isInteger(frames) || frames < 1 || frames > sampleRate * 180) fail('PCM长度');
    let peak = 0;
    for (const channel of channels) {
      if (Object.prototype.toString.call(channel) !== '[object Float32Array]' || channel.length !== frames) fail('PCM声道长度');
      for (let index = 0; index < frames; index++) {
        const sample = channel[index];
        if (!Number.isFinite(sample)) fail('PCM样本');
        peak = Math.max(peak, Math.abs(sample));
      }
    }
    const gain = peak > .98 ? .98 / peak : 1, count = channels.length, size = frames * count * 2;
    const bytes = new Uint8Array(44 + size), view = new DataView(bytes.buffer);
    const ascii = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    ascii(0, 'RIFF'); view.setUint32(4, 36 + size, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, count, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * count * 2, true);
    view.setUint16(32, count * 2, true); view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, size, true);
    let offset = 44;
    for (let frame = 0; frame < frames; frame++) for (const channel of channels) {
      const value = channel[frame] * gain;
      view.setInt16(offset, Math.round(value * (value < 0 ? 32768 : 32767)), true); offset += 2;
    }
    return { bytes, peak, gain };
  }
  globalThis.PulseComposerCore = Object.freeze({ SCALES, MAX_BARS, blank, createProject, sanitize, compile, transform, encode, exportSong: encode, decode, fromLegacy, pcmWav });
})();
