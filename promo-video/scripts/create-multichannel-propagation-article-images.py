import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
IMAGE_DIR = ROOT / "docs" / "images" / "multichannel-propagation"
DATA = json.loads((IMAGE_DIR / "article-data.json").read_text(encoding="utf-8"))
METRICS = DATA["metrics"]

FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")
FONT_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_MONO = Path(r"C:\Windows\Fonts\consola.ttf")

BG = (18, 28, 29)
SURFACE = (31, 45, 45)
SURFACE_2 = (41, 57, 56)
INK = (246, 244, 236)
MUTED = (181, 193, 187)
GREEN = (91, 199, 155)
GOLD = (233, 183, 76)
RED = (224, 98, 102)
BLUE = (91, 149, 216)
CYAN = (80, 188, 192)
VIOLET = (170, 126, 190)


def font(path: Path, size: int):
    return ImageFont.truetype(str(path), size)


def text(draw, xy, value, size, fill=INK, bold=False, mono=False, anchor=None):
    path = FONT_MONO if mono else FONT_BOLD if bold else FONT_REGULAR
    draw.text(xy, value, font=font(path, size), fill=fill, anchor=anchor)


def panel(draw, box, fill=SURFACE, outline=(70, 91, 87), width=2, radius=10):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def arrow(draw, start, end, fill=MUTED, width=5):
    draw.line((start[0], start[1], end[0], end[1]), fill=fill, width=width)
    x, y = end
    draw.polygon((x, y, x - 17, y - 10, x - 17, y + 10), fill=fill)


def save(image, name):
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    target = IMAGE_DIR / name
    image.save(target, "JPEG", quality=94, optimize=True, progressive=True)
    print(target)


def mask_bits(draw, x, y, bits, size=52):
    colors = (RED, GREEN, BLUE)
    labels = ("R", "G", "B")
    for index in range(3):
        active = bits & (1 << index)
        fill = colors[index] if active else (59, 70, 68)
        draw.ellipse((x + index * (size + 12), y, x + index * (size + 12) + size, y + size), fill=fill)
        text(draw, (x + index * (size + 12) + size / 2, y + size / 2), labels[index], 20, BG if active else MUTED, True, anchor="mm")


def create_cover():
    image = Image.new("RGB", (1920, 1080), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1920, 16), fill=GREEN)
    text(draw, (90, 66), "MULTI-CHANNEL PROPAGATION", 29, GREEN, True)
    text(draw, (86, 136), "别再用 Boolean", 94, INK, True)
    text(draw, (86, 250), "表示传播状态", 94, INK, True)
    text(draw, (92, 392), "位掩码 · 工作队列 · 状态去重 · 循环终止", 35, MUTED)

    cards = [
        ("0b111", "组合通道", GOLD),
        ("QUEUE", "统一分叉", GREEN),
        ("2016", "状态上界", BLUE),
    ]
    for index, (value, label, accent) in enumerate(cards):
        x = 92 + index * 430
        panel(draw, (x, 510, x + 388, 670), outline=accent, width=3)
        text(draw, (x + 24, 534), value, 48, accent, True, mono=value.isascii())
        text(draw, (x + 24, 610), label, 23, MUTED)

    panel(draw, (92, 742, 1828, 1010), fill=SURFACE_2, outline=(73, 96, 91))
    nodes = [
        (250, 875, "SOURCE", 0b111, GOLD),
        (710, 805, "FILTER", 0b010, GREEN),
        (710, 945, "SPLIT", 0b101, VIOLET),
        (1210, 875, "MERGE", 0b111, CYAN),
        (1660, 875, "TARGET", 0b111, BLUE),
    ]
    arrow(draw, (370, 875), (570, 815), GOLD)
    arrow(draw, (370, 875), (570, 935), GOLD)
    arrow(draw, (850, 815), (1080, 865), GREEN)
    arrow(draw, (850, 935), (1080, 885), VIOLET)
    arrow(draw, (1350, 875), (1500, 875), CYAN)
    for x, y, label, bits, accent in nodes:
        panel(draw, (x - 105, y - 55, x + 105, y + 55), fill=BG, outline=accent, width=3)
        text(draw, (x, y - 23), label, 19, accent, True, mono=True, anchor="mm")
        mask_bits(draw, x - 80, y + 2, bits, size=38)
    save(image, "cover.jpg")


