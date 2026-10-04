// ============================================================
//  src/modules/cliente/cliente.service.js
//  Lo que ve el CLIENTE de su propia cuenta en la app movil.
//
//  ------------------------------------------------------------
//  POR QUE ESTE MODULO Y NO UN ENDPOINT MAS EN `vehiculos`
//  ------------------------------------------------------------
//  `vehiculos` es el panel del taller: lista los 5 vehiculos,
//  sus precios, su historial. Exige rol de personal a proposito,
//  y esta bien que asi sea.
//
//  El cliente no necesita el panel. Necesita una pantalla con
//  SU placa y las dos fechas. Meter eso en `vehiculos` obligaria
//  a aflojar `requireStaff` y abrir un agujero: en cuanto un
//  endpoint de ese modulo acepta a un cliente, el danger es que
//  el siguiente tambien lo acepte por descuido.
//
//  Un modulo aparte, con su propia consulta y su propio
//  `WHERE`, hace que la separacion sea evidente al leer el
//  codigo y no una condicion dispersa.
//
//  ------------------------------------------------------------
//  LA SEPARACION SE APLICA EN EL SQL, NO EN EL CODIGO
//  ------------------------------------------------------------
//  Cada consulta arranca por `clientes.id_usuario = ?`, con el
//  id que viene del JWT. No hay ningun `id` que venga del
//  cliente que se pueda manipular: no se acepta un
//  `?vehiculo_id=` para consultar otro.
//
//  Esa es la diferencia entre "filtrar en JavaScript lo que me
//  salio de un SELECT de todo" y "nunca pedir lo que no me
//  corresponde". Lo segundo no se puede equivocar: si el filtro
//  se olvida, la consulta devuelve menos, no de mas.
// ============================================================
import { query, queryOne } from '../../config/database.js';
import { DIAS_AVISO } from '../notificaciones/notificaciones.service.js';

/**
 * Traduce "faltan N dias" a una etiqueta que la app puede pintar.
 *
 * UMBRAL sale de DIAS_AVISO, que es la MISMA constante que usa
 * el job de WhatsApp. Si mañana el taller cambia el aviso a 15
 * dias, cambia en un solo lugar y las dos pantallas coinciden.
 *
 * El borde de 0 dias se cuenta como 'vence_hoy' y no como
 * 'vigente': un vehiculo que vence hoy ya necesita renovarse.
 */
function estadoDe(dias) {
  if (dias === null || dias === undefined) return 'sin_fecha';
  if (dias < 0) return 'vencido';
  if (dias === 0) return 'vence_hoy';
  if (dias <= DIAS_AVISO[0]) return 'por_vencer';
  return 'vigente';
}

/**
 * Arma el bloque de una fecha (inspeccion o recalificacion) con
 * los dias que faltan y su estado.
 *
 * MariaDB devuelve DATE como 'YYYY-MM-DD' en el driver de texto
 * cuando se usa DATE_FORMAT, y como objeto Date cuando no. Se
 * pide siempre con DATE_FORMAT para no depender de eso y no
 * arriesgar un corrimiento de zona horaria: `new Date('2026-04-20')`
 * se interpreta en UTC, pero si el string viniera con hora seria
 * local y en Bolivia (UTC-4) la fecha retrocederia un dia.
 */
function bloqueDe(fechaRealizada, fechaVencimiento, dias) {
  return {
    fecha_realizada: fechaRealizada ?? null,
    fecha_vencimiento: fechaVencimiento ?? null,
    dias_restantes: dias === null || dias === undefined ? null : Number(dias),
    estado: estadoDe(dias),
  };
}

/**
 * Devuelve el cliente ligado a una cuenta, o null.
 */
export async function findClienteByUsuario(idUsuario) {
  return queryOne(
    `SELECT id, nombre, apellido, telefono
       FROM clientes
      WHERE id_usuario = ?
      LIMIT 1`,
    [idUsuario]
  );
}

/**
 * Lista los vehiculos de un cliente con sus fechas y dias
 * restantes. Devuelve [] si todavia no tiene ninguno.
 *
 * Los LEFT JOIN con inspecciones y recalificaciones son a
 * proposito: un vehiculo recien cargado, al que la migracion 009
 * todavia no le creo renglon, tiene que aparecer igual con las
 * fechas en null. Si se usara JOIN, ese vehiculo desapareceria
 * de la pantalla del cliente justo despues de registrarlo, y
 * pareceria un fallo del sistema.
 */
