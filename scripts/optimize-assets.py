#!/usr/bin/env python3
"""
Generates the optimized web assets from the source files in src/assets.

  python3 scripts/optimize-assets.py

Sources (kept in the repo, never served directly):
  brand/logo-{white,black}-source.png   5525x3604 RGBA
  services/*-source.png                 1024x768
  team/*-source.png                     1024x1024 and 768x1024
  founder/*-source.jpg                  Leonardo's story photos → public/img/leonardo-gomez-rios-*
  video/hero-loop.mp4                   served as-is on tablet and desktop (poster extracted here)
  video/hero-loop-480.mp4               phones (<768 px), re-encoded here

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
    if tone == "black":
        # Sale ticket (thermal printer): opaque grayscale PNG, since jsPDF can't embed WebP.
        flat = Image.new("RGBA", logo.size, (255, 255, 255, 255))
        flat.alpha_composite(logo)
        resize_w(flat, 480).convert("L").save(A / "brand" / "logo-ticket.png", optimize=True)

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

# --- Founder story (/barberos/leonardo-gomez-rios): served from public/img with stable,
# descriptive names (Google Images, JSON-LD), plus the page's 1200x630 share image.
FOUNDER = {
    # source: (public name, widths)
    "havana-barberia": ("leonardo-gomez-rios-barbero-havana-barberia", (800, 1600)),
    "inicios-cuba": ("leonardo-gomez-rios-inicios-cuba", (640, 1053)),
    "barba": ("leonardo-gomez-rios-barbero", (640, 1200)),
    "secadora-bn": ("leonardo-gomez-rios-moldeado-secadora", (640, 1066)),
    "secadora-cliente": ("leonardo-gomez-rios-moldeado-cliente", (640, 1067)),
    "cubita-productos": ("cubita-productos-capilares-leonardo-gomez-rios", (640, 1200)),
}
print("founder")
# 2023 milestone: the shop today (same photo as /servicios › El lugar, 382x510 original).
Image.open(A / "shop" / "interior-source.jpg").convert("RGB").save(
    PUBLIC / "img" / "havana-barberia-interior-queretaro-382.webp", "WEBP", quality=84, method=6)
(PUBLIC / "img").mkdir(exist_ok=True)
for key, (name, widths) in FOUNDER.items():
    # Black-and-white photos: one channel is lighter.
    im = Image.open(A / "founder" / f"{key}-source.jpg").convert("L" if key in ("inicios-cuba", "secadora-bn") else "RGB")
    for w in widths:
        # The early photo is grainy film: a lower quality keeps it light without visible loss.
        webp(resize_w(im, w), PUBLIC / "img" / f"{name}-{w}.webp", quality=66 if key == "inicios-cuba" else 80)
    if key == "havana-barberia":
        # Header portrait: 4:5 crop centered on Leonardo (the shop's logo on his shirt shows).
        cw = round(im.height * 4 / 5)
        x0 = 1000 - cw // 2
        portrait = im.crop((x0, 0, x0 + cw, im.height))
        for w in (480, 640, 960):
            webp(resize_w(portrait, w), PUBLIC / "img" / f"leonardo-gomez-rios-retrato-havana-barberia-{w}.webp", quality=76)
        # Same photo as JPEG for the structured data (widest support).
        big = resize_w(im, 1600)
        big.save(PUBLIC / "img" / f"{name}-1600.jpg", "JPEG", quality=82, optimize=True, progressive=True)

# --- Video poster (first frame) and a blurred version for the scrolled backdrop ---------
print("video")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(A / "video" / "hero-loop.mp4"), "-vf", "scale=854:480",
                "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-an",
                "-movflags", "+faststart", str(A / "video" / "hero-loop-480.mp4")], check=True)
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
