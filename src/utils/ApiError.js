// ============================================================
//  src/utils/ApiError.js
//  Error de negocio con status HTTP.
//  Lo que se lanza aqui es lo unico que se muestra al frontend.
// ============================================================

export default class ApiError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.expose = true;
  }

  static badRequest(message = 'Solicitud invalida.', code = 'BAD_REQUEST') {
    return new ApiError(400, message, code);
  }

  static unauthorized(message = 'No autenticado.', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'No tienes permisos para esta accion.', code = 'FORBIDDEN') {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Recurso no encontrado.', code = 'NOT_FOUND') {
    return new ApiError(404, message, code);
  }

  static conflict(message = 'El recurso ya existe.', code = 'CONFLICT') {
    return new ApiError(409, message, code);
  }

  static tooManyRequests(message = 'Demasiadas solicitudes.', code = 'RATE_LIMIT') {
    return new ApiError(429, message, code);
  }
}
