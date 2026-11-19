// src/components/VehiculoForm.jsx
import { useState, useEffect } from 'react';
import './VehiculoForm.css';

const EMPTY = {
  nombre: '', apellido: '', placa: '', telefono: '',
  fecha_inspeccion_realizada: '', fecha_recalificacion_realizada: '',
};

const ANIOS_INSPECCION = 1;
const ANIOS_RECALIFICACION = 5;

// Los vehiculos cargados antes de la migracion 009 tienen la fecha
// real en NULL a proposito (no se sabe cuando se hizo el trabajo).
// MySQL devuelve eso como null, y `<input value={null}>` hace que
// React avise por consola y el campo se paint raro. Se convierte
// a cadena vacia una sola vez, al montar y al editar.
const aTexto = (v) => (v === null || v === undefined ? '' : String(v).slice(0, 10));

// Suma años a 'YYYY-MM-DD'. El backend también lo aplica; aquí solo
// se muestra la vista previa para que el técnico vea el vencimiento
// antes de guardar. 29/02 cae en 1/03, que es lo que dice la ley.
function sumarAnios(fechaIso, anios) {
  const [y, m, d] = fechaIso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  f.setUTCFullYear(f.getUTCFullYear() + anios);
  return f.toISOString().slice(0, 10);
}

function fmt(fechaIso) {
  if (!fechaIso) return '—';
  const [y, m, d] = fechaIso.split('-');
  return `${d}/${m}/${y}`;
}

export default function VehiculoForm({ onSubmit, onCancel, initial = null }) {
  const [form, setForm]   = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);

  useEffect(() => {
    if (!initial) {
      setForm(EMPTY);
    } else {
      setForm({
        ...EMPTY,
        ...initial,
        fecha_inspeccion_realizada: aTexto(initial.fecha_inspeccion_realizada),
        fecha_recalificacion_realizada: aTexto(initial.fecha_recalificacion_realizada),
      });
    }
    setError('');
  }, [initial]);

  const handle = (e) =>
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  // "No la conozco" es una respuesta valida, no un dato faltante. Si
  // el taller no tiene el papel de la inspeccion antigua, se marca
  // la casilla y la fecha viaja vacia: el sistema guarda NULL en vez
  // de inventar un dia. Sin esto, el `required` del input obligaria
  // al tecnico a poner una fecha que nadie conoce.
  const marcarDesconocida = (campo) =>
    setForm(p => {
      const marcada = !p[`${campo}_desconocida`];
      return marcada
        ? { ...p, [campo]: '', [`${campo}_desconocida`]: true }
        : { ...p, [`${campo}_desconocida`]: false };
    });

  const desconocida = (campo) => Boolean(form[`${campo}_desconocida`]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit(datos);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Vista previa de los vencimientos. El backend los calcula igual;
  // esto es solo para que el técnico no memorice +1 año ni +5 años.
  const vencInspeccion = form.fecha_inspeccion_realizada
    ? sumarAnios(form.fecha_inspeccion_realizada, ANIOS_INSPECCION) : null;
  const vencRecalificacion = form.fecha_recalificacion_realizada
    ? sumarAnios(form.fecha_recalificacion_realizada, ANIOS_RECALIFICACION) : null;

  // Al guardar se limpian los flags: son solo de la UI.
  const datos = {
    nombre: form.nombre.trim(),
    apellido: form.apellido.trim(),
    placa: form.placa.trim(),
    telefono: form.telefono.trim(),
    fecha_inspeccion_realizada: form.fecha_inspeccion_realizada,
    fecha_recalificacion_realizada: form.fecha_recalificacion_realizada,
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

          {/* Fila 3: la fecha real es el dato que se carga. El
              vencimiento NO se escribe nunca: lo deriva el sistema
              a partir de la real, y solo se muestra como lectura. */}
          <div className="vf-row">
            <div className="vf-field">
              <label>
                Fecha real de inspección
                <span className="vf-hint">el día en que se hizo</span>
              </label>
              <input type="date" name="fecha_inspeccion_realizada"
                     value={form.fecha_inspeccion_realizada}
                     onChange={handle}
                     disabled={desconocida('fecha_inspeccion_realizada')}
                     required={!desconocida('fecha_inspeccion_realizada')} />
              <label className="vf-check">
                <input type="checkbox"
                       checked={desconocida('fecha_inspeccion_realizada')}
                       onChange={() => marcarDesconocida('fecha_inspeccion_realizada')} />
                No conozco la fecha real
              </label>
              <small className="vf-preview">
                Vence: <strong>{fmt(vencInspeccion)}</strong> <span className="vf-hint">(+1 año, automático)</span>
              </small>
            </div>

            <div className="vf-field">
              <label>
                Fecha real de recalificación
                <span className="vf-hint">el día en que se hizo</span>
              </label>
              <input type="date" name="fecha_recalificacion_realizada"
                     value={form.fecha_recalificacion_realizada}
                     onChange={handle}
                     disabled={desconocida('fecha_recalificacion_realizada')}
                     required={!desconocida('fecha_recalificacion_realizada')} />
              <label className="vf-check">
                <input type="checkbox"
                       checked={desconocida('fecha_recalificacion_realizada')}
                       onChange={() => marcarDesconocida('fecha_recalificacion_realizada')} />
                No conozco la fecha real
              </label>
              <small className="vf-preview">
                Vence: <strong>{fmt(vencRecalificacion)}</strong> <span className="vf-hint">(+5 años, automático)</span>
              </small>
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
