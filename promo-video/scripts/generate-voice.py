from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".tools" / "python"))

import edge_tts  # noqa: E402


VOICES = {
    "deep-male": {
        "voice": "zh-CN-YunyangNeural",
        "rate": "-4%",
        "pitch": "-9Hz",
        "label": "深沉专业男声",
    },
    "energetic-male": {
        "voice": "zh-CN-YunjianNeural",
        "rate": "+13%",
        "pitch": "-2Hz",
        "label": "高燃男声",
    },
    "warm-female": {
        "voice": "zh-CN-XiaoxiaoNeural",
        "rate": "+7%",
        "pitch": "+1Hz",
        "label": "温暖女声",
    },
    "calm-male": {
        "voice": "zh-CN-YunxiNeural",
        "rate": "+3%",
        "pitch": "-4Hz",
        "label": "沉稳男声",
    },
}

SAMPLE_TEXT = (
    "一百款游戏，一个开源仓库。"
    "从装甲对决到山海冒险，现在，打开属于你的下一局。"
)


async def synthesize(text: str, target: Path, voice: dict[str, str]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(
        text,
        voice["voice"],
        rate=voice["rate"],
        pitch=voice["pitch"],
        volume="+0%",
    )
    await communicate.save(str(target))


def srt_time(seconds: float) -> str:
    millis = round(seconds * 1000)
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def write_srt(segments: list[dict]) -> None:
    lines: list[str] = []
    for index, segment in enumerate(segments, start=1):
        lines.extend(
            [
                str(index),
                f"{srt_time(segment['start'])} --> {srt_time(segment['end'])}",
                segment["text"],
                "",
            ]
        )
    subtitle_dir = ROOT / "subtitles"
    subtitle_dir.mkdir(parents=True, exist_ok=True)
    (subtitle_dir / "narration.zh-CN.srt").write_text(
        "\n".join(lines), encoding="utf-8-sig"
    )


async def generate_samples() -> None:
    tasks = []
    for key, voice in VOICES.items():
        target = ROOT / "samples" / f"voice-{key}.mp3"
        tasks.append(synthesize(SAMPLE_TEXT, target, voice))
    await asyncio.gather(*tasks)
    print(f"Generated {len(VOICES)} voice samples in samples/.")


async def generate_full(selected_voice: str) -> None:
    voice = VOICES[selected_voice]
    segments = json.loads(
        (ROOT / "config" / "narration.json").read_text(encoding="utf-8")
    )
    output_dir = ROOT / "voice" / "generated" / selected_voice
    tasks = []
    for index, segment in enumerate(segments, start=1):
        target = output_dir / f"{index:02}.mp3"
        tasks.append(synthesize(segment["text"], target, voice))
    await asyncio.gather(*tasks)
    write_srt(segments)
    manifest = {
        "voice": selected_voice,
        "label": voice["label"],
        "segments": [
            {
                **segment,
                "file": str((output_dir / f"{index:02}.mp3").relative_to(ROOT)),
            }
            for index, segment in enumerate(segments, start=1)
        ],
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Generated {len(segments)} narration segments with {voice['label']}.")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", action="store_true")
    parser.add_argument("--full", action="store_true")
    parser.add_argument(
        "--voice", choices=VOICES.keys(), default="energetic-male"
    )
    args = parser.parse_args()
    if not args.samples and not args.full:
        args.samples = args.full = True
    if args.samples:
        await generate_samples()
    if args.full:
        await generate_full(args.voice)


if __name__ == "__main__":
    asyncio.run(main())
