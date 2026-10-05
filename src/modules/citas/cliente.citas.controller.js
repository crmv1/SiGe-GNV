import { asyncHandler } from '../../utils/asyncHandler.js';
import { query, queryOne } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';
import { findClienteByUsuario } from '../cliente/cliente.service.js';

export const listarMisCitas = asyncHandler(async (req, res) => {
  const cliente = await findClienteByUsuario(req.user.id);
  if (!cliente) return res.json({ success: true, citas: [] });
  const citas = await query(
    SELECT c.*, v.placa, v.id AS vehiculo_id
       FROM citas c
       JOIN vehiculos v ON v.id = c.vehiculo_id
      WHERE c.cliente_id = ?
      ORDER BY c.fecha DESC, c.hora_inicio DESC,
    [cliente.id]
  );
  res.json({ success: true, citas });
});

export const crearCitaMóvil = asyncHandler(async (req, res) => {
  const { vehiculo_id, tipo_servicio, fecha, hora_inicio } = req.body;
  if (!vehiculo_id || !tipo_servicio || !fecha || !hora_inicio) throw ApiError.badRequest('Datos incompletos');
  const cliente = await findClienteByUsuario(req.user.id);
  if (!cliente) throw ApiError.forbidden();
  const veh = await queryOne(SELECT id, id_cliente FROM vehiculos WHERE id=?, [vehiculo_id]);
  if (!veh || veh.id_cliente !== cliente.id) throw ApiError.forbidden('Vehículo no pertenece al cliente');
  const config = await queryOne(SELECT duracion_cita_min, capacidad_por_franja FROM agenda_config WHERE activo=1 LIMIT 1);
  const dur = config?.duracion_cita_min || 60;
  const cap = config?.capacidad_por_franja || 1;
  const [h,m] = hora_inicio.split(':').map(Number);
  const hfMin = h*60+m+dur;
  const hiStr = hora_inicio;
  const hfStr = Math.floor(hfMin/60).toString().padStart(2,'0')+':'+(hfMin%60).toString().padStart(2,'0')+':00';
  const ocup = await queryOne(
    SELECT COUNT(*) AS c FROM citas WHERE fecha=? AND estado NOT IN ('CANCELADA','NO_ASISTIO') AND NOT (hora_fin <= ? OR hora_inicio >= ?),
    [fecha, hiStr, hfStr]
  );
  if (Number(ocup.c||0) >= cap) throw ApiError.conflict('Horario no disponible');
  const r = await query(
    INSERT INTO citas (cliente_id, vehiculo_id, tipo_servicio, fecha, hora_inicio, hora_fin, estado, origen, creado_por, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW()),
    [cliente.id, vehiculo_id, tipo_servicio, fecha, hiStr, hfStr, 'RESERVADA', 'movil', null]
  );
  res.status(201).json({ success: true, cita_id: r.insertId });
});
