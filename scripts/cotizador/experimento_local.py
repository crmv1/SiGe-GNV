"""Entrena una vez por corpus candidato; jamás publica pesos."""
import csv
import argparse
import hashlib
import json
import subprocess
import sys
import time
from collections import defaultdict
from contextlib import closing
from pathlib import Path

from commons import FIELDS
from dataset import PRIORITY_MODELS, UNKNOWN
from panel_local import rows, decisions

MILESTONES = (100,300,500,750,1000)
PILOT = {'Toyota Corolla':100,'Toyota RAV4':100}


def run(root, budget=900):
    deadline=time.monotonic()+budget

    def execute(command):
        try:
            return subprocess.run(command,timeout=max(.1,deadline-time.monotonic())).returncode
        except subprocess.TimeoutExpired:
            print('Presupuesto de tiempo agotado. Se conserva el intento y se reevalúa en otro ciclo.',flush=True)
            return None

    base=root/'base-revisada.csv'
    if not base.is_file(): print('Falta base-revisada.csv'); return
    entries=rows(root)
    with base.open(encoding='utf-8-sig',newline='') as f:
        known=[r for r in csv.DictReader(f) if r.get('revisada')=='si']
    with closing(decisions(root)) as db:
        for model,sha,generation,angle,group in db.execute("SELECT modelo,sha,generacion,angulo,grupo FROM decisiones WHERE decision='aprobada'"):
            row=entries.get((model,sha))
            if row: known.append(dict(row,revisada='si',generacion=generation,angulo=angle,grupo=group))
    grouped=defaultdict(list)
    for row in known: grouped[row['modelo']].append(row)
    for model in PRIORITY_MODELS:
        items=grouped[model]
        originals={r.get('sha256') or r['fuente'].rstrip('/') for r in items}
        groups={r['grupo'] for r in items if r.get('grupo')}
        print(f'{model}: {len(originals)} revisadas de 100; {len(groups)} grupos de 12 antes de deduplicar.',flush=True)
    reached={}
    for model,items in grouped.items():
        if model==UNKNOWN or len({r['grupo'] for r in items if r.get('grupo')})<12: continue
        originals=len({r.get('sha256') or r['fuente'].rstrip('/') for r in items})
        milestone=max((m for m in MILESTONES if originals>=m),default=0)
        if milestone: reached[model]=milestone
    completed=dict(PILOT)
    for record in (root/'experimentos').glob('*/run/hitos.json'):
        for model,milestone in json.loads(record.read_text(encoding='utf8')).items():
            completed[model]=max(milestone,completed.get(model,0))
    eligible=sorted(reached)
    if len(eligible)<2 or len(grouped[UNKNOWN])<100 or not any(
            point>completed.get(model,0) for model,point in reached.items()):
        print('Sin nuevo hito elegible:',reached); return
    selected=[r for m in [*eligible,UNKNOWN] for r in grouped[m]]
    material=json.dumps(sorted((r['modelo'],r['fuente'],r['grupo'],r['archivo']) for r in selected))
    dest=root/'experimentos'/hashlib.sha256(material.encode()).hexdigest()[:20]
    dest.mkdir(parents=True,exist_ok=True)
    if (dest/'run/metrics.json').exists() or (dest/'evaluacion-bloqueada').exists(): return
    manifest=dest/'manifiesto.csv'
    with manifest.open('w',encoding='utf8',newline='') as f:
        w=csv.DictWriter(f,FIELDS,extrasaction='ignore'); w.writeheader(); w.writerows(selected)
    here=Path(__file__).resolve().parent
    import uuid
    # Una interrupción puede dejar un directorio parcial: cada intento escribe en un destino nuevo.
    attempt=dest/uuid.uuid4().hex[:8]
    attempt.mkdir()
    prep=execute([sys.executable,str(here/'dataset.py'),str(manifest),str(attempt/'dataset'),
                  '--labels',*eligible,'--incluir-desconocidos','--minimo','100'])
    if prep is None: return
    if prep: (dest/'evaluacion-bloqueada').touch(); return
    splits=json.loads((attempt/'dataset/splits.json').read_text(encoding='utf8'))
    counts=defaultdict(int)
    groups=defaultdict(set)
    for part in ('train','val','test'):
        for row in splits[part]:
            counts[row['modelo']]+=1
            groups[row['modelo']].add(row['grupo'])
    verified={model:max(m for m in MILESTONES if counts[model]>=m) for model in eligible}
    if any(len(groups[model])<12 for model in eligible) or not any(
            point>completed.get(model,0) for model,point in verified.items()):
        print('La deduplicación dejó el corpus por debajo del siguiente hito o sin 12 grupos por clase:',verified)
        (dest/'evaluacion-bloqueada').touch()
        return
    training=execute([sys.executable,str(here/'train.py'),'train',str(attempt/'dataset'),str(attempt/'run'),
                      '--calibrar','--epochs','25'])
    if training is None: return
    if training: (dest/'evaluacion-bloqueada').touch(); return
    (attempt/'run/hitos.json').write_text(json.dumps(verified,ensure_ascii=False,indent=2),encoding='utf8')
    (attempt/'run').rename(dest/'run')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('datos',type=Path)
    parser.add_argument('--segundos',type=int,default=900)
    args=parser.parse_args()
    run(args.datos.resolve(),args.segundos)
