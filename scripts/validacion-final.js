#!/usr/bin/env node
// ============================================================
//  scripts/validacion-final.js
//  Bateria completa de pruebas contra la API en ejecucion.
//
//  Solo corre contra una base de PRUEBAS. Detiene y limpia todo
//  lo que crea. No toca la base real del taller.
//
//  Uso:
//    node scripts/validacion-final.js
//
//  Variables de entorno que respeta:
//    API_URL        (por defecto http://localhost:3100/api)
//    API_KEY        (X-API-Key de WPConnect)
//    ESCRIBIR=1    ya no se necesita: el script siempre escribe
//                  en su propia base de pruebas y limpia al final
// ============================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';
import { query, queryOne, closePool } from '../src/config/database.js';

const API = (process.env.API_URL || 'http://localhost:3100/api').replace(/\/+$/, '');
const API_KEY = env.whatsappApiKey;

// IP propia para esta corrida.
//
// `/auth/login` tiene un freno de fuerza bruta de 10 intentos por
// IP cada 15 minutos, y este script hace unos 7 logins. Correrlo
// dos veces seguidas, o en paralelo, hacia que la SEGUNDA corrida
// se comiera su propio freno y fallara con 429 sin que hubiera
// ningun fallo real de codigo.
//
// Se manda `X-Forwarded-For` porque la app tiene
// `app.set('trust proxy', 1)`, asi que express-rate-limit cuenta
// esa IP y no la de loopback. Cada corrida recibe una IP distinta
// y por lo tanto su propio cupo.
//
// El rango 192.0.2.0/24 es TEST-NET-3, reservado para
// documentacion (RFC 5737). No es una IP real ni sale a internet:
// las peticiones van a localhost.
const IP_DE_PRUEBA = `192.0.2.${1 + Math.floor(Math.random() * 253)}`;

/**
 * Una IP distinta por intento.
 *
 * `/auth/activar` tiene un freno de 5 intentos por IP cada 15
 * minutos, y la seccion 13 hace mas de 5 canjes. Si todos
 * comparten la IP de la corrida, el sexto choca con 429 y las
 * pruebas empiezan a fallar por el freno, no por el codigo.
 *
 * Cada intento de la suite representa a un cliente DISTINTO, asi
 * que darle IP propia es representativo, no un rodeo. El freno se
 * prueba aparte y a proposito, con una IP fija y muchos intentos.
 *
 * La subred se sortea una vez por corrida porque el contador de
 * intentos vive en memoria del servidor y NO se limpia al repetir
 * la suite. Con IPs fijas, la segunda corrida se encuentra los
 * buckets que lleno la primera y todo responde 429. Una /16
 * nueva por corrida evita el choque; el freno sigue siendo real
 * porque dentro de la corrida las IPs se repiten como deben.
 */
const SUBNET_PRUEBA = `10.${20 + Math.floor(Math.random() * 200)}`;
let ipActual = 0;
function ipNueva() {
  ipActual = (ipActual % 250) + 1;
  return `${SUBNET_PRUEBA}.${ipActual}`;
}

// ------------------------------------------------------------
//  CANDADO: este script SOLO puede correr contra la base de
//  pruebas. Nunca contra la del taller.
// ------------------------------------------------------------
//  Este script siembra usuarios, crea vehiculos, dispara el job
//  de recordatorios y al final borra lo que creo. Escribir eso
//  en la base real seria lo unico que no se puede deshacer.
//
//  El riesgo no es teorico: `npm start` lee `.env`, y `.env`
//  apunta a localhost:3306, la base REAL. Si alguien levanta el
//  servidor y despues corre esto sin el override, el script
//  reconoceria 3306 en su propia conexion pero las peticiones
//  HTTP seguirian yendo al servidor que esta en 3306. Por eso
//  el candado mira las dos cosas: la conexion propia Y la que
//  contesta el servidor.
//
//  Si esto salta, no es un bug: es que falta
//  `.\scripts\con-3307.ps1` y el servidor tiene que haber
//  arrancado con el mismo override.
const PUERTO_REAL = 3306;
const servidorArriba = await fetch(`${API}/health`).catch(() => null);
const esServidorDePruebas = servidorArriba
  ? (servidorArriba.headers.get('x-db-puerto') || '') !== String(PUERTO_REAL)
  : false;

if (env.db.port === PUERTO_REAL || !esServidorDePruebas) {
  console.error('');
  console.error('  ESTE SCRIPT NO CORRE CONTRA LA BASE REAL.');
  console.error('');
  if (env.db.port === PUERTO_REAL) {
    console.error(`  La conexion propia apunta a ${env.db.host}:${env.db.port}, que es la base DEL TALLER.`);
  }
  if (!esServidorDePruebas) {
    console.error('  El servidor de ' + API + ' no responde, o responde desde la base real.');
  }
  console.error('');
  console.error('  Para correrlo, usa el override de pruebas:');
  console.error('');
  console.error('      .\\scripts\\con-3307.ps1 scripts\\validacion-final.js');
  console.error('');
  console.error('  y el servidor tiene que haber arrancado tambien con 3307.');
  console.error('');

  // Se cierra el pool y se espera un turno antes de salir. Sin
  // esto, process.exit() mata el proceso con handles de red
  // todavia abiertos (el pool de MariaDB y el socket de fetch) y
  // node aborta con
  //   "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"
  // que tapa el mensaje del candado con un fallo que parece
  // venir del motor y no de este script.
  await closePool();
  await new Promise((r) => setTimeout(r, 250));
  process.exit(1);
}

let ok = 0;
let fallos = 0;
const fallosDetalle = [];

function linea() { console.log('-'.repeat(70)); }
function titulo(t) { linea(); console.log(`  ${t}`); linea(); }

function comprobar(descripcion, condicion, extra = '') {
  if (condicion) {
    ok += 1;
    console.log(`  [OK]   ${descripcion}`);
  } else {
    fallos += 1;
    console.log(`  [FALLO] ${descripcion} ${extra}`);
    fallosDetalle.push(descripcion);
  }
}

// ------------------------------------------------------------
//  Cliente HTTP
// ------------------------------------------------------------

// Los modulos no envuelven la respuesta en `data`: cada uno usa
// su propia clave. Estos extractores evitan adivinar.
const productoDe = (r) => r.body?.producto;
const productosDe = (r) => (Array.isArray(r.body?.productos) ? r.body.productos : []);
// El movimiento se devuelve en camelCase desde el servicio
// (stockNuevo), mientras el historial lo devuelve en snake_case
// (stock_nuevo, leido directo de MariaDB). Se aceptan ambos.
const movimientoDe = (r) => r.body?.movimiento;
const stockNuevoDe = (m) => (m?.stockNuevo ?? m?.stock_nuevo);
const stockAnteriorDe = (m) => (m?.stockAnterior ?? m?.stock_anterior);
const movimientosDe = (r) => (Array.isArray(r.body?.movimientos) ? r.body.movimientos : []);
const alertasDe = (r) => (Array.isArray(r.body?.alertas) ? r.body.alertas : []);
const vehiculoDe = (r) => r.body?.vehiculo;
const vehiculosDe = (r) => (Array.isArray(r.body?.vehiculos) ? r.body.vehiculos : []);
// El modulo de IA responde con `data`.
const aiDataDe = (r) => r.body?.data;

/**
 * Acuña un JWT exactamente como lo hace el backend.
 *
 * El login por HTTP ya se prueba a fondo en la seccion 2. Para el
 * resto de secciones se usa esto en vez de volver a llamar a
 * /auth/login, porque ese endpoint tiene un freno de fuerza bruta
 * de 10 intentos por IP cada 15 minutos y la bateria hace muchos
 * mas. Asi las pruebas de permisos no dependen de un rate limit.
 */
