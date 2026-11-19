// ============================================================
//  src/jobs/recordatorios.job.js
//  Tarea programada que consulta MariaDB y deja en cola los
//  avisos de inspeccion y recalificacion (10 dias antes).
//
//  Inspeccion   = fecha registrada + 1 ano.
//  Recalificacion = fecha registrada + 5 anos.
//  Aviso        = 10 dias antes. Solo 10: antes eran 30, 15 y 7.
//
//  Esta tarea NO envia WhatsApp. Solo genera las notificaciones
//  pendientes. El envio lo hace WPConnect, que consume
//  GET /api/integrations/whatsapp/pendientes.
// ============================================================
import cron from 'node-cron';
import env from '../config/env.js';
import { generarNotificacionesPendientes } from '../modules/notificaciones/notificaciones.service.js';
import logger from '../utils/logger.js';

let tarea = null;

async function ejecutar() {
  try {
    const resultado = await generarNotificacionesPendientes();

    if (resultado.creadas > 0) {
      logger.info('Recordatorios: notificaciones generadas', resultado);
    } else {
      logger.info('Recordatorios: sin novedades', {
        revisados: resultado.revisados,
        fecha: resultado.fecha,
      });
    }
  } catch (error) {
    logger.error('Recordatorios: fallo la tarea programada', {
      name: error.name,
      code: error.code,
      message: error.message,
    });
  }
}

export function iniciarJobRecordatorios() {
  if (tarea) return tarea;

  if (!cron.validate(env.cronRecordatorios)) {
    logger.error('CRON_RECORDATORIOS no es una expresion valida. Tarea no iniciada.', {
      valor: env.cronRecordatorios,
    });
    return null;
  }

  tarea = cron.schedule(env.cronRecordatorios, ejecutar, {
    scheduled: true,
    timezone: env.tz,
  });

  logger.info('Job de recordatorios iniciado', { cron: env.cronRecordatorios });

  return tarea;
}

export function detenerJobRecordatorios() {
  if (tarea) {
    tarea.stop();
    tarea = null;
  }
}

export { ejecutar as ejecutarRecordatorios };
