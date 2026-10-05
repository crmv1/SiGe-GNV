import { asyncHandler } from '../../utils/asyncHandler.js';
import { query, transaction } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';

const permitidos = {
  RESERVADA: ['CONFIRMADA', 'CANCELADA', 'REPROGRAMADA'],
  CONFIRMADA: ['EN_ATENCION', 'NO_ASISTIO', 'CANCELADA', 'REPROGRAMADA'],
  EN_ATENCION: ['COMPLETADA', 'NO_ASISTIO'],
  COMPLETADA: [],
  CANCELADA: ['REPROGRAMADA'],
  NO_ASISTIO: ['REPROGRAMADA'],
  REPROGRAMADA: ['RESERVADA', 'CONFIRMADA'],
};

export const cambiarEstado = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { estado, observaciones } = req.body;
  if (!permitidos[estado]) throw ApiError.badRequest('Estado inválido');
  await transaction(async (conn) => {
    const [rows] = await conn.query('SELECT estado FROM citas WHERE id=?', [id]);
    if (!rows.length) throw ApiError.notFound('Cita no encontrada');
    const anterior = rows[0].estado;
    if (!permitidos[anterior].includes(estado)) throw ApiError.badRequest('Transición no permitida');
    await conn.query('UPDATE citas SET estado=?, updated_at=NOW() WHERE id=?', [estado, id]);
    await conn.query(
      'INSERT INTO cita_estados_historial (cita_id, estado_anterior, estado_nuevo, usuario_id, observaciones, created_at) VALUES (?,?,?,?,?,NOW())',
      [id, anterior, estado, req.user.id, observaciones || null]
    );
  });
  res.json({ success: true });
});
