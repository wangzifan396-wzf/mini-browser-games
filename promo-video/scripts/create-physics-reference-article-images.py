from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "images" / "physics-reference"
DATA = json.loads((OUT / "article-data.json").read_text(encoding="utf-8"))
SCREENSHOT = ROOT / "output" / "chalk-billiards" / "mobile.png"

INK = (236, 245, 241)
MUTED = (157, 181, 174)
BG = (8, 23, 29)
PANEL = (17, 42, 48)
PANEL_ALT = (24, 55, 59)
TEAL = (72, 199, 169)
GOLD = (239, 198, 89)
RED = (221, 99, 91)
BLUE = (92, 157, 195)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    names = [
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for name in names:
        path = Path(name)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def panel(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill=PANEL, outline=(74, 115, 116)) -> None:
    draw.rounded_rectangle(box, radius=22, fill=fill, outline=outline, width=2)


def arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], color=TEAL, width=5) -> None:
    draw.line((start, end), fill=color, width=width)
    ex, ey = end
    sx, sy = start
    dx, dy = ex - sx, ey - sy
    length = max(1, (dx * dx + dy * dy) ** 0.5)
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    draw.polygon([
        (ex, ey),
        (ex - ux * 18 + px * 10, ey - uy * 18 + py * 10),
        (ex - ux * 18 - px * 10, ey - uy * 18 - py * 10),
    ], fill=color)


def save(image: Image.Image, name: str) -> None:
    image.convert("RGB").save(OUT / name, quality=94, subsampling=0)


OUT.mkdir(parents=True, exist_ok=True)
metrics = DATA["metrics"]

# Cover: a real technical subject signal, not a generic decorative banner.
cover = Image.new("RGB", (1920, 1080), BG)
d = ImageDraw.Draw(cover)
d.rectangle((0, 0, 1920, 18), fill=GOLD)
d.text((92, 76), "BROWSER PHYSICS VERIFICATION", font=font(25, True), fill=GOLD)
d.text((92, 132), "别拿录屏当物理验证", font=font(76, True), fill=INK)
d.text((96, 242), "固定时间步、参考输入与 27 条真实球路自动验收", font=font(34), fill=MUTED)

# Stylized table and trajectory.
table = (92, 365, 1255, 945)
d.rounded_rectangle(table, radius=38, fill=(107, 70, 39), outline=(180, 124, 67), width=4)
d.rounded_rectangle((124, 397, 1223, 913), radius=26, fill=(34, 113, 102), outline=(89, 175, 151), width=3)
pockets = [(128, 401), (674, 393), (1219, 401), (128, 909), (674, 917), (1219, 909)]
for x, y in pockets:
    d.ellipse((x - 31, y - 31, x + 31, y + 31), fill=(8, 19, 23))
d.ellipse((1018, 514, 1062, 558), fill=GOLD, outline=INK, width=4)
d.ellipse((515, 760, 559, 804), fill=(248, 247, 235), outline=(185, 198, 194), width=3)
d.ellipse((958, 574, 1002, 618), outline=(255, 255, 255), width=4)
d.line((537, 782, 980, 596), fill=INK, width=5)
d.line((1040, 536, 1219, 401), fill=GOLD, width=5)
d.line((340, 865, 537, 782), fill=(214, 130, 83), width=14)

panel(d, (1320, 365, 1828, 945), fill=PANEL)
d.text((1370, 411), "真实证据", font=font(30, True), fill=TEAL)
cards = [
    ("120 Hz", "固定物理步", TEAL),
    ("27 / 27", "参考球路入袋", GOLD),
    ("2 viewports", "真实拖拽通过", BLUE),
    ("0", "脚本与溢出失败", RED),
]
y = 480
for value, label, color in cards:
    d.rounded_rectangle((1370, y, 1778, y + 90), radius=16, fill=PANEL_ALT, outline=color, width=2)
    d.text((1395, y + 9), value, font=font(27, True), fill=color)
    d.text((1395, y + 51), label, font=font(17), fill=INK)
    y += 105
d.text((92, 1002), "JavaScript · Canvas · Fixed timestep · Playwright", font=font(23, True), fill=MUTED)
save(cover, "cover.jpg")

