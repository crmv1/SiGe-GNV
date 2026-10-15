import { asyncHandler } from '../../utils/asyncHandler.js';
import { transaction } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';
import { esEstadoValido, transicionPermitida, describirEstado } from './citas.service.js';

/**
 * PATCH /citas/:id/estado   (admin / tecnico)
 *
 * Avanza una cita por el PROCESO de recalificacion. El cuerpo manda
 * el estado destino; el servidor valida que exista y que la
 * transicion este permitida desde el estado actual. La web solo pinta
 * los botones que el servidor autoriza, pero igual se rechaza aqui
 * cualquier salto ilegal por si alguien lo manda a mano.
 */
export const cambiarEstado = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { estado, observaciones } = req.body;

  if (!esEstadoValido(estado)) {
    throw ApiError.badRequest(`Estado inválido: ${estado}`, 'ESTADO_INVALIDO');
  }

  await transaction(async (conn) => {
    const [rows] = await conn.query('SELECT estado FROM citas WHERE id=?', [id]);
    if (!rows.length) throw ApiError.notFound('Cita no encontrada', 'CITA_NOT_FOUND');
    const anterior = rows[0].estado;

    if (!transicionPermitida(anterior, estado)) {
      throw ApiError.badRequest(
        `No se puede pasar de "${describirEstado(anterior).etiqueta}" a "${describirEstado(estado).etiqueta}".`,
        'TRANSICION_NO_PERMITIDA'
      );
    }

    await conn.query('UPDATE citas SET estado=?, updated_at=NOW() WHERE id=?', [estado, id]);
    await conn.query(
      'INSERT INTO cita_estados_historial (cita_id, estado_anterior, estado_nuevo, usuario_id, observaciones, created_at) VALUES (?,?,?,?,?,NOW())',
      [id, anterior, estado, req.user.id, observaciones || null]
    );
  });

  res.json({ success: true, estado, ...describirEstado(estado) });
});
