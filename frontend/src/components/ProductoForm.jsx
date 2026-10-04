// src/components/ProductoForm.jsx
import { useState, useEffect } from 'react';

// NO hay categoria `cilindro`. Los cilindros no se inventarian:
// la IA los recomienda por medida con un catalogo referencial y
// su precio vive en `parametros_precios`, no en el deposito.
// Aqui solo entra lo que el taller COMPRA: productos, accesorios,
// repuestos, insumos y kits.
const CATEGORIAS = [
  ['producto', 'Producto'],
  ['accesorio', 'Accesorio'],
  ['repuesto', 'Repuesto'],
  ['insumo', 'Insumo'],
  ['kit', 'Kit / componente de conversión'],
  ['otro', 'Otro'],
];

const UNIDADES = ['unidad', 'litro', 'metro', 'juego', 'par', 'kg', 'caja'];

const EMPTY = {
  codigo: '',
  nombre: '',
  descripcion: '',
  categoria: 'producto',
  unidad: 'unidad',
  stock_inicial: 0,
  stock_minimo: 0,
  precio_compra: '',
  precio_venta: '',
  estado: 'activo',
};

/**
 * Alta o edicion de un producto.
 *
 * `stock_inicial` solo aparece al crear. Al editar, el stock no se
 * toca desde aqui: el backend lo rechaza y obliga a registrar un
 * movimiento, para que el historial nunca tenga cantidades sin
 * origen conocido.
 */
export default function ProductoForm({ onSubmit, onCancel, initial = null }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial) {
      setForm({
        codigo: initial.codigo ?? '',
        nombre: initial.nombre ?? '',
        descripcion: initial.descripcion ?? '',
        categoria: initial.categoria ?? 'producto',
        unidad: initial.unidad ?? 'unidad',
        stock_inicial: 0,
        stock_minimo: initial.stock_minimo ?? 0,
        precio_compra: initial.precio_compra ?? '',
        precio_venta: initial.precio_venta ?? '',
        estado: initial.estado ?? 'activo',
      });
    } else {
      setForm(EMPTY);
    }
    setError('');
  }, [initial]);

  const handle = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

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
    <div className="inv-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="inv-card">
        <div className="inv-card-header">
          <h2>{initial ? '✏️ Editar producto' : '➕ Nuevo producto'}</h2>
          <button className="inv-close" onClick={onCancel} aria-label="Cerrar">✕</button>
        </div>

        <form onSubmit={submit} className="inv-form">
          <div className="inv-row">
            <div className="inv-field">
              <label>Código</label>
              <input
                name="codigo"
                value={form.codigo}
                onChange={handle}
                placeholder="Ej: REP-BUJIA-08"
                style={{ textTransform: 'uppercase' }}
                required
              />
            </div>
            <div className="inv-field">
              <label>Nombre</label>
              <input
                name="nombre"
                value={form.nombre}
                onChange={handle}
                placeholder="Ej: Bujía de encendido"
                required
              />
            </div>
          </div>

          <div className="inv-field">
            <label>Descripción</label>
            <textarea
              name="descripcion"
              value={form.descripcion}
              onChange={handle}
              rows="2"
              placeholder="Opcional"
            />
          </div>

          <div className="inv-row">
            <div className="inv-field">
              <label>Categoría</label>
              <select name="categoria" value={form.categoria} onChange={handle}>
                {CATEGORIAS.map(([valor, texto]) => (
                  <option key={valor} value={valor}>{texto}</option>
                ))}
              </select>
            </div>
            <div className="inv-field">
              <label>Unidad</label>
              <select name="unidad" value={form.unidad} onChange={handle}>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="inv-row">
            {!initial && (
              <div className="inv-field">
                <label>
                  Stock inicial <span className="inv-hint">(queda como ENTRADA)</span>
                </label>
                <input
                  type="number"
                  name="stock_inicial"
                  min="0"
                  step="1"
                  value={form.stock_inicial}
                  onChange={handle}
                />
              </div>
            )}
            <div className="inv-field">
              <label>Stock mínimo <span className="inv-hint">(avisa cuando llega)</span></label>
              <input
                type="number"
                name="stock_minimo"
                min="0"
                step="1"
                value={form.stock_minimo}
                onChange={handle}
                required
              />
            </div>
          </div>

          <div className="inv-row">
            <div className="inv-field">
              <label>Precio de compra (Bs)</label>
              <input
                type="number"
                name="precio_compra"
                min="0"
                step="0.01"
                value={form.precio_compra}
                onChange={handle}
                placeholder="0.00"
              />
            </div>
            <div className="inv-field">
              <label>Precio de venta (Bs)</label>
              <input
                type="number"
                name="precio_venta"
                min="0"
                step="0.01"
                value={form.precio_venta}
                onChange={handle}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="inv-field">
            <label>Estado</label>
            <select name="estado" value={form.estado} onChange={handle}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </div>

          {error && <p className="inv-error">⚠ {error}</p>}

          <div className="inv-actions">
            <button type="button" className="inv-btn-cancel" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="inv-btn-save" disabled={busy}>
              {busy ? 'Guardando…' : initial ? 'GUARDAR' : 'CREAR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
