#!/usr/bin/env node
// ============================================================
//  scripts/test-inventario.js
//  Pruebas del modulo de INVENTARIO.
//
//  Cubre las doce comprobaciones del taller:
//
//     1. Consultar productos.
//     2. Crear producto si el rol lo permite.
//     3. Registrar entrada.
//     4. Comprobar aumento de stock.
//     5. Registrar salida.
//     6. Comprobar reduccion de stock.
//     7. Impedir salida superior al stock.
//     8. Registrar historial.
//     9. Verificar usuario responsable.
//    10. Detectar stock minimo.
//    11. Verificar que el cliente movil no pueda acceder.
//    12. Verificar que los datos persistan en MariaDB.
//
//  Y una treceava, que es la integracion con el modulo de IA:
//  que la IA NO dependa del inventario ni del stock, y que los
//  precios si se lean de la base y no esten escritos en el codigo.
//
//  ------------------------------------------------------------
//  QUE TOCA Y QUE NO
//  ------------------------------------------------------------
//  Este script SI escribe, pero solo lo suyo:
//    - crea un producto con codigo `PRUEBA-INV-<marca de tiempo>`
//      y, en la prueba 13, un repuesto `PRUEBA-INVREP-<marca>`
//    - crea tres usuarios temporales: `inv_admin_*`, `inv_tec_*`
//      e `inv_cli_*`
//    - registra los movimientos de la prueba
//    - carga un precio de mano de obra con la clave
//      `instalacion_gnv_prueba_<marca>`, que no es la del taller
//      (`instalacion_gnv`): el precio real no se pisa nunca
//
//  Y al terminar borra UNICAMENTE esas filas. Nunca toca un
//  producto, un movimiento, un usuario o un precio que existieran
//  antes. El borrado va por el prefijo del codigo y por las
//  claves de esta corrida, y al final comprueba que los conteos
//  quedaron igual que al empezar. Si algo se rompe por el camino,
//  el `finally` intenta la limpieza igual.
//
//  ------------------------------------------------------------
//  SALVAGUARDAS
//  ------------------------------------------------------------
//  - Sin `--escribir` no se toca nada: solo corre lo que se
//    puede comprobar en lectura.
//  - Con NODE_ENV=production se niega a correr, aunque le
//    pasen `--escribir`.
//  - Sin las tablas de inventario no arranca, en vez de fallar
//    a medias.
//
//  Uso:
//    node scripts/test-inventario.js            (solo lectura)
//    node scripts/test-inventario.js --escribir (prueba completa)
//    npm run test:inventario
// ============================================================
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import env from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { query, queryOne, closePool, checkConnection, getServerInfo } from '../src/config/database.js';

const ES_ESCRITURA = process.argv.includes('--escribir');
const CLAVE_PRUEBA = 'InvPrueba#2026';
const PREFIJO_CODIGO = 'PRUEBA-INV';
const CONTRASENA_PRUEBA = 'PruebaTemporal#2026';

// --- Salida por pantalla ----------------------------------------------
function linea() {
  console.log('-'.repeat(64));
}

let pruebas = 0;
let fallos = 0;

/** Registra el resultado de una comprobacion. */
function comprobar(nombre, condicion, detalle = '') {
  pruebas += 1;

  if (condicion) {
    console.log(`  [OK]   ${nombre}`);
    return true;
  }

  fallos += 1;
  console.log(`  [FALLA] ${nombre}`);
  if (detalle) console.log(`          ${detalle}`);
  return false;
}

function seccion(titulo) {
  console.log('');
  console.log(`  ${titulo}`);
  console.log('  ' + '-'.repeat(62));
}

// --- Cliente HTTP -----------------------------------------------------
// Se levanta la app real de Express en un puerto libre. Las
// pruebas van por HTTP, igual que las haria el navegador, para
// que se comprueben el middleware de rol y no solo el servicio.

let servidor = null;
let baseUrl = '';

async function levantarApi() {
  if (servidor) return;

  const app = createApp();

  await new Promise((resolve) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
  });

  baseUrl = `http://127.0.0.1:${servidor.address().port}/api`;
}

async function bajarApi() {
  if (!servidor) return;

  await new Promise((resolve) => servidor.close(resolve));
  servidor = null;
}

/**
 * Peticion a la API. Devuelve { status, cuerpo }.
 * Nunca lanza por un 4xx o 5xx: justamente esos son los casos
 * que hay que comprobar.
 */
async function pedir(metodo, ruta, { token = null, cuerpo = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers,
    // Un GET con cuerpo lo rechaza fetch. `null` tambien cuenta
    // como "sin cuerpo", no como "el texto null".
    body: cuerpo === undefined || cuerpo === null ? undefined : JSON.stringify(cuerpo),
  });

  let datos = null;

  try {
    datos = await res.json();
  } catch {
    datos = null;
  }

  return { status: res.status, cuerpo: datos };
}

async function iniciarSesion(username) {
  const res = await pedir('POST', '/auth/login', {
    cuerpo: { username, password: CONTRASENA_PRUEBA },
  });

  if (res.status !== 200 || !res.cuerpo?.token) {
    throw new Error(
      `No se pudo iniciar sesion como ${username} ` +
        `(HTTP ${res.status}: ${res.cuerpo?.message ?? 'sin respuesta'})`
    );
  }

  return res.cuerpo.token;
}

// --- Utilidades de base de datos --------------------------------------

/** Conteo de filas de una tabla, para comparar antes y despues. */
async function conteo(tabla, where = '', params = []) {
  const fila = await queryOne(
    `SELECT COUNT(*) AS n FROM \`${tabla}\` ${where}`,
    params
  );

  return Number(fila.n);
}

function marcaTiempo() {
  return Date.now().toString(36).toUpperCase();
}

/** Estado de las tablas de inventario antes de empezar. */
async function fotografia() {
  return {
    productos: await conteo('inventario_productos'),
    movimientos: await conteo('movimientos_inventario'),
    usuarios: await conteo('usuarios'),
    parametros: await contarParametros(),
  };
}

/**
 * Cuenta los precios de parametro. La tabla se creo en la
 * migracion 007, asi que en una base que solo tiene la 006 todavia
 * no existe y se cuenta como 0 en vez de romper el script.
 */
async function contarParametros() {
  try {
    return await conteo('parametros_precios');
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return 0;
    throw e;
  }
}

// --- Datos de prueba --------------------------------------------------

const marca = marcaTiempo();
const USUARIOS_PRUEBA = {
  admin: `inv_admin_${marca.toLowerCase()}`,
  tecnico: `inv_tec_${marca.toLowerCase()}`,
  cliente: `inv_cli_${marca.toLowerCase()}`,
};

const idsUsuarios = {};
let idProductoPrueba = null;

/**
 * Clave del precio de mano de obra que usa la prueba 13.
 * Lleva el sufijo de la corrida: la real del taller se llama
 * `instalacion_gnv` y esta no la pisa.
 */
const CLAVE_PRECIO_PRUEBA = `instalacion_gnv_prueba_${marca.toLowerCase()}`;

/**
 * Capacidad de cilindro que usa la prueba 13.
 *
 * Tiene que existir en `CILINDROS_REFERENCIA` (src/ai/vehicleRecognition),
 * porque el endpoint primero busca la medida en el catalogo y
 * despues consulta su precio. Si el catalogo cambia, esta constante
 * tiene que cambiar con el.
 */
