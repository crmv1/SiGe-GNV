// src/pages/LoginPage.jsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { login as apiLogin } from '../api';
import Logo from '../components/Logo';
import './LoginPage.css';

const BRAND_FEATURES = [
  { icon: '🚗', title: 'Gestión de vehículos',   desc: 'Clientes, placas y vencimientos de GNV.' },
  { icon: '📲', title: 'Recordatorios WhatsApp',  desc: 'Avisos automáticos de recalificación e inspección.' },
  { icon: '📦', title: 'Inventario de repuestos', desc: 'Stock, precios y movimientos controlados.' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm]       = useState({ username: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiLogin(form);
      login(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* ===== Panel de marca ===== */}
      <aside className="login-brand">
        <div className="login-bubble login-bubble--1" />
        <div className="login-bubble login-bubble--2" />
        <div className="login-bubble login-bubble--3" />

        <div className="login-brand-inner">
          <Logo inverse size={64} sub welcome />

          <div className="login-brand-txt">
            <h1>VC GAS</h1>
            <p>El sistema de gestión integral de tu taller de Gas Natural Vehicular.</p>
          </div>

          <ul className="login-features">
            {BRAND_FEATURES.map(f => (
              <li key={f.title}>
                <span className="lf-ico">{f.icon}</span>
                <span>
                  <strong>{f.title}</strong>
                  <small>{f.desc}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* ===== Formulario ===== */}
      <main className="login-form-side">
        <div className="login-card">
          <div className="login-card-head">
            <Logo size={46} />
            <h2>Bienvenido de nuevo</h2>
            <p>Ingresa tus credenciales para acceder al panel.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="field-group">
              <label htmlFor="username">Usuario</label>
              <input
                id="username"
                name="username"
                type="text"
                placeholder="Ingresa tu usuario"
                value={form.username}
                onChange={handleChange}
                autoComplete="username"
                required
              />
            </div>

            <div className="field-group">
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                required
              />
            </div>

            {error && <p className="login-error">⚠ {error}</p>}

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? (
                <span className="btn-login-loader" />
              ) : (
                'Ingresar al sistema'
              )}
            </button>
          </form>

          <p className="login-footer">
            Taller VC GAS · Sistema de Gestión · v1.1
          </p>
        </div>
      </main>
    </div>
  );
}