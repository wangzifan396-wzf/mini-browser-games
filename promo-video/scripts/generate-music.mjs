import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const output = path.join(root, "audio", "generated");
await mkdir(output, { recursive: true });

const sampleRate = 48_000;
const duration = 93;
const frames = Math.ceil(sampleRate * duration);
const bpm = 116;
const beat = 60 / bpm;
const tau = Math.PI * 2;

const chordProgression = [
  [45, 52, 57, 60],
  [41, 48, 53, 57],
  [48, 55, 60, 64],
  [43, 50, 55, 59],
];

const transitionTimes = [5, 25, 29.5, 34, 38.5, 43, 46.5, 50, 53, 56, 59, 63, 67, 71, 78, 85];

function midi(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(a, b, value) {
  const x = clamp((value - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}

function energyAt(t) {
  if (t < 5) return 0.2 + 0.18 * smoothstep(0, 5, t);
  if (t < 25) return 0.7;
  if (t < 43) return 0.82;
  if (t < 67) return 0.95;
  if (t < 78) return 1.08;
  if (t < 85) return 0.88;
  return 0.74 - 0.38 * smoothstep(85, 92.9, t);
}

function writeWave(target, left, right) {
  const dataBytes = left.length * 4;
  const buffer = Buffer.allocUnsafe(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < left.length; index += 1) {
    buffer.writeInt16LE(Math.round(clamp(left[index], -1, 1) * 32767), 44 + index * 4);
    buffer.writeInt16LE(Math.round(clamp(right[index], -1, 1) * 32767), 46 + index * 4);
  }
  return writeFile(target, buffer);
}

const musicL = new Float32Array(frames);
const musicR = new Float32Array(frames);
const sfxL = new Float32Array(frames);
const sfxR = new Float32Array(frames);
let randomState = 0x6d2b79f5;

function noise() {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return (randomState / 0xffffffff) * 2 - 1;
}

for (let index = 0; index < frames; index += 1) {
  const t = index / sampleRate;
  const energy = energyAt(t);
  const beatPosition = t / beat;
  const beatPhase = beatPosition % 1;
  const halfBeatPhase = (beatPosition * 2) % 1;
  const barBeat = Math.floor(beatPosition) % 4;
  const chordIndex = Math.floor(beatPosition / 8) % chordProgression.length;
  const chord = chordProgression[chordIndex];
  const chordLocal = (beatPosition % 8) * beat;
  const chordFade = Math.min(1, chordLocal / 0.18, (8 * beat - chordLocal) / 0.18);

  let pad = 0;
  for (let voice = 0; voice < chord.length; voice += 1) {
    const frequency = midi(chord[voice]);
    const detune = 1 + (voice - 1.5) * 0.0017;
    pad += Math.sin(tau * frequency * detune * t + voice * 0.7) * 0.7;
    pad += Math.sin(tau * frequency * 2 * t + voice) * 0.16;
  }
  pad *= 0.052 * chordFade;

  const arpStep = Math.floor(beatPosition * 4) % 16;
  const arpNote = chord[[0, 1, 2, 1, 3, 2, 1, 2][arpStep % 8]] + 12;
  const arpPhase = (beatPosition * 4) % 1;
  const arpEnvelope = Math.exp(-arpPhase * 5.5);
  const arp =
    Math.sin(tau * midi(arpNote) * t) *
    arpEnvelope *
    0.092 *
    smoothstep(4.6, 7.5, t) *
    energy;

  const root = chord[0] - 12;
  const bassEnvelope = Math.exp(-beatPhase * 3.4);
  const bassFrequency = midi(root);
  const bass =
    (Math.sin(tau * bassFrequency * t) * 0.72 +
      Math.sin(tau * bassFrequency * 2 * t) * 0.2 +
      Math.sin(tau * bassFrequency * 3 * t) * 0.08) *
    bassEnvelope *
    0.16 *
    smoothstep(4.8, 7, t) *
    energy;

  const kickEnvelope = Math.exp(-beatPhase * 12);
  const kickFrequency = 48 + 92 * Math.exp(-beatPhase * 18);
  const kick =
    Math.sin(tau * kickFrequency * (beatPhase * beat)) *
    kickEnvelope *
    0.31 *
    smoothstep(5, 7.2, t) *
    energy;

  const snarePhase = beatPhase;
  const snareActive = barBeat === 1 || barBeat === 3;
  const snareEnvelope = snareActive ? Math.exp(-snarePhase * 15) : 0;
  const white = noise();
  const snare =
    (white * 0.78 + Math.sin(tau * 188 * snarePhase * beat) * 0.22) *
    snareEnvelope *
    0.13 *
    smoothstep(5.2, 7.4, t) *
    energy;

  const hatEnvelope = Math.exp(-halfBeatPhase * 28);
  const hat =
    white *
    hatEnvelope *
    0.035 *
    smoothstep(5.5, 8, t) *
    energy *
    (Math.floor(beatPosition * 2) % 2 ? 0.72 : 1);

  const melodyNote = [69, 72, 76, 79, 76, 72, 71, 67][Math.floor(beatPosition / 2) % 8];
  const melodyEnvelope = Math.exp(-((beatPosition * 0.5) % 1) * 3.2);
  const melodyGate = smoothstep(50, 54, t) * (1 - smoothstep(85, 91, t));
  const melody =
    (Math.sin(tau * midi(melodyNote) * t) +
      Math.sin(tau * midi(melodyNote) * 2 * t) * 0.18) *
    melodyEnvelope *
    melodyGate *
    0.055 *
    energy;

  const pulse = Math.sin(tau * 0.08 * t) * 0.5 + 0.5;
  const left = pad * (0.82 + pulse * 0.18) + arp * 0.86 + bass + kick + snare + hat + melody * 0.75;
  const right = pad * (1 - pulse * 0.16) + arp * 1.06 + bass + kick + snare * 0.92 - hat * 0.85 + melody;
  musicL[index] = Math.tanh(left * 1.18) * 0.82;
  musicR[index] = Math.tanh(right * 1.18) * 0.82;

  let effects = 0;
  for (const transition of transitionTimes) {
    const before = transition - t;
    if (before >= 0 && before < 0.55) {
      const progress = 1 - before / 0.55;
      effects += white * progress * progress * 0.12;
      effects += Math.sin(tau * (180 + progress * 900) * t) * progress * 0.025;
    }
    const after = t - transition;
    if (after >= 0 && after < 0.62) {
      const envelope = Math.exp(-after * 8.5);
      effects += Math.sin(tau * (72 - after * 28) * after) * envelope * 0.48;
      effects += white * Math.exp(-after * 19) * 0.15;
    }
  }
  const introSpark = t < 5 ? Math.sin(tau * (440 + t * 90) * t) * 0.018 * smoothstep(0.5, 4.6, t) : 0;
  sfxL[index] = clamp(effects + introSpark, -0.92, 0.92);
  sfxR[index] = clamp(effects * 0.92 - introSpark, -0.92, 0.92);
}

await Promise.all([
  writeWave(path.join(output, "neon-drive-bgm.wav"), musicL, musicR),
  writeWave(path.join(output, "transitions-sfx.wav"), sfxL, sfxR),
]);

console.log(`Generated ${duration.toFixed(2)}s original BGM and transition SFX at 48 kHz.`);
