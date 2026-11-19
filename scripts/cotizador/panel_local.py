"""Panel de revisión, accesible únicamente desde el equipo local."""
import argparse
import csv
import html
import io
import json
import secrets
import sqlite3
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, urlencode, urlsplit

import numpy as np
from PIL import Image, ImageOps

from dataset import LABELS, PRIORITY_MODELS
from openverse_flickr import license_matches

PAGE_SIZE = 24
PREDICTIONS = {'todos':'Cualquier predicción','coincide':'Ambos coinciden con la clase',
               'discrepa':'Algún motor sugiere otra clase','pendiente':'Falta al menos un motor'}


def rows(root):
    with (root/'consolidado.csv').open(encoding='utf8',newline='') as f:
        return {(r['modelo'],r['sha256']):r for r in csv.DictReader(f) if r.get('sha256')}

def historical_decisions(root):
    static=Path(__file__).resolve().parents[2]/'docs/cotizador-dataset/decisiones-visuales.csv'
    with static.open(encoding='utf-8-sig',newline='') as source:
        done={(row['modelo'],row['fuente'].rstrip('/')) for row in csv.DictReader(source)
              if row['decision']=='descartada'}
    path=root/'particiones.json'
    if path.is_file():
        splits=json.loads(path.read_text(encoding='utf8'))
        done.update((row['modelo'],row['fuente'].rstrip('/')) for part in ('train','val','test')
                    for row in splits[part] if row.get('revisada')=='si')
    return done


def decisions(root):
    db=sqlite3.connect(root/'decisiones.sqlite')
    db.execute('CREATE TABLE IF NOT EXISTS decisiones (modelo TEXT, sha TEXT, decision TEXT, generacion TEXT, angulo TEXT, grupo TEXT, evidencia TEXT, PRIMARY KEY(modelo,sha))')
    return db


def similar(root, model, sha):
    path=root/'clip.sqlite'
    if not path.is_file(): return []
    with closing(sqlite3.connect(path)) as db:
        if not db.execute("SELECT 1 FROM sqlite_master WHERE name='vectores'").fetchone(): return []
        candidates=[(key.split(':')[1],np.frombuffer(blob,dtype='<f4')) for key,blob in db.execute('SELECT key,vector FROM vectores WHERE key LIKE ?',('%:'+model,))]
    source=next((vec for digest,vec in candidates if digest==sha),None)
    if source is None: return []
    return [(digest,score) for score,digest in sorted(((float(source@vec),digest) for digest,vec in candidates if digest!=sha),reverse=True)[:5] if score>=.80]


def predictions(root, model, engine):
    path=root/f'{engine}.sqlite'
    if not path.is_file(): return {}
    with closing(sqlite3.connect(path)) as db:
        if not db.execute("SELECT 1 FROM sqlite_master WHERE name='triage'").fetchone(): return {}
        return {key.split(':',2)[1]:guess for key,guess in db.execute(
            'SELECT key,sugerencia FROM triage WHERE modelo=? ORDER BY rowid',(model,))}


