#!/usr/bin/env python3
"""
Generates the optimized web assets from the source files in src/assets.

  python3 scripts/optimize-assets.py

Sources (kept in the repo, never served directly):
  brand/logo-{white,black}-source.png   5525x3604 RGBA
  services/*-source.png                 1024x768
  team/*-source.png                     1024x1024 and 768x1024
  video/hero-loop.mp4                   served as-is (poster extracted here)

Never upscales: every output is at most the source size.
Requires Pillow and ffmpeg.
"""
from collections import deque
from pathlib import Path
import subprocess

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "src" / "assets"
PUBLIC = ROOT / "public"
INK_950 = (10, 10, 11)  # --color-ink-950


def webp(im: Image.Image, path: Path, quality=82):
    im.save(path, "WEBP", quality=quality, method=6)
    print(f"  {path.relative_to(ROOT)} {im.size[0]}x{im.size[1]} {path.stat().st_size // 1024} KB")


def resize_w(im: Image.Image, w: int) -> Image.Image:
    w = min(w, im.width)
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


# --- Brand: trim the transparent margin, light alpha versions ---------------------------
print("brand")
for tone in ("white", "black"):
    src = Image.open(A / "brand" / f"logo-{tone}-source.png").convert("RGBA")
    logo = src.crop(src.getbbox())
    for w in (320, 640):
        webp(resize_w(logo, w), A / "brand" / f"logo-{tone}-{w}.webp", quality=90)

# --- Services: two widths -------------------------------------------------------------
print("services")
for src in sorted((A / "services").glob("*-source.png")):
    if src.name.startswith("servicios-hero"):
        continue  # handled below
    name = src.name.replace("-source.png", "")
    im = Image.open(src).convert("RGB")
    for w in (640, 1024):
        webp(resize_w(im, w), A / "services" / f"{name}-{w}.webp")

# --- /servicios hero (1280x720) and real shop photos (low-res originals, never upscaled)
print("services hero + shop")
hero = Image.open(A / "services" / "servicios-hero-source.png").convert("RGB")
for w in (640, 1280):
    webp(resize_w(hero, w), A / "services" / f"servicios-hero-{w}.webp", quality=86)
for src in sorted((A / "shop").glob("*-source.jpg")):
    name = src.name.replace("-source.jpg", "")
    webp(Image.open(src).convert("RGB"), A / "shop" / f"{name}.webp", quality=84)

# --- Gallery: 4:5 photos of real cuts -----------------------------------------------
print("gallery")
for src in sorted((A / "gallery").glob("*-source.jpg")):
    name = src.name.replace("-source.jpg", "")
    im = Image.open(src).convert("RGB")
    for w in (480, 960):
        webp(resize_w(im, w), A / "gallery" / f"{name}-{w}.webp", quality=80)

# --- Team: 4:5 portraits and face crops -----------------------------------------------
# Head-and-shoulders squares with breathing room: hero barber pills and booking avatars.
CARDS = {"isaac-fuentes": (171, 0, 640), "leonardo-gomez": (71, 30, 620)}
print("team")
for src in sorted((A / "team").glob("*-source.png")):
    name = src.name.replace("-source.png", "")
    im = Image.open(src).convert("RGB")
    # 4:5 portrait, horizontally centered, anchored to the top (faces sit high in both photos).
    pw = min(im.width, round(im.height * 4 / 5))
    ph = round(pw * 5 / 4)
    x0 = (im.width - pw) // 2
    portrait = im.crop((x0, 0, x0 + pw, ph))
    for w in (400, 800):
        webp(resize_w(portrait, w), A / "team" / f"{name}-portrait-{w}.webp")
    cx, cy, cs = CARDS[name]
    card = im.crop((cx, cy, cx + cs, cy + cs))
    for s in (120, 240):
        webp(card.resize((s, s), Image.LANCZOS), A / "team" / f"{name}-card-{s}.webp", quality=85)

# --- Video poster (first frame) and a blurred version for the scrolled backdrop ---------
print("video")
frame = A / "video" / "_frame0.png"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(A / "video" / "hero-loop.mp4"), "-frames:v", "1", str(frame)], check=True)
poster = Image.open(frame).convert("RGB")
webp(poster, A / "video" / "hero-poster.webp", quality=72)
webp(resize_w(poster, 640), A / "video" / "hero-poster-640.webp", quality=70)
small = resize_w(poster, 480).filter(ImageFilter.GaussianBlur(10))
webp(small, A / "video" / "hero-poster-blur.webp", quality=60)
frame.unlink()

# --- Favicon / touch icon: scissors + pole from the black logo (not redrawn) ------------
print("icons")
black = Image.open(A / "brand" / "logo-black-source.png").convert("RGBA")
black = black.crop(black.getbbox())
alpha = black.getchannel("A").load()
rgb = black.convert("RGB").load()
W, H = black.size
dark = lambda x, y: alpha[x, y] > 128 and sum(rgb[x, y]) < 200
# Seed on the scissors pivot (center of the mark), flood the connected black shape.
cx, cy = int(W * 0.375), int(H * 0.52)
seed = next(((x, y) for r in range(0, 400) for (x, y) in ((cx + r, cy), (cx - r, cy), (cx, cy + r), (cx, cy - r)) if dark(x, y)))
seen = bytearray(W * H)
q = deque([seed])
seen[seed[1] * W + seed[0]] = 1
comp = []
while q:
    x, y = q.popleft()
    comp.append((x, y))
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx] and dark(nx, ny):
            seen[ny * W + nx] = 1
            q.append((nx, ny))
xs = [p[0] for p in comp]
ys = [p[1] for p in comp]
x0, x1 = min(xs), max(xs)
pole = [(x, y) for y in range(H) for x in range(x0, x1) if alpha[x, y] > 128 and sum(rgb[x, y]) >= 200]
py = [p[1] for p in pole] + ys
y0, y1 = min(py), max(py)
side = max(x1 - x0, y1 - y0)
pad = int(side * 0.16)
S = side + 2 * pad
mark = Image.new("RGB", (S, S), INK_950)
m = mark.load()
ox = pad + (side - (x1 - x0)) // 2 - x0
oy = pad + (side - (y1 - y0)) // 2 - y0
for x, y in pole:
    m[x + ox, y + oy] = (90, 90, 98)
for x, y in comp:
    m[x + ox, y + oy] = (255, 255, 255)
mark = mark.filter(ImageFilter.SMOOTH)
for size, out in ((32, "favicon-32.png"), (180, "apple-touch-icon.png")):
    mark.resize((size, size), Image.LANCZOS).save(PUBLIC / out, optimize=True)
    print(f"  public/{out}")

# --- Open Graph image: white logo on ink-950 -----------------------------------------
white = Image.open(A / "brand" / "logo-white-source.png").convert("RGBA")
white = white.crop(white.getbbox())
og = Image.new("RGB", (1200, 630), INK_950)
lw = 620
lg = white.resize((lw, round(white.height * lw / white.width)), Image.LANCZOS)
og.paste(lg, ((1200 - lw) // 2, (630 - lg.height) // 2), lg)
og.save(PUBLIC / "og-image.jpg", quality=86, optimize=True)
print("  public/og-image.jpg")
