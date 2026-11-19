// ============================================================
//  src/modules/cliente/cliente.notificaciones.service.js
//  Las notificaciones que ve el CLIENTE en su app movil.
//
//  ------------------------------------------------------------
//  DE DONDE SALEN ESTAS NOTIFICACIONES
//  ------------------------------------------------------------
//  No se inventan filas nuevas. Se leen de la tabla
//  `notificaciones`, que es la MISMA que genera el job de
//  WhatsApp (`notificaciones.service.js`) con la vista
//  `v_recordatorios_10d`.
//
//  Esa duplicacion es deliberada y es lo que hace que la app
//  no se contradiga con el mensaje de WhatsApp: si la app
//  guardara sus propias alertas, un cliente podria ver "todo
//  bien" en la app y recibir un aviso por WhatsApp del mismo
//  vencimiento. Una sola fuente, dos canales.
//
//  ------------------------------------------------------------
//  COMO SE SABE QUE SON SUYAS
//  ------------------------------------------------------------
//  `notificaciones` cuelga de un `id_vehiculo`, y el vehiculo
//  cuelga de un `id_cliente`, y el cliente de un `id_usuario`.
//  El filtro se aplica ENTERO en el SQL:
//
//      JOIN vehiculos v  ON v.id = n.id_vehiculo
//      JOIN clientes   c  ON c.id = v.id_cliente
//     WHERE c.id_usuario = ?
//
//  Y `id_usuario` sale del JWT, nunca del parametro. No existe
//  ninguna forma de pedir las notificaciones de otro cliente:
//  cambiar un id en la URL no cambia nada porque no hay ningun
//  id de cliente en la URL.
//
//  ------------------------------------------------------------
//  POR QUE NO SE USA `leida` DE OTRO MODO
//  ------------------------------------------------------------
//  La columna ya existe (la creo la migracion 002 para el
//  WhatsApp). Se reutiliza en vez de crear `leida_en_app`:
//  al cliente le da igual desde donde marco, le importa que el
//  aviso deje de estar pendiente.
// ============================================================
import { query, queryOne } from '../../config/database.js';

/**
 * Devuelve el cliente ligado a una cuenta, o null.
 *
 * Es el mismo criterio que usa `cliente.service.js`. Se repite
 * aqui a proposito: este archivo no importa de aquel para que
 * las notificaciones puedan evolucionar sin arrastrar a los
 * vehiculos, y para que quede claro que el unico camino de
 * entrada es el JWT.
 */
async function idClienteDeUsuario(idUsuario) {
  const fila = await queryOne(
    `SELECT id FROM clientes WHERE id_usuario = ? LIMIT 1`,
    [idUsuario]
  );
  return fila ? fila.id : null;
}

/**
 * Las notificaciones del cliente, de la mas reciente a la mas
 * antigua. [] si la cuenta todavia no esta vinculada a un
 * cliente, o si no tiene ninguna.
 *
 * `solo_no_leidas` filtra para el badge de la pantalla de inicio.
 *
 * No se pide `LIMIT` al usuario final porque no lo necesita: un
 * cliente tiene como mucho unos pocos avisos al ano (dos por
 * vehiculo). El limite duro de 200 es una red de seguridad
 * para que un `vehiculo` mal vinculado no devuelve mil filas y
 * reviente el telefono.
 */
export async function listNotificacionesDeCliente(idUsuario, { soloNoLeidas = false } = {}) {
  const idCliente = await idClienteDeUsuario(idUsuario);
  if (!idCliente) return [];

  return query(
    `SELECT
        n.id_notificacion    AS id,
        n.tipo,
        n.titulo,
        n.mensaje,
        n.leida,
        DATE_FORMAT(n.fecha_programada, '%Y-%m-%d') AS fecha,
        v.placa
      FROM notificaciones n
      JOIN vehiculos v  ON v.id = n.id_vehiculo
      JOIN clientes  c  ON c.id = v.id_cliente
     WHERE c.id_usuario = ?
       ${soloNoLeidas ? 'AND n.leida = 0' : ''}
     ORDER BY n.fecha_programada DESC, n.id_notificacion DESC
     LIMIT 200`,
    [idUsuario]
  );
}

/**
 * Marca UNA notificacion como leida, devolviendo true si se
 * cambio algo.
 *
 * El UPDATE lleva el filtro completo de pertenencia. No se
 * hace un `SELECT` para comprobar de quien es y luego un
 * `UPDATE` a ciegas: en una sola sentencia el "de quien es" y
 * el "cambiar" no se pueden separar. Ademas, si el `UPDATE` no
 * toca filas, no se puede distinguir "ya estaba leida" de "no
 * es tuya", y el controlador responde igual en los dos casos
 * (404). Un cliente no puede usar esto para averiguar si una
 * notificacion ajena existe.
 *
 * Con `leida = 1` en el SET y tambien en el WHERE, una
 * notificacion ya leida no vuelve a contarse como actualizada:
 * `affectedRows` sale en 0 y el controlador responde 404 en vez
 * de un 200 idempotente. No importa: la app solo llama cuando el
 * usuario acaba de tocarla.
 */
