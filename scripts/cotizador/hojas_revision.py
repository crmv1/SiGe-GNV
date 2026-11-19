"""Crea hojas numeradas y un índice reproducible para inspección visual."""
import argparse
import csv
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--labels', nargs='+', required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with args.manifest.open(encoding='utf-8-sig', newline='') as source:
        rows = list(csv.DictReader(source))
    for label in args.labels:
        items = [r for r in rows if r['modelo'] == label and r['archivo']]
        stem = label.replace(' ', '_')
        with (args.output/f'{stem}.csv').open('w',encoding='utf8',newline='') as output:
            writer = csv.DictWriter(output,['n',*rows[0]])
            writer.writeheader()
            writer.writerows({'n':i,**r} for i,r in enumerate(items,1))
        for start in range(0,len(items),60):
            sheet = Image.new('RGB',(1200, 990),'white')
            draw = ImageDraw.Draw(sheet)
            for i,r in enumerate(items[start:start+60]):
                x,y = i%6*200,i//6*99
                with Image.open(args.manifest.parent/r['archivo']) as src:
                    im = ImageOps.contain(ImageOps.exif_transpose(src).convert('RGB'), (195,80))
                    sheet.paste(im,(x+(195-im.width)//2,y))
                draw.text((x+4,y+81),str(start+i+1),fill='black')
            sheet.save(args.output/f'{stem}-{start//60+1}.jpg',quality=90)
