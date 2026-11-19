"""Descarga candidatos de Commons con licencia individual; no certifica etiquetas."""
import argparse
import csv
import hashlib
import html
import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from PIL import Image, ImageOps
import imagehash
from dataset import LABELS, LICENSES
import io

HEADER = {'User-Agent': 'SIGE-GNV dataset research/1.0 (Python urllib; Wikimedia Commons image reuse)'}
FIELDS = 'modelo generacion angulo grupo fuente autor licencia revisada archivo descarga licencia_url titulo sha256 phash'.split()
EXCLUDE = re.compile(r'\b(interior|dashboard|engine|instrument|gauge|brochure|logo|wheel|toy|diecast|miniature|prototype|concept|cross|gr corolla|yaris gr|gr yaris|super carry)\b', re.I)
ALIASES = {'Nissan Bluebird': ['Datsun Bluebird'], 'Nissan Sunny':['Datsun Sunny'], 'Nissan Caravan':['Nissan NV350 Caravan']}


def fetch(url, limit):
    with urlopen(Request(url, headers=HEADER), timeout=16) as r:
        data = r.read(limit+1)
        if len(data) > limit:
            raise ValueError('Límite de descarga superado')
        return data


def clean(text):
    return html.unescape(re.sub(r'<[^>]*>', '', text)).strip()


def candidates(label, cap):
    rows, errors = [], []
    for alias in [label, *ALIASES.get(label, [])]:
        continuation = {}
        seen = set()
        while len(rows) < cap:
            params = dict(action='query', generator='search', gsrnamespace=6, gsrlimit=50,
                          gsrsearch=f'intitle:"{alias}" filetype:bitmap', prop='imageinfo',
                          iiprop='url|sha1|extmetadata', iiurlwidth=500, iiextmetadatafilter='LicenseShortName|LicenseUrl|Artist|Restrictions',
                          format='json', formatversion=2, **continuation)
            data = json.loads(fetch('https://commons.wikimedia.org/w/api.php?'+urlencode(params), 4_000_000))
            if 'error' in data:
                raise ValueError(data['error'])
            for page in sorted(data.get('query', {}).get('pages', []), key=lambda p:p.get('index',0)):
                title = page['title']
                if page['pageid'] in seen or EXCLUDE.search(title.replace('_',' ')) or not re.search(rf'\b{re.escape(alias)}\b',title.replace('_',' '), re.I):
                    continue
                seen.add(page['pageid'])
                info = page.get('imageinfo', [{}])[0]
                meta = info.get('extmetadata', {})
                val = lambda k: str(meta.get(k,{}).get('value',''))
                license_id = val('LicenseShortName').replace(' ', '-')
                author = clean(val('Artist'))
                url = info.get('thumburl',info.get('url','')).split('?')[0]
                if (license_id not in LICENSES or not val('LicenseUrl') or not author or val('Restrictions') or
                        urlsplit(url).hostname != 'upload.wikimedia.org'):
                    continue
                rows.append(dict(modelo=label, fuente=info['descriptionurl'], autor=author,
                                 licencia=license_id, licencia_url=val('LicenseUrl'), revisada='no', descarga=url,
                                 titulo=title, pageid=page['pageid']))
                if len(rows) == cap:
                    break
            continuation = data.get('continue', {})
            if not continuation:
                break
            time.sleep(.3)
    return rows, errors


def download(row):
    try:
        raw = fetch(row['descarga'], 18_000_000)
        with Image.open(io.BytesIO(raw)) as source:
            photo = ImageOps.exif_transpose(source).convert('RGB')
            if min(photo.size) < 224:
                raise ValueError('Resolución insuficiente')
            photo.thumbnail((1280,1280))
            encoded = io.BytesIO()
            photo.save(encoded,'JPEG',quality=90)
            row['sha256'] = hashlib.sha256(raw).hexdigest()
            row['phash'] = str(imagehash.phash(photo))
            return row, encoded.getvalue(), None
    except HTTPError as error:
        return row, None, error
    except (OSError, ValueError) as error:
        return row, None, str(error)


def main(args):
    args.output.mkdir(parents=True, exist_ok=False)
    errors, queue = [], []
    for label in args.labels:
        try:
            rows, _ = candidates(label,args.maximo)
            queue.extend(rows)
            print(label, len(rows), flush=True)
        except (OSError,ValueError) as e:
            errors.append({'modelo':label,'error':str(e)})
            if isinstance(e, HTTPError) and e.code == 429:
                break
        time.sleep(1)
    counts = {label:{'candidatos':0,'descargadas':0,'duplicadas':0,'verificadas':0} for label in LABELS}
    hashes, accepted = [], []
    with (args.output/'candidatos.csv').open('w',encoding='utf8',newline='') as f:
        writer = csv.DictWriter(f, FIELDS, extrasaction='ignore'); writer.writeheader()
        limited = False
        for row in queue:
            stats = counts[row['modelo']]; stats['candidatos'] += 1
            if limited:
                writer.writerow(row); continue
            row, content, error = download(row)
            time.sleep(1)
            if error:
                limited = isinstance(error, HTTPError) and error.code == 429
                errors.append({'modelo':row['modelo'],'fuente':row['fuente'],'error':str(error)})
                writer.writerow(row); continue
            ph = int(row['phash'],16)
            duplicates = [(label,sha) for label,sha,h in hashes if row['sha256']==sha or (ph^h).bit_count()<=5]
            if duplicates:
                stats['duplicadas'] += 1
                if any(label != row['modelo'] for label,_ in duplicates):
                    errors.append({'modelo':row['modelo'],'fuente':row['fuente'],'error':'Duplicado con etiqueta distinta; revisión necesaria'})
                writer.writerow(row); continue
            hashes.append((row['modelo'],row['sha256'],ph))
            path = Path('fotos')/row['modelo']/f"{row['pageid']}.jpg"
            (args.output/path).parent.mkdir(parents=True,exist_ok=True)
            (args.output/path).write_bytes(content)
            row['archivo'] = path.as_posix()
            writer.writerow(row); accepted.append(row); stats['descargadas'] += 1
    with (args.output/'para_revision.csv').open('w',encoding='utf8',newline='') as f:
        writer = csv.DictWriter(f,FIELDS,extrasaction='ignore'); writer.writeheader(); writer.writerows(accepted)
    (args.output/'recoleccion.json').write_text(json.dumps({'por_modelo':counts,'errores':errors},ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(counts,ensure_ascii=False),flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--maximo', type=int, default=250)
    parser.add_argument('--labels', nargs='+', choices=LABELS, default=LABELS)
    main(parser.parse_args())
