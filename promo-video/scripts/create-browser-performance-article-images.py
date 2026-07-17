from __future__ import annotations

import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = PROJECT_ROOT / "docs" / "images" / "browser-performance"
SCREENSHOT = ASSET_DIR / "star-cluster-stress.jpg"
MEASUREMENT = ASSET_DIR / "runtime-measurement.json"
FONT_REGULAR = Path("C:/Windows/Fonts/msyh.ttc")
FONT_BOLD = Path("C:/Windows/Fonts/msyhbd.ttc")

INK = (236, 246, 250, 255)
MUTED = (153, 177, 188, 255)
TEAL = (67, 232, 207, 255)
BLUE = (80, 161, 255, 255)
AMBER = (255, 198, 86, 255)
GREEN = (127, 230, 156, 255)
RED = (255, 111, 124, 255)
BG = (4, 14, 23, 255)
PANEL = (8, 25, 37, 238)
PANEL_ALT = (10, 33, 46, 244)
OUTLINE = (70, 111, 130, 180)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REGULAR), size)


def fit(image: Image.Image, size: tuple[int, int], centering=(0.5, 0.5)) -> Image.Image:
    return ImageOps.fit(image.convert("RGB"), size, Image.Resampling.LANCZOS, centering=centering)


def rounded_image(image: Image.Image, size: tuple[int, int], radius: int, centering=(0.5, 0.5)) -> Image.Image:
    result = fit(image, size, centering).convert("RGBA")
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    result.putalpha(mask)
    return result


