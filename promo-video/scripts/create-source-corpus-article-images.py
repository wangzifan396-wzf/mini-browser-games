from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "docs" / "images" / "source-corpus-analysis"
DATA_FILE = ASSET_DIR / "source-analysis.json"
FONT_REGULAR = Path("C:/Windows/Fonts/msyh.ttc")
FONT_BOLD = Path("C:/Windows/Fonts/msyhbd.ttc")

BG = (7, 13, 23, 255)
PANEL = (13, 24, 39, 244)
PANEL_ALT = (17, 31, 49, 246)
INK = (239, 247, 251, 255)
MUTED = (151, 172, 186, 255)
GRID = (58, 86, 105, 55)
CYAN = (69, 218, 225, 255)
GREEN = (96, 224, 148, 255)
ORANGE = (255, 174, 72, 255)
PURPLE = (183, 133, 255, 255)
RED = (255, 102, 113, 255)
BLUE = (81, 151, 255, 255)
YELLOW = (249, 211, 91, 255)

RATING_COLORS = {"S": GREEN, "A": BLUE, "B": ORANGE, "C": PURPLE, "D": (113, 130, 143, 255)}


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REGULAR), size)


def base(width: int, height: int, accent=CYAN) -> Image.Image:
    image = Image.new("RGBA", (width, height), BG)
    draw = ImageDraw.Draw(image)
    for x in range(0, width, 48):
        draw.line((x, 0, x, height), fill=GRID, width=1)
    for y in range(0, height, 48):
        draw.line((0, y, width, y), fill=GRID, width=1)
    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((width * 0.52, -height * 0.5, width * 1.2, height * 0.55), fill=(*accent[:3], 42))
    gd.ellipse((-width * 0.32, height * 0.55, width * 0.42, height * 1.45), fill=(*PURPLE[:3], 24))
    image = Image.alpha_composite(image, glow.filter(ImageFilter.GaussianBlur(max(70, width // 17))))
    ImageDraw.Draw(image).rectangle((0, 0, width, 8), fill=accent)
    return image


def panel(draw: ImageDraw.ImageDraw, box, radius=24, fill=PANEL, outline=(77, 111, 132, 150), width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def pill(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, color=CYAN, size=21) -> int:
    face = font(size, True)
    width = int(draw.textlength(text, font=face)) + 42
    draw.rounded_rectangle((x, y, x + width, y + size + 26), radius=24,
                           fill=(9, 21, 33, 242), outline=(*color[:3], 185), width=2)
    draw.text((x + 21, y + 10), text, font=face, fill=color)
    return width


def arrow(draw: ImageDraw.ImageDraw, start, end, color=CYAN, width=4):
    draw.line((*start, *end), fill=color, width=width)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    length = 14
    spread = math.pi / 6
    draw.polygon((
        end,
        (end[0] - math.cos(angle - spread) * length, end[1] - math.sin(angle - spread) * length),
        (end[0] - math.cos(angle + spread) * length, end[1] - math.sin(angle + spread) * length),
    ), fill=color)


def save(image: Image.Image, name: str):
    path = ASSET_DIR / name
    image.convert("RGB").save(path, quality=94, subsampling=0, optimize=True)
    print(f"{name}: {image.width}x{image.height}")


def compact_bytes(value: int) -> str:
    if value >= 1024 * 1024:
        return f"{value / 1024 / 1024:.1f} MB"
    return f"{value / 1024:.1f} KB"


def bar(draw: ImageDraw.ImageDraw, x: int, y: int, width: int, value: float, maximum: float,
        color, label: str, value_text: str, height=28):
    draw.text((x, y), label, font=font(18, True), fill=INK)
    track_x = x + 220
    draw.rounded_rectangle((track_x, y + 1, track_x + width, y + height), radius=height // 2,
                           fill=(34, 51, 65, 210))
    fill_width = max(5, int(width * value / max(1, maximum))) if value > 0 else 0
    if fill_width:
        draw.rounded_rectangle((track_x, y + 1, track_x + fill_width, y + height), radius=height // 2,
                               fill=color)
    draw.text((track_x + width + 16, y), value_text, font=font(19, True), fill=color)


for required in (DATA_FILE, FONT_REGULAR, FONT_BOLD):
    if not required.exists():
        raise SystemExit(f"Missing required input: {required}")

data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
totals = data["totals"]
size = data["size"]
features = data["featureCounts"]
files = data["files"]
by_rating = data["byRating"]
top_functions = data["topFunctionNames"]


# Cover: source-corpus dashboard rather than a game screenshot.
cover = base(1920, 1080, CYAN)
draw = ImageDraw.Draw(cover)
draw.rounded_rectangle((86, 70, 620, 132), radius=30, fill=(11, 29, 43, 245), outline=(*CYAN[:3], 175), width=2)
draw.text((116, 86), "STATIC CORPUS · 100 HTML GAMES", font=font(22, True), fill=CYAN)

draw.text((86, 218), "我扫描了", font=font(58, True), fill=(197, 216, 225, 255))
draw.text((84, 302), "100 个 AI 游戏源码", font=font(83, True), fill=INK)
draw.text((84, 438), "Vibe Coding", font=font(101, True), fill=CYAN)
draw.text((84, 565), "最爱写什么？", font=font(102, True), fill=ORANGE)
draw.text((90, 710), "Canvas · localStorage · 输入 API · 单文件架构", font=font(30, True), fill=MUTED)

badge_x = 86
for label, color in (("2.8 MB 语料", CYAN), ("2,587 个函数", GREEN), ("0 外部脚本", ORANGE)):
    badge_x += pill(draw, badge_x, 790, label, color, 23) + 16

panel(draw, (86, 904, 930, 1004), radius=24, fill=(10, 25, 38, 244), outline=(*PURPLE[:3], 145))
draw.text((118, 928), "结论来自公开 JSON，不把仓库约束误写成 AI 的普遍规律", font=font(25, True), fill=PURPLE)

# Sorted source-size skyline.
chart_x, chart_y, chart_w, chart_h = 1050, 110, 780, 550
panel(draw, (chart_x - 26, chart_y - 34, chart_x + chart_w + 26, chart_y + chart_h + 92),
      radius=30, fill=(8, 20, 32, 248), outline=(*CYAN[:3], 185), width=3)
draw.text((chart_x, chart_y - 8), "100 FILES · SORTED BY BYTES", font=font(20, True), fill=CYAN)
sorted_files = sorted(files, key=lambda item: item["bytes"])
bar_w = chart_w / len(sorted_files)
min_log = math.log10(min(item["bytes"] for item in sorted_files))
max_log = math.log10(max(item["bytes"] for item in sorted_files))
for index, item in enumerate(sorted_files):
    height = 28 + (math.log10(item["bytes"]) - min_log) / (max_log - min_log) * (chart_h - 38)
    x = chart_x + index * bar_w
    y = chart_y + chart_h - height
    color = RATING_COLORS[item["rating"]]
    draw.rectangle((x, y, x + max(2, bar_w - 1), chart_y + chart_h), fill=color)

draw.line((chart_x, chart_y + chart_h, chart_x + chart_w, chart_y + chart_h), fill=(151, 180, 194, 150), width=2)
draw.text((chart_x, chart_y + chart_h + 18), compact_bytes(size["minBytes"]), font=font(18), fill=MUTED)
max_text = compact_bytes(size["maxBytes"])
draw.text((chart_x + chart_w - int(draw.textlength(max_text, font=font(18))), chart_y + chart_h + 18),
          max_text, font=font(18), fill=MUTED)

legend_y = 758
legend_x = 1050
for rating in ["S", "A", "B", "C", "D"]:
    color = RATING_COLORS[rating]
    draw.rounded_rectangle((legend_x, legend_y, legend_x + 42, legend_y + 42), radius=10, fill=color)
    draw.text((legend_x + 13, legend_y + 8), rating, font=font(18, True), fill=INK if rating == "S" else INK)
    draw.text((legend_x + 54, legend_y + 10), str(by_rating[rating]["count"]), font=font(18, True), fill=INK)
    legend_x += 142
draw.text((1050, 834), "颜色是项目内部评级；柱高使用对数刻度，仅表示源码体积。", font=font(22), fill=MUTED)
panel(draw, (1050, 900, 1830, 1004), radius=22, fill=(10, 25, 38, 244), outline=(*GREEN[:3], 145))
draw.text((1082, 924), "50 Canvas 2D", font=font(24, True), fill=GREEN)
draw.text((1340, 924), "49 DOM/CSS", font=font(24, True), fill=BLUE)
draw.text((1588, 924), "1 DOM + SVG", font=font(24, True), fill=PURPLE)
save(cover, "cover.jpg")


# Corpus overview: size distribution and byte composition.
overview = base(1600, 900, BLUE)
draw = ImageDraw.Draw(overview)
draw.text((64, 52), "100 个单 HTML 文件：主体很小，尾部很长", font=font(50, True), fill=INK)
draw.text((66, 119), "字节数比代码行更适合比较，因为仓库同时存在格式化文件和三行压缩文件", font=font(23), fill=MUTED)

panel(draw, (64, 190, 970, 682), radius=28, fill=PANEL_ALT, outline=(*BLUE[:3], 175))
draw.text((94, 220), "文件体积分布", font=font(29, True), fill=BLUE)
hist = size["histogram"]
max_count = max(item["count"] for item in hist)
base_y = 610
chart_left = 110
column_w = 125
for index, item in enumerate(hist):
    height = int(item["count"] / max_count * 300)
    x = chart_left + index * column_w
    color = [PURPLE, BLUE, CYAN, GREEN, ORANGE, RED][index]
    draw.rounded_rectangle((x, base_y - height, x + 82, base_y), radius=14, fill=color)
    draw.text((x + 28, base_y - height - 38), str(item["count"]), font=font(24, True), fill=color)
    label_face = font(16, True)
    label_width = int(draw.textlength(item["label"], font=label_face))
    draw.text((x + 41 - label_width / 2, base_y + 18), item["label"], font=label_face, fill=MUTED)

panel(draw, (1010, 190, 1536, 682), radius=28, fill=PANEL, outline=(*CYAN[:3], 175))
draw.text((1040, 220), "语料组成", font=font(29, True), fill=CYAN)
markup_bytes = totals["bytes"] - totals["inlineScriptBytes"] - totals["inlineStyleBytes"]
composition = [
    ("JavaScript", totals["inlineScriptBytes"], CYAN),
    ("CSS", totals["inlineStyleBytes"], PURPLE),
    ("HTML 标记", markup_bytes, ORANGE),
]
track_x, track_y, track_w = 1040, 292, 456
cursor = track_x
for label, value, color in composition:
    width = track_w * value / totals["bytes"]
    draw.rectangle((cursor, track_y, cursor + width, track_y + 54), fill=color)
    cursor += width
detail_y = 382
for label, value, color in composition:
    percentage = value / totals["bytes"] * 100
    draw.ellipse((1042, detail_y + 7, 1058, detail_y + 23), fill=color)
    draw.text((1074, detail_y), label, font=font(21, True), fill=INK)
    draw.text((1278, detail_y), f"{percentage:.1f}%", font=font(22, True), fill=color)
    draw.text((1385, detail_y), compact_bytes(value), font=font(18), fill=MUTED)
    detail_y += 58
draw.text((1040, 580), f"合计 {totals['megabytes']:.1f} MB", font=font(35, True), fill=INK)
draw.text((1040, 630), "不是打包体积，是 100 个源文件总和", font=font(18), fill=MUTED)

stats = [
    ("P25", compact_bytes(size["p25Bytes"]), PURPLE),
    ("中位数", compact_bytes(size["medianBytes"]), CYAN),
    ("P75", compact_bytes(size["p75Bytes"]), GREEN),
    ("最大", compact_bytes(size["maxBytes"]), RED),
]
stat_x = 64
for label, value, color in stats:
    panel(draw, (stat_x, 730, stat_x + 340, 838), radius=22, fill=PANEL, outline=(*color[:3], 150))
    draw.text((stat_x + 24, 751), label, font=font(18, True), fill=MUTED)
    draw.text((stat_x + 24, 786), value, font=font(31, True), fill=color)
    stat_x += 372
save(overview, "corpus-overview.jpg")


# API fingerprint.
fingerprint = base(1600, 900, GREEN)
draw = ImageDraw.Draw(fingerprint)
draw.text((64, 50), "这个仓库的源码指纹：自包含、双路线、轻工程化", font=font(49, True), fill=INK)
draw.text((66, 116), "计数表示静态扫描命中多少个文件；同一文件可以同时命中多个特征", font=font(23), fill=MUTED)

groups = [
    (64, 190, "渲染与循环", GREEN, [
        ("Canvas 2D", features["canvas2d"]),
        ("DOM/CSS + SVG", data["renderingCounts"].get("DOM/CSS", 0) + data["renderingCounts"].get("DOM + SVG", 0)),
        ("requestAnimationFrame", features["animationFrame"]),
        ("setInterval", features["intervalTimer"]),
    ]),
    (818, 190, "输入与可访问性", BLUE, [
        ("Click", features["clickInput"]),
        ("响应式 @media", features["responsiveCss"]),
        ("Pointer Events", features["pointerInput"]),
        ("键盘事件", features["keyboardInput"]),
        ("ARIA", features["aria"]),
        ("直接 Touch Events", features["touchInput"]),
    ]),
    (64, 535, "状态与可携带性", ORANGE, [
        ("localStorage", features["localStorage"]),
        ("JSON 序列化", features["jsonSerialization"]),
        ("Clipboard API", features["clipboard"]),
        ("导入 / 导出路径", features["exportImportSave"]),
        ("校验 / Hash", features["saveChecksum"]),
    ]),
    (818, 535, "视觉、反馈与高级 API", PURPLE, [
        ("渐变", features["gradient"]),
        ("阴影", features["shadow"]),
        ("CSS 自定义属性", features["cssCustomProperties"]),
        ("Web Audio", features["webAudio"]),
        ("CSS Animation", features["cssAnimation"]),
        ("TypedArray", features["typedArray"]),
    ]),
]
for x, y, title, color, items in groups:
    height = 310 if y < 500 else 300
    panel(draw, (x, y, x + 718, y + height), radius=26, fill=PANEL_ALT, outline=(*color[:3], 165))
    draw.text((x + 28, y + 22), title, font=font(26, True), fill=color)
    row_y = y + 78
    max_value = max(value for _, value in items)
    for label, value in items:
        bar(draw, x + 28, row_y, 340, value, max_value, color, label, str(value), height=22)
        row_y += 38

draw.rounded_rectangle((320, 854, 1280, 894), radius=18, fill=(10, 24, 37, 245), outline=(*CYAN[:3], 130), width=2)
draw.text((356, 862), "根目录：0 HTTP(S) 外部脚本/样式 · 0 module script · 0 fetch · 0 Worker", font=font(19, True), fill=CYAN)
save(fingerprint, "api-fingerprint.jpg")


# Rating vs source size: log-scale dots with explicit caveat.
rating_plot = base(1600, 900, ORANGE)
draw = ImageDraw.Draw(rating_plot)
draw.text((64, 50), "文件越大，内部评级越高？相关很强，因果相反", font=font(48, True), fill=INK)
draw.text((66, 116), "高潜力作品被连续升级，源码体积记录的是投入历史；它不是质量公式", font=font(23), fill=MUTED)

plot_x, plot_y, plot_w, row_h = 170, 220, 980, 105
min_kb = min(item["bytes"] for item in files) / 1024
max_kb = max(item["bytes"] for item in files) / 1024
log_min, log_max = math.log10(2), math.log10(350)

def x_for_kb(value: float) -> float:
    return plot_x + (math.log10(max(2, value)) - log_min) / (log_max - log_min) * plot_w


for tick in [2, 5, 10, 20, 50, 100, 200, 350]:
    x = x_for_kb(tick)
    draw.line((x, plot_y - 24, x, plot_y + row_h * 5 - 22), fill=(84, 111, 128, 70), width=1)
    label = f"{tick}KB"
    draw.text((x - draw.textlength(label, font=font(15)) / 2, plot_y + row_h * 5 - 8), label,
              font=font(15), fill=MUTED)

for row, rating in enumerate(["S", "A", "B", "C", "D"]):
    y = plot_y + row * row_h
    color = RATING_COLORS[rating]
    draw.text((78, y + 28), rating, font=font(31, True), fill=color)
    draw.line((plot_x, y + 46, plot_x + plot_w, y + 46), fill=(78, 100, 115, 85), width=2)
    group = [item for item in files if item["rating"] == rating]
    for index, item in enumerate(group):
        x = x_for_kb(item["bytes"] / 1024)
        jitter = ((index * 17) % 31) - 15
        draw.ellipse((x - 6, y + 40 + jitter - 6, x + 6, y + 40 + jitter + 6), fill=(*color[:3], 205))
    median_kb = by_rating[rating]["medianBytes"] / 1024
    median_x = x_for_kb(median_kb)
    draw.line((median_x, y + 10, median_x, y + 78), fill=INK, width=4)
    draw.text((1178, y + 22), f"中位 {median_kb:.1f} KB", font=font(21, True), fill=color)

panel(draw, (1160, 210, 1532, 718), radius=26, fill=PANEL, outline=(*ORANGE[:3], 175))
draw.text((1190, 238), "描述性结果", font=font(25, True), fill=ORANGE)
draw.text((1190, 295), "r = 0.900", font=font(45, True), fill=INK)
draw.text((1190, 350), "log10(bytes) 与\n内部评级分数", font=font(20), fill=MUTED, spacing=8)
draw.line((1190, 435, 1500, 435), fill=(95, 119, 132, 100), width=2)
notes = [
    "S 作品先被选中",
    "随后追加内容与系统",
    "D 作品则冻结投入",
    "评级与体积共同受投入影响",
]
ny = 468
for note in notes:
    draw.ellipse((1192, ny + 7, 1206, ny + 21), fill=ORANGE)
    draw.text((1222, ny), note, font=font(18), fill=INK)
    ny += 50
draw.rounded_rectangle((194, 785, 1406, 850), radius=20, fill=(25, 22, 15, 246), outline=(*ORANGE[:3], 155), width=2)
draw.text((238, 803), "不能推导：增加代码 → 提高质量。更合理的解释是：持续升级 → 同时增加体积与内部评级。", font=font(23, True), fill=ORANGE)
save(rating_plot, "rating-vs-size.jpg")


# Code vocabulary and recurring skeleton.
vocabulary = base(1600, 900, PURPLE)
draw = ImageDraw.Draw(vocabulary)
draw.text((64, 50), "命名暴露了代码谱系：100 个文件反复使用同一套骨架", font=font(46, True), fill=INK)
draw.text((66, 116), "统计命名函数出现于多少个文件；同名函数不保证语义完全相同", font=font(23), fill=MUTED)

panel(draw, (64, 188, 850, 742), radius=28, fill=PANEL_ALT, outline=(*PURPLE[:3], 175))
draw.text((94, 216), "高频命名函数", font=font(28, True), fill=PURPLE)
top = top_functions[:12]
max_files = top[0]["fileCount"]
row_y = 272
for item in top:
    bar(draw, 94, row_y, 420, item["fileCount"], max_files, PURPLE,
        item["name"], f"{item['fileCount']} 文件", height=22)
    row_y += 37

panel(draw, (900, 188, 1536, 742), radius=28, fill=PANEL, outline=(*CYAN[:3], 175))
draw.text((930, 216), "反复出现的程序骨架", font=font(28, True), fill=CYAN)
skeleton = [
    ("makeState / fresh", "建立初始状态", GREEN),
    ("start / reset", "开始与重开", BLUE),
    ("update / loop", "推进时间和规则", ORANGE),
    ("draw / render / sync", "输出画面与界面", PURPLE),
    ("save / load", "保留长期状态", CYAN),
]
sy = 290
for index, (names, label, color) in enumerate(skeleton):
    draw.rounded_rectangle((944, sy, 1492, sy + 65), radius=18, fill=(14, 30, 44, 245), outline=(*color[:3], 150), width=2)
    draw.text((968, sy + 10), names, font=font(20, True), fill=color)
    draw.text((1240, sy + 13), label, font=font(18), fill=INK)
    if index < len(skeleton) - 1:
        arrow(draw, (1218, sy + 70), (1218, sy + 88), color=color, width=3)
    sy += 92

panel(draw, (64, 778, 1536, 850), radius=20, fill=(10, 24, 37, 245), outline=(*GREEN[:3], 130))
draw.text((94, 797), f"全语料：{totals['functionDeclarations']:,} 个命名函数声明 · {totals['eventListenerCalls']:,} 次 addEventListener 调用", font=font(23, True), fill=GREEN)
draw.text((980, 799), "注意：draw 也可能表示“抽牌”", font=font(19), fill=MUTED)
save(vocabulary, "code-vocabulary.jpg")
