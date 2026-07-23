from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[2]
IMAGE_DIR = ROOT / "docs" / "images" / "gray-box-contracts"
FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")
FONT_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_MONO = Path(r"C:\Windows\Fonts\consola.ttf")

BG = (7, 19, 30)
SURFACE = (15, 37, 51)
SURFACE_2 = (23, 52, 68)
SURFACE_3 = (29, 64, 78)
INK = (240, 248, 247)
MUTED = (164, 190, 199)
CYAN = (91, 210, 218)
MINT = (101, 221, 181)
GOLD = (239, 192, 91)
CORAL = (237, 120, 113)
BLUE = (108, 171, 235)
PURPLE = (176, 137, 235)
GRID = (50, 85, 99)


def font(path: Path, size: int):
    return ImageFont.truetype(str(path), size)


def text(draw, xy, value, size, fill=INK, bold=False, mono=False, anchor=None):
    path = FONT_MONO if mono else FONT_BOLD if bold else FONT_REGULAR
    draw.text(xy, value, font=font(path, size), fill=fill, anchor=anchor)


def wrapped(draw, box, value, size, fill=INK, bold=False, spacing=10):
    x1, y1, x2, _ = box
    current = ""
    lines = []
    fnt = font(FONT_BOLD if bold else FONT_REGULAR, size)
    for character in value:
        candidate = current + character
        if draw.textbbox((0, 0), candidate, font=fnt)[2] > x2 - x1 and current:
            lines.append(current)
            current = character
        else:
            current = candidate
    if current:
        lines.append(current)
    y = y1
    for line in lines:
        draw.text((x1, y), line, font=fnt, fill=fill)
        y += size + spacing
    return y


def panel(draw, box, fill=SURFACE, outline=GRID, width=2, radius=18):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def arrow(draw, start, end, fill=CYAN, width=5):
    x1, y1 = start
    x2, y2 = end
    draw.line((x1, y1, x2, y2), fill=fill, width=width)
    if abs(x2 - x1) >= abs(y2 - y1):
        direction = 1 if x2 > x1 else -1
        points = [(x2, y2), (x2 - 15 * direction, y2 - 10), (x2 - 15 * direction, y2 + 10)]
    else:
        direction = 1 if y2 > y1 else -1
        points = [(x2, y2), (x2 - 10, y2 - 15 * direction), (x2 + 10, y2 - 15 * direction)]
    draw.polygon(points, fill=fill)


def save(image, name):
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    target = IMAGE_DIR / name
    image.save(target, "JPEG", quality=94, optimize=True, progressive=True)
    print(target)


def fit_image(path: Path, size, centering=(0.5, 0.08)):
    with Image.open(path) as source:
        image = source.convert("RGB")
    return ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=centering)


def create_cover():
    image = Image.new("RGB", (1920, 1080), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1920, 16), fill=CYAN)

    for x in range(0, 1920, 96):
        draw.line((x, 0, x, 1080), fill=(10, 29, 42), width=1)
    for y in range(0, 1080, 96):
        draw.line((0, y, 1920, y), fill=(10, 29, 42), width=1)

    text(draw, (92, 68), "GRAY-BOX FRONTEND CONTRACTS", 30, CYAN, True)
    text(draw, (88, 140), "别让 Playwright", 96, INK, True)
    text(draw, (88, 258), "只能点按钮", 104, INK, True)
    text(draw, (94, 405), "真实交互  ×  最小测试契约  ×  可解释断言", 37, MUTED)

    metrics = [
        ("3", "真实页面", CYAN),
        ("28/28", "参考方案", MINT),
        ("3/3", "档案往返", GOLD),
        ("0", "浏览器错误", CORAL),
    ]
    for index, (value, label, accent) in enumerate(metrics):
        x = 94 + index * 330
        panel(draw, (x, 515, x + 300, 674), fill=SURFACE, outline=accent, width=3)
        text(draw, (x + 24, 535), value, 54, accent, True)
        text(draw, (x + 25, 612), label, 25, MUTED)

    panel(draw, (1434, 102, 1830, 928), fill=(10, 30, 43), outline=GRID, width=2, radius=24)
    text(draw, (1480, 142), "证据链", 32, GOLD, True)
    layers = [
        ("01", "真实点击 / 触摸", "事件绑定与可用性", BLUE),
        ("02", "业务状态快照", "动作是否真正生效", CYAN),
        ("03", "内容与参考方案", "数据完整且存在可行解", MINT),
        ("04", "档案与 Canvas", "边界协议与渲染信号", GOLD),
    ]
    for index, (number, title, subtitle, accent) in enumerate(layers):
        y = 218 + index * 160
        panel(draw, (1472, y, 1792, y + 122), fill=SURFACE_2, outline=accent, width=2, radius=14)
        draw.ellipse((1492, y + 28, 1548, y + 84), fill=accent)
        text(draw, (1520, y + 56), number, 20, BG, True, anchor="mm")
        text(draw, (1570, y + 24), title, 24, INK, True)
        text(draw, (1570, y + 67), subtitle, 18, MUTED)
        if index < len(layers) - 1:
            arrow(draw, (1632, y + 124), (1632, y + 151), fill=accent, width=3)

    panel(draw, (94, 760, 1324, 928), fill=SURFACE_2, outline=GRID, width=2)
    text(draw, (124, 790), "核心边界", 26, GOLD, True)
    text(draw, (124, 843), "契约证明可观察的业务结果，不暴露可任意改写的内部实现。", 34, INK, True)
    text(draw, (94, 1004), "前端灰盒测试接口的设计与边界", 24, MUTED)
    save(image, "cover.jpg")


