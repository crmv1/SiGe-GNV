// ============================================================
//  src/modules/notificaciones/notificaciones.controller.js
// ============================================================
import { listarPendientes, marcarEnviada, marcarError, obtenerNotificacion } from './notificaciones.service.js';
import ApiError from '../../utils/ApiError.js';

/** GET /api/integrations/whatsapp/pendientes */
export async function pendientes(req, res) {
  const notificaciones = await listarPendientes(req.query.limite);

  return res.json({ success: true, notificaciones });
}

/** POST /api/integrations/whatsapp/notificaciones/:id/enviada */
export async function enviada(req, res) {
  const id = Number(req.params.id);

  const notificacion = await obtenerNotificacion(id);

  if (!notificacion) {
    throw ApiError.notFound('La notificacion no existe.', 'NOTIFICACION_NOT_FOUND');
  }

  if (notificacion.estado !== 'pendiente') {
    throw ApiError.conflict(
      `La notificacion ya esta en estado "${notificacion.estado}".`,
      'NOTIFICACION_YA_PROCESADA'
    );
  }

  const actualizada = await marcarEnviada(id);

  if (!actualizada) {
    throw ApiError.conflict('La notificacion cambio de estado.', 'NOTIFICACION_YA_PROCESADA');
  }

  return res.json({ success: true, message: 'Notificacion marcada como enviada.' });
}

/** POST /api/integrations/whatsapp/notificaciones/:id/error */
export async function error(req, res) {
  const id = Number(req.params.id);

  const notificacion = await obtenerNotificacion(id);

  if (!notificacion) {
    throw ApiError.notFound('La notificacion no existe.', 'NOTIFICACION_NOT_FOUND');
  }

  if (notificacion.estado !== 'pendiente') {
    throw ApiError.conflict(
      `La notificacion ya esta en estado "${notificacion.estado}".`,
      'NOTIFICACION_YA_PROCESADA'
    );
  }

  // WPConnect puede mandar el motivo con cualquiera de estos nombres.
  const detalle = req.body?.detalle ?? req.body?.motivo ?? req.body?.error ?? null;

  const actualizada = await marcarError(id, detalle);

  if (!actualizada) {
    throw ApiError.conflict('La notificacion cambio de estado.', 'NOTIFICACION_YA_PROCESADA');
  }

  return res.json({ success: true, message: 'Error registrado en la notificacion.' });
}
