// ============================================================
//  src/modules/public/public.controller.js
// ============================================================
import { consultarPlaca, buildPlacaMessage } from './public.service.js';
import { normalizePlaca, esPlacaValida } from '../vehiculos/vehiculos.service.js';

/**
 * GET /api/public/consulta/placa/:placa
 *
 * Devuelve unicamente: placa, proxima_inspeccion, estado_inspeccion,
 * proxima_recalificacion y estado_recalificacion.
 */
export async function consultaPlaca(req, res) {
  const placa = normalizePlaca(req.params.placa);

  if (!esPlacaValida(placa)) {
    return res.status(400).json({
      success: false,
      message:
        'Formato de placa no valido. Se esperan de 1 a 4 numeros seguidos de 3 letras (ej: 123ABC).',
      code: 'BAD_PLACA',
    });
  }

  const vehiculo = await consultarPlaca(placa);

  if (!vehiculo) {
    return res.status(404).json({
      success: false,
      message: 'No se encontro ningun vehiculo con esa placa.',
      code: 'PLACA_NOT_FOUND',
    });
  }

  return res.json({
    success: true,
    data: {
      placa: vehiculo.placa,
      proxima_inspeccion: vehiculo.fecha_inspeccion,
      estado_inspeccion: estadoDe(vehiculo.fecha_inspeccion),
      proxima_recalificacion: vehiculo.fecha_recalificacion,
      estado_recalificacion: estadoDe(vehiculo.fecha_recalificacion),
    },
  });
}

/**
 * POST /api/public/chatbot
 * Lo usa WPConnect para resolver si el mensaje del cliente
 * es una consulta de placa. protected por API Key.
 */
export async function chatbot(req, res) {
  const mensaje = String(req.body?.text ?? req.body?.body ?? '').trim();
  const remitente = String(req.body?.from ?? '').trim();

  if (!mensaje || !remitente) {
    return res.json({ status: 'ignored', respuesta: null, vehiculo: null });
  }

  // Se interpreta el mensaje completo como placa, igual que hacia
  // el webhook PHP: se limpian los caracteres no alfanumericos.
  const placa = normalizePlaca(mensaje);

  if (!esPlacaValida(placa)) {
    return res.json({ status: 'ok', respuesta: null, vehiculo: null });
  }

  const vehiculo = await consultarPlaca(placa);

  if (!vehiculo) {
    // respuesta null = el chatbot sigue con sus respuestas oficiales
    return res.json({ status: 'ok', respuesta: null, vehiculo: null });
  }

  return res.json({
    status: 'ok',
    respuesta: buildPlacaMessage(vehiculo),
    vehiculo: {
      placa: vehiculo.placa,
      recal: vehiculo.fecha_recalificacion,
      insp: vehiculo.fecha_inspeccion,
    },
  });
}

/** Clasifica la situacion de una fecha: vencida, proxima o vigente. */
function estadoDe(fechaIso) {
  if (!fechaIso) return 'sin_registro';

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const [y, m, d] = fechaIso.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);

  const dias = Math.ceil((fecha - hoy) / 86400000);

  if (dias < 0) return 'vencido';
  if (dias <= 10) return 'por_vencer';
  return 'vigente';
}
