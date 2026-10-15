// src/pages/Agenda/AgendaPage.jsx
// Agenda del taller: calendario semanal, estados de proceso de
// recalificación y alta de citas de mostrador (walk-in).
//
// El mapa de estados y de transiciones viene del backend en cada
// listado, así que la web no reimplementa las reglas: pinta solo
// los botones que el servidor autoriza y el backend valida igual
// al hacer PATCH /citas/:id/estado.
import { useState, useEffect, useCallback } from 'react';
import {
  getCitas, getClientesAgenda, getVehiculos,
  crearCita, cambiarEstadoCita,
} from '../../api';
import './AgendaPage.css';

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function fechaLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sumarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const fecha = new Date(y, m - 1, d + n);
  return fechaLocalISO(fecha);
}

function fechaLegible(iso) {
  const [y, m, d] = iso.split('-');
  const fecha = new Date(y, m - 1, d);
  return `${DIAS_SEMANA[fecha.getDay()]} ${d}/${m}/${y}`;
}

function BadgeEstado({ info }) {
  if (!info) return <span className="badge-estado badge-estado-default">—</span>;
  return (
    <span
      className="badge-estado"
      style={{ background: info.color || '#6b7280' }}
    >
      {info.etiqueta}
    </span>
  );
}

// Modal para crear una cita de mostrador (walk-in).
function ModalCita({ onCreada, onCancelar }) {
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [vehiculos, setVehiculos] = useState([]);
  const [vehiculoId, setVehiculoId] = useState('');
  const [tipoVeh, setTipoVeh] = useState('privado');
  const [fecha, setFecha] = useState(fechaLocalISO(new Date()));
  const [hora, setHora] = useState('09:00');
  const [tecnico, setTecnico] = useState('');
  const [obs, setObs] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getClientesAgenda().then(r => setClientes(r.clientes || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clienteId) { setVehiculos([]); setVehiculoId(''); return; }
    getVehiculos(clienteId).then(r => setVehiculos(r.vehiculos || [])).catch(() => {});
  }, [clienteId]);

  const enviar = async () => {
    setError('');
    if (!clienteId || !vehiculoId || !fecha || !hora) {
      setError('Faltan datos: cliente, vehículo, fecha y hora.'); return;
    }
    setCargando(true);
    try {
      await crearCita({
        cliente_id: Number(clienteId),
        vehiculo_id: Number(vehiculoId),
        tipo_servicio: 'recalificacion',
        tipo_vehiculo: tipoVeh,
        fecha,
        hora_inicio: hora,
        tecnico_id: tecnico ? Number(tecnico) : undefined,
        observaciones: obs || undefined,
      });
      onCreada();
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Nueva cita de mostrador</h3>
        {error && <div className="modal-error">{error}</div>}

        <label>Cliente</label>
        <select value={clienteId} onChange={e => setClienteId(e.target.value)}>
          <option value="">— Seleccionar —</option>
          {clientes.map(c => (
            <option key={c.id} value={c.id}>
              {c.nombre} {c.apellido} · {c.telefono}
            </option>
          ))}
        </select>

        <label>Vehículo</label>
        <select value={vehiculoId} onChange={e => setVehiculoId(e.target.value)} disabled={!clienteId}>
          <option value="">— Seleccionar —</option>
          {vehiculos.map(v => (
            <option key={v.id} value={v.id}>{v.placa}</option>
          ))}
        </select>

        <label>Tipo de vehículo</label>
        <select value={tipoVeh} onChange={e => setTipoVeh(e.target.value)}>
          <option value="privado">Privado</option>
          <option value="publico">Público</option>
        </select>

        <div className="modal-row">
          <div className="modal-col">
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div className="modal-col">
            <label>Hora</label>
            <input type="time" value={hora} onChange={e => setHora(e.target.value)} />
          </div>
        </div>

        <label>Observaciones (opcional)</label>
        <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} />

        <div className="modal-actions">
          <button className="btn-cancelar" onClick={onCancelar}>Cancelar</button>
          <button className="btn-guardar" onClick={enviar} disabled={cargando}>
            {cargando ? 'Guardando…' : 'Crear cita'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AgendaPage() {
  const hoy = fechaLocalISO(new Date());
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(sumarDias(hoy, 7));
  const [citas, setCitas] = useState([]);
  const [estados, setEstados] = useState({});
  const [transiciones, setTransiciones] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(false);
  const [citaAbierta, setCitaAbierta] = useState(null); // id de cita con panel de acciones

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const r = await getCitas({ desde, hasta });
      setCitas(r.citas || []);
      setEstados(r.estados || {});
      setTransiciones(r.transiciones || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const showToast = (msg, tipo = 'success') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(''), 3500);
  };

  const avanzarEstado = async (citaId, nuevoEstado) => {
    try {
      await cambiarEstadoCita(citaId, { estado: nuevoEstado });
      showToast('Estado actualizado ✔');
      setCitaAbierta(null);
      cargar();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // Agrupa las citas por fecha para pintar el calendario.
  const porFecha = {};
  for (const c of citas) {
    if (!porFecha[c.fecha]) porFecha[c.fecha] = [];
    porFecha[c.fecha].push(c);
  }
  const fechasOrdenadas = Object.keys(porFecha).sort();

  return (
    <div className="agenda-wrap">
      {/* Toolbar */}
      <div className="agenda-toolbar">
        <h2>Agenda / Citas</h2>
        <div className="agenda-filtros">
          <label>Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
          <button className="btn-agendar" onClick={() => setModal(true)}>
            + Nueva cita (mostrador)
          </button>
        </div>
      </div>

      {error && <div className="agenda-error">{error}</div>}

      {cargando ? (
        <div className="agenda-loading">Cargando agenda…</div>
      ) : fechasOrdenadas.length === 0 ? (
        <div className="agenda-vacio">No hay citas en ese rango de fechas.</div>
      ) : (
        fechasOrdenadas.map(fecha => (
          <div key={fecha} className="agenda-dia">
            <div className="dia-header">
              <span className="dia-fecha">{fechaLegible(fecha)}</span>
              <span className="dia-count">{porFecha[fecha].length} cita(s)</span>
            </div>
            {porFecha[fecha].map(c => {
              const info = estados[c.estado];
              const accs = transiciones[c.estado] || [];
              const abierto = citaAbierta === c.id;
              return (
                <div key={c.id} className={`cita-card ${abierto ? 'cita-card-abierto' : ''}`}>
                  <div className="cita-main">
                    <span className="cita-hora">{c.hora_inicio?.slice(0, 5)}</span>
                    <div className="cita-datos">
                      <strong>{c.nombre} {c.apellido}</strong>
                      <span className="cita-placa">{c.placa}</span>
                      {c.tipo_vehiculo && (
                        <span className={`cita-tipo cita-tipo-${c.tipo_vehiculo}`}>
                          {c.tipo_vehiculo === 'publico' ? 'Público' : 'Privado'}
                        </span>
                      )}
                      <span className="cita-servicio">{c.tipo_servicio}</span>
                    </div>
                    <div className="cita-estado">
                      <BadgeEstado info={info} />
                    </div>
                    <div className="cita-acciones">
                      {accs.length > 0 && (
                        <button
                          className="btn-acciones"
                          onClick={() => setCitaAbierta(abierto ? null : c.id)}
                        >
                          {abierto ? 'Cerrar' : 'Acciones'}
                        </button>
                      )}
                    </div>
                  </div>
                  {abierto && accs.length > 0 && (
                    <div className="cita-panel">
                      <span className="panel-label">Avanzar a:</span>
                      {accs.map(dest => (
                        <button
                          key={dest}
                          className="btn-estado"
                          style={{ background: estados[dest]?.color || '#6b7280' }}
                          onClick={() => avanzarEstado(c.id, dest)}
                        >
                          {estados[dest]?.etiqueta || dest}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}

      {modal && (
        <ModalCita
          onCreada={() => { setModal(false); showToast('Cita creada ✔'); cargar(); }}
          onCancelar={() => setModal(false)}
        />
      )}

      {toast && <div className={`agenda-toast agenda-toast-${toast.tipo}`}>{toast.msg}</div>}
    </div>
  );
}