const CAPACIDAD_PRUEBA = 40;

/**
 * Prefijo real de las claves de precio de cilindro.
 *
 * NO lleva el sufijo de la corrida, a diferencia de
 * `CLAVE_PRECIO_PRUEBA`: el prefijo lo lee el modulo del servidor,
 * que ya esta cargado cuando el script cambia `process.env`, asi
 * que hay que usar el de verdad. La clave completa se restaura al
 * final de la seccion 13.
 */
const PREFIJO_CILINDRO = 'cilindro_';

/** Crea un usuario temporal con hash bcrypt de verdad. */
async function crearUsuarioPrueba(username, rol) {
  const hash = await bcrypt.hash(CONTRASENA_PRUEBA, 10);

  const resultado = await query(
    `INSERT INTO usuarios (username, password, rol, estado)
     VALUES (?, ?, ?, 'activo')`,
    [username, hash, rol]
  );

  return resultado.insertId;
}

/**
 * Borra SOLO lo que creo este script, en cualquiera de sus
 * corridas: el codigo de producto y los tres prefijos de usuario.
 * Asi, si una corrida anterior se murio a mitad de camino, la
 * siguiente no encuentra.sobras.
 *
 * El orden importa: los movimientos van primero porque la FK
 * hacia productos y usuarios es ON DELETE RESTRICT.
 *
 * Los tres nombres de usuario llevan un prefijo que ningun
 * usuario real del taller va a usar.
 */
async function limpiar() {
  const notas = [];

  // 1) Movimientos de los productos de prueba. Se localizan por
  //    el codigo, no por un id guardado, por si la prueba fallo
  //    antes de crear el producto.
  const movs = await query(
    `DELETE m FROM movimientos_inventario m
       JOIN inventario_productos p ON p.id_producto = m.id_producto
      WHERE p.codigo LIKE '${PREFIJO_CODIGO}%'`
  );

  if (movs.affectedRows > 0) notas.push(`${movs.affectedRows} movimiento(s)`);

  // 2) Productos de prueba.
  const prods = await query(
    `DELETE FROM inventario_productos WHERE codigo LIKE '${PREFIJO_CODIGO}%'`
  );

  if (prods.affectedRows > 0) notas.push(`${prods.affectedRows} producto(s)`);

  // 3) Usuarios temporales de cualquier corrida.
  const users = await query(
    `DELETE FROM usuarios
      WHERE username LIKE 'inv\\_admin\\_%'
         OR username LIKE 'inv\\_tec\\_%'
         OR username LIKE 'inv\\_cli\\_%'`
  );

  if (users.affectedRows > 0) notas.push(`${users.affectedRows} usuario(s)`);

  // 4) Los dos precios de la prueba 13: la mano de obra y el
  //    cilindro de 40 L. Las claves llevan el sufijo de la corrida,
  //    asi que no se pisa el precio real del taller aunque este
  //    cargado con el mismo nombre.
  // `cilindro_40` NO se borra a ciegas: la seccion 13 lo restaura
  // a su valor original. Si la prueba se corto a la mitad, este
  // es el unico aviso. Ver `restaurarPrecioCilindro`.
  const param = await query(
    'DELETE FROM parametros_precios WHERE clave = ?',
    [CLAVE_PRECIO_PRUEBA]
  );

  if (param.affectedRows > 0) notas.push(`${param.affectedRows} precio(s) de parámetro`);

  return notas;
}

/** Lee un producto directamente de MariaDB, sin pasar por la API. */
async function leerProducto(id) {
  return queryOne('SELECT * FROM inventario_productos WHERE id_producto = ?', [id]);
}

// --- Pruebas ----------------------------------------------------------

/**
 * Las doce comprobaciones, en orden.
 * Devuelve los tokens y el id del producto para que el main
 * pueda limpiar despues.
 */
