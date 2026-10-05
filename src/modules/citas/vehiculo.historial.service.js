import { query } from '../../config/database.js';

export async function historialVehiculo(vehiculoId) {
  const items = [];
  const citas = await query('SELECT id, fecha, hora_inicio, estado, tipo_servicio, observaciones, created_at FROM citas WHERE vehiculo_id=? ORDER BY created_at ASC', [vehiculoId]);
  for (const c of citas) {
    items.push({ tipo: 'cita', fecha: c.fecha, hora: c.hora_inicio, estado: c.estado, datos: c });
    const h = await query('SELECT estado_anterior, estado_nuevo, observaciones, created_at FROM cita_estados_historial WHERE cita_id=? ORDER BY created_at ASC', [c.id]);
    for (const hh of h) items.push({ tipo: 'cita_cambio_estado', fecha: c.fecha, creado: hh.created_at, datos: hh });
  }
  const res = await query('SELECT * FROM inspecciones_resultados WHERE vehiculo_id=? ORDER BY created_at ASC', [vehiculoId]);
  for (const r of res) items.push({ tipo: 'resultado_inspeccion', creado: r.created_at, datos: r });
  items.sort((a,b)=> new Date(a.creado||a.fecha||'2000') - new Date(b.creado||b.fecha||'2000'));
  return items;
}
