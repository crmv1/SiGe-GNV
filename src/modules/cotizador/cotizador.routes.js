import { Router } from 'express';
import { query, queryOne, transaction } from '../../config/database.js';
import { requireAuth, requireStaff, requireAdmin } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import ApiError from '../../utils/ApiError.js';
import { calcular } from './calculo.js';

const router = Router();
router.use(requireAuth, requireStaff);
const bad = (msg) => { throw ApiError.badRequest(msg); };
const run = (fn) => asyncHandler(async (req, res) => res.json(await fn(req)));
const integer = (v, min = 1, max = 2147483647) => {
  if (!Number.isInteger(v) || v < min || v > max) bad('Número entero fuera de rango.');
  return v;
};
const year = (v) => integer(v, 1900, new Date().getFullYear() + 2);
const optional = (v, fn) => v == null || v === '' ? null : fn(v);
const text = (v, n) => {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > n) bad('Texto requerido o demasiado largo.');
  return v.trim();
};
const decimal = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 99999999.99 || Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) bad('Importe inválido.');
  return v;
};
const exists = async (sql, id) => (await queryOne(sql, [id])) || bad('Registro inexistente.');
// Las fichas de la prueba web anterior se conservan fuera del catálogo comercial.
const fichaComercial = "f.generacion NOT LIKE 'DEMO LOCAL%'";

router.get('/', run(async () => {
  const [modelos, fichas, equipos, cilindros, alternativas, config] = await Promise.all([
    query('SELECT * FROM cot_modelos ORDER BY marca, modelo'),
    query(`SELECT f.* FROM cot_fichas f WHERE ${fichaComercial} ORDER BY f.desde, f.id`),
    query('SELECT * FROM cot_equipos ORDER BY id'),
    query(`SELECT c.*, p.nombre AS producto, p.stock_actual, p.estado AS estado_producto
           FROM cot_cilindros c LEFT JOIN inventario_productos p ON p.id_producto=c.producto_id ORDER BY c.litros`),
    query(`SELECT a.* FROM cot_alternativas a JOIN cot_fichas f ON f.id=a.ficha_id
           WHERE a.activa=1 AND f.verificada=1 AND ${fichaComercial} ORDER BY a.id`), queryOne('SELECT * FROM cot_config WHERE id=1'),
  ]);
  return { modelos, fichas, equipos, cilindros, alternativas, config };
}));

