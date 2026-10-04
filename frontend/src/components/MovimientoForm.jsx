// src/components/MovimientoForm.jsx
import { useState, useEffect } from 'react';

const TIPOS = [
  ['ENTRADA', 'Entrada', 'Compra, reposición o ingreso de mercadería'],
  ['SALIDA', 'Salida', 'Uso en un servicio o venta de un accesorio'],
  ['AJUSTE', 'Ajuste', 'Corrección por conteo físico'],
];

const EMPTY = {
  tipo: 'ENTRADA',
  cantidad: '',
  stock_nuevo: '',
  motivo: '',
  referencia: '',
};

/**
 * Registro de una entrada, salida o ajuste.
 *
 * El stock nunca se escribe directo. Para AJUSTE se indica la
 * cantidad contada en el deposito y el backend guarda la
 * diferencia. Para ENTRADA y SALIDA se indica cuanto entra o sale,
 * y el backend impide que la salida deje el stock en negativo.
 */
export default function MovimientoForm({ producto, onSubmit, onCancel }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(EMPTY);
    setError('');
  }, [producto]);

  const handle = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

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

  const esAjuste = form.tipo === 'AJUSTE';
  const quedaNegativo =
    !esAjuste && form.tipo === 'SALIDA' && Number(form.cantidad) > Number(producto.stock_actual);

  return (
    <div className="inv-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="inv-card">
        <div className="inv-card-header">
          <h2>📦 Movimiento de stock</h2>
          <button className="inv-close" onClick={onCancel} aria-label="Cerrar">✕</button>
        </div>

        <div className="inv-stock-actual">
          <span className="inv-stock-chip">{producto.codigo}</span>
          <span>{producto.nombre}</span>
          <span className="inv-stock-num">
            Stock actual: <strong>{producto.stock_actual}</strong> {producto.unidad}
          </span>
        </div>

        <form onSubmit={submit} className="inv-form">
          <div className="inv-field">
            <label>Tipo de movimiento</label>
            <div className="inv-tipo-row">
              {TIPOS.map(([valor, texto, ayuda]) => (
                <label key={valor} className={`inv-tipo ${form.tipo === valor ? 'inv-tipo-on' : ''}`}>
                  <input
                    type="radio"
                    name="tipo"
                    value={valor}
                    checked={form.tipo === valor}
                    onChange={handle}
                  />
                  <strong>{texto}</strong>
                  <span>{ayuda}</span>
                </label>
              ))}
            </div>
          </div>

          {esAjuste ? (
            <div className="inv-field">
              <label>
                Cantidad contada en el depósito <span className="inv-hint">(stock real)</span>
              </label>
              <input
                type="number"
                name="stock_nuevo"
                min="0"
                step="1"
                value={form.stock_nuevo}
                onChange={handle}
                placeholder={`Hoy figura ${producto.stock_actual}`}
                required
              />
            </div>
          ) : (
            <div className="inv-field">
              <label>
                Cantidad {form.tipo === 'ENTRADA' ? 'que entra' : 'que sale'}
              </label>
              <input
                type="number"
                name="cantidad"
                min="1"
                step="1"
                value={form.cantidad}
                onChange={handle}
                placeholder="Ej: 2"
                required
              />
            </div>
          )}

          <div className="inv-field">
            <label>Motivo <span className="inv-hint">(obligatorio)</span></label>
            <input
              name="motivo"
              value={form.motivo}
              onChange={handle}
              placeholder={
                esAjuste
                  ? 'Ej: Conteo físico de fin de mes'
                  : form.tipo === 'ENTRADA'
                    ? 'Ej: Compra de mercadería'
                    : 'Ej: Instalación en servicio'
              }
              required
            />
          </div>

          <div className="inv-field">
            <label>Referencia <span className="inv-hint">(factura u orden, opcional)</span></label>
            <input
              name="referencia"
              value={form.referencia}
              onChange={handle}
              placeholder="Ej: FAC-00123"
            />
          </div>

          {quedaNegativo && (
            <p className="inv-warn">
              ⚠ Con {producto.stock_actual} {producto.unidad} no se pueden retirar{' '}
              {form.cantidad}. El servidor va a rechazar la salida.
            </p>
          )}

          {error && <p className="inv-error">⚠ {error}</p>}

          <div className="inv-actions">
            <button type="button" className="inv-btn-cancel" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="inv-btn-save" disabled={busy}>
              {busy ? 'Registrando…' : 'REGISTRAR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