def serve(root, port):
    token=secrets.token_urlsafe(24)
    esc=lambda v:html.escape(str(v),quote=True)
    snapshot=None
    snapshot_id=None
    snapshot_lock=Lock()

    def candidates():
        nonlocal snapshot, snapshot_id
        with snapshot_lock:
            stat=(root/'consolidado.csv').stat()
            identity=(stat.st_mtime_ns,stat.st_size)
            if snapshot_id!=identity:
                snapshot=rows(root)
                snapshot_id=identity
            return snapshot

    class Handler(BaseHTTPRequestHandler):
        timeout=10
        def send(self, data, kind='text/html; charset=utf-8', code=200):
            self.send_response(code); self.send_header('Content-Type',kind); self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff'); self.end_headers(); self.wfile.write(data.encode() if isinstance(data,str) else data)

        def do_GET(self):
            if self.headers.get('Host')!=f'127.0.0.1:{port}': return self.send('Host inválido',code=403)
            q=parse_qs(urlsplit(self.path).query)
            model=q.get('modelo',['Toyota Probox'])[0]; sha=q.get('sha',[''])[0]
            if urlsplit(self.path).path=='/estado':
                state=root/'estado-ciclo.json'
                return self.send(state.read_text(encoding='utf8') if state.exists() else '{}','application/json')
            entries=candidates()
            if urlsplit(self.path).path in ('/foto','/miniatura'):
                r=entries.get((model,sha)); path=Path(r['archivo']).resolve() if r else None
                if not path or not path.is_relative_to(root): return self.send('No encontrada',code=404)
                try:
                    with Image.open(path) as im:
                        bounds=(230,165) if urlsplit(self.path).path=='/miniatura' else (850,650)
                        photo=ImageOps.contain(ImageOps.exif_transpose(im).convert('RGB'),bounds); out=io.BytesIO(); photo.save(out,'JPEG',quality=85)
                    return self.send(out.getvalue(),'image/jpeg')
                except (OSError,ValueError): return self.send('Ilegible',code=404)
            with closing(decisions(root)) as db:
                done={(m,s) for m,s in db.execute('SELECT modelo,sha FROM decisiones')}
            state=root/'estado-ciclo.json'; status=json.loads(state.read_text(encoding='utf8')) if state.exists() else {}
            def link(digest,prefix=''):
                params=dict(modelo=model,sha=digest)
                if not prefix: params.update(buscar=search,prediccion=prediction,grupo=anchor,pagina=page)
                return prefix+'?'+urlencode(params)
            historical=historical_decisions(root)
            pending=[r for (m,s),r in entries.items() if m==model and (m,s) not in done
                     and r.get('revisada')!='descartada' and (m,r['fuente'].rstrip('/')) not in historical]
            search=q.get('buscar',[''])[0].strip()
            prediction=q.get('prediccion',['todos'])[0]
            clip=predictions(root,model,'clip')
            siglip=predictions(root,model,'siglip')
            def matches_prediction(item):
                digest=item['sha256']
                guesses=(clip.get(digest),siglip.get(digest))
                if prediction=='coincide': return guesses==(model,model)
                if prediction=='discrepa': return any(guess and guess!=model for guess in guesses)
                if prediction=='pendiente': return None in guesses
                return True
            anchor=q.get('grupo',[''])[0]
            neighbors={digest for digest,_ in similar(root,model,anchor)} | {anchor} if anchor else None
            matches=[item for item in pending if (neighbors is None or item['sha256'] in neighbors)
                and matches_prediction(item) and search.casefold() in ' '.join(
                item.get(field,'') or '' for field in ('titulo','autor','licencia','fuente')).casefold()]
            pages=max(1,(len(matches)+PAGE_SIZE-1)//PAGE_SIZE)
            requested=q.get('pagina',['1'])[0]
            page=min(pages,max(1,int(requested))) if requested.isascii() and requested.isdigit() and len(requested)<=8 else 1
            r=entries.get((model,sha)) or entries.get((model,anchor))
            if r is None and matches:
                r=matches[(page-1)*PAGE_SIZE]
            counts={m:sum(label==m for label,_ in entries) for m in LABELS}
            body=f'<h1>Dataset GNV</h1><p>Etapa: <span id="etapa">{esc(status.get("etapa","sin señal"))}</span> · {len(entries)} candidatos · {len(done)} decisiones</p>'
            body+="<script>setInterval(async()=>{try{const r=await fetch('/estado');const s=await r.json();document.querySelector('#etapa').textContent=s.etapa||'sin señal'}catch{}},5000)</script>"
            body+='<p><a href="/">Actualizar estado</a></p><form><select name="modelo">'+''.join(f'<option {"selected" if m==model else ""}>{esc(m)}</option>' for m in sorted(LABELS,key=counts.get))+'</select>'
            body+=f' <label>Buscar por título, autor, licencia o fuente <input name="buscar" value="{esc(search)}"></label>'
            body+=' <label>Predicción preliminar <select name="prediccion">'+''.join(
                f'<option value="{key}" {"selected" if key==prediction else ""}>{label}</option>'
                for key,label in PREDICTIONS.items())+'</select></label> <button>Filtrar</button></form>'
            body+=f'<p>{esc(model)} · {len(pending)} pendientes / {counts.get(model,0)} candidatos</p>'
            body+='<nav aria-label="Colas prioritarias">'+''.join(
                f'<a href="?{esc(urlencode(dict(modelo=label,prediccion="coincide")))}">{esc(label)} · revisar concordancias</a><br>'
                for label in PRIORITY_MODELS)+'</nav>'
            if r:
                sha=r['sha256']; source=r['fuente']; valid=urlsplit(source).scheme in ('https','http')
                body+=f'<h2>{esc(r["titulo"])}</h2><img width="560" src="{esc(link(sha,"/foto"))}"><p>{esc(r["autor"])} · {esc(r["licencia"])} · {"metadatos coinciden" if license_matches(r["licencia"],r["licencia_url"]) else "revisar metadatos"}</p>'
                if valid: body+=f'<p><a target="_blank" rel="noopener noreferrer" href="{esc(source)}">Ver licencia y fuente original</a></p>'
                body+=f'<p>CLIP: {esc(clip.get(sha,"pendiente"))} · SigLIP: {esc(siglip.get(sha,"pendiente"))}</p>'
                group_link=urlencode(dict(modelo=model,grupo=sha))
                body+=f'<p><a href="?{esc(group_link)}#contacto">Revisar vecinas visuales en la hoja</a></p>'
                body+='<p>Posibles vistas similares (no prueban identidad): '+''.join(f'<a href="{esc(link(s))}">{value:.2f}</a> ' for s,value in similar(root,model,sha))+'</p>'
                body+=f'<form method="post"><input type="hidden" name="token" value="{token}"><input type="hidden" name="modelo" value="{esc(model)}"><input type="hidden" name="sha" value="{esc(sha)}">'
                body+=''.join(f'<input type="hidden" name="{key}" value="{esc(value)}">'
                              for key,value in dict(buscar=search,prediccion=prediction,grupo=anchor,pagina=page).items())
                body+=''.join(f'<label>{key}<input name="{key}" maxlength="250"></label> ' for key in ('generacion','angulo','grupo','evidencia'))
                body+='<p><button name="decision" value="aprobada">Aprobar revisión</button> <button name="decision" value="descartada">Descartar</button></p></form>'
            body+=f'<h2 id="contacto">Hoja de contacto</h2><p>{len(matches)} resultados · Página {page} de {pages}</p>'
            if anchor:
                clear_link=urlencode(dict(modelo=model))
                body+=f'<p>Fotos visualmente próximas. Confirma por separado la identidad de cada vehículo. <a href="?{esc(clear_link)}#contacto">Mostrar toda la clase</a></p>'
            body+='<p>Atajos fuera de los campos: / buscar, ← página anterior, → página siguiente.</p>'
            for target,label in ((page-1,'Anterior'),(page+1,'Siguiente')):
                if 1<=target<=pages:
                    url=urlencode(dict(modelo=model,buscar=search,prediccion=prediction,grupo=anchor,pagina=target))
                    body+=f'<a id="pagina-{label.lower()}" href="?{esc(url)}#contacto">{label}</a> '
            body+="""<script>document.addEventListener('keydown', event=>{
                if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||
                    event.target.closest('input,textarea,select,button,[contenteditable]')) return;
                const selectors={'/':'input[name=buscar]','ArrowLeft':'#pagina-anterior','ArrowRight':'#pagina-siguiente'};
                if(!(event.key in selectors)) return;
                const target=document.querySelector(selectors[event.key]);
                if(!target) return;
                event.preventDefault();
                if(event.key==='/') target.focus(); else target.click();
            });</script>"""
            if matches:
                body+=f'<form method="post" action="/descartar-lote"><input type="hidden" name="token" value="{token}"><input type="hidden" name="modelo" value="{esc(model)}"><input type="hidden" name="buscar" value="{esc(search)}"><input type="hidden" name="prediccion" value="{esc(prediction)}"><input type="hidden" name="grupo" value="{esc(anchor)}"><input type="hidden" name="pagina" value="{page}"><div class="contacto">'
                start=(page-1)*PAGE_SIZE
                for item in matches[start:start+PAGE_SIZE]:
                    digest=item['sha256']
                    title=item.get('titulo') or 'Foto sin título'
                    body+=f'<article><a href="{esc(link(digest))}"><img loading="lazy" src="{esc(link(digest,"/miniatura"))}" alt="{esc(title)}">{esc(title)}</a><label><input type="checkbox" name="sha" value="{esc(digest)}"> Seleccionar para descarte</label></article>'
                body+='</div><label>Motivo común del descarte <input name="evidencia" maxlength="250" required></label> <button>Descartar seleccionadas</button></form>'
            self.send('<meta charset="utf-8"><style>body{font:16px system-ui;max-width:950px;margin:30px auto}label{display:inline-grid}img{max-width:100%;height:auto}.contacto{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin:1rem 0}.contacto article{display:grid;align-content:start;gap:.4rem}.contacto img{display:block;height:135px;width:100%;object-fit:contain}.contacto label{display:block}</style>'+body)

        def do_POST(self):
            if self.headers.get('Host')!=f'127.0.0.1:{port}' or self.headers.get('Origin')!=f'http://127.0.0.1:{port}': return self.send('Origen inválido',code=403)
            try:
                size=int(self.headers.get('Content-Length',0))
                if not 0<size<=8192: raise ValueError()
                batch=urlsplit(self.path).path=='/descartar-lote'
                form=parse_qs(self.rfile.read(size).decode(),max_num_fields=PAGE_SIZE+7 if batch else 12)
                get=lambda k:form.get(k,[''])[0].strip()[:250]
                m,s,d=(get(k) for k in ('modelo','sha','decision'))
                fields=[get(k) for k in ('generacion','angulo','grupo','evidencia')]
                if not secrets.compare_digest(get('token'),token): raise ValueError()
                entries=candidates()
                if batch:
                    selected=list(dict.fromkeys(form.get('sha',[])))
                    if not 0<len(selected)<=PAGE_SIZE or not fields[-1] or any((m,digest) not in entries for digest in selected): raise ValueError()
                    with closing(decisions(root)) as db, db:
                        db.executemany('INSERT OR IGNORE INTO decisiones VALUES (?,?,?,?,?,?,?)',
                                       [(m,digest,'descartada','','','',fields[-1]) for digest in selected])
                    return self.redirect(m,**{key:get(key) for key in ('buscar','prediccion','grupo','pagina')})
                if (m,s) not in entries or d not in ('aprobada','descartada'): raise ValueError()
                if d=='aprobada' and not all(fields): return self.send('Completa generación, ángulo, grupo y evidencia de revisión de licencia.',code=400)
                with closing(decisions(root)) as db, db:
                    db.execute('INSERT OR REPLACE INTO decisiones VALUES (?,?,?,?,?,?,?)',(m,s,d,*fields))
                self.redirect(m,**{key:get(key) for key in ('buscar','prediccion','grupo','pagina')})
            except (ValueError,UnicodeError): self.send('Datos inválidos',code=400)

        def redirect(self, model, **filters):
            self.send_response(303)
            self.send_header('Location','/?'+urlencode(dict(modelo=model,**filters)))
            self.end_headers()
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('datos',type=Path); p.add_argument('--puerto',type=int,default=8768)
    a=p.parse_args(); serve(a.datos.resolve(),a.puerto)
