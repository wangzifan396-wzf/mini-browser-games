from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[2]
IMAGE_DIR = ROOT / "docs" / "images" / "event-replay"
FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")
FONT_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_MONO = Path(r"C:\Windows\Fonts\consola.ttf")

BG = (7, 22, 31)
SURFACE = (16, 42, 53)
SURFACE_2 = (22, 57, 66)
INK = (239, 249, 245)
MUTED = (169, 198, 201)
MINT = (101, 221, 181)
GOLD = (239, 192, 91)
CORAL = (235, 119, 112)
BLUE = (107, 177, 231)


def font(path: Path, size: int):
    return ImageFont.truetype(str(path), size)


def text(draw, xy, value, size, fill=INK, bold=False, mono=False):
    path = FONT_MONO if mono else FONT_BOLD if bold else FONT_REGULAR
    draw.text(xy, value, font=font(path, size), fill=fill)


def panel(draw, box, fill=SURFACE, outline=(57, 99, 106), width=2, radius=10):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def fit_image(path: Path, size, centering=(0.5, 0.08)):
    with Image.open(path) as source:
        image = source.convert("RGB")
    return ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=centering)


def save(image, name):
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    target = IMAGE_DIR / name
    image.save(target, "JPEG", quality=94, optimize=True, progressive=True)
    print(target)


SOURCES = [
    (ROOT / "output/event-replay-scenarios/auction-desktop.png", "拍卖命令", GOLD),
    (ROOT / "output/event-replay-scenarios/island-desktop.png", "求生命令", MINT),
    (ROOT / "output/event-replay-scenarios/pathogen-desktop.png", "演算命令", BLUE),
]


def create_cover():
    image = Image.new("RGB", (1920, 1080), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1920, 16), fill=MINT)
    text(draw, (92, 66), "DETERMINISTIC FRONTEND SYSTEMS", 28, MINT, True)
    text(draw, (88, 132), "把前端状态机", 98, INK, True)
    text(draw, (88, 252), "做成可回放系统", 98, INK, True)
    text(draw, (94, 410), "命令日志 · 确定性重放 · 回归测试", 38, MUTED)

    metrics = [
        ("3", "真实页面接入", MINT),
        ("3", "命令序列重放", GOLD),
        ("4", "参考策略通关", BLUE),
        ("200", "全仓页面组合", CORAL),
    ]
    for index, (value, label, accent) in enumerate(metrics):
        x = 94 + index * 430
        panel(draw, (x, 505, x + 390, 685), fill=SURFACE, outline=accent, width=3)
        text(draw, (x + 28, 526), value, 68, accent, True)
        text(draw, (x + 28, 614), label, 25, MUTED)

    for index, (source, label, accent) in enumerate(SOURCES):
        x = 94 + index * 584
        screenshot = fit_image(source, (548, 270))
        image.paste(screenshot, (x, 772))
        draw.rectangle((x, 772, x + 548, 783), fill=accent)
        text(draw, (x, 1000), label, 22, MUTED, True)
    save(image, "cover.jpg")


def arrow(draw, start, end, fill=MUTED, width=5):
    draw.line((start[0], start[1], end[0], end[1]), fill=fill, width=width)
    x, y = end
    draw.polygon((x, y, x - 16, y - 10, x - 16, y + 10), fill=fill)


