// ============================================================
//  src/modules/inventario/inventario.service.js
//  Modulo de INVENTARIO del taller.
//
//  Tablas:
//    - `inventario_productos`   catalogo unico. Productos,
//      accesorios, repuestos, insumos y kits de conversion viven
//      aqui; lo que cambia entre uno y otro es la columna
//      `categoria`.
//      NO hay categoria `cilindro`: los cilindros no se
//      inventarian, la IA los recomienda por medida.
//    - `movimientos_inventario` historial. Una fila por cada
//      cambio de stock, con el antes, el despues, el motivo y el
//      usuario responsable.
//
//  REGLA CENTRAL
//  ------------
//  `stock_actual` no se escribe desde ningun otro sitio que no
//  sea `crearProducto` (carga inicial) y `registrarMovimiento`.
//  En los dos casos el UPDATE del stock y el INSERT del
//  movimiento van en la misma transaccion: o se guardan los dos,
//  o no se guarda ninguno.
//
//  El stock nunca queda negativo. Se comprueba en la validacion
//  del cuerpo, y MariaDB lo vuelve a comprobar con los CHECK de
//  la tabla. Un -2 seria un bug, no una regla del negocio.
//
//  ROLES
//  -----
//  Aqui no se decide permisos: lo decide el middleware de la
//  ruta. Este archivo solo usa el `id_usuario` que le llega ya
//  validado.
// ============================================================
import { query, queryOne, transaction } from '../../config/database.js';
import ApiError from '../../utils/ApiError.js';

export const TIPOS_MOVIMIENTO = ['ENTRADA', 'SALIDA', 'AJUSTE'];

export const CATEGORIAS = [
  'producto',
  'accesorio',
  'repuesto',
  'insumo',
  'kit',
  'otro',
];

const CAMPOS_PRODUCTO = `
  p.id_producto,
  p.codigo,
  p.nombre,
  p.descripcion,
  p.categoria,
  p.unidad,
  p.stock_actual,
  p.stock_minimo,
  p.precio_compra,
  p.precio_venta,
  p.estado,
  DATE_FORMAT(p.fecha_creacion,     '%Y-%m-%d %H:%i:%s') AS fecha_creacion,
  DATE_FORMAT(p.fecha_actualizacion, '%Y-%m-%d %H:%i:%s') AS fecha_actualizacion
`;

const CAMPOS_MOVIMIENTO = `
  m.id_movimiento,
  m.id_producto,
  m.tipo,
  m.cantidad,
  m.stock_anterior,
  m.stock_nuevo,
  m.motivo,
  m.referencia,
  m.id_usuario,
  u.username AS usuario,
  p.codigo    AS producto_codigo,
  p.nombre    AS producto_nombre,
  p.unidad    AS producto_unidad,
  DATE_FORMAT(m.fecha, '%Y-%m-%d %H:%i:%s') AS fecha
`;

// --- Validacion -------------------------------------------------------

/** Entero. Acepta "5" y 5; rechaza "5.5" y "abc". */
function entero(value, nombre) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw ApiError.badRequest(`Falta el campo ${nombre}.`, 'MISSING_FIELDS');
  }

  const n = Number(value);

  if (!Number.isInteger(n)) {
    throw ApiError.badRequest(`${nombre} debe ser un numero entero.`, 'NOT_AN_INTEGER');
  }

  return n;
}

function decimal(value, nombre) {
  if (value === undefined || value === null || String(value).trim() === '') return null;

  const n = Number(value);

  if (!Number.isFinite(n) || n < 0) {
    throw ApiError.badRequest(`${nombre} debe ser un numero mayor o igual a 0.`, 'BAD_PRICE');
  }

  // MariaDB DECIMAL(12,2): nada de centimos inventados.
  return Number(n.toFixed(2));
}

function texto(value, { nombre, requerido = true, max = 255 } = {}) {
  const limpio = String(value ?? '').trim();

  if (requerido && limpio === '') {
    throw ApiError.badRequest(`Falta el campo ${nombre}.`, 'MISSING_FIELDS');
  }

  if (limpio.length > max) {
    throw ApiError.badRequest(`${nombre} no puede pasar de ${max} caracteres.`, 'TOO_LONG');
  }

  return limpio === '' ? null : limpio;
}

/** Codigo del taller: sin espacios, en mayusculas, sin simbolos raros. */
export function normalizarCodigo(codigo) {
  return String(codigo ?? '').replace(/[^A-Za-z0-9._-]/g, '').toUpperCase();
}

