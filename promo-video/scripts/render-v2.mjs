import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const recordings = path.join(root, "recordings-hq");
const work = path.join(root, "work", "render-v2");
const deliverables = path.join(root, "deliverables");
const editable = path.join(deliverables, "editable-v2");
const DURATION = 93;
const ffmpeg =
  process.env.FFMPEG_PATH ||
  path.join(os.homedir(), "AppData", "Roaming", "bilibili", "ffmpeg", "ffmpeg.exe");

for (const directory of [
  work,
  deliverables,
  path.join(editable, "audio"),
  path.join(editable, "subtitles"),
  path.join(editable, "voice-samples"),
]) {
  await mkdir(directory, { recursive: true });
}

function run(args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { cwd: root, windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-40_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`${label}: ok`);
        resolve();
      } else reject(new Error(`${label} failed (${code})\n${stderr}`));
    });
  });
}

const specs = [
  { id: "ball", start: 3.0, duration: 5, dark: true },
  { id: "ball", start: 1.0, duration: 20 },
  { id: "starforge", start: 0.8, duration: 4.5 },
  { id: "starforge", start: 7.0, duration: 4.5 },
  { id: "starforge", start: 11.5, duration: 4.5 },
  { id: "starforge", start: 15.5, duration: 4.5 },
  { id: "tank", start: 5.0, duration: 3.5 },
  { id: "spud", start: 10.0, duration: 3.5 },
  { id: "garden", start: 10.0, duration: 3 },
  { id: "moba", start: 5.0, duration: 3 },
  { id: "shanhai", start: 5.0, duration: 3 },
  { id: "snake", start: 8.0, duration: 4 },
  { id: "matrix", start: 5.0, duration: 4 },

  { id: "tank", start: 8.3, duration: 1.1, montage: true },
  { id: "garden", start: 13.0, duration: 1.1, montage: true },
  { id: "ball", start: 12.0, duration: 1.1, montage: true },
  { id: "spud", start: 13.8, duration: 1.1, montage: true },
  { id: "starforge", start: 18.0, duration: 1.1, montage: true },
  { id: "moba", start: 8.5, duration: 1.1, montage: true },
  { id: "shanhai", start: 8.5, duration: 1.1, montage: true },
  { id: "snake", start: 12.0, duration: 1.1, montage: true },
  { id: "matrix", start: 8.0, duration: 1.1, montage: true },
  { id: "ball", start: 17.0, duration: 1.1, montage: true },

  { id: "ball", start: 15.0, duration: 3.5 },
  { id: "starforge", start: 16.0, duration: 3.5 },
  { id: "starforge", start: 2.0, duration: 8, dark: true },
];

const total = specs.reduce((sum, spec) => sum + spec.duration, 0);
if (Math.abs(total - DURATION) > 0.001) throw new Error(`Timeline is ${total}s, expected ${DURATION}s`);

const narration = JSON.parse(await readFile(path.join(root, "config", "narration.json"), "utf8"));
const pcmDir = path.join(work, "voice-pcm");
await mkdir(pcmDir, { recursive: true });

function wavPayload(buffer) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "data") return buffer.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV data chunk not found");
}

