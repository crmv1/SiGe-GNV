"""Ordena la revisión mediante CLIP local; jamás aprueba o cambia etiquetas."""
import argparse
import csv
import json
import re
import sqlite3
from collections import Counter
import numpy as np
from pathlib import Path

from PIL import Image, ImageOps
from dataset import LABELS, PRIORITY_MODELS

MODEL='laion/CLIP-ViT-B-32-laion2B-s34B-b79K'
REV='1a25a446712ba5ee05982a381eed697ef9b435cf'
NEGATIVES=['a miniature toy car', 'a vehicle engine or mechanical part', 'a car interior', 'a street without a visible vehicle']


def run(manifest, db, limit, engine):
    import torch
    from transformers import AutoModel, AutoProcessor
    model,rev=(MODEL,REV) if engine=='clip' else ('google/siglip-base-patch16-224','7fd15f0689c79d79e38b1c2e2e2370a7bf2761ed')
    torch.set_num_threads(3)
    with sqlite3.connect(db) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS triage (key TEXT PRIMARY KEY, archivo TEXT, modelo TEXT, sugerencia TEXT, score REAL, top TEXT)')
        conn.execute('CREATE TABLE IF NOT EXISTS vectores (key TEXT PRIMARY KEY, vector BLOB NOT NULL)')
        conn.execute('CREATE TABLE IF NOT EXISTS ilegibles (key TEXT PRIMARY KEY, archivo TEXT NOT NULL)')
        seen={r[0] for r in conn.execute('SELECT key FROM triage INNER JOIN vectores USING (key)')}
        unreadable=set(conn.execute('SELECT key,archivo FROM ilegibles'))
        with manifest.open(encoding='utf-8-sig', newline='') as source:
            work=[]
            candidates=list(csv.DictReader(source))
            coverage=Counter(r['modelo'] for r in candidates)
            for r in sorted(candidates,key=lambda row:(row['modelo'] not in PRIORITY_MODELS,coverage[row['modelo']])):
                if limit and len(work)>=limit: break
                if not r.get('archivo') or not re.fullmatch('[0-9a-f]{64}',r.get('sha256','')): continue
                key=f'{rev}:{r["sha256"]}:{r["modelo"]}'
                if key not in seen and (key,r['archivo']) not in unreadable:
                    work.append((key,r)); seen.add(key)
        if not work: return
        processor=AutoProcessor.from_pretrained(model, revision=rev)
        net=AutoModel.from_pretrained(model,revision=rev,use_safetensors=True).eval()
        texts=[f'a photo of a full-size {label} vehicle' for label in LABELS]+NEGATIVES
        names=LABELS+NEGATIVES
        padding='max_length' if engine=='siglip' else True
        with torch.inference_mode():
            text_features=net.get_text_features(**processor(text=texts,return_tensors='pt',padding=padding))
            text_features=torch.nn.functional.normalize(text_features)
            scale=net.logit_scale.exp()
            bias=net.logit_bias if engine=='siglip' else 0
        for offset in range(0,len(work),8):
            batch,images,failures=[],[],[]
            for key,row in work[offset:offset+8]:
                try:
                    with Image.open(manifest.parent/row['archivo']) as photo:
                        images.append(ImageOps.exif_transpose(photo).convert('RGB'))
                    batch.append((key,row))
                except (FileNotFoundError,PermissionError): continue
                except (OSError,ValueError,Image.DecompressionBombError):
                    failures.append((key,row['archivo']))
            if failures:
                conn.executemany('INSERT OR REPLACE INTO ilegibles VALUES (?,?)',failures)
                conn.commit()
            if not images: continue
            with torch.inference_mode():
                image_features=net.get_image_features(**processor(images=images,return_tensors='pt'))
                image_features=torch.nn.functional.normalize(image_features)
                logits=(text_features@image_features.T).T*scale+bias
                rankings=logits.topk(3)
                vectors=torch.nn.functional.normalize(image_features.float()).cpu().numpy()
            records=[]
            for (key,row),scores,indices in zip(batch,rankings.values.tolist(),rankings.indices.tolist()):
                top=[(names[i],score) for i,score in zip(indices,scores)]
                records.append((key,row['archivo'],row['modelo'],top[0][0],top[0][1],json.dumps(top,ensure_ascii=False)))
            conn.executemany('INSERT OR IGNORE INTO triage VALUES (?,?,?,?,?,?)',records)
            conn.executemany('INSERT OR REPLACE INTO vectores VALUES (?,?)',[(key,np.asarray(vec,dtype='<f4').tobytes()) for (key,_),vec in zip(batch,vectors)])
            conn.commit()
            print('Lote recorrido',min(offset+8,len(work)),'de',len(work),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('manifiesto',type=Path); p.add_argument('db',type=Path)
    p.add_argument('--limite',type=int,default=128,help='Máximo de candidatos nuevos; 0 recorre todo el manifiesto.')
    p.add_argument('--motor',choices=('clip','siglip'),default='clip')
    a=p.parse_args(); run(a.manifiesto,a.db,a.limite,a.motor)
