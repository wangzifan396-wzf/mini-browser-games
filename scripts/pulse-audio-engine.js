/* Shared, dependency-free synthesis for live playback and offline rendering. */
(function (root) {
  'use strict';
  const MAX_DURATION = 180, LOOKAHEAD = 0.1, WAKE_MS = 25, LATE_LIMIT = 0.5;
  const noiseByContext = new WeakMap();
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  function bounded(value, min, max, name) {
    if (!finite(value) || value < min || value > max) throw new RangeError(name + ' 超出范围');
    return value;
  }
  function integer(value, min, max, name) {
    bounded(value, min, max, name);
    if (!Number.isInteger(value)) throw new RangeError(name + ' 必须为整数');
    return value;
  }
  function volume(value) { return bounded(value === undefined ? 0.35 : value, 0, 0.7, '音量'); }
  function eventCopy(event, fallbackDuration) {
    if (!event || typeof event !== 'object') throw new TypeError('无效音符');
    return {
      track: integer(event.track, 0, 5, '音轨'),
      level: integer(event.level, 1, 3, '力度'),
      degree: integer(event.degree, 0, 7, '音阶'),
      midi: integer(event.midi, 0, 127, '音高'),
      kit: integer(event.kit, 0, 3, '音色'),
      gain: bounded(event.gain, 0, 1, '音轨增益'),
      duration: bounded(event.duration === undefined ? fallbackDuration : event.duration, 0.001, 10, '音符时值')
    };
  }
  // Copy only known data, before creating audio resources or starting a timer.
  function snapshot(compiled) {
    if (!compiled || !Array.isArray(compiled.steps) || compiled.steps.length > 16384) throw new TypeError('无效乐曲');
    const duration = bounded(compiled.duration, 0.001, MAX_DURATION, '乐曲时长');
    const barDuration = bounded(compiled.barDuration, 0.001, MAX_DURATION, '小节时长');
    let previous = -1, previousEnd = 0;
    const steps = compiled.steps.map(step => {
      if (!step || !Array.isArray(step.events) || step.events.length > 6) throw new TypeError('无效节拍');
      const time = bounded(step.time, 0, duration, '节拍时间');
      const length = bounded(step.duration, 0.001, 10, '节拍时值');
      if (time <= previous || Math.abs(time - previousEnd) > 0.000001 || time + length > duration + 0.000001) throw new RangeError('节拍顺序或结束时间无效');
      previous = time; previousEnd = time + length;
      return {time, duration: length, pattern: integer(step.pattern, 0, 3, '片段序号'), step: integer(step.step, 0, 15, '步序号'), bar: integer(step.bar, 0, 31, '小节序号'),
        events: step.events.map(event => eventCopy(event, length))};
    });
    if (!steps.length || steps[0].time !== 0 || Math.abs(previousEnd - duration) > 0.000001) throw new RangeError('乐曲必须完整覆盖零到结束时间');
    return {steps, duration, barDuration};
  }
  function noise(context) {
    if (noiseByContext.has(context)) return noiseByContext.get(context);
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.6), context.sampleRate);
    const data = buffer.getChannelData(0);
    let state = 0x6d2b79f5;
    for (let i = 0; i < data.length; i++) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      data[i] = (state >>> 0) / 2147483648 - 1;
    }
    noiseByContext.set(context, buffer);
    return buffer;
  }
  function createSynth(context, destination) {
    if (!context || !destination) throw new TypeError('缺少音频上下文');
    const voices = new Set();
    // Offline onended callbacks can race the fast render thread. Keep its graph
    // intact until startRendering resolves; render() disposes it in finally.
    const offline = typeof context.startRendering === 'function';
    let disposed = false;
    function play(rawEvent, at) {
      if (disposed) throw new Error('音源已关闭');
      bounded(at, 0, Number.MAX_SAFE_INTEGER, '发声时间');
      const event = eventCopy(rawEvent, 0.125);
      if (!event.gain) return;
      const level = [0, 0.5, 0.75, 1][event.level] * event.gain;
      const kit = event.kit, track = event.track;
      const nodes = [], sources = [];
      const envelope = context.createGain(); nodes.push(envelope);
      envelope.connect(destination);
      let length, amplitude, attack = 0.004;
      if (track === 0) { length = [0.23, 0.29, 0.18, 0.27][kit]; amplitude = 0.3; }
      else if (track === 1) { length = [0.15, 0.2, 0.11, 0.24][kit]; amplitude = 0.16; }
      else if (track === 2) { length = [0.055, 0.035, 0.09, 0.045][kit]; amplitude = 0.065; attack = 0.001; }
      else if (track === 3) { length = Math.min(0.48, Math.max(0.11, event.duration * 0.88)); amplitude = 0.16; }
      else if (track === 4) { length = Math.min(0.8, Math.max(0.18, event.duration * 1.65)); amplitude = 0.115; attack = 0.012; }
      else { length = Math.min(0.42, Math.max(0.095, event.duration * 1.05)); amplitude = 0.105; }
      const end = at + length;
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(amplitude * level, at + attack);
      envelope.gain.exponentialRampToValueAtTime(0.00001, end);
      const voice = {nodes, sources, envelope, start: at, end, peak: amplitude * level, attack, cleanup: null};
      let remaining = 0, cleaned = false;
      voice.cleanup = () => {
        if (cleaned) return;
        cleaned = true; voices.delete(voice);
        for (const source of sources) source.onended = null;
        for (const node of nodes) { try { node.disconnect(); } catch (_) {} }
      };
      function sourceNode(source, target) {
        sources.push(source); nodes.push(source); remaining++;
        source.connect(target || envelope);
        source.onended = () => { if (--remaining === 0 && !offline) voice.cleanup(); };
        return source;
      }
      function oscillator(midi, shape, target, fraction) {
        const source = context.createOscillator();
        source.type = shape;
        source.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), at);
        if (fraction !== undefined) {
          const gain = context.createGain(); gain.gain.value = fraction; nodes.push(gain);
          gain.connect(target || envelope); sourceNode(source, gain);
        } else sourceNode(source, target);
        return source;
      }
      try {
        if (track === 0) {
          const kick = oscillator(36, kit === 2 ? 'triangle' : 'sine');
          kick.frequency.setValueAtTime([138, 105, 172, 92][kit], at);
          kick.frequency.exponentialRampToValueAtTime([42, 36, 50, 32][kit], at + length * 0.8);
        } else if (track === 1 || track === 2) {
          const filter = context.createBiquadFilter(); nodes.push(filter);
          filter.type = 'highpass'; filter.frequency.setValueAtTime(track === 1 ? [1200, 1800, 2400, 850][kit] : [6500, 8500, 4500, 10500][kit], at);
          filter.Q.value = 0.5; filter.connect(envelope);
          const source = context.createBufferSource(); source.buffer = noise(context); sourceNode(source, filter);
          if (track === 1) oscillator(kit === 2 ? 55 : 53, 'triangle', envelope, 0.28);
        } else {
          const filter = context.createBiquadFilter(); nodes.push(filter);
          filter.type = 'lowpass'; filter.Q.value = 0.7;
          filter.frequency.setValueAtTime(track === 3 ? [550, 900, 420, 320][kit] : [2600, 1800, 1200, 900][kit], at);
          filter.connect(envelope);
          const shape = track === 3 ? ['triangle', 'sine', 'sawtooth', 'square'][kit] : ['sine', 'triangle', 'square', 'sawtooth'][kit];
          const compensation = shape === 'square' || shape === 'sawtooth' ? 0.68 : 1;
          if (track === 4) {
            // Open fifths work in both supplied scales without inventing a major/minor third.
            for (const interval of [0, 7, 12]) oscillator(event.midi + interval, shape, filter, compensation / 3);
          } else oscillator(event.midi, shape, filter, compensation);
        }
        voices.add(voice);
        for (const source of sources) { source.start(at); source.stop(end + 0.02); }
      } catch (error) { voice.cleanup(); throw error; }
    }
    function stop(at) {
      const when = bounded(at === undefined ? context.currentTime : at, 0, Number.MAX_SAFE_INTEGER, '停止时间');
      for (const voice of Array.from(voices)) {
        if (voice.start >= when) {
          voice.envelope.gain.cancelScheduledValues(when);
          voice.envelope.gain.setValueAtTime(0, when);
        } else {
          // cancelAndHold avoids discontinuities where implemented; the fallback is short and bounded.
          if (typeof voice.envelope.gain.cancelAndHoldAtTime === 'function') voice.envelope.gain.cancelAndHoldAtTime(when);
          else {
            const elapsed = Math.max(0, when - voice.start);
            const held = elapsed < voice.attack ? voice.peak * elapsed / voice.attack : voice.peak * Math.pow(0.00001 / voice.peak, Math.min(1, (elapsed - voice.attack) / (voice.end - voice.start - voice.attack)));
            voice.envelope.gain.cancelScheduledValues(when);
            voice.envelope.gain.setValueAtTime(held, when);
          }
          voice.envelope.gain.linearRampToValueAtTime(0, when + 0.008);
        }
        for (const source of voice.sources) { try { source.stop(when + 0.012); } catch (_) {} }
      }
    }
    function dispose() {
      if (disposed) return;
      stop(); disposed = true;
      for (const voice of Array.from(voices)) voice.cleanup();
    }
    return {play, stop, dispose};
  }
  function createPlayer(callbacks) {
    const handlers = callbacks || {};
    let context = null, synth = null, master = null, timer = null, frame = null;
    let generation = 0, playing = false, pending = false, timeline = null, queue = [];
    let next = 0, cycle = 0, anchor = 0, looping = true;
    const later = root.setTimeout.bind(root), cancelLater = root.clearTimeout.bind(root);
    const raf = typeof root.requestAnimationFrame === 'function' ? root.requestAnimationFrame.bind(root) : fn => later(fn, 16);
    const cancelRaf = typeof root.cancelAnimationFrame === 'function' ? root.cancelAnimationFrame.bind(root) : cancelLater;
    function notify(name, value) {
      if (typeof handlers[name] === 'function') { try { handlers[name](value); } catch (_) {} }
    }
    function stop(reason) {
      const changed = playing || pending;
      generation++; pending = false;
      if (timer !== null) cancelLater(timer);
      if (frame !== null) cancelRaf(frame);
      timer = frame = null; queue = [];
      if (synth) synth.stop();
      const oldSynth = synth, oldMaster = master;
      synth = master = null;
      if (oldSynth) later(() => { oldSynth.dispose(); if (oldMaster) oldMaster.disconnect(); }, 25);
      playing = false;
      if (changed) notify('onState', {state: 'stopped', reason: reason || 'user'});
    }
    function fail(error) { stop('error'); notify('onError', error); }
    function draw(token) {
      if (!playing || token !== generation) return;
      let latest = null;
      while (queue.length && queue[0].at <= context.currentTime) latest = queue.shift();
      if (latest) notify('onStep', latest);
      frame = raf(() => draw(token));
    }
    function schedule(token) {
      if (!playing || token !== generation) return;
      try {
        if (context.state !== 'running') throw new Error('音频设备暂停，请重新播放');
        const now = context.currentTime;
        if (!looping && next >= timeline.steps.length) {
          if (now >= anchor + timeline.duration + 0.85) { stop('ended'); return; }
        } else {
          const due = anchor + cycle * timeline.duration + timeline.steps[next].time;
          if (now - due > LATE_LIMIT) throw new Error('播放调度中断，已停止以避免音符堆叠；请重新播放');
        }
        let scheduled = 0;
        while (playing && (looping || next < timeline.steps.length)) {
          const step = timeline.steps[next];
          const at = anchor + cycle * timeline.duration + step.time;
          if (at >= now + LOOKAHEAD) break;
          if (++scheduled > 512) throw new Error('音符密度过高，已停止播放');
          for (const event of step.events) synth.play(event, at);
          queue.push({at, time: step.time, pattern: step.pattern, step: step.step, bar: step.bar, cycle});
          next++;
          if (next >= timeline.steps.length && looping) { next = 0; cycle++; }
        }
        timer = later(() => schedule(token), WAKE_MS);
      } catch (error) { fail(error); }
    }
    async function start(compiled, options) {
      const score = snapshot(compiled), opts = options || {}, gain = volume(opts.volume);
      stop('restart'); const token = generation; pending = true;
      try {
        if (!context || context.state === 'closed') {
          const Constructor = root.AudioContext || root.webkitAudioContext;
          if (!Constructor) throw new Error('此浏览器不支持 Web Audio');
          context = new Constructor();
        }
        if (context.state !== 'running') await context.resume();
        if (token !== generation) return false;
        if (context.state !== 'running') throw new Error('音频未获准启动，请点击播放重试');
        master = context.createGain(); master.gain.value = gain; master.connect(context.destination);
        synth = createSynth(context, master); timeline = score;
        next = 0; cycle = 0; anchor = context.currentTime + 0.04; looping = opts.loop !== false;
        playing = true; pending = false; queue = [];
        notify('onState', {state: 'playing'}); schedule(token); draw(token);
        return playing;
      } catch (error) {
        if (token === generation) { pending = false; fail(error); }
        throw error;
      }
    }
    function setVolume(value) {
      const gain = volume(value);
      if (master) master.gain.setTargetAtTime(gain, context.currentTime, 0.01);
      return gain;
    }
    function status() { return {state: playing ? 'playing' : pending ? 'starting' : 'stopped', time: playing ? Math.max(0, context.currentTime - anchor) : 0}; }
    async function dispose() {
      stop('dispose');
      const old = context; context = null;
      if (old && old.state !== 'closed') await old.close();
    }
    return {start, stop, setVolume, status, dispose};
  }
  async function render(compiled, options) {
    const score = snapshot(compiled), opts = options || {};
    const gain = volume(opts.volume);
    const rate = opts.sampleRate === undefined ? 44100 : opts.sampleRate;
    if (rate !== 22050 && rate !== 44100) throw new RangeError('导出采样率仅支持 22050 或 44100 Hz');
    const tail = bounded(opts.tail === undefined ? 0.6 : opts.tail, 0, 2, '尾音时长');
    const Constructor = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    if (!Constructor) throw new Error('此浏览器不支持离线音频导出');
    const context = new Constructor(1, Math.ceil((score.duration + tail) * rate), rate);
    const master = context.createGain(); master.gain.value = gain; master.connect(context.destination);
    const synth = createSynth(context, master);
    try {
      for (const step of score.steps) for (const event of step.events) synth.play(event, step.time);
      return await context.startRendering();
    } finally { synth.dispose(); master.disconnect(); }
  }
  root.PulseAudioEngine = Object.freeze({createSynth, createPlayer, render});
})(globalThis);