def create_evidence_layers():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1600, 12), fill=CYAN)
    text(draw, (66, 48), "真实交互与灰盒契约的分层证据链", 48, INK, True)
    text(draw, (68, 115), "一条测试同时回答“用户能不能操作”和“业务结果是否成立”", 25, MUTED)

    column_x = [68, 410, 752, 1094]
    cards = [
        ("1", "真实输入", ["Playwright click / tap", "键盘与按钮事件", "390×844 触摸布局"], BLUE),
        ("2", "页面行为", ["DOM 事件绑定", "业务入口执行", "Canvas / DOM 渲染"], CYAN),
        ("3", "最小契约", ["state()", "validateContent()", "simulateReference()"], MINT),
        ("4", "稳定断言", ["结果字段", "档案往返", "错误与溢出为 0"], GOLD),
    ]
    for index, (number, title, lines, accent) in enumerate(cards):
        x = column_x[index]
        panel(draw, (x, 220, x + 274, 576), fill=SURFACE, outline=accent, width=3)
        draw.ellipse((x + 24, 244, x + 86, 306), fill=accent)
        text(draw, (x + 55, 275), number, 27, BG, True, anchor="mm")
        text(draw, (x + 106, 255), title, 30, INK, True)
        draw.line((x + 24, 330, x + 250, 330), fill=GRID, width=2)
        for line_index, line in enumerate(lines):
            y = 366 + line_index * 68
            draw.ellipse((x + 26, y + 8, x + 38, y + 20), fill=accent)
            line_size = 18 if "()" in line else 21
            text(draw, (x + 52, y), line, line_size, MUTED, mono="()" in line)
        if index < 3:
            arrow(draw, (x + 282, 398), (column_x[index + 1] - 14, 398), fill=accent)

    panel(draw, (68, 640, 1532, 812), fill=SURFACE_2, outline=GRID, width=2)
    text(draw, (98, 672), "为什么必须分层？", 28, GOLD, True)
    text(draw, (98, 724), "只点按钮：只能证明事件没有立刻报错。", 25, CORAL, True)
    text(draw, (610, 724), "只调内部函数：可能绕过真实 UI 和事件绑定。", 25, BLUE, True)
    text(draw, (1120, 724), "两类证据合并：才能定位失败层。", 25, MINT, True)
    text(draw, (70, 854), "图 1  ·  交互证据与规则证据不是替代关系，而是同一条验收链上的不同层。", 21, MUTED)
    save(image, "evidence-layers.jpg")