/**
 * Normaliza el tipo de movimiento.
 * Acepta "entrada", "Entrada" o " ENTRADA " y devuelve siempre la
 * forma canonica del enum, para que el historial no termine con
 * tres escrituras distintas de lo mismo.
 */
export function normalizarTipo(tipo) {
  const limpio = String(tipo ?? '').trim().toUpperCase();

  if (!TIPOS_MOVIMIENTO.includes(limpio)) {
    throw ApiError.badRequest(
      `Tipo de movimiento invalido. Use: ${TIPOS_MOVIMIENTO.join(', ')}.`,
      'BAD_MOVEMENT_TYPE'
    );
  }

  return limpio;
}

/** Valida y normaliza el cuerpo de alta o edicion de un producto. */
export function validarProductoBody(body = {}) {
  const codigo = normalizarCodigo(body.codigo);

  if (codigo.length < 2 || codigo.length > 50) {
    throw ApiError.badRequest(
      'El codigo debe tener entre 2 y 50 caracteres (letras, numeros, punto, guion o guion bajo).',
      'BAD_CODE'
    );
  }

  const nombre = texto(body.nombre, { nombre: 'nombre', max: 150 });

  const descripcion = texto(body.descripcion, {
    nombre: 'descripcion',
    requerido: false,
    max: 2000,
  });

  const categoria = String(body.categoria ?? 'producto').trim().toLowerCase();

  if (!CATEGORIAS.includes(categoria)) {
    throw ApiError.badRequest(
      `Categoria invalida. Use: ${CATEGORIAS.join(', ')}.`,
      'BAD_CATEGORY'
    );
  }

  const unidad = texto(body.unidad ?? 'unidad', { nombre: 'unidad', max: 20 });

  const stockMinimo = entero(body.stock_minimo ?? 0, 'stock_minimo');

  if (stockMinimo < 0) {
    throw ApiError.badRequest('stock_minimo no puede ser negativo.', 'BAD_STOCK_MINIMO');
  }

  const estado = String(body.estado ?? 'activo').trim().toLowerCase();

  if (!['activo', 'inactivo'].includes(estado)) {
    throw ApiError.badRequest('estado invalido. Use: activo o inactivo.', 'BAD_STATE');
  }

  //   No hay datos de cilindro (capacidad, montaje). El cilindro no
  //   se inventaria: la IA lo recomienda por medida con un catalogo
  //   referencial, y su precio vive en `parametros_precios`. Ver
  //   `CILINDROS_REFERENCIA` en src/ai/vehicleRecognition.

  const precioCompra = decimal(body.precio_compra, 'precio_compra') ?? 0;
  const precioVenta = decimal(body.precio_venta, 'precio_venta');

  if (precioVenta !== null && precioVenta < precioCompra) {
    throw ApiError.conflict(
      'El precio de venta no puede ser menor que el de compra.',
      'BAD_PRICING'
    );
  }

  // Solo tiene efecto al crear. Al editar el stock no se toca:
  // ver `actualizarProducto`.
  const stockInicial = entero(body.stock_inicial ?? 0, 'stock_inicial');

  if (stockInicial < 0) {
    throw ApiError.badRequest('El stock inicial no puede ser negativo.', 'STOCK_NEGATIVO');
  }

  return {
    codigo,
    nombre,
    descripcion,
    categoria,
    unidad,
    stockMinimo,
    precioCompra,
    precioVenta,
    estado,
    stockInicial,
  };
}

/**
 * Valida el cuerpo de un movimiento.
 *
 * ENTRADA y SALIDA piden `cantidad` mayor a 0.
 * AJUSTE pide `stock_nuevo` (>= 0) y no lleva cantidad: el
 *   servicio calcula cuanto cambio para que la cuenta del
 *   historial quede exacta.
 *
 * `motivo` es obligatorio en los tres casos. Un movimiento sin
 * motivo no es auditable.
 */
export function validarMovimientoBody(body = {}) {
  const tipo = normalizarTipo(body.tipo);
  const motivo = texto(body.motivo, { nombre: 'motivo', max: 255 });
  const referencia = texto(body.referencia, {
    nombre: 'referencia',
    requerido: false,
    max: 100,
  });

  if (tipo === 'AJUSTE') {
    const stockNuevo = entero(body.stock_nuevo, 'stock_nuevo');

    if (stockNuevo < 0) {
      throw ApiError.badRequest(
        'El stock no puede quedar negativo. Revisa el ajuste.',
        'STOCK_NEGATIVO'
      );
    }

    return { tipo, cantidad: null, stockNuevo, motivo, referencia };
  }

  const cantidad = entero(body.cantidad, 'cantidad');

  if (cantidad <= 0) {
    throw ApiError.badRequest('La cantidad debe ser mayor a 0.', 'BAD_QUANTITY');
  }

  return { tipo, cantidad, stockNuevo: null, motivo, referencia };
}

