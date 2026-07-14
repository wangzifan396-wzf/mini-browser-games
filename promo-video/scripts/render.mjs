import { spawn } from "node:child_process";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const recordings = path.join(root, "recordings");
const work = path.join(root, "work", "render");
const segmentsDir = path.join(work, "segments");
const deliverables = path.join(root, "deliverables");
const editable = path.join(deliverables, "editable");
const DURATION = 96.5;

for (const directory of [
  work,
  segmentsDir,
  deliverables,
  path.join(editable, "clips"),
  path.join(editable, "audio"),
  path.join(editable, "subtitles"),
  path.join(editable, "voice-samples"),
]) {
  await mkdir(directory, { recursive: true });
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

const candidates = [
  process.env.FFMPEG_PATH,
  path.join(
    os.homedir(),
    "AppData",
    "Roaming",
    "bilibili",
    "ffmpeg",
    "ffmpeg.exe",
  ),
  path.join(root, ".tools", "ffmpeg", "ffmpeg.exe"),
  path.join(root, "node_modules", "ffmpeg-static", "ffmpeg.exe"),
].filter(Boolean);

let ffmpeg = null;
for (const candidate of candidates) {
  if (await exists(candidate)) {
    ffmpeg = candidate;
    break;
  }
}
if (!ffmpeg) throw new Error("No full FFmpeg executable was found.");

function run(args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { cwd: root, windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 30_000) stderr = stderr.slice(-30_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`${label}: ok`);
        resolve();
      } else {
        reject(new Error(`${label} failed (${code})\n${stderr}`));
      }
    });
  });
}

const sceneSpecs = [
  { key: "01-ball-focus", id: "ball", start: 3.0, duration: 15, editable: "ball-focus" },
  { key: "02-starforge-overview", id: "starforge", start: 2.2, duration: 5, editable: "starforge-overview" },
  { key: "03-starforge-research", id: "starforge", start: 7.2, duration: 5, editable: "starforge-research" },
  { key: "04-starforge-voyage", id: "starforge", start: 12.2, duration: 5, editable: "starforge-voyage" },
  { key: "05-starforge-battle", id: "starforge", start: 17.2, duration: 5, editable: "starforge-battle" },
  { key: "06-tank", id: "tank", start: 4.8, duration: 5, editable: "tank" },
  { key: "07-spud", id: "spud", start: 8.5, duration: 5, editable: "spud" },
  { key: "08-garden", id: "garden", start: 8.5, duration: 5, editable: "garden" },
  { key: "09-moba", id: "moba", start: 4.5, duration: 5, editable: "moba" },
  { key: "10-shanhai", id: "shanhai", start: 4.5, duration: 5, editable: "shanhai" },
  { key: "11-snake", id: "snake", start: 7.5, duration: 3, editable: "snake" },
  { key: "12-matrix", id: "matrix", start: 4.8, duration: 3, editable: "matrix" },
];

const montageSpecs = [
  { id: "ball", start: 12.0 },
  { id: "starforge", start: 18.2 },
  { id: "tank", start: 8.2 },
  { id: "spud", start: 12.8 },
  { id: "garden", start: 11.4 },
  { id: "moba", start: 8.5 },
  { id: "shanhai", start: 8.2 },
  { id: "matrix", start: 7.2 },
];

const recapSpecs = [
  { id: "ball", start: 16.0, duration: 4 },
  { id: "starforge", start: 16.0, duration: 4 },
];

async function encodeSegment({
  input,
  output,
  start,
  duration,
  dark = false,
  fade = true,
}) {
  const filters = ["fps=30", "scale=1920:1080", "format=yuv420p"];
  if (dark) {
    filters.push("boxblur=12:2", "eq=brightness=-0.34:saturation=0.62");
  }
  if (fade) {
    filters.push("fade=t=in:st=0:d=0.22");
    filters.push(`fade=t=out:st=${Math.max(0, duration - 0.24).toFixed(3)}:d=0.24`);
  }
  await run(
    [
      "-y",
      "-ss",
      String(start),
      "-i",
      input,
      "-t",
      String(duration),
      "-an",
      "-vf",
      filters.join(","),
      "-r",
      "30",
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
      "-movflags",
      "+faststart",
      output,
    ],
    `segment ${path.basename(output)}`,
  );
}

const timelineFiles = [];
const intro = path.join(segmentsDir, "00-intro.mp4");
await encodeSegment({
  input: path.join(recordings, "ball.webm"),
  output: intro,
  start: 4.0,
  duration: 5,
  dark: true,
});
timelineFiles.push(intro);

for (let index = 0; index < sceneSpecs.length; index += 1) {
  const spec = sceneSpecs[index];
  const output = path.join(segmentsDir, `${spec.key}.mp4`);
  await encodeSegment({
    input: path.join(recordings, `${spec.id}.webm`),
    output,
    start: spec.start,
    duration: spec.duration,
  });
  timelineFiles.push(output);
  await copyFile(output, path.join(editable, "clips", `${spec.editable}.mp4`));
}