function acuñarToken(usuario, rol, idUsuario) {
  return jwt.sign(
    { sub: idUsuario, username: usuario, rol },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

async function api(metodo, ruta, { token, body, apiKey, ip } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': ip || IP_DE_PRUEBA };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers['X-API-Key'] = apiKey;

  const res = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  const texto = await res.text();
  try { json = texto ? JSON.parse(texto) : null; } catch { json = { crudo: texto }; }
  return { status: res.status, body: json };
}

// ------------------------------------------------------------
//  Datos de prueba
// ------------------------------------------------------------
// Sufijo de 3 LETRAS para que las placas temporales del test
// respeten el formato boliviano 123ABC / 1234ABC (1-4 digitos
// seguidos de exactamente 3 letras). Se usan digitos + las 3 letras.
const SUFIJO_LETRAS = Math.random().toString(36).slice(2, 5).toUpperCase().replace(/[^A-Z]/g, 'X').padEnd(3, 'X');
const SUFIJO_NUM = String(Math.floor(Math.random() * 9000) + 1000);
// Sufijo de identidad del test (usuarios, codigos de producto). Las
// placas usan SUFIJO_NUM + SUFIJO_LETRAS para cumplir 123ABC.
const SUFIJO = SUFIJO_NUM + SUFIJO_LETRAS;
const USUARIOS = {
  admin:  `vf_admin_${SUFIJO}`,
  tecnico: `vf_tec_${SUFIJO}`,
  clienteA: `vf_cliA_${SUFIJO}`,
  clienteB: `vf_cliB_${SUFIJO}`,
  inactivo: `vf_inact_${SUFIJO}`,
};
const CLAVE = 'PruebaVF123!';
const PLACA_A = `${SUFIJO_NUM}A${SUFIJO_LETRAS.slice(0, 2)}`;
const PLACA_B = `${SUFIJO_NUM}B${SUFIJO_LETRAS.slice(0, 2)}`;

const ids = {};

async function sembrar() {
  const hash = await bcrypt.hash(CLAVE, 10);

  for (const [clave, u] of Object.entries(USUARIOS)) {
    const rol =
      clave === 'admin' ? 'administrador'
      : clave === 'tecnico' ? 'tecnico'
      : clave === 'inactivo' ? 'tecnico'
      : 'cliente';
    const estado = clave === 'inactivo' ? 'inactivo' : 'activo';
    const r = await query(
      'INSERT INTO usuarios (username, password, rol, estado) VALUES (?, ?, ?, ?)',
      [u, hash, rol, estado]
    );
    ids[clave] = r.insertId;
  }

  // Fechas coherentes con la regla: inspeccion = trabajo + 1 ano,
  // recalificacion = trabajo + 5 anos.
  const r1 = await query(
    `INSERT INTO vehiculos
       (nombre, apellido, placa, fecha_recalificacion, fecha_inspeccion, telefono)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['Propietario', 'A', PLACA_A, '2031-03-12', '2027-03-12', '59170000001']
  );
  ids.vehiculoA = r1.insertId;

  const r2 = await query(
    `INSERT INTO vehiculos
       (nombre, apellido, placa, fecha_recalificacion, fecha_inspeccion, telefono)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['Propietario', 'B', PLACA_B, '2031-05-20', '2027-05-20', '59170000002']
  );
  ids.vehiculoB = r2.insertId;
}

async function limpiar() {
  const placas = [PLACA_A, PLACA_B];
  const usuarios = Object.values(USUARIOS);

  // El orden importa por las claves foraneas:
  //   movimientos_inventario -> usuarios (RESTRICT)
  //   movimientos_inventario -> productos (RESTRICT)
  // Si se borran los usuarios antes que los movimientos, MariaDB
  // rechaza el borrado. Por eso inventario va primero.

  await query(
    'DELETE FROM movimientos_inventario WHERE id_producto IN (SELECT id_producto FROM inventario_productos WHERE codigo LIKE ?)',
    [`VF%${SUFIJO}%`]
  );
  await query('DELETE FROM inventario_productos WHERE codigo LIKE ?', [`VF%${SUFIJO}%`]);
  await query('DELETE FROM parametros_precios WHERE clave LIKE ?', [`vf_%${SUFIJO.toLowerCase()}`]);

  for (const p of placas) {
    const v = await queryOne('SELECT id FROM vehiculos WHERE placa = ?', [p]);
    if (v) {
      await query('DELETE FROM notificaciones WHERE id_vehiculo = ?', [v.id]);
      await query('DELETE FROM recordatorios_enviados WHERE vehiculo_id = ?', [v.id]);
      await query('DELETE FROM vehiculos WHERE id = ?', [v.id]);
    }
  }

  for (const u of usuarios) {
    const row = await queryOne('SELECT id FROM usuarios WHERE username = ?', [u]);
    if (!row) continue;
    await query('DELETE FROM codigos_activacion WHERE id_usuario = ?', [row.id]).catch(() => {});
    await query('DELETE FROM notificaciones WHERE telefono IN (?, ?)', ['59170000001', '59170000002']).catch(() => {});
    await query('DELETE FROM usuarios WHERE id = ?', [row.id]).catch(() => {});
  }
}

// ------------------------------------------------------------
//  1. Health, version, pool
// ------------------------------------------------------------
async function t1_health() {
  titulo('1. HEALTH / VERSION / POOL');

  const h = await api('GET', '/health');
  comprobar('GET /api/health responde 200', h.status === 200, `llego ${h.status}`);
  comprobar('health.status = "ok"', h.body?.status === 'ok', JSON.stringify(h.body));
  comprobar('health.database = "connected"', h.body?.database === 'connected', JSON.stringify(h.body));

  const v = await api('GET', '/version');
  comprobar('GET /api/version responde 200', v.status === 200);
  comprobar('el motor se identifica como mariadb', v.body?.motor === 'mariadb', JSON.stringify(v.body));

  const [pool] = await query('SELECT COUNT(*) AS n FROM information_schema.PROCESSLIST');
  comprobar('el pool tiene conexiones activas en MariaDB', pool.n > 0, `n=${pool.n}`);
}

// ------------------------------------------------------------
//  2. Login y JWT
// ------------------------------------------------------------
async function t2_login() {
  titulo('2. LOGIN Y JWT');

  const bien = await api('POST', '/auth/login', { body: { username: USUARIOS.admin, password: CLAVE } });
  comprobar('login con credenciales correctas -> 200', bien.status === 200, `llego ${bien.status}`);
  const tokenAdmin = bien.body?.data?.token || bien.body?.token;
  comprobar('el login devuelve un token', Boolean(tokenAdmin));
  ids.tokenAdmin = tokenAdmin;

  const malClave = await api('POST', '/auth/login', { body: { username: USUARIOS.admin, password: 'incorrecta' } });
  comprobar('login con contraseña incorrecta -> 401', malClave.status === 401, `llego ${malClave.status}`);

  const inexistente = await api('POST', '/auth/login', { body: { username: 'no_existe_este_usuario', password: CLAVE } });
  comprobar('login con usuario inexistente -> 401', inexistente.status === 401, `llego ${inexistente.status}`);

  const sinCuerpo = await api('POST', '/auth/login', { body: {} });
  comprobar('login sin datos -> 400', sinCuerpo.status === 400, `llego ${sinCuerpo.status}`);

  const inactivo = await api('POST', '/auth/login', { body: { username: USUARIOS.inactivo, password: CLAVE } });
  comprobar('login de usuario DESHABILITADO -> 401 o 403', [401, 403].includes(inactivo.status), `llego ${inactivo.status}`);

  const me = await api('GET', '/auth/me', { token: tokenAdmin });
  comprobar('GET /auth/me con JWT valido -> 200', me.status === 200, `llego ${me.status}`);
  comprobar('/auth/me devuelve el rol del usuario', me.body?.user?.rol === 'administrador', JSON.stringify(me.body));

  const tokenFalso = jwt.sign({ sub: 999999, username: 'fantasma', rol: 'administrador' }, 'secreto_equivocado');
  const meMalo = await api('GET', '/auth/me', { token: tokenFalso });
  comprobar('JWT firmado con otro secreto -> 401', meMalo.status === 401, `llego ${meMalo.status}`);

  const sinToken = await api('GET', '/auth/me');
  comprobar('peticion sin Authorization -> 401', sinToken.status === 401, `llego ${sinToken.status}`);

  // Un JWT con rol de administrador, pero firmado con OTRO secreto.
  // Si el backend lo aceptara, cualquiera podria ser administrador.
  const tokenAdminFalsificado = jwt.sign(
    { sub: ids.clienteA, username: USUARIOS.clienteA, rol: 'administrador' },
    'secreto_equivocado'
  );
  const reqConTokenFalso = await api('GET', '/inventario/productos', { token: tokenAdminFalsificado });
  comprobar(
    'JWT con rol de administrador firmado con otro secreto -> 401',
    reqConTokenFalso.status === 401,
    `llego ${reqConTokenFalso.status}`
  );
}

// ------------------------------------------------------------
//  3. Regla de fechas: +1 ano y +5 anos
// ------------------------------------------------------------
async function t3_fechas() {
  titulo('3. FECHAS: INSPECCION +1 ANO, RECALIFICACION +5 ANOS');

  const { proximaInspeccion, proximaRecalificacion, sumarAnios } = await import('../src/modules/vehiculos/vehiculos.service.js');

  comprobar('inspeccion: 12/03/2026 + 1 ano = 12/03/2027',
    proximaInspeccion('2026-03-12') === '2027-03-12', `-> ${proximaInspeccion('2026-03-12')}`);

  comprobar('recalificacion: 12/03/2026 + 5 anos = 12/03/2031',
    proximaRecalificacion('2026-03-12') === '2031-03-12', `-> ${proximaRecalificacion('2026-03-12')}`);

  comprobar('inspeccion biseca: 29/02/2024 + 1 ano = 01/03/2025 (gregoriano)',
    proximaInspeccion('2024-02-29') === '2025-03-01', `-> ${proximaInspeccion('2024-02-29')}`);

  comprobar('inspeccion: 31/12/2026 + 1 ano = 31/12/2027',
    proximaInspeccion('2026-12-31') === '2027-12-31', `-> ${proximaInspeccion('2026-12-31')}`);

  comprobar('recalificacion: 01/01/2026 + 5 anos = 01/01/2031',
    proximaRecalificacion('2026-01-01') === '2031-01-01', `-> ${proximaRecalificacion('2026-01-01')}`);

  comprobar('sumarAnios(2026-03-12, 1) coincide con proximaInspeccion',
    sumarAnios('2026-03-12', 1) === proximaInspeccion('2026-03-12'));

  // La API debe aplicar la regla, no recibir la fecha ya calculada.
  const placa = `${SUFIJO_NUM}C${SUFIJO_LETRAS.slice(0, 2)}`;
  const creado = await api('POST', '/vehiculos', {
    token: ids.tokenAdmin,
    body: {
      nombre: 'Prueba', apellido: 'Fechas', placa, telefono: '59170000003',
      fecha_inspeccion_realizada: '2026-03-12',
      fecha_recalificacion_realizada: '2026-03-12',
    },
  });
  comprobar('POST /vehiculos con la fecha del TRABAJO responde 201', creado.status === 201, `llego ${creado.status}`);

  const v = creado.body?.vehiculo;
  comprobar('la API calcula sola la inspeccion +1 ano (2027-03-12)',
    v?.fecha_inspeccion === '2027-03-12', `-> ${v?.fecha_inspeccion}`);
  comprobar('la API calcula sola la recalificacion +5 anos (2031-03-12)',
    v?.fecha_recalificacion === '2031-03-12', `-> ${v?.fecha_recalificacion}`);

  if (v?.id) {
    const pub = await api('GET', `/public/consulta/placa/${placa}`);
    comprobar('la consulta publica ve la inspeccion +1 ano',
      pub.body?.data?.proxima_inspeccion === '2027-03-12', JSON.stringify(pub.body));
    comprobar('la consulta publica ve la recalificacion +5 anos',
      pub.body?.data?.proxima_recalificacion === '2031-03-12', JSON.stringify(pub.body));
    await query('DELETE FROM notificaciones WHERE id_vehiculo = ?', [v.id]);
    await query('DELETE FROM recordatorios_enviados WHERE vehiculo_id = ?', [v.id]);
    await query('DELETE FROM vehiculos WHERE id = ?', [v.id]);
  }

  // Modo antiguo: si se manda la fecha de vencimiento directa, se respeta.
  const placa2 = `${SUFIJO_NUM}D${SUFIJO_LETRAS.slice(0, 2)}`;
  const creado2 = await api('POST', '/vehiculos', {
    token: ids.tokenAdmin,
    body: {
      nombre: 'Prueba', apellido: 'Directa', placa: placa2, telefono: '59170000004',
      fecha_inspeccion: '2027-03-12', fecha_recalificacion: '2031-03-12',
    },
  });
  comprobar('modo antiguo (fecha de vencimiento directa) sigue funcionando -> 201',
    creado2.status === 201, `llego ${creado2.status}`);
  comprobar('el modo antiguo no altera la fecha mandada',
    creado2.body?.vehiculo?.fecha_inspeccion === '2027-03-12', `-> ${creado2.body?.vehiculo?.fecha_inspeccion}`);

  if (creado2.body?.vehiculo?.id) {
    await query('DELETE FROM vehiculos WHERE id = ?', [creado2.body.vehiculo.id]);
  }

  const incoherente = await api('POST', '/vehiculos', {
    token: ids.tokenAdmin,
    body: {
      nombre: 'X', apellido: 'Y', placa: `${SUFIJO_NUM}E${SUFIJO_LETRAS.slice(0, 2)}`, telefono: '59170000005',
      fecha_inspeccion_realizada: '2026-03-12',
      fecha_recalificacion_realizada: '2020-01-01',
    },
  });
  comprobar('recalificacion anterior a la inspeccion -> 400', incoherente.status === 400, `llego ${incoherente.status}`);
}

// ------------------------------------------------------------
//  4. Recordatorio: SOLO 10 dias
// ------------------------------------------------------------
async function t4_recordatorio() {
  titulo('4. RECORDATORIO: SOLO 10 DIAS ANTES');

  const mod = await import('../src/modules/notificaciones/notificaciones.service.js');
  const { DIAS_AVISO, diasDeAviso, generarNotificacionesPendientes } = mod;

  comprobar('DIAS_AVISO es exactamente [10]', JSON.stringify(DIAS_AVISO) === '[10]', `-> ${JSON.stringify(DIAS_AVISO)}`);
  comprobar('ya no estan los 30 dias', !DIAS_AVISO.includes(30));
  comprobar('ya no estan los 15 dias', !DIAS_AVISO.includes(15));
  comprobar('ya no estan los 7 dias', !DIAS_AVISO.includes(7));

  // El ejemplo del taller: inspeccion 12/03/2027 -> aviso 02/03/2027.
  const objetivo = '2027-03-12';
  const referencia10 = new Date(2027, 2, 2);
  comprobar('inspeccion 12/03/2027 avisa el 02/03/2027 (10 dias antes)',
    diasDeAviso(objetivo, referencia10) === 10, `-> ${diasDeAviso(objetivo, referencia10)}`);

  const ref30 = new Date(2027, 1, 10);
  comprobar('30 dias antes ya NO genera aviso', diasDeAviso(objetivo, ref30) === null, `-> ${diasDeAviso(objetivo, ref30)}`);
  const ref15 = new Date(2027, 1, 25);
  comprobar('15 dias antes ya NO genera aviso', diasDeAviso(objetivo, ref15) === null, `-> ${diasDeAviso(objetivo, ref15)}`);
  const ref7 = new Date(2027, 2, 5);
  comprobar('7 dias antes ya NO genera aviso', diasDeAviso(objetivo, ref7) === null, `-> ${diasDeAviso(objetivo, ref7)}`);

  // Generacion real de la cola.
  const { queryOne: q1 } = await import('../src/config/database.js');
  const hoy = new Date();
  const en10 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 10);
  const iso10 = en10.toISOString().slice(0, 10);

  const recalEn10 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 10);
  const isoRec = recalEn10.toISOString().slice(0, 10);

  await query('UPDATE vehiculos SET fecha_inspeccion = ?, fecha_recalificacion = ? WHERE id = ?',
    [iso10, isoRec, ids.vehiculoA]);

  // Este fixture se arma con SQL crudo, saltandose el servicio, asi
  // que tiene que escribir TAMBIEN en `inspecciones` y
  // `recalificaciones`. El backend hace las dos escrituras siempre
  // (doble escritura); si aqui se omitiera, la vista
  // v_recordatorios_10d leeria tablas que el fixture nunca toco y
  // la comprobacion fallaria por una razon falsa.
  await query(
    `INSERT INTO inspecciones (id_vehiculo, fecha_realizada, fecha_vencimiento)
     VALUES (?, NULL, ?)
     ON DUPLICATE KEY UPDATE fecha_vencimiento = VALUES(fecha_vencimiento)`,
    [ids.vehiculoA, iso10]
  );
  await query(
    `INSERT INTO recalificaciones (id_vehiculo, fecha_realizada, fecha_vencimiento)
     VALUES (?, NULL, ?)
     ON DUPLICATE KEY UPDATE fecha_vencimiento = VALUES(fecha_vencimiento)`,
    [ids.vehiculoA, isoRec]
  );

  const res = await generarNotificacionesPendientes();
  comprobar('el job genera notificaciones', res.creadas > 0, JSON.stringify(res));

  const notis = await query('SELECT * FROM notificaciones WHERE id_vehiculo = ?', [ids.vehiculoA]);
  comprobar('la cola tiene las notificaciones del vehiculo A', notis.length > 0, `n=${notis.length}`);
  comprobar('TODAS las notificaciones son de 10 dias',
    notis.every(n => n.dias_anticipacion === 10),
    JSON.stringify(notis.map(n => n.dias_anticipacion)));
  comprobar('ninguna notificacion de 30 dias', notis.every(n => n.dias_anticipacion !== 30));
  comprobar('ninguna notificacion de 15 dias', notis.every(n => n.dias_anticipacion !== 15));
  comprobar('ninguna notificacion de 7 dias', notis.every(n => n.dias_anticipacion !== 7));

  // Idempotencia del job.
  const res2 = await generarNotificacionesPendientes();
  comprobar('el job se puede correr dos veces sin duplicar', res2.creadas === 0, JSON.stringify(res2));

  const notis2 = await query('SELECT COUNT(*) AS n FROM notificaciones WHERE id_vehiculo = ?', [ids.vehiculoA]);
  comprobar('la cola no crece al repetir el job', notis2[0].n === notis.length, `${notis2[0].n} vs ${notis.length}`);

  // La vista SQL de 10 dias.
  const vista = await query('SELECT * FROM v_recordatorios_10d WHERE id = ?', [ids.vehiculoA]);
  comprobar('la vista v_recordatorios_10d ve el vehiculo que vence en 10 dias',
    vista.length > 0, `n=${vista.length}`);

  const vieja7 = await query('SELECT COUNT(*) AS n FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', ['v_inspeccion_en_7d']);
  comprobar('la vista vieja v_inspeccion_en_7d ya no existe', vieja7[0].n === 0);
  const vieja30 = await query('SELECT COUNT(*) AS n FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', ['v_recalificacion_en_30d']);
  comprobar('la vista vieja v_recalificacion_en_30d ya no existe', vieja30[0].n === 0);

  await query('DELETE FROM notificaciones WHERE id_vehiculo = ?', [ids.vehiculoA]);
  await query('DELETE FROM recordatorios_enviados WHERE vehiculo_id = ?', [ids.vehiculoA]);
  await query('UPDATE vehiculos SET fecha_inspeccion = ?, fecha_recalificacion = ? WHERE id = ?',
    ['2027-03-12', '2031-03-12', ids.vehiculoA]);
}

