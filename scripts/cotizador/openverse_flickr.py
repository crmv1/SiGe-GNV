"""Recoge candidatos de fuentes autorizadas mediante el índice abierto de Openverse."""
import argparse
import csv
import hashlib
import io
import json
import time
from collections import Counter
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit

from PIL import Image
from commons import FIELDS, fetch
from dataset import LICENSES, LABELS

QUERIES = {
    'Nissan Sentra': ['Nissan Sentra','Nissan Sentra B17','Nissan Sentra B18','Nissan Sentra Bolivia'],
    'Hyundai Accent': ['Hyundai Accent','Hyundai Accent RB','Hyundai Accent HC','Hyundai Accent Bolivia'],
    'Toyota Yaris': ['Toyota Yaris','Toyota Yaris XP90','Toyota Yaris XP130','Toyota Yaris Bolivia'],
    'Nissan Sunny': ['Nissan Sunny', '日産 サニー B15', 'Nissan Sunny Bolivia'],
    'Toyota Hiace': ['Toyota Hiace', 'ハイエース H100', 'Toyota Hiace minibús Bolivia'],
    'Toyota Probox': ['Toyota Probox', 'プロボックス NCP51', 'Toyota Probox taxi Perú'],
    'Toyota Noah': ['Toyota Noah', 'トヨタ ノア AZR60', 'Toyota Noah Bolivia'],
    'Nissan AD': ['Nissan AD Van', '日産 ADバン Y11', 'Nissan AD Bolivia'],
    'Suzuki Carry': ['Suzuki Carry', 'スズキ キャリイ DA63T', 'Suzuki Carry Bolivia'],
    'Nissan Caravan': ['Nissan Caravan', '日産 キャラバン E25', 'Nissan Caravan minibús Bolivia'],
    'Toyota Ipsum': ['Toyota Ipsum', 'イプサム ACM21', 'Toyota Ipsum Bolivia'],
    'Toyota Caldina': ['Toyota Caldina', 'カルディナ ST215', 'Toyota Caldina Bolivia'],
    'Toyota Succeed': ['Toyota Succeed', 'サクシード NCP51', 'Toyota Succeed Perú'],
    'Toyota Voxy': ['Toyota Voxy', 'ヴォクシー AZR60', 'Toyota Voxy Bolivia'],
}
JAPANESE = dict(zip(sorted(LABELS), '''アクセント ポーター ファミリア デリカ ADバン ブルーバード キャラバン マーチ セントラ サニー ティーダ ウイングロード APV アルト キャリイ スイフト カルディナ カローラ ハイエース イプサム ノア プロボックス RAV4 スターレット サクシード ターセル ヴィッツ ヴォクシー ウィッシュ ヤリス'''.split(), strict=True))
CODES = {'Nissan Sunny':'FB15 B13 B14', 'Toyota Hiace':'H100 H200', 'Toyota Probox':'NCP51 NSP160',
         'Toyota Noah':'AZR60 ZRR70', 'Nissan AD':'Y10 Y11 Y12', 'Suzuki Carry':'DA63T DD51T',
         'Nissan Caravan':'E24 E25 E26', 'Toyota Ipsum':'ACM21 SXM10', 'Toyota Caldina':'ST195 ST215 ST246',
         'Toyota Succeed':'NCP51 NCP160', 'Toyota Voxy':'AZR60 ZRR70'}


def original(url):
    raw=fetch(url,20_000_000)
    with Image.open(io.BytesIO(raw)) as photo:
        ext={'JPEG':'jpg','PNG':'png','WEBP':'webp'}.get(photo.format)
        if not ext or min(photo.size)<224 or photo.width*photo.height>45_000_000:
            raise ValueError('Formato o resolución fuera del criterio')
        photo.verify()
    return raw,ext,hashlib.sha256(raw).hexdigest()


