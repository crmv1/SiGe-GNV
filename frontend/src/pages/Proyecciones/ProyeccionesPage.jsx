// src/pages/Proyecciones/ProyeccionesPage.jsx
// Proyección mensual de recalificaciones, inspecciones y
// conversiones, con alerta de saturación de capacidad.
//
// Los gráficos son barras CSS: sin librerías de charts, sin
// canvas, sin SVG. Cada barra es un div de altura proporcional al
// valor máximo de la serie. Con 12 meses de datos alcanza para
// leer la tendencia de un vistazo.
import { useState, useEffect } from 'react';
import { getPredicciones } from '../../api';
import './ProyeccionesPage.css';

function Serie({ titulo, color, meses, campo }) {
  const max = Math.max(...meses.map(m => m[campo] || 0), 1);
  return (
    <div className="serie">
      <div className="serie-titulo">{titulo}</div>
      <div className="serie-barras">
        {meses.map(m => (
          <div key={m.iso} className="serie-col">
            <div className="serie-valor">{m[campo] ?? 0}</div>
            <div
              className="serie-barra"
              style={{ height: `${((m[campo] || 0) / max) * 100}%`, background: color }}
            />
            <div className="serie-mes">{m.etiqueta}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProyeccionesPage() {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mesesSel, setMesesSel] = useState(12);

  useEffect(() => {
    setCargando(true); setError('');
    getPredicciones(mesesSel)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setCargando(false));
  }, [mesesSel]);

  return (
    <div className="proj-wrap">
      <div className="proj-toolbar">
        <h2>Proyecciones</h2>
        <select value={mesesSel} onChange={e => setMesesSel(Number(e.target.value))}>
          <option value={6}>6 meses</option>
          <option value={12}>12 meses</option>
          <option value={24}>24 meses</option>
        </select>
      </div>

      {error && <div className="proj-error">{error}</div>}
      {cargando && <div className="proj-loading">Cargando proyección…</div>}

      {data && (
        <>
          {/* Resumen */}
          <div className="proj-resumen">
            <div className="proj-card">
              <div className="proj-num">{data.resumen.total_recalificaciones}</div>
              <div className="proj-lbl">Recalificaciones</div>
            </div>
            <div className="proj-card">
              <div className="proj-num">{data.resumen.total_inspecciones}</div>
              <div className="proj-lbl">Inspecciones</div>
            </div>
            <div className="proj-card">
              <div className="proj-num">{data.resumen.total_conversiones}</div>
              <div className="proj-lbl">Conversiones</div>
            </div>
            <div className="proj-card">
              <div className="proj-num">{data.resumen.trimestre.recalificaciones}</div>
              <div className="proj-lbl">Recalif. (3 meses)</div>
            </div>
          </div>

          {/* Alerta de saturación */}
          {data.resumen.meses_saturados.length > 0 && (
            <div className="proj-alerta">
              ⚠️ Meses con demanda superior a la capacidad:{' '}
              {data.resumen.meses_saturados.join(', ')}
            </div>
          )}

          {/* Gráficos */}
          <Serie titulo="Recalificaciones" color="#2563eb" meses={data.meses} campo="recalificaciones" />
          <Serie titulo="Conversiones (altas)" color="#059669" meses={data.meses} campo="conversiones" />

          {/* Modelo de conversiones */}
          <div className="proj-modelo">
            <h3>Modelo de conversiones (regresión lineal ponderada)</h3>
            <p className="proj-formula">
              y = {data.conversiones_modelo.corte} + ({data.conversiones_modelo.pendiente})·x
            </p>
            <p>{data.conversiones_modelo.descripcion}</p>

            <div className="proj-metricas">
              <div className="proj-metrica">
                <span className="proj-metrica-num">{data.conversiones_modelo.r2}</span>
                <span className="proj-metrica-lbl">R²</span>
              </div>
              <div className="proj-metrica">
                <span className="proj-metrica-num">{data.conversiones_modelo.error_estandar}</span>
                <span className="proj-metrica-lbl">Error estándar</span>
              </div>
              <div className="proj-metrica">
                <span className="proj-metrica-num">{data.conversiones_modelo.meses_historia}</span>
                <span className="proj-metrica-lbl">Meses historia</span>
              </div>
              <div className="proj-metrica">
                <span className="proj-metrica-num">{data.conversiones_modelo.lambda_ponderacion}</span>
                <span className="proj-metrica-lbl">λ (pesos)</span>
              </div>
              <div className="proj-metrica">
                <span className={`proj-metrica-num proj-conf-${data.conversiones_modelo.confiabilidad}`}>
                  {data.conversiones_modelo.confiabilidad}
                </span>
                <span className="proj-metrica-lbl">Confiabilidad</span>
              </div>
              <div className="proj-metrica">
                <span className="proj-metrica-num">
                  {data.conversiones_modelo.estacionalidad_detectada ? 'Sí' : 'No'}
                </span>
                <span className="proj-metrica-lbl">Estacionalidad</span>
              </div>
            </div>

            <p className="proj-modelo-meta">
              Intervalo de confianza: {data.conversiones_modelo.intervalo_confianza}
            </p>

            {data.conversiones_modelo.indices_estacionales && (
              <div className="proj-estacional">
                <h4>Índices estacionales</h4>
                <div className="proj-estacional-grid">
                  {Object.entries(data.conversiones_modelo.indices_estacionales).map(([mes, idx]) => (
                    <div key={mes} className="proj-estacional-item">
                      <span>{mes}</span>
                      <strong>{idx}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Ingresos */}
          {data.ingresos ? (
            <div className="proj-ingresos">
              <h3>Ingresos estimados (recalificaciones × ${data.ingresos.precio} {data.ingresos.moneda})</h3>
              <ul>
                {data.ingresos.estimacion.map(e => (
                  <li key={e.iso}>
                    <span>{e.etiqueta}</span>
                    <strong>{e.ingreso?.toLocaleString() ?? '—'}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="proj-sin-precio">
              Sin precio de recalificación configurado en parámetros.
            </div>
          )}
        </>
      )}
    </div>
  );
}
