import { asyncHandler } from '../../utils/asyncHandler.js';
import { query } from '../../config/database.js';

export const historialCita = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hist = await query(
    'SELECT h.*, u.username FROM cita_estados_historial h LEFT JOIN usuarios u ON u.id=h.usuario_id WHERE h.cita_id=? ORDER BY h.created_at ASC',
    [id]
  );
  res.json({ success: true, historial: hist });
});
