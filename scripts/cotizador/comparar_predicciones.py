"""Compara las etiquetas principales del consolidado sin registrar decisiones."""
import argparse
import json
from collections import Counter
from contextlib import closing
from pathlib import Path

from dataset import LABELS
from panel_local import decisions, historical_decisions, predictions, rows


def compare(root):
    entries=rows(root)
    excluded=historical_decisions(root)
    done=set()
    if (root/'decisiones.sqlite').is_file():
        with closing(decisions(root)) as db:
            done=set(db.execute('SELECT modelo,sha FROM decisiones'))
    report={}
    for model in LABELS:
        clip=predictions(root,model,'clip')
        siglip=predictions(root,model,'siglip')
        counts=Counter(dict(pendientes=0,sin_ambas=0,ambas_clase=0,ambas_otra=0,
                            solo_clip_clase=0,solo_siglip_clase=0,ambas_distintas=0))
        for (label,digest),row in entries.items():
            if (label!=model or (label,digest) in done or row.get('revisada')=='descartada'
                    or (label,row['fuente'].rstrip('/')) in excluded): continue
            counts['pendientes']+=1
            a,b=clip.get(digest),siglip.get(digest)
            if not a or not b: key='sin_ambas'
            elif a==b==model: key='ambas_clase'
            elif a==b: key='ambas_otra'
            elif a==model: key='solo_clip_clase'
            elif b==model: key='solo_siglip_clase'
            else: key='ambas_distintas'
            counts[key]+=1
        report[model]=dict(counts)
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('datos',type=Path)
    parser.add_argument('--salida',type=Path)
    args=parser.parse_args()
    models=compare(args.datos)
    totals=Counter()
    for counts in models.values():
        totals.update(counts)
    report=dict(total=dict(totals),modelos=models)
    if args.salida:
        staged=args.salida.with_suffix('.tmp')
        staged.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
        staged.replace(args.salida)
    print(json.dumps(report['total'],ensure_ascii=False))
