from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DESKTOP = PROJECT_ROOT / "output" / "shan-hai-v3-desktop.png"
MOBILE = PROJECT_ROOT / "output" / "shan-hai-v3-mobile.png"
AUDIT = PROJECT_ROOT / "output" / "game-audit-results.json"
OUTPUT = PROJECT_ROOT / "docs" / "images" / "quality-audit-cover.jpg"
WIDTH, HEIGHT = 1920, 1080
FONT_BOLD = Path("C:/Windows/Fonts/msyhbd.ttc")
FONT_REGULAR = Path("C:/Windows/Fonts/msyh.ttc")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REGULAR), size)


def fit(image: Image.Image, size: tuple[int, int], centering: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    return ImageOps.fit(image.convert("RGB"), size, Image.Resampling.LANCZOS, centering=centering)


def rounded(image: Image.Image, size: tuple[int, int], radius: int, centering=(0.5, 0.5)) -> Image.Image:
    card = fit(image, size, centering)
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    card.putalpha(mask)
    return card


for required in (DESKTOP, MOBILE, AUDIT):
    if not required.exists():
        raise SystemExit(f"Missing {required}. Run npm.cmd run check:shan-hai and the full game audit first.")

audit_payload = json.loads(AUDIT.read_text(encoding="utf-8"))
results = audit_payload.get("results", [])
summary = {
    "pages": len(results),
    "load": sum(1 for result in results if result.get("loadError") or result.get("responseStatus") != 200),
    "js": sum(1 for result in results if result.get("pageErrors")),
    "console": sum(1 for result in results if result.get("consoleErrors")),
    "overflow": sum(1 for result in results if result.get("horizontalOverflow")),
}

desktop = Image.open(DESKTOP)
mobile = Image.open(MOBILE)

canvas = Image.new("RGBA", (WIDTH, HEIGHT), (5, 12, 22, 255))
draw = ImageDraw.Draw(canvas)

# Technical grid and restrained ambient glow.
for x in range(0, WIDTH, 48):
    draw.line((x, 0, x, HEIGHT), fill=(41, 82, 99, 45), width=1)
for y in range(0, HEIGHT, 48):
    draw.line((0, y, WIDTH, y), fill=(41, 82, 99, 45), width=1)

glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow)
glow_draw.ellipse((580, -340, 1500, 520), fill=(33, 219, 206, 78))
glow_draw.ellipse((-320, 650, 720, 1480), fill=(67, 145, 255, 48))
glow = glow.filter(ImageFilter.GaussianBlur(110))
canvas = Image.alpha_composite(canvas, glow)
draw = ImageDraw.Draw(canvas)

draw.rectangle((0, 0, WIDTH, 10), fill=(70, 226, 218, 255))
draw.rounded_rectangle((88, 76, 560, 134), radius=28, fill=(20, 54, 68, 240), outline=(70, 226, 218, 165), width=2)
draw.text((118, 90), "VIBE CODING · QUALITY ENGINEERING", font=font(23, True), fill=(156, 248, 241, 255))

draw.text((88, 208), "100 款浏览器游戏", font=font(65, True), fill=(220, 234, 243, 255))
draw.text((88, 312), "自动化质量审计", font=font(108, True), fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(4, 12, 22, 255))
draw.text((92, 466), "AI 写完，不等于项目做完", font=font(44, True), fill=(82, 232, 223, 255))
draw.text((92, 532), "真实操作 · 双视口 · 存档迁移 · 截图复核", font=font(31), fill=(184, 202, 214, 245))

badges = [
    (f"{summary['pages']} 页面", (70, 226, 218, 255)),
    (f"{summary['js']} JS 错误", (122, 231, 154, 255)),
    (f"{summary['overflow']} 横向溢出", (250, 196, 83, 255)),
]
badge_x = 88
for label, color in badges:
    label_font = font(29, True)
    badge_w = int(draw.textlength(label, font=label_font)) + 58
    draw.rounded_rectangle((badge_x, 650, badge_x + badge_w, 720), radius=18, fill=(8, 24, 36, 240), outline=color, width=2)
    draw.text((badge_x + 29, 667), label, font=label_font, fill=color)
    badge_x += badge_w + 18

