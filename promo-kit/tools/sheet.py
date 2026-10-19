# Contact sheet of stills:  python3 tools/sheet.py out.jpg img1.jpg img2.jpg ...   (2 columns, 960 px per tile)
import sys
from PIL import Image
out, files = sys.argv[1], sys.argv[2:]
ims = [Image.open(f).convert("RGB") for f in files]
W = 960; cols = 2 if len(ims) > 1 else 1
tiles = [im.resize((W, round(im.height * W / im.width))) for im in ims]
rh = max(t.height for t in tiles); rows = (len(tiles) + cols - 1) // cols
sheet = Image.new("RGB", (cols * W, rows * rh))
for i, t in enumerate(tiles): sheet.paste(t, ((i % cols) * W, (i // cols) * rh))
sheet.save(out, quality=80)
