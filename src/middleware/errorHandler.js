// ============================================================
//  src/middleware/errorHandler.js
//  Nunca se devuelve detalle SQL al frontend.
//  El error tecnico queda solo en el log del servidor.
// ============================================================
import multer from 'multer';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

const GENERIC_MESSAGE = 'No fue posible procesar la solicitud.';

/** 404 para rutas que no existen. */
export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Ruta no encontrada: ${req.method} ${req.path}`));
}

/**
 * Manejador central. Siempre responde en el mismo formato:
 *   { success: false, message, code? }
 */
export function errorHandler(error, req, res, _next) {
  // --- Errores de negocio: su mensaje si es seguro mostrarlo ---
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      logger.error(`${req.method} ${req.originalUrl} -> ${error.code}`, {
        detail: error.message,
      });
    }
    return res.status(error.status).json({
      success: false,
      message: error.message,
      code: error.code || undefined,
    });
  }

  // --- JSON malformado ---
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      success: false,
      message: 'El cuerpo de la peticion no es JSON valido.',
      code: 'BAD_JSON',
    });
  }

  // --- Imagen demasiado grande ---
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: 'No se pudo procesar el archivo enviado.',
      code: error.code,
    });
  }

  // --- Cualquier otro error: detalle solo al log ---
  logger.error(`Error no controlado en ${req.method} ${req.originalUrl}`, {
    name: error.name,
    code: error.code,
    sqlState: error.sqlState,
    message: error.message,
  });

  return res.status(500).json({
    success: false,
    message: GENERIC_MESSAGE,
    code: 'INTERNAL_ERROR',
  });
}