// --- Productos --------------------------------------------------------

/**
 * Lista el catalogo.
 * Los filtros llegan ya validados desde el controlador.
 */
export async function listarProductos({
  estado = null,
  categoria = null,
  busqueda = null,
  soloStockBajo = false,
} = {}) {
  const where = [];
  const params = [];

  if (estado) {
    where.push('p.estado = ?');
    params.push(estado);
  }

  if (categoria) {
    where.push('p.categoria = ?');
    params.push(categoria);
  }

  if (busqueda) {
    where.push('(p.codigo LIKE ? OR p.nombre LIKE ? OR p.descripcion LIKE ?)');
    const patron = `%${busqueda}%`;
    params.push(patron, patron, patron);
  }

  if (soloStockBajo) {
    where.push("p.estado = 'activo' AND p.stock_actual <= p.stock_minimo");
  }

  return query(
    `SELECT ${CAMPOS_PRODUCTO}
       FROM inventario_productos p
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.nombre, p.codigo`,
    params
  );
}

export async function obtenerProducto(id) {
  return queryOne(
    `SELECT ${CAMPOS_PRODUCTO}
       FROM inventario_productos p
      WHERE p.id_producto = ?
      LIMIT 1`,
    [id]
  );
}

/**
 * Crea un producto.
 *
 * El stock inicial, si viene, NO se escribe directo: se registra
 * como un movimiento ENTRADA en la misma transaccion. Asi el
 * historial esta completo desde el primer dia y no queda ninguna
 * cantidad que nadie pueda explicar.
 */
