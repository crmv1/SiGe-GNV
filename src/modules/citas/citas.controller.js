import { asyncHandler } from '../../utils/asyncHandler.js';
import { query, queryOne, transaction } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';
import { TIPOS_SERVICIO, TIPOS_VEHICULO, ESTADOS, TRANSICIONES } from './citas.service.js';

/**
 * GET /citas/clientes   (admin / tecnico)
 * Listado de clientes para el formulario de cita de mostrador
 * (walk-in). Devuelve id, nombre, apellido y telefono; con el id se
 * filtran despues los vehiculos del cliente.
 */
export const listarClientesAgenda = asyncHandler(async (_req, res) => {
  const clientes = await query(
    'SELECT id, nombre, apellido, telefono FROM clientes ORDER BY nombre, apellido'
  );
  res.json({ success: true, clientes });
});

/**
 * GET /citas?desde=&hasta=&estado=   (admin / tecnico)
 * Listado para la agenda de la web, con los datos del cliente, el
 * vehiculo (placa + tipo) y la etiqueta/color del estado de proceso.
 */
export const listarCitas = asyncHandler(async (req, res) => {
  const { desde, hasta, estado } = req.query;
  let sql = `SELECT c.id, c.cliente_id, c.vehiculo_id, c.tipo_servicio, c.tipo_vehiculo,
                    DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
                    c.hora_inicio, c.hora_fin, c.estado, c.origen, c.observaciones,
                    c.motivo_cancelacion, c.motivo_reprogramacion,
                    cl.nombre, cl.apellido, cl.telefono,
                    v.placa
               FROM citas c
               JOIN clientes cl ON cl.id = c.cliente_id
               JOIN vehiculos v ON v.id = c.vehiculo_id`;
  const params = [];
  const where = [];
  if (desde && hasta) { where.push('c.fecha BETWEEN ? AND ?'); params.push(desde, hasta); }
  if (estado) { where.push('c.estado = ?'); params.push(estado); }
  if (where.length) sql += ' WHERE ' + where.join(' AND');
  sql += ' ORDER BY c.fecha ASC, c.hora_inicio ASC';
  const citas = await query(sql, params);

  // Se enriquece con la etiqueta y el color del estado. La web usa
  // el mapa `estados` (que mandamos completo) para decidir que
  // botones de transicion pintar, sin reimplementar las reglas.
  const enriquecidas = citas.map((c) => ({
    ...c,
    estado_info: ESTADOS[c.estado] || null,
  }));

  res.json({ success: true, citas: enriquecidas, estados: ESTADOS, transiciones: TRANSICIONES });
});

/**
 * POST /citas   (admin / tecnico) — cita de mostrador (walk-in)
 *
 * El personal crea la cita directamente, igual que si la hubiera
 * hecho el cliente en la app. El origen queda en 'taller' para
 * distinguirla de las que nacen en la app.
 */
export const crearCita = asyncHandler(async (req, res) => {
  const { cliente_id, vehiculo_id, tipo_servicio, tipo_vehiculo, fecha, hora_inicio, tecnico_id, observaciones } = req.body;

  if (!cliente_id || !vehiculo_id || !fecha || !hora_inicio) {
    throw ApiError.badRequest('Faltan datos: cliente, vehículo, fecha y hora son obligatorios.', 'MISSING_FIELDS');
  }

  // El tipo de servicio por defecto es recalificacion (es lo que el
  // taller hace con citas). Se acepta inspeccion solo si viene.
  const tipo = tipo_servicio || 'recalificacion';
  if (!TIPOS_SERVICIO.includes(tipo)) {
    throw ApiError.badRequest(`Tipo de servicio inválido: ${tipo}`, 'BAD_TIPO_SERVICIO');
  }

  let tipoVeh = null;
  if (tipo_vehiculo !== undefined && tipo_vehiculo !== null) {
    if (!TIPOS_VEHICULO.includes(tipo_vehiculo)) {
      throw ApiError.badRequest(`Tipo de vehículo inválido: ${tipo_vehiculo}`, 'BAD_TIPO_VEHICULO');
    }
    tipoVeh = tipo_vehiculo;
  }

  // El vehiculo debe existir y pertenecer al cliente (si no se pasa
  // cliente_id igual se valida contra el dueño real del vehiculo).
  const veh = await queryOne('SELECT id, id_cliente FROM vehiculos WHERE id=?', [vehiculo_id]);
  if (!veh) throw ApiError.notFound('El vehículo no existe.', 'VEHICULO_NOT_FOUND');
  if (veh.id_cliente && Number(veh.id_cliente) !== Number(cliente_id)) {
    throw ApiError.badRequest('Ese vehículo no pertenece a ese cliente.', 'VEHICULO_NO_PERTENECE');
  }

  const config = await queryOne('SELECT duracion_cita_min, capacidad_por_franja FROM agenda_config WHERE activo=1 LIMIT 1');
  const dur = config ? config.duracion_cita_min : 60;
  const cap = config ? config.capacidad_por_franja : 1;
  const [h, m] = hora_inicio.split(':').map(Number);
  const hfMin = h * 60 + m + dur;
  const hiStr = hora_inicio.length === 5 ? hora_inicio + ':00' : hora_inicio;
  const hfStr = Math.floor(hfMin / 60).toString().padStart(2, '0') + ':' + (hfMin % 60).toString().padStart(2, '0') + ':00';

  const ocup = await queryOne(
    "SELECT COUNT(*) AS c FROM citas WHERE fecha=? AND estado NOT IN ('CANCELADA','NO_ASISTIO') AND NOT (hora_fin <= ? OR hora_inicio >= ?)",
    [fecha, hiStr, hfStr]
  );
  if (Number(ocup.c || 0) >= cap) throw ApiError.conflict('Ese horario ya no está disponible.', 'HORARIO_OCUPADO');

  await transaction(async (conn) => {
    const [r] = await conn.query(
      'INSERT INTO citas (cliente_id, vehiculo_id, tipo_servicio, tipo_vehiculo, fecha, hora_inicio, hora_fin, estado, origen, creado_por, tecnico_id, observaciones, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())',
      [cliente_id, vehiculo_id, tipo, tipoVeh, fecha, hiStr, hfStr, 'RESERVADA', 'web', req.user.id, tecnico_id || null, observaciones || null]
    );
    // Si el taller marco publico/privado, se recuerda en el vehiculo.
    if (tipoVeh) {
      await conn.query('UPDATE vehiculos SET tipo_vehiculo=? WHERE id=?', [tipoVeh, vehiculo_id]);
    }
    await conn.query(
      'INSERT INTO cita_estados_historial (cita_id, estado_anterior, estado_nuevo, usuario_id, created_at) VALUES (?,?,?, ?, NOW())',
      [r.insertId, null, 'RESERVADA', req.user.id]
    );
    res.status(201).json({ success: true, cita_id: r.insertId, estado: 'RESERVADA' });
  });
});
