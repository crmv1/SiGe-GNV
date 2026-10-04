// ============================================================
//  src/modules/vehiculos/vehiculos.service.js
//  Acceso a la tabla `vehiculos`, tal como esta hoy en MariaDB:
//  el propietario (nombre, apellido, telefono) vive en la misma
//  fila que la placa y las fechas de inspeccion y recalificacion.
//
//  REGLA DE NEGOCIO DE LAS FECHAS
//    inspeccion     = fecha en que se hizo la inspeccion + 1 ano
//    recalificacion = fecha en que se hizo la recalificacion + 5 anos
//
//  `fecha_inspeccion` y `fecha_recalificacion` guardan la fecha
//  de VENCIMIENTO, no la del trabajo. Quien captura el vehiculo
//  puede mandar la fecha del trabajo en `fecha_inspeccion_realizada`
//  y `fecha_recalificacion_realizada`; el backend calcula sola la
//  de vencimiento. Si no se mandan, se acepta la fecha de
//  vencimiento tal cual, como antes, para no romper lo ya cargado.
// ============================================================
import { query, queryOne, transaction } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';

/** Anos de validez de cada tipo de trabajo. */
export const ANIOS_INSPECCION = 1;
export const ANIOS_RECALIFICACION = 5;

const CAMPOS = `
  v.id,
  v.nombre,
  v.apellido,
  v.placa,
  DATE_FORMAT(v.fecha_recalificacion, '%Y-%m-%d') AS fecha_recalificacion,
  DATE_FORMAT(v.fecha_inspeccion,     '%Y-%m-%d') AS fecha_inspeccion,
  v.telefono,
  DATE_FORMAT(v.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
  ins.fecha_realizada AS fecha_inspeccion_realizada,
  rec.fecha_realizada AS fecha_recalificacion_realizada
`;

/**
 * Los JOIN a `inspecciones` y `recalificaciones`.
 *
 * Van como LEFT porque no todos los vehiculos tienen las dos
 * filas: los cargados antes de la migracion 009 conservan solo las
 * columnas planas, y sus fechas reales son NULL a proposito. Perder
 * un INNER JOIN dejaria esos vehiculos sin aparecer en la lista del
 * taller, que es peor que mostrarlos con la fecha real vacia.
 */
const JOIN_FECHAS = `
  LEFT JOIN inspecciones    ins ON ins.id_vehiculo = v.id
  LEFT JOIN recalificaciones rec ON rec.id_vehiculo = v.id
`;

/**
 * Formato de placa boliviana: de 1 a 4 numeros seguidos de
 * exactamente 3 letras. Ejemplos validos: 1ABC, 12ABC, 123ABC,
 * 1234ABC. El orden es fijo: numeros primero, letras despues.
 */
export const PLACA_REGEX = /^\d{1,4}[A-Z]{3}$/;

/**
 * Normaliza la placa: sin espacios, guiones ni signos, en
 * mayusculas. Permite escribirla como el usuario la teclea
 * ("1234-abc", " 1234 ABC ") y deja siempre el formato interno
 * 1234ABC.
 */
