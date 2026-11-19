import { asyncHandler } from '../../utils/asyncHandler.js';
import { proyectar } from './predicciones.service.js';

/**
 * GET /predicciones?meses=12   (admin / tecnico)
 *
 * Proyección mensual de: recalificaciones, inspecciones,
 * conversiones y capacidad del taller. Devuelve también el modelo de
 * conversiones (pendiente/confiabilidad) y la estimación de ingresos
 * si hay precio configurado.
 */
export const obtenerProyeccion = asyncHandler(async (req, res) => {
  const proyeccion = await proyectar({ meses: req.query.meses });
  res.json({ success: true, ...proyeccion });
});
