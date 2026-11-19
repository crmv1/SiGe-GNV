// src/components/MovimientoForm.jsx
import { useState } from 'react';
import './InventarioForm.css';

function nowLocal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MovimientoForm({ articulo, onSubmit, onCancel }) {
  const [form, setForm]   = useState({ tipo: 'entrada', cantidad: '', fecha: nowLocal() });
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);

  const handle = (e) =>
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const fecha = form.fecha ? form.fecha.replace('T', ' ') : '';
      await onSubmit({ articulo_id: articulo.id, tipo: form.tipo, cantidad: parseInt(form.cantidad, 10), fecha });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const esSalida = form.tipo === 'salida';

  return (
    <div className="vf-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="vf-card mov-card">
        <div className="vf-header">
          <h2>{esSalida ? '➖ Registrar Salida' : '➕ Registrar Entrada'}</h2>
          <button className="vf-close" onClick={onCancel}>✕</button>
        </div>

        <form onSubmit={submit} className="vf-form">
          <div className="mov-info">
            <strong>{articulo.nombre}</strong>
            <span>Stock actual: <b>{articulo.cantidad}</b> unidades</span>
          </div>

          <div className="vf-row">
            <div className="vf-field">
              <label>Tipo de movimiento</label>
              <select name="tipo" value={form.tipo} onChange={handle}>
                <option value="entrada">Entrada (ingreso)</option>
                <option value="salida">Salida (egreso)</option>
              </select>
            </div>
            <div className="vf-field">
              <label>Cantidad</label>
              <input type="number" min="1" step="1" name="cantidad"
                     value={form.cantidad} onChange={handle}
                     placeholder="0" required />
            </div>
          </div>

          <div className="vf-row">
            <div className="vf-field" style={{ gridColumn: '1 / -1' }}>
              <label>Fecha de {esSalida ? 'salida' : 'ingreso'}</label>
              <input type="datetime-local" name="fecha"
                     value={form.fecha} onChange={handle} required />
            </div>
          </div>

          {error && <p className="vf-error">⚠ {error}</p>}

          <div className="vf-actions">
            <button type="button" className="btn-cancel" onClick={onCancel}>Cancelar</button>
            <button type="submit" className={`btn-save ${esSalida ? 'btn-save-salida' : ''}`} disabled={busy}>
              {busy ? 'Guardando…' : esSalida ? 'REGISTRAR SALIDA' : 'REGISTRAR ENTRADA'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}