export async function listVehiculosDeCliente(idCliente) {
  return query(
    `SELECT
        v.id                AS id_vehiculo,
        v.placa             AS placa,
        DATE_FORMAT(i.fecha_realizada,    '%Y-%m-%d') AS inspeccion_realizada,
        DATE_FORMAT(i.fecha_vencimiento, '%Y-%m-%d') AS inspeccion_vencimiento,
        DATEDIFF(i.fecha_vencimiento, CURDATE())    AS inspeccion_dias,
        DATE_FORMAT(r.fecha_realizada,    '%Y-%m-%d') AS recalificacion_realizada,
        DATE_FORMAT(r.fecha_vencimiento, '%Y-%m-%d') AS recalificacion_vencimiento,
        DATEDIFF(r.fecha_vencimiento, CURDATE())    AS recalificacion_dias,
        v.id_cliente     AS id_cliente
      FROM vehiculos v
      LEFT JOIN inspecciones     i   ON i.id_vehiculo = v.id
      LEFT JOIN recalificaciones r   ON r.id_vehiculo = v.id
      WHERE v.id_cliente = ?
      ORDER BY v.placa`,
    [idCliente]
  );
}

/**
 * Un vehiculo de este cliente, o null.
 *
 * El `v.id_cliente = ?` no es decorativo: es la unica barrera
 * entre "mi vehiculo" y "el vehiculo del vecino". Sin el, un
 * cliente que cambiara el 7 por un 8 en la URL leeria la placa y
 * las fechas de otro. Es el mismo IDOR que ya se corrigio en
 * `vehiculos.routes.js`, aplicado del otro lado.
 */
export async function findVehiculoDeCliente(idCliente, idVehiculo) {
  return queryOne(
    `SELECT
        v.id                AS id_vehiculo,
        v.placa             AS placa,
        DATE_FORMAT(i.fecha_realizada,    '%Y-%m-%d') AS inspeccion_realizada,
        DATE_FORMAT(i.fecha_vencimiento, '%Y-%m-%d') AS inspeccion_vencimiento,
        DATEDIFF(i.fecha_vencimiento, CURDATE())    AS inspeccion_dias,
        DATE_FORMAT(r.fecha_realizada,    '%Y-%m-%d') AS recalificacion_realizada,
        DATE_FORMAT(r.fecha_vencimiento, '%Y-%m-%d') AS recalificacion_vencimiento,
        DATEDIFF(r.fecha_vencimiento, CURDATE())    AS recalificacion_dias,
        v.id_cliente     AS id_cliente
      FROM vehiculos v
      LEFT JOIN inspecciones     i   ON i.id_vehiculo = v.id
      LEFT JOIN recalificaciones r   ON r.id_vehiculo = v.id
      WHERE v.id_cliente = ?
        AND v.id = ?
      LIMIT 1`,
    [idCliente, idVehiculo]
  );
}

/**
 * Todo lo que la pantalla de inicio de la app necesita, en una
 * sola llamada: quien sos y que autos tenes.
 *
 * Que la pantalla se arme con UNA peticion no es un lujo. En
 * datos moviles cada llamada extra son segundos de "cargando" y
 * una app que tarda se siente lenta aunque la base sea rapida.
 */
export async function getResumenCliente(idUsuario) {
  const cliente = await findClienteByUsuario(idUsuario);

  // La cuenta existe pero todavia no esta enlazada a ningun
  // cliente. Es el caso normal de alguien recien registrado que
  // el taller aun no asocio a un vehiculo. Se responde 200 con
  // `vinculado: false` en vez de un 404, para que la app pueda
  // mostrar "aun no tenes vehiculos" y no un error.
  if (!cliente) {
    return { vinculado: false, cliente: null, vehiculos: [] };
  }

  const vehiculos = await listVehiculosDeCliente(cliente.id);

  return {
    vinculado: true,
    cliente: {
      id: cliente.id,
      nombre: cliente.nombre,
      apellido: cliente.apellido,
    },
    vehiculos: vehiculos.map((v) => ({
      id_vehiculo: v.id_vehiculo,
      placa: v.placa,
      inspeccion: bloqueDe(v.inspeccion_realizada, v.inspeccion_vencimiento, v.inspeccion_dias),
      recalificacion: bloqueDe(
        v.recalificacion_realizada,
        v.recalificacion_vencimiento,
        v.recalificacion_dias
      ),
    })),
  };
}

/**
 * Un vehiculo puntual del cliente, ya con la forma de la API.
 * null si no es suyo.
 */
export async function getVehiculoDeCliente(idUsuario, idVehiculo) {
  const cliente = await findClienteByUsuario(idUsuario);

  if (!cliente) return null;

  const v = await findVehiculoDeCliente(cliente.id, idVehiculo);

  if (!v) return null;

  return {
    id_vehiculo: v.id_vehiculo,
    placa: v.placa,
    inspeccion: bloqueDe(v.inspeccion_realizada, v.inspeccion_vencimiento, v.inspeccion_dias),
    recalificacion: bloqueDe(
      v.recalificacion_realizada,
      v.recalificacion_vencimiento,
      v.recalificacion_dias
    ),
  };
}