router.post('/modelos', requireAdmin, run(async ({ body: b }) => {
  await query('INSERT INTO cot_modelos (marca,modelo) VALUES (?,?)', [text(b.marca,80),text(b.modelo,80)]);
  return { success: true };
}));
router.post('/fichas', requireAdmin, run(async ({ body: b }) => {
  const desde = optional(b.desde, year), hasta = optional(b.hasta, year);
  if (desde != null && hasta != null && desde > hasta) bad('Rango de años inválido.');
  const fuente = optional(b.fuente, (v) => text(v,500));
  if (b.verificada === true && !fuente) bad('La verificación requiere una fuente.');
  const values = [integer(b.modelo_id), text(b.generacion,100), desde, hasta,
    optional(b.carroceria,(v)=>text(v,100)), optional(b.maletera_l,(v)=>{
      if (decimal(v) > 999999.99) bad('Volumen fuera de rango.');
      return v;
    }), optional(b.dimensiones,(v)=>text(v,1000)), fuente, b.verificada === true,
    optional(b.codigo_chasis,(v)=>text(v,100)), optional(b.motorizacion,(v)=>text(v,200)),
    optional(b.mercado,(v)=>text(v,120)), optional(b.maletera_detalle,(v)=>text(v,1000))];
  await exists('SELECT id FROM cot_modelos WHERE id=?', values[0]);
  if (b.id == null) await query(`INSERT INTO cot_fichas
    (modelo_id,generacion,desde,hasta,carroceria,maletera_l,dimensiones,fuente,verificada,codigo_chasis,motorizacion,mercado,maletera_detalle) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, values);
  else {
    const ficha = await exists(`SELECT f.modelo_id FROM cot_fichas f WHERE f.id=? AND ${fichaComercial}`, integer(b.id));
    if (ficha.modelo_id !== values[0]) bad('No se puede reasignar el modelo de una ficha.');
    // Una ficha vinculada a alternativas debe conservar el significado de su validación.
    await query(`UPDATE cot_fichas SET modelo_id=?,generacion=?,desde=?,hasta=?,carroceria=?,maletera_l=?,dimensiones=?,fuente=?,verificada=?,codigo_chasis=?,motorizacion=?,mercado=?,maletera_detalle=?
      WHERE id=? AND NOT EXISTS (SELECT 1 FROM cot_alternativas WHERE ficha_id=? AND activa=1)`, [...values,b.id,b.id])
      .then((r) => { if (!r.affectedRows) bad('Retira primero las alternativas activas de la ficha.'); });
  }
  return { success: true };
}));

router.post('/alternativas', run(async ({ body: b, user }) => transaction(async (db) => {
  if (b.confirmada !== true) bad('Confirma la validación técnica.');
  const [[ficha]] = await db.execute(`SELECT f.verificada,f.desde,f.hasta FROM cot_fichas f
    WHERE f.id=? AND ${fichaComercial} FOR UPDATE`, [integer(b.ficha_id)]);
  if (!ficha?.verificada || ficha.desde == null || ficha.hasta == null) bad('La ficha debe estar verificada y tener un rango de años documentado.');
  await exists('SELECT id FROM cot_equipos WHERE id=?', integer(b.equipo_id));
  await exists('SELECT litros FROM cot_cilindros WHERE litros=?', integer(b.litros));
  await db.execute('INSERT INTO cot_alternativas (ficha_id,equipo_id,litros,notas,verificada_por) VALUES (?,?,?,?,?)',
    [b.ficha_id,b.equipo_id,b.litros,text(b.notas,1000),user.id]);
  return { success: true };
})));
router.delete('/alternativas/:id', run(async ({ params }) => {
  await query('UPDATE cot_alternativas SET activa=0 WHERE id=?', [integer(Number(params.id))]);
  return { success: true };
}));

router.put('/config', requireAdmin, run(async ({ body: b }) => {
  if (!['separado','kit_incluye_cilindro'].includes(b.modalidad)) bad('Modalidad inválida.');
  await query('UPDATE cot_config SET anio_guia=?,modalidad=? WHERE id=1', [year(b.anio_guia),b.modalidad]);
  return { success: true };
}));
router.put('/equipos/:id', requireAdmin, run(async ({ params, body }) => {
  await query('UPDATE cot_equipos SET precio=? WHERE id=?', [decimal(body.precio),integer(Number(params.id))]);
  return { success: true };
}));
router.put('/cilindros/:litros', requireAdmin, run(async ({ params, body: b }) => {
  const producto = optional(b.producto_id, (v) => integer(v));
  if (producto != null) await exists('SELECT id_producto FROM inventario_productos WHERE id_producto=?', producto);
  await query('UPDATE cot_cilindros SET precio=?,producto_id=?,ficha_oficial=?,datos_verificados=? WHERE litros=?',
    [decimal(b.precio),producto,optional(b.ficha_oficial,(v)=>text(v,500)),optional(b.datos_verificados,(v)=>text(v,1000)),integer(Number(params.litros))]);
  return { success: true };
}));

router.post('/presupuestos', run(async ({ body: b, user }) => transaction(async (db) => {
  if (b.confirmado !== true) bad('Confirma el vehículo, año, equipo y cilindro.');
  const anio = year(b.anio);
  const [[data]] = await db.execute(`SELECT m.marca,m.modelo,f.generacion,f.desde,f.hasta,a.id AS alternativa_id,a.notas,
      e.nombre AS equipo,e.precio AS precio_kit,c.litros,c.precio AS precio_cilindro,g.modalidad
    FROM cot_alternativas a JOIN cot_fichas f ON a.ficha_id=f.id JOIN cot_modelos m ON f.modelo_id=m.id
    JOIN cot_equipos e ON a.equipo_id=e.id JOIN cot_cilindros c ON a.litros=c.litros JOIN cot_config g ON g.id=1
    WHERE a.id=? AND a.activa=1 AND f.verificada=1 AND ${fichaComercial} AND m.id=? FOR UPDATE`, [integer(b.alternativa_id),integer(b.modelo_id)]);
  if (!data || data.desde == null || data.hasta == null || anio < data.desde || anio > data.hasta) bad('Alternativa no verificada para el vehículo y año indicados.');
  const { precio_kit, precio_cilindro, ...snapshot } = data;
  const datos = { ...snapshot, anio, ...calcular(precio_kit,precio_cilindro,data.modalidad) };
  if (b.total_visto !== datos.total) bad('El presupuesto cambió. Actualiza la vista y vuelve a confirmar.');
  const [result] = await db.execute('INSERT INTO cot_historial (usuario_id,datos) VALUES (?,?)', [user.id,JSON.stringify(datos)]);
  return { id: result.insertId, datos };
})));
router.get('/presupuestos', run(async ({ query: params }) => {
  const before = params.antes == null ? 2147483647 : integer(Number(params.antes));
  const rows = await query('SELECT * FROM cot_historial WHERE id < ? ORDER BY id DESC LIMIT 50', [before]);
  return rows.map((r) => ({ ...r, datos: typeof r.datos === 'string' ? JSON.parse(r.datos) : r.datos }));
}));

export default router;
