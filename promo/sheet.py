import sys, pathlib
HERE=pathlib.Path(__file__).resolve().parent
# usage: python3 promo/sheet.py out.jpg 1,5.5,12   (run `node promo/preview.mjs 1,5.5,12` first)
from PIL import Image
ts=sys.argv[2].split(",")
cols=2;W,H=960,540
rows=(len(ts)+1)//2
sheet=Image.new("RGB",(cols*W,rows*H))
for i,t in enumerate(ts):
    n="t"+t.replace(".","_")
    im=Image.open(HERE/"test"/f"{n}.jpg").resize((W,H)); sheet.paste(im,((i%cols)*W,(i//cols)*H))
sheet.save(sys.argv[1],quality=80)
