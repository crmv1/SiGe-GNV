import { query, queryOne } from '../../config/database.js';

function strToMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minToStr(m) {
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return h + ':' + mm + ':00';
}

export async function obtenerConfig() {
  return queryOne('SELECT * FROM agenda_config WHERE activo=1 LIMIT 1');
}

export async function obtenerBloqueos(fechaInicio, fechaFin) {
  return query(
    'SELECT * FROM agenda_bloqueos WHERE (fecha_fin IS NULL AND fecha_inicio BETWEEN ? AND ?) OR (fecha_fin IS NOT NULL AND fecha_inicio <= ? AND fecha_fin >= ?)',
    [fechaInicio, fechaFin, fechaFin, fechaInicio]
  );
}

export async function contarCitas(fecha, horaInicio, horaFin) {
  const r = await queryOne(
    "SELECT COUNT(*) AS c FROM citas WHERE fecha = ? AND estado NOT IN ('CANCELADA','NO_ASISTIO') AND NOT (hora_fin <= ? OR hora_inicio >= ?)",
    [fecha, horaInicio, horaFin]
  );
  return Number(r.c || 0);
}

export function generarFranjas(config) {
  const inicio = strToMin(config.hora_apertura || '08:00');
  const fin = strToMin(config.hora_cierre || '18:00');
  const dur = Number(config.duracion_cita_min || 60);
  const out = [];
  for (let m = inicio; m + dur <= fin; m += dur) out.push(minToStr(m));
  return out;
}

export { strToMin, minToStr };