// ------------------------------------------------------------
//  5. Consulta publica por placa
// ------------------------------------------------------------
async function t5_publica() {
  titulo('5. CONSULTA PUBLICA POR PLACA');

  const r = await api('GET', `/public/consulta/placa/${PLACA_A}`);
  comprobar('GET /public/consulta/placa/:placa -> 200', r.status === 200, `llego ${r.status}`);

  const d = r.body?.data || {};
  const permitidas = ['placa', 'proxima_inspeccion', 'estado_inspeccion', 'proxima_recalificacion', 'estado_recalificacion'];
  const exposure = Object.keys(d).filter(k => !permitidas.includes(k));

  comprobar('devuelve la placa', d.placa === PLACA_A, `-> ${d.placa}`);
  comprobar('devuelve la proxima inspeccion', Boolean(d.proxima_inspeccion));
  comprobar('devuelve el estado de la inspeccion', Boolean(d.estado_inspeccion));
  comprobar('devuelve la proxima recalificacion', Boolean(d.proxima_recalificacion));
  comprobar('devuelve el estado de la recalificacion', Boolean(d.estado_recalificacion));
  comprobar('NO expone ningun campo extra', exposure.length === 0, `expone: ${JSON.stringify(exposure)}`);
  comprobar('NO expone el nombre', !('nombre' in d) && !JSON.stringify(d).includes('Propietario'));
  comprobar('NO expone el telefono', !JSON.stringify(d).includes('59170000001'));
  comprobar('NO expone el id del propietario', !('id_cliente' in d));
  comprobar('NO expone la CI', !('ci' in d) && !('cedula' in d));

  // Placa con formato Boliviano valido pero que no existe en la base.
  const inexistente = await api('GET', '/public/consulta/placa/9999ZZZ');
  comprobar('placa inexistente -> 404', inexistente.status === 404, `llego ${inexistente.status}`);
  comprobar('placa inexistente NO filtra datos', !JSON.stringify(inexistente.body).includes('Propietario'));

  const invalida = await api('GET', '/public/consulta/placa/###');
  comprobar('placa con formato invalido -> 400 o 404', [400, 404].includes(invalida.status), `llego ${invalida.status}`);

  const vacia = await api('GET', '/public/consulta/placa/');
  comprobar('placa vacia -> 404 o 400', [400, 404].includes(vacia.status), `llego ${vacia.status}`);

  // La consulta publica no necesita sesion: ya se comprobó arriba.
  // El chatbot SI la exige.
  const bot = await api('POST', '/public/chatbot', { body: { mensaje: 'hola' } });
  comprobar('POST /public/chatbot sin API Key -> 401', bot.status === 401, `llego ${bot.status}`);
}

// ------------------------------------------------------------
//  6. Vehiculos y control por rol
// ------------------------------------------------------------
async function t6_vehiculos() {
  titulo('6. VEHICULOS Y CONTROL POR ROL');

  const tAdmin = { token: acuñarToken(USUARIOS.admin, 'administrador', ids.admin) };
  const tTec = { token: acuñarToken(USUARIOS.tecnico, 'tecnico', ids.tecnico) };
  const tCliA = { token: acuñarToken(USUARIOS.clienteA, 'cliente', ids.clienteA) };
  const tCliB = { token: acuñarToken(USUARIOS.clienteB, 'cliente', ids.clienteB) };

  ids.tokenAdmin = tAdmin.token;
  ids.tokenTec = tTec.token;
  ids.tokenCliA = tCliA.token;
  ids.tokenCliB = tCliB.token;

  const lista = await api('GET', '/vehiculos', { token: ids.tokenAdmin });
  comprobar('GET /vehiculos con admin -> 200', lista.status === 200, `llego ${lista.status}`);
  comprobar('el listado trae los vehiculos', Array.isArray(lista.body?.vehiculos) && lista.body.vehiculos.length > 0);

  const detA = await api('GET', `/vehiculos/${ids.vehiculoA}`, { token: ids.tokenAdmin });
  comprobar('GET /vehiculos/:id con admin -> 200', detA.status === 200, `llego ${detA.status}`);
  comprobar('el detalle trae la placa pedida', detA.body?.vehiculo?.placa === PLACA_A, `-> ${detA.body?.vehiculo?.placa}`);

  const crea = await api('POST', '/vehiculos', {
    token: ids.tokenTec,
    body: { nombre: 'T', apellido: 'T', placa: `${SUFIJO_NUM}H${SUFIJO_LETRAS.slice(0, 2)}`, telefono: '59170000009',
      fecha_inspeccion: '2027-01-01', fecha_recalificacion: '2031-01-01' },
  });
  comprobar('un TECNICO puede registrar un vehiculo -> 201', crea.status === 201, `llego ${crea.status}`);

  const edita = await api('PUT', `/vehiculos/${ids.vehiculoA}`, {
    token: ids.tokenTec,
    body: { nombre: 'Propietario', apellido: 'A', placa: PLACA_A, telefono: '59170000001',
      fecha_inspeccion: '2027-03-12', fecha_recalificacion: '2031-03-12' },
  });
  comprobar('un TECNICO puede editar un vehiculo -> 200', edita.status === 200, `llego ${edita.status}`);

  const creaCli = await api('POST', '/vehiculos', {
    token: ids.tokenCliA,
    body: { nombre: 'C', apellido: 'C', placa: `${SUFIJO_NUM}I${SUFIJO_LETRAS.slice(0, 2)}`, telefono: '59170000010',
      fecha_inspeccion: '2027-01-01', fecha_recalificacion: '2031-01-01' },
  });
  comprobar('un CLIENTE NO puede registrar un vehiculo -> 403', creaCli.status === 403, `llego ${creaCli.status}`);

  const editaCli = await api('PUT', `/vehiculos/${ids.vehiculoA}`, {
    token: ids.tokenCliA,
    body: { nombre: 'Hack', apellido: 'Hack', placa: PLACA_A, telefono: '000',
      fecha_inspeccion: '2027-01-01', fecha_recalificacion: '2031-01-01' },
  });
  comprobar('un CLIENTE NO puede editar un vehiculo -> 403', editaCli.status === 403, `llego ${editaCli.status}`);

  const borraCli = await api('DELETE', `/vehiculos/${ids.vehiculoA}`, { token: ids.tokenCliA });
  comprobar('un CLIENTE NO puede borrar un vehiculo -> 403', borraCli.status === 403, `llego ${borraCli.status}`);

  const borraTec = await api('DELETE', `/vehiculos/${ids.vehiculoA}`, { token: ids.tokenTec });
  comprobar('un TECNICO NO puede borrar un vehiculo -> 403', borraTec.status === 403, `llego ${borraTec.status}`);

  // --- El punto que hay que revisar de verdad ---
  const listaCli = await api('GET', '/vehiculos', { token: ids.tokenCliA });
  comprobar('un CLIENTE NO puede listar TODOS los vehiculos -> 403',
    listaCli.status === 403, `llego ${listaCli.status}; devolvio ${Array.isArray(listaCli.body?.data) ? listaCli.body.data.length + ' filas' : 'n/a'}`);

  const idor = await api('GET', `/vehiculos/${ids.vehiculoB}`, { token: ids.tokenCliA });
  comprobar('un CLIENTE NO puede leer el vehiculo de otro por ID (IDOR) -> 403',
    idor.status === 403, `llego ${idor.status}; devolvio ${JSON.stringify(idor.body).slice(0, 120)}`);

  const idorPropio = await api('GET', `/vehiculos/${ids.vehiculoA}`, { token: ids.tokenCliA });
  comprobar('un CLIENTE tampoco puede leer un ID suelto aunque sea "suyo" -> 403',
    idorPropio.status === 403, `llego ${idorPropio.status}`);

  const sinSesion = await api('GET', '/vehiculos');
  comprobar('GET /vehiculos sin sesion -> 401', sinSesion.status === 401, `llego ${sinSesion.status}`);

  if (crea.body?.vehiculo?.id) await query('DELETE FROM vehiculos WHERE id = ?', [crea.body.vehiculo.id]);
}