for (let index = 0; index < montageSpecs.length; index += 1) {
  const spec = montageSpecs[index];
  const output = path.join(
    segmentsDir,
    `${String(index + 13).padStart(2, "0")}-montage-${spec.id}.mp4`,
  );
  await encodeSegment({
    input: path.join(recordings, `${spec.id}.webm`),
    output,
    start: spec.start,
    duration: 1.125,
    fade: false,
  });
  timelineFiles.push(output);
}

for (let index = 0; index < recapSpecs.length; index += 1) {
  const spec = recapSpecs[index];
  const output = path.join(
    segmentsDir,
    `${String(index + 21).padStart(2, "0")}-recap-${spec.id}.mp4`,
  );
  await encodeSegment({
    input: path.join(recordings, `${spec.id}.webm`),
    output,
    start: spec.start,
    duration: spec.duration,
  });
  timelineFiles.push(output);
}

const outro = path.join(segmentsDir, "23-outro.mp4");
await encodeSegment({
  input: path.join(recordings, "starforge.webm"),
  output: outro,
  start: 3.0,
  duration: 8.5,
  dark: true,
});
timelineFiles.push(outro);

const concatList = timelineFiles
  .map((file) => `file '${file.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`)
  .join("\n");
const concatPath = path.join(work, "timeline.txt");
await writeFile(concatPath, concatList, "utf8");
const pictureMaster = path.join(work, "picture-master.mp4");
await run(
  [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    pictureMaster,
  ],
  "picture timeline",
);

const narration = JSON.parse(
  await readFile(path.join(root, "config", "narration.json"), "utf8"),
);
const voiceMaster = path.join(editable, "audio", "voice-master.wav");
const voicePcmDir = path.join(work, "voice-pcm");
await mkdir(voicePcmDir, { recursive: true });

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

function waveFromPcm(pcm, sampleRate = 48_000, channels = 2) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const voicePcm = Buffer.alloc(Math.ceil(DURATION * 48_000) * 4);
for (let index = 0; index < narration.length; index += 1) {
  const source = path.join(
    root,
    "voice",
    "generated",
    "energetic-male",
    `${String(index + 1).padStart(2, "0")}.mp3`,
  );
  const decoded = path.join(voicePcmDir, `${String(index + 1).padStart(2, "0")}.wav`);
  await run(
    ["-y", "-i", source, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", decoded],
    `decode voice ${index + 1}`,
  );
  const payload = wavPayload(await readFile(decoded));
  const targetOffset = Math.round(narration[index].start * 48_000) * 4;
  payload.copy(voicePcm, targetOffset, 0, Math.min(payload.length, voicePcm.length - targetOffset));
}
await writeFile(voiceMaster, waveFromPcm(voicePcm));
console.log("voice timeline: ok");

const bgm = path.join(root, "audio", "generated", "neon-drive-bgm.wav");
const sfx = path.join(root, "audio", "generated", "transitions-sfx.wav");
const masterAudio = path.join(editable, "audio", "master-mix.wav");
await run(
  [
    "-y",
    "-i",
    bgm,
    "-i",
    sfx,
    "-i",
    voiceMaster,
    "-filter_complex",
    "[0:a]volume=0.70,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[bgm];[1:a]volume=0.62,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[sfx];[2:a]volume=2.20,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asplit=2[voiceSide][voiceMix];[bgm][voiceSide]sidechaincompress=threshold=0.035:ratio=8:attack=18:release=320:makeup=1[ducked];[ducked][sfx][voiceMix]amix=inputs=3:duration=longest:dropout_transition=0,volume=2.8,acompressor=threshold=0.22:ratio=2.2:attack=8:release=140:makeup=1,alimiter=limit=0.89[mix]",
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
  "master audio mix",
);

const cleanMaster = path.join(
  deliverables,
  "mini-browser-games-promo-1080p-clean.mp4",
);
await run(
  [
    "-y",
    "-i",
    pictureMaster,
    "-i",
    masterAudio,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    "-t",
    String(DURATION),
    "-movflags",
    "+faststart",
    cleanMaster,
  ],
  "clean master",
);

const captionedMaster = path.join(
  deliverables,
  "mini-browser-games-promo-1080p-captioned.mp4",
);
await run(
  [
    "-y",
    "-i",
    pictureMaster,
    "-i",
    masterAudio,
    "-vf",
    "ass=subtitles/promo.ass",
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
    captionedMaster,
  ],
  "captioned master",
);

await Promise.all([
  copyFile(bgm, path.join(editable, "audio", "neon-drive-bgm.wav")),
  copyFile(sfx, path.join(editable, "audio", "transitions-sfx.wav")),
  copyFile(
    path.join(root, "subtitles", "promo.ass"),
    path.join(editable, "subtitles", "promo.ass"),
  ),
  copyFile(
    path.join(root, "subtitles", "narration.zh-CN.srt"),
    path.join(editable, "subtitles", "narration.zh-CN.srt"),
  ),
]);

for (const name of ["energetic-male", "warm-female", "calm-male"]) {
  await copyFile(
    path.join(root, "samples", `voice-${name}.mp3`),
    path.join(editable, "voice-samples", `voice-${name}.mp3`),
  );
}

console.log(`Rendered with ${ffmpeg}`);
console.log(`Master: ${captionedMaster}`);