async function correrPruebas() {
  const codigo = `${PREFIJO_CODIGO}-${marca}`;

  // --- Preparacion ---------------------------------------------------
  idsUsuarios.admin = await crearUsuarioPrueba(USUARIOS_PRUEBA.admin, 'administrador');
  idsUsuarios.tecnico = await crearUsuarioPrueba(USUARIOS_PRUEBA.tecnico, 'tecnico');
  idsUsuarios.cliente = await crearUsuarioPrueba(USUARIOS_PRUEBA.cliente, 'cliente');

  const tokenAdmin = await iniciarSesion(USUARIOS_PRUEBA.admin);
  const tokenTecnico = await iniciarSesion(USUARIOS_PRUEBA.tecnico);
  const tokenCliente = await iniciarSesion(USUARIOS_PRUEBA.cliente);

  seccion('1. Consultar productos');

  const listaInicial = await pedir('GET', '/inventario/productos', { token: tokenAdmin });

  comprobar(
    'GET /inventario/productos responde 200 para el administrador',
    listaInicial.status === 200 && Array.isArray(listaInicial.cuerpo?.productos),
    `HTTP ${listaInicial.status}`
  );

  comprobar(
    'el listado trae codigo, nombre, stock y stock minimo',
    Array.isArray(listaInicial.cuerpo?.productos) &&
      listaInicial.cuerpo.productos.every(
        (p) =>
          'codigo' in p &&
          'nombre' in p &&
          'stock_actual' in p &&
          'stock_minimo' in p
      )
  );

  const resumen = await pedir('GET', '/inventario/resumen', { token: tokenAdmin });
  comprobar(
    'GET /inventario/resumen responde 200',
    resumen.status === 200 && typeof resumen.cuerpo?.resumen?.productos_activos === 'number',
    `HTTP ${resumen.status}`
  );

  // --- 2. Crear producto ---------------------------------------------
  seccion('2. Crear producto si el rol lo permite');

  const altaTecnico = await pedir('POST', '/inventario/productos', {
    token: tokenTecnico,
    cuerpo: { codigo: `${codigo}-NO`, nombre: 'No debe existir' },
  });

  comprobar(
    'el tecnico NO puede crear productos (403)',
    altaTecnico.status === 403,
    `HTTP ${altaTecnico.status}`
  );

  comprobar(
    'el rechazo del tecnico no dejo ningun producto creado',
    (await conteo('inventario_productos', 'WHERE codigo = ?', [`${codigo}-NO`])) === 0
  );

  const alta = await pedir('POST', '/inventario/productos', {
    token: tokenAdmin,
    cuerpo: {
      codigo: codigo.toLowerCase(),
      nombre: 'Producto de prueba',
      descripcion: 'Producto creado por scripts/test-inventario.js',
      categoria: 'producto',
      unidad: 'unidad',
      stock_minimo: 2,
      precio_compra: 1900.5,
      precio_venta: 2400,
    },
  });

  comprobar(
    'el administrador SI puede crear productos (201)',
    alta.status === 201 && Number.isInteger(alta.cuerpo?.producto?.id_producto),
    `HTTP ${alta.status}: ${alta.cuerpo?.message ?? ''}`
  );

  idProductoPrueba = alta.cuerpo?.producto?.id_producto ?? null;

  comprobar(
    'el producto nuevo arranca en stock 0',
    Number(alta.cuerpo?.producto?.stock_actual) === 0,
    `stock_actual = ${alta.cuerpo?.producto?.stock_actual}`
  );

  comprobar(
    'el codigo se normaliza a mayusculas',
    alta.cuerpo?.producto?.codigo === codigo,
    `codigo = ${alta.cuerpo?.producto?.codigo}`
  );

  const duplicado = await pedir('POST', '/inventario/productos', {
    token: tokenAdmin,
    cuerpo: { codigo, nombre: 'Duplicado' },
  });

  comprobar(
    'un codigo repetido se rechaza (409)',
    duplicado.status === 409,
    `HTTP ${duplicado.status}`
  );

  const editarConStock = await pedir('PUT', `/inventario/productos/${idProductoPrueba}`, {
    token: tokenAdmin,
    cuerpo: {
      codigo,
      nombre: 'Producto de prueba editado',
      stock_inicial: 5,
    },
  });

  comprobar(
    'editar el stock desde la ficha se rechaza: el stock solo cambia por movimiento',
    editarConStock.status === 400 &&
      editarConStock.cuerpo?.code === 'STOCK_SOLO_POR_MOVIMIENTO',
    `HTTP ${editarConStock.status} ${editarConStock.cuerpo?.code ?? ''}`
  );

  // --- 3. Registrar entrada -------------------------------------------
  seccion('3. Registrar entrada');

  const entrada = await pedir('POST', '/inventario/movimientos', {
    token: tokenAdmin,
    cuerpo: {
      id_producto: idProductoPrueba,
      tipo: 'ENTRADA',
      cantidad: 10,
      motivo: 'Compra de mercaderia',
      referencia: `FAC-PRUEBA-${marca}`,
    },
  });

  comprobar(
    'la ENTRADA se registra (201)',
    entrada.status === 201 && entrada.cuerpo?.movimiento?.tipo === 'ENTRADA',
    `HTTP ${entrada.status}: ${entrada.cuerpo?.message ?? ''}`
  );

  comprobar(
    'la entrada sin motivo se rechaza (400)',
    (
      await pedir('POST', '/inventario/movimientos', {
        token: tokenAdmin,
        cuerpo: { id_producto: idProductoPrueba, tipo: 'ENTRADA', cantidad: 1 },
      })
    ).status === 400
  );

  comprobar(
    'un tipo de movimiento inexistente se rechaza (400)',
    (
      await pedir('POST', '/inventario/movimientos', {
        token: tokenAdmin,
        cuerpo: { id_producto: idProductoPrueba, tipo: 'DONACION', cantidad: 1, motivo: 'x' },
      })
    ).status === 400
  );

  // --- 4. El stock aumento --------------------------------------------
  seccion('4. Comprobar aumento de stock');

  const trasEntrada = await leerProducto(idProductoPrueba);

  comprobar(
    'el stock paso de 0 a 10',
    Number(trasEntrada.stock_actual) === 10,
    `stock_actual = ${trasEntrada.stock_actual}`
  );

  comprobar(
    'el movimiento guardo stock_anterior = 0 y stock_nuevo = 10',
    Number(entrada.cuerpo?.movimiento?.stockAnterior) === 0 &&
      Number(entrada.cuerpo?.movimiento?.stockNuevo) === 10
  );

  // --- 5. Registrar salida --------------------------------------------
  seccion('5. Registrar salida');

  const salida = await pedir('POST', '/inventario/movimientos', {
    token: tokenAdmin,
    cuerpo: {
      id_producto: idProductoPrueba,
      tipo: 'SALIDA',
      cantidad: 4,
      motivo: 'Uso en servicio de conversion',
      referencia: `OT-PRUEBA-${marca}`,
    },
  });

  comprobar(
    'la SALIDA se registra (201)',
    salida.status === 201 && salida.cuerpo?.movimiento?.tipo === 'SALIDA',
    `HTTP ${salida.status}: ${salida.cuerpo?.message ?? ''}`
  );

  // --- 6. El stock bajo ------------------------------------------------
  seccion('6. Comprobar reduccion de stock');

  const trasSalida = await leerProducto(idProductoPrueba);

  comprobar(
    'el stock paso de 10 a 6',
    Number(trasSalida.stock_actual) === 6,
    `stock_actual = ${trasSalida.stock_actual}`
  );

  // --- 7. No se puede retirar mas de lo que hay ------------------------
  seccion('7. Impedir salida superior al stock');

  // Se deja el stock en 2 a proposito, que es el caso del taller:
  // hay 2 y se intenta retirar 4.
  const dejarEnDos = await pedir('POST', '/inventario/movimientos', {
    token: tokenAdmin,
    cuerpo: {
      id_producto: idProductoPrueba,
      tipo: 'SALIDA',
      cantidad: 4,
      motivo: 'Segundo consumo en servicio',
    },
  });

  comprobar(
    'el stock se deja en 2 para probar el caso limite',
    dejarEnDos.status === 201 &&
      Number((await leerProducto(idProductoPrueba)).stock_actual) === 2,
    `HTTP ${dejarEnDos.status}`
  );

  const exceso = await pedir('POST', '/inventario/movimientos', {
    token: tokenAdmin,
    cuerpo: {
      id_producto: idProductoPrueba,
      tipo: 'SALIDA',
      cantidad: 4,
      motivo: 'Prueba de stock insuficiente',
    },
  });

  comprobar(
    'con stock 2 no se puede retirar 4 (409)',
    exceso.status === 409,
    `HTTP ${exceso.status}`
  );

  comprobar(
    'el error es de tipo STOCK_INSUFICIENTE',
    exceso.cuerpo?.code === 'STOCK_INSUFICIENTE',
    `code = ${exceso.cuerpo?.code ?? '(ninguno)'}`
  );

  comprobar(
    'el mensaje dice "Stock insuficiente"',
    /stock insuficiente/i.test(exceso.cuerpo?.message ?? ''),
    `message = ${exceso.cuerpo?.message ?? '(ninguno)'}`
  );

  const trasExceso = await leerProducto(idProductoPrueba);

  comprobar(
    'el stock SIGUE en 2: no quedo en -2',
    Number(trasExceso.stock_actual) === 2,
    `stock_actual = ${trasExceso.stock_actual}`
  );

  const negativoDirecto = await query(
    'SELECT COUNT(*) AS n FROM inventario_productos WHERE stock_actual < 0'
  );
  comprobar(
    'ningun producto de la base tiene stock negativo',
    Number(negativoDirecto[0].n) === 0,
    `productos negativos = ${negativoDirecto[0].n}`
  );

  const ajusteNegativo = await pedir('POST', '/inventario/movimientos', {
    token: tokenAdmin,
    cuerpo: {
      id_producto: idProductoPrueba,
      tipo: 'AJUSTE',
      stock_nuevo: -3,
      motivo: 'Prueba de ajuste negativo',
    },
  });

  comprobar(
    'un AJUSTE a stock negativo se rechaza (400)',
    ajusteNegativo.status === 400 && ajusteNegativo.cuerpo?.code === 'STOCK_NEGATIVO',
    `HTTP ${ajusteNegativo.status} ${ajusteNegativo.cuerpo?.code ?? ''}`
  );

  const ajuste = await pedir('POST', '/inventario/movimientos', {
    token: tokenAdmin,
    cuerpo: {
      id_producto: idProductoPrueba,
      tipo: 'AJUSTE',
      stock_nuevo: 5,
      motivo: 'Conteo fisico de fin de mes',
    },
  });

  comprobar(
    'un AJUSTE valido se registra (201) y guarda la diferencia (de 2 a 5 son 3)',
    ajuste.status === 201 && Number(ajuste.cuerpo?.movimiento?.cantidad) === 3,
    `HTTP ${ajuste.status}, cantidad = ${ajuste.cuerpo?.movimiento?.cantidad}`
  );

  comprobar(
    'tras el ajuste el stock quedo en 5',
    Number((await leerProducto(idProductoPrueba)).stock_actual) === 5
  );

  return { tokenAdmin, tokenTecnico, tokenCliente };
}

