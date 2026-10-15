import { asyncHandler } from '../../utils/asyncHandler.js';
import * as disp from './disponibilidad.service.js';
import ApiError from '../../utils/ApiError.js';

export const getDisponibilidad = asyncHandler(async (req, res) => {
  const { fecha, duracion } = req.query;
  if (!fecha) throw ApiError.badRequest('Fecha requerida');
  const slots = await calcularSlots(fecha, duracion ? Number(duracion) : null);
  res.json({ success: true, fecha, slots });
});

async function calcularSlots(fecha, duracionMin) {
  const config = await disp.obtenerConfig();
  if (!config) return [];
  const dur = duracionMin || config.duracion_cita_min || 60;
  const cap = config.capacidad_por_franja || 1;
  // mysql2 devuelve las columnas JSON ya parseadas (como array). Si
  // viniera como string (otro driver / dump), se parsea aqui. Sin este
  // guard, JSON.parse(array) falla: convierte el array a "1,2,3,4,5".
  const crudo = config.dias_laborales;
  const diasLab = Array.isArray(crudo) ? crudo : JSON.parse(crudo || '[1,2,3,4,5]');
  const d = new Date(fecha + 'T00:00:00');
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  if (!diasLab.includes(dow)) return [];
  const bloqueos = await disp.obtenerBloqueos(fecha, fecha);
  const hayBloqueoDia = bloqueos.some(b => b.todo_el_dia && b.fecha_inicio <= fecha && (b.fecha_fin === null || b.fecha_fin >= fecha));
  if (hayBloqueoDia) return [];
  const [hA,mA] = (config.hora_apertura||'08:00:00').split(':').map(Number);
  const [hC,mC] = (config.hora_cierre||'18:00:00').split(':').map(Number);
  let s = hA*60+mA; const e = hC*60+mC;
  const result = [];
  while (s + dur <= e) {
    const hi = Math.floor(s/60).toString().padStart(2,'0')+':'+(s%60).toString().padStart(2,'0')+':00';
    const hf = Math.floor((s+dur)/60).toString().padStart(2,'0')+':'+((s+dur)%60).toString().padStart(2,'0')+':00';
    const ocup = await disp.contarCitas(fecha, hi, hf);
    if (ocup < cap) result.push({ hora_inicio: hi, hora_fin: hf, disponible: cap - ocup });
    s += dur;
  }
  return result;
}
