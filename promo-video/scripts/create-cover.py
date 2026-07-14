from __future__ import annotations

import os
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / "deliverables" / "mini-browser-games-promo-1080p-clean.mp4"
SOURCE = ROOT / "work" / "cover-source.png"
OUTPUT_PNG = ROOT / "deliverables" / "mini-browser-games-promo-cover.png"
OUTPUT_JPG = ROOT / "deliverables" / "mini-browser-games-promo-cover.jpg"
FFMPEG = Path(
    os.environ.get(
        "FFMPEG_PATH",
        str(Path.home() / "AppData" / "Roaming" / "bilibili" / "ffmpeg" / "ffmpeg.exe"),
    )
)

SOURCE.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(
    [
        str(FFMPEG),
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        "12",
        "-i",
        str(VIDEO),
        "-frames:v",
        "1",
        str(SOURCE),
    ],
    check=True,
)

image = Image.open(SOURCE).convert("RGB")
overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
pixels = overlay.load()
width, height = image.size
for x in range(width):
    left = max(0.0, 1.0 - x / (width * 0.58))
    for y in range(height):
        bottom = max(0.0, (y / height - 0.60) / 0.40)
        alpha = int(205 * left + 90 * bottom * (1 - left * 0.35))
        pixels[x, y] = (3, 8, 18, min(225, alpha))

canvas = Image.alpha_composite(image.convert("RGBA"), overlay)
draw = ImageDraw.Draw(canvas)
font_bold = Path("C:/Windows/Fonts/msyhbd.ttc")
font_regular = Path("C:/Windows/Fonts/msyh.ttc")
title = ImageFont.truetype(str(font_bold), 112)
subtitle = ImageFont.truetype(str(font_bold), 42)
small = ImageFont.truetype(str(font_regular), 28)

draw.rounded_rectangle((96, 112, 116, 420), radius=8, fill=(72, 235, 255, 255))
draw.text((152, 128), "迷你游戏合集", font=title, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(3, 8, 18, 255))
draw.text((155, 278), "100 款浏览器游戏 · 开源 · 即点即玩", font=subtitle, fill=(77, 235, 255, 255))
draw.text((155, 350), "STAR CLUSTER ARENA  /  STARFORGE NEXUS", font=small, fill=(225, 235, 245, 235))
draw.rounded_rectangle((96, 875, 1040, 972), radius=18, fill=(3, 8, 18, 185), outline=(77, 235, 255, 150), width=2)
draw.text((130, 902), "动作 · 策略 · 肉鸽 · 塔防 · 经营 · 益智", font=subtitle, fill=(255, 255, 255, 255))

canvas.convert("RGB").save(OUTPUT_PNG, optimize=True)
canvas.convert("RGB").save(OUTPUT_JPG, quality=94, subsampling=0)
print(f"Cover: {OUTPUT_PNG}")
