"""Importa un lote local autorizado. Conserva originales y genera un manifiesto revisable."""
import argparse
import csv
import hashlib
import io
from pathlib import Path

from PIL import Image, ImageOps

from commons import FIELDS
from dataset import LABELS, LICENSES, UNKNOWN


def importar(args):
    root = args.origen.resolve(strict=True)
    args.destino.mkdir(parents=True, exist_ok=False)
    seen = set()
    accepted = rejected = 0
    with args.csv.open(encoding='utf-8-sig', newline='') as src, \
         (args.destino/'para_revision.csv').open('w', encoding='utf-8-sig',newline='') as manifest, \
         (args.destino/'rechazadas.csv').open('w',encoding='utf-8-sig',newline='') as errors:
        writer = csv.DictWriter(manifest,FIELDS); writer.writeheader()
        rejects = csv.writer(errors); rejects.writerow(['fila','archivo','motivo'])
        for n,r in enumerate(csv.DictReader(src),2):
            try:
                values = {key:(r.get(key) or '').strip() for key in FIELDS}
                model = values['modelo']
                if model not in [*LABELS,UNKNOWN] or values['licencia'] not in LICENSES:
                    raise ValueError('Clase o licencia no admitida')
                if any(not values[key] for key in ('autor','fuente','grupo','generacion','angulo')):
                    raise ValueError('Completar autor, fuente del permiso, grupo, generación y ángulo')
                path = (root/values['archivo']).resolve(strict=True)
                if not path.is_relative_to(root) or not path.is_file() or path.stat().st_size > 20_000_000:
                    raise ValueError('Archivo fuera del lote o de más de 20 MB')
                content = path.read_bytes()
                with Image.open(io.BytesIO(content)) as image:
                    ext = {'JPEG':'jpg','PNG':'png','WEBP':'webp'}.get(image.format)
                    if not ext or min(image.size)<224 or image.width*image.height>45_000_000:
                        raise ValueError('Solo JPEG/PNG/WebP de 224 px o más y hasta 45 megapíxeles')
                    image.verify()
                with Image.open(io.BytesIO(content)) as image:
                    pixels=ImageOps.exif_transpose(image).convert('RGB')
                identity = hashlib.sha256(str(pixels.size).encode()+pixels.tobytes()).hexdigest()
                if identity in seen:
                    raise ValueError('Duplicado exacto dentro del lote')
                dest=Path('fotos')/model/f'{identity}.{ext}'
                (args.destino/dest).parent.mkdir(parents=True,exist_ok=True)
                (args.destino/dest).write_bytes(content)
                seen.add(identity)
                values.update(archivo=dest.as_posix(),sha256=hashlib.sha256(content).hexdigest(),revisada='no')
                writer.writerow(values); accepted+=1
            except (ValueError,OSError,Image.DecompressionBombError) as error:
                rejects.writerow([n,r.get('archivo',''),str(error)]); rejected+=1
    print(f'Importadas: {accepted}; rechazadas: {rejected}. Revisar para_revision.csv.')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('origen',type=Path); p.add_argument('csv',type=Path); p.add_argument('destino',type=Path)
    importar(p.parse_args())