def create_contract_surface():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1600, 12), fill=MINT)
    text(draw, (66, 48), "最小灰盒接口：暴露能力，不暴露实现", 48, INK, True)
    text(draw, (68, 115), "契约应返回稳定、只读、可断言的数据；不能成为随意改状态的后门", 25, MUTED)

    panel(draw, (66, 178, 850, 790), fill=(9, 28, 40), outline=CYAN, width=3)
    text(draw, (96, 207), "window.__pageTest", 30, CYAN, True, mono=True)
    text(draw, (96, 258), "{", 26, MUTED, mono=True)
    methods = [
        ("validateContent()", "结构、数量、引用完整性", MINT),
        ("state()", "动作后的业务快照", BLUE),
        ("simulateReference()", "参考方案存在且能结算", GOLD),
        ("encode() / decode()", "持久化协议真实往返", PURPLE),
        ("render signal", "Canvas 有像素与颜色分布", CYAN),
    ]
    for index, (name, purpose, accent) in enumerate(methods):
        y = 306 + index * 88
        panel(draw, (102, y, 814, y + 66), fill=SURFACE, outline=accent, width=2, radius=10)
        text(draw, (126, y + 17), name, 23, accent, True, mono=True)
        text(draw, (482, y + 19), purpose, 21, MUTED)
    text(draw, (96, 755), "}", 26, MUTED, mono=True)

    panel(draw, (902, 178, 1534, 462), fill=SURFACE, outline=MINT, width=3)
    text(draw, (934, 210), "应该暴露", 31, MINT, True)
    good = [
        "稳定的业务字段与错误原因",
        "纯函数式校验和可重复参考方案",
        "带版本、可校验的导入导出边界",
        "与 DOM 文案和布局无关的语义结果",
    ]
    for index, line in enumerate(good):
        y = 276 + index * 44
        draw.ellipse((938, y + 7, 954, y + 23), fill=MINT)
        text(draw, (970, y), line, 22, INK)

    panel(draw, (902, 502, 1534, 790), fill=SURFACE, outline=CORAL, width=3)
    text(draw, (934, 534), "不应该暴露", 31, CORAL, True)
    bad = [
        "可任意改写的原始 state 引用",
        "定时器句柄、私有缓存和渲染细节",
        "绕过校验直接解锁或通关的万能函数",
        "密钥、用户隐私或服务端特权能力",
    ]
    for index, line in enumerate(bad):
        y = 600 + index * 44
        draw.line((938, y + 15, 954, y + 15), fill=CORAL, width=4)
        text(draw, (970, y), line, 22, INK)

    text(draw, (70, 854), "图 2  ·  最小契约描述“页面能做什么、做完得到什么”，避免绑定内部函数名和可变对象。", 21, MUTED)
    save(image, "contract-surface.jpg")


def create_validation_results():
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1600, 12), fill=GOLD)
    text(draw, (66, 48), "专项验证矩阵与真实结果", 48, INK, True)
    text(draw, (68, 115), "同一次 Playwright 运行：真实交互、内容契约、参考方案、档案与移动端", 25, MUTED)

    summaries = [
        ("28 / 28", "参考方案通过", MINT),
        ("3 / 3", "档案往返通过", GOLD),
        ("0", "页面 / 控制台错误", CORAL),
        ("0", "移动端横向溢出", CYAN),
    ]
    for index, (value, label, accent) in enumerate(summaries):
        x = 68 + index * 376
        panel(draw, (x, 174, x + 344, 304), fill=SURFACE, outline=accent, width=3)
        text(draw, (x + 24, 195), value, 42, accent, True)
        text(draw, (x + 24, 254), label, 20, MUTED)

    x0, y0 = 68, 348
    widths = [290, 404, 404, 404]
    headers = ["验证项", "空间约束页", "经营模拟页", "实时 Canvas 页"]
    header_colors = [MUTED, CYAN, MINT, GOLD]
    x = x0
    for width, title, accent in zip(widths, headers, header_colors):
        panel(draw, (x, y0, x + width - 8, y0 + 70), fill=SURFACE_3, outline=accent, width=2, radius=10)
        text(draw, (x + 18, y0 + 21), title, 22, accent, True)
        x += width

    rows = [
        ("内容规模", "12 室 / 98 件", "4 情景 / 48 天", "12 班 / 96 列"),
        ("参考方案", "12 / 12 合法", "4 / 4 三星", "12 / 12 三星"),
        ("真实 UI", "放置 1 件物品", "建造并推进 1 天", "切线并完成班次"),
        ("档案协议", "COZY2 往返", "HIVE2 往返", "RAIL2 往返"),
        ("桌面 / 触屏", "通过 / 通过", "通过 / 通过", "通过 / 通过"),
        ("专项信号", "规则错误 0", "参考失败 0", "Canvas 像素通过"),
    ]
    for row_index, row in enumerate(rows):
        y = y0 + 82 + row_index * 68
        x = x0
        for col_index, (width, value) in enumerate(zip(widths, row)):
            fill = SURFACE if row_index % 2 == 0 else (12, 32, 45)
            draw.rounded_rectangle((x, y, x + width - 8, y + 56), radius=8, fill=fill, outline=GRID, width=1)
            color = MUTED if col_index == 0 else INK
            text(draw, (x + 18, y + 15), value, 20, color, bold=col_index == 0)
            if col_index > 0:
                draw.ellipse((x + width - 44, y + 20, x + width - 28, y + 36), fill=MINT)
            x += width

    panel(draw, (68, 836, 1532, 886), fill=SURFACE_2, outline=GRID, width=2, radius=10)
    text(draw, (92, 849), "证据边界：通过不等于穷举全部状态；Chromium 桌面/移动上下文也不能替代真实 Safari 与低性能设备。", 20, MUTED)
    save(image, "validation-results.jpg")


if __name__ == "__main__":
    create_cover()
    create_evidence_layers()
    create_contract_surface()
    create_validation_results()
