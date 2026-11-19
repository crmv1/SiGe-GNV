// ============================================================
//  src/modules/auth/auth.service.js
//  Autenticacion contra MariaDB con bcrypt + JWT.
// ============================================================
import bcrypt from 'bcryptjs';
import { queryOne } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';

/**
 * Busca un usuario activo por nombre de usuario.
 * Solo trae las columnas necesarias: nunca hay un SELECT * aca.
 */
export async function findUserByUsername(username) {
  return queryOne(
    `SELECT id, username, password, rol, estado
       FROM usuarios
      WHERE username = ?
      LIMIT 1`,
    [username]
  );
}

export async function findUserById(id) {
  return queryOne(
    `SELECT id, username, rol, estado
       FROM usuarios
      WHERE id = ?
      LIMIT 1`,
    [id]
  );
}

/**
 * Verifica credenciales.
 * Mismo mensaje para usuario inexistente y password incorrecto,
 * para no revelar que cuentas existen.
 *
 * Los hashes actuales del proyecto son de PHP password_verify
 * ($2y$10$...), que bcryptjs verifica sin problema.
 */
export async function verifyCredentials(username, password) {
  const user = await findUserByUsername(username);

  if (!user) {
    // Se ejecuta un bcrypt ficticio para que el tiempo de respuesta
    // no revele si el usuario existe o no.
    await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    throw ApiError.unauthorized('Credenciales incorrectas.', 'BAD_CREDENTIALS');
  }

  const ok = await bcrypt.compare(password, user.password);

  if (!ok) {
    throw ApiError.unauthorized('Credenciales incorrectas.', 'BAD_CREDENTIALS');
  }

  if (user.estado && user.estado !== 'activo') {
    throw ApiError.forbidden('La cuenta esta desactivada. Contacta al administrador.');
  }

  return { id: user.id, username: user.username, rol: user.rol };
}

/**
 * Prepara la respuesta publica de un usuario.
 * Nunca incluye el hash de la contrasena.
 */
export function toPublicUser(user) {
  return { id: user.id, username: user.username, rol: user.rol };
}