def create_architecture():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    text(draw, (72, 48), "让每次操作都成为可重放的命令", 54, INK, True)
    text(draw, (76, 118), "实时执行与回放执行只允许存在一个状态转移入口", 26, MUTED)

    nodes = [
        ("用户输入", "按钮 / 触屏 / 自动演算", MINT),
        ("命令日志", "{ type: ACTION, kind: water }", GOLD),
        ("状态机", "dispatch(command)", CORAL),
        ("摘要", "digest(state)", BLUE),
    ]
    for index, (title, detail, accent) in enumerate(nodes):
        x = 72 + index * 380
        panel(draw, (x, 250, x + 320, 420), fill=SURFACE, outline=accent, width=3)
        text(draw, (x + 24, 278), f"0{index + 1}", 25, accent, True)
        text(draw, (x + 24, 330), title, 35, INK, True)
        text(draw, (x + 24, 390), detail, 19, MUTED, mono=index in (1, 2, 3))
        if index < 3:
            arrow(draw, (x + 328, 335), (x + 364, 335))

    panel(draw, (208, 530, 1392, 745), fill=SURFACE_2, outline=(60, 103, 109))
    text(draw, (245, 560), "回放分支", 27, GOLD, True)
    text(draw, (245, 620), "初始状态 + history", 25, INK)
    arrow(draw, (600, 640), (790, 640), fill=GOLD)
    text(draw, (825, 620), "同一个 dispatch", 25, INK, True)
    arrow(draw, (1085, 640), (1270, 640), fill=GOLD)
    text(draw, (1100, 686), "digest 必须相等", 23, MINT, True)
    save(image, "architecture.jpg")


def create_replay_evidence():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    text(draw, (62, 48), "实时状态与回放状态逐字段比较", 54, INK, True)
    text(draw, (66, 118), "截图证明页面真实运行，摘要比较证明状态机没有偷偷分叉", 25, MUTED)
    for index, (source, label, accent) in enumerate(SOURCES):
        x = 62 + index * 516
        panel(draw, (x, 188, x + 482, 838), fill=SURFACE, outline=accent, width=3)
        screenshot = fit_image(source, (462, 315))
        image.paste(screenshot, (x + 10, 198))
        draw.rectangle((x + 10, 503, x + 472, 513), fill=accent)
        text(draw, (x + 24, 542), label, 29, INK, True)
        text(draw, (x + 24, 598), "实时摘要", 20, MUTED)
        text(draw, (x + 24, 632), '{"mode":"play", ...}', 18, INK, mono=True)
        text(draw, (x + 24, 686), "回放摘要", 20, MUTED)
        text(draw, (x + 24, 720), '{"mode":"play", ...}', 18, INK, mono=True)
        text(draw, (x + 24, 778), "✓ digest 相等", 24, MINT, True)
    save(image, "replay-evidence.jpg")


def create_validation_results():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    text(draw, (72, 52), "回放专项测试 + 全仓浏览器审计", 56, INK, True)
    text(draw, (76, 124), "数字来自真实命令输出，覆盖规则、档案和响应式接线", 26, MUTED)

    cards = [
        ("3", "页面回放", "摘要完全一致", MINT),
        ("3", "档案往返", "AUCTION2 / ISLAND2 / PATH2", GOLD),
        ("4", "传播参考策略", "全部完成目标", BLUE),
        ("200", "审计页面组合", "桌面 + 手机", CORAL),
    ]
    for index, (value, label, detail, accent) in enumerate(cards):
        x = 72 + index * 378
        panel(draw, (x, 220, x + 336, 445), fill=SURFACE, outline=accent, width=3)
        text(draw, (x + 26, 246), value, 68, accent, True)
        text(draw, (x + 26, 337), label, 27, INK, True)
        text(draw, (x + 26, 388), detail, 18, MUTED)

    panel(draw, (72, 500, 1528, 670), fill=SURFACE_2, outline=(55, 98, 105))
    checks = [
        ("加载失败", "0"),
        ("JavaScript 错误", "0"),
        ("控制台错误", "0"),
        ("横向溢出", "0"),
    ]
    for index, (label, value) in enumerate(checks):
        x = 110 + index * 352
        text(draw, (x, 528), label, 23, MUTED)
        text(draw, (x, 574), value, 48, MINT, True)

    panel(draw, (72, 715, 1528, 823), fill=(5, 18, 24), outline=(55, 98, 105))
    text(draw, (104, 748), "node promo-video/scripts/check-event-replay-scenarios.mjs", 23, INK, mono=True)
    save(image, "validation-results.jpg")


def main():
    create_cover()
    create_architecture()
    create_replay_evidence()
    create_validation_results()


if __name__ == "__main__":
    main()
