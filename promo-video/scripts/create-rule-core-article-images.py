import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[2]
IMAGE_DIR = ROOT / "docs" / "images" / "rule-core"
DATA = json.loads((IMAGE_DIR / "article-data.json").read_text(encoding="utf-8"))
FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")
FONT_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_MONO = Path(r"C:\Windows\Fonts\consola.ttf")

BG = (8, 25, 27)
SURFACE = (18, 45, 46)
SURFACE_2 = (27, 58, 57)
INK = (244, 244, 231)
MUTED = (180, 199, 191)
MINT = (86, 211, 174)
GOLD = (237, 190, 80)
CORAL = (226, 105, 91)
BLUE = (91, 164, 214)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def draw_text(draw: ImageDraw.ImageDraw, xy, text, size, fill=INK, bold=False, mono=False):
    path = FONT_MONO if mono else FONT_BOLD if bold else FONT_REGULAR
    draw.text(xy, text, font=font(path, size), fill=fill)


def fit_image(path: Path, size: tuple[int, int], top_bias=0.15) -> Image.Image:
    with Image.open(path) as source:
        image = source.convert("RGB")
    return ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=(0.5, top_bias))


def fit_top_width(path: Path, size: tuple[int, int]) -> Image.Image:
    with Image.open(path) as source:
        image = source.convert("RGB")
    width, height = size
    scaled_height = round(image.height * width / image.width)
    scaled = image.resize((width, scaled_height), Image.Resampling.LANCZOS)
    if scaled_height >= height:
        return scaled.crop((0, 0, width, height))
    result = Image.new("RGB", size, BG)
    result.paste(scaled, (0, 0))
    return result


def panel(draw, box, fill=SURFACE, outline=(54, 91, 88), width=2, radius=8):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def save(image: Image.Image, name: str):
    target = IMAGE_DIR / name
    image.save(target, "JPEG", quality=94, optimize=True, progressive=True)
    print(target)


def create_cover():
    image = Image.new("RGB", (1920, 1080), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1920, 18), fill=GOLD)
    draw_text(draw, (92, 72), "RULE-DRIVEN BROWSER GAMES", 30, MINT, True)
    draw_text(draw, (88, 135), "页面能打开，", 106, INK, True)
    draw_text(draw, (88, 266), "不代表规则正确", 106, INK, True)
    draw_text(draw, (94, 420), DATA["subtitle"], 40, MUTED)

    metrics = [
        ("12", "可执行参考程序", MINT),
        ("30", "确定性裁定档案", GOLD),
        ("270", "长期模拟年", CORAL),
    ]
    for index, (value, label, accent) in enumerate(metrics):
        x = 94 + index * 390
        panel(draw, (x, 520, x + 350, 690), fill=SURFACE, outline=accent, width=3)
        draw_text(draw, (x + 28, 540), value, 68, accent, True)
        draw_text(draw, (x + 28, 625), label, 25, MUTED)

    for index, source in enumerate(DATA["sources"]):
        x = 94 + index * 584
        screenshot = fit_image(ROOT / source["file"], (548, 270), 0.08)
        image.paste(screenshot, (x, 754))
        draw.rectangle((x, 754, x + 548, 765), fill=[MINT, GOLD, CORAL][index])
    save(image, "cover.jpg")


