from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[2]
IMAGE_DIR = ROOT / "docs" / "images" / "readable-uncertainty"
FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")
FONT_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def add_panel(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    x: int,
    source: str,
    accent: tuple[int, int, int],
    heading: str,
    detail: str,
) -> None:
    y, width, height = 376, 560, 626
    draw.rounded_rectangle(
        (x, y, x + width, y + height),
        radius=18,
        fill=(242, 241, 229),
        outline=accent,
        width=4,
    )

    with Image.open(IMAGE_DIR / source) as image:
        screenshot = ImageOps.fit(
            image.convert("RGB"),
            (width - 16, 352),
            method=Image.Resampling.LANCZOS,
        )
    mask = Image.new("L", screenshot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, screenshot.width, screenshot.height), radius=12, fill=255
    )
    canvas.paste(screenshot, (x + 8, y + 8), mask)

    draw.rectangle((x + 8, y + 374, x + 104, y + 382), fill=accent)
    draw.text((x + 34, y + 412), heading, font=font(FONT_BOLD, 42), fill=(10, 32, 35))
    draw.text((x + 34, y + 482), detail, font=font(FONT_REGULAR, 28), fill=(52, 69, 68))


def main() -> None:
    canvas = Image.new("RGB", (1920, 1080), (8, 28, 31))
    draw = ImageDraw.Draw(canvas)

    draw.rectangle((0, 0, 1920, 18), fill=(244, 190, 77))
    draw.text((88, 76), "BROWSER GAME DESIGN", font=font(FONT_BOLD, 30), fill=(84, 216, 190))
    draw.text((88, 124), "隐藏信息，不等于靠猜", font=font(FONT_BOLD, 104), fill=(247, 245, 231))
    draw.text(
        (92, 276),
        "三个单 HTML 游戏的可学习设计",
        font=font(FONT_REGULAR, 40),
        fill=(188, 204, 198),
    )

    add_panel(canvas, draw, 88, "beat-bento.png", (222, 168, 62), "时间信息", "暗拍只降低提前量")
    add_panel(canvas, draw, 680, "shadow-post.png", (205, 91, 76), "空间信息", "守卫规则保持稳定")
    add_panel(canvas, draw, 1272, "abyss-sonar.png", (42, 174, 168), "身份信息", "主动探测需要代价")

    output = IMAGE_DIR / "cover.jpg"
    canvas.save(output, "JPEG", quality=94, optimize=True, progressive=True)
    print(output)


if __name__ == "__main__":
    main()
