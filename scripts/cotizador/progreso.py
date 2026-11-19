"""Genera un corte auditable del corpus; una descarga nunca equivale a una revisión."""
import argparse
import csv
import json
import sqlite3
from pathlib import Path

from dataset import LABELS


def report(args):
    models={label:{} for label in LABELS}
    scanned={label:0 for label in LABELS}
    for path in args.manifiestos:
        with path.open(encoding='utf-8-sig',newline='') as source:
            for r in csv.DictReader(source):
                label=r.get('modelo')
                if label not in models or not r.get('fuente'): continue
                scanned[label]+=1
                key=r.get('fuente','').rstrip('/')
                previous=models[label].get(key)
                if not previous or (r.get('archivo') and not previous.get('archivo')): models[label][key]=r
    validated={label:{} for label in LABELS}
    if args.particiones:
        dataset=json.loads(args.particiones.read_text(encoding='utf8'))
        for split in ('train','val','test'):
            for row in dataset[split]:
                if row['modelo'] in validated and row.get('revisada')=='si':
                    validated[row['modelo']][row['fuente'].rstrip('/')]=row
    fichas=json.loads(args.fichas.read_text(encoding='utf-8-sig')) if args.fichas else []
    decisions = {}
    for path in args.decisiones:
        with path.open(encoding='utf-8-sig', newline='') as f:
            for row in csv.DictReader(f):
                decisions[(row['modelo'],row['fuente'].rstrip('/'))]=row['decision']
    if args.panel and args.panel.is_file():
        with sqlite3.connect(args.panel) as db:
            if db.execute("SELECT 1 FROM sqlite_master WHERE name='decisiones'").fetchone():
                panel={(m,sha):(decision,gen,group) for m,sha,decision,gen,group in db.execute('SELECT modelo,sha,decision,generacion,grupo FROM decisiones')}
                for m,entries in models.items():
                    for key,row in entries.items():
                        if (m,row.get('sha256')) not in panel: continue
                        decision,gen,group=panel[m,row['sha256']]
                        decisions[m,key]=decision
                        if decision=='aprobada': validated[m][key]=dict(row,generacion=gen,grupo=group)
    result=[]
    for label, entries in models.items():
        approved=validated[label]
        downloaded={k for k,r in entries.items() if r.get('archivo')} | set(approved)
        records=[f for f in fichas if f['modelo']==label]
        discarded={k for k,r in entries.items() if k not in approved and
                   (r.get('revisada')=='descartada' or decisions.get((label,k))=='descartada')}
        generations=sorted({r['generacion'] for r in approved.values() if r.get('generacion')})
        independent_groups={r['grupo'] for r in approved.values() if r.get('grupo')}
        result.append(dict(modelo=label,encontradas=len(set(entries)|set(approved)),descargadas=len(downloaded),
                           verificadas=len(approved),descartadas=len(discarded),
                           registros_repetidos=scanned[label]-len(entries),pendientes=len(downloaded-set(approved)-discarded),
                           cumplimiento_pct=round(100*len(approved)/1000,2),generaciones='; '.join(generations),
                           grupos_registrados=len(independent_groups),
                           faltan_para_primer_hito=max(0,100-len(approved)),
                           entrenamiento='piloto activo' if label in {'Toyota Corolla','Toyota RAV4'} else 'experimental' if label=='Nissan Sentra' else 'pendiente',
                           fichas=len(records) if args.fichas else None,fichas_verificadas=sum(f['verificada'] for f in records) if args.fichas else None))
    args.destino.mkdir(parents=True,exist_ok=True)
    with (args.destino/'progreso.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,list(result[0])); writer.writeheader(); writer.writerows(result)
    (args.destino/'progreso.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    print(f'{len(result)} clases; {sum(r["verificadas"] for r in result)} fotos verificadas en particiones; {sum(r["pendientes"] for r in result)} pendientes en el corte.')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('destino',type=Path); p.add_argument('manifiestos',type=Path,nargs='+')
    p.add_argument('--particiones',type=Path); p.add_argument('--fichas',type=Path)
    p.add_argument('--decisiones',type=Path,nargs='+',default=[])
    p.add_argument('--panel',type=Path)
    report(p.parse_args())
