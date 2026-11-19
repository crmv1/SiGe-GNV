// src/pages/Cuentas/CuentasPage.jsx
// Gestión de cuentas de cliente desde la web del taller.
//
// Dos secciones:
//   1. Lista de usuarios de la app móvil (rol cliente) con su ficha
//      y vehículos — para que el admin vea quién tiene cuenta y qué
//      placas le corresponden.
//   2. Generación de códigos de activación — el taller emite un
//      código para un teléfono, puede mandarlo por WhatsApp, y el
//      código se muestra una sola vez en pantalla.
import { useState, useEffect } from 'react';
import { crearCodigo, getUsuariosClientes } from '../../api';
import './CuentasPage.css';

export default function CuentasPage() {
  // --- Lista de usuarios ---
  const [usuarios, setUsuarios] = useState([]);
  const [cargandoUsu, setCargandoUsu] = useState(true);
  const [errorUsu, setErrorUsu] = useState('');

  // --- Generar código ---
  const [telefono, setTelefono] = useState('');
  const [enviarWa, setEnviarWa] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');

  const cargarUsuarios = async () => {
    setCargandoUsu(true);
    setErrorUsu('');
    try {
      const r = await getUsuariosClientes();
      setUsuarios(r.usuarios || []);
    } catch (e) {
      setErrorUsu(e.message);
    } finally {
      setCargandoUsu(false);
    }
  };

  useEffect(() => { cargarUsuarios(); }, []);

  const emitir = async () => {
    setError(''); setResultado(null);
    if (!telefono.trim()) { setError('Escribe el teléfono del cliente.'); return; }
    setCargando(true);
    try {
      const r = await crearCodigo({
        telefono: telefono.trim(),
        enviar_whatsapp: enviarWa,
      });
      setResultado(r);
      setTelefono('');
      // Refrescar la lista por si el cliente quedó activado.
      cargarUsuarios();
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="cuentas-wrap">
      <h2>Cuentas de cliente</h2>
      <p className="cuentas-sub">
        Usuarios de la app móvil y generación de códigos de activación.
      </p>

      {/* ===== 1. Lista de usuarios de la app ===== */}
      <div className="cuentas-seccion">
        <div className="cuentas-seccion-header">
          <h3>Usuarios de la app móvil</h3>
          <span className="cuentas-count">{usuarios.length} usuario(s)</span>
        </div>

        {cargandoUsu && <div className="cuentas-loading">Cargando…</div>}
        {errorUsu && <div className="cuentas-error">{errorUsu}</div>}

        {!cargandoUsu && !errorUsu && usuarios.length === 0 && (
          <div className="cuentas-vacio">
            No hay usuarios con cuenta de cliente todavía.
          </div>
        )}

        {usuarios.length > 0 && (
          <div className="cuentas-tabla-wrap">
            <table className="cuentas-tabla">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Cliente</th>
                  <th>Teléfono</th>
                  <th>Vehículos (placa)</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.usuario_id}>
                    <td><code className="cuentas-user">{u.username}</code></td>
                    <td>
                      {u.cliente
                        ? <>{u.cliente.nombre} {u.cliente.apellido}</>
                        : <span className="cuentas-sin-vincular">Sin vincular</span>}
                    </td>
                    <td>{u.cliente?.telefono || '—'}</td>
                    <td>
                      {u.vehiculos.length === 0 ? (
                        <span className="cuentas-sin-vincular">—</span>
                      ) : (
                        <div className="cuentas-placas">
                          {u.vehiculos.map((v) => (
                            <span
                              key={v.id}
                              className={`cuentas-placa ${v.tipo_vehiculo === 'publico' ? 'placa-publico' : 'placa-privado'}`}
                              title={v.tipo_vehiculo === 'publico' ? 'Público' : 'Privado'}
                            >
                              {v.placa}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`cuentas-estado ${u.estado === 'activo' ? 'estado-activo' : 'estado-inactivo'}`}>
                        {u.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== 2. Generar código ===== */}
      <div className="cuentas-seccion">
        <h3>Generar código de activación</h3>
        <p className="cuentas-nota-seccion">
          El cliente usa el código junto con el usuario y contraseña que quiera
          para registrarse en la app. Se muestra una sola vez.
        </p>

        <div className="cuentas-form">
          <label>Teléfono del cliente</label>
          <div className="cuentas-row">
            <input
              type="tel"
              placeholder="Ej: 71234567"
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
            />
            <label className="cuentas-check">
              <input
                type="checkbox"
                checked={enviarWa}
                onChange={e => setEnviarWa(e.target.checked)}
              />
              Enviar por WhatsApp
            </label>
            <button className="btn-emitir" onClick={emitir} disabled={cargando}>
              {cargando ? 'Generando…' : 'Generar código'}
            </button>
          </div>
        </div>

        {error && <div className="cuentas-error">{error}</div>}

        {resultado && (
          <div className="cuentas-resultado">
            <h3>Código generado</h3>
            <div className="cuentas-codigo">{resultado.codigo}</div>
            <p className="cuentas-cliente">
              Cliente: <strong>{resultado.cliente?.nombre} {resultado.cliente?.apellido}</strong>
              {' · '}Tel: {resultado.telefono}
            </p>
            <p className="cuentas-nota">
              {resultado.encolado_whatsapp
                ? '📱 Enviado por WhatsApp (en cola). También se muestra abajo: es la única vez que aparece.'
                : '⚠️ Anota o dicta el código ahora: no se volverá a mostrar.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
