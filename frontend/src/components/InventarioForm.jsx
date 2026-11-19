// src/components/InventarioForm.jsx
import { useState, useEffect } from 'react';
import './InventarioForm.css';

const EMPTY = {
  nombre: '', descripcion: '', cantidad: '', precio_compra: '',
  precio_venta: '', proveedor: '',
};

export default function InventarioForm({ onSubmit, onCancel, initial = null }) {
  const [form, setForm]   = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);

  useEffect(() => {
    if (initial) {
      setForm({
        nombre: initial.nombre,
        descripcion: initial.descripcion || '',
        cantidad: initial.cantidad,
        precio_compra: initial.precio_compra,
        precio_venta: initial.precio_venta,
        proveedor: initial.proveedor || '',
      });
    } else {
      setForm(EMPTY);
    }
    setError('');
  }, [initial]);

  const handle = (e) =>
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vf-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="vf-card">
        <div className="vf-header">
          <h2>{initial ? '✏️ Editar Artículo' : '📦 Nuevo Artículo'}</h2>
          <button className="vf-close" onClick={onCancel}>✕</button>
        </div>

        <form onSubmit={submit} className="vf-form">
          {/* Fila 1: Nombre + Proveedor */}
          <div className="vf-row">
            <div className="vf-field">
              <label>Nombre del artículo</label>
              <input name="nombre" value={form.nombre} onChange={handle}
                     placeholder="Ej: Cilindro GNV 60L" required />
            </div>
            <div className="vf-field">
              <label>Proveedor</label>
              <input name="proveedor" value={form.proveedor} onChange={handle}
                     placeholder="Ej: GNV Bolivia Center" />
            </div>
          </div>

          {/* Fila 2: Precios */}
          <div className="vf-row">
            <div className="vf-field">
              <label>Precio de compra (Bs)</label>
              <input type="number" min="0" step="0.01" name="precio_compra"
                     value={form.precio_compra} onChange={handle} required />
            </div>
            <div className="vf-field">
              <label>Precio de venta (Bs)</label>
              <input type="number" min="0" step="0.01" name="precio_venta"
                     value={form.precio_venta} onChange={handle} required />
            </div>
          </div>

          {/* Fila 3: Stock inicial o aviso */}
          {initial ? (
            <div className="vf-row">
              <div className="vf-field">
                <label>Cantidad actual
                  <span className="vf-hint"> (se controla con movimientos)</span>
                </label>
                <input value={initial.cantidad} disabled />
              </div>
            </div>
          ) : (
            <div className="vf-row">
              <div className="vf-field">
                <label>Cantidad inicial <span className="vf-hint">(genera una entrada)</span></label>
                <input type="number" min="0" step="1" name="cantidad"
                       value={form.cantidad} onChange={handle} required />
              </div>
            </div>
          )}

          {/* Fila 4: Descripción */}
          <div className="vf-row">
            <div className="vf-field" style={{ gridColumn: '1 / -1' }}>
              <label>Descripción</label>
              <textarea name="descripcion" value={form.descripcion} onChange={handle}
                        placeholder="Detalles del artículo (opcional)" rows="2" />
            </div>
          </div>

          {error && <p className="vf-error">⚠ {error}</p>}

          <div className="vf-actions">
            <button type="button" className="btn-cancel" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="btn-save" disabled={busy}>
              {busy ? 'Guardando…' : 'GUARDAR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}