def collect(out, limit, page, resume=False, all_models=False, sweep=False, known=(), provider='flickr', priority=False, selected=()):
    out.mkdir(parents=True, exist_ok=resume)
    seen, hashes, counts, errors = set(), set(), Counter(), []
    manifest=out/'para_revision.csv'
    checkpoint=out/'estado.json'
    config=[limit,page,all_models]+(['sweep-v1'] if sweep else [])+([provider] if provider!='flickr' else [])
    state=json.loads(checkpoint.read_text(encoding='utf8')) if checkpoint.exists() else {'config':config,'done':[],'retry_at':0}
    if state['config'] != config: raise ValueError('Reanuda con los mismos parámetros.')
    if state['retry_at'] > time.time():
        print('Fuente en espera hasta', time.ctime(state['retry_at'])); return state['retry_at']
    def save():
        tmp=checkpoint.with_suffix('.tmp')
        tmp.write_text(json.dumps(state,ensure_ascii=False),encoding='utf8'); tmp.replace(checkpoint)
    def pause(error):
        delay=error.headers.get('Retry-After','')
        from email.utils import parsedate_to_datetime
        try: retry=time.time()+int(delay) if delay.isdigit() else parsedate_to_datetime(delay).timestamp()
        except (ValueError,TypeError): retry=time.time()+900
        state['retry_at']=max(time.time()+60,retry); save()
        print('HTTP 429; reanudar después de',time.ctime(state['retry_at']),flush=True)
    exists=manifest.exists()
    coverage=Counter()
    for catalog in known:
        with catalog.open(encoding='utf-8-sig',newline='') as f:
            for row in csv.DictReader(f):
                if row.get('archivo'):
                    coverage[row['modelo']]+=1
                    seen.add(row.get('fuente','').rstrip('/'))
                    if row.get('sha256'): hashes.add(row['sha256'])
    if exists:
        with manifest.open(encoding='utf8',newline='') as f:
            for row in csv.DictReader(f):
                seen.add(row['fuente'].rstrip('/')); hashes.add(row['sha256']); counts[row['modelo']]+=1
    save()
    queries_by_model={**QUERIES,**({m:[m,f'{m} Cochabamba',f'{m} taxi Bolivia'] for m in LABELS if m not in QUERIES} if all_models else {})}
    if sweep:
        queries_by_model={m:list(dict.fromkeys([*queries,JAPANESE[m],f'{m} Cochabamba',f'{m} taxi Perú',
            *(f'{m} {code}' for code in CODES.get(m,'').split()),*(f'{m} {y}' for y in (1995,2000,2005,2010,2015))])) for m,queries in queries_by_model.items()}
    if selected:
        queries_by_model={model:queries_by_model.get(model,[model]) for model in selected}
    with manifest.open('a',encoding='utf8',newline='') as stream:
        writer=csv.DictWriter(stream,FIELDS)
        if not exists: writer.writeheader(); stream.flush()
        models=sorted(queries_by_model,key=lambda m:coverage[m]+counts[m]) if priority else queries_by_model
        for label in models:
            queries=queries_by_model[label]
            from collections import deque
            pending=deque((q,state.get('pages',{}).get(q,page)) for q in queries if q not in state['done'])
            while pending:
                query,current=pending.popleft()
                url='https://api.openverse.org/v1/images/?'+urlencode(dict(q=query,source=provider,license='by,by-sa,cc0',page_size=limit,page=current))
                try:
                    result=json.loads(fetch(url,1_000_000)); items=result.get('results',[])
                except (OSError,ValueError) as e:
                    errors.append([query,str(e)])
                    if isinstance(e,HTTPError) and e.code==429:
                        pause(e)
                        (out/'recoleccion.json').write_text(json.dumps(dict(por_modelo=dict(counts),errores=errors),ensure_ascii=False,indent=2),encoding='utf8')
                        return state['retry_at']
                    continue
                retry_query=False
                for item in items:
                    lid=('CC-'+str(item.get('license'))+'-'+str(item.get('license_version'))).upper().replace('CC-CC0','CC0')
                    source=(item.get('foreign_landing_url') or '').rstrip('/')
                    image=item.get('url') or ''
                    terms=item.get('license_url') or ''
                    source_hosts={'flickr':{'www.flickr.com','flickr.com'},'wikimedia':{'commons.wikimedia.org'},
                                  'wordpress':{'wordpress.org'}}[provider]
                    image_host=urlsplit(image).hostname or ''
                    allowed_image=(image_host.endswith('.staticflickr.com') if provider=='flickr'
                                   else image_host=={'wikimedia':'upload.wikimedia.org','wordpress':'pd.w.org'}[provider])
                    if (item.get('source')!=provider or lid not in LICENSES or not item.get('creator') or item.get('mature')
                        or (provider=='wordpress' and (lid!='CC0-1.0' or not urlsplit(source).path.startswith('/photos/photo/')))
                        or urlsplit(source).hostname not in source_hosts or source in seen
                        or urlsplit(image).scheme!='https' or not allowed_image or not license_matches(lid,terms)):
                        continue
                    row=dict(modelo=label,autor=item['creator'],fuente=source,licencia=lid,licencia_url=terms,
                             titulo=item.get('title'),descarga=image,revisada='no')
                    try: content,ext,row['sha256']=original(image)
                    except (OSError,ValueError,Image.DecompressionBombError) as error:
                        errors.append([source,str(error)])
                        if getattr(error,'code',0)==429:
                            pause(error); return state['retry_at']
                        retry_query |= isinstance(error,OSError) and getattr(error,'code',0) not in (403,404,410)
                        continue
                    if content and row['sha256'] not in hashes:
                        hashes.add(row['sha256'])
                        filename=Path('fotos')/label/f"{row['sha256']}.{ext}"
                        (out/filename).parent.mkdir(parents=True,exist_ok=True)
                        (out/filename).write_bytes(content)
                        row['archivo']=filename.as_posix(); writer.writerow(row); stream.flush(); counts[label]+=1
                        seen.add(source)
                if not retry_query:
                    if sweep and items and current < result.get('page_count',current):
                        state.setdefault('pages',{})[query]=current+1
                        pending.append((query,current+1))
                    else: state['done'].append(query)
                    save()
                time.sleep(1)
            print(label,counts[label],flush=True)
    (out/'recoleccion.json').write_text(json.dumps(dict(por_modelo=dict(counts),errores=errors),ensure_ascii=False,indent=2),encoding='utf8')


