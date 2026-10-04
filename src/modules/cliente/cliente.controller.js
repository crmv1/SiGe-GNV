// ============================================================
//  src/modules/cliente/cliente.controller.js
// ============================================================
import ApiError from '../../utils/ApiError.js';
import { getResumenCliente, getVehiculoDeCliente } from './cliente.service.js';
import {
  listNotificacionesDeCliente,
  contarNoLeidasDeCliente,
  marcarNotificacionLeida,
  registrarDispositivo,
  desactivarDispositivosDeUsuario,
  tokenExpoValido,
} from './cliente.notificaciones.service.js';

/**
 * GET /api/cliente/vehiculos
 *
 * Pantalla de inicio de la app: quien soy y que autos tengo.
 *
 * El `id_usuario` sale SIEMPRE de `req.user`, que lo puso
 * `requireAuth` al validar el JWT. Nunca del cuerpo ni de la
 * query. Un cliente no puede pedir el resumen de otro cambiando
 * un parametro, porque no hay ningun parametro que lo admita.
 */
export async function index(req, res) {
  const resumen = await getResumenCliente(req.user.id);

  return res.json({ success: true, ...resumen });
}

/**
 * GET /api/cliente/vehiculos/:id
 *
 * Detalle de UN vehiculo del cliente.
 *
 * 404 y no 403 cuando el id existe pero es de otro cliente. Es
 * la decision de seguridad de este endpoint: un 403 confirma
 * "ese auto existe, no es tuyo", y con unos cuantos ids eso
 * permite enumerar la flota del taller confirming si un id
 * existe o no. Un 404 indistinguible entre "no existe" y "no es
 * tuyo" no revela nada.
 */
export async function show(req, res) {
  const idVehiculo = Number(req.params.id);

  // Number('') es 0 y Number('abc') es NaN. Sin esto, un
  // /api/cliente/vehiculos/abc llegaria al SQL como NULL.
  if (!Number.isInteger(idVehiculo) || idVehiculo <= 0) {
    throw ApiError.badRequest('El id del vehiculo no es valido.', 'BAD_ID');
  }

  const vehiculo = await getVehiculoDeCliente(req.user.id, idVehiculo);

  if (!vehiculo) {
    throw ApiError.notFound('Vehiculo no encontrado.', 'VEHICULO_NOT_FOUND');
  }

  return res.json({ success: true, vehiculo });
}

// ============================================================
//  NOTIFICACIONES DEL CLIENTE
// ============================================================

/**
 * GET /api/cliente/notificaciones
 *
 * Lo que el cliente ve en su pantalla de avisos. Solo las suyas:
 * el filtro por `id_usuario` vive en el SQL de
 * `cliente.notificaciones.service.js`, y sale del JWT.
 *
 * `?solo_no_leidas=true` lo usa el badge de inicio.
 *
 * `no_leidas` viene en la respuesta para que la app no tenga que
 * contar filas en el telefono: el badge y la lista se forman de
 * la misma lectura y no pueden discrepar.
 */
export async function notificaciones(req, res) {
  const soloNoLeidas = String(req.query.solo_no_leidas ?? '') === 'true';

  const [lista, noLeidas] = await Promise.all([
    listNotificacionesDeCliente(req.user.id, { soloNoLeidas }),
    contarNoLeidasDeCliente(req.user.id),
  ]);

  return res.json({
    success: true,
    notificaciones: lista.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      titulo: n.titulo,
      mensaje: n.mensaje,
      fecha: n.fecha,
      leida: Boolean(n.leida),
      vehiculo: { placa: n.placa },
    })),
    no_leidas: noLeidas,
  });
}

/**
 * PATCH /api/cliente/notificaciones/:id/leida
 *
 * Marca un aviso como leido.
 *
 * 404 en los tres casos que el cliente NO puede resolver por si
 * mismo: no existe, es de otro cliente, o ya estaba leida. No se
 * distingue entre ellos a proposito, igual que en `show`: un 403
 * confirmaria "ese aviso existe y es de alguien", y con unos
 * cuantos ids eso permite mapear la flota ajena.
 */
export async function marcarLeida(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id de la notificacion no es valido.', 'BAD_ID');
  }

  const cambiada = await marcarNotificacionLeida(req.user.id, id);
  if (!cambiada) {
    throw ApiError.notFound('Notificacion no encontrada.', 'NOTIFICACION_NOT_FOUND');
  }

  return res.json({ success: true, id, leida: true });
}

// ============================================================
//  DISPOSITIVOS PUSH
// ============================================================

/**
 * POST /api/cliente/dispositivos
 *
 * La app manda el token de Expo de este telefono. Lo guarda
 * ligado al `id_usuario` del JWT: no hay ningun `id_usuario` en
 * el cuerpo, asi que es imposible registrar un token en la
 * cuenta de otro.
 *
 * El cuerpo se valida con `tokenExpoValido` ANTES de tocar la
 * base. No es solo higiene: la columna tiene indice unico, y un
 * token invalido que llegara hasta el INSERT dejaria una fila
 * basura que despues habria que limpiar a mano.
 */
export async function crearDispositivo(req, res) {
  const token = req.body?.expo_push_token ?? req.body?.token;
  const plataforma = req.body?.plataforma;

  if (!tokenExpoValido(token)) {
    throw ApiError.badRequest(
      'El token de notificaciones no es valido.',
      'BAD_PUSH_TOKEN'
    );
  }

  if (plataforma !== 'android' && plataforma !== 'ios') {
    throw ApiError.badRequest(
      'La plataforma debe ser android o ios.',
      'BAD_PLATAFORMA'
    );
  }

  const dispositivo = await registrarDispositivo(req.user.id, {
    token: String(token),
    plataforma,
  });

  return res.status(201).json({
    success: true,
    dispositivo: {
      id: dispositivo.id_dispositivo,
      plataforma: dispositivo.plataforma,
      activo: Boolean(dispositivo.activo),
      fecha_actualizacion: dispositivo.fecha_actualizacion,
    },
    message: 'Dispositivo registrado para las notificaciones.',
  });
}

/**
 * POST /api/cliente/dispositivos/desactivar
 *
 * Cierra sesion en la app: apaga los push de ESTA cuenta, para
 * que el telefono no siga recibiendo avisos de un auto que ya
 * no se ve desde esa sesion.
 *
 * Es una llamada explicita y no parte de `POST /auth/logout` a
 * proposito. Son dos cosas distintas: cerrar sesion es una
 * decision del cliente y podria hacerse desde la web tambien, y
 * atar una a la otra haria que el comportamiento dependiera de
 * DONDE se cerro sesion. La app decide cuando llamarla.
 *
 * Aun asi, la app la llama en cada logout, porque es lo
 * esperable para el usuario.
 */
export async function desactivarDispositivos(req, res) {
  const desactivados = await desactivarDispositivosDeUsuario(req.user.id);

  return res.json({
    success: true,
    desactivados,
    message:
      desactivados > 0
        ? 'Notificaciones desactivadas en este dispositivo.'
        : 'No habia dispositivos activos.',
  });
}