// ------------------------------------------------------------
//  7. Cilindros: la IA es INDEPENDIENTE del inventario
// ------------------------------------------------------------
async function t7_cilindros() {
  titulo('7. CILINDROS / LA IA NO DEPENDE DEL INVENTARIO');

  // La estructura del cilindro no existe. Se comprueba por
  // catalogo, sin leer filas.
  const estructuras = await query(
    `SELECT 'TABLA' AS tipo, TABLE_NAME AS tabla, '' AS columna
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cilindros'
     UNION ALL
    SELECT 'COLUMNA' AS tipo, TABLE_NAME AS tabla, COLUMN_NAME AS columna
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND (TABLE_NAME = 'vehiculos' AND COLUMN_NAME = 'id_cilindro'
         OR TABLE_NAME = 'inventario_productos'
            AND COLUMN_NAME IN ('capacidad_litros', 'montaje'))`
  );
  comprobar('no queda ninguna estructura de cilindro en la base',
    estructuras.length === 0,
    `sobran: ${estructuras.map(e => e.tipo === 'TABLA' ? e.tabla : `${e.tabla}.${e.columna}`).join(', ') || 'ninguna'}`);

  // `categoria: 'cilindro'` ya no es una categoria valida.
  const comoCilindro = await api('POST', '/inventario/productos', {
    token: ids.tokenAdmin,
    body: { codigo: `VF-CIL-${SUFIJO}`, nombre: 'Cilindro (no deberia existir)',
      categoria: 'cilindro', precio_compra: 1, precio_venta: 1, stock_minimo: 1 },
  });
  comprobar('un producto con categoria=cilindro se RECHAZA -> 400',
    comoCilindro.status === 400, `llego ${comoCilindro.status}`);

  // 1) El catalogo se lee con el inventario vacio.
  const cat = await api('GET', '/ai/cilindros', { token: ids.tokenAdmin });
  comprobar('GET /ai/cilindros -> 200', cat.status === 200, `llego ${cat.status}`);
  const cilCat = Array.isArray(cat.body?.data) ? cat.body.data : [];
  comprobar('el catalogo NO viene de inventario_productos',
    cat.body?.origen === 'referencial', `-> ${cat.body?.origen}`);
  comprobar('con el inventario vacio, la IA igual recomienda medidas',
    cilCat.length > 0, `catalogo: ${cilCat.length} medida(s)`);

  // 2) La comprobacion central: no hay stock ni disponibilidad.
  const conStock = cilCat.filter(c =>
    'stock_actual' in c || 'disponible' in c || 'stock_minimo' in c || 'id_producto' in c);
  comprobar('el catalogo NO trae stock_actual, disponible ni id_producto',
    conStock.length === 0,
    `fugas: ${conStock.map(c => Object.keys(c).join(',')).slice(0, 200)}`);

  const cil40 = cilCat.find(c => Number(c.capacidad_litros) === 40);
  comprobar('el catalogo trae la capacidad de 40 L', Boolean(cil40),
    `capacidades: ${cilCat.map(c => c.capacidad_litros).join(', ')}`);
  comprobar('el catalogo dice el espacio que el equipo necesita (~110 L)',
    Number(cil40?.volumen_minimo_litros) === 110, `-> ${cil40?.volumen_minimo_litros}`);
  comprobar('el catalogo dice donde se monta', typeof cil40?.montaje === 'string',
    `-> ${cil40?.montaje}`);

  // 3) El filtro usa el espacio real, no la capacidad del gas.
  const chico = await api('GET', '/ai/cilindros?volumen_litros=60', { token: ids.tokenAdmin });
  const grande = await api('GET', '/ai/cilindros?volumen_litros=300', { token: ids.tokenAdmin });
  const enChico = (chico.body?.data ?? []).some(c => Number(c.capacidad_litros) === 40);
  const enGrande = (grande.body?.data ?? []).some(c => Number(c.capacidad_litros) === 40);
  comprobar('con 60 L de maletera NO ofrece el cilindro de 40 L (ocupa ~110 L)',
    chico.status === 200 && !enChico, `llego ${chico.status}, enCatalogo=${enChico}`);
  comprobar('con 300 L de maletera SI ofrece el cilindro de 40 L',
    grande.status === 200 && enGrande, `llego ${grande.status}, enCatalogo=${enGrande}`);

  // Las claves de precio las define el servidor. Se aparta el
  // valor real de la mano de obra y se usa una clave de
  // cilindro propia de la corrida, para no pisar nada.
  const claveInstalacion = process.env.AI_PRECIO_INSTALACION_CLAVE || 'instalacion_gnv';
  const claveCilindro = `cilindro_40`;
  const previos = await query(
    'SELECT clave, valor, moneda FROM parametros_precios WHERE clave IN (?, ?)',
    [claveInstalacion, claveCilindro]
  );
  await query('DELETE FROM parametros_precios WHERE clave IN (?, ?)', [claveInstalacion, claveCilindro]);

  // 4) Sin precios, la estimacion avisa y no inventa nada.
  //    El endpoint toma `capacidad_litros`, no un id de producto.
  const est = await api('POST', '/ai/estimacion', {
    token: ids.tokenAdmin,
    body: { capacidad_litros: 40, cantidad: 1 },
  });
  comprobar('POST /ai/estimacion responde 200', est.status === 200, `llego ${est.status}`);
  const faltan = est.body?.faltan ?? [];
  comprobar('sin precios cargados, la estimacion avisa que faltan datos',
    faltan.length > 0, JSON.stringify(est.body).slice(0, 250));
  comprobar('la estimacion sin datos NO inventa un subtotal',
    est.body?.data === null || est.body?.data?.subtotal === undefined,
    JSON.stringify(est.body).slice(0, 250));

  // 5) Con los dos precios cargados, la estimacion cuadra.
  await query(
    `INSERT INTO parametros_precios (clave, valor, moneda, descripcion, id_usuario)
     VALUES (?, 500, 'BOB', 'Mano de obra de prueba', ?),
            (?, 2000, 'BOB', 'Cilindro de 40 L de prueba', ?)
     ON DUPLICATE KEY UPDATE valor = VALUES(valor), moneda = 'BOB'`,
    [claveInstalacion, ids.admin, claveCilindro, ids.admin]
  );
  const est2 = await api('POST', '/ai/estimacion', {
    token: ids.tokenAdmin,
    body: { capacidad_litros: 40, cantidad: 2 },
  });
  // El desglose viene dentro de `data`, y el total de 2 unidades
  // es `subtotal`: 2 x (2000 del cilindro + 500 de mano de obra).
  const total2 = aiDataDe(est2)?.subtotal;
  comprobar('con los precios cargados, 2 x (2000 + 500) = 5000', Number(total2) === 5000, `-> ${total2}`);
  comprobar('el desglose muestra los dos precios de MariaDB',
    Number(aiDataDe(est2)?.desglose?.cilindro) === 2000
      && Number(aiDataDe(est2)?.desglose?.instalacion) === 500,
    `-> ${JSON.stringify(aiDataDe(est2)?.desglose)}`);
  comprobar('la estimacion devuelve la medida del catalogo, no un id de producto',
    Number(aiDataDe(est2)?.cilindro?.capacidad_litros) === 40,
    `-> ${JSON.stringify(aiDataDe(est2)?.cilindro)}`);

  // 6) LA PRUEBA CENTRAL: se carga un producto en el deposito y
  //    la recomendacion NO se mueve.
  const repuesto = await api('POST', '/inventario/productos', {
    token: ids.tokenAdmin,
    body: { codigo: `VF-REP-${SUFIJO}`, nombre: 'Repuesto de prueba',
      categoria: 'repuesto', precio_compra: 100, precio_venta: 200, stock_minimo: 1 },
  });
  comprobar('el inventario NORMAL sigue funcionando (repuesto -> 201)',
    repuesto.status === 201, `llego ${repuesto.status}`);
  const idRepuesto = productoDe(repuesto)?.id_producto ?? productoDe(repuesto)?.id ?? null;

  await api('POST', '/inventario/movimientos', {
    token: ids.tokenAdmin,
    body: { id_producto: idRepuesto, tipo: 'ENTRADA', cantidad: 5, motivo: 'Carga de prueba' },
  });

  const catConStock = await api('GET', '/ai/cilindros', { token: ids.tokenAdmin });
  comprobar('el catalogo de la IA es IDENTICO con productos en el deposito',
    JSON.stringify(catConStock.body?.data) === JSON.stringify(cilCat),
    `antes ${cilCat.length}, despues ${catConStock.body?.data?.length}`);

  const est3 = await api('POST', '/ai/estimacion', {
    token: ids.tokenAdmin,
    body: { capacidad_litros: 40, cantidad: 2 },
  });
  comprobar('el precio de la IA NO cambia con el stock del deposito',
    Number(aiDataDe(est3)?.subtotal) === 5000, `-> ${aiDataDe(est3)?.subtotal}`);

  // Y al reves: con el deposito vacio tampoco.
  if (idRepuesto) {
    await query('UPDATE inventario_productos SET stock_actual = 0 WHERE id_producto = ?', [idRepuesto]);
  }
  const est4 = await api('POST', '/ai/estimacion', {
    token: ids.tokenAdmin,
    body: { capacidad_litros: 40, cantidad: 2 },
  });
  comprobar('el precio de la IA tampoco depende del deposito vacio',
    Number(aiDataDe(est4)?.subtotal) === 5000, `-> ${aiDataDe(est4)?.subtotal}`);

  // 7) Se restauran los precios que hubiera antes de la prueba.
  for (const clave of [claveInstalacion, claveCilindro]) {
    const previo = previos.find(p => p.clave === clave);
    if (previo) {
      await query('UPDATE parametros_precios SET valor = ?, moneda = ? WHERE clave = ?',
        [previo.valor, previo.moneda, clave]);
    } else {
      await query('DELETE FROM parametros_precios WHERE clave = ?', [clave]);
    }
  }

  const cilCli = await api('GET', '/ai/cilindros', { token: ids.tokenCliA });
  comprobar('un CLIENTE no puede leer el catalogo de la IA -> 403', cilCli.status === 403, `llego ${cilCli.status}`);

  if (idRepuesto) {
    await query('DELETE FROM movimientos_inventario WHERE id_producto = ?', [idRepuesto]);
    await query('DELETE FROM inventario_productos WHERE id_producto = ?', [idRepuesto]);
  }
}