def license_matches(label, url):
    parts=urlsplit(url)
    if parts.scheme not in ('http','https') or parts.hostname!='creativecommons.org': return False
    if label=='CC0-1.0': return parts.path.rstrip('/')=='/publicdomain/zero/1.0'
    tokens=label.lower().split('-')
    return label in LICENSES and tokens[0]=='cc' and parts.path.rstrip('/')==f"/licenses/{'-'.join(tokens[1:-1])}/{tokens[-1]}"


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('destino',type=Path); p.add_argument('--por-consulta',type=int,choices=range(1,21),default=12)
    p.add_argument('--pagina',type=int,choices=range(1,21),default=1)
    p.add_argument('--reanudar',action='store_true'); p.add_argument('--todos',action='store_true')
    p.add_argument('--barrido',action='store_true',help='Recorre automáticamente todas las páginas disponibles por consulta.')
    p.add_argument('--continuo',action='store_true',help='Espera límites HTTP 429 y reanuda en el mismo proceso.')
    p.add_argument('--conocidos',type=Path,nargs='+',default=[])
    p.add_argument('--fuente',choices=('flickr','wikimedia','wordpress'),default='flickr')
    p.add_argument('--modelos',nargs='+',choices=LABELS)
    p.add_argument('--prioridad',action='store_true')
    args=p.parse_args()
    while True:
        retry=collect(args.destino,args.por_consulta,args.pagina,args.reanudar,args.todos,args.barrido,args.conocidos,args.fuente,args.prioridad,args.modelos)
        if not args.continuo or retry is None: break
        time.sleep(max(1,retry-time.time()+1)); args.reanudar=True