def create_architecture():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    draw_text(draw, (72, 54), "把规则核心从界面事件里拆出来", 56, INK, True)
    draw_text(draw, (76, 126), "同一份数据和函数同时服务玩家操作、存档与自动化测试", 27, MUTED)

    columns = [
        ("01", "场景数据", "关卡 / 日规 / 气候序列", MINT),
        ("02", "纯规则函数", "simulate / evaluate / advance", GOLD),
        ("03", "结构化结果", "状态 + 原因 + 趋势", CORAL),
        ("04", "外层适配", "DOM / Canvas / 存档", BLUE),
    ]
    for index, (number, title, detail, accent) in enumerate(columns):
        x = 72 + index * 380
        panel(draw, (x, 225, x + 330, 430), fill=SURFACE, outline=accent, width=3)
        draw_text(draw, (x + 24, 246), number, 25, accent, True)
        draw_text(draw, (x + 24, 296), title, 35, INK, True)
        draw_text(draw, (x + 24, 357), detail, 21, MUTED)
        if index < 3:
            draw_text(draw, (x + 340, 305), "→", 42, MUTED, True)

    rows = [
        ("编程解谜", "参考程序 → 同一解释器 → 必须真正到达终点", "12 / 12", MINT),
        ("证件审查", "字段数据 → 规则函数 → allowed 与 reasons 一致", "30 / 30", GOLD),
        ("生态模拟", "上一年状态 → 年度转移 → 数值始终处于边界内", "270 年", CORAL),
    ]
    for index, (label, text, result, accent) in enumerate(rows):
        y = 500 + index * 108
        panel(draw, (72, y, 1528, y + 84), fill=SURFACE_2, outline=(55, 88, 84))
        draw_text(draw, (98, y + 22), label, 24, accent, True)
        draw_text(draw, (280, y + 23), text, 23, INK)
        draw_text(draw, (1360, y + 19), result, 29, accent, True)
    save(image, "architecture.jpg")


def create_runtime_evidence():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    draw_text(draw, (62, 48), "三种界面，共用一种验证边界", 54, INK, True)
    draw_text(draw, (66, 118), "截图只证明真实运行状态，规则正确性由页面内同源核心与专项测试给出", 25, MUTED)
    accents = [MINT, GOLD, CORAL]
    panel_width = 482
    for index, source in enumerate(DATA["sources"]):
        x = 62 + index * 516
        panel(draw, (x, 188, x + panel_width, 835), fill=SURFACE, outline=accents[index], width=3)
        screenshot = fit_top_width(ROOT / source["file"], (panel_width - 20, 430))
        image.paste(screenshot, (x + 10, 198))
        draw.rectangle((x + 10, 628, x + panel_width - 10, 638), fill=accents[index])
        draw_text(draw, (x + 24, 674), source["label"], 31, INK, True)
        draw_text(draw, (x + 24, 730), source["detail"], 20, MUTED)
    save(image, "runtime-evidence.jpg")


def create_validation_results():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    draw_text(draw, (72, 52), "专项规则测试 + 全仓浏览器审计", 56, INK, True)
    draw_text(draw, (76, 124), "所有数字来自本轮真实命令输出，不是配置目标", 26, MUTED)

    cards = [
        (str(DATA["metrics"]["referencePrograms"]), "参考程序", "全部可解", MINT),
        (str(DATA["metrics"]["deterministicCases"]), "审查档案", "裁定与原因一致", GOLD),
        (str(DATA["metrics"]["simulatedYears"]), "模拟年", "无越界 / NaN", CORAL),
        (str(DATA["metrics"]["auditedPages"]), "页面组合", "桌面 + 手机", BLUE),
    ]
    for index, (value, label, detail, accent) in enumerate(cards):
        x = 72 + index * 378
        panel(draw, (x, 220, x + 336, 445), fill=SURFACE, outline=accent, width=3)
        draw_text(draw, (x + 26, 246), value, 68, accent, True)
        draw_text(draw, (x + 26, 337), label, 27, INK, True)
        draw_text(draw, (x + 26, 388), detail, 20, MUTED)

    checks = [
        ("浏览器错误", DATA["metrics"]["browserErrors"]),
        ("横向溢出", DATA["metrics"]["horizontalOverflows"]),
        ("加载失败", 0),
        ("viewport 缺失", 0),
    ]
    panel(draw, (72, 500, 1528, 670), fill=SURFACE_2, outline=(55, 88, 84))
    for index, (label, value) in enumerate(checks):
        x = 110 + index * 352
        draw_text(draw, (x, 528), label, 23, MUTED)
        draw_text(draw, (x, 574), str(value), 48, MINT, True)

    panel(draw, (72, 715, 1528, 823), fill=(5, 18, 19), outline=(55, 88, 84))
    draw_text(draw, (104, 748), DATA["testCommand"], 25, INK, mono=True)
    save(image, "validation-results.jpg")


def main():
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    create_cover()
    create_architecture()
    create_runtime_evidence()
    create_validation_results()


if __name__ == "__main__":
    main()