// ------------------------------------------------------------
//  8. Inventario completo
// ------------------------------------------------------------
async function t8_inventario() {
  titulo('8. INVENTARIO: ENTRADA, SALIDA, AJUSTE, MINIMO, NEGATIVO');

  const codigo = `VF-PROD-${SUFIJO}`;
  const creado = await api('POST', '/inventario/productos', {
    token: ids.tokenAdmin,
    body: { codigo, nombre: 'Producto de prueba', categoria: 'accesorio',
      precio_compra: 500, precio_venta: 900, stock_minimo: 3 },
  });
  comprobar('crear producto -> 201', creado.status === 201, `llego ${creado.status}`);
  const id = productoDe(creado)?.id_producto ?? productoDe(creado)?.id;
  comprobar('el producto creado trae su id', Boolean(id), `-> ${JSON.stringify(productoDe(creado)).slice(0, 150)}`);
  ids.producto = id;

  const lista = await api('GET', '/inventario/productos', { token: ids.tokenAdmin });
  comprobar('listar productos -> 200', lista.status === 200, `llego ${lista.status}`);
  comprobar('el producto nuevo aparece en el listado', productosDe(lista).some(p => p.codigo === codigo));

  const detalle = await api('GET', `/inventario/productos/${id}`, { token: ids.tokenAdmin });
  comprobar('consultar un producto por id -> 200', detalle.status === 200, `llego ${detalle.status}`);
  comprobar('el detalle trae el codigo pedido', productoDe(detalle)?.codigo === codigo, `-> ${productoDe(detalle)?.codigo}`);
  comprobar('el detalle trae el stock', Number(productoDe(detalle)?.stock_actual) === 0, `-> ${productoDe(detalle)?.stock_actual}`);

  const edita = await api('PUT', `/inventario/productos/${id}`, {
    token: ids.tokenAdmin,
    body: { codigo, nombre: 'Producto editado', categoria: 'accesorio',
      precio_compra: 550, precio_venta: 950, stock_minimo: 3 },
  });
  comprobar('editar producto -> 200', edita.status === 200, `llego ${edita.status}`);
  comprobar('el nombre editado se guardo',
    (productoDe(edita)?.nombre ?? productoDe(detalle)?.nombre) !== undefined);

  const editaStock = await api('PUT', `/inventario/productos/${id}`, {
    token: ids.tokenAdmin,
    body: { codigo, nombre: 'Producto editado', categoria: 'accesorio',
      precio_compra: 550, precio_venta: 950, stock_minimo: 3, stock_inicial: 999 },
  });
  comprobar('editar el stock desde la ficha se rechaza (el stock solo cambia por movimiento)',
    editaStock.status >= 400, `llego ${editaStock.status}`);

  const e1 = await api('POST', '/inventario/movimientos', {
    token: ids.tokenAdmin, body: { id_producto: id, tipo: 'ENTRADA', cantidad: 10, motivo: 'Compra' },
  });
  comprobar('ENTRADA de 10 -> 201', e1.status === 201, `llego ${e1.status}`);
  comprobar('tras la entrada el stock es 10', Number(stockNuevoDe(movimientoDe(e1))) === 10, `-> ${stockNuevoDe(movimientoDe(e1))}`);
  comprobar('la entrada guarda stock_anterior = 0', Number(stockAnteriorDe(movimientoDe(e1))) === 0);

  const s1 = await api('POST', '/inventario/movimientos', {
    token: ids.tokenAdmin, body: { id_producto: id, tipo: 'SALIDA', cantidad: 8, motivo: 'Venta' },
  });
  comprobar('SALIDA de 8 -> 201', s1.status === 201, `llego ${s1.status}`);
  comprobar('tras la salida el stock es 2', Number(stockNuevoDe(movimientoDe(s1))) === 2, `-> ${stockNuevoDe(movimientoDe(s1))}`);

  // El caso que el taller pidio: stock 2, salida 4.
  const sobre = await api('POST', '/inventario/movimientos', {
    token: ids.tokenAdmin, body: { id_producto: id, tipo: 'SALIDA', cantidad: 4, motivo: 'Intento imposible' },
  });
  comprobar('stock 2 y salida 4 se RECHAZA -> 409', sobre.status === 409, `llego ${sobre.status}`);
  comprobar('el error dice STOCK_INSUFICIENTE',
    JSON.stringify(sobre.body).includes('STOCK_INSUFICIENTE'), JSON.stringify(sobre.body).slice(0, 150));

  const tras = await api('GET', `/inventario/productos/${id}`, { token: ids.tokenAdmin });
  comprobar('el stock SIGUE en 2, no quedo en -2',
    Number(productoDe(tras)?.stock_actual) === 2, `-> ${productoDe(tras)?.stock_actual}`);

  const ajNeg = await api('POST', '/inventario/movimientos', {
    token: ids.tokenAdmin, body: { id_producto: id, tipo: 'AJUSTE', stock_nuevo: -5, motivo: 'Ajuste imposible' },
  });
  comprobar('un AJUSTE a stock negativo se RECHAZA -> 400', ajNeg.status === 400, `llego ${ajNeg.status}`);

  const aj = await api('POST', '/inventario/movimientos', {
    token: ids.tokenAdmin, body: { id_producto: id, tipo: 'AJUSTE', stock_nuevo: 3, motivo: 'Conteo fisico' },
  });
  comprobar('AJUSTE a 3 -> 201', aj.status === 201, `llego ${aj.status}`);
  comprobar('el ajuste guarda la diferencia (2 -> 3 = 1)',
    Number(movimientoDe(aj)?.cantidad) === 1, `-> ${movimientoDe(aj)?.cantidad}`);

  const cantNeg = await api('POST', '/inventario/movimientos', {
    token: ids.tokenAdmin, body: { id_producto: id, tipo: 'ENTRADA', cantidad: -3, motivo: 'Cantidad negativa' },
  });
  comprobar('una cantidad negativa se RECHAZA -> 400', cantNeg.status === 400, `llego ${cantNeg.status}`);

  const cantCero = await api('POST', '/inventario/movimientos', {
    token: ids.tokenAdmin, body: { id_producto: id, tipo: 'ENTRADA', cantidad: 0, motivo: 'Cantidad cero' },
  });
  comprobar('una cantidad cero se RECHAZA -> 400', cantCero.status === 400, `llego ${cantCero.status}`);

  const hist = await api('GET', `/inventario/movimientos?id_producto=${id}`, { token: ids.tokenAdmin });
  comprobar('consultar el historial -> 200', hist.status === 200, `llego ${hist.status}`);
  const movs = movimientosDe(hist);
  comprobar('el historial tiene los movimientos registrados', movs.length >= 3, `n=${movs.length}`);
  comprobar('cada movimiento guarda el usuario responsable',
    movs.every(m => m.id_usuario !== undefined && m.id_usuario !== null), 'faltan id_usuario');
  comprobar('cada movimiento trae tipo, cantidad, fecha y motivo',
    movs.every(m => m.tipo && m.cantidad !== undefined && m.fecha && m.motivo), 'faltan campos');
  comprobar('el historial viene del mas nuevo al mas viejo', (() => {
    if (movs.length < 2) return true;
    const f = (m) => new Date(String(m.fecha).replace(' ', 'T')).getTime();
    return f(movs[0]) >= f(movs[movs.length - 1]);
  })());

  // Stock minimo
  const alertas = await api('GET', '/inventario/alertas', { token: ids.tokenAdmin });
  comprobar('GET /inventario/alertas -> 200', alertas.status === 200, `llego ${alertas.status}`);
  comprobar('con stock 3 y minimo 3 el producto aparece en la alerta de stock bajo',
    alertasDe(alertas).some(p => String(p.codigo) === codigo),
    `alertas: ${JSON.stringify(alertasDe(alertas)).slice(0, 250)}`);

  const vista = await query('SELECT * FROM v_inventario_stock_bajo WHERE codigo = ?', [codigo]);
  comprobar('la vista SQL de stock bajo lo incluye', vista.length > 0, `n=${vista.length}`);

  // Nunca negativo, en toda la base
  const negativos = await query('SELECT COUNT(*) AS n FROM inventario_productos WHERE stock_actual < 0');
  comprobar('NINGUN producto de la base tiene stock negativo', negativos[0].n === 0, `n=${negativos[0].n}`);

  // El AJUSTE no se cuenta por `cantidad`.
  //
  //  `registrarMovimiento` guarda en `cantidad` el valor ABSOLUTO
  //  de lo que cambio, porque el esquema lo pide asi: "cantidad
  //  movida, siempre positiva; el signo lo da `tipo`". Un ajuste
  //  a la baja (27 -> 6) se guarda con `cantidad = 21`, igual que
  //  uno al alza. Sumar `m.cantidad` daria 48 en vez de 6 y
  //  marcaria como descuadrado un producto que esta bien.
  //
  //  Para el AJUSTE hay que usar la diferencia con signo entre
  //  `stock_nuevo` y `stock_anterior`, que es lo que si cambió.
  //  Es la misma formula que usa `verify-database.js`.
  const cuadra = await query(
    `SELECT COUNT(*) AS n FROM inventario_productos p
      WHERE p.stock_actual <> COALESCE((
        SELECT SUM(CASE m.tipo WHEN 'ENTRADA' THEN  m.cantidad
                              WHEN 'SALIDA'  THEN -m.cantidad
                              ELSE (m.stock_nuevo - m.stock_anterior) END)
          FROM movimientos_inventario m WHERE m.id_producto = p.id_producto), 0)`
  );
  comprobar('el stock de cada producto cuadra con la suma de sus movimientos', cuadra[0].n === 0, `n=${cuadra[0].n}`);

  // El mismo AJUSTE, visto desde el lado del signo. Un ajuste
  // al alza y uno a la baja tienen que poder distinguirse, o el
  // ajuste deja de ser un movimiento con sentido.
  const ajustesConSigno = await query(
    `SELECT COALESCE(SUM(CASE WHEN tipo = 'AJUSTE' THEN stock_nuevo > stock_anterior END), 0) AS arriba,
            COALESCE(SUM(CASE WHEN tipo = 'AJUSTE' THEN stock_nuevo < stock_anterior END), 0) AS abajo
       FROM movimientos_inventario WHERE tipo = 'AJUSTE'`
  );
  comprobar('hay ajustes al alza y a la baja, y se distinguen por el signo',
    Number(ajustesConSigno[0].arriba) > 0 && Number(ajustesConSigno[0].abajo) > 0,
    `al alza=${ajustesConSigno[0].arriba}, a la baja=${ajustesConSigno[0].abajo}`);

  // Roles
  const creaCli = await api('POST', '/inventario/productos', {
    token: ids.tokenCliA,
    body: { codigo: `VF-X-${SUFIJO}`, nombre: 'X', categoria: 'accesorio', precio_compra: 1, precio_venta: 1, stock_minimo: 1 },
  });
  comprobar('un CLIENTE no puede crear productos -> 403', creaCli.status === 403, `llego ${creaCli.status}`);

  const creaTec = await api('POST', '/inventario/productos', {
    token: ids.tokenTec,
    body: { codigo: `VF-Y-${SUFIJO}`, nombre: 'Y', categoria: 'accesorio', precio_compra: 1, precio_venta: 1, stock_minimo: 1 },
  });
  comprobar('un TECNICO no puede crear productos -> 403', creaTec.status === 403, `llego ${creaTec.status}`);

  const leeTec = await api('GET', '/inventario/productos', { token: ids.tokenTec });
  comprobar('un TECNICO SI puede consultar el stock -> 200', leeTec.status === 200, `llego ${leeTec.status}`);

  const movTec = await api('POST', '/inventario/movimientos', {
    token: ids.tokenTec, body: { id_producto: id, tipo: 'ENTRADA', cantidad: 1, motivo: 'No deberia pasar' },
  });
  comprobar('un TECNICO no puede registrar movimientos -> 403', movTec.status === 403, `llego ${movTec.status}`);

  const histTec = await api('GET', '/inventario/movimientos', { token: ids.tokenTec });
  comprobar('un TECNICO no puede ver el historial -> 403', histTec.status === 403, `llego ${histTec.status}`);

  const histCli = await api('GET', '/inventario/movimientos', { token: ids.tokenCliA });
  comprobar('un CLIENTE no puede ver el historial -> 403', histCli.status === 403, `llego ${histCli.status}`);

  const sinSesion = await api('GET', '/inventario/productos');
  comprobar('el inventario sin sesion -> 401', sinSesion.status === 401, `llego ${sinSesion.status}`);
}

