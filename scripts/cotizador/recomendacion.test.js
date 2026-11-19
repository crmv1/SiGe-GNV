import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recomendar } from '../../src/modules/cotizador/recomendacion.js';

const ficha = { id:1, desde:2010, hasta:2020, verificada:true };
const tercera = { id:1, ficha_id:1, equipo_id:3, litros:40 };
const quinta = { id:2, ficha_id:1, equipo_id:5, litros:60 };
const base = { fichas:[ficha], alternativas:[tercera,quinta], anio:2012, anioGuia:2017 };

test('La guía prioriza una pareja verificada y permite cambiarla', () => {
  const r = recomendar(base);
  assert.equal(r.propuesta, tercera);
  assert.deepEqual(r.opciones,[tercera,quinta]);
  assert.equal(recomendar({...base, anio:2019, alternativas:[tercera]}).motivo,'excepcion');
});
test('La transición y varios cilindros no se resuelven arbitrariamente', () => {
  assert.equal(recomendar({...base,anio:2017}).propuesta,null);
  const r = recomendar({...base, alternativas:[tercera,{...tercera,id:4,litros:80},quinta]});
  assert.equal(r.equipo,3);
  assert.equal(r.propuesta,null);
});
test('Con variantes solapadas exige confirmación; sin ficha verificada no cotiza', () => {
  const fichas = [ficha,{...ficha,id:2}];
  assert.equal(recomendar({...base,fichas}).motivo,'variante');
  assert.equal(recomendar({...base,fichas,fichaId:1}).propuesta,tercera);
  assert.equal(recomendar({...base,fichas:[{...ficha,verificada:false}]}).propuesta,null);
});