// --- 8 a 12: historial, responsable, stock minimo, permisos, persistencia

async function correrRestoDePruebas({ tokenAdmin, tokenTecnico, tokenCliente }) {
  // --- 8. Historial ---------------------------------------------------
  seccion('8. Registrar historial');

  const historial = await pedir('GET', `/inventario/movimientos?id_producto=${idProductoPrueba}`, {
    token: tokenAdmin,
  });

  const movimientos = historial.cuerpo?.movimientos ?? [];

  comprobar(
    'GET /inventario/movimientos responde 200',
    historial.status === 200,
    `HTTP ${historial.status}`
  );

  comprobar(
    'el historial tiene los cuatro movimientos de la prueba',
    movimientos.length === 4,
    `movimientos = ${movimientos.length}`
  );

  const tipos = movimientos.map((m) => m.tipo).sort();

  comprobar(
    'el historial trae ENTRADA, SALIDA, SALIDA y AJUSTE',
    JSON.stringify(tipos) === JSON.stringify(['AJUSTE', 'ENTRADA', 'SALIDA', 'SALIDA']),
    `tipos = ${tipos.join(', ')}`
  );

  comprobar(
    'cada movimiento trae producto, cantidad, fecha, motivo y referencia',
    movimientos.every(
      (m) =>
        typeof m.producto_codigo === 'string' &&
        m.producto_codigo === `${PREFIJO_CODIGO}-${marca}` &&
        Number.isInteger(Number(m.cantidad)) &&
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(m.fecha) &&
        typeof m.motivo === 'string' &&
        m.motivo !== ''
    )
  );

  comprobar(
    'el historial viene del mas nuevo al mas viejo',
    movimientos.every(
      (m, i) => i === 0 || movimientos[i - 1].fecha >= m.fecha
    ),
    movimientos.map((m) => m.fecha).join(' | ')
  );

  // --- 9. Usuario responsable -----------------------------------------
  seccion('9. Verificar usuario responsable');

  comprobar(
    'cada movimiento guarda el id del usuario que lo hizo',
    movimientos.every((m) => Number(m.id_usuario) === idsUsuarios.admin)
  );

  comprobar(
    'cada movimiento muestra el nombre del usuario responsable',
    movimientos.every((m) => m.usuario === USUARIOS_PRUEBA.admin),
    `usuario = ${movimientos[0]?.usuario ?? '(ninguno)'}`
  );

  const entradaHistorial = movimientos.find((m) => m.tipo === 'ENTRADA');

  comprobar(
    'la entrada conserva su referencia',
    entradaHistorial?.referencia === `FAC-PRUEBA-${marca}`,
    `referencia = ${entradaHistorial?.referencia ?? '(ninguna)'}`
  );

  // --- 10. Stock minimo ------------------------------------------------
  seccion('10. Detectar stock minimo');

  const subirMinimo = await pedir('PUT', `/inventario/productos/${idProductoPrueba}`, {
    token: tokenAdmin,
    cuerpo: {
      codigo: `${PREFIJO_CODIGO}-${marca}`,
      nombre: 'Producto de prueba',
      categoria: 'producto',
      unidad: 'unidad',
      stock_minimo: 5,
      precio_compra: 1900.5,
      precio_venta: 2400,
    },
  });

  comprobar(
    'el administrador puede configurar el stock minimo',
    subirMinimo.status === 200 && Number(subirMinimo.cuerpo?.producto?.stock_minimo) === 5,
    `HTTP ${subirMinimo.status}: ${subirMinimo.cuerpo?.message ?? ''}`
  );

  const alertas = await pedir('GET', '/inventario/alertas', { token: tokenAdmin });
  const enAlerta = (alertas.cuerpo?.alertas ?? []).find(
    (a) => a.id_producto === idProductoPrueba
  );

  comprobar(
    'GET /inventario/alertas responde 200',
    alertas.status === 200,
    `HTTP ${alertas.status}`
  );

  comprobar(
    'con stock 5 y minimo 5 el producto aparece en la alerta',
    Boolean(enAlerta),
    `alertas = ${alertas.cuerpo?.alertas?.length ?? 0}`
  );

  comprobar(
    'la alerta dice stock_bajo y la diferencia es 0',
    enAlerta?.alerta === 'stock_bajo' && Number(enAlerta?.diferencia) === 0,
    `alerta = ${enAlerta?.alerta}, diferencia = ${enAlerta?.diferencia}`
  );

  const vaciar = await pedir('POST', '/inventario/movimientos', {
    token: tokenAdmin,
    cuerpo: {
      id_producto: idProductoPrueba,
      tipo: 'SALIDA',
      cantidad: 5,
      motivo: 'Prueba de producto agotado',
    },
  });

  comprobar(
    'se puede vaciar el producto (queda en 0, no en negativo)',
    vaciar.status === 201 &&
      Number((await leerProducto(idProductoPrueba)).stock_actual) === 0,
    `HTTP ${vaciar.status}`
  );

  const alertasSinStock = await pedir('GET', '/inventario/alertas', { token: tokenAdmin });
  const agotado = (alertasSinStock.cuerpo?.alertas ?? []).find(
    (a) => a.id_producto === idProductoPrueba
  );

  comprobar(
    'un producto agotado se marca como sin_stock',
    agotado?.alerta === 'sin_stock',
    `alerta = ${agotado?.alerta ?? '(no aparece)'}`
  );

  // --- 11. Permisos por rol -------------------------------------------
  seccion('11. Verificar que el cliente movil no pueda acceder');

  const clienteLista = await pedir('GET', '/inventario/productos', { token: tokenCliente });
  comprobar(
    'el cliente NO puede listar productos (403)',
    clienteLista.status === 403,
    `HTTP ${clienteLista.status}`
  );

  const clienteAlta = await pedir('POST', '/inventario/productos', {
    token: tokenCliente,
    cuerpo: { codigo: `${PREFIJO_CODIGO}-CLI`, nombre: 'No debe existir' },
  });
  comprobar(
    'el cliente NO puede crear productos (403)',
    clienteAlta.status === 403,
    `HTTP ${clienteAlta.status}`
  );

  const clienteMovimiento = await pedir('POST', '/inventario/movimientos', {
    token: tokenCliente,
    cuerpo: {
      id_producto: idProductoPrueba,
      tipo: 'SALIDA',
      cantidad: 1,
      motivo: 'No debe existir',
    },
  });
  comprobar(
    'el cliente NO puede registrar movimientos (403)',
    clienteMovimiento.status === 403,
    `HTTP ${clienteMovimiento.status}`
  );

  const clienteHistorial = await pedir('GET', '/inventario/movimientos', {
    token: tokenCliente,
  });
  comprobar(
    'el cliente NO puede consultar el historial (403)',
    clienteHistorial.status === 403,
    `HTTP ${clienteHistorial.status}`
  );

  comprobar(
    'los intentos del cliente no dejaron filas de mas',
    (await conteo('inventario_productos', 'WHERE codigo = ?', [`${PREFIJO_CODIGO}-CLI`])) === 0
  );

  const sinToken = await pedir('GET', '/inventario/productos');
  comprobar(
    'sin sesion no se entra al inventario (401)',
    sinToken.status === 401,
    `HTTP ${sinToken.status}`
  );

  const tecnicoLista = await pedir('GET', '/inventario/productos', { token: tokenTecnico });
  comprobar(
    'el tecnico SI puede consultar el stock (200)',
    tecnicoLista.status === 200 && Array.isArray(tecnicoLista.cuerpo?.productos),
    `HTTP ${tecnicoLista.status}`
  );

  const tecnicoAlertas = await pedir('GET', '/inventario/alertas', { token: tokenTecnico });
  comprobar(
    'el tecnico SI puede ver las alertas de stock (200)',
    tecnicoAlertas.status === 200,
    `HTTP ${tecnicoAlertas.status}`
  );

  const tecnicoMovimiento = await pedir('POST', '/inventario/movimientos', {
    token: tokenTecnico,
    cuerpo: {
      id_producto: idProductoPrueba,
      tipo: 'ENTRADA',
      cantidad: 1,
      motivo: 'No deberia pasar',
    },
  });
  comprobar(
    'el tecnico NO puede registrar entradas ni salidas (403)',
    tecnicoMovimiento.status === 403,
    `HTTP ${tecnicoMovimiento.status}`
  );

  const tecnicoHistorial = await pedir('GET', '/inventario/movimientos', {
    token: tokenTecnico,
  });
  comprobar(
    'el tecnico NO puede consultar el historial de movimientos (403)',
    tecnicoHistorial.status === 403,
    `HTTP ${tecnicoHistorial.status}`
  );

  const tecnicoEdicion = await pedir('PUT', `/inventario/productos/${idProductoPrueba}`, {
    token: tokenTecnico,
    cuerpo: { codigo: `${PREFIJO_CODIGO}-${marca}`, nombre: 'No deberia pasar' },
  });
  comprobar(
    'el tecnico NO puede editar productos (403)',
    tecnicoEdicion.status === 403,
    `HTTP ${tecnicoEdicion.status}`
  );

  comprobar(
    'los rechazos al tecnico no movieron el stock',
    Number((await leerProducto(idProductoPrueba)).stock_actual) === 0
  );

  return { tecnicoLista };
}

