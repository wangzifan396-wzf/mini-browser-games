import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[2]
IMAGE_DIR = ROOT / "docs" / "images" / "deterministic-schedules"
DATA = json.loads((IMAGE_DIR / "article-data.json").read_text(encoding="utf-8"))
METRICS = DATA["metrics"]
SCREENSHOT = ROOT / DATA["screenshot"]

FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")
FONT_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_MONO = Path(r"C:\Windows\Fonts\consola.ttf")

BG = (22, 31, 32)
SURFACE = (34, 49, 49)
SURFACE_2 = (44, 60, 59)
INK = (245, 242, 233)
MUTED = (184, 194, 188)
MINT = (92, 201, 164)
GOLD = (230, 180, 78)
CORAL = (224, 104, 100)
BLUE = (101, 169, 211)
VIOLET = (160, 128, 183)


def font(path: Path, size: int):
    return ImageFont.truetype(str(path), size)


def text(draw, xy, value, size, fill=INK, bold=False, mono=False, anchor=None):
    path = FONT_MONO if mono else FONT_BOLD if bold else FONT_REGULAR
    draw.text(xy, value, font=font(path, size), fill=fill, anchor=anchor)


def panel(draw, box, fill=SURFACE, outline=(73, 94, 90), width=2, radius=10):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def fit_image(path: Path, size, centering=(0.5, 0.12)):
    with Image.open(path) as source:
        image = source.convert("RGB")
    return ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=centering)


def save(image, name):
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    target = IMAGE_DIR / name
    image.save(target, "JPEG", quality=94, optimize=True, progressive=True)
    print(target)


def arrow(draw, start, end, fill=MUTED, width=5):
    draw.line((start[0], start[1], end[0], end[1]), fill=fill, width=width)
    x, y = end
    draw.polygon((x, y, x - 16, y - 10, x - 16, y + 10), fill=fill)


def create_cover():
    image = Image.new("RGB", (1920, 1080), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1920, 16), fill=MINT)
    text(draw, (92, 70), "DETERMINISTIC EVENT SCHEDULES", 28, MINT, True)
    text(draw, (88, 138), "Seed 不是", 100, INK, True)
    text(draw, (88, 258), "可复现的终点", 100, INK, True)
    text(draw, (94, 414), "把实时随机内容编译成可验证事件计划", 37, MUTED)

    metrics = [
        (str(METRICS["missions"]), "固定计划", MINT),
        (str(METRICS["events"]), "计划事件", GOLD),
        (str(METRICS["orderItems"]), "业务目标", BLUE),
        (str(METRICS["auditedPages"]), "双端页面", CORAL),
    ]
    for index, (value, label, accent) in enumerate(metrics):
        x = 94 + index * 430
        panel(draw, (x, 520, x + 390, 690), fill=SURFACE, outline=accent, width=3)
        text(draw, (x + 26, 540), value, 64, accent, True)
        text(draw, (x + 26, 625), label, 24, MUTED)

    screenshot = fit_image(SCREENSHOT, (1090, 306), centering=(0.5, 0.04))
    image.paste(screenshot, (736, 740))
    draw.rectangle((736, 740, 752, 1046), fill=CORAL)
    panel(draw, (94, 740, 660, 1046), fill=SURFACE_2, outline=(72, 94, 90))
    text(draw, (128, 774), "seed + config", 30, GOLD, True, mono=True)
    arrow(draw, (345, 800), (552, 800), fill=GOLD)
    text(draw, (128, 846), "buildSchedule()", 30, MINT, True, mono=True)
    text(draw, (128, 912), "runtime 只消费事件", 28, INK, True)
    text(draw, (128, 970), "不再临时调用 Math.random()", 22, MUTED)
    save(image, "cover.jpg")


def stream_row(draw, y, labels, accent, title):
    text(draw, (92, y - 42), title, 25, accent, True)
    for index, label in enumerate(labels):
        x = 92 + index * 132
        panel(draw, (x, y, x + 105, y + 66), fill=SURFACE_2, outline=accent, width=2)
        text(draw, (x + 52, y + 33), label, 20, INK, True, mono=label.isascii(), anchor="mm")
        if index < len(labels) - 1:
            arrow(draw, (x + 109, y + 33), (x + 126, y + 33), fill=MUTED, width=3)


def create_seed_vs_schedule():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    text(draw, (66, 46), "相同 Seed，不代表相同业务事件", 54, INK, True)
    text(draw, (70, 118), "随机数流一致；只要消费顺序分叉，数值与业务含义的映射就会改变", 25, MUTED)

    panel(draw, (66, 186, 980, 822), fill=SURFACE, outline=(75, 96, 92))
    text(draw, (94, 215), "即时消费：调用顺序属于隐藏输入", 30, CORAL, True)
    stream_row(draw, 320, ["0.17", "0.82", "0.43", "0.61", "0.09"], GOLD, "同一条 PRNG 数值流")
    stream_row(draw, 470, ["水果", "铁胆", "水果", "轨迹", "掉落"], CORAL, "60 Hz 消费顺序")
    stream_row(draw, 620, ["水果", "轨迹", "铁胆", "水果", "掉落"], BLUE, "触屏分支后的消费顺序")
    text(draw, (96, 748), "结果：数值没有变，但事件类型、时间和轨迹已经不同", 24, CORAL, True)

    panel(draw, (1020, 186, 1534, 822), fill=SURFACE_2, outline=MINT, width=3)
    text(draw, (1052, 215), "预编译计划", 31, MINT, True)
    events = [
        ("id 017", "1.42 s", "apple", GOLD),
        ("id 018", "1.87 s", "bomb", CORAL),
        ("id 019", "2.11 s", "pear", MINT),
        ("id 020", "2.64 s", "plum", VIOLET),
    ]
    for index, (event_id, at, kind, accent) in enumerate(events):
        y = 300 + index * 108
        panel(draw, (1052, y, 1500, y + 78), fill=BG, outline=accent, width=2)
        text(draw, (1076, y + 16), event_id, 18, accent, True, mono=True)
        text(draw, (1190, y + 16), at, 18, MUTED, mono=True)
        text(draw, (1370, y + 16), kind, 18, INK, True, mono=True)
        text(draw, (1076, y + 48), "stable payload", 15, MUTED, mono=True)
    text(draw, (1052, 748), "帧率只影响何时读取", 22, INK, True)
    text(draw, (1052, 782), "不再影响读取什么", 22, MINT, True)
    save(image, "seed-vs-schedule.jpg")


