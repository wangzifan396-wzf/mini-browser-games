import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
IMAGE_DIR = ROOT / "docs" / "images" / "offline-archive"
DATA = json.loads((IMAGE_DIR / "article-data.json").read_text(encoding="utf-8"))

FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")
FONT_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_MONO = Path(r"C:\Windows\Fonts\consola.ttf")

BG = (6, 18, 28)
SURFACE = (13, 37, 52)
SURFACE_2 = (20, 49, 65)
INK = (240, 248, 250)
MUTED = (164, 190, 199)
CYAN = (83, 210, 222)
GREEN = (92, 211, 145)
GOLD = (240, 187, 83)
CORAL = (235, 105, 101)
VIOLET = (172, 132, 232)
LINE = (53, 92, 108)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def text(draw, xy, value, size, fill=INK, bold=False, mono=False, anchor=None):
    path = FONT_MONO if mono else FONT_BOLD if bold else FONT_REGULAR
    draw.text(xy, value, font=font(path, size), fill=fill, anchor=anchor)


def panel(draw, box, fill=SURFACE, outline=LINE, width=2, radius=14):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def save(image, name):
    target = IMAGE_DIR / name
    image.save(target, "JPEG", quality=95, optimize=True, progressive=True)
    print(target)


def shield(draw, center, color=GREEN, scale=1.0):
    x, y = center
    points = [
        (x, y - 54 * scale),
        (x + 48 * scale, y - 34 * scale),
        (x + 40 * scale, y + 28 * scale),
        (x, y + 64 * scale),
        (x - 40 * scale, y + 28 * scale),
        (x - 48 * scale, y - 34 * scale),
    ]
    draw.polygon(points, fill=color)
    draw.line((x - 22 * scale, y + 2 * scale, x - 6 * scale, y + 20 * scale,
               x + 27 * scale, y - 18 * scale), fill=BG, width=max(3, int(8 * scale)), joint="curve")


def create_cover():
    image = Image.new("RGB", (1920, 1080), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1920, 18), fill=CYAN)
    draw.ellipse((1370, -240, 2070, 460), fill=(12, 53, 68))
    draw.ellipse((-250, 760, 430, 1440), fill=(25, 42, 65))

    text(draw, (88, 70), "OFFLINE DATA PORTABILITY", 30, CYAN, True)
    text(draw, (84, 137), "不上后端，也能", 104, INK, True)
    text(draw, (84, 264), "跨设备搬数据", 104, INK, True)
    text(draw, (91, 408), "版本 × 校验 × 迁移 × 安全边界", 38, MUTED)

    panel(draw, (88, 500, 1265, 604), fill=(7, 27, 39), outline=CYAN, width=3)
    segments = [
        ("WAPP", CYAN), (".", MUTED), ("1", GOLD), (".", MUTED),
        ("<base64url>", VIOLET), (".", MUTED), ("<checksum>", GREEN)
    ]
    x = 122
    for value, color in segments:
        text(draw, (x, 529), value, 36, color, True, mono=True)
        x += draw.textlength(value, font=font(FONT_MONO, 36)) + 5

    cards = [
        (str(DATA["metrics"]["roundTrips"]), "Unicode 往返", CYAN),
        (str(DATA["metrics"]["corruptionsRejected"]), "损坏拦截", CORAL),
        ("v0→v1", "旧版迁移", GOLD),
        (str(DATA["metrics"]["sanitizationAssertions"]), "字段清洗断言", GREEN),
    ]
    for index, (value, label, accent) in enumerate(cards):
        x = 88 + index * 300
        panel(draw, (x, 670, x + 274, 842), fill=SURFACE, outline=accent, width=3)
        text(draw, (x + 24, 699), value, 53, accent, True)
        text(draw, (x + 24, 777), label, 22, MUTED)

    # Two devices connected by a portable code bridge.
    panel(draw, (1370, 520, 1735, 760), fill=SURFACE_2, outline=LINE, width=3, radius=22)
    draw.rectangle((1412, 568, 1693, 714), fill=(6, 23, 34), outline=CYAN, width=3)
    panel(draw, (1460, 810, 1840, 1000), fill=SURFACE_2, outline=LINE, width=3, radius=22)
    draw.rectangle((1502, 850, 1798, 960), fill=(6, 23, 34), outline=GREEN, width=3)
    draw.line((1552, 760, 1688, 810), fill=GOLD, width=8)
    draw.polygon([(1688, 810), (1658, 782), (1651, 815)], fill=GOLD)
    shield(draw, (1780, 610), GREEN, .8)
    text(draw, (1350, 1017), "用户主动复制 · 不需要账号 · 不等于云同步", 22, MUTED)
    save(image, "cover.jpg")


