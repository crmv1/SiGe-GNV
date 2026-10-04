// ============================================================
//  src/modules/notificaciones/notificaciones.service.js
//  Genera y administra la cola de notificaciones en MariaDB.
//
//  Tabla `notificaciones`: una fila por aviso programado.
//  Estados: pendiente -> enviada | error
//
//  Los avisos se generan a partir de las fechas que ya estan en
//  `vehiculos`: fecha_recalificacion y fecha_inspeccion.
//  La tabla historica `recordatorios_enviados` se conserva sin
//  tocar, para no perder el historial que ya existe.
//
//  REGLA DE NEGOCIO
//    inspeccion     = fecha en que se hizo + 1 ano
//    recalificacion = fecha en que se hizo + 5 anos
//    aviso          = 10 dias antes de esa fecha
// ============================================================
import { query, queryOne } from '../../config/database.js';

/**
 * Dias de anticipacion con los que se avisa.
 *
 * SOLO 10 dias. Antes eran 30, 15 y 7; se dejo un unico aviso
 * porque el taller pidio un solo recordatorio, no tres. No
 * volver a agregar dias aqui sin confirmar con el taller: cada
 * valor added genera un aviso mas por vehiculo.
 */
export const DIAS_AVISO = [10];

const TIPOS = ['recalificacion', 'inspeccion'];

/**
 * Calcula el estado de una fecha objetivo.
 * Devuelve los dias de anticipacion que aplican hoy, o null.
 */
export function diasDeAviso(fechaIso, hoy = new Date()) {
  if (!fechaIso) return null;

  const [y, m, d] = fechaIso.split('-').map(Number);
  const objetivo = new Date(y, m - 1, d);

  const referencia = new Date(hoy);
  referencia.setHours(0, 0, 0, 0);

  const dias = Math.round((objetivo - referencia) / 86400000);

  return DIAS_AVISO.includes(dias) ? dias : null;
}

/**
 * Genera las notificaciones pendientes.
 *
 * Recorre `vehiculos` y crea una notificacion por cada combinacion
 * (vehiculo, tipo, dias de anticipacion) que corresponda hoy y que
 * aun no tenga registro.
 *
 * El indice unico de la tabla evita duplicados, asi que se puede
 * correr cuantas veces se quiera sin efecto.
 */
export async function generarNotificacionesPendientes() {
  const hoy = new Date();
  const hoyIso = hoy.toISOString().slice(0, 10);

  const candidatos = await query(
    `SELECT id,
            nombre,
            apellido,
            telefono,
            DATE_FORMAT(fecha_recalificacion, '%Y-%m-%d') AS fecha_recalificacion,
            DATE_FORMAT(fecha_inspeccion,     '%Y-%m-%d') AS fecha_inspeccion
       FROM vehiculos`
  );

  let creadas = 0;

  for (const v of candidatos) {
    for (const tipo of TIPOS) {
      const fecha = tipo === 'recalificacion' ? v.fecha_recalificacion : v.fecha_inspeccion;
      const dias = diasDeAviso(fecha, hoy);

      if (dias === null) continue;

      // El historial viejo evita reavisar algo que ya se notifico.
      const yaEnviado = await queryOne(
        `SELECT id FROM recordatorios_enviados
          WHERE vehiculo_id = ? AND tipo = ?
          LIMIT 1`,
        [v.id, tipo]
      );

      if (yaEnviado) continue;

      const nombreCompleto = `${v.nombre} ${v.apellido}`.trim();
      const fechaLegible = formatearFecha(fecha);

      // El aviso es del VEHICULO, no del cilindro. La recalificacion
      // se asocia al auto por su fecha real; no hay ningun
      // `id_cilindro` que ate la relacion.
      const mensaje =
        tipo === 'recalificacion'
          ? `Hola ${nombreCompleto}, recordatorio: la recalificacion de tu vehiculo vence el ${fechaLegible}. Agenda tu cita en nuestro taller.`
          : `Hola ${nombreCompleto}, tu inspeccion anual GNV vence el ${fechaLegible}. No dejes pasar la fecha. Te esperamos!`;

      const titulo = tipo === 'recalificacion' ? 'Recalificacion del vehiculo' : 'Inspeccion anual';

      const resultado = await query(
        `INSERT IGNORE INTO notificaciones
           (id_vehiculo, tipo, dias_anticipacion, titulo, mensaje, telefono,
            fecha_programada, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
        [v.id, tipo, dias, titulo, mensaje, v.telefono, fecha]
      );

      if (resultado.affectedRows > 0) creadas += 1;
    }
  }

  return { revisados: candidatos.length, creadas, fecha: hoyIso };
}

/**
 * Lista las notificaciones pendientes de enviar.
 * Es lo que consume WPConnect.
 *
 * El limite se interpola y no se parametriza a proposito: MariaDB exige
 * un entero literal en LIMIT dentro de un prepared statement. El valor
 * se acota a un entero antes de llegar aqui, asi que no hay concatenacion
 * de entrada del usuario.
 */
export async function listarPendientes(limite = 20) {
  const seguro = Math.min(Math.max(Number.parseInt(limite, 10) || 20, 1), 100);

  return query(
    `SELECT n.id_notificacion,
            n.tipo,
            n.dias_anticipacion,
            n.titulo,
            n.mensaje,
            n.telefono,
            DATE_FORMAT(n.fecha_programada, '%Y-%m-%d') AS fecha_programada
       FROM notificaciones n
      WHERE n.estado = 'pendiente'
      ORDER BY n.fecha_programada, n.id_notificacion
      LIMIT ${seguro}`
  );
}

export async function marcarEnviada(id) {
  const resultado = await query(
    `UPDATE notificaciones
        SET estado = 'enviada',
            fecha_envio = NOW(),
            intentos = intentos + 1
      WHERE id_notificacion = ? AND estado = 'pendiente'`,
    [id]
  );

  return resultado.affectedRows > 0;
}

export async function marcarError(id, detalle = null) {
  const resultado = await query(
    `UPDATE notificaciones
        SET estado = 'error',
            ultimo_error = ?,
            intentos = intentos + 1
      WHERE id_notificacion = ?`,
    // El SQL tiene dos marcadores: el texto del error y el id.
    // Faltaba pasar el id, y MariaDB respondia con error 500.
    [detalle ? String(detalle).slice(0, 500) : null, id]
  );

  return resultado.affectedRows > 0;
}

/** Devuelve la notificacion indicada, o null. */
export async function obtenerNotificacion(id) {
  return queryOne(
    `SELECT id_notificacion, tipo, titulo, estado, telefono,
            DATE_FORMAT(fecha_programada, '%Y-%m-%d') AS fecha_programada
       FROM notificaciones
      WHERE id_notificacion = ?
      LIMIT 1`,
    [id]
  );
}

function formatearFecha(iso) {
  if (!iso) return 'sin fecha';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
