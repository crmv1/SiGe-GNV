import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome')
    page=browser.new_page()
    origin='http://127.0.0.1:5186'
    # Simular exclusivamente sesión y catálogo, nunca el modelo ni su salida.
    samples=json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
    modelos=[dict(id=1,marca='Toyota',modelo='Corolla'),dict(id=2,marca='Toyota',modelo='RAV4')]
    page.route('**/api/auth/me',lambda r:r.fulfill(json={'user':{'id':1,'rol':'tecnico','username':'prueba'}}))
    page.route('**/api/cotizador',lambda r:r.fulfill(json=dict(modelos=modelos,fichas=[dict(id=1,modelo_id=1,desde=2010,hasta=2014,verificada=1,generacion='Fixture')],equipos=[dict(id=3,nombre='Tercera',precio=4300)],cilindros=[dict(litros=40,precio=4200)],alternativas=[dict(id=1,ficha_id=1,equipo_id=3,litros=40)],config=dict(anio_guia=2017,modalidad='separado'))))
    page.add_init_script("localStorage.setItem('gnv_token','fixture-web')")
    page.goto(origin)
    page.get_by_role('button',name='Cotizador IA').click()
    for sample in samples:
        page.locator('input[type=file]:not([capture])').set_input_files(sample['path'])
        page.get_by_role('button',name='Identificar vehículo').click()
        label=sample['label']
        expected='Vehículo no reconocido' if label=='__desconocido__' else 'Sugerencias a confirmar'
        expect(page.get_by_text(expected,exact=False)).to_be_visible(timeout=60000)
        if label!='__desconocido__':
            expect(page.get_by_label('Confirmar o corregir marca y modelo')).to_have_value('1' if label.endswith('Corolla') else '2')
        if label.endswith('Corolla'):
            page.get_by_label('Año confirmado del vehículo').fill('2012')
            expect(page.get_by_text('Total estimado:',exact=False)).to_be_visible()
            expect(page.get_by_text('Total estimado:',exact=False)).to_contain_text('8.500,00')
        print(label, page.get_by_text(expected,exact=False).inner_text(),flush=True)