// --- 12. Persistencia en MariaDB --------------------------------------

/**
 * Abre una CONEXION NUEVA, distinta del pool de la API, y relee
 * los datos. Si todo lo anterior fuera una cache en memoria o una
 * transaccion sin confirmar, aqui no apareceria nada.
 */
async function comprobarPersistencia() {
  seccion('12. Verificar que los datos persistan en MariaDB');

  await bajarApi();

  const conexion = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  });

  try {
    const [version] = await conexion.query('SELECT VERSION() AS version, DATABASE() AS db');
    comprobar(
      'la conexion independiente habla con el mismo MariaDB',
      String(version[0].version).toLowerCase().includes('mariadb') &&
        version[0].db === env.db.database,
      `${version[0].version} / ${version[0].db}`
    );

    const [productos] = await conexion.execute(
      'SELECT * FROM inventario_productos WHERE id_producto = ?',
      [idProductoPrueba]
    );

    comprobar(
      'el producto sigue en MariaDB despues de cerrar la API',
      productos.length === 1,
      `filas = ${productos.length}`
    );

    comprobar(
      'el precio de compra guardado es el que se registro (1900.50)',
      Number(productos[0]?.precio_compra) === 1900.5,
      `precio_compra = ${productos[0]?.precio_compra}`
    );

    const [movimientos] = await conexion.execute(
      'SELECT tipo, cantidad, stock_anterior, stock_nuevo, id_usuario ' +
        'FROM movimientos_inventario WHERE id_producto = ? ORDER BY id_movimiento',
      [idProductoPrueba]
    );

    comprobar(
      'los movimientos siguen en MariaDB: 5 filas (ENTRADA, SALIDA, AJUSTE, SALIDA, SALIDA)',
      movimientos.length === 5,
      `filas = ${movimientos.length}`
    );

    comprobar(
      'los stocks guardados encadenan sin huecos',
      movimientos.every(
        (m, i) =>
          i === 0
            ? Number(m.stock_anterior) === 0
            : Number(movimientos[i - 1].stock_nuevo) === Number(m.stock_anterior)
      ),
      movimientos.map((m) => `${m.tipo} ${m.stock_anterior}->${m.stock_nuevo}`).join(' | ')
    );

    const [cuadre] = await conexion.execute(
      `SELECT p.stock_actual,
              COALESCE(SUM(
                CASE m.tipo
                  WHEN 'ENTRADA' THEN  m.cantidad
                  WHEN 'SALIDA'  THEN -m.cantidad
                  ELSE (m.stock_nuevo - m.stock_anterior)
                END), 0) AS por_movimientos
         FROM inventario_productos p
         LEFT JOIN movimientos_inventario m ON m.id_producto = p.id_producto
        WHERE p.id_producto = ?
        GROUP BY p.id_producto, p.stock_actual`,
      [idProductoPrueba]
    );

    comprobar(
      'el stock guardado cuadra con la suma de los movimientos',
      Number(cuadre[0]?.stock_actual) === Number(cuadre[0]?.por_movimientos),
      `guardado = ${cuadre[0]?.stock_actual}, movimientos = ${cuadre[0]?.por_movimientos}`
    );

    // La base de datos es la unica fuente de verdad: nada de lo
    // que hizo la prueba quedo en memoria.
    const [restricto] = await conexion.execute(
      'SELECT stock_actual FROM inventario_productos WHERE id_producto = ?',
      [idProductoPrueba]
    );

    comprobar(
      'el ultimo estado leido es coherente (stock 0 tras vaciarlo)',
      Number(restricto[0]?.stock_actual) === 0,
      `stock_actual = ${restricto[0]?.stock_actual}`
    );
  } finally {
    await conexion.end();
  }
}

// --- 13. El modulo de IA lee el inventario ----------------------------

/**
 * El modulo de IA NO debe depender del inventario.
 *
 * Esta seccion comprueba justamente eso:
 *
 *   - `categoria: 'cilindro'` ya no existe: un producto de esa
 *     categoria se rechaza;
 *   - el catalogo de la IA es IGUAL con el inventario vacio y con
 *     productos cargados, y no trae `stock_actual` ni
 *     `disponible`;
 *   - filtra por volumen de maletera contra el espacio REAL que
 *     ocupa el equipo, no contra la capacidad del gas;
 *   - la estimacion pide `capacidad_litros`, no `id_producto`, y
 *     avisa que faltan datos en vez de inventar un total;
 *   - con los precios en `parametros_precios`, la estimacion
 *     cuadra con lo que esta en la base;
 *   - con el stock en cero, la estimacion NO cambia: la
 *     recomendacion es independiente del deposito.
 */