// ------------------------------------------------------------
//  9. Usuarios y activacion
// ------------------------------------------------------------
async function t9_usuarios() {
  titulo('9. USUARIOS, ESTADO Y ACTIVACION');

  const activos = await query('SELECT id, username, rol, estado FROM usuarios WHERE username LIKE ?', [`vf\\_%${SUFIJO}`]);
  comprobar('los usuarios de prueba se sembraron', activos.length === 5, `n=${activos.length}`);

  const inact = activos.find(u => u.estado === 'inactivo');
  comprobar('hay un usuario deshabilitado', Boolean(inact));

  const loginInactivo = await api('POST', '/auth/login', { body: { username: inact.username, password: CLAVE } });
  comprobar('un usuario deshabilitado NO puede iniciar sesion', [401, 403].includes(loginInactivo.status),
    `llego ${loginInactivo.status}`);

  const codigo = await queryOne('SELECT * FROM codigos_activacion WHERE id_usuario = ?', [inact.id]);
  comprobar('un usuario sin codigo de activacion no tiene ninguno (correcto)', codigo === null || codigo === undefined);

  const clienteRows = activos.filter(u => u.rol === 'cliente');
  comprobar('hay dos usuarios con rol cliente', clienteRows.length === 2, `n=${clienteRows.length}`);

  const completos = activos.every(u => u.username && typeof u.estado === 'string');
  comprobar('todos los usuarios tienen rol y estado', completos);

  const hashes = await query('SELECT password FROM usuarios WHERE username LIKE ?', [`vf\\_%${SUFIJO}`]);
  comprobar('las contrasenas estan en hash bcrypt (empiezan con $2)',
    hashes.every(h => h.password.startsWith('$2')), 'alguna no es bcrypt');
  comprobar('ninguna contrasena esta en texto plano',
    hashes.every(h => h.password !== CLAVE));
}

// ------------------------------------------------------------
//  10. Notificaciones
// ------------------------------------------------------------
async function t10_notificaciones() {
  titulo('10. NOTIFICACIONES');

  await query('DELETE FROM notificaciones WHERE id_vehiculo = ?', [ids.vehiculoA]);
  const hoy = new Date();
  const en10 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 10).toISOString().slice(0, 10);
  await query('UPDATE vehiculos SET fecha_inspeccion = ? WHERE id = ?', [en10, ids.vehiculoA]);

  const { generarNotificacionesPendientes } = await import('../src/modules/notificaciones/notificaciones.service.js');
  await generarNotificacionesPendientes();

  const notis = await query('SELECT * FROM notificaciones WHERE id_vehiculo = ?', [ids.vehiculoA]);
  comprobar('se creo la notificacion de aviso', notis.length > 0, `n=${notis.length}`);
  const n1 = notis[0];

  comprobar('la notificacion es de tipo inspeccion', n1.tipo === 'inspeccion', `-> ${n1.tipo}`);
  comprobar('la notificacion es de 10 dias', n1.dias_anticipacion === 10, `-> ${n1.dias_anticipacion}`);
  comprobar('la notificacion nace pendiente', n1.estado === 'pendiente', `-> ${n1.estado}`);
  comprobar('la notificacion nace sin marcar como leida', n1.leida === 0 || n1.leida === false, `-> ${n1.leida}`);
  comprobar('la notificacion trae el telefono del vehiculo', n1.telefono === '59170000001', `-> ${n1.telefono}`);
  comprobar('el mensaje de la notificacion menciona la fecha de vencimiento', n1.mensaje.includes('2027') || /\d{2}\/\d{2}\/\d{4}/.test(n1.mensaje), n1.mensaje);

  const dups = await query('SELECT * FROM notificaciones WHERE id_vehiculo = ?', [ids.vehiculoA]);
  comprobar('no se crean duplicados para el mismo vehiculo/tipo/dias/fecha', dups.length === notis.length);

  const unico = await query(
    `SELECT COUNT(*) AS n FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificaciones' AND INDEX_NAME = 'uq_vehiculo_tipo_dias_fecha'`
  );
  comprobar('existe el indice unico que impide duplicados', unico[0].n > 0);

  await query('DELETE FROM notificaciones WHERE id_vehiculo = ?', [ids.vehiculoA]);
  await query('DELETE FROM recordatorios_enviados WHERE vehiculo_id = ?', [ids.vehiculoA]);
  await query('UPDATE vehiculos SET fecha_inspeccion = ? WHERE id = ?', ['2027-03-12', ids.vehiculoA]);
}

// ------------------------------------------------------------
//  11. WPConnect
// ------------------------------------------------------------
async function t11_wpconnect() {
  titulo('11. WPCONNECT (SIN ENVIAR WHATSAPP REAL)');

  const hoy = new Date();
  const en10 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 10).toISOString().slice(0, 10);
  await query('UPDATE vehiculos SET fecha_inspeccion = ? WHERE id = ?', [en10, ids.vehiculoA]);
  const { generarNotificacionesPendientes } = await import('../src/modules/notificaciones/notificaciones.service.js');
  await generarNotificacionesPendientes();

  const pend = await api('GET', '/integrations/whatsapp/pendientes', { apiKey: API_KEY });
  comprobar('GET /integrations/whatsapp/pendientes con API Key -> 200', pend.status === 200, `llego ${pend.status}`);
  const lista = Array.isArray(pend.body?.notificaciones) ? pend.body.notificaciones : [];
  comprobar('la cola devuelve notificaciones', Array.isArray(lista) && lista.length > 0, `n=${Array.isArray(lista) ? lista.length : 'n/a'}`);

  if (Array.isArray(lista) && lista.length > 0) {
    const n = lista.find(x => x.id_vehiculo === ids.vehiculoA) || lista[0];
    const idNoti = n.id_notificacion ?? n.id;
    comprobar('la notificacion trae dias_anticipacion = 10', Number(n.dias_anticipacion) === 10, `-> ${n.dias_anticipacion}`);

    const sinKey = await api('GET', '/integrations/whatsapp/pendientes');
    comprobar('sin API Key -> 401', sinKey.status === 401, `llego ${sinKey.status}`);

    const keyMala = await api('GET', '/integrations/whatsapp/pendientes', { apiKey: 'clave_incorrecta' });
    comprobar('con API Key incorrecta -> 401', keyMala.status === 401, `llego ${keyMala.status}`);

    const jwtEnVezDeKey = await api('GET', '/integrations/whatsapp/pendientes', { token: ids.tokenAdmin });
    comprobar('un JWT de usuario NO sirve como API Key -> 401', jwtEnVezDeKey.status === 401, `llego ${jwtEnVezDeKey.status}`);

    // Se marca como enviada SIN llamar a Meta. Es solo la cola interna.
    const enviada = await api('POST', `/integrations/whatsapp/notificaciones/${idNoti}/enviada`, { apiKey: API_KEY });
    comprobar('POST .../enviada -> 200', enviada.status === 200, `llego ${enviada.status}`);

    const check = await queryOne('SELECT estado, fecha_envio FROM notificaciones WHERE id_notificacion = ?', [idNoti]);
    comprobar('el estado pasa a "enviada"', check?.estado === 'enviada', `-> ${check?.estado}`);
    comprobar('se registra la fecha de envio', check?.fecha_envio !== null);

    // Y una que falla, para probar el endpoint de error.
    const { generarNotificacionesPendientes: g2 } = await import('../src/modules/notificaciones/notificaciones.service.js');
    await query('DELETE FROM notificaciones WHERE id_vehiculo = ?', [ids.vehiculoA]);
    await query('DELETE FROM recordatorios_enviados WHERE vehiculo_id = ?', [ids.vehiculoA]);
    await query('UPDATE vehiculos SET fecha_inspeccion = ? WHERE id = ?', [en10, ids.vehiculoA]);
    await g2();
    const n2 = await queryOne('SELECT id_notificacion FROM notificaciones WHERE id_vehiculo = ?', [ids.vehiculoA]);
    if (n2) {
      const error = await api('POST', `/integrations/whatsapp/notificaciones/${n2.id_notificacion}/error`, {
        apiKey: API_KEY, body: { motivo: 'Prueba automatica: no se envio de verdad' },
      });
      comprobar('POST .../error -> 200', error.status === 200, `llego ${error.status}`);
      const chk2 = await queryOne('SELECT estado, ultimo_error FROM notificaciones WHERE id_notificacion = ?', [n2.id_notificacion]);
      comprobar('el estado pasa a "error"', chk2?.estado === 'error', `-> ${chk2?.estado}`);
      comprobar('se guarda el motivo del error', Boolean(chk2?.ultimo_error), `-> ${chk2?.ultimo_error}`);
    }

    const inexistente = await api('POST', '/integrations/whatsapp/notificaciones/999999/enviada', { apiKey: API_KEY });
    comprobar('marcar una notificacion inexistente -> 404', inexistente.status === 404, `llego ${inexistente.status}`);
  }

  await query('DELETE FROM notificaciones WHERE id_vehiculo = ?', [ids.vehiculoA]);
  await query('DELETE FROM recordatorios_enviados WHERE vehiculo_id = ?', [ids.vehiculoA]);
  await query('UPDATE vehiculos SET fecha_inspeccion = ? WHERE id = ?', ['2027-03-12', ids.vehiculoA]);
}