def create_protocol_anatomy():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    text(draw, (66, 48), "离线档案码的四段协议结构", 56, INK, True)
    text(draw, (70, 119), "每一段只负责一件事；协议边界比 Base64 技巧更重要", 25, MUTED)

    boxes = [
        (60, 220, 300, 390, "WAPP", "应用前缀", "拒绝误导入", CYAN),
        (322, 220, 502, 390, "1", "协议版本", "选择迁移器", GOLD),
        (524, 220, 1112, 390, "eyJ0aGVtZSI6...", "UTF-8 Base64url 载荷", "只含白名单状态", VIOLET),
        (1134, 220, 1538, 390, "d9eaf825", "损坏校验", "不提供真实性", GREEN),
    ]
    for left, top, right, bottom, value, label, detail, accent in boxes:
        panel(draw, (left, top, right, bottom), fill=SURFACE, outline=accent, width=3)
        text(draw, ((left + right) / 2, top + 47), value, 32 if right-left > 250 else 38,
             accent, True, mono=True, anchor="mm")
        text(draw, ((left + right) / 2, top + 105), label, 23, INK, True, anchor="mm")
        text(draw, ((left + right) / 2, top + 141), detail, 17, MUTED, anchor="mm")
    for x in [310, 512, 1122]:
        text(draw, (x, 292), ".", 44, MUTED, True, mono=True, anchor="mm")

    text(draw, (70, 456), "示例状态经过白名单归一化后再编码", 27, CYAN, True)
    rows = [
        ("输入字段", "theme · fontScale · panels · note · token", CORAL),
        ("协议字段", "theme · fontScale · panels · note", GREEN),
        ("体积结果", f'{DATA["metrics"]["jsonBytes"]} 字节 JSON  →  {DATA["metrics"]["archiveCharacters"]} 字符档案码', GOLD),
    ]
    for index, (label, value, accent) in enumerate(rows):
        y = 510 + index * 94
        panel(draw, (66, y, 1534, y + 72), fill=SURFACE_2, outline=LINE)
        text(draw, (92, y + 21), label, 22, accent, True)
        text(draw, (275, y + 20), value, 23, INK)
    text(draw, (70, 814), "边界：checksum 发现意外损坏；Base64url 只负责文本编码；两者都不是加密或签名。", 22, MUTED)
    save(image, "protocol-anatomy.jpg")


