// ============================================================
//  src/ai/vehicleRecognition/vehicleRecognition.controller.js
// ============================================================
import {
  predecirVehiculo,
  consultarMaletera,
  consultarCilindros,
  estimarCosto,
} from './vehicleRecognition.service.js';
import ApiError from '../../utils/ApiError.js';

const TAMANOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANO_MAXIMO = 8 * 1024 * 1024;

/**
 * POST /api/ai/vehicle-recognition
 * multipart/form-data con campo `imagen`.
 */
export async function reconocer(req, res) {
  const archivo = req.file;

  if (!archivo) {
    throw ApiError.badRequest('Se requiere una imagen en el campo "imagen".', 'NO_IMAGE');
  }

  if (!TAMANOS_PERMITIDOS.includes(archivo.mimetype)) {
    throw ApiError.badRequest(
      'Formato no admitido. Usa JPEG, PNG o WebP.',
      'BAD_IMAGE_FORMAT'
    );
  }

  if (archivo.size > TAMANO_MAXIMO) {
    throw ApiError.badRequest('La imagen supera el maximo de 8 MB.', 'IMAGE_TOO_LARGE');
  }

  const resultado = await predecirVehiculo(archivo);

  return res.json(resultado);
}

/** GET /api/ai/maletera?marca=&modelo= */
export async function maletera(req, res) {
  return res.json(consultarMaletera(req.query.marca, req.query.modelo));
}

/**
 * GET /api/ai/cilindros?volumen_litros=
 *
 * Catalogo REFERENCIAL. No consulta el inventario, ni el stock,
 * ni la disponibilidad: son medidas fisicas de mercado, iguales
 * con el deposito vacio o lleno.
 */
export async function cilindros(req, res) {
  return res.json(consultarCilindros({ volumen_litros: req.query.volumen_litros }));
}

/**
 * POST /api/ai/estimacion
 * { capacidad_litros, cantidad }
 *
 * `capacidad_litros` es la capacidad del cilindro del catalogo
 * referencial, no un id de producto. Los precios salen de
 * `parametros_precios`, nunca del inventario.
 */
export async function estimacion(req, res) {
  return res.json(
    await estimarCosto({
      capacidad_litros: req.body?.capacidad_litros ?? null,
      cantidad: req.body?.cantidad,
    })
  );
}