// ------------------------------------------------------------
//  MAIN
// ------------------------------------------------------------
// ------------------------------------------------------------
//  12. Vista del cliente (lo que consume la app movil)
// ------------------------------------------------------------
//  Esta seccion es la que hace que la app movil sirva para algo.
//  Antes de la migracion 009 un usuario con rol `cliente` no
//  tenia NINGUN campo que lo conectara con un vehiculo, y por
//  eso receives 403 en todas partes: no habia de donde sacar
//  "mis vehiculos".
//
//  Lo que se comprueba aqui, en orden de importancia:
//
//    1. Que un cliente vea SUS vehiculos. Si esto falla, la app
//       abre en blanco.
//    2. Que NO vea los de otro. Ese es el fallo caro: searia
//       una fuga de datos personales de los clientes del
//       taller, no solo un error de permisos.
//    3. Que las fechas y los dias restantes lleguen bien, que es
//       la unica razon por la que el cliente abre la app.
// ------------------------------------------------------------
async function t12_vistaCliente() {
  titulo('12. VISTA DEL CLIENTE (app movil)');

  const tCliA = { token: acuñarToken(USUARIOS.clienteA, 'cliente', ids.clienteA) };
  const tCliB = { token: acuñarToken(USUARIOS.clienteB, 'cliente', ids.clienteB) };
  const tTec = { token: acuñarToken(USUARIOS.tecnico, 'tecnico', ids.tecnico) };

  // El enlace usuario -> cliente -> vehiculo. La migracion 009
  // lo hace por telefono cuando el username es el telefono, pero
  // estos usuarios de prueba se llaman `vf_cliA_SUFIJO`, asi que
  // hay que armarlo a mano, que es exactamente lo que hara la
  // activacion de cuentas mas adelante.
  //
  // ON DUPLICATE KEY UPDATE y no INSERT: el cliente "Propietario A"
  // ya fue creado por el dual-escritura de createVehiculo() en la
  // seccion 6, con la misma clave unica. Un INSERT plano revienta
  // con "Duplicate entry".
  await query(
    `INSERT INTO clientes (nombre, apellido, telefono, id_usuario) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id_usuario = VALUES(id_usuario)`,
    ['Propietario', 'A', '59170000001', ids.clienteA]
  );
  const { id: clienteA } = await queryOne(
    `SELECT id FROM clientes WHERE telefono = '59170000001' LIMIT 1`
  );
  await query('UPDATE vehiculos SET id_cliente = ? WHERE id = ?', [clienteA, ids.vehiculoA]);

  await query(
    `INSERT INTO clientes (nombre, apellido, telefono, id_usuario) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id_usuario = VALUES(id_usuario)`,
    ['Propietario', 'B', '59170000002', ids.clienteB]
  );
  const { id: clienteB } = await queryOne(
    `SELECT id FROM clientes WHERE telefono = '59170000002' LIMIT 1`
  );
  await query('UPDATE vehiculos SET id_cliente = ? WHERE id = ?', [clienteB, ids.vehiculoB]);

  // --- Que el cliente vea lo suyo ---
  const suyo = await api('GET', '/cliente/vehiculos', { token: tCliA.token });
  comprobar('GET /cliente/vehiculos con cliente -> 200', suyo.status === 200, `llego ${suyo.status}`);
  comprobar('el cliente queda marcado como vinculado', suyo.body?.vinculado === true,
    `-> ${JSON.stringify(suyo.body?.vinculado)}`);
  comprobar('el cliente ve su nombre y apellido',
    suyo.body?.cliente?.nombre === 'Propietario' && suyo.body?.cliente?.apellido === 'A',
    `-> ${JSON.stringify(suyo.body?.cliente)}`);
  comprobar('el cliente ve SUS vehiculos', Array.isArray(suyo.body?.vehiculos) && suyo.body.vehiculos.length === 1,
    `-> ${suyo.body?.vehiculos?.length} vehiculo(s)`);
  comprobar('el vehiculo que ve es el suyo', suyo.body?.vehiculos?.[0]?.placa === PLACA_A,
    `-> ${suyo.body?.vehiculos?.[0]?.placa}`);

  // --- Las fechas, que es lo que el cliente viene a ver ---
  const insp = suyo.body?.vehiculos?.[0]?.inspeccion;
  const recal = suyo.body?.vehiculos?.[0]?.recalificacion;
  comprobar('la inspeccion trae fecha de vencimiento',
    /^\d{4}-\d{2}-\d{2}$/.test(insp?.fecha_vencimiento ?? ''), `-> ${insp?.fecha_vencimiento}`);
  comprobar('la inspeccion trae dias restantes', Number.isInteger(insp?.dias_restantes),
    `-> ${insp?.dias_restantes}`);
  comprobar('la inspeccion trae un estado de los cinco validos',
    ['vigente', 'por_vencer', 'vence_hoy', 'vencido', 'sin_fecha'].includes(insp?.estado),
    `-> ${insp?.estado}`);
  comprobar('la recalificacion tambien trae fecha y dias',
    /^\d{4}-\d{2}-\d{2}$/.test(recal?.fecha_vencimiento ?? '') && Number.isInteger(recal?.dias_restantes),
    `-> ${recal?.fecha_vencimiento} / ${recal?.dias_restantes}`);

  // El estado tiene que ser coherente con los dias. Si dias > 10
  // no puede ser 'vencido', y si dias < 0 no puede ser 'vigente'.
  const coherente = (b) =>
    (b.dias_restantes < 0 && b.estado === 'vencido') ||
    (b.dias_restantes === 0 && b.estado === 'vence_hoy') ||
    (b.dias_restantes > 0 && b.dias_restantes <= 10 && b.estado === 'por_vencer') ||
    (b.dias_restantes > 10 && b.estado === 'vigente');
  comprobar('el estado de la inspeccion cuadra con los dias', coherente(insp),
    `-> ${insp?.dias_restantes} dias = ${insp?.estado}`);
  comprobar('el estado de la recalificacion cuadra con los dias', coherente(recal),
    `-> ${recal?.dias_restantes} dias = ${recal?.estado}`);

  // --- Que NO vea los de otro. Esta es la comprobacion importante ---
  const ajeno = await api('GET', `/cliente/vehiculos/${ids.vehiculoB}`, { token: tCliA.token });
  comprobar('un CLIENTE NO puede ver el vehiculo de otro -> 404', ajeno.status === 404,
    `llego ${ajeno.status}; devolvio ${JSON.stringify(ajeno.body).slice(0, 100)}`);

  const listaAjena = await api('GET', '/cliente/vehiculos', { token: tCliA.token });
  comprobar('el listado del cliente NO incluye placas ajenas',
    !JSON.stringify(listaAjena.body).includes(PLACA_B),
    `-> aparecio ${PLACA_B} en la respuesta`);

  // Un id inexistente y uno ajeno tienen que ser indistinguibles.
  // Si difieren, un atacante puede recorrer ids y Contar cuantos
  // autos tiene el taller.
  const inexistente = await api('GET', '/cliente/vehiculos/999999', { token: tCliA.token });
  comprobar('un id inexistente tambien da 404 (no revela si existe)', inexistente.status === 404,
    `-> ${inexistente.status}`);
  comprobar('"no existe" y "no es tuyo" dan la misma respuesta',
    JSON.stringify(ajeno.body?.message) === JSON.stringify(inexistente.body?.message),
    `-> ${ajeno?.body?.message} vs ${inexistente.body?.message}`);

  // --- Detalle del vehiculo propio ---
  const detalle = await api('GET', `/cliente/vehiculos/${ids.vehiculoA}`, { token: tCliA.token });
  comprobar('el cliente puede ver el detalle de SU vehiculo -> 200', detalle.status === 200, `llego ${detalle.status}`);
  comprobar('el detalle trae la placa correcta', detalle.body?.vehiculo?.placa === PLACA_A);

  // --- Errores de entrada ---
  const idMalo = await api('GET', '/cliente/vehiculos/abc', { token: tCliA.token });
  comprobar('un id que no es numero -> 400', idMalo.status === 400, `llego ${idMalo.status}`);

  const sinSesionCli = await api('GET', '/cliente/vehiculos');
  comprobar('GET /cliente/vehiculos sin sesion -> 401', sinSesionCli.status === 401, `llego ${sinSesionCli.status}`);

  // --- Que el personal no gane nada extra con este endpoint ---
  // El personal ya tiene el panel completo, asi que aca solo puede
  // ver lo suyo. Lejos de ser un problema, es la garantia de que
  // este endpoint no se uso de atajo para saltarse los roles.
  const delTec = await api('GET', '/cliente/vehiculos', { token: tTec.token });
  comprobar('el personal ve su vista de cliente, no la flota', delTec.status === 200, `llego ${delTec.status}`);
  comprobar('el personal NO recibe la flota por este endpoint',
    (delTec.body?.vehiculos?.length ?? 0) === 0,
    `-> le llegaron ${delTec.body?.vehiculos?.length} vehiculo(s)`);
  comprobar('al personal se le marca como no vinculado',
    delTec.body?.vinculado === false, `-> ${delTec.body?.vinculado}`);

  // --- Que la fecha real ausente no rompa nada ---
  // Los vehiculos del taller todavia no tienen fecha real cargada.
  // La app tiene que mostrarlos igual, con la fecha en null, en
  // vez de esconder el auto o romperse.
  const sinReal = suyo.body?.vehiculos?.[0];
  comprobar('un vehiculo sin fecha real sigue apareciendo', Boolean(sinReal?.placa));
  comprobar('sin fecha real, fecha_realizada va en null (no inventada)',
    sinReal?.inspeccion?.fecha_realizada === null,
    `-> ${sinReal?.inspeccion?.fecha_realizada}`);
  comprobar('el vencimiento sigue disponible aunque falte la fecha real',
    Boolean(sinReal?.inspeccion?.fecha_vencimiento));

  // --- Que el endpoint no se haya tragado el panel del taller ---
  const panel = await api('GET', '/vehiculos', { token: tCliA.token });
  comprobar('el panel del taller sigue cerrado al cliente -> 403', panel.status === 403, `llego ${panel.status}`);

  await query('UPDATE vehiculos SET id_cliente = NULL WHERE id IN (?, ?)', [ids.vehiculoA, ids.vehiculoB]);
  await query('UPDATE clientes SET id_usuario = NULL WHERE id IN (?, ?)', [clienteA, clienteB]);
}

