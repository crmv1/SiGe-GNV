import assert from 'node:assert/strict';
import { once } from 'node:events';

if (process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '3307') {
  throw new Error('Ejecutar exclusivamente en la base local de pruebas (3307).');
}
const { closePool, query, queryOne } = await import('../../src/config/database.js');
const { createApp } = await import('../../src/app.js');
const { signToken } = await import('../../src/middleware/auth.js');
let server, ficha, alt, quote;
try {
  const { port, dir } = await queryOne('SELECT @@port AS port, @@datadir AS dir');
  assert.equal(Number(port), 3307);
  assert.match(dir, /[\\/]cotizador-db[\\/]$/);
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const call = async (path = '', rol, method = 'GET', body, expected = 200) => {
    const headers = { 'Content-Type': 'application/json' };
    if (rol) headers.Authorization = `Bearer ${signToken({ id: 1, username: 'integracion', rol })}`;
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/cotizador${path}`,
      { headers, method, body: JSON.stringify(body) });
    const json = await r.json();
    assert.equal(r.status, expected, JSON.stringify(json));
    return json;
  };
  const admin = 'administrador', staff = 'tecnico';
  await call('', null, 'GET', undefined, 401);
  await call('', 'cliente', 'GET', undefined, 403);
  const d = await call('', staff);
  assert.equal(d.modelos.length, 30);
  await call('/config', staff, 'PUT', { anio_guia:2017, modalidad:'separado' }, 403);
  await call('/equipos/3', staff, 'PUT', { precio:4300 }, 403);
  await call('/cilindros/40', staff, 'PUT', { precio:4200 }, 403);
  const modelo_id = d.modelos.find((m) => m.modelo === 'Corolla').id;
  const generacion = `PRUEBA TEMPORAL ${Date.now()}`;
  const f = { modelo_id, generacion, desde:2010, hasta:2012, fuente:'Fixture temporal de integración', verificada:true };
  await call('/fichas', staff, 'POST', f, 403);
  await call('/fichas', admin, 'POST', f);
  ficha = (await queryOne('SELECT id FROM cot_fichas WHERE modelo_id=? AND generacion=?',[modelo_id,generacion])).id;
  await call('/alternativas', staff, 'POST', { ficha_id:ficha, equipo_id:3, litros:40, confirmada:true, notas:'Fixture temporal' });
  alt = (await queryOne('SELECT id FROM cot_alternativas WHERE ficha_id=?',[ficha])).id;
  const b = { modelo_id, alternativa_id:alt, anio:2010, confirmado:true, total_visto:8500 };
  await call('/presupuestos', staff, 'POST', { ...b, anio:2020 }, 400);
  await call('/presupuestos', staff, 'POST', { ...b, total_visto:8000 }, 400);
  const q = await call('/presupuestos', staff, 'POST', b);
  quote = q.id;
  assert.equal(q.datos.total, 8500);
  const history = await call('/presupuestos', staff);
  assert.equal(history.find((r) => r.id === quote).datos.total, 8500);
  await call('/presupuestos', admin);
  const adminQuote = await call('/presupuestos', admin, 'POST', b);
  await query('DELETE FROM cot_historial WHERE id=?', [adminQuote.id]);
  assert.equal(adminQuote.datos.total, 8500);
  await call(`/alternativas/${alt}`, staff, 'DELETE');
  await call('/presupuestos', staff, 'POST', b, 400);
  console.log('OK: catálogo, roles, validación de año y precio, guardado, historial y retiro.');
} finally {
  try {
    if (quote) await query('DELETE FROM cot_historial WHERE id=?',[quote]);
    if (alt) await query('DELETE FROM cot_alternativas WHERE id=?',[alt]);
    if (ficha) await query('DELETE FROM cot_fichas WHERE id=?',[ficha]);
  } finally {
    server?.close();
    await closePool();
  }
}
