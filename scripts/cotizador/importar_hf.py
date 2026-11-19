"""Extrae candidatos por clase de un snapshot de Hugging Face con atribución individual."""
import argparse
import csv
import hashlib
import io
from collections import Counter
from pathlib import Path
from urllib.parse import quote, urlsplit
from zipfile import ZipFile

from PIL import Image
from remotezip import RemoteZip

from commons import FIELDS
from dataset import LABELS, LICENSES
from openverse_flickr import license_matches

BASE = 'https://huggingface.co/datasets/timdwms/us-car-models-1948-2026/resolve/063a8a846d4797c520447bf29ddf51318a4e792c/images/'


def main(args):
    selected = {}
    counts = Counter()
    with args.metadata.open(encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            label = f"{r['make']} {r['model']}"
            license_id = r['license'].upper()
            if (label not in args.labels or r['filter'] != 'ok' or not r['generation'] or not r['author']
                or license_id not in LICENSES or urlsplit(r['commons_url']).hostname != 'commons.wikimedia.org'
                or urlsplit(r['license_url']).hostname != 'creativecommons.org'
                or not license_matches(license_id,r['license_url'])
                or r['zip'] != f"{r['make']}.zip" or not r['file_name'].startswith(f"{r['make']}/{r['model']}/")):
                continue
            counts[label] += 1
            selected.setdefault(r['zip'], {}).setdefault(label, []).append(r)
    print('Candidatos por clase:', dict(counts), flush=True)
    args.output.mkdir(parents=True, exist_ok=args.reanudar)
    downloaded = Counter()
    sources, hashes = set(), set()
    manifest = args.output/'para_revision.csv'
    for known in [*args.conocidos, *([manifest] if manifest.is_file() else [])]:
        with known.open(encoding='utf-8-sig', newline='') as f:
            for row in csv.DictReader(f):
                if not row.get('archivo'): continue
                sources.add(row['fuente'].rstrip('/'))
                if row.get('sha256'): hashes.add(row['sha256'])
                if known == manifest: downloaded[row['modelo']] += 1
    new_manifest = not manifest.exists() or manifest.stat().st_size == 0
    with manifest.open('a', encoding='utf8', newline='') as f:
        writer = csv.DictWriter(f, FIELDS)
        if new_manifest: writer.writeheader()
        for archive, classes in selected.items():
            if all(downloaded[label]>=args.maximo for label in classes):
                continue
            try:
                with (ZipFile(args.zips/archive) if args.zips else RemoteZip(BASE+quote(archive), timeout=25)) as z:
                    for label, rows in classes.items():
                        # Lectura en orden del archivo para aprovechar el búfer HTTP de RemoteZip.
                        rows = sorted(rows, key=lambda r: z.getinfo(r['file_name']).header_offset)
                        for r in rows:
                            if downloaded[label] >= args.maximo:
                                break
                            source = r['commons_url'].rstrip('/')
                            if source in sources or z.getinfo(r['file_name']).file_size > 20_000_000:
                                continue
                            content = z.read(r['file_name'])
                            sha = hashlib.sha256(content).hexdigest()
                            if sha in hashes:
                                continue
                            with Image.open(io.BytesIO(content)) as photo:
                                if photo.format != 'JPEG' or min(photo.size) < 224:
                                    continue
                                photo.verify()
                            path = Path('fotos')/label/f'{sha}.jpg'
                            (args.output/path).parent.mkdir(parents=True, exist_ok=True)
                            temporary = (args.output/path).with_suffix('.tmp')
                            temporary.write_bytes(content)
                            temporary.replace(args.output/path)
                            writer.writerow(dict(modelo=label,generacion=r['generation'],fuente=r['commons_url'],autor=r['author'],
                                                 licencia=r['license'].upper(),revisada='no',archivo=path.as_posix(),
                                                 licencia_url=r['license_url'],titulo=r['commons_title'],sha256=sha))
                            hashes.add(sha); sources.add(source); downloaded[label] += 1
                            f.flush()
            except Exception as error:
                print(f'{archive}: {type(error).__name__}: {error}', flush=True)
    print('Descargadas, pendientes de curación:', dict(downloaded), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('metadata', type=Path); p.add_argument('output', type=Path)
    p.add_argument('--labels', nargs='+', choices=LABELS, default=LABELS)
    p.add_argument('--maximo', type=int, default=250)
    p.add_argument('--zips', type=Path, help='Usar archivos descargados localmente en lugar de HTTP Range.')
    p.add_argument('--reanudar', action='store_true', help='Continuar un lote existente hasta su límite por clase.')
    p.add_argument('--conocidos', nargs='+', type=Path, default=[], help='Manifiestos para excluir fotos ya registradas.')
    main(p.parse_args())
