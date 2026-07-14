import { spawnSync } from "node:child_process";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const probe =
  process.env.FFPROBE_PATH ||
  path.join(root, "node_modules", "ffprobe-static", "bin", "win32", "x64", "ffprobe.exe");

const videos = [
  ["mini-browser-games-promo-v2-hq-captioned.mp4", 1920, 1080, 93, 60_000_000],
  ["mini-browser-games-promo-v2-hq-clean.mp4", 1920, 1080, 93, 58_000_000],
  ["mini-browser-games-promo-1080p-captioned.mp4", 1920, 1080, 96.5, 40_000_000],
  ["mini-browser-games-promo-1080p-clean.mp4", 1920, 1080, 96.5, 35_000_000],
  ["mini-browser-games-promo-vertical-captioned.mp4", 1080, 1920, 46, 12_000_000],
  ["mini-browser-games-promo-vertical-clean.mp4", 1080, 1920, 46, 11_000_000],
];

for (const [name, width, height, duration, minimumBytes] of videos) {
  const file = path.join(root, "deliverables", name);
  const result = spawnSync(
    probe,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) throw new Error(`${name}: ffprobe failed\n${result.stderr}`);
  const data = JSON.parse(result.stdout);
  const video = data.streams.find((stream) => stream.codec_type === "video");
  const audio = data.streams.find((stream) => stream.codec_type === "audio");
  const actualDuration = Number(data.format.duration);
  const size = Number(data.format.size);
  if (video?.codec_name !== "h264" || video.width !== width || video.height !== height) {
    throw new Error(`${name}: unexpected video stream`);
  }
  if (video.r_frame_rate !== "30/1") throw new Error(`${name}: expected 30 FPS`);
  if (audio?.codec_name !== "aac" || Number(audio.sample_rate) !== 48_000 || audio.channels !== 2) {
    throw new Error(`${name}: unexpected audio stream`);
  }
  if (Math.abs(actualDuration - duration) > 0.15) throw new Error(`${name}: duration ${actualDuration}`);
  if (size < minimumBytes) throw new Error(`${name}: file unexpectedly small (${size})`);
  console.log(`${name}: ${width}x${height}, ${actualDuration.toFixed(2)}s, ${(size / 1_000_000).toFixed(1)} MB`);
}

const required = [
  "editable-v2/audio/voice-master-v2.wav",
  "editable-v2/audio/master-mix-v2.wav",
  "editable-v2/audio/neon-drive-bgm-v2.wav",
  "editable-v2/audio/transitions-sfx-v2.wav",
  "editable-v2/subtitles/narration-v2.zh-CN.srt",
  "editable-v2/subtitles/promo-v2.ass",
  "editable/audio/voice-master.wav",
  "editable/audio/master-mix.wav",
  "editable/audio/voice-vertical.wav",
  "editable/audio/neon-drive-bgm.wav",
  "editable/audio/transitions-sfx.wav",
  "editable/subtitles/narration.zh-CN.srt",
  "editable/subtitles/promo.ass",
  "editable/subtitles/promo-vertical.ass",
  "editable/clips/ball-focus.mp4",
  "editable/clips/starforge-overview.mp4",
  "editable/clips/starforge-research.mp4",
  "editable/clips/starforge-voyage.mp4",
  "editable/clips/starforge-battle.mp4",
];

for (const relative of required) {
  const file = path.join(root, "deliverables", relative);
  await access(file);
  if ((await stat(file)).size === 0) throw new Error(`${relative}: empty file`);
}
console.log(`Editable package: ${required.length} core assets verified.`);
