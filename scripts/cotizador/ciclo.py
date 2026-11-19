"""Ciclo Windows reanudable, independiente del IDE. Un único escritor por directorio."""
import argparse
import csv
import json
import logging
from logging.handlers import RotatingFileHandler
import msvcrt
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def run(args):
    root=args.datos.resolve(); root.mkdir(parents=True,exist_ok=True)
    logging.basicConfig(level=logging.INFO, handlers=[RotatingFileHandler(root/'ciclo.log',maxBytes=2_000_000,backupCount=3,encoding='utf8')],
                        format='%(asctime)s %(levelname)s %(message)s')
    with (root/'ciclo.lock').open('a+b') as lock:
        lock.seek(0)
        deadline=time.monotonic()+args.esperar_bloqueo
        while True:
            try:
                msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
                break
            except OSError:
                if time.monotonic()>=deadline: return
                time.sleep(2)
        status=root/'estado-ciclo.json'
        state=dict(pid=os.getpid(),inicio=time.time(),etapas={})
        def heartbeat(**values):
            state.update(values,actualizado=time.time())
            tmp=status.with_suffix('.tmp')
            payload=json.dumps(state,ensure_ascii=False,indent=2)
            for attempt in range(8):
                try:
                    tmp.write_text(payload,encoding='utf8')
                    tmp.replace(status)
                    return
                except PermissionError:
                    if attempt<7: time.sleep(.05*(attempt+1))
            logging.warning('No se pudo publicar la señal de actividad; se volverá a intentar.')
        heartbeat(etapa='preparación')
        if args.adoptar and not (root/'flickr').exists():
            staging=root/'adopcion-flickr'
            shutil.copytree(args.adoptar,staging,dirs_exist_ok=True)
            staging.rename(root/'flickr')
        def step(name, *values, timeout=900, stage=None):
            stage=stage or name
            logging.info('Inicio %s',stage)
            with (root/f'{name}.ultima.log').open('wb') as out:
                with subprocess.Popen([sys.executable,str(HERE/f'{name}.py'),*map(str,values)],stdout=out,stderr=subprocess.STDOUT) as child:
                    deadline=time.monotonic()+timeout
                    heartbeat(etapa=stage,hijo=child.pid)
                    while child.poll() is None and time.monotonic()<deadline:
                        try: child.wait(timeout=min(10,max(.1,deadline-time.monotonic())))
                        except subprocess.TimeoutExpired: heartbeat()
                    if child.poll() is None:
                        child.kill(); child.wait()
                        outcome='plazo agotado; se retoma con el checkpoint'
                    else: outcome=f'código {child.returncode}'
                    state['etapas'][stage]=outcome
                    heartbeat(hijo=None)
                    logging.info('Fin %s: %s',stage,outcome)
                    return outcome=='código 0'

        if args.solo_curacion:
            manifest=root/'consolidado.csv'
            if not manifest.is_file(): heartbeat(etapa='sin manifiestos'); return
            for engine in ('clip','siglip'):
                step('clip_preliminar',manifest,root/f'{engine}.sqlite','--motor',engine,
                     '--limite',0,timeout=args.segundos,stage=engine)
            step('revision_local',root/'revision',manifest,'--clip',root/'clip.sqlite',
                 '--siglip',root/'siglip.sqlite',timeout=900)
            step('comparar_predicciones',root,'--salida',root/'comparacion-predicciones.json')
            budget=max(240,args.segundos)
            step('experimento_local',root,'--segundos',budget,timeout=budget+30)
            heartbeat(etapa='terminado')
            return

        # Copia idempotente de fotos y manifiestos previos; el lote en curso se vuelve a leer en cada ciclo.
        inbox=root/'entrada'
        inbox.mkdir(exist_ok=True)
        for manifest in [*args.importar,*sorted(inbox.glob('*/para_revision.csv'))]:
            target=root/'importados'/manifest.parent.name/manifest.name
            target.parent.mkdir(parents=True,exist_ok=True)
            with manifest.open(encoding='utf-8-sig',newline='') as inp, target.with_suffix('.tmp').open('w',encoding='utf8',newline='') as out:
                reader=csv.DictReader(inp); writer=csv.DictWriter(out,reader.fieldnames); writer.writeheader()
                for row in reader:
                    if row.get('archivo'):
                        source=manifest.parent/row['archivo']
                        if not source.is_file(): continue
                        asset=target.parent/'fotos'/row['modelo']/source.name
                        asset.parent.mkdir(parents=True,exist_ok=True)
                        if not asset.exists():
                            tmp=asset.with_suffix('.tmp'); shutil.copyfile(source,tmp); tmp.replace(asset)
                        row['archivo']=asset.relative_to(target.parent).as_posix()
                    writer.writerow(row)
            target.with_suffix('.tmp').replace(target)
        # Son snapshots de confianza, no archivos servidos por la web.
        for src,name in ((args.particiones,'particiones.json'),(args.fichas,'fichas.json')):
            if src and src.is_file(): shutil.copyfile(src,root/name)
        manifests=sorted(root.glob('importados/*/*.csv'))
        known=['--conocidos',*manifests] if manifests else []
        if not args.solo_reporte and shutil.disk_usage(root).free >= args.min_gib*1024**3:
            step('openverse_flickr',root/'flickr','--por-consulta',20,'--todos','--barrido','--reanudar','--prioridad',*known,timeout=min(args.segundos,420))
            known_sources=[*manifests,root/'flickr/para_revision.csv']
            step('openverse_flickr',root/'wikimedia','--fuente','wikimedia','--por-consulta',15,'--todos','--barrido','--reanudar','--prioridad',
                 '--conocidos',*(p for p in known_sources if p.is_file()),timeout=180)
        elif not args.solo_reporte: logging.warning('Pausa por espacio libre insuficiente')
        for provider in ('flickr','wikimedia'):
            if (root/provider/'para_revision.csv').is_file(): manifests.append(root/provider/'para_revision.csv')
        if not manifests: heartbeat(etapa='sin manifiestos'); return
        staged=root/'consolidado-siguiente.csv'
        staged.unlink(missing_ok=True)
        if not step('auditar_candidatos',staged,*manifests,'--cache',root/'huellas.sqlite',timeout=240): heartbeat(etapa='aplazado'); return
        staged.replace(root/'consolidado.csv')
        opts=[]
        for flag,path in (('--particiones',root/'particiones.json'),('--fichas',root/'fichas.json'),
                          ('--decisiones',HERE.parents[1]/'docs/cotizador-dataset/decisiones-visuales.csv')):
            if path.is_file(): opts.extend((flag,path))
        step('progreso',HERE.parents[1]/'docs/cotizador-dataset',root/'consolidado.csv',*opts,'--panel',root/'decisiones.sqlite')
        step('clip_preliminar',root/'consolidado.csv',root/'clip.sqlite','--limite',128,timeout=100,stage='clip')
        step('clip_preliminar',root/'consolidado.csv',root/'siglip.sqlite','--motor','siglip','--limite',64,timeout=120,stage='siglip')
        step('revision_local',root/'revision',root/'consolidado.csv','--clip',root/'clip.sqlite','--siglip',root/'siglip.sqlite',timeout=180)
        step('comparar_predicciones',root,'--salida',root/'comparacion-predicciones.json')
        budget=max(240,args.segundos)
        step('experimento_local',root,'--segundos',budget,timeout=budget+30)
        heartbeat(etapa='terminado')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('datos',type=Path); p.add_argument('--importar',type=Path,nargs='+',default=[])
    p.add_argument('--particiones',type=Path); p.add_argument('--fichas',type=Path)
    p.add_argument('--adoptar',type=Path,help='Copiar lote existente cuando su escritor esté detenido.')
    p.add_argument('--min-gib',type=int,default=15); p.add_argument('--segundos',type=int,default=1200)
    p.add_argument('--solo-reporte',action='store_true')
    p.add_argument('--solo-curacion',action='store_true',help='Procesar el consolidado desde los checkpoints sin recolectar.')
    p.add_argument('--esperar-bloqueo',type=int,default=0,help='Segundos de espera antes de abandonar si hay otro ciclo.')
    run(p.parse_args())