export function normalizePlaca(placa) {
  return String(placa ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** True si la placa cumple el formato 123ABC / 1234ABC. */
export function esPlacaValida(placa) {
  return PLACA_REGEX.test(normalizePlaca(placa));
}

/** Valida el formato de fecha YYYY-MM-DD. */
export function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Suma anos a una fecha YYYY-MM-DD.
 *
 * Se hace con setUTCFullYear a proposito: sumar 12 meses con
 * Date es un bug clasico. El 29 de febrero mas 1 ano cae en
 * el 1 de marzo de 2025 segun el calendario gregoriano, y un
 * taller que trabaja con fechas reales tiene vehiculos con
 * inspeccion el 29/02. Se deja que caiga en 1 de marzo, que es
 * lo que dice la ley, y no en 28/02.
 */
export function sumarAnios(fechaIso, anios) {
  const [y, m, d] = fechaIso.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCFullYear(fecha.getUTCFullYear() + anios);
  return fecha.toISOString().slice(0, 10);
}

/** Fecha de vencimiento de una inspeccion: la del trabajo + 1 ano. */
export function proximaInspeccion(fechaRealizada) {
  return sumarAnios(fechaRealizada, ANIOS_INSPECCION);
}

/** Fecha de vencimiento de una recalificacion: la del trabajo + 5 anos. */
export function proximaRecalificacion(fechaRealizada) {
  return sumarAnios(fechaRealizada, ANIOS_RECALIFICACION);
}

/** Valida y normaliza el cuerpo de un vehiculo. */
export function validateVehiculoBody(body = {}) {
  const nombre = String(body.nombre ?? '').trim();
  const apellido = String(body.apellido ?? '').trim();
  const placa = normalizePlaca(body.placa);
  const telefono = String(body.telefono ?? '').replace(/[^0-9]/g, '');

  // Fechas del trabajo, si el frontend las manda. Son opcionales:
  // si no vienen se usan las de vencimiento directas de siempre.
  const inspeccionRealizada = String(body.fecha_inspeccion_realizada ?? '').trim();
  const recalificacionRealizada = String(body.fecha_recalificacion_realizada ?? '').trim();

  let fechaInspeccion;
  let fechaRecalificacion;

  if (inspeccionRealizada) {
    if (!isValidDate(inspeccionRealizada)) {
      throw ApiError.badRequest('Formato de fecha invalido. Use YYYY-MM-DD.', 'BAD_DATE');
    }
    fechaInspeccion = proximaInspeccion(inspeccionRealizada);
  } else {
    fechaInspeccion = String(body.fecha_inspeccion ?? '').trim();
  }

  if (recalificacionRealizada) {
    if (!isValidDate(recalificacionRealizada)) {
      throw ApiError.badRequest('Formato de fecha invalido. Use YYYY-MM-DD.', 'BAD_DATE');
    }
    fechaRecalificacion = proximaRecalificacion(recalificacionRealizada);
  } else {
    fechaRecalificacion = String(body.fecha_recalificacion ?? '').trim();
  }

  // El vehiculo NO tiene marca ni modelo. Se decidio que esos
  // datos no forman parte del registro del taller: lo que se guarda
  // es el propietario, la placa y las fechas. Cualquier marca o
  // modelo que llegue en el cuerpo se ignora a proposito.

  const campos = [
    ['nombre', nombre],
    ['apellido', apellido],
    ['placa', placa],
    ['fecha_recalificacion', fechaRecalificacion],
    ['fecha_inspeccion', fechaInspeccion],
    ['telefono', telefono],
  ];

  const faltan = campos.filter(([, valor]) => valor === '').map(([campo]) => campo);

  if (faltan.length > 0) {
    throw ApiError.badRequest(
      `Faltan campos obligatorios: ${faltan.join(', ')}.`,
      'MISSING_FIELDS'
    );
  }

  if (isValidDate(inspeccionRealizada) && isValidDate(recalificacionRealizada)) {
    // Ambas fechas de trabajo son coherentes entre si: la
    // recalificacion siempre cae despues que la inspeccion.
    if (fechaRecalificacion < fechaInspeccion) {
      throw ApiError.badRequest(
        'La recalificacion no puede vencer antes que la inspeccion.',
        'FECHAS_INCONSISTENTES'
      );
    }
  }

  if (!isValidDate(fechaRecalificacion) || !isValidDate(fechaInspeccion)) {
    throw ApiError.badRequest('Formato de fecha invalido. Use YYYY-MM-DD.', 'BAD_DATE');
  }

  if (!esPlacaValida(placa)) {
    throw ApiError.badRequest(
      'La placa no tiene un formato valido. Se esperan de 1 a 4 numeros seguidos de 3 letras (ej: 123ABC).',
      'BAD_PLACA'
    );
  }

  // Lo que se guarda de un cliente es: nombre, celular, vehiculo,
  // placa, fecha de inspeccion y fecha de recalificacion. Nada mas.
  //
  // NO se guardan datos del cilindro (serie, capacidad, tipo).
  // El cilindro no es una entidad del taller: no hay tabla
  // `cilindros` ni columna `vehiculos.id_cilindro`.
  //
  // Lo unico que la IA aporta es una recomendacion de MEDIDA
  // (que capacidad cabe en la maletera) y un precio referencial
  // de `parametros_precios`. Ninguna de las dos cosas se guarda
  // aca, y ninguna depende del inventario: el taller puede no
  // tener el cilindro recomendado y la recomendacion sigue
  // siendo valida.
  //
  // Lo que sí se guarda, y es lo que cuenta, son las fechas
  // reales del vehiculo.
  return {
    nombre,
    apellido,
    placa,
    fechaRecalificacion,
    fechaInspeccion,
    telefono,
    fechaInspeccionRealizada: inspeccionRealizada || null,
    fechaRecalificacionRealizada: recalificacionRealizada || null,
  };
}

export async function listVehiculos() {
  return query(
    `SELECT ${CAMPOS}
       FROM vehiculos v
       ${JOIN_FECHAS}
      ORDER BY v.apellido, v.nombre`
  );
}

export async function findVehiculoById(id) {
  return queryOne(
    `SELECT ${CAMPOS}
       FROM vehiculos v
       ${JOIN_FECHAS}
      WHERE v.id = ?
      LIMIT 1`,
    [id]
  );
}

export async function findVehiculoByPlaca(placa) {
  return queryOne(
    `SELECT ${CAMPOS}
       FROM vehiculos v
       ${JOIN_FECHAS}
      WHERE v.placa = ?
      LIMIT 1`,
    [placa]
  );
}

/**
 * Normaliza a `clientes` y devuelve su id.
 *
 * Busca por la clave unica (nombre, apellido, telefono). Si no
 * existe, crea el cliente. Asi una persona con dos vehiculos
 * queda con un solo registro de cliente, y la app movil puede
 * mostrar "mis vehiculos" con un solo JOIN.
 */
async function asegurarCliente(conn, { nombre, apellido, telefono }) {
  await conn.execute(
    `INSERT IGNORE INTO clientes (nombre, apellido, telefono) VALUES (?, ?, ?)`,
    [nombre, apellido, telefono]
  );

  const [rows] = await conn.execute(
    `SELECT id FROM clientes WHERE nombre = ? AND apellido = ? AND telefono = ? LIMIT 1`,
    [nombre, apellido, telefono]
  );

  return rows[0].id;
}

/**
 * Escribe el par (fecha_realizada, fecha_vencimiento) de una
 * inspeccion o una recalificacion.
 *
 * `fecha_realizada` puede venir NULL: significa "no consta" y NO
 * se adivina. `fecha_vencimiento` es obligatorio porque es el
 * dato que usan los recordatorios.
 *
 * Se escribe siempre junto a las columnas planas de `vehiculos`
 * (doble escritura) para que, durante la transicion, el job
 * viejo y la vista nueva nunca discrepen.
 */
async function guardarFecha(conn, tabla, idVehiculo, realizada, vencimiento) {
  await conn.execute(
    `INSERT INTO ${tabla} (id_vehiculo, fecha_realizada, fecha_vencimiento)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       fecha_realizada    = VALUES(fecha_realizada),
       fecha_vencimiento = VALUES(fecha_vencimiento)`,
    [idVehiculo, realizada, vencimiento]
  );
}


export async function createVehiculo(data) {
  return transaction(async (conn) => {
    const [existe] = await conn.execute(
      'SELECT id FROM vehiculos WHERE placa = ? LIMIT 1',
      [data.placa]
    );

    if (existe.length > 0) {
      throw ApiError.conflict(`La placa ${data.placa} ya esta registrada.`, 'DUPLICATE_PLACA');
    }

    // Cliente primero: vehiculos.id_cliente lo necesita.
    const idCliente = await asegurarCliente(conn, data);

    const [resultado] = await conn.execute(
      `INSERT INTO vehiculos
         (nombre, apellido, placa, fecha_recalificacion, fecha_inspeccion, telefono, id_cliente)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.nombre,
        data.apellido,
        data.placa,
        data.fechaRecalificacion,
        data.fechaInspeccion,
        data.telefono,
        idCliente,
      ]
    );

    const idVehiculo = resultado.insertId;

    await guardarFecha(conn, 'inspecciones', idVehiculo, data.fechaInspeccionRealizada, data.fechaInspeccion);
    await guardarFecha(conn, 'recalificaciones', idVehiculo, data.fechaRecalificacionRealizada, data.fechaRecalificacion);

    return idVehiculo;
  });
}

export async function updateVehiculo(id, data) {
  return transaction(async (conn) => {
    const [rows] = await conn.execute('SELECT id FROM vehiculos WHERE id = ? LIMIT 1', [id]);

    if (rows.length === 0) {
      throw ApiError.notFound('Vehiculo no encontrado.', 'VEHICULO_NOT_FOUND');
    }

    const [dup] = await conn.execute(
      'SELECT id FROM vehiculos WHERE placa = ? AND id <> ? LIMIT 1',
      [data.placa, id]
    );

    if (dup.length > 0) {
      throw ApiError.conflict(
        `La placa ${data.placa} ya esta asignada a otro vehiculo.`,
        'DUPLICATE_PLACA'
      );
    }

    const idCliente = await asegurarCliente(conn, data);

    await conn.execute(
      `UPDATE vehiculos
          SET nombre = ?, apellido = ?, placa = ?,
              fecha_recalificacion = ?, fecha_inspeccion = ?, telefono = ?,
              id_cliente = ?
        WHERE id = ?`,
      [
        data.nombre,
        data.apellido,
        data.placa,
        data.fechaRecalificacion,
        data.fechaInspeccion,
        data.telefono,
        idCliente,
        id,
      ]
    );

    // Las columnas planas y las tablas nuevas se escriben juntas.
    await guardarFecha(conn, 'inspecciones', id, data.fechaInspeccionRealizada, data.fechaInspeccion);
    await guardarFecha(conn, 'recalificaciones', id, data.fechaRecalificacionRealizada, data.fechaRecalificacion);

    // Si cambiaron las fechas, se borra el historial de recordatorios
    // para que puedan volver a enviarse. Mismo criterio que antes en PHP.
    await conn.execute('DELETE FROM recordatorios_enviados WHERE vehiculo_id = ?', [id]);
    // Tambien se limpian las notificaciones pendientes de este vehiculo.
    await conn.execute(
      `DELETE FROM notificaciones
        WHERE id_vehiculo = ? AND estado = 'pendiente'`,
      [id]
    );
  });
}

/**
 * Borra un vehiculo.
 *
 * Las inspecciones y recalificaciones caen en cascada, asi que no
 * queda nada huerfano. El cliente NO se borra: puede tener otro
 * vehiculo, y borrarle el registro dejaria su cuenta movil
 * apuntando a la nada.
 */
export async function deleteVehiculo(id) {
  const result = await query('DELETE FROM vehiculos WHERE id = ?', [id]);

  if (result.affectedRows === 0) {
    throw ApiError.notFound('Vehiculo no encontrado.', 'VEHICULO_NOT_FOUND');
  }
}
