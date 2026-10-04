// ============================================================
//  src/modules/auth/activacion.service.js
//  Alta de cuentas de cliente desde la app movil.
//
//  ------------------------------------------------------------
//  EL FLUJO
//  ------------------------------------------------------------
//    1. El taller pide un codigo para un telefono.
//       POST /auth/codigos   { telefono }
//    2. Se lo manda al cliente (WhatsApp, papel, de frente).
//    3. El cliente se registra con el codigo.
//       POST /auth/activar  { username, password, codigo }
//    4. La cuenta queda creada, activa y enlazada al cliente.
//
//  El paso 1 lo hace el personal, no el publico. Si cualquiera
//  pudiera emitir su propio codigo, la activacion no probaria
//  nada: bastaria con pedir un codigo para el telefono de otro
//  y registrarse como el.
//
//  ------------------------------------------------------------
//  POR QUE SHA-256 Y NO BCRYPT
//  ------------------------------------------------------------
//  El hash se guarda para poder BUSCAR el codigo cuando el
//  cliente lo teclea. bcrypt no sirve para eso: es aleatorio por
//  diseño (sal distinta cada vez), asi que el mismo codigo
//  produce un hash distinto y no hay forma de indexarlo ni de
//  escribir `WHERE codigo_hash = ?`.
//
//  Un hash sin sal se puede partir, asi que el riesgo real es un
//  ataque de_dictionary contra el hash robado. Con un codigo de
//  10 caracteres de un alfabeto de 32 son 2^50 combinaciones
//  (~1.1 billones). Con fecha de expiracion, de un solo uso y
//  limite de intentos, no es atacable.
//
//  En una contrasena el panorama es otro: el usuario elige la
//  contrasena, es corta y se puede adivinar, y ahi si hace falta
//  bcrypt. Por eso el codigo va con SHA-256 y la contrasena con
//  bcrypt, en la misma funcion.
//
//  La normalizacion (mayusculas y sin guiones) va ANTES de
//  hashear. Si no, el codigo "a1b2-c3d4" y el "A1B2C3D4"
//  serian codigos distintos y el cliente tendria que acertar el
//  formato al teclearlo.
// ============================================================
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, queryOne, transaction } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';

// Sin I, O, 0, 1 ni L: son los caracteres que se confunden al
// leerlos de un papel o dictarlos por telefono. Un codigo que se
// dicta equivocado es un cliente que tiene que volver al taller.
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LARGO_CODIGO = 10;
const DIAS_VIGENCIA = 7;
const INTENTOS_MAXIMOS = 5;
const BCRYPT_ROUNDS = 10;

/** Genera un codigo aleatorio sin sesgo. */
function generarCodigo() {
  let codigo = '';

  for (let i = 0; i < LARGO_CODIGO; i += 1) {
    // randomInt rechaza el sesgo de un `%` sobre el alfabeto.
    codigo += ALFABETO[crypto.randomInt(0, ALFABETO.length)];
  }

  // Se agrupa de a cinco para dictarlo: "A1B2C-D3E4F" se lee
  // mucho mejor que "A1B2CD3E4F".
  return `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
}

/** Deja el codigo comparable: sin guiones, en mayusculas. */
export function normalizarCodigo(codigo) {
  return String(codigo ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * SHA-256 en hexadecimal, sin sal, para que sea consultable.
 * Ver la nota de arriba sobre por que no bcrypt.
 */
function hashearCodigo(codigoNormalizado) {
  return crypto.createHash('sha256').update(codigoNormalizado, 'utf8').digest('hex');
}

/** Telefono solo digitos, como lo guarda el resto del sistema. */
function normalizarTelefono(telefono) {
  return String(telefono ?? '').replace(/[^0-9]/g, '');
}

/**
 * Emite un codigo para un cliente. Solo personal.
 *
 * Invalida los codigos anteriores sin usar de ese cliente: si se
 * emitieron dos y el cliente teclea el viejo, el sistema tiene
 * que rechazar, no adivinar. Ademas reduce elVentana de ataque,
 * que con SHA-256 sin sal es lo unico que se puede hacer.
 *
 * El codigo en claro se devuelve UNA sola vez, aqui. No se
 * guarda y no hay forma de recuperarlo: si el cliente lo pierde,
 * el taller emite otro. Por eso el taller tiene que leerlo de la
 * pantalla o anotarlo antes de cerrar.
 */
export async function emitirCodigo(telefono) {
  const tel = normalizarTelefono(telefono);

  if (tel.length < 6) {
    throw ApiError.badRequest('El telefono no parece valido.', 'BAD_PHONE');
  }

  const cliente = await queryOne(
    'SELECT id, nombre, apellido, telefono, id_usuario FROM clientes WHERE telefono = ? LIMIT 1',
    [tel]
  );

  if (!cliente) {
    // No se crea el cliente aqui a proposito. Si se creara, el
    // endpoint publico de activacion seria una puerta para
    // inventarse un cliente y un vehiculo a medida.
    throw ApiError.notFound(
      'Ese telefono no corresponde a ningun cliente registrado.',
      'CLIENTE_NO_ENCONTRADO'
    );
  }

  if (cliente.id_usuario) {
    throw ApiError.conflict(
      'Ese cliente ya tiene una cuenta activada.',
      'CLIENTE_YA_ACTIVADO'
    );
  }

  const codigo = generarCodigo();
  const hash = hashearCodigo(normalizarCodigo(codigo));

  await transaction(async (conn) => {
    // Los codigos viejos del mismo cliente dejan de servir.
    await conn.execute(
      'UPDATE codigos_activacion SET fecha_expiracion = NOW() WHERE id_cliente = ? AND usado = 0',
      [cliente.id]
    );

    await conn.execute(
      `INSERT INTO codigos_activacion (id_cliente, telefono, codigo_hash, fecha_expiracion)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [cliente.id, cliente.telefono, hash, DIAS_VIGENCIA]
    );
  });

  return {
    codigo,
    cliente: { id: cliente.id, nombre: cliente.nombre, apellido: cliente.apellido },
    telefono: cliente.telefono,
    expira_en_dias: DIAS_VIGENCIA,
  };
}