# Figure 1: evidence pipeline.
pipeline = Image.new("RGB", (1600, 900), BG)
d = ImageDraw.Draw(pipeline)
d.text((64, 48), "真实拖拽与参考输入汇入同一物理管线", font=font(45, True), fill=INK)
d.text((66, 111), "验证对象是输入到结构化结果的整条路径，不是最终截图", font=font(23), fill=MUTED)

panel(d, (64, 190, 420, 420), fill=PANEL_ALT, outline=BLUE)
d.text((95, 220), "真实浏览器", font=font(28, True), fill=BLUE)
d.text((95, 275), "pointerdown / move / up", font=font(19), fill=INK)
d.text((95, 315), "屏幕坐标 → 世界坐标", font=font(19), fill=MUTED)
d.text((95, 355), "真实 Canvas 与触屏布局", font=font(19), fill=MUTED)

panel(d, (64, 488, 420, 718), fill=PANEL_ALT, outline=GOLD)
d.text((95, 518), "参考夹具", font=font(28, True), fill=GOLD)
d.text((95, 573), "cue / ghost / target / pocket", font=font(19), fill=INK)
d.text((95, 613), "保存方向与力度", font=font(19), fill=MUTED)
d.text((95, 653), "不保存“通关=true”", font=font(19), fill=MUTED)

panel(d, (535, 276, 875, 632), fill=PANEL, outline=TEAL)
d.text((585, 313), "统一输入层", font=font(30, True), fill=TEAL)
d.text((585, 375), "velocityFor()", font=font(25, True), fill=INK)
d.text((585, 428), "方向归一化", font=font(19), fill=MUTED)
d.text((585, 469), "拖距 → power", font=font(19), fill=MUTED)
d.text((585, 510), "球杆 / 巧粉倍率", font=font(19), fill=MUTED)
d.text((585, 565), "输出 vx / vy", font=font(20, True), fill=GOLD)
arrow(d, (420, 305), (535, 390), BLUE)
arrow(d, (420, 603), (535, 520), GOLD)

panel(d, (985, 190, 1535, 718), fill=PANEL, outline=(89, 132, 130))
d.text((1030, 224), "120Hz 固定步进", font=font(30, True), fill=TEAL)
steps = [
    ("1", "积分位置与指数摩擦"),
    ("2", "库边反弹与接触计数"),
    ("3", "球体重叠修正与冲量"),
    ("4", "六袋检测与犯规标记"),
    ("5", "停止条件与结构化结果"),
]
y = 292
for number, label in steps:
    d.ellipse((1030, y, 1072, y + 42), fill=TEAL)
    d.text((1043, y + 5), number, font=font(20, True), fill=BG)
    d.text((1095, y + 7), label, font=font(20), fill=INK)
    y += 76
arrow(d, (875, 454), (985, 454), TEAL)

panel(d, (64, 770, 1535, 838), fill=(11, 31, 37), outline=(70, 105, 105))
d.text((94, 789), "同源要求：相同世界坐标、相同速度映射、相同固定步长、相同碰撞顺序、相同停止与结算条件", font=font(22, True), fill=INK)
save(pipeline, "evidence-pipeline.jpg")

# Figure 2: real screenshot plus the geometry fixture.
trajectory = Image.new("RGB", (1600, 900), BG)
d = ImageDraw.Draw(trajectory)
d.text((64, 48), "真实手机拖杆与幽灵球几何夹具", font=font(45, True), fill=INK)
d.text((66, 111), "左侧证明用户路径可操作；右侧解释参考输入怎样由球位生成", font=font(23), fill=MUTED)
panel(d, (64, 170, 712, 824), fill=PANEL)
if SCREENSHOT.exists():
    shot = Image.open(SCREENSHOT).convert("RGB")
    crop = shot.crop((0, 0, shot.width, min(875, shot.height)))
    crop.thumbnail((590, 600), Image.Resampling.LANCZOS)
    x = 388 - crop.width // 2
    y = 197 + (590 - crop.height) // 2
    trajectory.paste(crop, (x, y))
else:
    d.text((190, 465), "先运行专项测试生成手机实拍", font=font(24), fill=MUTED)
d.text((88, 782), "390×844 真实拖杆：第 1 球型进入目标袋并取得力度印记", font=font(18, True), fill=TEAL)