export async function crearProducto(datos, { id_usuario }) {
  return transaction(async (conn) => {
    const [dup] = await conn.execute(
      'SELECT id_producto FROM inventario_productos WHERE codigo = ? LIMIT 1',
      [datos.codigo]
    );

    if (dup.length > 0) {
      throw ApiError.conflict(
        `El codigo ${datos.codigo} ya existe en el inventario.`,
        'DUPLICATE_CODIGO'
      );
    }

    const [resultado] = await conn.execute(
      `INSERT INTO inventario_productos
         (codigo, nombre, descripcion, categoria, unidad, stock_actual,
          stock_minimo, precio_compra, precio_venta, estado)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [
        datos.codigo,
        datos.nombre,
        datos.descripcion,
        datos.categoria,
        datos.unidad,
        datos.stockMinimo,
        datos.precioCompra,
        datos.precioVenta,
        datos.estado,
      ]
    );

    const idProducto = resultado.insertId;

    if (datos.stockInicial > 0) {
      await conn.execute(
        `INSERT INTO movimientos_inventario
           (id_producto, tipo, cantidad, stock_anterior, stock_nuevo,
            motivo, referencia, id_usuario)
         VALUES (?, 'ENTRADA', ?, 0, ?, ?, ?, ?)`,
        [
          idProducto,
          datos.stockInicial,
          datos.stockInicial,
          'Carga inicial de inventario.',
          null,
          id_usuario,
        ]
      );

      await conn.execute(
        'UPDATE inventario_productos SET stock_actual = ? WHERE id_producto = ?',
        [datos.stockInicial, idProducto]
      );
    }

    return idProducto;
  });
}

/**
 * Edita un producto.
 *
 * `stock_actual` NO se toca aqui, a proposito. Editar el stock
 * desde el formulario de edicion es la forma mas facil de romper
 * la trazabilidad: el stock solo cambia por `registrarMovimiento`.
 */
export async function actualizarProducto(id, datos) {
  return transaction(async (conn) => {
    const [rows] = await conn.execute(
      'SELECT id_producto FROM inventario_productos WHERE id_producto = ? LIMIT 1',
      [id]
    );

    if (rows.length === 0) {
      throw ApiError.notFound('Producto no encontrado.', 'PRODUCTO_NOT_FOUND');
    }

    const [dup] = await conn.execute(
      'SELECT id_producto FROM inventario_productos WHERE codigo = ? AND id_producto <> ? LIMIT 1',
      [datos.codigo, id]
    );

    if (dup.length > 0) {
      throw ApiError.conflict(
        `El codigo ${datos.codigo} ya existe en el inventario.`,
        'DUPLICATE_CODIGO'
      );
    }

    await conn.execute(
      `UPDATE inventario_productos
          SET codigo = ?, nombre = ?, descripcion = ?, categoria = ?,
              unidad = ?, stock_minimo = ?, precio_compra = ?,
              precio_venta = ?, estado = ?
        WHERE id_producto = ?`,
      [
        datos.codigo,
        datos.nombre,
        datos.descripcion,
        datos.categoria,
        datos.unidad,
        datos.stockMinimo,
        datos.precioCompra,
        datos.precioVenta,
        datos.estado,
        id,
      ]
    );
  });
}

// --- Movimientos ------------------------------------------------------

/**
 * Registra un movimiento y actualiza el stock.
 *
 * Todo dentro de una transaccion y con la fila del producto
 * bloqueada (`FOR UPDATE`). Sin ese bloqueo, dos salidas
 * simultaneas podrian leer el mismo stock y las dos pasar.
 *
 * @param {object} datos    Ya validados con `validarMovimientoBody`,
 *                          mas `id_producto`.
 * @param {object} usuario  { id_usuario } de quien lo realizo.
 */
export async function registrarMovimiento(datos, { id_usuario }) {
  return transaction(async (conn) => {
    const [filas] = await conn.execute(
      `SELECT id_producto, codigo, nombre, unidad, stock_actual, estado
         FROM inventario_productos
        WHERE id_producto = ?
        FOR UPDATE`,
      [datos.idProducto]
    );

    const producto = filas[0];

    if (!producto) {
      throw ApiError.notFound('Producto no encontrado.', 'PRODUCTO_NOT_FOUND');
    }

    if (producto.estado !== 'activo') {
      throw ApiError.conflict(
        `El producto ${producto.codigo} esta inactivo. Reactivalo antes de mover stock.`,
        'PRODUCTO_INACTIVO'
      );
    }

    const stockAnterior = Number(producto.stock_actual);

    let cantidad;
    let stockNuevo;

    if (datos.tipo === 'ENTRADA') {
      cantidad = datos.cantidad;
      stockNuevo = stockAnterior + cantidad;
    } else if (datos.tipo === 'SALIDA') {
      cantidad = datos.cantidad;
      stockNuevo = stockAnterior - cantidad;

      if (stockNuevo < 0) {
        // El caso que no debe pasar: stock 2, salida de 4.
        throw ApiError.conflict(
          `Stock insuficiente. Hay ${stockAnterior} ${producto.unidad} de ` +
            `${producto.codigo} y se intentan retirar ${cantidad}.`,
          'STOCK_INSUFICIENTE'
        );
      }
    } else {
      // AJUSTE: se fija el stock real contado. La cantidad es la
      // diferencia, para que el historial se lea sin calculos.
      stockNuevo = datos.stockNuevo;
      cantidad = Math.abs(stockNuevo - stockAnterior);

      if (stockNuevo < 0) {
        throw ApiError.badRequest(
          'El stock no puede quedar negativo. Revisa el ajuste.',
          'STOCK_NEGATIVO'
        );
      }

      if (cantidad === 0) {
        throw ApiError.badRequest(
          'El ajuste no modifica el stock. Revisa la cantidad contada.',
          'AJUSTE_SIN_CAMBIO'
        );
      }
    }

    await conn.execute(
      'UPDATE inventario_productos SET stock_actual = ? WHERE id_producto = ?',
      [stockNuevo, datos.idProducto]
    );

    const [movimiento] = await conn.execute(
      `INSERT INTO movimientos_inventario
         (id_producto, tipo, cantidad, stock_anterior, stock_nuevo,
          motivo, referencia, id_usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        datos.idProducto,
        datos.tipo,
        cantidad,
        stockAnterior,
        stockNuevo,
        datos.motivo,
        datos.referencia,
        id_usuario,
      ]
    );

    return {
      idMovimiento: movimiento.insertId,
      idProducto: datos.idProducto,
      producto: producto.nombre,
      productoCodigo: producto.codigo,
      tipo: datos.tipo,
      cantidad,
      stockAnterior,
      stockNuevo,
    };
  });
}

/**
 * Historial de movimientos, del mas nuevo al mas viejo.
 * Trae el nombre del producto y el del usuario responsable, que
 * es lo que se muestra en la pantalla de historial.
 *
 * `limite` y `offset` se interpolan, no se parametrizan: MariaDB
 * exige un entero literal en LIMIT dentro de un prepared
 * statement. El controlador los acota a enteros antes de llegar
 * aqui, asi que no entra entrada del usuario en la cadena.
 */
