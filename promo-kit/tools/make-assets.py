# Converts the captured PNGs ($PM/assets) to JPGs in ../screenshots/{mobile,desktop} (desktop resized to 2160 px wide) and builds
# the chat helper images (blank chat frame + 5 message bubbles that the scene pops in one by one).
import os, glob
from PIL import Image, ImageDraw
import numpy as np
PM = os.environ.get("PM", os.path.expanduser("~/.cache/pm"))
KIT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = f"{PM}/assets/"                      # raw PNGs written by capture.mjs
OUT = os.environ.get("SHOTS", f"{KIT}/screenshots")
MOB, DESK, PARTS = f"{OUT}/mobile/", f"{OUT}/desktop/", f"{OUT}/parts/"
for d in (MOB, DESK, PARTS): os.makedirs(d, exist_ok=True)
for f in sorted(glob.glob(SRC + "*.png")):
    n = os.path.basename(f)[:-4]; im = Image.open(f).convert("RGB")
    if n.startswith("d-"):
        im.resize((2160, 1350), Image.LANCZOS).save(DESK + n + ".jpg", quality=88, optimize=True)
    else:
        im.save(MOB + n + ".jpg", quality=90, optimize=True)
im = Image.open(MOB + "chat-f.jpg").convert("RGB"); a = np.array(im).astype(int); b = a.copy()
for y in range(405, 1150):
    b[y, 40:745] = a[y, 48:56].mean(axis=0)
Image.fromarray(b.astype("uint8")).save(PARTS + "chat-blank-f.jpg", quality=92)
boxes = [(60, 418, 470, 524), (203, 538, 719, 688), (60, 687, 370, 806), (203, 820, 719, 968), (60, 978, 516, 1088)]
S = 4
for k, (x0, y0, x1, y1) in enumerate(boxes):
    w, h = x1 - x0, y1 - y0
    m = Image.new("L", (w * S, h * S), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * S - 1, h * S - 1), radius=46 * S, fill=255)
    c = im.crop((x0, y0, x1, y1)).convert("RGBA"); c.putalpha(m.resize((w, h), Image.LANCZOS)); c.save(PARTS + f"chat-m{k}.png")
print("assets ready in", OUT)
