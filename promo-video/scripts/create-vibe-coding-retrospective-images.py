from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[2]
CAPTURE_DIR = ROOT / "output" / "vibe-coding-retrospective"
ASSET_DIR = ROOT / "docs" / "images" / "vibe-coding-retrospective"
DATA_FILE = ASSET_DIR / "project-data.json"
STAR_CLUSTER = ROOT / "docs" / "images" / "browser-performance" / "star-cluster-stress.jpg"
FONT_REGULAR = Path("C:/Windows/Fonts/msyh.ttc")
FONT_BOLD = Path("C:/Windows/Fonts/msyhbd.ttc")

PAPER = (244, 240, 230, 255)
INK = (24, 29, 32, 255)
MUTED = (93, 101, 104, 255)
RED = (240, 80, 62, 255)
BLUE = (55, 83, 201, 255)
GREEN = (55, 157, 108, 255)
GOLD = (221, 159, 52, 255)
PURPLE = (132, 93, 182, 255)
SLATE = (104, 115, 120, 255)
WHITE = (255, 255, 252, 255)

RATING_COLORS = {
    "S": GREEN,
    "A": BLUE,
    "B": GOLD,
    "C": PURPLE,
    "D": SLATE,
}


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


def paper(width: int, height: int, accent=RED) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), PAPER)
    draw = ImageDraw.Draw(canvas)
    for x in range(0, width, 40):
        draw.line((x, 0, x, height), fill=(38, 50, 53, 18), width=1)
    for y in range(0, height, 40):
        draw.line((0, y, width, y), fill=(38, 50, 53, 18), width=1)
    draw.rectangle((0, 0, width, 10), fill=accent)
    for x in range(24, width, 80):
        draw.ellipse((x, 24, x + 4, 28), fill=(40, 48, 50, 42))
    return canvas


