// src/pages/DashboardPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import VehiculoForm from '../components/VehiculoForm';
import InventarioPage from './InventarioPage';
import {
  getVehiculos, addVehiculo, updateVehiculo, deleteVehiculo,
} from '../api';
import './DashboardPage.css';

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function diasRestantes(iso) {
  if (!iso) return null;
  const hoy   = new Date(); hoy.setHours(0,0,0,0);
  const fecha = new Date(iso + 'T00:00:00');
  return Math.ceil((fecha - hoy) / 86400000);
}

function BadgeFecha({ iso, label }) {
  const dias = diasRestantes(iso);
  let cls = 'badge-ok';
  if (dias <= 0)  cls = 'badge-vencido';
  else if (dias <= 30) cls = 'badge-critico';
  else if (dias <= 90) cls = 'badge-proximo';

  return (
    <div className="fecha-cell">
      <span>{formatDate(iso)}</span>
      <span className={`badge ${cls}`}>
        {dias <= 0 ? 'Vencido' : `${dias}d`}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const { user, logout }          = useAuth();
  const [vehiculos, setVehiculos] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState(null);   // vehiculo a editar
  const [toast, setToast]         = useState('');
  const [confirm, setConfirm]     = useState(null);   // id a eliminar

  const isAdmin = user?.rol === 'administrador';

  // Que seccion de la aplicacion se esta mostrando. El
  // inventario es una seccion mas de la misma pantalla: no hace
  // falta una ruta nueva ni recargar la pagina.
  const [vista, setVista] = useState('vehiculos');

  // ---------- Carga inicial --------------------------------
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getVehiculos();
      setVehiculos(data.vehiculos);
    } catch (e) {
      showToast('Error al cargar vehículos: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    // Los recordatorios ya no se disparan desde el navegador.
    // Ahora los genera el backend con una tarea programada
    // (src/jobs/recordatorios.job.js) contra MariaDB, y
    // WPConnect los consume por la API.
  }, [cargar]);

  // ---------- Toast ----------------------------------------
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(''), 3500);
  };

  // ---------- CRUD -----------------------------------------
  const handleAdd = async (form) => {
    await addVehiculo(form);
    showToast('Vehículo registrado correctamente ✔');
    setShowForm(false);
    cargar();
  };

  const handleUpdate = async (form) => {
    await updateVehiculo(editing.id, form);
    showToast('Vehículo actualizado correctamente ✔');
    setEditing(null);
    cargar();
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteVehiculo(confirm);
      showToast('Vehículo eliminado ✔');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setConfirm(null);
      cargar();
    }
  };

  // ---------- Filtro ----------------------------------------
  const filtered = vehiculos.filter(v => {
    const q = search.toLowerCase();
    return (
      v.nombre.toLowerCase().includes(q) ||
      v.apellido.toLowerCase().includes(q) ||
      v.placa.toLowerCase().includes(q) ||
      v.telefono.includes(q)
    );
  });

  // ---------- Render ----------------------------------------
  return (
    <div className="dash-wrap">
      {/* ===== NAVBAR ===== */}
      <header className="dash-nav">
        <div className="nav-brand">
          <span className="nav-logo">⛽</span>
          <span className="nav-title">GNV Taller</span>
        </div>
        <div className="nav-right">
          <nav className="nav-secciones">
            <button
              className={vista === 'vehiculos' ? 'nav-seccion nav-seccion-on' : 'nav-seccion'}
              onClick={() => setVista('vehiculos')}
            >
              🚗 Vehículos
            </button>
            <button
              className={vista === 'inventario' ? 'nav-seccion nav-seccion-on' : 'nav-seccion'}
              onClick={() => setVista('inventario')}
            >
              📦 Inventario
            </button>
          </nav>
          <span className={`role-badge role-${user?.rol}`}>
            {user?.rol === 'administrador' ? '🛡 Administrador' : '🔧 Técnico'}
          </span>
          <span className="nav-username">{user?.username}</span>
          <button className="btn-logout" onClick={logout}>Cerrar sesión</button>
        </div>
      </header>

      {/* ===== CONTENIDO ===== */}
      <main className="dash-main">
        {vista === 'inventario' ? (
          <InventarioPage user={user} />
        ) : (
          <>
        {/* Toolbar */}
        <div className="dash-toolbar">
          <div className="toolbar-left">
            <h1 className="dash-heading">Vehículos Registrados</h1>
            <span className="dash-count">{filtered.length} registro(s)</span>
          </div>
          <div className="toolbar-right">
            <input
              className="search-input"
              type="search"
              placeholder="🔍  Buscar por nombre, placa…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button className="btn-add" onClick={() => setShowForm(true)}>
              + Nuevo Vehículo
            </button>
          </div>
        </div>

        {/* Leyenda de colores */}
        <div className="legend">
          <span className="badge badge-vencido">Vencido</span>
          <span className="badge badge-critico">≤ 30 días</span>
          <span className="badge badge-proximo">≤ 90 días</span>
          <span className="badge badge-ok">&gt; 90 días</span>
        </div>

        {/* Tabla */}
        <div className="table-wrap">
          {loading ? (
            <div className="table-loading">Cargando…</div>
          ) : (
            <table className="vehiculos-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Propietario</th>
                  <th>Placa</th>
                  <th>Recalificación</th>
                  <th>Inspección</th>
                  <th>Teléfono</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-empty">
                      No hay vehículos que coincidan.
                    </td>
                  </tr>
                ) : (
                  filtered.map((v, i) => (
                    <tr key={v.id} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
                      <td className="td-num">{i + 1}</td>
                      <td className="td-nombre">
                        <strong>{v.apellido}</strong>, {v.nombre}
                      </td>
                      <td><span className="placa-chip">{v.placa}</span></td>
                      <td><BadgeFecha iso={v.fecha_recalificacion} /></td>
                      <td><BadgeFecha iso={v.fecha_inspeccion} /></td>
                      <td className="td-phone">
                        <a href={`https://wa.me/${v.telefono.replace(/[^0-9]/g,'')}`}
                           target="_blank" rel="noopener noreferrer">
                          📱 {v.telefono}
                        </a>
                      </td>
                      <td className="td-actions">
                        <button
                          className="btn-edit"
                          onClick={() => setEditing(v)}
                          title="Editar">
                          ✏️ Editar
                        </button>
                        {isAdmin && (
                          <button
                            className="btn-delete"
                            onClick={() => setConfirm(v.id)}
                            title="Eliminar">
                            🗑 Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
          </>
        )}
      </main>

      {/* ===== MODAL FORMULARIO ===== */}
      {(showForm || editing) && (
        <VehiculoForm
          initial={editing}
          onSubmit={editing ? handleUpdate : handleAdd}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {/* ===== MODAL CONFIRMACIÓN ELIMINAR ===== */}
      {confirm && (
        <div className="confirm-overlay" onClick={() => setConfirm(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <p>⚠️ ¿Eliminar este vehículo? Esta acción no se puede deshacer.</p>
            <div className="confirm-actions">
              <button className="btn-cancel-confirm" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
              <button className="btn-delete-confirm" onClick={handleDeleteConfirm}>
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== TOAST ===== */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