def create_compile_pipeline():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    text(draw, (66, 46), "把随机过程前移到内容编译阶段", 54, INK, True)
    text(draw, (70, 118), "构建阶段允许随机，运行阶段只按游标消费带稳定 ID 的只读事件", 25, MUTED)

    nodes = [
        ("业务配置", "订单 / 时长 / 风险", BLUE),
        ("局部 PRNG", "seed + 算法版本", GOLD),
        ("buildSchedule", "生成 / 排序 / 编号", MINT),
        ("事件计划", "time + type + payload", CORAL),
    ]
    for index, (title, detail, accent) in enumerate(nodes):
        x = 66 + index * 382
        panel(draw, (x, 205, x + 322, 378), fill=SURFACE, outline=accent, width=3)
        text(draw, (x + 24, 230), f"0{index + 1}", 22, accent, True)
        text(draw, (x + 24, 280), title, 31, INK, True)
        text(draw, (x + 24, 334), detail, 18, MUTED, mono=detail.isascii())
        if index < 3:
            arrow(draw, (x + 327, 290), (x + 368, 290), fill=MUTED)

    screenshot = fit_image(SCREENSHOT, (710, 390), centering=(0.5, 0.04))
    image.paste(screenshot, (66, 438))
    draw.rectangle((66, 438, 80, 828), fill=CORAL)
    panel(draw, (824, 438, 1534, 828), fill=SURFACE_2, outline=(75, 98, 93))
    text(draw, (854, 470), "运行时唯一职责", 28, MINT, True)
    code = [
        "while (cursor < schedule.length",
        "    && schedule[cursor].time <= elapsed) {",
        "  spawn(schedule[cursor]);",
        "  cursor += 1;",
        "}",
    ]
    for index, line in enumerate(code):
        text(draw, (858, 528 + index * 42), line, 21, INK if index not in (2, 3) else GOLD, mono=True)
    text(draw, (854, 758), "- 不读取全局 Math.random", 20, MINT, True)
    text(draw, (1172, 758), "- 计划可签名、可审计", 20, BLUE, True)
    save(image, "compile-pipeline.jpg")


def create_validation_results():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    text(draw, (66, 46), "计划、规则与浏览器入口必须分别验证", 54, INK, True)
    text(draw, (70, 118), "同一批真实数据支撑内容规模、可完成性和双端交互证据", 25, MUTED)

    cards = [
        (str(METRICS["missions"]), "事件计划", MINT),
        (str(METRICS["events"]), "固定事件", GOLD),
        (str(METRICS["fruitEvents"]), "业务事件", BLUE),
        (str(METRICS["bombEvents"]), "风险事件", CORAL),
        (str(METRICS["bossLayers"]), "分层目标", VIOLET),
        (str(METRICS["orderItems"]), "订单目标", MINT),
    ]
    for index, (value, label, accent) in enumerate(cards):
        x = 66 + (index % 3) * 508
        y = 200 + (index // 3) * 176
        panel(draw, (x, y, x + 468, y + 142), fill=SURFACE, outline=accent, width=3)
        text(draw, (x + 24, y + 18), value, 49, accent, True)
        text(draw, (x + 205, y + 42), label, 23, INK, True)
        text(draw, (x + 24, y + 101), "source: validateContent()", 16, MUTED, mono=True)

    layers = [
        ("01", "计划验证", "数量 / 唯一签名 / 字段边界", GOLD),
        ("02", "参考消费者", f"{METRICS['referenceWins']} / {METRICS['missions']} 完成正式目标", MINT),
        ("03", "真实浏览器", "划切 / 触屏 / 档案 / Canvas", BLUE),
    ]
    for index, (number, title, detail, accent) in enumerate(layers):
        x = 66 + index * 508
        panel(draw, (x, 570, x + 468, 720), fill=SURFACE_2, outline=accent, width=3)
        text(draw, (x + 22, 590), number, 20, accent, True)
        text(draw, (x + 80, 586), title, 28, INK, True)
        text(draw, (x + 22, 650), detail, 18, MUTED)

    panel(draw, (66, 762, 1534, 838), fill=(15, 24, 25), outline=(72, 94, 90))
    text(draw, (94, 784), f"全仓 {METRICS['auditedPages']} 页面组合", 20, INK, True)
    checks = [
        ("加载", METRICS["loadFailures"]),
        ("JS", METRICS["javascriptErrors"]),
        ("控制台", METRICS["consoleErrors"]),
        ("溢出", METRICS["horizontalOverflows"]),
    ]
    for index, (label, value) in enumerate(checks):
        x = 470 + index * 245
        text(draw, (x, 784), f"{label} {value}", 20, MINT, True)
    save(image, "validation-results.jpg")


def main():
    if not SCREENSHOT.exists():
        raise SystemExit(f"Missing screenshot: {SCREENSHOT}")
    create_cover()
    create_seed_vs_schedule()
    create_compile_pipeline()
    create_validation_results()


if __name__ == "__main__":
    main()
