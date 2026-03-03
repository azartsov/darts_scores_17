from PIL import Image, ImageDraw, ImageFilter
import math
from pathlib import Path

sizes = [192, 512]
out_dir = Path("public/icons")
out_dir.mkdir(parents=True, exist_ok=True)

for size in sizes:
    img = Image.new("RGB", (size, size), "#0b1220")
    d = ImageDraw.Draw(img)
    cx = cy = size // 2
    r = int(size * 0.44)

    # glow
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((cx - r - 10, cy - r - 10, cx + r + 10, cy + r + 10), fill=(30, 110, 255, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=max(4, size // 64)))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    d = ImageDraw.Draw(img)

    # board
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill="#151c2f", outline="#7084b2", width=max(2, size // 96))

    bullseye = int(r * 0.08)
    bull = int(r * 0.16)
    triple_in = int(r * 0.58)
    triple_out = int(r * 0.70)
    double_in = int(r * 0.86)
    double_out = int(r * 0.99)

    for i in range(20):
        a1 = -90 + i * 18
        a2 = a1 + 18
        base = "#f0e9db" if i % 2 else "#1a1a1a"
        ring = "#1f9d63" if i % 2 else "#cf3a37"

        d.pieslice((cx - triple_in, cy - triple_in, cx + triple_in, cy + triple_in), a1, a2, fill=base)
        d.pieslice((cx - triple_out, cy - triple_out, cx + triple_out, cy + triple_out), a1, a2, fill=ring)
        d.pieslice((cx - double_in, cy - double_in, cx + double_in, cy + double_in), a1, a2, fill=base)
        d.pieslice((cx - double_out, cy - double_out, cx + double_out, cy + double_out), a1, a2, fill=ring)

    d.ellipse((cx - bull, cy - bull, cx + bull, cy + bull), fill="#1f9d63", outline="#111827", width=max(1, size // 170))
    d.ellipse((cx - bullseye, cy - bullseye, cx + bullseye, cy + bullseye), fill="#cf3a37", outline="#111827", width=max(1, size // 170))

    # dart silhouette
    dart_len = int(size * 0.22)
    dart_w = max(2, size // 80)
    angle = math.radians(-35)
    x2 = cx + int(math.cos(angle) * dart_len)
    y2 = cy + int(math.sin(angle) * dart_len)
    d.line((cx, cy, x2, y2), fill="#e5eefc", width=dart_w)
    head = max(4, size // 45)
    d.polygon([(x2, y2), (x2 - head, y2 + head // 2), (x2 - head // 3, y2 - head)], fill="#e5eefc")

    out_png = out_dir / f"icon-{size}x{size}.png"
    img.save(out_png, format="PNG", optimize=True)
    print(f"saved {out_png}")

    out_jpg = out_dir / f"icon-{size}x{size}.jpg"
    img.save(out_jpg, format="JPEG", quality=95, optimize=True)
    print(f"saved {out_jpg}")
