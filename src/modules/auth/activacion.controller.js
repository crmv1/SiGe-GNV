// ============================================================
//  src/modules/auth/activacion.controller.js
// ============================================================
import { signToken } from '../../middleware/auth.js';
import { emitirCodigo, activarCuenta } from './activacion.service.js';

/**
 * POST /auth/codigos
 *
 * El taller emite un codigo para un telefono. Exige rol de
 * personal: lo pone el router con requireStaff.
 *
 * El codigo en claro se devuelve en la respuesta y no se vuelve a
 * guardar. Si el cliente lo pierde, hay que emitir otro. Es
 * deliberado: si el sistema guardara el codigo, un dump de la
 * base bastaria para activar cuentas ajenas.
 */
export async function crearCodigo(req, res) {
  const resultado = await emitirCodigo(req.body?.telefono);

  return res.status(201).json({
    success: true,
    ...resultado,
    message:
      'Codigo generado. Entrégaselo al cliente: es la única vez que se muestra.',
  });
}

/**
 * POST /auth/activar
 *
 * El cliente canjea el codigo y recibe su token. No exige sesion:
 * todavia no tiene cuenta.
 */
export async function activar(req, res) {
  const resultado = await activarCuenta({
    username: req.body?.username,
    password: req.body?.password,
    codigo: req.body?.codigo,
    // Se pasa el firmador desde afuera en vez de importar el
    // middleware: asi activacion.service.js no depende de
    // middleware/auth.js y se puede probar sin levantar la app.
    signer: (user) => signToken(user),
  });

  return res.status(201).json({
    success: true,
    token: resultado.token,
    user: { id: resultado.id, username: resultado.username, rol: resultado.rol },
    cliente: resultado.cliente,
    message: 'Cuenta activada. Ya puedes ver tus vehiculos.',
  });
}
