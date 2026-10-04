// src/pages/InventarioPage.jsx
//
// Gestion del inventario del taller desde la aplicacion web.
//
// Permisos, segun el rol con el que se entro:
//   - administrador: crea y edita productos, registra entradas,
//     salidas y ajustes, y consulta el historial.
//   - tecnico: solo consulta el stock y las alertas. Los botones
//     de escribir no se le muestran, y el backend los rechaza
//     igual si alguien los llama a mano.
//   - cliente: no llega aqui. La app movil de clientes no tiene
//     ninguna pantalla de inventario.
//
// El stock no se escribe nunca desde el formulario de edicion:
// cambia solo a traves de movimientos, que quedan en el historial.
import { useState, useEffect, useCallback } from 'react';
import ProductoForm from '../components/ProductoForm';
import MovimientoForm from '../components/MovimientoForm';
import {
  getProductos, addProducto, updateProducto,
  registrarMovimiento, getMovimientos,
  getAlertasStock, getResumenInventario,
} from '../api';
import './InventarioPage.css';

// Sin `cilindro`: los cilindros no son productos del deposito.
// La IA los recomienda por medida y su precio esta en
// `parametros_precios`. Aqui solo se inventaria lo que el taller
// compra: productos, accesorios, repuestos, insumos y kits.
const CATEGORIAS = [
  ['', 'Todas'],
  ['producto', 'Productos'],
  ['accesorio', 'Accesorios'],
  ['repuesto', 'Repuestos'],
  ['insumo', 'Insumos'],
  ['kit', 'Kits'],
  ['otro', 'Otros'],
];

function money(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return `${Number(valor).toFixed(2)} Bs`;
}

function fechaCorta(iso) {
  if (!iso) return '—';
  return iso.replace('T', ' ').slice(0, 16);
}

/** Estado del stock de un producto, para el chip de la tabla. */
function estadoStock(p) {
  if (p.stock_actual === 0) return { cls: 'inv-stock-vacio', texto: 'Sin stock' };
  if (p.stock_actual <= p.stock_minimo) return { cls: 'inv-stock-bajo', texto: 'Stock bajo' };
  return { cls: 'inv-stock-ok', texto: 'Disponible' };
}

