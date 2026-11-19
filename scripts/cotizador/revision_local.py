"""Preauditoría reproducible y hojas locales de revisión por modelo."""
import argparse
import csv
import json
import re
import sqlite3
import unicodedata
from collections import Counter
from pathlib import Path

from PIL import Image, ImageOps, ImageFilter, ImageStat

from commons import EXCLUDE
from dataset import LABELS, LICENSES
from openverse_flickr import CODES, JAPANESE, license_matches


def normalize(value):
    return ' '.join(re.sub(r'[^\w]+',' ',unicodedata.normalize('NFKC',value).casefold()).split())


def audit(inputs, output, clip=None, siglip=None):
    output.mkdir(parents=True,exist_ok=True)
    rows=[]
    for manifest in inputs:
        with manifest.open(encoding='utf-8-sig',newline='') as f:
            rows.extend((manifest.parent,r) for r in csv.DictReader(f))
    def load(path):
        results={}
        if not path or not path.is_file(): return results
        with sqlite3.connect(path) as db:
            if db.execute("SELECT 1 FROM sqlite_master WHERE name='triage'").fetchone():
                for key,guess,top in db.execute('SELECT key,sugerencia,top FROM triage'):
                    _,digest,model=key.split(':',2)
                    results[digest,model]=(guess,top)
        return results
    triage=load(clip); sig=load(siglip)
    counts=Counter(); by_model={m:[] for m in LABELS}; seen=set()
    for parent,r in rows:
        label=r.get('modelo')
        if label not in by_model or not r.get('archivo'): continue
        key=(label,r.get('sha256') or r.get('fuente'))
        if key in seen: continue
        seen.add(key)
        path=(parent/r['archivo']).resolve(); title=r.get('titulo') or ''
        flags=[]; broken=False
        if r.get('licencia') not in LICENSES or not r.get('fuente') or not r.get('autor'): flags.append('procedencia incompleta')
        if r.get('licencia')!='PERMISO-ESCRITO' and not license_matches(r.get('licencia',''),r.get('licencia_url','')): flags.append('licencia y enlace no coinciden')
        normalized=normalize(title)
        hints=[normalize(label),normalize(JAPANESE[label]),*(normalize(c) for c in CODES.get(label,'').split())]
        if not any(re.search(rf'\b{re.escape(h)}\b',normalized) for h in hints if h): flags.append('título no confirma etiqueta')
        if any(other!=label and re.search(rf'\b{re.escape(normalize(other))}\b',normalized) for other in LABELS): flags.append('otro modelo en título')
        if EXCLUDE.search(title.replace('_',' ')): flags.append('posible interior, pieza o versión distinta')
        guess,top=triage.get((r.get('sha256'),label),('',''))
        if guess and guess!=label: flags.append('CLIP sugiere otra etiqueta')
        sig_guess,sig_top=sig.get((r.get('sha256'),label),('',''))
        if sig_guess and sig_guess!=label: flags.append('SigLIP sugiere otra etiqueta')
        try:
            with Image.open(path) as im:
                if min(im.size)<224: flags.append('resolución insuficiente')
                image=ImageOps.contain(ImageOps.exif_transpose(im).convert('L'),(320,320))
                edges=image.filter(ImageFilter.FIND_EDGES)
                if ImageStat.Stat(edges.crop((2,2,edges.width-2,edges.height-2))).stddev[0]<13: flags.append('poco detalle o desenfoque')
        except (OSError,ValueError,Image.DecompressionBombError):
            flags.append('archivo ilegible'); broken=True
        state='ilegible' if broken else 'priorizar revisión' if flags else 'pendiente'
        counts[(label,state)]+=1
        by_model[label].append(dict(r,archivo=str(path),preauditoria=state,observaciones='; '.join(flags),clip_top=top,siglip_top=sig_top))
    # Un CSV por clase para completar grupo, generación, ángulo y decisión en paralelo.
    for label,items in by_model.items():
        if not items: continue
        with (output/(label.replace(' ','_')+'.csv')).open('w',encoding='utf-8-sig',newline='') as f:
            fields=list(items[0]); writer=csv.DictWriter(f,fields,extrasaction='ignore'); writer.writeheader()
            writer.writerows(sorted(items,key=lambda r:r['preauditoria']=='pendiente'))
    summary={m:{s:counts[m,s] for s in ('pendiente','priorizar revisión','ilegible')} for m in LABELS}
    (output/'auditoria.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
    print(dict(Counter({s:sum(v[s] for v in summary.values()) for s in next(iter(summary.values()))})))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destino',type=Path); parser.add_argument('manifiestos',type=Path,nargs='+')
    parser.add_argument('--clip',type=Path)
    parser.add_argument('--siglip',type=Path)
    args=parser.parse_args(); audit(args.manifiestos,args.destino,args.clip,args.siglip)
