import { query, queryOne } from '../../config/database.js';

export async function obtenerConfig() {
  return queryOne('SELECT * FROM agenda_config WHERE activo = 1 LIMIT 1');
}

export async function actualizarConfig(id, datos, usuarioId) {
  const campos = [];
  const params = [];
  if (datos.dias_laborales) { campos.push('dias_laborales=?'); params.push(JSON.stringify(datos.dias_laborales)); }
  if (datos.hora_apertura) { campos.push('hora_apertura=?'); params.push(datos.hora_apertura); }
  if (datos.hora_cierre) { campos.push('hora_cierre=?'); params.push(datos.hora_cierre); }
  if (datos.duracion_cita_min) { campos.push('duracion_cita_min=?'); params.push(datos.duracion_cita_min); }
  if (datos.descansos !== undefined) { campos.push('descansos=?'); params.push(datos.descansos ? JSON.stringify(datos.descansos) : null); }
  if (datos.capacidad_por_franja) { campos.push('capacidad_por_franja=?'); params.push(datos.capacidad_por_franja); }
  if (!campos.length) return obtenerConfig();
  params.push(id);
  await query('UPDATE agenda_config SET ' + campos.join(', ') + ', updated_at=NOW() WHERE id=?', params);
  return obtenerConfig();
}
