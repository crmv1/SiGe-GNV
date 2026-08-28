// src/pages/DashboardPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import VehiculoForm from '../components/VehiculoForm';
import InventoryPage from './InventoryPage';
import {
  getVehiculos, addVehiculo, updateVehiculo,
  deleteVehiculo, dispararRecordatorios, getInventario,
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

function proximoVencimiento(v) {
  const cand = [];
  if (v.fecha_recalificacion) cand.push({ tipo: 'Recalificación', dias: diasRestantes(v.fecha_recalificacion), fecha: v.fecha_recalificacion });
  if (v.fecha_inspeccion)     cand.push({ tipo: 'Inspección',     dias: diasRestantes(v.fecha_inspeccion),     fecha: v.fecha_inspeccion });
  if (!cand.length) return null;
  cand.sort((a, b) => a.dias - b.dias);
  return cand[0];
}

function formatMoney(n) {
  return 'Bs ' + Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================
//  Vista Dashboard (KPIs y accesos rápidos)
// ============================================================
function DashboardView({ user, vehiculos, articulos, goVehiculos, goInventario }) {
  const enRiesgoRecal = vehiculos.filter(v => {
    const d = diasRestantes(v.fecha_recalificacion);
    return d !== null && d <= 30;
  }).length;
  const enRiesgoInsp = vehiculos.filter(v => {
    const d = diasRestantes(v.fecha_inspeccion);
    return d !== null && d <= 30;
  }).length;

  const unidadesStock = articulos.reduce((a, b) => a + Number(b.cantidad || 0), 0);
  const valorInv = articulos.reduce((a, b) => a + Number(b.cantidad || 0) * Number(b.precio_compra || 0), 0);

  const kpis = [
    { icon: '🚗', label: 'Vehículos registrados', value: vehiculos.length, grad: 'kpi-blue',  hint: 'en la base de datos' },
    { icon: '⚠️', label: 'Vencimientos ≤ 30 días', value: enRiesgoRecal + enRiesgoInsp, grad: 'kpi-orange', hint: `recal. ${enRiesgoRecal} · insp. ${enRiesgoInsp}` },
    { icon: '📦', label: 'Artículos en inventario', value: articulos.length, grad: 'kpi-green',  hint: `${unidadesStock} unidades en stock` },
    { icon: '💰', label: 'Valor de inventario', value: formatMoney(valorInv), grad: 'kpi-navy',   hint: 'según precio de compra' },
  ];

  const proximos = vehiculos
    .map(v => ({ v, p: proximoVencimiento(v) }))
    .filter(x => x.p && x.p.dias <= 30)
    .sort((a, b) => a.p.dias - b.p.dias)
    .slice(0, 5);

  const menorStock = [...articulos]
    .sort((a, b) => a.cantidad - b.cantidad)
    .slice(0, 5);

  return (
    <div className="dash-view">
      {/* Banner de bienvenida */}
      <div className="welcome-banner">
        <div className="welcome-txt">
          <h2>¡Hola, {user?.username}! 👋</h2>
          <p>Resumen general del taller VC GAS. Tienes <b>{enRiesgoRecal + enRiesgoInsp}</b> vencimientos por atender en los próximos 30 días.</p>
          <div className="welcome-actions">
            <button className="btn-add" onClick={goVehiculos}>🚗 Gestionar vehículos</button>
            <button className="btn-ghost" onClick={goInventario}>📦 Ver inventario</button>
          </div>
        </div>
        <Logo size={84} withText={false} welcome />
      </div>

      {/* KPI cards */}
      <div className="kpi-grid">
        {kpis.map(k => (
          <div className={`kpi-card ${k.grad}`} key={k.label}>
            <span className="kpi-ico">{k.icon}</span>
            <div className="kpi-body">
              <span className="kpi-label">{k.label}</span>
              <span className="kpi-value">{k.value}</span>
              <span className="kpi-hint">{k.hint}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Listas */}
      <div className="dash-cols">
        <div className="dash-panel">
          <div className="panel-head">
            <h3>⏰ Próximos vencimientos</h3>
            <button className="panel-link" onClick={goVehiculos}>Ver todos →</button>
          </div>
          {proximos.length === 0 ? (
            <p className="panel-empty">Sin vencimientos en los próximos 30 días. 🎉</p>
          ) : (
            <ul className="panel-list">
              {proximos.map(({ v, p }) => (
                <li key={v.id}>
                  <span className="pl-date">
                    <b>{p.dias <= 0 ? 'VENCIDO' : `${p.dias}d`}</b>
                    <small>{formatDate(p.fecha)}</small>
                  </span>
                  <span className="pl-info">
                    <b>{v.placa}</b>
                    <small>{v.apellido}, {v.nombre} · {p.tipo}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dash-panel">
          <div className="panel-head">
            <h3>📦 Repuestos con menor stock</h3>
            <button className="panel-link" onClick={goInventario}>Ver todos →</button>
          </div>
          {menorStock.length === 0 ? (
            <p className="panel-empty">No hay artículos registrados.</p>
          ) : (
            <ul className="panel-list">
              {menorStock.map(a => (
                <li key={a.id}>
                  <span className={`pl-date ${a.cantidad === 0 ? 'pl-zero' : ''}`}>
                    <b>{a.cantidad}</b>
                    <small>unid.</small>
                  </span>
                  <span className="pl-info">
                    <b>{a.nombre}</b>
                    <small>{a.proveedor || 'Sin proveedor'} · {formatMoney(a.precio_venta)}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Página principal
// ============================================================
const NAV = [
  { id: 'dashboard',  icon: '📊', label: 'Dashboard' },
  { id: 'vehiculos',  icon: '🚗', label: 'Vehículos' },
  { id: 'inventario', icon: '📦', label: 'Inventario' },
];

const TITLES = {
  dashboard:  { title: 'Dashboard',         sub: 'Resumen general del taller' },
  vehiculos:  { title: 'Vehículos',         sub: 'Gestión de vehículos y vencimientos' },
  inventario: { title: 'Inventario',        sub: 'Repuestos GNV y control de stock' },
};

export default function DashboardPage() {
  const { user, logout }          = useAuth();
  const [view, setView]           = useState('dashboard');
  const [vehiculos, setVehiculos] = useState([]);
  const [articulos, setArticulos] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState(null);
  const [toast, setToast]         = useState('');
  const [confirm, setConfirm]     = useState(null);

  const isAdmin = user?.rol === 'administrador';

  // ---------- Carga inicial --------------------------------
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [dataVehi, dataInv] = await Promise.allSettled([getVehiculos(), getInventario()]);
      if (dataVehi.status === 'fulfilled') setVehiculos(dataVehi.value.vehiculos);
      else showToast('Error al cargar vehículos: ' + dataVehi.reason.message, 'error');
      if (dataInv.status === 'fulfilled') setArticulos(dataInv.value.articulos);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    dispararRecordatorios().catch(() => {});
  }, [cargar]);

  // ---------- Toast ----------------------------------------
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(''), 3500);
  };

  // ---------- CRUD vehiculos -------------------------------
  const handleAdd = async (form) => {
    await addVehiculo(form);
    showToast('Vehículo registrado correctamente ✔');
    setShowForm(false);
    cargar();
  };

  const handleUpdate = async (form) => {
    await updateVehiculo({ id: editing.id, ...form });
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

  // ---------- Filtro vehiculos -----------------------------
  const filtered = vehiculos.filter(v => {
    const q = search.toLowerCase();
    return (
      v.nombre.toLowerCase().includes(q) ||
      v.apellido.toLowerCase().includes(q) ||
      v.placa.toLowerCase().includes(q) ||
      v.telefono.includes(q)
    );
  });

  const current = TITLES[view] || TITLES.dashboard;

  // ---------- Render ----------------------------------------
  return (
    <div className="app">
      {/* ===== SIDEBAR ===== */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo inverse size={40} sub />
        </div>

        <nav className="sidebar-nav">
          <span className="nav-caption">Menú principal</span>
          {NAV.map(n => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? 'nav-item-active' : ''}`}
              onClick={() => setView(n.id)}
            >
              <span className="nav-ico">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="side-user">
            <span className={`role-badge role-${user?.rol}`}>
              {user?.rol === 'administrador' ? '🛡' : '🔧'}
            </span>
            <span>
              <b>{user?.username}</b>
              <small>{user?.rol === 'administrador' ? 'Administrador' : 'Técnico'}</small>
            </span>
          </div>
          <button className="btn-logout" onClick={logout}>Cerrar sesión</button>
        </div>
      </aside>

      {/* ===== CONTENIDO ===== */}
      <div className="main">
        <header className="topbar">
          <div>
            <h2>{current.title}</h2>
            <p>{current.sub}</p>
          </div>
          <span className={`role-badge role-${user?.rol}`}>
            {user?.rol === 'administrador' ? '🛡 Administrador' : '🔧 Técnico'} · {user?.username}
          </span>
        </header>

        <div className="content">
          {view === 'dashboard' && (
            <DashboardView
              user={user}
              vehiculos={vehiculos}
              articulos={articulos}
              goVehiculos={() => setView('vehiculos')}
              goInventario={() => setView('inventario')}
            />
          )}

          {view === 'vehiculos' && (
            <div className="dash-view">
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
            </div>
          )}

          {view === 'inventario' && <InventoryPage user={user} />}
        </div>
      </div>

      {/* ===== MODAL FORMULARIO VEHÍCULO ===== */}
      {(showForm || editing) && (
        <VehiculoForm
          initial={editing}
          onSubmit={editing ? handleUpdate : handleAdd}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {/* ===== MODAL CONFIRMACIÓN ELIMINAR VEHÍCULO ===== */}
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