// ============================================================
//  src/modules/inventario/inventario.controller.js
//
//  El controlador solo traduce HTTP <-> servicio: acota los
//  filtros, valida el cuerpo y devuelve JSON. Las reglas de
//  stock y los permisos viven en el servicio y en el middleware
//  de las rutas, respectivamente.
// ============================================================
import {
  CATEGORIAS,
  TIPOS_MOVIMIENTO,
  listarProductos,
  obtenerProducto,
  crearProducto,
  actualizarProducto,
  registrarMovimiento,
  listarMovimientos,
  obtenerMovimiento,
  listarAlertasStock,
  resumenInventario,
  validarProductoBody,
  validarMovimientoBody,
  normalizarTipo,
} from './inventario.service.js';
import ApiError from '../../utils/ApiError.js';

/** Entero acotado, para LIMIT/OFFSET y para los ids de la ruta. */
function enteroAcotado(valor, { porDefecto, min, max, nombre }) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    return porDefecto;
  }

  const n = Number(valor);

  if (!Number.isInteger(n) || n < min || n > max) {
    throw ApiError.badRequest(
      `${nombre} debe ser un entero entre ${min} y ${max}.`,
      'BAD_PARAMETER'
    );
  }

  return n;
}

/** Filtro de estado: solo 'activo' o 'inactivo', o nada. */
function filtroEstado(valor) {
  if (valor === undefined || String(valor).trim() === '') return null;

  const limpio = String(valor).trim().toLowerCase();

  if (!['activo', 'inactivo'].includes(limpio)) {
    throw ApiError.badRequest('estado invalido. Use: activo o inactivo.', 'BAD_STATE');
  }

  return limpio;
}

function filtroCategoria(valor) {
  if (valor === undefined || String(valor).trim() === '') return null;

  const limpio = String(valor).trim().toLowerCase();

  if (!CATEGORIAS.includes(limpio)) {
    throw ApiError.badRequest(
      `Categoria invalida. Use: ${CATEGORIAS.join(', ')}.`,
      'BAD_CATEGORY'
    );
  }

  return limpio;
}

function idProductoDeRuta(req) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest('El id del producto no es valido.', 'BAD_PARAMETER');
  }

  return id;
}

// --- Productos --------------------------------------------------------

/** GET /api/inventario/productos */
export async function index(req, res) {
  const productos = await listarProductos({
    estado: filtroEstado(req.query.estado),
    categoria: filtroCategoria(req.query.categoria),
    busqueda: String(req.query.busqueda ?? '').trim() || null,
    soloStockBajo: ['1', 'true', 'si'].includes(
      String(req.query.stock_bajo ?? '').trim().toLowerCase()
    ),
  });

  return res.json({ success: true, productos });
}

/** GET /api/inventario/productos/:id */
export async function show(req, res) {
  const producto = await obtenerProducto(idProductoDeRuta(req));

  if (!producto) {
    throw ApiError.notFound('Producto no encontrado.', 'PRODUCTO_NOT_FOUND');
  }

  return res.json({ success: true, producto });
}

/** POST /api/inventario/productos */
export async function create(req, res) {
  const datos = validarProductoBody(req.body ?? {});

  const idProducto = await crearProducto(datos, { id_usuario: req.user.id });

  const producto = await obtenerProducto(idProducto);

  return res.status(201).json({
    success: true,
    message: 'Producto creado.',
    producto,
  });
}

/** PUT /api/inventario/productos/:id */
export async function update(req, res) {
  const id = idProductoDeRuta(req);
  const datos = validarProductoBody(req.body ?? {});

  // El stock no se edita por aqui a proposito. Para mover stock
  // existe POST /api/inventario/movimientos, que deja historial.
  if (datos.stockInicial !== 0) {
    throw ApiError.badRequest(
      'El stock no se edita desde la ficha del producto. ' +
        'Registra una ENTRADA, una SALIDA o un AJUSTE para cambiarlo.',
      'STOCK_SOLO_POR_MOVIMIENTO'
    );
  }

  await actualizarProducto(id, datos);

  const producto = await obtenerProducto(id);

  return res.json({
    success: true,
    message: 'Producto actualizado.',
    producto,
  });
}

// --- Movimientos ------------------------------------------------------

/** GET /api/inventario/movimientos */
export async function indexMovimientos(req, res) {
  const limite = enteroAcotado(req.query.limite, {
    porDefecto: 50,
    min: 1,
    max: 200,
    nombre: 'limite',
  });

  const offset = enteroAcotado(req.query.offset, {
    porDefecto: 0,
    min: 0,
    max: 100000,
    nombre: 'offset',
  });

  const { movimientos, total } = await listarMovimientos({
    idProducto: enteroAcotado(req.query.id_producto, {
      porDefecto: null,
      min: 1,
      max: 2147483647,
      nombre: 'id_producto',
    }),
    tipo: req.query.tipo ? normalizarTipo(req.query.tipo) : null,
    desde: req.query.desde ? String(req.query.desde).trim() : null,
    hasta: req.query.hasta ? String(req.query.hasta).trim() : null,
    limite,
    offset,
  });

  return res.json({ success: true, movimientos, total, limite, offset });
}

/** GET /api/inventario/movimientos/:id */
export async function showMovimiento(req, res) {
  const id = enteroAcotado(req.params.id, {
    porDefecto: null,
    min: 1,
    max: 2147483647,
    nombre: 'id',
  });

  const movimiento = await obtenerMovimiento(id);

  if (!movimiento) {
    throw ApiError.notFound('Movimiento no encontrado.', 'MOVIMIENTO_NOT_FOUND');
  }

  return res.json({ success: true, movimiento });
}

/** POST /api/inventario/movimientos */
export async function createMovimiento(req, res) {
  const idProducto = enteroAcotado(req.body?.id_producto, {
    porDefecto: null,
    min: 1,
    max: 2147483647,
    nombre: 'id_producto',
  });

  const datos = validarMovimientoBody(req.body ?? {});

  const movimiento = await registrarMovimiento(
    { ...datos, idProducto },
    { id_usuario: req.user.id }
  );

  return res.status(201).json({
    success: true,
    message: `Movimiento ${movimiento.tipo} registrado.`,
    movimiento,
  });
}

// --- Alertas y resumen ------------------------------------------------

/** GET /api/inventario/alertas */
export async function alertas(req, res) {
  const items = await listarAlertasStock();

  return res.json({ success: true, alertas: items });
}

/** GET /api/inventario/resumen */
export async function resumen(req, res) {
  const datos = await resumenInventario();

  return res.json({
    success: true,
    resumen: datos,
    tipos_movimiento: TIPOS_MOVIMIENTO,
    categorias: CATEGORIAS,
  });
}
