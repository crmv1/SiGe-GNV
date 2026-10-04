// ============================================================
//  src/modules/public/public.service.js
//  Consulta de placa para el chatbot de WhatsApp y para
//  cualquier consulta externa.
//
//  REGLA INNEGOCIABLE: este modulo no devuelve jamas datos
//  personales. Ni nombre, ni apellido, ni telefono, ni CI,
//  ni correo. Solo fechas y estados de la placa consultada.
// ============================================================
import { queryOne } from '../../config/database.js';

/**
 * Consulta una placa y devuelve unicamente informacion no personal.
 *
 * El SELECT lista las columnas de forma explicita: no hay SELECT *
 * en este archivo ni en ningun endpoint publico.
 */
export async function consultarPlaca(placaNormalizada) {
  return queryOne(
    `SELECT
        v.placa                                        AS placa,
        DATE_FORMAT(v.fecha_recalificacion, '%Y-%m-%d') AS fecha_recalificacion,
        DATE_FORMAT(v.fecha_inspeccion,     '%Y-%m-%d') AS fecha_inspeccion
       FROM vehiculos v
      WHERE v.placa = ?
      LIMIT 1`,
    [placaNormalizada]
  );
}

/**
 * Arma el texto que responde el chatbot de WhatsApp.
 * Solo con la placa y sus dos fechas, como en el sistema actual.
 */
export function buildPlacaMessage({ placa, fecha_recalificacion, fecha_inspeccion }) {
  return (
    `*- CONSULTA GNV - Placa: ${placa}*\n\n` +
    `- Recalificacion: ${formatearFecha(fecha_recalificacion)}\n` +
    `- Inspeccion anual: ${formatearFecha(fecha_inspeccion)}\n\n` +
    `Tienes alguna pregunta sobre tu vehiculo? Puedo ayudarte.`
  );
}

function formatearFecha(iso) {
  if (!iso) return 'sin fecha registrada';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