def panel(draw: ImageDraw.ImageDraw, box, radius=24, fill=WHITE, outline=(41, 49, 51, 80), width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def arrow(draw: ImageDraw.ImageDraw, start, end, color=INK, width=4):
    draw.line((*start, *end), fill=color, width=width)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    length = 14
    spread = math.pi / 6
    draw.polygon((
        end,
        (end[0] - math.cos(angle - spread) * length, end[1] - math.sin(angle - spread) * length),
        (end[0] - math.cos(angle + spread) * length, end[1] - math.sin(angle + spread) * length),
    ), fill=color)


def pill(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, color=INK, size=21, inverse=False) -> int:
    f = font(size, True)
    width = int(draw.textlength(text, font=f)) + 42
    fill = color if inverse else WHITE
    text_color = WHITE if inverse else color
    draw.rounded_rectangle((x, y, x + width, y + size + 26), radius=24,
                           fill=fill, outline=color, width=2)
    draw.text((x + 21, y + 10), text, font=f, fill=text_color)
    return width


def save(image: Image.Image, name: str):
    path = ASSET_DIR / name
    image.convert("RGB").save(path, quality=94, subsampling=0, optimize=True)
    print(f"{name}: {image.width}x{image.height}")


required = [
    DATA_FILE,
    STAR_CLUSTER,
    FONT_REGULAR,
    FONT_BOLD,
    *(CAPTURE_DIR / name for name in ["starforge.jpg", "moba.jpg", "shan-hai.jpg", "snake.jpg", "neon-2048.jpg"]),
]
for item in required:
    if not item.exists():
        raise SystemExit(f"Missing required input: {item}")

data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
ratings = data["ratings"]
audit = data["audit"]

sources = [
    ("星团大作战", Image.open(STAR_CLUSTER)),
    ("星炉工坊", Image.open(CAPTURE_DIR / "starforge.jpg")),
    ("晶塔前线", Image.open(CAPTURE_DIR / "moba.jpg")),
    ("山海伏魔录", Image.open(CAPTURE_DIR / "shan-hai.jpg")),
    ("霓虹贪吃蛇", Image.open(CAPTURE_DIR / "snake.jpg")),
    ("霓虹 2048", Image.open(CAPTURE_DIR / "neon-2048.jpg")),
]


# Cover: editorial rather than game-promo composition.
cover = paper(1920, 1080, RED)
draw = ImageDraw.Draw(cover)
draw.rounded_rectangle((84, 66, 532, 126), radius=30, fill=INK)
draw.text((112, 82), "VIBE CODING · 100 GAMES", font=font(22, True), fill=WHITE)

draw.text((84, 188), "我用 AI 做了", font=font(52, True), fill=MUTED)
draw.text((82, 252), "100 款游戏", font=font(106, True), fill=RED)
draw.text((86, 394), "之后才发现：", font=font(52, True), fill=INK)
draw.text((84, 486), "最容易制造的", font=font(69, True), fill=INK)
draw.text((84, 585), "不是作品", font=font(92, True), fill=BLUE)
draw.text((84, 704), "而是原型", font=font(106, True), fill=RED)

badge_x = 84
for label, color in (("100 个 HTML", BLUE), ("200 页面审计", GREEN), ("7 轮质量升级", GOLD)):
    badge_x += pill(draw, badge_x, 868, label, color, 22) + 14

# 10x10 repository wall: all runnable, but only the first 10 carry the S color.
grid_x, grid_y, cell, gap = 1090, 96, 49, 9
rating_sequence = []
for rating in ["S", "A", "B", "C", "D"]:
    rating_sequence.extend([rating] * ratings[rating])
for index, rating in enumerate(rating_sequence):
    row, col = divmod(index, 10)
    x = grid_x + col * (cell + gap)
    y = grid_y + row * (cell + gap)
    color = RATING_COLORS[rating]
    alpha_fill = (*color[:3], 245 if rating == "S" else 120)
    draw.rounded_rectangle((x, y, x + cell, y + cell), radius=10, fill=alpha_fill,
                           outline=(*INK[:3], 70), width=1)
    if index < 10:
        draw.text((x + 15, y + 10), "S", font=font(20, True), fill=WHITE)

panel(draw, (1060, 700, 1788, 974), radius=28, fill=(27, 33, 35, 255), outline=INK, width=2)
thumb_w, thumb_h = 208, 132
for index, (name, source) in enumerate(sources[:3]):
    x = 1086 + index * 232
    card = rounded_image(source, (thumb_w, thumb_h), 14, (0.5, 0.45))
    cover.alpha_composite(card, (x, 728))
    draw = ImageDraw.Draw(cover)
    draw.text((x, 876), name, font=font(18, True), fill=WHITE)
draw.text((1086, 928), "能运行，是起点；值得反复玩，才接近作品。", font=font(23, True), fill=(210, 220, 215, 255))
save(cover, "cover.jpg")


# Multi-game evidence gallery.
gallery = paper(1600, 900, BLUE)
draw = ImageDraw.Draw(gallery)
draw.text((62, 48), "这不是一个游戏的复盘，而是 100 个项目的共同问题", font=font(46, True), fill=INK)
draw.text((64, 111), "六种玩法、六套界面、六类系统深度，背后却反复出现相同的“原型陷阱”", font=font(24), fill=MUTED)

card_w, card_h = 468, 292
positions = [(62, 178), (566, 178), (1070, 178), (62, 520), (566, 520), (1070, 520)]
accent_colors = [GREEN, GOLD, RED, PURPLE, BLUE, GREEN]
for (name, source), (x, y), color in zip(sources, positions, accent_colors):
    draw.rounded_rectangle((x - 7, y - 7, x + card_w + 7, y + card_h + 7), radius=24,
                           fill=WHITE, outline=color, width=3)
    shot = rounded_image(source, (card_w, card_h), 18, (0.5, 0.45))
    gallery.alpha_composite(shot, (x, y))
    draw = ImageDraw.Draw(gallery)
    draw.rounded_rectangle((x + 16, y + 16, x + 188, y + 56), radius=14, fill=(*INK[:3], 226))
    draw.text((x + 34, y + 25), name, font=font(17, True), fill=WHITE)
save(gallery, "project-gallery.jpg")


# Rating distribution: runnable is not the same as recommendable.
distribution = paper(1600, 900, GREEN)
draw = ImageDraw.Draw(distribution)
draw.text((64, 50), "100 个能运行，不等于 100 个作品", font=font(53, True), fill=INK)
draw.text((66, 119), "内部评级衡量内容闭环、重玩性、反馈、双端体验与稳定性，不是市场评分", font=font(23), fill=MUTED)

gx, gy, tile, gap = 70, 210, 48, 9
for index, rating in enumerate(rating_sequence):
    row, col = divmod(index, 10)
    x = gx + col * (tile + gap)
    y = gy + row * (tile + gap)
    color = RATING_COLORS[rating]
    draw.rounded_rectangle((x, y, x + tile, y + tile), radius=10, fill=color)
    if col == 0:
        draw.text((x + 15, y + 9), rating, font=font(20, True), fill=WHITE)

legend_x, legend_y = 700, 205
for rating in ["S", "A", "B", "C", "D"]:
    color = RATING_COLORS[rating]
    panel(draw, (legend_x, legend_y, 1040, legend_y + 82), radius=18, fill=WHITE, outline=color, width=2)
    draw.rounded_rectangle((legend_x + 20, legend_y + 20, legend_x + 62, legend_y + 62), radius=10, fill=color)
    draw.text((legend_x + 34, legend_y + 29), rating, font=font(18, True), fill=WHITE)
    draw.text((legend_x + 84, legend_y + 19), f"{ratings[rating]} 款", font=font(25, True), fill=INK)
    descriptions = {
        "S": "成熟闭环，可作为主宣传",
        "A": "核心成立，仍有提升空间",
        "B": "完整短局，深度有限",
        "C": "概念成立，仍偏原型",
        "D": "停止投入，保留开源",
    }
    draw.text((legend_x + 84, legend_y + 50), descriptions[rating], font=font(16), fill=MUTED)
    legend_y += 100

panel(draw, (1100, 205, 1532, 705), radius=26, fill=(27, 33, 35, 255), outline=INK, width=2)
metrics = [
    (str(audit["games"]), "游戏页面", RED),
    (str(audit["pages"]), "双视口组合", BLUE),
    ("0", "加载 / JS / 控制台 / 溢出", GREEN),
    (str(data["qualityRounds"]), "轮质量升级", GOLD),
    (str(audit["weakPages"]), "启发式薄弱候选", PURPLE),
]
my = 230
for value, label, color in metrics:
    draw.text((1134, my), value, font=font(45, True), fill=color)
    draw.text((1250, my + 13), label, font=font(19, True), fill=WHITE)
    my += 91
draw.text((1102, 750), "技术底线全部通过，", font=font(24, True), fill=GREEN)
draw.text((1102, 792), "仍不代表每款都值得推荐。", font=font(28, True), fill=INK)
save(distribution, "quality-distribution.jpg")


# Prototype vs. product comparison.
comparison = paper(1600, 900, RED)
draw = ImageDraw.Draw(comparison)
draw.text((64, 48), "原型和作品的分界，不在“有没有功能”", font=font(50, True), fill=INK)
draw.text((66, 115), "原型证明一个想法能跑；作品要证明它值得继续玩、能够稳定交付", font=font(24), fill=MUTED)

left_x, right_x = 70, 835
panel(draw, (left_x, 190, 745, 820), radius=28, fill=(255, 247, 243, 255), outline=RED, width=3)
panel(draw, (right_x, 190, 1530, 820), radius=28, fill=(242, 250, 245, 255), outline=GREEN, width=3)
draw.text((104, 220), "RUNNABLE PROTOTYPE", font=font(19, True), fill=RED)
draw.text((104, 262), "能运行的原型", font=font(38, True), fill=INK)
draw.text((869, 220), "RELEASE-READY WORK", font=font(19, True), fill=GREEN)
draw.text((869, 262), "可以交付的作品", font=font(38, True), fill=INK)

pairs = [
    ("入口可以点击", "胜负、失败、重试与终局闭环"),
    ("一个核心循环", "循环中持续出现新决策"),
    ("功能彼此并列", "系统之间互相驱动"),
    ("存进 localStorage", "迁移、校验、清洗与断点"),
    ("桌面看起来正常", "桌面与触屏都真实操作"),
    ("AI 说已经完成", "验收标准与回归证据"),
]
row_y = 340
for left, right in pairs:
    draw.ellipse((106, row_y + 7, 122, row_y + 23), fill=RED)
    draw.text((142, row_y), left, font=font(24, True), fill=INK)
    arrow(draw, (672, row_y + 18), (802, row_y + 18), color=(97, 107, 108, 150), width=3)
    draw.ellipse((871, row_y + 7, 887, row_y + 23), fill=GREEN)
    draw.text((907, row_y), right, font=font(24, True), fill=INK)
    row_y += 72

draw.rounded_rectangle((270, 770, 1330, 850), radius=22, fill=INK)
draw.text((312, 792), "功能数量可以由 AI 快速增加；闭环、取舍和品味仍需要人来负责。", font=font(26, True), fill=WHITE)
save(comparison, "prototype-vs-work.jpg")


# Quality loop: the process that turned prompting into engineering.
loop = paper(1600, 900, BLUE)
draw = ImageDraw.Draw(loop)
draw.text((64, 48), "Vibe Coding 不是一条提示词，而是一套质量闭环", font=font(49, True), fill=INK)
draw.text((66, 108), "从“继续优化一下”转向可验证目标", font=font(21), fill=MUTED)
draw.text((66, 139), "AI 才从原型生成器变成工程放大器", font=font(21), fill=MUTED)

center = (800, 500)
draw.ellipse((620, 320, 980, 680), fill=(27, 33, 35, 255), outline=BLUE, width=4)
draw.text((698, 420), "QUALITY", font=font(24, True), fill=(145, 166, 255, 255))
draw.text((674, 468), "质量闭环", font=font(48, True), fill=WHITE)
draw.text((691, 536), "不是一次生成", font=font(25, True), fill=(204, 211, 214, 255))

nodes = [
    (800, 190, "01", "挑选潜力", "不平均用力", RED),
    (1180, 265, "02", "定义问题", "把“好玩”拆成标准", GOLD),
    (1370, 500, "03", "深化循环", "增加新决策而非新数字", GREEN),
    (1180, 735, "04", "补长期目标", "存档、成长与重玩", BLUE),
    (800, 810, "05", "真实游玩", "主动走失败和终局", PURPLE),
    (420, 735, "06", "专项回归", "验证作品独有状态", GREEN),
    (230, 500, "07", "全仓审计", "桌面、触屏与错误", GOLD),
    (420, 265, "08", "发布复盘", "评级、文档与下一轮", BLUE),
]
node_positions = []
for x, y, number, title, subtitle, color in nodes:
    box = (x - 150, y - 64, x + 150, y + 64)
    panel(draw, box, radius=22, fill=WHITE, outline=color, width=3)
    draw.text((x - 126, y - 40), number, font=font(18, True), fill=color)
    draw.text((x - 76, y - 42), title, font=font(24, True), fill=INK)
    draw.text((x - 126, y + 7), subtitle, font=font(17), fill=MUTED)
    node_positions.append((x, y, color))

for index, (x, y, color) in enumerate(node_positions):
    nx, ny, _ = node_positions[(index + 1) % len(node_positions)]
    dx, dy = nx - x, ny - y
    length = math.hypot(dx, dy) or 1
    start = (int(x + dx / length * 158), int(y + dy / length * 72))
    end = (int(nx - dx / length * 158), int(ny - dy / length * 72))
    arrow(draw, start, end, color=color, width=4)
save(loop, "quality-loop.jpg")
