import { query, queryOne, transaction } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';

export const ESTADOS_CITA = [
  'RESERVADA',
  'CONFIRMADA',
  'EN_ATENCION',
  'COMPLETADA',
  'CANCELADA',
  'NO_ASISTIO',
  'REPROGRAMADA',
];

export const ESTADOS_SERVICIO = ['PENDIENTE', 'EN_PROCESO', 'APROBADO', 'OBSERVADO'];
export const TIPOS_SERVICIO = ['inspeccion', 'recalificacion'];
