import { asyncHandler } from '../../utils/asyncHandler.js';
import { query, queryOne } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';
import { findClienteByUsuario } from '../cliente/cliente.service.js';
import { TIPOS_VEHICULO, ESTADOS, TIPO_RESERVA_CLIENTE } from './citas.service.js';

/**
 * GET /cliente/mis-citas
 * Citas del cliente autenticado, con la etiqueta y el color del
 * estado de proceso para pintar el badge en la app.
 */
export const listarMisCitas = asyncHandler(async (req, res) => {
  const cliente = await findClienteByUsuario(req.user.id);
  if (!cliente) return res.json({ success: true, citas: [] });
  const citas = await query(
    `SELECT c.*, v.placa, v.id AS vehiculo_id
       FROM citas c
       JOIN vehiculos v ON v.id = c.vehiculo_id
      WHERE c.cliente_id = ?
      ORDER BY c.fecha DESC, c.hora_inicio DESC`,
    [cliente.id]
  );
  const enriquecidas = citas.map((c) => ({
    ...c,
    estado_info: ESTADOS[c.estado] || null,
  }));
  res.json({ success: true, citas: enriquecidas, estados: ESTADOS });
});

/**
 * POST /cliente/citas
 * El cliente solo reserva RECALIFICACION (es lo único que la app
 * permite; inspecciones y otros servicios se agendan en el taller).
 * El tipo de vehículo (público/privado) lo elige el cliente al
 * reservar, porque define el proceso (público ≈ 3 días, privado ≈
 * el mismo día).
 */
export const crearCitaMovil = asyncHandler(async (req, res) => {
  const { vehiculo_id, fecha, hora_inicio, tipo_vehiculo } = req.body;
  if (!vehiculo_id || !fecha || !hora_inicio) {
    throw ApiError.badRequest('Faltan datos: vehículo, fecha y hora son obligatorios.', 'MISSING_FIELDS');
  }

  const cliente = await findClienteByUsuario(req.user.id);
  if (!cliente) throw ApiError.forbidden();

  const veh = await queryOne('SELECT id, id_cliente FROM vehiculos WHERE id=?', [vehiculo_id]);
  if (!veh || veh.id_cliente !== cliente.id) {
    throw ApiError.forbidden('El vehículo no pertenece a tu cuenta.', 'VEHICULO_NO_PERTENECE');
  }

  let tipoVeh = null;
  if (tipo_vehiculo !== undefined && tipo_vehiculo !== null) {
    if (!TIPOS_VEHICULO.includes(tipo_vehiculo)) {
      throw ApiError.badRequest(`Tipo de vehículo inválido: ${tipo_vehiculo}`, 'BAD_TIPO_VEHICULO');
    }
    tipoVeh = tipo_vehiculo;
  }

  const config = await queryOne('SELECT duracion_cita_min, capacidad_por_franja FROM agenda_config WHERE activo=1 LIMIT 1');
  const dur = config?.duracion_cita_min || 60;
  const cap = config?.capacidad_por_franja || 1;
  const [h, m] = hora_inicio.split(':').map(Number);
  const hfMin = h * 60 + m + dur;
  const hiStr = hora_inicio.length === 5 ? hora_inicio + ':00' : hora_inicio;
  const hfStr = Math.floor(hfMin / 60).toString().padStart(2, '0') + ':' + (hfMin % 60).toString().padStart(2, '0') + ':00';

  const ocup = await queryOne(
    "SELECT COUNT(*) AS c FROM citas WHERE fecha=? AND estado NOT IN ('CANCELADA','NO_ASISTIO') AND NOT (hora_fin <= ? OR hora_inicio >= ?)",
    [fecha, hiStr, hfStr]
  );
  if (Number(ocup.c || 0) >= cap) {
    throw ApiError.conflict('Ese horario ya no está disponible.', 'HORARIO_OCUPADO');
  }

  const r = await query(
    `INSERT INTO citas
       (cliente_id, vehiculo_id, tipo_servicio, tipo_vehiculo, fecha, hora_inicio, hora_fin, estado, origen, creado_por, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
    [cliente.id, vehiculo_id, TIPO_RESERVA_CLIENTE, tipoVeh, fecha, hiStr, hfStr, 'RESERVADA', 'movil', null]
  );

  // Si el cliente eligió público/privado, se recuerda en el vehículo.
  if (tipoVeh) {
    await query('UPDATE vehiculos SET tipo_vehiculo=? WHERE id=?', [tipoVeh, vehiculo_id]);
  }

  res.status(201).json({ success: true, cita_id: r.insertId, estado: 'RESERVADA' });
});
