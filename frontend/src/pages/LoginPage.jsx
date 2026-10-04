// src/pages/LoginPage.jsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { login as apiLogin } from '../api';
import './LoginPage.css';

export default function LoginPage({ onActivar }) {
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
      // El backend devuelve { user, token }. El token se guarda solo.
      login(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">
      {/* Decoración de fondo */}
      <div className="login-bubble login-bubble--1" />
      <div className="login-bubble login-bubble--2" />

      <div className="login-card">
        {/* Logo / Encabezado */}
        <div className="login-header">
          <div className="login-icon">⛽</div>
          <h1 className="login-title">GNV Taller</h1>
          <p className="login-subtitle">Sistema de Gestión Vehicular</p>
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
            {loading ? 'Verificando…' : 'Ingresar'}
          </button>
        </form>

        {/* El cliente que todavia no tiene cuenta entra por aqui. */}
        {onActivar && (
          <p className="login-footer">
            ¿El taller te dio un código?{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); onActivar(); }}>
              Activa tu cuenta
            </a>
          </p>
        )}

        <p className="login-footer">
          Taller de Gas Natural Vehicular · v1.0
        </p>
      </div>
    </div>
  );
}