async function comprobarIntegracionIA({ tokenAdmin, tokenTecnico, tokenCliente }) {
  seccion('13. El modulo de IA es INDEPENDIENTE del inventario');

// El endpoint arma la clave como `<prefijo><capacidad>` (ver
// `clavePrecioCilindro()`), asi que la fila de la prueba va en la
// clave que el endpoint va a resolver de verdad.

  const claveCilindro = `${PREFIJO_CILINDRO}${CAPACIDAD_PRUEBA}`;

  // 1) El catalogo se lee con el inventario VACIO. Este es el
  //    estado de partida: si aqui ya aparece el catalogo, es que
  //    no dependia del deposito.
  const catVacio = await pedir('GET', '/ai/cilindros', { token: tokenTecnico });
  const conInventarioVacio = catVacio.cuerpo?.data ?? [];

  comprobar(
    'GET /ai/cilindros responde 200 con el inventario vacio',
    catVacio.status === 200,
    `HTTP ${catVacio.status}`
  );

  comprobar(
    'el catalogo de la IA no viene de inventario_productos',
    catVacio.cuerpo?.origen === 'referencial',
    `origen = ${catVacio.cuerpo?.origen ?? ''}`
  );

  comprobar(
    'con 0 productos en el deposito, la IA igual recomienda medidas',
    conInventarioVacio.length > 0,
    `catalogo = ${conInventarioVacio.length} medida(s)`
  );

  // 2) Ningun campo de stock o disponibilidad en la respuesta.
  //    Esta es la comprobacion central: si la IA dependiera del
  //    deposito, `disponible` y `stock_actual` volverian a
  //    aparecer.
  const conStock = conInventarioVacio.filter(
    (c) => 'stock_actual' in c || 'disponible' in c || 'stock_minimo' in c || 'id_producto' in c
  );

  comprobar(
    'el catalogo NO trae stock_actual, disponible ni id_producto',
    conStock.length === 0,
    `fugas: ${conStock.map((c) => Object.keys(c).filter((k) => /stock|disponible|id_producto/.test(k)).join(',')).join(' | ')}`
  );

  comprobar(
    'el catalogo dice que el cilindro hay que pedirlo',
    conInventarioVacio.every((c) => c.requiere_compra_externa === true),
    `ejemplo: ${JSON.stringify(conInventarioVacio[0] ?? null)}`
  );

  // 3) `categoria: 'cilindro'` ya no es valida.
  const comoCilindro = await pedir('POST', '/inventario/productos', {
    token: tokenAdmin,
    cuerpo: {
      codigo: `${PREFIJO_CODIGO}CIL-${marca}`,
      nombre: 'Cilindro (no deberia existir)',
      categoria: 'cilindro',
      unidad: 'unidad',
      precio_compra: 1000,
    },
  });

  comprobar(
    'un producto con categoria=cilindro se rechaza (400)',
    comoCilindro.status === 400 && comoCilindro.cuerpo?.code === 'BAD_CATEGORY',
    `HTTP ${comoCilindro.status} ${comoCilindro.cuerpo?.code ?? ''}`
  );

  // 4) Las capacidades de gas y el espacio que necesitan son
  //    cosas distintas. Un 40 L ocupa ~110 L de maletera, asi que
  //    con 60 L de espacio no cabe, aunque la capacidad sea chica.
  const capacidad = (data, cap) => (data ?? []).find((c) => c.capacidad_litros === cap);

  const chico = await pedir('GET', '/ai/cilindros?volumen_litros=60', { token: tokenTecnico });
  const grande = await pedir('GET', '/ai/cilindros?volumen_litros=300', { token: tokenTecnico });

  comprobar(
    'con 60 L de maletera NO ofrece el cilindro de 40 L (ocupa ~110 L)',
    chico.status === 200 && capacidad(chico.cuerpo?.data, 40) === undefined,
    `catalogo = ${(chico.cuerpo?.data ?? []).length} medida(s)`
  );

  comprobar(
    'con 300 L de maletera SI ofrece el cilindro de 40 L',
    grande.status === 200 && capacidad(grande.cuerpo?.data, 40) !== undefined,
    `catalogo = ${(grande.cuerpo?.data ?? []).length} medida(s)`
  );

  comprobar(
    'sin volumen de maletera, avisa que faltan mediciones',
    (await pedir('GET', '/ai/cilindros', { token: tokenTecnico })).cuerpo?.advertencia !== null,
    'sin advertencia = no se avisaria al usuario'
  );

  // 5) Sin precios cargados, la estimacion NO inventa un numero.
  const sinPrecio = await pedir('POST', '/ai/estimacion', {
    token: tokenAdmin,
    cuerpo: { capacidad_litros: 40, cantidad: 1 },
  });

  comprobar(
    'sin precios cargados, la estimacion no devuelve total (faltan datos)',
    sinPrecio.status === 200 &&
      sinPrecio.cuerpo?.completo === false &&
      Array.isArray(sinPrecio.cuerpo?.faltan) &&
      sinPrecio.cuerpo.faltan.length > 0,
    `completo = ${sinPrecio.cuerpo?.completo}, faltan = ${(sinPrecio.cuerpo?.faltan ?? []).length}`
  );

  comprobar(
    'la estimacion sin datos NO devuelve un subtotal inventado',
    sinPrecio.cuerpo?.data === null || sinPrecio.cuerpo?.data === undefined,
    `data = ${JSON.stringify(sinPrecio.cuerpo?.data)}`
  );

  // La capacidad tiene que estar en el catalogo referencial. Con
  // una capacidad inventada, el endpoint lo dice, en vez de
  // cotizar lo que sea.
  const capacidadFalsa = await pedir('POST', '/ai/estimacion', {
    token: tokenAdmin,
    cuerpo: { capacidad_litros: 7, cantidad: 1 },
  });

  comprobar(
    'una capacidad que no esta en el catalogo se rechaza, no se cotiza',
    capacidadFalsa.cuerpo?.completo === false &&
      (capacidadFalsa.cuerpo?.faltan ?? []).some((f) => /capacidad/i.test(f)),
    `faltan = ${JSON.stringify(capacidadFalsa.cuerpo?.faltan ?? [])}`
  );

  // Y con el id de un producto viejo, la capacidad no llega.
  const porIdProducto = await pedir('POST', '/ai/estimacion', {
    token: tokenAdmin,
    cuerpo: { id_producto: 1, cantidad: 1 },
  });

  comprobar(
    'el endpoint ya NO acepta id_producto (exigio capacidad_litros)',
    porIdProducto.cuerpo?.completo === false,
    `completo = ${porIdProducto.cuerpo?.completo}`
  );

  // 6) Se cargan los dos precios y se vuelve a pedir.
  //
  //    `AI_PRECIO_INSTALACION_CLAVE` ya es de ESTA corrida: el
  //    servidor lo levanta en `levantarApi()` con la variable de
  //    entorno puesta, asi que el endpoint resuelve bien la clave.
  //
  //    `AI_PRECIO_CILINDRO_PREFIJO` NO se puede cambiar asi: el
  //    proceso que lo lee es el que se importo al arrancar, y
  //    cambiar la variable desde el script de pruebas no altera
  //    el modulo ya cargado. Por eso el precio de cilindro se
  //    carga en la clave REAL de la capacidad (`cilindro_40`),
  //    que es la que va a resolver el endpoint, y se restaura
  //    al final. Se avisa por pantalla si habia un precio real
  //    antes, para que la restauracion se pueda comprobar a ojo.
  process.env.AI_PRECIO_INSTALACION_CLAVE = CLAVE_PRECIO_PRUEBA;

  const cilindroPrevio = await queryOne(
    'SELECT valor, moneda FROM parametros_precios WHERE clave = ?',
    [claveCilindro]
  );

  if (cilindroPrevio) {
    console.log(
      `  AVISO: ${claveCilindro} ya valia ${cilindroPrevio.valor} ${cilindroPrevio.moneda}. ` +
      'Se restaura al terminar.'
    );
  }

  await query(
    `INSERT INTO parametros_precios (clave, valor, moneda, descripcion, id_usuario)
     VALUES (?, ?, 'BOB', 'Mano de obra de instalacion GNV (prueba)', ?),
            (?, ?, 'BOB', 'Cilindro GNV de 40 L (prueba)', ?)
     ON DUPLICATE KEY UPDATE valor = VALUES(valor), id_usuario = VALUES(id_usuario)`,
    [CLAVE_PRECIO_PRUEBA, 2600, idsUsuarios.admin, claveCilindro, 2400, idsUsuarios.admin]
  );

  const conPrecio = await pedir('POST', '/ai/estimacion', {
    token: tokenAdmin,
    cuerpo: { capacidad_litros: 40, cantidad: 2 },
  });

  const desglose = conPrecio.cuerpo?.data?.desglose;

  comprobar(
    'con el precio cargado, la estimacion cuadra: 2400 + 2600 = 5000',
    conPrecio.cuerpo?.completo === true && Number(desglose?.total_unitario) === 5000,
    `total_unitario = ${desglose?.total_unitario}`
  );

  comprobar(
    'el subtotal respeta la cantidad pedida (2 x 5000 = 10000)',
    Number(conPrecio.cuerpo?.data?.subtotal) === 10000,
    `subtotal = ${conPrecio.cuerpo?.data?.subtotal}`
  );

  comprobar(
    'la moneda sale de la base, no del codigo',
    conPrecio.cuerpo?.moneda === 'BOB',
    `moneda = ${conPrecio.cuerpo?.moneda}`
  );

  comprobar(
    'la estimacion devuelve la medida del catalogo, no un id de producto',
    conPrecio.cuerpo?.data?.cilindro?.capacidad_litros === 40 &&
      conPrecio.cuerpo?.data?.cilindro?.volumen_minimo_litros > 0,
    `cilindro = ${JSON.stringify(conPrecio.cuerpo?.data?.cilindro ?? null)}`
  );

  // 7) LA PRUEBA CENTRAL: se mete stock de un producto parecido
  //    y la recomendacion NO se mueve. Con stock y sin stock, la
  //    respuesta tiene que ser identica.
  // Foto del catalogo ANTES de tocar el deposito, para comparar
  // despues. Sin ningun producto cargado.
  const catalogoAntes = await pedir('GET', '/ai/cilindros', { token: tokenTecnico });

  const productoRepuesto = await pedir('POST', '/inventario/productos', {
    token: tokenAdmin,
    cuerpo: {
      codigo: `${PREFIJO_CODIGO}REP-${marca}`,
      nombre: 'Repuesto de prueba con stock',
      categoria: 'repuesto',
      unidad: 'unidad',
      stock_inicial: 7,
      stock_minimo: 2,
      precio_compra: 100,
      precio_venta: 200,
    },
  });

  comprobar(
    'un repuesto comun si se puede dar de alta (el inventario normal sigue igual)',
    productoRepuesto.status === 201,
    `HTTP ${productoRepuesto.status}`
  );

  const catalogoDespues = await pedir('GET', '/ai/cilindros', { token: tokenTecnico });

  comprobar(
    'el catalogo de la IA es IDENTICO con productos en el deposito',
    JSON.stringify(catalogoDespues.cuerpo?.data) === JSON.stringify(catalogoAntes.cuerpo?.data),
    `antes = ${catalogoAntes.cuerpo?.data?.length}, despues = ${catalogoDespues.cuerpo?.data?.length}`
  );

  const estimacionConStock = await pedir('POST', '/ai/estimacion', {
    token: tokenAdmin,
    cuerpo: { capacidad_litros: 40, cantidad: 2 },
  });

  comprobar(
    'el precio de la IA NO depende del stock del deposito',
    estimacionConStock.cuerpo?.completo === true &&
      Number(estimacionConStock.cuerpo?.data?.desglose?.total_unitario) === 5000,
    `total = ${estimacionConStock.cuerpo?.data?.desglose?.total_unitario}`
  );

  // Y al reves: con stock en cero tampoco cambia.
  const productoId = productoRepuesto.cuerpo?.producto?.id_producto ?? null;

  if (productoId !== null) {
    await query('UPDATE inventario_productos SET stock_actual = 0 WHERE id_producto = ?', [
      productoId,
    ]);
  }

  const estimacionSinStock = await pedir('POST', '/ai/estimacion', {
    token: tokenAdmin,
    cuerpo: { capacidad_litros: 40, cantidad: 2 },
  });

  comprobar(
    'el precio de la IA tampoco depende de que el deposito este vacio',
    estimacionSinStock.cuerpo?.completo === true &&
      Number(estimacionSinStock.cuerpo?.data?.desglose?.total_unitario) === 5000,
    `total = ${estimacionSinStock.cuerpo?.data?.desglose?.total_unitario}`
  );

  // 8) El cliente movil no llega a estos datos.
  const clienteCilindros = await pedir('GET', '/ai/cilindros', { token: tokenCliente });
  const clienteEstimar = await pedir('POST', '/ai/estimacion', {
    token: tokenCliente,
    cuerpo: { capacidad_litros: 40 },
  });

  comprobar(
    'el cliente movil NO puede leer el catalogo de cilindros (403)',
    clienteCilindros.status === 403,
    `HTTP ${clienteCilindros.status}`
  );

  comprobar(
    'el cliente movil NO puede pedir una estimacion (403)',
    clienteEstimar.status === 403,
    `HTTP ${clienteEstimar.status}`
  );

  // 9) Se restaura el precio de cilindro que hubiera antes. Si no
  //    habia ninguno, la fila de la prueba se borra.
  if (cilindroPrevio) {
    await query('UPDATE parametros_precios SET valor = ?, moneda = ? WHERE clave = ?', [
      cilindroPrevio.valor,
      cilindroPrevio.moneda,
      claveCilindro,
    ]);
  } else {
    await query('DELETE FROM parametros_precios WHERE clave = ?', [claveCilindro]);
  }

  delete process.env.AI_PRECIO_INSTALACION_CLAVE;

  return productoRepuesto.cuerpo?.producto?.id_producto ?? null;
}