def create_import_validation():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    text(draw, (66, 46), "导入不是反向解码，而是一条不信任管线", 54, INK, True)
    text(draw, (70, 116), "按成本从低到高逐层拒绝，最后只让归一化后的白名单状态进入应用", 24, MUTED)

    stages = [
        ("01", "长度上限", "≤ 12,000", CORAL),
        ("02", "段数", "必须四段", CORAL),
        ("03", "应用前缀", "WAPP", GOLD),
        ("04", "版本白名单", "v0 / v1", GOLD),
        ("05", "校验匹配", "先于解析", CYAN),
        ("06", "UTF-8 + JSON", "严格解码", CYAN),
        ("07", "版本迁移", "旧 → 当前", VIOLET),
        ("08", "字段归一化", "可信状态", GREEN),
    ]
    for index, (number, title, detail, accent) in enumerate(stages):
        row, column = divmod(index, 4)
        x = 64 + column * 384
        y = 220 + row * 238
        panel(draw, (x, y, x + 330, y + 166), fill=SURFACE, outline=accent, width=3)
        text(draw, (x + 24, y + 20), number, 21, accent, True)
        text(draw, (x + 24, y + 65), title, 28, INK, True)
        text(draw, (x + 24, y + 112), detail, 20, MUTED)
        if column < 3:
            text(draw, (x + 348, y + 70), "→", 35, LINE, True, anchor="mm")
        elif row == 0:
            draw.line((x + 165, y + 176, x + 165, y + 218), fill=LINE, width=4)
            draw.polygon([(x + 165, y + 223), (x + 153, y + 203), (x + 177, y + 203)], fill=LINE)

    panel(draw, (64, 720, 1536, 823), fill=(7, 25, 36), outline=LINE)
    text(draw, (92, 746), "外部字符串", 23, CORAL, True)
    text(draw, (280, 746), "→", 29, MUTED, True)
    text(draw, (346, 746), "格式与损坏检查", 23, GOLD, True)
    text(draw, (604, 746), "→", 29, MUTED, True)
    text(draw, (670, 746), "还原与迁移", 23, VIOLET, True)
    text(draw, (866, 746), "→", 29, MUTED, True)
    text(draw, (932, 746), "白名单状态", 23, GREEN, True)
    shield(draw, (1384, 767), GREEN, .55)
    save(image, "import-validation.jpg")


def create_test_matrix():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    text(draw, (66, 48), "固定种子自动化测试矩阵", 56, INK, True)
    text(draw, (70, 120), f'{DATA["environment"]["os"]} · Node.js {DATA["environment"]["node"]} · seed {DATA["seed"]}', 24, MUTED)

    cards = [
        (str(DATA["metrics"]["roundTrips"]), "Unicode 往返", "1000 / 1000", CYAN),
        (str(DATA["metrics"]["corruptionsRejected"]), "单字符损坏拦截", "1000 / 1000", CORAL),
        (str(DATA["metrics"]["legacyMigrations"]), "旧版迁移", "v0 → v1", GOLD),
        (str(DATA["metrics"]["sanitizationAssertions"]), "字段清洗断言", "5 / 5", GREEN),
    ]
    for index, (value, label, result, accent) in enumerate(cards):
        x = 64 + index * 384
        panel(draw, (x, 214, x + 330, 433), fill=SURFACE, outline=accent, width=3)
        text(draw, (x + 24, 238), value, 64, accent, True)
        text(draw, (x + 24, 326), label, 23, INK, True)
        text(draw, (x + 24, 374), result, 19, MUTED)

    panel(draw, (64, 482, 1536, 570), fill=(5, 25, 35), outline=CYAN, width=2)
    text(draw, (92, 510), DATA["testCommand"], 25, INK, mono=True)

    text(draw, (68, 622), "测试结果不等于安全能力", 27, CORAL, True)
    boundaries = [
        ("意外复制损坏", "可发现", GREEN),
        ("主动篡改并重算校验", "不可阻止", CORAL),
        ("隐藏档案内容", "不提供", CORAL),
        ("多端冲突与自动同步", "不处理", GOLD),
    ]
    for index, (label, result, accent) in enumerate(boundaries):
        x = 64 + index * 384
        panel(draw, (x, 678, x + 330, 811), fill=SURFACE_2, outline=LINE)
        text(draw, (x + 22, 704), label, 19, MUTED)
        text(draw, (x + 22, 754), result, 27, accent, True)
    save(image, "test-matrix.jpg")


def main():
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    create_cover()
    create_protocol_anatomy()
    create_import_validation()
    create_test_matrix()


if __name__ == "__main__":
    main()
