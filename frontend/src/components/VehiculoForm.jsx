// src/components/VehiculoForm.jsx
import { useState, useEffect } from 'react';
import './VehiculoForm.css';

const EMPTY = {
  nombre: '', apellido: '', placa: '',
  fecha_recalificacion: '', fecha_inspeccion: '', telefono: '',
};

export default function VehiculoForm({ onSubmit, onCancel, initial = null }) {
  const [form, setForm]   = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);

  useEffect(() => {
    setForm(initial ? { ...initial } : EMPTY);
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
          <h2>{initial ? '✏️ Editar Vehículo' : '➕ Nuevo Vehículo'}</h2>
          <button className="vf-close" onClick={onCancel}>✕</button>
        </div>

        <form onSubmit={submit} className="vf-form">
          {/* Fila 1: Nombre + Apellido */}
          <div className="vf-row">
            <div className="vf-field">
              <label>Nombre</label>
              <input name="nombre" value={form.nombre} onChange={handle}
                     placeholder="Ej: Carlos" required />
            </div>
            <div className="vf-field">
              <label>Apellido</label>
              <input name="apellido" value={form.apellido} onChange={handle}
                     placeholder="Ej: Mamani" required />
            </div>
          </div>

          {/* Fila 2: Placa + Teléfono */}
          <div className="vf-row">
            <div className="vf-field">
              <label>Placa</label>
              <input name="placa" value={form.placa} onChange={handle}
                     placeholder="Ej: 1234ABC"
                     style={{ textTransform: 'uppercase' }} required />
            </div>
            <div className="vf-field">
              <label>Teléfono / WhatsApp</label>
              <input name="telefono" value={form.telefono} onChange={handle}
                     placeholder="591712345678" required />
            </div>
          </div>

          {/* Fila 3: Fechas */}
          <div className="vf-row">
            <div className="vf-field">
              <label>Fecha Recalificación <span className="vf-hint">(cada 5 años)</span></label>
              <input type="date" name="fecha_recalificacion"
                     value={form.fecha_recalificacion} onChange={handle} required />
            </div>
            <div className="vf-field">
              <label>Fecha Inspección <span className="vf-hint">(anual)</span></label>
              <input type="date" name="fecha_inspeccion"
                     value={form.fecha_inspeccion} onChange={handle} required />
            </div>
          </div>

          {error && <p className="vf-error">⚠ {error}</p>}

          <div className="vf-actions">
            <button type="button" className="btn-cancel" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="btn-save" disabled={busy}>
              {busy ? 'Guardando…' : 'INGRESAR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