draw.rounded_rectangle((88, 828, 932, 974), radius=24, fill=(7, 20, 32, 225), outline=(73, 111, 132, 150), width=2)
draw.text((124, 858), "PLAYWRIGHT", font=font(28, True), fill=(70, 226, 218, 255))
draw.text((362, 858), "REAL INPUT", font=font(28, True), fill=(250, 196, 83, 255))
draw.text((615, 858), "SAFE SAVE", font=font(28, True), fill=(122, 231, 154, 255))
draw.text((124, 916), "从页面能打开，到流程真的能玩", font=font(29, True), fill=(235, 242, 247, 255))

# Desktop regression screenshot.
screen_x, screen_y, screen_w, screen_h = 1050, 86, 786, 478
draw.rounded_rectangle((screen_x - 10, screen_y - 10, screen_x + screen_w + 10, screen_y + screen_h + 10), radius=28, fill=(3, 10, 18, 250), outline=(70, 226, 218, 220), width=3)
desktop_card = rounded(desktop, (screen_w, screen_h), 18, (0.5, 0.15))
canvas.alpha_composite(desktop_card, (screen_x, screen_y))
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle((screen_x + 24, screen_y + 20, screen_x + 240, screen_y + 64), radius=12, fill=(4, 18, 28, 225))
draw.text((screen_x + 44, screen_y + 29), "DESKTOP 1440×900", font=font(19, True), fill=(152, 245, 238, 255))

# Audit terminal panel.
terminal_x, terminal_y, terminal_w, terminal_h = 1050, 620, 786, 350
draw.rounded_rectangle((terminal_x, terminal_y, terminal_x + terminal_w, terminal_y + terminal_h), radius=26, fill=(4, 14, 24, 245), outline=(69, 111, 133, 210), width=2)
draw.ellipse((terminal_x + 26, terminal_y + 24, terminal_x + 42, terminal_y + 40), fill=(244, 103, 94, 255))
draw.ellipse((terminal_x + 52, terminal_y + 24, terminal_x + 68, terminal_y + 40), fill=(250, 196, 83, 255))
draw.ellipse((terminal_x + 78, terminal_y + 24, terminal_x + 94, terminal_y + 40), fill=(122, 231, 154, 255))
draw.text((terminal_x + 120, terminal_y + 18), "game-audit-results.json", font=font(21, True), fill=(160, 181, 195, 255))

metrics = [
    ("pages", summary["pages"]),
    ("loadFailures", summary["load"]),
    ("javascriptFailures", summary["js"]),
    ("consoleFailures", summary["console"]),
    ("overflows", summary["overflow"]),
]
metric_y = terminal_y + 78
for label, value in metrics:
    draw.text((terminal_x + 40, metric_y), f'"{label}"', font=font(25), fill=(120, 210, 255, 255))
    draw.text((terminal_x + 330, metric_y), ":", font=font(25), fill=(173, 190, 202, 255))
    value_color = (122, 231, 154, 255) if value == 0 else (250, 196, 83, 255)
    draw.text((terminal_x + 370, metric_y), str(value), font=font(28, True), fill=value_color)
    metric_y += 49

# Mobile regression screenshot overlays the terminal edge.
phone_w, phone_h = 188, 390
phone_x, phone_y = 1592, 646
draw.rounded_rectangle((phone_x - 9, phone_y - 9, phone_x + phone_w + 9, phone_y + phone_h + 9), radius=30, fill=(2, 9, 16, 255), outline=(250, 196, 83, 235), width=3)
mobile_card = rounded(mobile, (phone_w, phone_h), 20, (0.5, 0.08))
canvas.alpha_composite(mobile_card, (phone_x, phone_y))
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle((phone_x + 28, phone_y + 12, phone_x + 160, phone_y + 44), radius=10, fill=(3, 14, 22, 225))
draw.text((phone_x + 44, phone_y + 18), "MOBILE 390", font=font(15, True), fill=(250, 211, 122, 255))

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
canvas.convert("RGB").save(OUTPUT, quality=93, subsampling=0, optimize=True)
print(f"Quality audit cover: {OUTPUT} ({WIDTH}x{HEIGHT})")
