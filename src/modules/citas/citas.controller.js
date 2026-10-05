import { asyncHandler } from '../../utils/asyncHandler.js';
import { query, queryOne, transaction } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';

export const listarCitas = asyncHandler(async (req, res) => {
  const { desde, hasta, estado } = req.query;
  let sql = 'SELECT c.*, cl.nombre, cl.apellido, cl.telefono, v.placa FROM citas c JOIN clientes cl ON cl.id = c.cliente_id JOIN vehiculos v ON v.id = c.vehiculo_id';
  const params = [];
  const where = [];
  if (desde && hasta) { where.push('c.fecha BETWEEN ? AND ?'); params.push(desde, hasta); }
  if (estado) { where.push('c.estado = ?'); params.push(estado); }
  if (where.length) sql += ' WHERE ' + where.join(' AND');
  sql += ' ORDER BY c.fecha ASC, c.hora_inicio ASC';
  const citas = await query(sql, params);
  res.json({ success: true, citas });
};
export const crearCita = asyncHandler(async (req, res) => {
  const { cliente_id, vehiculo_id, tipo_servicio, fecha, hora_inicio, tecnico_id, observaciones } = req.body;
  if (!cliente_id || !vehiculo_id || !tipo_servicio || !fecha || !hora_inicio) throw ApiError.badRequest('Datos incompletos');
  const config = await queryOne('SELECT duracion_cita_min, capacidad_por_franja FROM agenda_config WHERE activo=1 LIMIT 1');
  const dur = config ? config.duracion_cita_min : 60;
  const cap = config ? config.capacidad_por_franja : 1;
  const [h, m] = hora_inicio.split(':').map(Number);
  const hfMin = h * 60 + m + dur;
  const hiStr = hora_inicio;
  const hfStr = Math.floor(hfMin / 60).toString().padStart(2, '0') + ':' + (hfMin % 60).toString().padStart(2, '0') + ':00';
  const ocup = await queryOne('SELECT COUNT(*) AS c FROM citas WHERE fecha=? AND estado NOT IN (\"CANCELADA\",\"NO_ASISTIO\") AND NOT (hora_fin <= ? OR hora_inicio >= ?)', [fecha, hiStr, hfStr]);
  if (Number(ocup.c || 0) >= cap) throw ApiError.conflict('Horario no disponible');
  await transaction(async (conn) => {
    const [r] = await conn.query('INSERT INTO citas (cliente_id, vehiculo_id, tipo_servicio, fecha, hora_inicio, hora_fin, estado, origen, creado_por, tecnico_id, observaciones, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())', [cliente_id, vehiculo_id, tipo_servicio, fecha, hiStr, hfStr, 'RESERVADA', 'web', req.user.id, tecnico_id || null, observaciones || null]);
    await conn.query('INSERT INTO cita_estados_historial (cita_id, estado_anterior, estado_nuevo, usuario_id, created_at) VALUES (?,?,?, ?, NOW())', [r.insertId, null, 'RESERVADA', req.user.id]);
  });
  res.status(201).json({ success: true });
});
