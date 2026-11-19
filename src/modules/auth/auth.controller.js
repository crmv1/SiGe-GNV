// ============================================================
//  src/modules/auth/auth.controller.js
// ============================================================
import { signToken } from '../../middleware/auth.js';
import { verifyCredentials, toPublicUser, findUserById } from './auth.service.js';

/** POST /api/auth/login */
export async function login(req, res) {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Usuario y contrasena son requeridos.',
      code: 'BAD_REQUEST',
    });
  }

  const user = await verifyCredentials(String(username).trim(), String(password));

  return res.json({
    success: true,
    user: toPublicUser(user),
    token: signToken(user),
  });
}

/** GET /api/auth/me */
export async function me(req, res) {
  const user = await findUserById(req.user.id);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'La cuenta ya no existe.',
      code: 'UNAUTHORIZED',
    });
  }

  return res.json({ success: true, user: toPublicUser(user) });
}

/**
 * POST /api/auth/logout
 * El JWT es sin estado, asi que el cierre de sesion ocurre en el
 * cliente descartando el token. Este endpoint existe para que el
 * frontend tenga un contrato uniforme.
 */
export async function logout(_req, res) {
  return res.json({ success: true, message: 'Sesion cerrada correctamente.' });
}