panel(d, (758, 170, 1536, 824), fill=PANEL_ALT)
d.text((802, 205), "幽灵球夹具只描述输入", font=font(29, True), fill=GOLD)
# Diagram in world-space style.
d.rounded_rectangle((820, 292, 1475, 664), radius=22, fill=(31, 105, 94), outline=(100, 174, 152), width=3)
pocket = (1418, 346)
target = (1190, 472)
ghost = (1133, 503)
cue = (880, 640)
d.ellipse((pocket[0]-28,pocket[1]-28,pocket[0]+28,pocket[1]+28), fill=(7,18,22), outline=GOLD, width=4)
d.line((target, pocket), fill=GOLD, width=4)
d.line((cue, ghost), fill=INK, width=4)
d.ellipse((target[0]-23,target[1]-23,target[0]+23,target[1]+23), fill=GOLD, outline=INK, width=3)
d.ellipse((ghost[0]-23,ghost[1]-23,ghost[0]+23,ghost[1]+23), outline=INK, width=4)
d.ellipse((cue[0]-23,cue[1]-23,cue[0]+23,cue[1]+23), fill=(248,247,235), outline=(188,201,196), width=3)
d.text((1362, 300), "目标袋", font=font(18, True), fill=GOLD)
d.text((1208, 493), "目标球", font=font(18, True), fill=INK)
d.text((1050, 535), "幽灵球", font=font(18, True), fill=INK)
d.text((842, 673), "白球", font=font(18, True), fill=INK)
d.text((806, 718), "aim = target - unit(pocket - target) × 2R", font=font(21, True), fill=INK)
d.text((806, 760), "reference = { cue, aim, power, band }", font=font(21), fill=MUTED)
save(trajectory, "trajectory-evidence.jpg")

# Figure 3: result matrix.
results = Image.new("RGB", (1600, 900), BG)
d = ImageDraw.Draw(results)
d.text((64, 48), "27 条物理球路与浏览器回归结果", font=font(45, True), fill=INK)
d.text((66, 111), "模型证据、真实交互、档案协议和全仓审计分别回答不同问题", font=font(23), fill=MUTED)

cards = [
    ("27 / 27", "固定参考球路", "进入指定袋口", GOLD),
    ("120 Hz", "实时与参考", "共享固定物理步", TEAL),
    ("2 / 2", "桌面 + 手机", "真实拖杆完成球型", BLUE),
    ("PASS", "CUE2 档案", "往返 + 篡改拒绝", TEAL),
]
x = 64
for value, title, note, color in cards:
    panel(d, (x, 188, x + 348, 405), fill=PANEL, outline=color)
    d.text((x + 28, 218), value, font=font(38, True), fill=color)
    d.text((x + 28, 282), title, font=font(23, True), fill=INK)
    d.text((x + 28, 330), note, font=font(18), fill=MUTED)
    x += 376

panel(d, (64, 466, 1536, 770), fill=PANEL_ALT)
d.text((100, 502), "全仓浏览器审计", font=font(29, True), fill=INK)
audit = [
    ("页面组合", str(metrics["pageCombinations"])),
    ("加载失败", str(metrics["loadFailures"])),
    ("JavaScript 错误", str(metrics["javascriptFailures"])),
    ("控制台错误", str(metrics["consoleFailures"])),
    ("横向溢出", str(metrics["overflows"])),
]
col_x = 100
for label, value in audit:
    d.rounded_rectangle((col_x, 570, col_x + 250, 700), radius=18, fill=(11, 31, 37), outline=(74, 112, 110), width=2)
    d.text((col_x + 24, 592), value, font=font(42, True), fill=TEAL if value == "0" else GOLD)
    d.text((col_x + 24, 655), label, font=font(18, True), fill=MUTED)
    col_x += 282
d.text((64, 812), f"源码提交：{DATA['sourceCommit']}  ·  证据边界：参考夹具可行，不等于穷举所有玩家输入", font=font(20), fill=MUTED)
save(results, "validation-results.jpg")

print(json.dumps({
    "output": str(OUT),
    "images": ["cover.jpg", "evidence-pipeline.jpg", "trajectory-evidence.jpg", "validation-results.jpg"],
    "sourceScreenshot": str(SCREENSHOT),
}, ensure_ascii=False, indent=2))
