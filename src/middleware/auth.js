// ============================================================
//  src/middleware/auth.js
//  Proteccion de endpoints: JWT para la app web y la movil,
//  API Key para WPConnect.
// ============================================================
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

/** Extrae el token del header Authorization: Bearer <token>. */
function readBearerToken(req) {
  const header = req.get('authorization') || '';
  const [scheme, value] = header.split(' ');

  if (!value || scheme.toLowerCase() !== 'bearer') return null;
  return value.trim();
}

/** Firma un token de sesion. */
export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, rol: user.rol },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

/** Exige un JWT valido. */
export function requireAuth(req, _res, next) {
  const token = readBearerToken(req);

  if (!token) {
    return next(ApiError.unauthorized('No autenticado. Inicia sesion.'));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = {
      id: payload.sub,
      username: payload.username,
      rol: payload.rol,
    };
    return next();
  } catch (error) {
    const message =
      error.name === 'TokenExpiredError'
        ? 'La sesion expiro. Vuelve a iniciar sesion.'
        : 'Sesion no valida. Inicia sesion nuevamente.';
    return next(ApiError.unauthorized(message, 'INVALID_TOKEN'));
  }
}

/**
 * Exige la API Key de WPConnect.
 * La clave va en el header X-API-Key.
 * Nunca se expone al frontend ni a React Native.
 */
export function requireIntegrationKey(req, _res, next) {
  const provided = (req.get('x-api-key') || '').trim();

  if (!provided) {
    return next(ApiError.unauthorized('Falta la API Key de integracion.'));
  }

  if (provided.length !== env.whatsappApiKey.length) {
    return next(ApiError.unauthorized('API Key de integracion invalida.'));
  }

  // Comparacion de tiempo constante para no filtrar informacion por tiempo.
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ env.whatsappApiKey.charCodeAt(i);
  }

  if (diff !== 0) {
    return next(ApiError.unauthorized('API Key de integracion invalida.'));
  }

  return next();
}

/** Exige rol de administrador. */
export function requireAdmin(req, _res, next) {
  if (!req.user) {
    return next(ApiError.unauthorized('No autenticado. Inicia sesion.'));
  }
  if (req.user.rol !== 'administrador') {
    return next(ApiError.forbidden());
  }
  return next();
}

/** Exige rol de administrador o tecnico. */
export function requireStaff(req, _res, next) {
  if (!req.user) {
    return next(ApiError.unauthorized('No autenticado. Inicia sesion.'));
  }
  if (!['administrador', 'tecnico'].includes(req.user.rol)) {
    return next(ApiError.forbidden());
  }
  return next();
}
