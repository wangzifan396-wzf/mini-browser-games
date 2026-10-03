(function (root) {
  "use strict";
  const settings = root.ScaGameSettings.load();
  let audio = null, musicBus = null, effectBus = null, timer = null, step = 0, observation = null;
  let music = root.ScaStorage?.getItem("ballArenaMusic") === "on";
  const playedAt = new Map();
  function arm() {
    try {
      const Audio = root.AudioContext || root.webkitAudioContext;
      if (!Audio) return false;
      if (!audio) {
        audio = new Audio(); musicBus = audio.createGain(); effectBus = audio.createGain();
        musicBus.gain.value = settings.masterVolume * settings.musicVolume * .12;
        effectBus.gain.value = settings.masterVolume * settings.effectsVolume * .14;
        musicBus.connect(audio.destination); effectBus.connect(audio.destination);
      }
      if (audio.state === "suspended") void audio.resume().catch(() => {});
      return true;
    } catch { return false; }
  }
  function tone(bus, frequency, endFrequency, duration, volume, type = "sine", delay = 0) {
    const t = audio.currentTime + delay;
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, t); osc.frequency.exponentialRampToValueAtTime(endFrequency, t + duration);
    gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), t + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(gain); gain.connect(bus); osc.start(t); osc.stop(t + duration + .02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  function play(key) {
    if (!arm() || settings.masterVolume <= 0 || settings.effectsVolume <= 0 || root.document?.hidden) return;
    const now = audio.currentTime;
    if (now - (playedAt.get(key) ?? -Infinity) < (key === "eject" ? .2 : key === "food" ? .18 : .1)) return;
    playedAt.set(key, now);
    if (key === "split") tone(effectBus, 460, 180, .15, .45, "triangle");
    if (key === "eject") tone(effectBus, 220, 310, .055, .15);
    if (key === "food") tone(effectBus, 1000, 1300, .045, .08);
    if (key === "death") tone(effectBus, 190, 55, .3, .45, "triangle");
    if (key === "kill") { tone(effectBus, 660, 880, .14, .3); tone(effectBus, 990, 1320, .18, .25, "sine", .09); }
    if (key === "skill") tone(effectBus, 300, 950, .22, .3, "triangle");
  }
  function musicTick() {
    if (!music || root.document?.hidden || !arm()) return;
    const notes = [392, 494, 587, 659, 587, 494, 440, 523], bass = [98, 147, 123, 165];
    const n = notes[step % notes.length];
    tone(musicBus, n, n, .16, .28, "triangle");
    if (step % 2 === 0) tone(musicBus, bass[(step / 2) % 4], bass[(step / 2) % 4], .22, .18);
    if (step % 8 === 6) tone(musicBus, n * 1.5, n * 1.5, .12, .16, "triangle", .08);
    step++;
  }
  function setMusic(enabled) {
    music = Boolean(enabled); clearInterval(timer); timer = null;
    if (music && arm()) { musicTick(); timer = setInterval(musicTick, 220); }
  }
  function observe(player) {
    if (!player) return;
    const next = { id: player.id, mass: player.mass || 0, cells: player.cells?.length || 0, kills: player.kills || 0, dead: Boolean(player.dead) };
    if (observation?.id === next.id) {
      if (next.dead && !observation.dead) play("death");
      else if (next.kills > observation.kills) play("kill");
      else if (next.cells > observation.cells) play("split");
      else if (next.mass > observation.mass + .5) play("food");
    }
    observation = next;
  }
  root.ScaAudio = Object.freeze({ arm, play, setMusic, observe, reset: () => { observation = null; } });
  root.document?.addEventListener("pointerdown", () => { arm(); if (music && !timer) setMusic(true); }, { once: true });
  root.addEventListener?.("blur", () => { clearInterval(timer); timer = null; if (audio?.state === "running") void audio.suspend().catch(() => {}); });
  root.addEventListener?.("focus", () => { if (audio) { arm(); if (music) setMusic(true); } });
})(typeof globalThis !== "undefined" ? globalThis : window);
