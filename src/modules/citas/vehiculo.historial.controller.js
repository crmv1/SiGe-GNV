import { asyncHandler } from '../../utils/asyncHandler.js';
import { historialVehiculo } from './vehiculo.historial.service.js';
import { queryOne } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';

export const getHistorialVehiculo = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const v = await queryOne('SELECT id, id_cliente FROM vehiculos WHERE id=?', [id]);
  if (!v) throw ApiError.notFound();
  if (req.user.rol === 'cliente') {
    const c = await queryOne('SELECT id FROM clientes WHERE id_usuario=?', [req.user.id]);
    if (!c || c.id !== v.id_cliente) throw ApiError.forbidden();
  }
  const h = await historialVehiculo(id);
  res.json({ success: true, historial: h });
});
