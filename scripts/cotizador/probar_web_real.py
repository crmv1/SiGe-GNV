"""Comprueba navegador, TensorFlow.js, API y MariaDB en la instalación web local."""
import argparse
import json
import re
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright


def check(samples, isolated):
    origin,api_port,db_port = ('http://127.0.0.1:5187',3111,3327) if isolated else ('http://127.0.0.1:5173',3100,3317)
    with urlopen(f'http://127.0.0.1:{api_port}/api/health',timeout=5) as health:
        if health.headers.get('X-DB-Puerto') != str(db_port):
            raise ValueError('La API apunta a una base distinta de la esperada para la prueba.')
    guide=Path(__file__).resolve().parents[2]/'USUARIOS_Y_ARRANQUE.md'
    accounts=dict(re.findall(r'\| `(administrador|tecnico)` \| `([^`]+)` \|',guide.read_text(encoding='utf8')))
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(channel='chrome')
        for role in ('administrador','tecnico'):
            page=browser.new_page()
            page.goto(origin)
            page.locator('#username').fill(role)
            page.locator('#password').fill(accounts[role])
            page.locator('button[type=submit]').click()
            page.get_by_role('button',name='Cotizador IA').click(timeout=20000)
            expect(page.get_by_role('heading',name='Cotizador Inteligente GNV')).to_be_visible()
            prices=page.get_by_role('region',name='Precios de catálogo')
            for price in ('4.300,00','6.100,00','4.200,00','5.200,00','6.200,00','7.200,00'):
                expect(prices).to_contain_text(price)
            expect(page.get_by_text('DEMO LOCAL',exact=False)).to_have_count(0)
            print(f'{role}: inicio de sesión y menú comprobados',flush=True)
            select=page.get_by_label('Confirmar o corregir marca y modelo')
            quote_id=None
            for sample in samples:
                label=sample['label']
                page.locator('input[type=file]:not([capture])').set_input_files(sample['path'])
                expect(page.get_by_alt_text('Vista previa del vehículo')).to_be_visible()
                page.get_by_role('button',name='Identificar vehículo').click()
                if label=='__desconocido__':
                    expect(page.get_by_text('Vehículo no reconocido',exact=False)).to_be_visible(timeout=60000)
                    select.select_option(label='Toyota Corolla')
                    expect(select.locator('option:checked')).to_have_text('Toyota Corolla')
                else:
                    expect(page.get_by_text('Sugerencias a confirmar',exact=False)).to_be_visible(timeout=60000)
                    expect(select.locator('option:checked')).to_have_text(label)
                print(f'{label}: fotografía y resultado comprobados',flush=True)
                if label=='Toyota Corolla':
                    page.get_by_label('Año confirmado del vehículo').fill('2012')
                    if not isolated:
                        expect(page.get_by_text('No hay alternativas comerciales verificadas para Toyota Corolla',exact=False)).to_be_visible()
                        expect(page.get_by_role('button',name='Guardar presupuesto')).to_have_count(0)
                        continue
                    if not page.get_by_text('E2E · Variante A',exact=False).first.is_visible():
                        raise ValueError('No se encontró la ficha de la prueba aislada.')
                    expect(page.get_by_text('Confirma la generación o variante',exact=False)).to_be_visible()
                    page.get_by_label('Confirma la variante').select_option(label='E2E · Variante A · Sedán')
                    expect(page.get_by_text('Total estimado:',exact=False)).to_contain_text('8.500,00')
                    options=page.get_by_label('Seleccionar equipo y cilindro (pareja verificada)')
                    second=options.locator('option').filter(has_text=re.compile(r'60 L.*11\.300,00'))
                    options.select_option(value=second.get_attribute('value'))
                    expect(page.get_by_text('Total estimado:',exact=False)).to_contain_text('11.300,00')
                    page.get_by_label('Confirmo vehículo, año, equipo y cilindro').check()
                    page.get_by_role('button',name='Guardar presupuesto').click()
                    saved=page.get_by_role('status').filter(has_text=re.compile(r'Presupuesto #\d+ guardado'))
                    expect(saved).to_be_visible()
                    quote_id=re.search(r'#(\d+)',saved.inner_text())[1]
            if isolated and not quote_id:
                raise ValueError('Se requiere la fotografía Corolla para probar el guardado.')
            page.reload()
            page.get_by_role('button',name='Cotizador IA').click()
            page.get_by_role('button',name='Historial',exact=True).click()
            if isolated:
                entry=page.get_by_text(re.compile(fr'^#{quote_id}\s'))
                expect(entry).to_contain_text('11.300,00')
                print(f'Presupuesto #{quote_id}: persistió en el historial tras recargar',flush=True)
            else:
                expect(page.get_by_text('prueba histórica',exact=False)).to_be_visible()
            page.close()
        browser.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('muestras',type=Path)
    parser.add_argument('--aislado',action='store_true')
    args=parser.parse_args()
    check(json.loads(args.muestras.read_text(encoding='utf8')),args.aislado)
