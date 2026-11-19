"""Normaliza un manifiesto revisado y divide por vehículo físico y duplicados."""
import argparse
import csv
import hashlib
import io
import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

import imagehash
import numpy as np
from PIL import Image, ImageOps
from sklearn.model_selection import GroupShuffleSplit

ROOT = Path(__file__).resolve().parents[2]
SEED_SQL = (ROOT/'database/migrations/016_cotizador_ia.sql').read_text(encoding='utf8')
MODEL_VALUES = SEED_SQL.split('INSERT IGNORE INTO cot_modelos (marca, modelo) VALUES', 1)[1].split(';', 1)[0]
LABELS = sorted(' '.join(pair) for pair in re.findall(r"\('([\w]+)','([\w]+)'\)", MODEL_VALUES))
assert len(set(LABELS)) == len(LABELS) == 30
LICENSES = {'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-3.0', 'CC-BY-SA-3.0', 'CC-BY-2.0', 'CC-BY-SA-2.0', 'PERMISO-ESCRITO'}
UNKNOWN = '__desconocido__'
PRIORITY_MODELS = ('Nissan Sentra','Hyundai Accent','Toyota Yaris')


def read_image(row, folder):
    if row['archivo']:
        raw = (folder / row['archivo']).read_bytes()
    else:
        if not row['descarga'].startswith('https://'):
            raise ValueError('Se requiere archivo local o URL HTTPS autorizada.')
        request = urllib.request.Request(row['descarga'], headers={'User-Agent': 'SIGE-GNV research dataset/1.0'})
        with urllib.request.urlopen(request, timeout=25) as response:
            raw = response.read(20_000_001)
    if len(raw) > 20_000_000:
        raise ValueError('Imagen demasiado grande.')
    with Image.open(io.BytesIO(raw)) as original:
        return ImageOps.exif_transpose(original).convert('RGB')


def split_grouped(rows, seed):
    groups = [r['grupo'] for r in rows]
    best = None
    # Aproxima porcentajes por número de fotografías, preservando grupos enteros.
    for i, (train, rest) in enumerate(GroupShuffleSplit(n_splits=96, test_size=.30, random_state=seed).split(rows, groups=groups)):
        if len({groups[j] for j in rest}) < 2:
            continue
        for val, test in GroupShuffleSplit(n_splits=4, test_size=.5, random_state=seed+i).split(rest, groups=[groups[j] for j in rest]):
            parts = (train, rest[val], rest[test])
            error = sum((len(p)/len(rows)-ratio)**2 for p, ratio in zip(parts, (.70,.15,.15)))
            if best is None or error < best[0]:
                best = (error, parts)
    if best is None:
        raise ValueError('No hay grupos independientes suficientes para dividir.')
    return {part: [rows[j] for j in indices] for part, indices in zip(('train','val','test'),best[1])}


def prepare(manifest, output, minimum, seed, labels=LABELS):
    output.mkdir(parents=True, exist_ok=False)
    (output/'images').mkdir()
    rows, rejected = [], []
    with manifest.open(encoding='utf-8-sig', newline='') as source:
        for line, row in enumerate(csv.DictReader(source), 2):
            if row['modelo'] not in labels:
                continue
            if (row['revisada'] != 'si' or row['licencia'] not in LICENSES
                    or any(not row[k].strip() for k in ('fuente','autor','grupo','generacion','angulo'))):
                raise ValueError(f'Fila {line}: faltan permisos, procedencia, anotaciones o etiqueta revisada.')
            try:
                image = read_image(row, manifest.parent)
                if min(image.size) < 224:
                    raise ValueError('Resolución insuficiente.')
            except (OSError, ValueError) as e:
                rejected.append({'fila':line, 'razon':str(e)})
                continue
            sha = hashlib.sha256(str(image.size).encode()+image.tobytes()).hexdigest()
            image.save(output/'images'/f'{sha}.jpg', 'JPEG', quality=95)
            rows.append((row, sha,
                         int(str(imagehash.phash(image)),16), imagehash.phash(ImageOps.mirror(image))))
    parents = {row['grupo']:row['grupo'] for row, *_ in rows}

    def root(group):
        while parents[group] != group:
            parents[group] = parents[parents[group]]
            group = parents[group]
        return group

    drop = set()
    for i, (r, sha, ph, mirror) in enumerate(rows):
        flipped = int(str(mirror),16)
        for j in range(i):
            prev, old_sha, old_ph, _ = rows[j]
            if sha != old_sha and min((ph ^ old_ph).bit_count(),(flipped ^ old_ph).bit_count()) > 5:
                continue
            if r['modelo'] != prev['modelo']:
                raise ValueError(f'Duplicado con etiquetas incompatibles: {r["fuente"]} / {prev["fuente"]}')
            parents[root(r['grupo'])] = root(prev['grupo'])
            drop.add(i)
    grouped = defaultdict(list)
    group_labels = defaultdict(set)
    for i, (r, sha, _, _) in enumerate(rows):
        group = root(r['grupo'])
        group_labels[group].add(r['modelo'])
        if i in drop:
            rejected.append({'fuente':r['fuente'], 'razon':'duplicado perceptual/exacto'})
            continue
        path = f'images/{sha}.jpg'
        grouped[r['modelo']].append({**r, 'grupo':group, 'path':path})
    for sha in {item[1] for item in rows} - {item[1] for i,item in enumerate(rows) if i not in drop}:
        (output/'images'/f'{sha}.jpg').unlink()
    (output/'rejected.json').write_text(json.dumps(rejected, ensure_ascii=False, indent=2), encoding='utf8')
    partitions = defaultdict(list)
    for label in labels:
        current = grouped[label]
        if len(current) < minimum or len({r['grupo'] for r in current}) < 4:
            raise ValueError(f'{label}: {len(current)} fotos limpias; mínimo {minimum} y cuatro grupos independientes.')
    if any(len(v)>1 for v in group_labels.values()):
        # Mantener al mismo autor en una sola partición, aun con varias clases.
        import random
        rng=random.Random(seed)
        groups=sorted({r['grupo'] for items in grouped.values() for r in items})
        best=None
        for _ in range(1800):
            assignment=dict(zip(groups,rng.choices(('train','val','test'),weights=(70,15,15),k=len(groups))))
            ratios=[[sum(assignment[r['grupo']]==p for r in grouped[l])/len(grouped[l]) for p in ('train','val','test')] for l in labels]
            if any(min(r)<.08 for r in ratios):
                continue
            error=sum((a-b)**2 for r in ratios for a,b in zip(r,(.70,.15,.15)))
            if best is None or error<best[0]: best=(error,assignment)
        if best is None: raise ValueError('No hay una división independiente equilibrada.')
        for items in grouped.values():
            for r in items: partitions[best[1][r['grupo']]].append(r)
    else:
        for label in labels:
            for part, items in split_grouped(grouped[label], seed).items(): partitions[part].extend(items)
    for label in labels:
        print(label, {part:sum(r['modelo']==label for r in items) for part, items in partitions.items()})
    (output/'splits.json').write_text(json.dumps({**partitions, 'labels': labels}, ensure_ascii=False, indent=2), encoding='utf8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--minimo', type=int, default=200)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--labels', nargs='+', choices=LABELS)
    parser.add_argument('--incluir-desconocidos', action='store_true')
    args = parser.parse_args()
    labels = sorted(set(args.labels or LABELS))
    if len(labels) < 2:
        parser.error('Se necesitan al menos dos modelos conocidos.')
    if args.incluir_desconocidos:
        labels.append(UNKNOWN)
    prepare(args.manifest, args.output, args.minimo, args.seed, labels)
