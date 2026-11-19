"""Reúne descargas, compara procedencia y detecta duplicados exactos/perceptuales."""
import argparse
import csv
import hashlib
import sqlite3
from collections import Counter, defaultdict
from contextlib import closing
from pathlib import Path
from urllib.parse import unquote, urlsplit

import imagehash
from PIL import Image, ImageOps

from commons import FIELDS


def main(inputs, output, cache=None):
    with closing(sqlite3.connect(cache or ':memory:')) as db:
        db.execute('CREATE TABLE IF NOT EXISTS fingerprints (path TEXT, size INTEGER, mtime INTEGER, sha TEXT, ph TEXT, mirror TEXT, PRIMARY KEY(path,size,mtime))')
        scan(inputs,output,db)


def scan(inputs, output, db):
    rows, hashes, sources = [], set(), set()
    stats = Counter()
    index=defaultdict(list)
    def bands(value):
        # Con hasta cinco bits distintos, al menos una de seis bandas coincide.
        return [(i,(value>>shift)&mask) for i,(shift,mask) in enumerate(zip((0,11,22,33,44,55),(2047,2047,2047,2047,2047,511)))]
    for manifest in inputs:
        with manifest.open(encoding='utf-8-sig', newline='') as f:
            for row in csv.DictReader(f):
                if not row['archivo']:
                    continue
                path = (manifest.parent / row['archivo']).resolve()
                url=urlsplit(row['fuente']); source=(url.hostname,unquote(url.path).rstrip('/').replace(' ', '_'))
                try:
                    stat=path.stat(); key=(str(path),stat.st_size,stat.st_mtime_ns)
                    cached=db.execute('SELECT sha,ph,mirror FROM fingerprints WHERE path=? AND size=? AND mtime=?',key).fetchone()
                    if cached is None:
                        digest=hashlib.sha256(path.read_bytes()).hexdigest()
                        with Image.open(path) as original:
                            image=ImageOps.exif_transpose(original).convert('RGB')
                            cached=(digest,str(imagehash.phash(image)),str(imagehash.phash(ImageOps.mirror(image))))
                        db.execute('INSERT OR REPLACE INTO fingerprints VALUES (?,?,?,?,?,?)',(*key,*cached)); db.commit()
                    digest,ph,mirror=cached; ph,mirror=int(ph,16),int(mirror,16)
                except (OSError,ValueError,Image.DecompressionBombError) as err:
                    stats[(row['modelo'],'ilegible')]+=1; print('Archivo omitido:',path,err); continue
                ids={i for b in (*bands(ph),*bands(mirror)) for i in index[b]}
                near=[rows[i][1] for i in ids if min((ph^rows[i][0]).bit_count(),(mirror^rows[i][0]).bit_count())<=5]
                if source in sources or digest in hashes or near:
                    stats[(row['modelo'],'duplicada')] += 1
                    if any(p['modelo'] != row['modelo'] for p in near):
                        print('Revisar conflicto de etiqueta:', row['fuente'])
                    continue
                hashes.add(digest); sources.add(source)
                row.update(archivo=str(path), revisada='no', sha256=digest, phash=f'{ph:016x}')
                for band in bands(ph): index[band].append(len(rows))
                rows.append((ph,row)); stats[(row['modelo'],'única')] += 1
    with output.open('x',encoding='utf8',newline='') as f:
        writer=csv.DictWriter(f,FIELDS,extrasaction='ignore'); writer.writeheader()
        writer.writerows(r for _,r in rows)
    for (model,status),count in sorted(stats.items()):
        print(f'{model} · {status}: {count}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('inputs', nargs='+', type=Path)
    parser.add_argument('--cache',type=Path)
    args = parser.parse_args()
    main(args.inputs,args.output,args.cache)