def create_state_model():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    text(draw, (66, 44), "从布尔可达性到多通道传播状态", 52, INK, True)
    text(draw, (70, 114), "节点相同，不代表下一步行为相同；方向与通道都属于状态", 25, MUTED)

    panel(draw, (66, 185, 570, 820), outline=RED, width=3)
    text(draw, (96, 218), "过早去重", 31, RED, True)
    text(draw, (96, 272), "visited[node] = true", 25, INK, mono=True)
    for index, (label, bits, accent) in enumerate((("北向进入", 0b001, RED), ("西向进入", 0b100, BLUE), ("南向进入", 0b011, GOLD))):
        y = 355 + index * 125
        panel(draw, (98, y, 535, y + 92), fill=SURFACE_2, outline=accent)
        text(draw, (120, y + 14), label, 22, INK, True)
        mask_bits(draw, 330, y + 20, bits, size=42)
    text(draw, (98, 750), "错误：后到的合法状态会被丢弃", 21, RED, True)

    panel(draw, (614, 185, 1534, 820), outline=GREEN, width=3)
    text(draw, (646, 218), "最小充分状态", 31, GREEN, True)
    fields = [
        ("x, y", "当前位置", BLUE),
        ("dir", "进入方向", GOLD),
        ("mask", "携带通道", GREEN),
    ]
    for index, (name, detail, accent) in enumerate(fields):
        x = 648 + index * 278
        panel(draw, (x, 304, x + 238, 445), fill=SURFACE_2, outline=accent, width=3)
        text(draw, (x + 22, 326), name, 30, accent, True, mono=True)
        text(draw, (x + 22, 390), detail, 20, MUTED)
    panel(draw, (648, 500, 1498, 620), fill=(14, 23, 24), outline=(75, 97, 92))
    text(draw, (680, 525), "stateKey = `${x},${y},${dir},${mask}`", 25, INK, mono=True)
    text(draw, (680, 575), "未来行为不同 → 必须是不同状态", 22, GREEN, True)
    text(draw, (648, 698), "渲染颜色、调试文本、完整历史路径不进入访问键", 22, MUTED)
    text(draw, (648, 750), "状态键表达规则，不表达画面", 24, GOLD, True)
    save(image, "state-model.jpg")


def create_queue_pipeline():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    text(draw, (66, 44), "工作队列统一处理分叉、过滤与合流", 52, INK, True)
    text(draw, (70, 114), "每个器件只做一件事：把一个输入状态转换成零个、一个或多个输出状态", 24, MUTED)

    stages = [
        ("01", "出队", "完整状态", BLUE),
        ("02", "去重", "seen key", GOLD),
        ("03", "转换", "0..N 输出", GREEN),
        ("04", "入队", "继续传播", VIOLET),
    ]
    for index, (number, title, detail, accent) in enumerate(stages):
        x = 66 + index * 380
        panel(draw, (x, 190, x + 320, 345), outline=accent, width=3)
        text(draw, (x + 22, 210), number, 19, accent, True)
        text(draw, (x + 76, 205), title, 30, INK, True)
        text(draw, (x + 22, 280), detail, 20, MUTED, mono=detail.isascii())
        if index < 3:
            arrow(draw, (x + 325, 265), (x + 365, 265), MUTED)

    transforms = [
        ("PASS", "1 → 1", 0b111, 0b111, BLUE),
        ("FILTER", "1 → 1", 0b111, 0b010, GREEN),
        ("SPLIT", "1 → 2", 0b111, 0b111, VIOLET),
        ("MERGE", "N → 1", 0b001, 0b101, GOLD),
    ]
    for index, (name, arity, before, after, accent) in enumerate(transforms):
        x = 66 + index * 380
        panel(draw, (x, 410, x + 320, 765), fill=SURFACE_2, outline=accent, width=3)
        text(draw, (x + 22, 434), name, 25, accent, True, mono=True)
        text(draw, (x + 218, 438), arity, 18, MUTED, mono=True)
        text(draw, (x + 22, 500), "input", 16, MUTED, mono=True)
        mask_bits(draw, x + 22, 535, before, size=45)
        arrow(draw, (x + 105, 612), (x + 218, 612), accent, width=4)
        text(draw, (x + 22, 650), "output", 16, MUTED, mono=True)
        mask_bits(draw, x + 22, 685, after, size=45)
        if name == "SPLIT":
            text(draw, (x + 216, 680), "×2", 26, VIOLET, True)
        if name == "MERGE":
            text(draw, (x + 207, 532), "+ B", 23, BLUE, True, mono=True)

    panel(draw, (66, 800, 1534, 850), fill=(14, 23, 24), outline=(71, 92, 88))
    text(draw, (92, 815), "规则核心不关心 DOM / Canvas；视图只消费 reached 与轨迹记录", 20, GREEN, True)
    save(image, "queue-pipeline.jpg")


