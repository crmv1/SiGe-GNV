// src/pages/InventoryPage.jsx
import { useState, useEffect, useCallback } from 'react';
import InventarioForm   from '../components/InventarioForm';
import MovimientoForm   from '../components/MovimientoForm';
import MovimientosModal from '../components/MovimientosModal';
import {
  getInventario, addArticulo, updateArticulo, deleteArticulo,
  addMovimiento,
} from '../api';
import './InventoryPage.css';

function formatMoney(n) {
  const v = Number(n || 0);
  return 'Bs ' + v.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InventoryPage({ user }) {
  const isAdmin       = user?.rol === 'administrador';
  const [articulos, setArticulos]  = useState([]);
  const [loading, setLoading]      = useState(true);
  const [search, setSearch]        = useState('');
  const [showForm, setShowForm]    = useState(false);
  const [editing, setEditing]      = useState(null);
  const [movimientoArticulo, setMovimientoArticulo] = useState(null);
  const [historialArticulo, setHistorialArticulo]   = useState(null);
  const [confirm, setConfirm]      = useState(null);
  const [toast, setToast]          = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(''), 3500);
  };

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInventario();
      setArticulos(data.articulos);
    } catch (e) {
      showToast('Error al cargar inventario: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // ----- CRUD artículos -----
  const handleAdd = async (form) => {
    await addArticulo({
      nombre:        form.nombre,
      descripcion:   form.descripcion,
      cantidad:      parseInt(form.cantidad, 10) || 0,
      precio_compra: form.precio_compra,
      precio_venta:  form.precio_venta,
      proveedor:     form.proveedor,
    });
    showToast('Artículo registrado correctamente ✔');
    setShowForm(false);
    cargar();
  };

  const handleUpdate = async (form) => {
    await updateArticulo({
      id:            editing.id,
      nombre:        form.nombre,
      descripcion:   form.descripcion,
      precio_compra: form.precio_compra,
      precio_venta:  form.precio_venta,
      proveedor:     form.proveedor,
    });
    showToast('Artículo actualizado correctamente ✔');
    setEditing(null);
    cargar();
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteArticulo(confirm);
      showToast('Artículo eliminado ✔');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setConfirm(null);
      cargar();
    }
  };

  // ----- Movimientos -----
  const handleMovimiento = async (payload) => {
    await addMovimiento(payload);
    showToast(
      payload.tipo === 'entrada'
        ? `Entrada registrada (+${payload.cantidad}) ✔`
        : `Salida registrada (-${payload.cantidad}) ✔`
    );
    setMovimientoArticulo(null);
    cargar();
  };

  // ----- Filtro -----
  const filtered = articulos.filter(a => {
    const q = search.toLowerCase();
    return (
      a.nombre.toLowerCase().includes(q) ||
      (a.descripcion || '').toLowerCase().includes(q) ||
      (a.proveedor || '').toLowerCase().includes(q)
    );
  });

  // ----- Render -----
  return (
    <main className="inv-main">
      {/* Toolbar */}
      <div className="dash-toolbar">
        <div className="toolbar-left">
          <h1 className="dash-heading">Inventario de Repuestos</h1>
          <span className="dash-count">{filtered.length} artículo(s)</span>
        </div>
        <div className="toolbar-right">
          <input
            className="search-input"
            type="search"
            placeholder="🔍  Buscar por nombre, proveedor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn-add" onClick={() => setShowForm(true)}>
            + Nuevo Artículo
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="inv-summary">
        <div className="inv-stat">
          <span>Artículos</span>
          <b>{articulos.length}</b>
        </div>
        <div className="inv-stat">
          <span>Unidades en stock</span>
          <b>{articulos.reduce((acc, a) => acc + Number(a.cantidad || 0), 0)}</b>
        </div>
        <div className="inv-stat">
          <span>Valor de inventario (compra)</span>
          <b>{formatMoney(articulos.reduce((acc, a) => acc + Number(a.cantidad || 0) * Number(a.precio_compra || 0), 0))}</b>
        </div>
      </div>

      {/* Tabla */}
      <div className="table-wrap">
        {loading ? (
          <div className="table-loading">Cargando…</div>
        ) : (
          <table className="inv-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Artículo</th>
                <th>Stock</th>
                <th>P. Compra</th>
                <th>P. Venta</th>
                <th>Proveedor</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-empty">
                    No hay artículos que coincidan.
                  </td>
                </tr>
              ) : (
                filtered.map((a, i) => (
                  <tr key={a.id} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
                    <td className="td-num">{i + 1}</td>
                    <td className="td-art">
                      <strong>{a.nombre}</strong>
                      {a.descripcion && <span className="art-desc">{a.descripcion}</span>}
                    </td>
                    <td>
                      <span className={`stock-chip ${a.cantidad === 0 ? 'stock-cero' : ''}`}>
                        {a.cantidad}
                      </span>
                    </td>
                    <td className="td-money">{formatMoney(a.precio_compra)}</td>
                    <td className="td-money">{formatMoney(a.precio_venta)}</td>
                    <td className="td-prov">{a.proveedor || '—'}</td>
                    <td className="td-actions">
                      <button className="btn-mov-entrada" title="Registrar entrada"
                              onClick={() => setMovimientoArticulo({ ...a })}>
                        ➕ Entrada
                      </button>
                      <button className="btn-mov-salida" title="Registrar salida"
                              onClick={() => setMovimientoArticulo({ ...a })}>
                        ➖ Salida
                      </button>
                      <button className="btn-historial" title="Ver historial"
                              onClick={() => setHistorialArticulo({ ...a })}>
                        📋
                      </button>
                      <button className="btn-edit" title="Editar"
                              onClick={() => setEditing(a)}>
                        ✏️
                      </button>
                      {isAdmin && (
                        <button className="btn-delete" title="Eliminar"
                                onClick={() => setConfirm(a.id)}>
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ===== MODAL FORMULARIO ARTÍCULO ===== */}
      {(showForm || editing) && (
        <InventarioForm
          initial={editing}
          onSubmit={editing ? handleUpdate : handleAdd}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {/* ===== MODAL MOVIMIENTO ===== */}
      {movimientoArticulo && (
        <MovimientoForm
          articulo={movimientoArticulo}
          onSubmit={handleMovimiento}
          onCancel={() => setMovimientoArticulo(null)}
        />
      )}

      {/* ===== MODAL HISTORIAL ===== */}
      {historialArticulo && (
        <MovimientosModal
          articulo={historialArticulo}
          onClose={() => setHistorialArticulo(null)}
        />
      )}

      {/* ===== MODAL CONFIRMACIÓN ELIMINAR ===== */}
      {confirm && (
        <div className="confirm-overlay" onClick={() => setConfirm(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <p>⚠️ ¿Eliminar este artículo? Se perderá también su historial de movimientos.</p>
            <div className="confirm-actions">
              <button className="btn-cancel-confirm" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
              <button className="btn-delete-confirm" onClick={handleDeleteConfirm}>
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== TOAST ===== */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </main>
  );
}