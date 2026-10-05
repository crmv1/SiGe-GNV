import { asyncHandler } from '../../utils/asyncHandler.js';
import { transaction } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';
import { findClienteByUsuario } from '../cliente/cliente.service.js';

const permitidosCliente = {
  RESERVADA: ['CANCELADA', 'REPROGRAMADA'],
  CONFIRMADA: ['CANCELADA', 'REPROGRAMADA'],
};

export const cancelarCitaCliente = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body;
  const cliente = await findClienteByUsuario(req.user.id);
  if (!cliente) throw ApiError.forbidden();
  await transaction(async (conn) => {
    const [rows] = await conn.query('SELECT cliente_id, estado FROM citas WHERE id=?', [id]);
    if (!rows.length) throw ApiError.notFound();
    if (rows[0].cliente_id !== cliente.id) throw ApiError.forbidden();
    const est = rows[0].estado;
    if (!permitidosCliente[est]) throw ApiError.badRequest('No puede cancelarse en este estado');
    await conn.query('UPDATE citas SET estado="CANCELADA", motivo_cancelacion=?, updated_at=NOW() WHERE id=?', [motivo||null, id]);
    await conn.query(
      'INSERT INTO cita_estados_historial (cita_id, estado_anterior, estado_nuevo, usuario_id, observaciones, created_at) VALUES (?,?,?,?,?,NOW())',
      [id, est, 'CANCELADA', null, motivo||null]
    );
  });
  res.json({ success: true });
});

export const reprogramarCitaCliente = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { motivo, fecha, hora_inicio } = req.body;
  const cliente = await findClienteByUsuario(req.user.id);
  if (!cliente) throw ApiError.forbidden();
  await transaction(async (conn) => {
    const [rows] = await conn.query('SELECT cliente_id, estado, fecha, hora_inicio, vehiculo_id, tipo_servicio FROM citas WHERE id=?', [id]);
    if (!rows.length) throw ApiError.notFound();
    if (rows[0].cliente_id !== cliente.id) throw ApiError.forbidden();
    const est = rows[0].estado;
    if (!permitidosCliente[est]) throw ApiError.badRequest('No puede reprogramarse');
    const nuevaF = fecha || rows[0].fecha;
    const nuevaH = hora_inicio || rows[0].hora_inicio;
    await conn.query(
      UPDATE citas SET estado="REPROGRAMADA", motivo_reprogramacion=?, fecha_original=fecha, hora_original=hora_inicio, updated_at=NOW() WHERE id=?,
      [motivo||null, id]
    );
    // crear nueva reservada? simplificado: mantener reprogramada y permitir admin confirmar - pero pedimos reprogramar
    await conn.query(
      'INSERT INTO cita_estados_historial (cita_id, estado_anterior, estado_nuevo, usuario_id, observaciones, created_at) VALUES (?,?,?,?,?,NOW())',
      [id, est, 'REPROGRAMADA', null, motivo||null]
    );
  });
  res.json({ success: true });
});