export default function InventarioPage({ user }) {
  const isAdmin = user?.rol === 'administrador';

  const [productos, setProductos] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [movimientos, setMovimientos] = useState([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('');
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [vista, setVista] = useState('productos');

  const [editando, setEditando] = useState(null);
  const [moviendo, setMoviendo] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ---------- Carga ------------------------------------------------
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [lista, alertasRes, resumenRes] = await Promise.all([
        getProductos(),
        getAlertasStock(),
        getResumenInventario(),
      ]);

      setProductos(lista.productos);
      setAlertas(alertasRes.alertas);
      setResumen(resumenRes.resumen);
    } catch (e) {
      showToast('Error al cargar el inventario: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const cargarHistorial = useCallback(async () => {
    if (!isAdmin) return;

    try {
      const data = await getMovimientos({ limite: 100 });
      setMovimientos(data.movimientos);
    } catch (e) {
      showToast('Error al cargar el historial: ' + e.message, 'error');
    }
  }, [isAdmin, showToast]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  // ---------- Acciones --------------------------------------------
  const handleCreate = async (form) => {
    try {
      await addProducto(form);
      showToast('Producto creado ✔');
      setEditando(null);
      await cargar();
    } catch (e) {
      // El error se muestra tambien dentro del modal.
      showToast(e.message, 'error');
      throw e;
    }
  };

  const handleUpdate = async (form) => {
    try {
      await updateProducto(editando.id_producto, form);
      showToast('Producto actualizado ✔');
      setEditando(null);
      await cargar();
    } catch (e) {
      showToast(e.message, 'error');
      throw e;
    }
  };

  const handleMovimiento = async (form) => {
    const cuerpo = {
      id_producto: moviendo.id_producto,
      tipo: form.tipo,
      motivo: form.motivo,
    };

    if (form.referencia) cuerpo.referencia = form.referencia;
    if (form.tipo === 'AJUSTE') cuerpo.stock_nuevo = Number(form.stock_nuevo);
    else cuerpo.cantidad = Number(form.cantidad);

    try {
      const res = await registrarMovimiento(cuerpo);
      showToast(
        `${res.movimiento.tipo} registrada: ${moviendo.stock_actual} → ` +
          `${res.movimiento.stockNuevo} ${moviendo.unidad} ✔`
      );
      setMoviendo(null);
      await Promise.all([cargar(), cargarHistorial()]);
    } catch (e) {
      // "Stock insuficiente." llega aqui como un 409 controlado.
      showToast(e.message, 'error');
      throw e;
    }
  };

  // ---------- Filtros ---------------------------------------------
  const filtrados = productos.filter((p) => {
    const q = search.trim().toLowerCase();

    if (q && !(p.codigo.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q))) {
      return false;
    }

    if (categoria && p.categoria !== categoria) return false;

    if (soloAlertas && !(p.stock_actual <= p.stock_minimo)) return false;

    return true;
  });

  const productosSinStock = productos.filter((p) => p.stock_actual === 0);
  const productosStockBajo = productos.filter(
    (p) => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo
  );

  return (
    <div className="inv-page">
      {/* ===== RESUMEN ===== */}
      <div className="inv-stats">
        <div className="inv-stat">
          <span className="inv-stat-num">{resumen?.productos_activos ?? '—'}</span>
          <span className="inv-stat-lbl">Productos activos</span>
        </div>
        <div className="inv-stat">
          <span className="inv-stat-num">{resumen?.unidades_stock ?? '—'}</span>
          <span className="inv-stat-lbl">Unidades en stock</span>
        </div>
        <div className={`inv-stat ${productosStockBajo.length > 0 ? 'inv-stat-warn' : ''}`}>
          <span className="inv-stat-num">{productosStockBajo.length}</span>
          <span className="inv-stat-lbl">Con stock bajo</span>
        </div>
        <div className={`inv-stat ${productosSinStock.length > 0 ? 'inv-stat-danger' : ''}`}>
          <span className="inv-stat-num">{productosSinStock.length}</span>
          <span className="inv-stat-lbl">Sin stock</span>
        </div>
      </div>

      {/* ===== ALERTA DE STOCK MINIMO ===== */}
      {alertas.length > 0 && (
        <div className="inv-banner">
          <strong>⚠ Stock bajo</strong>
          <span>
            {alertas.length} producto(s) en o por debajo del mínimo. Stock insuficiente:{' '}
            {productosSinStock.length} agotado(s).
          </span>
          <ul className="inv-banner-list">
            {alertas.slice(0, 6).map((a) => (
              <li key={a.id_producto}>
                <span className="inv-stock-chip">{a.codigo}</span> {a.nombre} —{' '}
                {a.stock_actual} / {a.stock_minimo} {a.unidad}
              </li>
            ))}
            {alertas.length > 6 && <li>… y {alertas.length - 6} más</li>}
          </ul>
        </div>
      )}

      {/* ===== TOOLBAR ===== */}
      <div className="dash-toolbar">
        <div className="toolbar-left">
          <h1 className="dash-heading">Inventario del taller</h1>
          <span className="dash-count">{filtrados.length} producto(s)</span>
        </div>
        <div className="toolbar-right">
          <input
            className="search-input"
            type="search"
            placeholder="🔍  Buscar por código o nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="inv-select"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            {CATEGORIAS.map(([valor, texto]) => (
              <option key={valor} value={valor}>{texto}</option>
            ))}
          </select>
          <label className="inv-check">
            <input
              type="checkbox"
              checked={soloAlertas}
              onChange={(e) => setSoloAlertas(e.target.checked)}
            />
            Solo stock bajo
          </label>
          {isAdmin && (
            <button className="btn-add" onClick={() => setEditando('nuevo')}>
              + Nuevo producto
            </button>
          )}
        </div>
      </div>

      {!isAdmin && (
        <p className="inv-note">
          Estás como <strong>{(user?.rol ?? '').toUpperCase()}</strong>: consulta de stock
          solamente. Registrar entradas, salidas o ajustes es del administrador.
        </p>
      )}

      {/* ===== PESTANAS ===== */}
      <div className="inv-tabs">
        <button
          className={vista === 'productos' ? 'inv-tab inv-tab-on' : 'inv-tab'}
          onClick={() => setVista('productos')}
        >
          Productos
        </button>
        {isAdmin && (
          <button
            className={vista === 'historial' ? 'inv-tab inv-tab-on' : 'inv-tab'}
            onClick={() => setVista('historial')}
          >
            Historial de movimientos
          </button>
        )}
      </div>

      {vista === 'productos' ? (
        <div className="table-wrap">
          {loading ? (
            <div className="table-loading">Cargando…</div>
          ) : (
            <table className="vehiculos-table inv-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Stock</th>
                  <th>Mínimo</th>
                  <th>Estado</th>
                  {isAdmin && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="table-empty">
                      No hay productos que coincidan.
                    </td>
                  </tr>
                ) : (
                  filtrados.map((p, i) => {
                    const estado = estadoStock(p);

                    return (
                      <tr key={p.id_producto} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
                        <td><span className="placa-chip">{p.codigo}</span></td>
                        <td className="td-nombre">
                          <strong>{p.nombre}</strong>
                          {p.descripcion && <div className="inv-desc">{p.descripcion}</div>}
                          <div className="inv-precios">
                            Compra {money(p.precio_compra)}
                            {p.precio_venta !== null && <> · Venta {money(p.precio_venta)}</>}
                            {p.capacidad_litros !== null && p.capacidad_litros !== undefined && (
                              <> · {p.capacidad_litros} L{p.montaje ? ` · ${p.montaje}` : ''}</>
                            )}
                          </div>
                        </td>
                        <td><span className="inv-cat">{p.categoria}</span></td>
                        <td>
                          <span className={`inv-stock ${estado.cls}`}>
                            {p.stock_actual} {p.unidad}
                          </span>
                        </td>
                        <td className="td-num">{p.stock_minimo}</td>
                        <td>
                          <span className={estado.cls}>{estado.texto}</span>
                          {p.estado === 'inactivo' && (
                            <span className="inv-inactivo"> · inactivo</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="td-actions">
                            <button
                              className="btn-edit"
                              onClick={() => setMoviendo(p)}
                              title="Registrar entrada, salida o ajuste"
                            >
                              📦 Mover
                            </button>
                            <button
                              className="btn-edit"
                              onClick={() => setEditando(p)}
                              title="Editar producto"
                            >
                              ✏️ Editar
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="vehiculos-table inv-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Stock</th>
                <th>Motivo</th>
                <th>Referencia</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty">
                    Todavía no hay movimientos registrados.
                  </td>
                </tr>
              ) : (
                movimientos.map((m, i) => (
                  <tr key={m.id_movimiento} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
                    <td className="td-num">{fechaCorta(m.fecha)}</td>
                    <td className="td-nombre">
                      <span className="placa-chip">{m.producto_codigo}</span>{' '}
                      <strong>{m.producto_nombre}</strong>
                    </td>
                    <td>
                      <span className={`inv-mov inv-mov-${m.tipo.toLowerCase()}`}>{m.tipo}</span>
                    </td>
                    <td>
                      {m.tipo === 'SALIDA' ? '−' : m.tipo === 'ENTRADA' ? '+' : '±'}
                      {m.cantidad} {m.producto_unidad}
                    </td>
                    <td className="td-num">
                      {m.stock_anterior} → <strong>{m.stock_nuevo}</strong>
                    </td>
                    <td>{m.motivo}</td>
                    <td>{m.referencia || '—'}</td>
                    <td>{m.usuario}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== MODALES ===== */}
      {editando && (
        <ProductoForm
          initial={editando === 'nuevo' ? null : editando}
          onSubmit={editando === 'nuevo' ? handleCreate : handleUpdate}
          onCancel={() => setEditando(null)}
        />
      )}

      {moviendo && (
        <MovimientoForm
          producto={moviendo}
          onSubmit={handleMovimiento}
          onCancel={() => setMoviendo(null)}
        />
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