export async function marcarNotificacionLeida(idUsuario, idNotificacion) {
  const affected = await query(
    `UPDATE notificaciones n
       JOIN vehiculos v ON v.id = n.id_vehiculo
       JOIN clientes  c ON c.id = v.id_cliente
        SET n.leida = 1
      WHERE n.id_notificacion = ?
        AND c.id_usuario = ?
        AND n.leida = 0`,
    [idNotificacion, idUsuario]
  );

  return affected.affectedRows > 0;
}

/**
 * Cuantas notificaciones sin leer tiene. Va en la respuesta del
 * listado para que la app no tenga que contar en el telefono:
 * asi el badge y la lista siempre coinciden.
 */
export async function contarNoLeidasDeCliente(idUsuario) {
  const idCliente = await idClienteDeUsuario(idUsuario);
  if (!idCliente) return 0;

  const fila = await queryOne(
    `SELECT COUNT(*) AS total
       FROM notificaciones n
       JOIN vehiculos v ON v.id = n.id_vehiculo
       JOIN clientes  c ON c.id = v.id_cliente
      WHERE c.id_usuario = ?
        AND n.leida = 0`,
    [idUsuario]
  );

  return Number(fila?.total ?? 0);
}

// ============================================================
//  DISPOSITIVOS PUSH
// ============================================================
//
//  Que la app registre el token de Expo con el que la va a
//  contactar el backend cuando toque avisar de una inspeccion o
//  una recalificacion.
//
//  NOTA SOBRE EL ALCANCE: registrar el token NO envia nada. El
//  envio real depende de que exista un proceso que use Expo
//  Push API con los tokens guardados aqui. Ese proceso es del
//  backend y se documenta como pendiente; la app solo guarda y
//  mantiene actualizado el token, que es la parte que le
//  corresponde.
// ============================================================

/** Un token de Expo empieza por ExponentPushToken o ExpoPushToken. */
const RE_TOKEN_EXPO = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

/** Tokens de desarrollo: los que entrega Expo sin proyecto propio. */
const RE_TOKEN_DESARROLLO = /^ExponentPushToken\[(?:xxx|replace)[-_A-Za-z0-9]*\]$/;

export function tokenExpoValido(token) {
  if (typeof token !== 'string') return false;
  if (token.length > 255) return false;
  if (RE_TOKEN_DESARROLLO.test(token)) return false;
  return RE_TOKEN_EXPO.test(token);
}

/**
 * Registra o refresca el token push de un telefono.
 *
 * `ON DUPLICATE KEY UPDATE` y no un SELECT-then-INSERT porque
 * `expo_push_token` tiene indice unico: dos intentos de la
 * misma app pueden llegar a la vez y sin transaccion, y con el
 * SELECT-then-INSERT el segundo revienta por clave duplicada.
 *
 * El `id_usuario` se corrige al Dueño real del token. Eso
 * permite que un telefono cambie de cuenta sin dejar el token
 * del anterior: si el token venia de otra sesion, se reasigna.
 * Es lo que espera un `logout` seguido de un `login` con otra
 * cuenta en el mismo celular.
 *
 * Se pone `activo = 1` siempre. Si Expo dice que el token ya no
 * existe (la app se desinstalo), quien lo limpia es el proceso
 * de envio, no este endpoint: desde la app no se puede
 * distinguir "el token caduco" de "el usuario salio un
 * momento".
 */
export async function registrarDispositivo(idUsuario, { token, plataforma }) {
  await query(
    `INSERT INTO dispositivos_push
            (id_usuario, expo_push_token, plataforma, activo)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
            id_usuario        = VALUES(id_usuario),
            plataforma        = VALUES(plataforma),
            activo            = 1,
            fecha_actualizacion = CURRENT_TIMESTAMP`,
    [idUsuario, token, plataforma]
  );

  return queryOne(
    `SELECT id_dispositivo, plataforma, activo,
            DATE_FORMAT(fecha_actualizacion, '%Y-%m-%d %H:%i') AS fecha_actualizacion
       FROM dispositivos_push
      WHERE expo_push_token = ?
      LIMIT 1`,
    [token]
  );
}

/**
 * Desactiva los tokens de este usuario. Se usa al cerrar
 * sesion, no al borrar el token: las filas se conservan para
 * poder reactivarlas si vuelve a entrar, y para tener el
 * historial de que telefono estuvo asociado.
 */
export async function desactivarDispositivosDeUsuario(idUsuario) {
  const affected = await query(
    `UPDATE dispositivos_push
        SET activo = 0,
            fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE id_usuario = ?
        AND activo = 1`,
    [idUsuario]
  );

  return affected.affectedRows;
}