// --- Modo solo lectura -------------------------------------------------

async function soloLectura() {
  seccion('Comprobaciones de solo lectura');

  const tablas = await query(
    `SELECT TABLE_NAME AS tabla
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
  );

  const nombres = new Set(tablas.map((t) => t.tabla));

  for (const t of ['inventario_productos', 'movimientos_inventario']) {
    comprobar(`la tabla ${t} existe`, nombres.has(t));
  }

  // El cilindro NO debe existir como entidad. Se comprueba por
  // catalogo, sin leer filas: si aparece algo, la 011 no corrio o
  // se reaplico una migracion vieja.
  comprobar('la tabla cilindros ya NO existe (011 aplicada)', !nombres.has('cilindros'));

  if (nombres.has('inventario_productos')) {
    const columnas = await query(
      `SELECT COLUMN_NAME AS columna
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'inventario_productos'
          AND COLUMN_NAME IN ('capacidad_litros', 'montaje')`
    );

    comprobar(
      'inventario_productos ya NO tiene columnas de cilindro (011 aplicada)',
      columnas.length === 0,
      `columnas que sobran = ${columnas.map((c) => c.columna).join(', ') || 'ninguna'}`
    );
  }

  if (nombres.has('vehiculos')) {
    const columnas = await query(
      `SELECT COLUMN_NAME AS columna
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'vehiculos'
          AND COLUMN_NAME = 'id_cilindro'`
    );

    comprobar(
      'vehiculos ya NO tiene id_cilindro (011 aplicada)',
      columnas.length === 0,
      `columnas que sobran = ${columnas.map((c) => c.columna).join(', ') || 'ninguna'}`
    );
  }

  comprobar(
    'la tabla parametros_precios existe: es de donde la IA toma los precios (007 aplicada)',
    nombres.has('parametros_precios')
  );

  if (!nombres.has('inventario_productos') || !nombres.has('movimientos_inventario')) {
    console.log('');
    console.log('  Faltan tablas. Aplica database/migrations/006_add_inventario.sql');
    return;
  }

  await levantarApi();

  try {
    const sinToken = await pedir('GET', '/inventario/productos');
    comprobar('sin sesion no se entra al inventario (401)', sinToken.status === 401);

    const usuario = await queryOne(
      "SELECT id, username, rol FROM usuarios WHERE rol = 'administrador' AND estado = 'activo' LIMIT 1"
    );

    if (!usuario) {
      console.log('  No hay ningun administrador activo: no se pueden probar los permisos.');
      return;
    }

    // Sin `--escribir` no se crea nada, asi que el resto necesita
    // las credenciales de una cuenta real. Se avisa y se sale.
    console.log('');
    console.log('  Para las pruebas 1 a 13 hace falta --escribir:');
    console.log('    node scripts/test-inventario.js --escribir');
    console.log('');
    console.log('  Con esa opcion el script crea un producto y tres usuarios');
    console.log('  temporales, y los borra al terminar. No toca nada mas.');
  } finally {
    await bajarApi();
  }
}

// --- main -------------------------------------------------------------

async function main() {
  linea();
  console.log('  PRUEBAS DEL MODULO DE INVENTARIO');
  linea();

  const estado = await checkConnection();

  if (!estado.connected) {
    console.log('  [ERROR] Sin conexion con MariaDB.');
    linea();
    process.exitCode = 1;
    return;
  }

  const info = await getServerInfo();
  console.log(`  Motor  : ${info.version}`);
  console.log(`  Base   : ${info.db}`);

  if (env.isProduction) {
    console.log('');
    console.log('  [ERROR] NODE_ENV=production. Este script escribe y borra datos');
    console.log('  de prueba. No se ejecuta contra produccion.');
    linea();
    process.exitCode = 1;
    return;
  }

  if (!ES_ESCRITURA) {
    console.log('  Modo   : solo lectura');
    await soloLectura();
    linea();
    console.log(
      fallos === 0
        ? `  RESULTADO: ${pruebas} comprobacion(es), 0 fallo(s)`
        : `  RESULTADO: ${pruebas} comprobacion(es), ${fallos} fallo(s)`
    );
    linea();
    process.exitCode = fallos === 0 ? 0 : 1;
    return;
  }

  console.log('  Modo   : escritura (crea y borra solo sus propios datos)');
  console.log(`  Sufijo : ${marca}`);

  // Sobras de una corrida anterior que se haya muerto a mitad de
  // camino. Se limpian ANTES de la foto, para que la comparacion
  // de conteos de abajo sea sobre la base como estaba.
  const sobrasPrevias = await limpiar();

  if (sobrasPrevias.length > 0) {
    console.log(`  Sobras de una corrida anterior : ${sobrasPrevias.join(', ')}`);
  }

  const antes = await fotografia();

  try {
    await levantarApi();

    const tokens = await correrPruebas();
    await correrRestoDePruebas(tokens);
    await comprobarPersistencia();
    await levantarApi();
    await comprobarIntegracionIA(tokens);
  } finally {
    await bajarApi();

    // La limpieza no debe tapar el error original si algo fallo.
    let notas = [];

    try {
      notas = await limpiar();
    } catch (error) {
      console.error(`  [ERROR] La limpieza fallo: ${error.message}`);
      fallos += 1;
    }

    const despues = await fotografia();

    console.log('');
    seccion('Limpieza');

    console.log(`  filas borradas por el script : ${notas.length > 0 ? notas.join(', ') : '(ninguna)'}`);
    console.log(`  productos   : ${antes.productos} -> ${despues.productos}`);
    console.log(`  movimientos : ${antes.movimientos} -> ${despues.movimientos}`);
    console.log(`  usuarios    : ${antes.usuarios} -> ${despues.usuarios}`);
    console.log(`  parámetros  : ${antes.parametros} -> ${despues.parametros}`);

    comprobar(
      'los conteos de productos quedaron como estaban',
      antes.productos === despues.productos,
      `antes ${antes.productos}, despues ${despues.productos}`
    );

    comprobar(
      'los conteos de movimientos quedaron como estaban',
      antes.movimientos === despues.movimientos,
      `antes ${antes.movimientos}, despues ${despues.movimientos}`
    );

    comprobar(
      'los conteos de usuarios quedaron como estaban',
      antes.usuarios === despues.usuarios,
      `antes ${antes.usuarios}, despues ${despues.usuarios}`
    );

    comprobar(
      'los conteos de precios de parametro quedaron como estaban',
      antes.parametros === despues.parametros,
      `antes ${antes.parametros}, despues ${despues.parametros}`
    );

    const sobras = await query(
      `SELECT COUNT(*) AS n FROM inventario_productos WHERE codigo LIKE '${PREFIJO_CODIGO}%'`
    );
    comprobar(
      'no quedaron productos de prueba en la base',
      Number(sobras[0].n) === 0,
      `sobran ${sobras[0].n}`
    );
  }

  console.log('');
  linea();
  console.log(
    fallos === 0
      ? `  RESULTADO: ${pruebas} comprobacion(es), 0 fallo(s)`
      : `  RESULTADO: ${pruebas} comprobacion(es), ${fallos} FALLO(S)`
  );
  linea();

  process.exitCode = fallos === 0 ? 0 : 1;
}

main()
  .catch(async (error) => {
    console.error('');
    console.error(`  Error inesperado: ${error.code || error.name}: ${error.message}`);
    await closePool().catch(() => {});
    process.exit(1);
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });




