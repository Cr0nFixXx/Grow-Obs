#!/usr/bin/env python3
"""Convert the raw PNG screenshots (promo/shots) into the JPEG assets used by scene.html (promo/assets)."""
import glob, os
from PIL import Image

os.makedirs("promo/assets", exist_ok=True)
for f in sorted(glob.glob("promo/shots/*.png")):
    name = os.path.basename(f)[:-4]
    quality = 88 if name.startswith("d-") else 90   # d- = desktop 2880x1800, m- = mobile 1170x2532
    Image.open(f).convert("RGB").save(f"promo/assets/{name}.jpg", quality=quality)
    print("asset", name)