function waveFromPcm(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(48_000, 24);
  header.writeUInt32LE(192_000, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const voicePcm = Buffer.alloc(DURATION * 48_000 * 4);
for (let index = 0; index < narration.length; index += 1) {
  const number = String(index + 1).padStart(2, "0");
  const decoded = path.join(pcmDir, `${number}.wav`);
  await run(
    [
      "-y",
      "-i",
      path.join(root, "voice", "generated", "deep-male", `${number}.mp3`),
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      decoded,
    ],
    `decode V2 voice ${number}`,
  );
  const payload = wavPayload(await readFile(decoded));
  payload.copy(voicePcm, Math.round(narration[index].start * 48_000) * 4);
}

const voiceMaster = path.join(editable, "audio", "voice-master-v2.wav");
await writeFile(voiceMaster, waveFromPcm(voicePcm));
const masterAudio = path.join(editable, "audio", "master-mix-v2.wav");
await run(
  [
    "-y",
    "-i",
    path.join(root, "audio", "generated", "neon-drive-bgm.wav"),
    "-i",
    path.join(root, "audio", "generated", "transitions-sfx.wav"),
    "-i",
    voiceMaster,
    "-filter_complex",
    "[0:a]volume=0.68,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[bgm];[1:a]volume=0.55,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[sfx];[2:a]highpass=f=65,bass=g=2:f=120,treble=g=1:f=3800,volume=2.05,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asplit=2[side][voice];[bgm][side]sidechaincompress=threshold=0.032:ratio=8:attack=20:release=360:makeup=1[ducked];[ducked][sfx][voice]amix=inputs=3:duration=longest:dropout_transition=0,volume=4.8,acompressor=threshold=0.18:ratio=2.6:attack=10:release=150:makeup=1,alimiter=limit=0.89,volume=0.84[mix]",
    "-map",
    "[mix]",
    "-t",
    String(DURATION),
    "-ar",
    "48000",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    masterAudio,
  ],
  "V2 master audio",
);

function videoInputs() {
  return specs.flatMap((spec) => ["-ss", String(spec.start), "-i", path.join(recordings, `${spec.id}.mp4`)]);
}

function videoFilter(withSubtitles) {
  const parts = [];
  const labels = [];
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index];
    const label = `v${index}`;
    const filters = [
      `trim=duration=${spec.duration}`,
      "setpts=PTS-STARTPTS",
      "fps=30",
      "format=yuv420p",
    ];
    if (spec.dark) filters.push("boxblur=12:2", "eq=brightness=-0.34:saturation=0.62");
    if (index === 0) filters.push("fade=t=in:st=0:d=0.25");
    if (index === specs.length - 1) filters.push("fade=t=out:st=7.25:d=0.75");
    parts.push(`[${index}:v]${filters.join(",")}[${label}]`);
    labels.push(`[${label}]`);
  }
  parts.push(`${labels.join("")}concat=n=${labels.length}:v=1:a=0[joined]`);
  if (withSubtitles) parts.push("[joined]ass=subtitles/promo-v2.ass[outv]");
  return { graph: parts.join(";"), output: withSubtitles ? "[outv]" : "[joined]" };
}

async function renderVideo(output, withSubtitles) {
  const filter = videoFilter(withSubtitles);
  const audioIndex = specs.length;
  await run(
    [
      "-y",
      ...videoInputs(),
      "-i",
      masterAudio,
      "-filter_complex",
      filter.graph,
      "-map",
      filter.output,
      "-map",
      `${audioIndex}:a`,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "12",
      "-profile:v",
      "high",
      "-level",
      "4.2",
      "-pix_fmt",
      "yuv420p",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-colorspace",
      "bt709",
      "-c:a",
      "aac",
      "-b:a",
      "256k",
      "-t",
      String(DURATION),
      "-movflags",
      "+faststart",
      output,
    ],
    withSubtitles ? "V2 captioned master" : "V2 clean master",
  );
}

const clean = path.join(deliverables, "mini-browser-games-promo-v2-hq-clean.mp4");
const captioned = path.join(deliverables, "mini-browser-games-promo-v2-hq-captioned.mp4");
await renderVideo(clean, false);
await renderVideo(captioned, true);

await Promise.all([
  copyFile(path.join(root, "subtitles", "promo-v2.ass"), path.join(editable, "subtitles", "promo-v2.ass")),
  copyFile(path.join(root, "subtitles", "narration.zh-CN.srt"), path.join(editable, "subtitles", "narration-v2.zh-CN.srt")),
  copyFile(path.join(root, "audio", "generated", "neon-drive-bgm.wav"), path.join(editable, "audio", "neon-drive-bgm-v2.wav")),
  copyFile(path.join(root, "audio", "generated", "transitions-sfx.wav"), path.join(editable, "audio", "transitions-sfx-v2.wav")),
  copyFile(path.join(root, "samples", "voice-deep-male.mp3"), path.join(editable, "voice-samples", "voice-deep-male.mp3")),
]);

console.log(`V2 HQ master: ${captioned}`);
