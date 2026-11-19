import { asyncHandler } from '../../utils/asyncHandler.js';
import { query, transaction } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';

export const registrarResultado = asyncHandler(async (req, res) => {
  const { cita_id, vehiculo_id, cliente_id, tipo_servicio, estado_servicio, resultado, observaciones, fecha_realizada, proxima_fecha } = req.body;
  if (!vehiculo_id || !cliente_id || !tipo_servicio || !estado_servicio) throw ApiError.badRequest('Datos incompletos');
  await transaction(async (conn) => {
    await conn.query(
      'INSERT INTO inspecciones_resultados (cita_id, vehiculo_id, cliente_id, tipo_servicio, estado_servicio, resultado, observaciones, tecnico_id, fecha_realizada, proxima_fecha, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())',
      [cita_id || null, vehiculo_id, cliente_id, tipo_servicio, estado_servicio, resultado || null, observaciones || null, req.user.id, fecha_realizada || null, proxima_fecha || null]
    );
  });
  res.status(201).json({ success: true });
});

export const listarResultados = asyncHandler(async (req, res) => {
  const { vehiculo_id, cliente_id } = req.query;
  let sql = 'SELECT * FROM inspecciones_resultados';
  const p = [];
  if (vehiculo_id) { sql += ' WHERE vehiculo_id=?'; p.push(vehiculo_id); }
  else if (cliente_id) { sql += ' WHERE cliente_id=?'; p.push(cliente_id); }
  sql += ' ORDER BY created_at DESC';
  const r = await query(sql, p);
  res.json({ success: true, resultados: r });
});
