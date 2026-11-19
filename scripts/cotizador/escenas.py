"""Recoge escenas negativas con atribución, pendientes de revisión visual."""
import csv
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

from commons import FIELDS, LICENSES, clean, download, fetch

out=Path(sys.argv[1]); out.mkdir(exist_ok=False)
with (out/'escenas.csv').open('w',encoding='utf8',newline='') as f:
    writer=csv.DictWriter(f,FIELDS); writer.writeheader()
    for query in ('forest trail','rocky coast','empty room','mountain lake','pedestrian bridge','library interior'):
        params=dict(action='query',generator='search',gsrnamespace=6,gsrlimit=8,gsrsearch=f'intitle:"{query}" filetype:bitmap',prop='imageinfo',iiprop='url|extmetadata',iiurlwidth=500,format='json',formatversion=2)
        try:
            pages=json.loads(fetch('https://commons.wikimedia.org/w/api.php?'+urlencode(params),3_000_000)).get('query',{}).get('pages',[])
        except OSError as e:
            print(e); break
        for p in pages:
            info=p.get('imageinfo',[{}])[0]; m=info.get('extmetadata',{})
            def val(key): return m.get(key,{}).get('value','')
            license_id=val('LicenseShortName').replace(' ','-')
            if license_id not in LICENSES or not val('Artist') or val('Restrictions') or not info.get('thumburl'): continue
            r=dict(modelo='__desconocido__',autor=clean(val('Artist')),licencia=license_id,licencia_url=val('LicenseUrl'),fuente=info['descriptionurl'],descarga=info['thumburl'],titulo=p['title'],revisada='no',generacion='escena',angulo='escena')
            r,content,error=download(r)
            if content:
                r['archivo']=str(out.resolve()/f"{p['pageid']}.jpg"); Path(r['archivo']).write_bytes(content); writer.writerow(r); f.flush()
            if getattr(error,'code',0)==429: sys.exit(0)
            time.sleep(1)