def create_termination_validation():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    text(draw, (66, 44), "有限状态上界，比 guard 更能解释终止", 52, INK, True)
    text(draw, (70, 114), "完整状态最多处理一次；保护计数只防御实现错误，不能替代正确建模", 24, MUTED)

    panel(draw, (66, 185, 775, 525), outline=GREEN, width=3)
    text(draw, (96, 215), "状态空间上界", 30, GREEN, True)
    text(draw, (96, 286), "W × H × D × (2^C - 1)", 35, INK, True, mono=True)
    boxes = [
        ("9×8", "位置", BLUE),
        ("4", "方向", GOLD),
        ("7", "非空通道集合", VIOLET),
    ]
    for index, (value, label, accent) in enumerate(boxes):
        x = 96 + index * 210
        panel(draw, (x, 355, x + 180, 470), fill=SURFACE_2, outline=accent)
        text(draw, (x + 18, 370), value, 34, accent, True, mono=True)
        text(draw, (x + 18, 428), label, 17, MUTED)
    text(draw, (610, 290), "= 2016", 38, GREEN, True, mono=True)

    panel(draw, (819, 185, 1534, 525), outline=GOLD, width=3)
    text(draw, (851, 215), "真实规则夹具", 30, GOLD, True)
    cards = [
        (str(METRICS["scenes"]), "固定场景", GREEN),
        (str(METRICS["targets"]), "复合目标", BLUE),
        (str(METRICS["referencePieces"]), "参考器件", VIOLET),
        (f'{METRICS["referenceWins"]}/12', "正式追踪通过", GOLD),
    ]
    for index, (value, label, accent) in enumerate(cards):
        x = 851 + (index % 2) * 320
        y = 285 + (index // 2) * 108
        panel(draw, (x, y, x + 285, y + 82), fill=SURFACE_2, outline=accent)
        text(draw, (x + 18, y + 12), value, 29, accent, True, mono=value.isascii())
        text(draw, (x + 105, y + 27), label, 17, MUTED)

    layers = [
        ("内容层", "坐标 / 唯一性 / 边界", BLUE),
        ("规则层", "参考方案 → 正式 trace()", GREEN),
        ("浏览器层", "鼠标 / 触屏 / Canvas", GOLD),
    ]
    for index, (title, detail, accent) in enumerate(layers):
        x = 66 + index * 508
        panel(draw, (x, 585, x + 468, 745), fill=SURFACE, outline=accent, width=3)
        text(draw, (x + 22, 608), f"0{index + 1}", 19, accent, True)
        text(draw, (x + 82, 603), title, 27, INK, True)
        text(draw, (x + 22, 674), detail, 19, MUTED)

    panel(draw, (66, 790, 1534, 845), fill=(14, 23, 24), outline=(71, 92, 88))
    text(draw, (92, 807), "脚本错误 0", 20, GREEN, True)
    text(draw, (390, 807), "横向溢出 0", 20, GREEN, True)
    text(draw, (730, 807), "参考方案不是测试后门：它必须经过玩家使用的同一转移规则", 20, INK, True)
    save(image, "termination-validation.jpg")


def main():
    create_cover()
    create_state_model()
    create_queue_pipeline()
    create_termination_validation()


if __name__ == "__main__":
    main()
