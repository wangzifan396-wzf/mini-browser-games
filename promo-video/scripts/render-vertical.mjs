import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const horizontal = path.join(root, "work", "render", "segments");
const work = path.join(root, "work", "vertical");
const segmentDir = path.join(work, "segments");
const deliverables = path.join(root, "deliverables");
const editable = path.join(deliverables, "editable");
const DURATION = 46;
await mkdir(segmentDir, { recursive: true });
await mkdir(path.join(editable, "audio"), { recursive: true });
await mkdir(path.join(editable, "subtitles"), { recursive: true });

const ffmpeg =
  process.env.FFMPEG_PATH ||
  path.join(os.homedir(), "AppData", "Roaming", "bilibili", "ffmpeg", "ffmpeg.exe");

function run(args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { cwd: root, windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-30_000);
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
  ["00-intro.mp4", 0, 5, "00-intro"],
  ["01-ball-focus.mp4", 2, 11, "01-ball"],
  ["02-starforge-overview.mp4", 0, 4, "02-starforge-overview"],
  ["05-starforge-battle.mp4", 0, 4, "03-starforge-battle"],
  ["06-tank.mp4", 0.5, 4, "04-tank"],
  ["07-spud.mp4", 0.5, 4, "05-spud"],
  ["08-garden.mp4", 0.5, 4, "06-garden"],
  ["09-moba.mp4", 1, 2, "07-moba"],
  ["10-shanhai.mp4", 1, 2, "08-shanhai"],
  ["11-snake.mp4", 1, 1, "09-snake"],
  ["12-matrix.mp4", 1, 1, "10-matrix"],
  ["23-outro.mp4", 0, 4, "11-outro"],
];

const timeline = [];
for (const [file, start, duration, name] of specs) {
  const output = path.join(segmentDir, `${name}.mp4`);
  const filter =
    "split=2[bg][fg];" +
    "[bg]scale=1080:1920,boxblur=20:3,eq=brightness=-0.28:saturation=0.72[back];" +
    "[fg]scale=1080:608[front];" +
    "[back][front]overlay=0:656,fps=30,format=yuv420p";
  await run(
    [
      "-y",
      "-ss",
      String(start),
      "-i",
      path.join(horizontal, file),
      "-t",
      String(duration),
      "-an",
      "-filter_complex",
      filter,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "15",
      "-profile:v",
      "high",
      "-level",
      "4.2",
      "-pix_fmt",
      "yuv420p",
      output,
    ],
    name,
  );
  timeline.push(output);
}

const list = timeline
  .map((file) => `file '${file.replaceAll("\\", "/")}'`)
  .join("\n");
const listFile = path.join(work, "timeline.txt");
await writeFile(listFile, list, "utf8");
const picture = path.join(work, "picture.mp4");
await run(
  ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", picture],
  "vertical picture",
);

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
  header.writeUInt32LE(48000, 24);
  header.writeUInt32LE(192000, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const voiceSelections = [
  [1, 0.3],
  [2, 7.55],
  [4, 16.9],
  [6, 24.3],
  [9, 32.4],
  [12, 41.4],
];
const voicePcm = Buffer.alloc(DURATION * 48000 * 4);
for (const [number, start] of voiceSelections) {
  const decoded = path.join(work, `voice-${number}.wav`);
  await run(
    [
      "-y",
      "-i",
      path.join(root, "voice", "generated", "energetic-male", `${String(number).padStart(2, "0")}.mp3`),
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      decoded,
    ],
    `vertical voice ${number}`,
  );
  const payload = wavPayload(await readFile(decoded));
  payload.copy(voicePcm, Math.round(start * 48000) * 4);
}
const voice = path.join(editable, "audio", "voice-vertical.wav");
await writeFile(voice, waveFromPcm(voicePcm));

const audio = path.join(editable, "audio", "master-mix-vertical.wav");
await run(
  [
    "-y",
    "-i",
    path.join(root, "audio", "generated", "neon-drive-bgm.wav"),
    "-i",
    path.join(root, "audio", "generated", "transitions-sfx.wav"),
    "-i",
    voice,
    "-filter_complex",
    "[0:a]volume=0.70,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[bgm];[1:a]volume=0.58,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[sfx];[2:a]volume=2.20,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asplit=2[side][voice];[bgm][side]sidechaincompress=threshold=0.035:ratio=8:attack=18:release=320:makeup=1[ducked];[ducked][sfx][voice]amix=inputs=3:duration=longest:dropout_transition=0,volume=2.8,acompressor=threshold=0.22:ratio=2.2:attack=8:release=140:makeup=1,alimiter=limit=0.89[mix]",
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
    audio,
  ],
  "vertical audio",
);

const clean = path.join(deliverables, "mini-browser-games-promo-vertical-clean.mp4");
await run(
  [
    "-y",
    "-i",
    picture,
    "-i",
    audio,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    "-t",
    String(DURATION),
    clean,
  ],
  "vertical clean",
);

const captioned = path.join(deliverables, "mini-browser-games-promo-vertical-captioned.mp4");
await run(
  [
    "-y",
    "-i",
    picture,
    "-i",
    audio,
    "-vf",
    "ass=subtitles/promo-vertical.ass",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "15",
    "-profile:v",
    "high",
    "-level",
    "4.2",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    "-t",
    String(DURATION),
    "-movflags",
    "+faststart",
    captioned,
  ],
  "vertical captioned",
);

await copyFile(
  path.join(root, "subtitles", "promo-vertical.ass"),
  path.join(editable, "subtitles", "promo-vertical.ass"),
);
console.log(`Vertical master: ${captioned}`);