def base_canvas(width: int, height: int, accent: tuple[int, int, int, int] = TEAL) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), BG)
    draw = ImageDraw.Draw(canvas)
    for x in range(0, width, 48):
        draw.line((x, 0, x, height), fill=(34, 73, 88, 40), width=1)
    for y in range(0, height, 48):
        draw.line((0, y, width, y), fill=(34, 73, 88, 40), width=1)

    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((width * 0.48, -height * 0.5, width * 1.15, height * 0.52), fill=(*accent[:3], 52))
    glow_draw.ellipse((-width * 0.3, height * 0.58, width * 0.45, height * 1.48), fill=(*BLUE[:3], 34))
    glow = glow.filter(ImageFilter.GaussianBlur(max(60, width // 18)))
    canvas = Image.alpha_composite(canvas, glow)
    ImageDraw.Draw(canvas).rectangle((0, 0, width, 8), fill=accent)
    return canvas


def panel(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int = 24,
          fill=PANEL, outline=OUTLINE, width: int = 2) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def pill(draw: ImageDraw.ImageDraw, x: int, y: int, label: str, color=TEAL, size: int = 22,
         dark_fill=(6, 22, 32, 235)) -> int:
    face = font(size, True)
    text_width = int(draw.textlength(label, font=face))
    width = text_width + 42
    draw.rounded_rectangle((x, y, x + width, y + size + 26), radius=(size + 26) // 2,
                           fill=dark_fill, outline=(*color[:3], 190), width=2)
    draw.text((x + 21, y + 10), label, font=face, fill=color)
    return width


def arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], color=TEAL,
          width: int = 5) -> None:
    draw.line((*start, *end), fill=color, width=width)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    length = 16
    spread = math.pi / 6
    left = (end[0] - math.cos(angle - spread) * length, end[1] - math.sin(angle - spread) * length)
    right = (end[0] - math.cos(angle + spread) * length, end[1] - math.sin(angle + spread) * length)
    draw.polygon((end, left, right), fill=color)


def save(image: Image.Image, filename: str) -> None:
    path = ASSET_DIR / filename
    image.convert("RGB").save(path, quality=94, subsampling=0, optimize=True)
    print(f"{filename}: {image.width}x{image.height}")


for required in (SCREENSHOT, MEASUREMENT, FONT_REGULAR, FONT_BOLD):
    if not required.exists():
        raise SystemExit(f"Missing required asset: {required}")

payload = json.loads(MEASUREMENT.read_text(encoding="utf-8"))
normal = payload["samples"]["normal"]
stress_setup = payload["samples"]["stressSetup"]
stress = payload["samples"]["stressMeasured"]
runtime = payload["api"]["runtime"]
environment = payload["environment"]
screenshot = Image.open(SCREENSHOT)


# 1. Article cover: typography-led, with the real stress scene as evidence.
cover = base_canvas(1920, 1080)
draw = ImageDraw.Draw(cover)

draw.rounded_rectangle((88, 72, 610, 132), radius=30, fill=(10, 40, 51, 240), outline=(*TEAL[:3], 180), width=2)
draw.text((116, 87), "STAR CLUSTER ARENA · ENGINEERING", font=font(22, True), fill=TEAL)

draw.text((88, 210), "99 个 AI + 2100+ 粒子", font=font(67, True), fill=(208, 231, 239, 255))
draw.text((88, 315), "浏览器性能", font=font(112, True), fill=INK, stroke_width=2, stroke_fill=(1, 9, 16, 255))
draw.text((88, 455), "优化实战", font=font(112, True), fill=TEAL, stroke_width=2, stroke_fill=(1, 9, 16, 255))
draw.text((94, 612), "1 玩家 + 99 AI · 真实压力场景", font=font(34, True), fill=AMBER)

metric_cards = [
    ("60 Hz", "固定模拟", TEAL),
    ("120 FPS", "渲染目标", BLUE),
    ("3.2M", "像素预算", AMBER),
]
card_x = 88
for value, label, color in metric_cards:
    card_w = 236
    panel(draw, (card_x, 696, card_x + card_w, 832), radius=22, fill=(7, 24, 35, 242), outline=(*color[:3], 170))
    draw.text((card_x + 24, 716), value, font=font(38, True), fill=color)
    draw.text((card_x + 24, 776), label, font=font(23, True), fill=MUTED)
    card_x += card_w + 18

x = 88
for label, color in (("WebGL2", TEAL), ("Canvas 2D", BLUE), ("固定时间步", AMBER)):
    x += pill(draw, x, 892, label, color, 23) + 16

# Screenshot card on the right, intentionally different from the previous collage covers.
sx, sy, sw, sh = 1010, 92, 824, 782
draw.rounded_rectangle((sx - 12, sy - 12, sx + sw + 12, sy + sh + 12), radius=34,
                       fill=(2, 10, 17, 250), outline=(*TEAL[:3], 220), width=3)
screen_card = rounded_image(screenshot, (sw, sh), 22, (0.55, 0.5))
cover.alpha_composite(screen_card, (sx, sy))
draw = ImageDraw.Draw(cover)
draw.rounded_rectangle((sx + 26, sy + 24, sx + 372, sy + 76), radius=16, fill=(3, 15, 24, 225))
draw.ellipse((sx + 45, sy + 41, sx + 57, sy + 53), fill=GREEN)
draw.text((sx + 72, sy + 34), "PLAYWRIGHT 压力场景", font=font(21, True), fill=INK)

panel(draw, (1060, 916, 1834, 1004), radius=22, fill=(7, 24, 35, 242), outline=(*BLUE[:3], 150))
draw.text((1092, 941), "WebGL2 点精灵批处理", font=font(27, True), fill=TEAL)
draw.text((1420, 941), "空间网格", font=font(27, True), fill=BLUE)
draw.text((1612, 941), "状态插值", font=font(27, True), fill=AMBER)

save(cover, "cover.jpg")


# 2. Frame architecture diagram.
architecture = base_canvas(1600, 900, BLUE)
draw = ImageDraw.Draw(architecture)
draw.text((70, 58), "一帧，不等于一次完整模拟", font=font(54, True), fill=INK)
draw.text((72, 126), "把游戏逻辑与显示刷新率拆开，高刷屏只增加渲染，不重复计算 AI 与碰撞", font=font(26), fill=MUTED)

steps = [
    ("01", "输入采样", "鼠标 / 键盘 / 触控", TEAL),
    ("02", "固定 60Hz 模拟", "AI · 移动 · 碰撞", BLUE),
    ("03", "状态快照 + 插值", "alpha = accumulator / step", AMBER),
    ("04", "最高 120 FPS 渲染", "只呈现，不重复跑逻辑", GREEN),
]
step_y = 240
step_w, step_h, gap = 330, 194, 46
for index, (number, title, subtitle, color) in enumerate(steps):
    x = 70 + index * (step_w + gap)
    panel(draw, (x, step_y, x + step_w, step_y + step_h), radius=25, fill=PANEL_ALT, outline=(*color[:3], 190), width=2)
    draw.text((x + 24, step_y + 20), number, font=font(23, True), fill=color)
    draw.text((x + 24, step_y + 65), title, font=font(31, True), fill=INK)
    draw.text((x + 24, step_y + 125), subtitle, font=font(20), fill=MUTED)
    if index < len(steps) - 1:
        arrow(draw, (x + step_w + 8, step_y + step_h // 2),
              (x + step_w + gap - 8, step_y + step_h // 2), color)

draw.rounded_rectangle((462, 454, 1138, 518), radius=20, fill=(27, 20, 10, 240), outline=(*AMBER[:3], 170), width=2)
draw.text((494, 471), "每帧最多补 3 次模拟；积压过多就丢弃，阻止死亡螺旋", font=font(24, True), fill=AMBER)

layers = [
    (70, "WebGL2 图层", "背景 + 食物点精灵\n一次 gl.drawArrays(GL_POINTS)", TEAL),
    (585, "Canvas 2D 图层", "球体 + 特效 + HUD\n前景像素预算 3,200,000", BLUE),
    (1100, "Node 运行时 API", "配置 + 健康检查 + Telemetry\n不是伪装成联网真人", AMBER),
]
for x, title, subtitle, color in layers:
    panel(draw, (x, 585, x + 430, 792), radius=25, fill=PANEL, outline=(*color[:3], 175))
    draw.rectangle((x + 1, 585, x + 9, 792), fill=color)
    draw.text((x + 34, 616), title, font=font(31, True), fill=color)
    first, second = subtitle.split("\n")
    draw.text((x + 34, 676), first, font=font(23, True), fill=INK)
    draw.text((x + 34, 722), second, font=font(21), fill=MUTED)

draw.text((70, 838), "核心关系：Simulation 60Hz → Snapshot → Interpolation → Render ≤ 120 FPS", font=font(23, True), fill=(177, 204, 216, 255))
save(architecture, "architecture.jpg")


# 3. Spatial-grid explainer.
spatial = base_canvas(1600, 900, TEAL)
draw = ImageDraw.Draw(spatial)
draw.text((70, 58), "空间网格：先缩小候选集，再做精确碰撞", font=font(51, True), fill=INK)
draw.text((72, 126), "7600 × 7600 世界 · CELL_BUCKET = 460 · 查询只扫描附近 bucket", font=font(26), fill=MUTED)

gx, gy, gw, gh = 70, 205, 900, 610
panel(draw, (gx, gy, gx + gw, gy + gh), radius=26, fill=(5, 22, 32, 244), outline=(*TEAL[:3], 170))
grid_left, grid_top, grid_size = gx + 42, gy + 42, 526
cell = grid_size / 17
for i in range(18):
    px = grid_left + i * cell
    py = grid_top + i * cell
    draw.line((px, grid_top, px, grid_top + grid_size), fill=(74, 118, 132, 95), width=1)
    draw.line((grid_left, py, grid_left + grid_size, py), fill=(74, 118, 132, 95), width=1)

# Highlight the 3x3 neighborhood around the query cell.
query_col, query_row = 8, 8
for col in range(query_col - 1, query_col + 2):
    for row in range(query_row - 1, query_row + 2):
        x0 = grid_left + col * cell
        y0 = grid_top + row * cell
        draw.rectangle((x0 + 1, y0 + 1, x0 + cell - 1, y0 + cell - 1), fill=(*TEAL[:3], 42))

rng = random.Random(396)
points = []
for _ in range(125):
    px = grid_left + rng.random() * grid_size
    py = grid_top + rng.random() * grid_size
    points.append((px, py))
    color = rng.choice((TEAL, BLUE, AMBER, GREEN, (205, 116, 255, 255)))
    radius = rng.choice((3, 4, 5))
    draw.ellipse((px - radius, py - radius, px + radius, py + radius), fill=color)

qx = grid_left + (query_col + 0.5) * cell
qy = grid_top + (query_row + 0.5) * cell
draw.ellipse((qx - cell * 1.38, qy - cell * 1.38, qx + cell * 1.38, qy + cell * 1.38),
             outline=AMBER, width=4)
draw.ellipse((qx - 10, qy - 10, qx + 10, qy + 10), fill=AMBER, outline=INK, width=2)
draw.rounded_rectangle((grid_left + 556, grid_top + 20, grid_left + 814, grid_top + 116), radius=18,
                       fill=(17, 31, 26, 240), outline=(*AMBER[:3], 170), width=2)
draw.text((grid_left + 580, grid_top + 39), "只取邻近桶", font=font(27, True), fill=AMBER)
draw.text((grid_left + 580, grid_top + 78), "减少无关配对", font=font(20), fill=MUTED)

legend_y = grid_top + 186
legend = [
    ("全量两两检查", "候选数量随对象数快速膨胀", RED),
    ("网格粗筛", "只收集查询范围覆盖的 bucket", TEAL),
    ("精确判定", "对候选对象再计算距离与半径", GREEN),
]
for title, subtitle, color in legend:
    draw.ellipse((grid_left + 570, legend_y + 8, grid_left + 588, legend_y + 26), fill=color)
    draw.text((grid_left + 606, legend_y), title, font=font(23, True), fill=color)
    draw.text((grid_left + 606, legend_y + 36), subtitle, font=font(18), fill=MUTED)
    legend_y += 104

right_x = 1010
cards = [
    ("数值键", "bucketX × 128 + bucketY", TEAL),
    ("双空间池", "cellSpacePool 轮换复用", BLUE),
    ("桶与数组复用", "bucketPool / candidateBuffer", AMBER),
    ("索引复用", "AI 容忍上一帧空间索引", GREEN),
]
card_y = 205
for title, subtitle, color in cards:
    panel(draw, (right_x, card_y, 1530, card_y + 126), radius=22, fill=PANEL_ALT, outline=(*color[:3], 160))
    draw.text((right_x + 28, card_y + 22), title, font=font(28, True), fill=color)
    draw.text((right_x + 28, card_y + 72), subtitle, font=font(21), fill=INK)
    card_y += 146

draw.text((1014, 803), "网格不是碰撞答案，", font=font(23, True), fill=AMBER)
draw.text((1014, 838), "它负责让精确判定少看无关对象。", font=font(23, True), fill=INK)
save(spatial, "spatial-grid.jpg")


# 4. Runtime measurement card, based entirely on the generated JSON.
runtime_card = base_canvas(1600, 900, AMBER)
draw = ImageDraw.Draw(runtime_card)
draw.text((70, 54), "可复现压力快照", font=font(53, True), fill=INK)
draw.text((72, 121), "无头浏览器诊断样本，不是跨设备跑分，也不代表所有机器", font=font(25), fill=MUTED)

sx, sy, sw, sh = 70, 192, 760, 560
draw.rounded_rectangle((sx - 8, sy - 8, sx + sw + 8, sy + sh + 8), radius=30,
                       fill=(2, 10, 17, 250), outline=(*TEAL[:3], 190), width=3)
runtime_shot = rounded_image(screenshot, (sw, 428), 20, (0.5, 0.5))
runtime_card.alpha_composite(runtime_shot, (sx, sy + 68))
draw = ImageDraw.Draw(runtime_card)
draw.rounded_rectangle((sx + 24, sy + 14, sx + 292, sy + 58), radius=14, fill=(4, 17, 27, 225))
draw.text((sx + 45, sy + 24), "真实压力场景截图", font=font(19, True), fill=TEAL)
draw.text((sx + 24, sy + 516), "60Hz 固定模拟", font=font(18, True), fill=TEAL)
draw.text((sx + 250, sy + 516), "120 FPS 渲染目标", font=font(18, True), fill=BLUE)
draw.text((sx + 520, sy + 516), "3.2M 像素预算", font=font(18, True), fill=AMBER)

rx, ry, rw, rh = 870, 192, 660, 560
panel(draw, (rx, ry, rx + rw, ry + rh), radius=28, fill=(7, 24, 35, 246), outline=(*AMBER[:3], 180), width=2)
draw.text((rx + 34, ry + 28), "8 秒压力样本", font=font(31, True), fill=AMBER)
draw.text((rx + 390, ry + 36), "WebGL2 · DPR 1", font=font(21, True), fill=TEAL)

metrics = [
    ("场上规模", f"{stress['targetPlayers']} 角色", "1 玩家 + 99 AI"),
    ("食物粒子", f"{stress['foodCount']}", f"动态目标 {stress['foodTarget']}"),
    ("可见球体", f"{stress['drawnCells']}", "视锥裁剪后的绘制数"),
    ("抛射物", f"{stress['ejected']}", f"压力夹具初始 {stress_setup['ejected']}"),
    ("平均帧间隔", f"{stress['avgFrame']:.1f} ms", f"最长 {stress['maxFrame']:.1f} ms"),
    ("平均帧工作", f"{stress['avgWork']:.1f} ms", f"长帧计数 {stress['longFrames']}"),
]
metric_y = ry + 96
for index, (label, value, note) in enumerate(metrics):
    col = index % 2
    row = index // 2
    x = rx + 34 + col * 304
    y = metric_y + row * 126
    draw.text((x, y), label, font=font(19, True), fill=MUTED)
    value_color = TEAL if col == 0 else BLUE
    draw.text((x, y + 31), value, font=font(33, True), fill=value_color)
    draw.text((x, y + 79), note, font=font(16), fill=(137, 162, 174, 255))

adaptive_label = "已触发" if stress["lowQuality"] else "未触发"
adaptive_color = AMBER if stress["lowQuality"] else GREEN
draw.rounded_rectangle((rx + 34, ry + 486, rx + rw - 34, ry + 532), radius=15,
                       fill=(24, 28, 19, 240), outline=(*adaptive_color[:3], 150), width=2)
draw.text((rx + 56, ry + 497), "自适应低画质", font=font(19, True), fill=MUTED)
draw.text((rx + 240, ry + 497), adaptive_label, font=font(19, True), fill=adaptive_color)
draw.text((rx + 358, ry + 497), "优先守住交互与帧预算", font=font(18), fill=INK)

captured = datetime.fromisoformat(environment["capturedAt"].replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=8)))
footer = (
    f"环境：Playwright Headless Edge {environment['browserVersion']} · 1600×900 · Windows · "
    f"{captured:%Y-%m-%d %H:%M}（北京时间）"
)
panel(draw, (70, 798, 1530, 854), radius=18, fill=(7, 22, 32, 238), outline=(70, 111, 130, 130))
draw.text((96, 814), footer, font=font(19), fill=(176, 199, 209, 255))
save(runtime_card, "runtime-card.jpg")
