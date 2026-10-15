// ============================================================
//  src/modules/auth/activacion.controller.js
// ============================================================
import { signToken } from '../../middleware/auth.js';
import { emitirCodigo, activarCuenta } from './activacion.service.js';
import { encolarActivacion } from '../notificaciones/notificaciones.service.js';

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
 *
 * Si el body trae `enviar_whatsapp: true`, el codigo se encola en
 * la cola de notificaciones (tipo 'activacion') para que WPConnect
 * lo mande al telefono del cliente.
 */
export async function crearCodigo(req, res) {
  const resultado = await emitirCodigo(req.body?.telefono);

  let encolado = false;
  if (req.body?.enviar_whatsapp) {
    const nombre = `${resultado.cliente.nombre} ${resultado.cliente.apellido}`.trim();
    const mensaje =
      `Hola ${nombre}, tu código para activar tu cuenta en SIGE-GNV VC GAS es: ${resultado.codigo}. ` +
      `Válido por ${resultado.expira_en_dias} días. Descarga la app y usá este código junto con el usuario y contraseña que quieras.`;
    const id = await encolarActivacion({ telefono: resultado.telefono, mensaje });
    encolado = Boolean(id);
  }

  return res.status(201).json({
    success: true,
    ...resultado,
    encolado_whatsapp: encolado,
    message: encolado
      ? 'Código generado y en cola de envío por WhatsApp. También se muestra abajo: es la única vez que aparece.'
      : 'Codigo generado. Entrégaselo al cliente: es la única vez que se muestra.',
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