/**
 * Canjea un codigo y crea la cuenta.
 *
 * Devuelve el token ya firmado, igual que un login: el cliente
 * no tiene que canjear y despues verse a entrar por separado.
 */
export async function activarCuenta({ username, password, codigo, signer }) {
  const user = String(username ?? '').trim();
  const clave = String(password ?? '');
  const hash = hashearCodigo(normalizarCodigo(codigo));

  if (!user || !clave) {
    throw ApiError.badRequest('Faltan datos para activar la cuenta.', 'MISSING_FIELDS');
  }

  if (clave.length < 8) {
    throw ApiError.badRequest(
      'La contrasena debe tener al menos 8 caracteres.',
      'WEAK_PASSWORD'
    );
  }

  const encontrado = await queryOne(
    `SELECT id, id_cliente, telefono, fecha_expiracion, usado
       FROM codigos_activacion
      WHERE codigo_hash = ?
      LIMIT 1`,
    [hash]
  );

  // "No existe" y "ya se uso" comparten mensaje a proposito: si
  // se distinguieran, quien teclea codigos al azar sabria cuando
  // esta cerca de acertar, y no lo necesita.
  if (!encontrado || encontrado.usado === 1) {
    throw ApiError.badRequest('El codigo no es valido.', 'CODIGO_INVALIDO');
  }

  // La expiracion SI tiene mensaje propio, y es una decision
  // consciente de usabilidad: el codigo existe y fue valido, solo
  // que vencio. Decirselo al cliente evita que insista probando
  // variantes de un codigo que nunca mas va a funcionar, y lo
  // manda directo a pedir uno nuevo. Lo que se filtra es que ese
  // codigo existio, no hacia donde lleva ni a quien pertenece.
  if (new Date(encontrado.fecha_expiracion).getTime() <= Date.now()) {
    throw ApiError.badRequest('El codigo expiro. Pide uno nuevo al taller.', 'CODIGO_EXPIRADO');
  }

  if (!encontrado.id_cliente) {
    // Codigo emitido antes de la migracion 010. Se rechaza en vez
    // de adivinar a quien pertenece.
    throw ApiError.badRequest('El codigo no es valido.', 'CODIGO_INVALIDO');
  }

  const cliente = await queryOne(
    'SELECT id, nombre, apellido, id_usuario FROM clientes WHERE id = ? LIMIT 1',
    [encontrado.id_cliente]
  );

  if (!cliente) {
    throw ApiError.badRequest('El codigo no es valido.', 'CODIGO_INVALIDO');
  }

  if (cliente.id_usuario) {
    throw ApiError.conflict('Ese cliente ya tiene una cuenta activada.', 'CLIENTE_YA_ACTIVADO');
  }

  const existente = await queryOne('SELECT id FROM usuarios WHERE username = ? LIMIT 1', [user]);

  if (existente) {
    throw ApiError.conflict('Ese nombre de usuario ya existe.', 'USUARIO_DUPLICADO');
  }

  const hashClave = await bcrypt.hash(clave, BCRYPT_ROUNDS);

  const idUsuario = await transaction(async (conn) => {
    // ----------------------------------------------------------------
    //  1. Reclamar el codigo de forma atomica, antes de nada.
    //
    //  Este es el punto que cierra la carrera. Todo lo de arriba son
    //  lecturas: dos peticiones simultaneas con el mismo codigo las
    //  ven IGUALES (usado=0, cliente sin cuenta, usuario libre) y las
    //  dos seguirian adelante. La unica escritura que decide quien
    //  gana es esta, y decide una sola vez:
    //
    //     UPDATE ... WHERE id=? AND usado=0 AND fecha_expiracion>NOW()
    //
    //  InnoDB bloquea la fila. La segunda peticion espera, y cuando la
    //  primera confirma ve `usado=1`, no matchea nada y aborta. Con
    //  `affectedRows !== 1` se sabe que otro gano el canje. Da igual el
    //  nivel de aislamiento: la guarda esta en el WHERE.
    //
    //  Va PRIMERO a proposito. Si algo falla despues, la transaccion
    //  se revierte entera y el codigo vuelve a estar disponible, que
    //  es justo lo que se buscaba al no consumirlo hasta el final.
    // ----------------------------------------------------------------
    const [reclamo] = await conn.execute(
      `UPDATE codigos_activacion
          SET usado = 1, fecha_uso = NOW()
        WHERE id = ? AND usado = 0 AND fecha_expiracion > NOW()`,
      [encontrado.id]
    );

    if (reclamo.affectedRows !== 1) {
      throw ApiError.badRequest('El codigo no es valido.', 'CODIGO_INVALIDO');
    }

    // ----------------------------------------------------------------
    //  2. Crear la cuenta. El canje ya esta ganado, asi que este
    //  INSERT ya no puede fallar por codigo usado.
    // ----------------------------------------------------------------
    const [resultado] = await conn.execute(
      `INSERT INTO usuarios (username, password, rol, estado) VALUES (?, ?, 'cliente', 'activo')`,
      [user, hashClave]
    );

    const nuevoId = resultado.insertId;

    // Se estampa quien redimio el codigo, ahora que ya hay id.
    await conn.execute(
      'UPDATE codigos_activacion SET id_usuario = ? WHERE id = ?',
      [nuevoId, encontrado.id]
    );

    // ----------------------------------------------------------------
    //  3. Enlazar cliente <-> cuenta, tambien de forma atomica.
    //
    //  El `id_usuario IS NULL` es la segunda red. Sin ella, el paso 3
    //  de un segundo proceso sobrescribe el vinculo del primero y
    //  queda una cuenta huerfana: existe, no ve vehiculos, y el
    //  cliente ya no puede volver a activarse porque su vinculo
    //  apunta a otro. Con la guarda, la segunda no matchea, revierte
    //  su transaccion y su reclamo del paso 1 se suelta solo.
    //
    //  Es el peor fallo posible porque es invisible: el usuario entra
    //  con sesion valida y ve "sin vehiculos", sin pista de que algo
    //  este roto.
    // ----------------------------------------------------------------
    const [vinculo] = await conn.execute(
      'UPDATE clientes SET id_usuario = ? WHERE id = ? AND id_usuario IS NULL',
      [nuevoId, cliente.id]
    );

    if (vinculo.affectedRows !== 1) {
      throw ApiError.conflict(
        'Ese cliente ya tiene una cuenta activada.',
        'CLIENTE_YA_ACTIVADO'
      );
    }

    return nuevoId;
  });

  // El rol va como literal, igual que en middleware/auth.js. No
  // hay un enumerado central de roles y agregarlo solo para este
  // archivo dejaria dos formas de escribir lo mismo.
  const rol = 'cliente';

  return {
    id: idUsuario,
    username: user,
    rol,
    cliente: { id: cliente.id, nombre: cliente.nombre, apellido: cliente.apellido },
    token: signer({ id: idUsuario, username: user, rol }),
  };
}

/**
 * Estado de los codigos de un cliente. Para la pantalla del
 * taller, que tiene que saber si ya le mando uno.
 */
export async function listarCodigosDeCliente(idCliente) {
  return query(
    `SELECT id, telefono, fecha_creacion, fecha_expiracion, usado, fecha_uso
       FROM codigos_activacion
      WHERE id_cliente = ?
      ORDER BY fecha_creacion DESC
      LIMIT 10`,
    [idCliente]
  );
}

export { generarCodigo, hashearCodigo, DIAS_VIGENCIA, INTENTOS_MAXIMOS };