export async function listarMovimientos({
  idProducto = null,
  tipo = null,
  desde = null,
  hasta = null,
  limite = 50,
  offset = 0,
} = {}) {
  const where = [];
  const params = [];

  if (idProducto) {
    where.push('m.id_producto = ?');
    params.push(idProducto);
  }

  if (tipo) {
    where.push('m.tipo = ?');
    params.push(normalizarTipo(tipo));
  }

  if (desde) {
    where.push('m.fecha >= ?');
    params.push(desde);
  }

  if (hasta) {
    // Un dia entero, para no perder los movimientos de la tarde
    // cuando se consulta por fecha.
    where.push('m.fecha < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(hasta);
  }

  const filas = await query(
    `SELECT ${CAMPOS_MOVIMIENTO}
       FROM movimientos_inventario m
       JOIN inventario_productos p ON p.id_producto = m.id_producto
       JOIN usuarios u ON u.id = m.id_usuario
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY m.fecha DESC, m.id_movimiento DESC
      LIMIT ${limite} OFFSET ${offset}`,
    params
  );

  const [{ total }] = await query(
    `SELECT COUNT(*) AS total
       FROM movimientos_inventario m
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}`,
    params
  );

  return { movimientos: filas, total };
}

export async function obtenerMovimiento(id) {
  return queryOne(
    `SELECT ${CAMPOS_MOVIMIENTO}
       FROM movimientos_inventario m
       JOIN inventario_productos p ON p.id_producto = m.id_producto
       JOIN usuarios u ON u.id = m.id_usuario
      WHERE m.id_movimiento = ?
      LIMIT 1`,
    [id]
  );
}

// --- Alertas y resumen ------------------------------------------------

/** Productos activos en o por debajo del stock minimo. */
export async function listarAlertasStock() {
  return query(
    `SELECT id_producto, codigo, nombre, categoria, unidad,
            stock_actual, stock_minimo, alerta, diferencia
       FROM v_inventario_stock_bajo
      ORDER BY stock_actual ASC, nombre ASC`
  );
}

/**
 * Cifras de cabecera para la pantalla de inventario: cuantos
 * productos hay, cuanto stock, y cuantas alertas de stock minimo.
 * Solo lectura.
 */
export async function resumenInventario() {
  const [totales] = await query(
    `SELECT
       (SELECT COUNT(*) FROM inventario_productos WHERE estado = 'activo')
         AS productos_activos,
       (SELECT COUNT(*) FROM inventario_productos WHERE estado = 'inactivo')
         AS productos_inactivos,
       (SELECT COALESCE(SUM(stock_actual), 0) FROM inventario_productos
         WHERE estado = 'activo')
         AS unidades_stock,
       (SELECT COUNT(*) FROM v_inventario_stock_bajo)
         AS alertas,
       (SELECT COUNT(*) FROM v_inventario_stock_bajo WHERE alerta = 'sin_stock')
         AS sin_stock,
       (SELECT COUNT(*) FROM movimientos_inventario)
         AS movimientos`
  );

  const porCategoria = await query(
    `SELECT categoria,
            COUNT(*) AS productos,
            COALESCE(SUM(stock_actual), 0) AS unidades
       FROM inventario_productos
      WHERE estado = 'activo'
      GROUP BY categoria
      ORDER BY categoria`
  );

  return { ...totales, por_categoria: porCategoria };
}

// --- Datos que consume el modulo de IA --------------------------------

/**
 * Un valor de `parametros_precios`.
 *
 * Es lo UNICO que el modulo de IA lee de este servicio.
 *
 * No se ofrece aqui ninguna lista de cilindros: el catalogo
 * referencial de la IA son medidas fisicas, no productos del
 * deposito, asi que vive en `vehicleRecognition.service.js` y no
 * depende de `inventario_productos`, del `stock_actual` ni de
 * la disponibilidad.
 *
 * Devuelve `null` si la clave no existe todavia. Quien llama
 * tiene que avisar que falta el dato: preferible un "no hay
 * precio cargado" a un 0 silencioso que el cliente lea como
 * "es gratis".
 */
export async function obtenerPrecioParametro(clave) {
  return queryOne(
    `SELECT clave, valor, moneda, descripcion,
            DATE_FORMAT(fecha_actualizacion, '%Y-%m-%d %H:%i:%s') AS fecha_actualizacion
       FROM parametros_precios
      WHERE clave = ?
      LIMIT 1`,
    [clave]
  );
}

/** Todos los parametros de precio. Los usa el panel de ajustes. */
export async function listarPreciosParametro() {
  return query(
    `SELECT clave, valor, moneda, descripcion,
            DATE_FORMAT(fecha_actualizacion, '%Y-%m-%d %H:%i:%s') AS fecha_actualizacion
       FROM parametros_precios
      ORDER BY clave`
  );
}
