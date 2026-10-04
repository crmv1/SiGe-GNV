// ============================================================
//  src/modules/vehiculos/vehiculos.controller.js
// ============================================================
import {
  listVehiculos,
  createVehiculo,
  updateVehiculo,
  deleteVehiculo,
  findVehiculoById,
  validateVehiculoBody,
} from './vehiculos.service.js';
import ApiError from '../../utils/ApiError.js';

/** GET /api/vehiculos */
export async function index(_req, res) {
  const vehiculos = await listVehiculos();
  return res.json({ success: true, vehiculos });
}

/** GET /api/vehiculos/:id */
export async function show(req, res) {
  const vehiculo = await findVehiculoById(Number(req.params.id));

  if (!vehiculo) {
    throw ApiError.notFound('Vehiculo no encontrado.', 'VEHICULO_NOT_FOUND');
  }

  return res.json({ success: true, vehiculo });
}

/**
 * POST /api/vehiculos
 *
 * Devuelve el vehiculo recien creado, no solo el id. Asi el
 * cliente ve de inmediato las fechas que CALCULO el servidor
 * (inspeccion +1 ano, recalificacion +5 anos) y puede
 * comprobarlas contra lo que el usuario escribio. Antes solo
 * devolvia `{ id }` y esos valores quedaban escondidos.
 */
export async function create(req, res) {
  const data = validateVehiculoBody(req.body);
  const id = await createVehiculo(data);
  const vehiculo = await findVehiculoById(id);

  return res.status(201).json({
    success: true,
    id,
    vehiculo,
    message: 'Vehiculo registrado correctamente.',
  });
}

/** PUT /api/vehiculos/:id */
export async function update(req, res) {
  const data = validateVehiculoBody(req.body);

  await updateVehiculo(Number(req.params.id), data);

  // Se devuelve la fila ya guardada para que el frontend vea
  // las fechas recalculadas sin tener que pedir el recurso otra vez.
  const vehiculo = await findVehiculoById(Number(req.params.id));

  return res.json({ success: true, vehiculo, message: 'Vehiculo actualizado correctamente.' });
}

/** DELETE /api/vehiculos/:id — solo administrador */
export async function remove(req, res) {
  await deleteVehiculo(Number(req.params.id));

  return res.json({ success: true, message: 'Vehiculo eliminado correctamente.' });
}
