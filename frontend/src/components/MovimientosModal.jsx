// src/components/MovimientosModal.jsx
import { useState, useEffect } from 'react';
import { getMovimientos } from '../api';
import './MovimientosModal.css';

export default function MovimientosModal({ articulo, onClose }) {
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');

  useEffect(() => {
    let alive = true;
    getMovimientos(articulo.id)
      .then(data => alive && setMovimientos(data.movimientos))
      .catch(err => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [articulo.id]);

  const totalEntradas = movimientos
    .filter(m => m.tipo === 'entrada')
    .reduce((acc, m) => acc + Number(m.cantidad), 0);
  const totalSalidas = movimientos
    .filter(m => m.tipo === 'salida')
    .reduce((acc, m) => acc + Number(m.cantidad), 0);

  return (
    <div className="vf-overlay mov-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mov-modal">
        <div className="vf-header">
          <div>
            <h2>📋 Historial — {articulo.nombre}</h2>
            <p className="mov-sub">
              Stock actual: <b>{articulo.cantidad}</b> · Entradas: {totalEntradas} · Salidas: {totalSalidas}
            </p>
          </div>
          <button className="vf-close" onClick={onClose}>✕</button>
        </div>

        <div className="mov-body">
          {loading ? (
            <div className="mov-empty">Cargando…</div>
          ) : error ? (
            <div className="mov-empty mov-error">{error}</div>
          ) : movimientos.length === 0 ? (
            <div className="mov-empty">Sin movimientos registrados.</div>
          ) : (
            <table className="mov-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map(m => (
                  <tr key={m.id}>
                    <td>{m.fecha}</td>
                    <td>
                      <span className={`mov-badge mov-badge-${m.tipo}`}>
                        {m.tipo === 'entrada' ? '➕ Entrada' : '➖ Salida'}
                      </span>
                    </td>
                    <td className="mov-cant">{m.cantidad}</td>
                    <td>{m.usuario}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mov-footer">
          <button className="btn-cancel" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}