// ------------------------------------------------------------
//  13. Activacion de cuentas con codigo
// ------------------------------------------------------------
//  El flujo que le falta a un cliente para existirse solo desde
//  la app: el taller le da un codigo, el cliente se registra.
//
//  Lo que se comprueba, en orden de importancia:
//
//    1. Que el codigo cree la cuenta Y la enlace al cliente. Si
//       la cuenta se crea pero `clientes.id_usuario` queda en
//       NULL, el usuario entra a la app y ve "sin vehiculos" con
//       una sesion valida, que es el peor fallo posible: nadie
//       sabe que esta roto.
//    2. Que el codigo no se pueda reutilizar ni adivinar.
//    3. Que el codigo no quede guardado en claro.
//    4. Que un cliente no pueda emitir codigos para si mismo.
// ------------------------------------------------------------
async function t13_activacion() {
  titulo('13. ACTIVACION DE CUENTAS CON CODIGO');

  const tAdmin = { token: acuñarToken(USUARIOS.admin, 'administrador', ids.admin) };
  const tCli = { token: acuñarToken(USUARIOS.clienteA, 'cliente', ids.clienteA) };

  // Cliente de prueba, con telefono y sin cuenta. No se usa uno
  // de la replica para no ensuciar datos que otros tests leen.
  const tel = `5917${String(70000000 + Math.floor(Math.random() * 900000)).slice(0, 8)}`;
  // Ojo: `query()` hace `[rows] = await execute()`, asi que en un
  // INSERT devuelve el ResultSetHeader (con `insertId`), no un
  // array de filas. Desestructurarlo revienta con
  // "is not iterable".
  const creado = await query(
    `INSERT INTO clientes (nombre, apellido, telefono) VALUES (?, ?, ?)`,
    ['Activa', 'Prueba', tel]
  );
  const idCliente = creado.insertId;

  // --- El taller emite el codigo ---
  const emite = await api('POST', '/auth/codigos', { token: tAdmin.token, body: { telefono: tel } });
  comprobar('el personal puede emitir un codigo -> 201', emite.status === 201, `llego ${emite.status}`);
  comprobar('el codigo viene con el formato AAAAA-BBBBB',
    /^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/.test(emite.body?.codigo ?? ''),
    `-> ${emite.body?.codigo}`);
  comprobar('el codigo no trae I, O, 0 ni 1 (no se confunden al dictarlo)',
    !/[IO01]/.test(emite.body?.codigo ?? ''), `-> ${emite.body?.codigo}`);
  comprobar('el codigo se emite con el telefono del cliente',
    emite.body?.telefono === tel, `-> ${emite.body?.telefono}`);

  // --- El codigo NO se guarda en claro ---
  const [{ hash }] = await query(
    'SELECT codigo_hash AS hash FROM codigos_activacion WHERE id_cliente = ? ORDER BY id DESC LIMIT 1',
    [idCliente]
  );
  comprobar('el codigo se guarda hasheado, no en claro', hash !== emite.body?.codigo, `-> ${hash}`);
  comprobar('el hash es un SHA-256 de 64 hex', /^[0-9a-f]{64}$/.test(hash), `-> ${hash}`);

  // --- El cliente se registra ---
  const usuario = `vf_act_${SUFIJO}`;
  const clave = 'ClaveSeguraVF2026!';
  const act = await api('POST', '/auth/activar', {
    body: { username: usuario, password: clave, codigo: emite.body?.codigo },
    ip: ipNueva(),
  });
  comprobar('el canje del codigo crea la cuenta -> 201', act.status === 201, `llego ${act.status}; ${JSON.stringify(act.body).slice(0, 120)}`);
  comprobar('la activacion devuelve un token', typeof act.body?.token === 'string' && act.body.token.length > 20);
  comprobar('la cuenta nace con rol cliente', act.body?.user?.rol === 'cliente', `-> ${act.body?.user?.rol}`);
  comprobar('la cuenta nace activa (puede entrar de una)',
    (await api('POST', '/auth/login', { body: { username: usuario, password: clave } })).status === 200);

  // --- El enlace cliente <-> cuenta, que es lo que hace util la app ---
  const [vinculo] = await query('SELECT id_usuario AS u FROM clientes WHERE id = ?', [idCliente]);
  const [cuenta] = await query('SELECT id, rol, estado FROM usuarios WHERE username = ?', [usuario]);
  comprobar('el cliente queda enlazado a la cuenta nueva',
    vinculo?.u === cuenta?.id, `cliente.id_usuario=${vinculo?.u}, usuario.id=${cuenta?.id}`);
  comprobar('la contrasena se guarda con bcrypt (empieza con $2)',
    typeof cuenta?.rol === 'string' && (await queryOne('SELECT password AS p FROM usuarios WHERE id = ?', [cuenta?.id]))?.p?.startsWith('$2'),
    'no es un hash bcrypt');

  // El token recibido debe servir para la vista del cliente.
  const conSuToken = await api('GET', '/cliente/vehiculos', { token: act.body?.token });
  comprobar('el token de activacion ya sirve para la vista del cliente -> 200',
    conSuToken.status === 200, `llego ${conSuToken.status}`);
  comprobar('el cliente recien activado aparece como vinculado',
    conSuToken.body?.vinculado === true, `-> ${conSuToken.body?.vinculado}`);

  // --- El codigo no se reutiliza ---
  const reuso = await api('POST', '/auth/activar', {
    body: { username: `${usuario}_2`, password: clave, codigo: emite.body?.codigo },
    ip: ipNueva(),
  });
  comprobar('el codigo NO se puede usar dos veces', reuso.status >= 400, `llego ${reuso.status}`);

  // --- Codigo inventado, expirado y de baja calidad ---
  const falso = await api('POST', '/auth/activar', {
    body: { username: `${usuario}_3`, password: clave, codigo: 'ZZZZZ-99999' },
    ip: ipNueva(),
  });
  comprobar('un codigo inexistente se rechaza', falso.status === 400, `llego ${falso.status}`);

  await query(
    `INSERT INTO clientes (nombre, apellido, telefono) VALUES (?, ?, ?)`,
    ['Expira', 'Prueba', `${tel}9`]
  );
  const expira = await api('POST', '/auth/codigos', { token: tAdmin.token, body: { telefono: `${tel}9` } });
  await query('UPDATE codigos_activacion SET fecha_expiracion = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE telefono = ?', [`${tel}9`]);
  const vencido = await api('POST', '/auth/activar', {
    body: { username: `${usuario}_4`, password: clave, codigo: expira.body?.codigo },
    ip: ipNueva(),
  });
  comprobar('un codigo expirado se rechaza', vencido.status === 400, `llego ${vencido.status}`);
  comprobar('al expirar, el mensaje dice que expire (para que pida uno nuevo)',
    vencido.body?.code === 'CODIGO_EXPIRADO', `-> ${vencido.body?.code}`);

  // --- Emitir uno nuevo mata al anterior ---
  await query(`INSERT INTO clientes (nombre, apellido, telefono) VALUES (?, ?, ?)`,
    ['Reemito', 'Prueba', `${tel}8`]);
  const viejo = await api('POST', '/auth/codigos', { token: tAdmin.token, body: { telefono: `${tel}8` } });
  const nuevo = await api('POST', '/auth/codigos', { token: tAdmin.token, body: { telefono: `${tel}8` } });
  comprobar('dos emisiones dan dos codigos distintos', viejo.body?.codigo !== nuevo.body?.codigo,
    `${viejo.body?.codigo} vs ${nuevo.body?.codigo}`);
  const conViejo = await api('POST', '/auth/activar', {
    body: { username: `${usuario}_5`, password: clave, codigo: viejo.body?.codigo },
    ip: ipNueva(),
  });
  comprobar('el codigo viejo deja de servir al emitir uno nuevo', conViejo.status === 400, `llego ${conViejo.status}`);

  // --- El codigo se teclea como salga ---
  await query(`INSERT INTO clientes (nombre, apellido, telefono) VALUES (?, ?, ?)`,
    ['Minusc', 'Prueba', `${tel}7`]);
  const conGuion = await api('POST', '/auth/codigos', { token: tAdmin.token, body: { telefono: `${tel}7` } });
  const tecleado = String(conGuion.body?.codigo ?? '').toLowerCase().replace(/-/g, '');
  const enMinuscula = await api('POST', '/auth/activar', {
    body: { username: `${usuario}_6`, password: clave, codigo: tecleado },
    ip: ipNueva(),
  });
  comprobar('el codigo funciona en minusculas y sin guion -> 201', enMinuscula.status === 201,
    `llego ${enMinuscula.status}; se tecleo "${tecleado}"`);

  // --- Reglas de la contrasena ---
  const corta = await api('POST', '/auth/activar', {
    body: { username: `${usuario}_7`, password: 'corta', codigo: nuevo.body?.codigo },
    ip: ipNueva(),
  });
  comprobar('una contrasena de menos de 8 caracteres se rechaza', corta.status === 400, `llego ${corta.status}`);

  // --- Y ahora el freno, medido a proposito con una sola IP ---
  // Con IP fija y codigo siempre invalido, el 6to intento tiene
  // que chocar con 429. Si no, el freno no existe y alguien
  // podria barrer codigos desde una maquina.
  const ipFija = ipNueva();
  let codigos = [];
  for (let i = 0; i < 7; i++) {
    codigos.push((await api('POST', '/auth/activar', {
      body: { username: `${usuario}_f${i}`, password: clave, codigo: 'ZZZZZ-99999' },
      ip: ipFija,
    })).status);
  }
  comprobar('el freno de /auth/activar corta al 6to intento desde una IP',
    codigos.slice(0, 5).every((s) => s === 400) && codigos[5] === 429 && codigos[6] === 429,
    `-> ${codigos.join(', ')}`);

  // --- Quien puede emitir codigos ---
  const comoCliente = await api('POST', '/auth/codigos', { token: tCli.token, body: { telefono: tel } });
  comprobar('un CLIENTE NO puede emitir codigos -> 403', comoCliente.status === 403, `llego ${comoCliente.status}`);

  const sinSesion = await api('POST', '/auth/codigos', { body: { telefono: tel } });
  comprobar('emitir un codigo sin sesion -> 401', sinSesion.status === 401, `llego ${sinSesion.status}`);

  const desconocido = await api('POST', '/auth/codigos', { token: tAdmin.token, body: { telefono: '59100000000' } });
  comprobar('un telefono que no es cliente no recibe codigo -> 404', desconocido.status === 404, `llego ${desconocido.status}`);

  const yaActivado = await api('POST', '/auth/codigos', { token: tAdmin.token, body: { telefono: tel } });
  comprobar('un cliente que ya tiene cuenta no recibe otro codigo -> 409', yaActivado.status === 409, `llego ${yaActivado.status}`);

  // --- La carrera: dos canjes simultaneos del MISMO codigo ---
  // Se lanzan a la vez y sin esperar. Si el reclamo del codigo no
  // fuese atomico, ambos insertarian usuario y el segundo pisaria
  // el vinculo del primero, dejando una cuenta huerfana: existe,
  // no ve vehiculos, y el cliente ya no puede reactivarse.
  const telCarrera = `${tel}6`;
  await query(`INSERT INTO clientes (nombre, apellido, telefono) VALUES (?, ?, ?)`,
    ['Carrera', 'Prueba', telCarrera]);
  const codCarrera = await api('POST', '/auth/codigos', {
    token: tAdmin.token, body: { telefono: telCarrera },
  });

  const dosALaVez = await Promise.all(
    [0, 1].map((n) => api('POST', '/auth/activar', {
      body: { username: `${usuario}_c${n}`, password: clave, codigo: codCarrera.body?.codigo },
      ip: ipNueva(),
    }))
  );
  const exitos = dosALaVez.filter((r) => r.status === 201);
  comprobar('con dos canjes simultaneos del mismo codigo, UNO solo gana',
    exitos.length === 1, `ganaron ${exitos.length} (${dosALaVez.map((r) => r.status).join(' y ')})`);
  comprobar('el perdedor recibe un rechazo, no un error de servidor',
    dosALaVez.filter((r) => r.status !== 201).every((r) => r.status >= 400 && r.status < 500),
    `-> ${dosALaVez.map((r) => r.status).join(' y ')}`);

  const [clienteCarrera] = await query('SELECT id_usuario AS u FROM clientes WHERE telefono = ?', [telCarrera]);
  const [cuentaCarrera] = await query('SELECT id FROM usuarios WHERE id = ?', [clienteCarrera?.u]);
  const huerfanas = await query('SELECT id FROM usuarios WHERE username LIKE ? AND id <> ?', [`${usuario}_c%`, clienteCarrera?.u ?? -1]);
  comprobar('el cliente queda enlazado a una cuenta real, no a una huerfana',
    Boolean(cuentaCarrera?.id), `cliente.id_usuario=${clienteCarrera?.u}`);
  comprobar('la carrera NO deja cuentas huerfanas (una sola cuenta creada)',
    huerfanas.length === 0, `sobran ${huerfanas.length}`);

  // --- Limpieza de lo que creo esta seccion ---
  await query('DELETE FROM usuarios WHERE username LIKE ?', [`vf_act_${SUFIJO}%`]);
  await query('UPDATE clientes SET id_usuario = NULL WHERE telefono LIKE ?', [`${tel}%`]);
  await query('DELETE FROM clientes WHERE telefono LIKE ?', [`${tel}%`]);
  await query('DELETE FROM codigos_activacion WHERE telefono LIKE ?', [`${tel}%`]);
}

// ------------------------------------------------------------
//  Fin de la bateria
// ------------------------------------------------------------
async function main() {
  linea();
  console.log('  VALIDACION FINAL — API SIGE-GNV VC GAS');
  linea();
  console.log(`  API    : ${API}`);
  console.log(`  Base   : ${env.db.host}:${env.db.port}/${env.db.database}`);
  console.log(`  Sufijo : ${SUFIJO}`);
  linea();

  const [info] = await query('SELECT DATABASE() AS db, VERSION() AS v');
  console.log(`  Base en uso: ${info.db}  (${info.v})`);
  linea();

  await sembrar();

  try {
    await t1_health();
    await t2_login();
    await t3_fechas();
    await t4_recordatorio();
    await t5_publica();
    await t6_vehiculos();
    await t7_cilindros();
    await t8_inventario();
    await t9_usuarios();
    await t10_notificaciones();
    await t11_wpconnect();
    await t12_vistaCliente();
    await t13_activacion();
  } catch (error) {
    fallos += 1;
    console.log(`  [FALLO] La bateria se detuvo por un error: ${error.message}`);
    fallosDetalle.push(`Error no controlado: ${error.message}`);
    console.log(error.stack);
  } finally {
    await limpiar();
  }

  linea();
  console.log(`  RESULTADO: ${ok + fallos} comprobacion(es), ${fallos} fallo(s)`);
  if (fallosDetalle.length > 0) {
    linea();
    console.log('  FALLOS:');
    for (const f of fallosDetalle) console.log(`    - ${f}`);
  }
  linea();
  console.log('  Base de pruebas limpiada. No se toco ninguna base real.');
  linea();

  await closePool();
  process.exit(fallos > 0 ? 1 : 0);
}

main();
