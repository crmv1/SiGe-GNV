import { asyncHandler } from '../../utils/asyncHandler.js';
import { transaction } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';

export const reprogramarCitaWeb = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { fecha, hora_inicio, motivo } = req.body;
  if (!fecha || !hora_inicio) throw ApiError.badRequest('Fecha/hora requeridas');
  await transaction(async (conn) => {
    const [rows] = await conn.query('SELECT estado FROM citas WHERE id=?', [id]);
    if (!rows.length) throw ApiError.notFound();
    const est = rows[0].estado;
    await conn.query('UPDATE citas SET fecha=?, hora_inicio=?, estado="REPROGRAMADA", motivo_reprogramacion=?, fecha_original=COALESCE(fecha_original,fecha), hora_original=COALESCE(hora_original,hora_inicio), updated_at=NOW() WHERE id=?', [fecha, hora_inicio, motivo||null, id]);
    await conn.query(
      'INSERT INTO cita_estados_historial (cita_id, estado_anterior, estado_nuevo, usuario_id, observaciones, created_at) VALUES (?,?,?,?,?,NOW())',
      [id, est, 'REPROGRAMADA', req.user.id, motivo||null]
    );
  });
  res.json({ success: true });
});

export const cancelarCitaWeb = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body;
  await transaction(async (conn) => {
    const [rows] = await conn.query('SELECT estado FROM citas WHERE id=?', [id]);
    if (!rows.length) throw ApiError.notFound();
    const est = rows[0].estado;
    await conn.query('UPDATE citas SET estado="CANCELADA", motivo_cancelacion=?, updated_at=NOW() WHERE id=?', [motivo||null, id]);
    await conn.query(
      'INSERT INTO cita_estados_historial (cita_id, estado_anterior, estado_nuevo, usuario_id, observaciones, created_at) VALUES (?,?,?,?,?,NOW())',
      [id, est, 'CANCELADA', req.user.id, motivo||null]
    );
  });
  res.json({ success: true });
});
