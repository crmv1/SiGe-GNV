// src/pages/ActivarCuentaPage.jsx
//
// Pantalla para el cliente que todavia NO tiene cuenta. El taller
// le entrega un codigo en mano; aqui lo canjea por un usuario y una
// contrasena, y el backend liga esa cuenta a su ficha de cliente.
//
// No se pide ningun dato personal (nombre, celular, placa): esos ya
// estan en la base. El codigo es lo unico que el cliente aporta, y
// por eso la pantalla tiene solo tres campos.
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { activarCuenta } from '../api';
import './LoginPage.css';

// El backend exige esto; se avisa en pantalla en vez de dejar que
// el error llegue al final. `pattern` cubre el caso comun (5-5),
// pero el codigo real usa 5-5 con caracteres alfanumericos.
const REGLAS = {
  usuario: {
    min: 4,
    test: (v) => /^[a-z0-9._-]+$/.test(v),
    ayuda: 'Minimo 4 caracteres. Solo letras, numeros, punto, guion y guion bajo.',
  },
  password: {
    min: 8,
    test: (v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v),
    ayuda: 'Minimo 8 caracteres, con al menos una letra y un numero.',
  },
  codigo: {
    min: 8,
    // El servidor lo normaliza (quita guiones, mayusculas), asi que
    // aqui se acepta el guion opcional. Se valida la forma, no el
    // valor: el unico que sabe si el codigo existe es el servidor.
    test: (v) => /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/,
    ayuda: 'Son 10 caracteres, con un guion en el medio. Ej: A1B2C-D3E4F',
  },
};

function Reviso({ campo, valor, onChange, autoComplete }) {
  const regla = REGLAS[campo];
  const vacio = !valor.trim();
  const bien = !vacio && valor.length >= regla.min && regla.test(valor);

  return (
    <div className="field-group">
      <label htmlFor={campo}>
        {campo === 'password' ? 'Contraseña' : campo === 'codigo' ? 'Código del taller' : 'Usuario'}
      </label>
      <input
        id={campo}
        name={campo}
        type={campo === 'password' ? 'password' : 'text'}
        placeholder={campo === 'codigo' ? 'A1B2C-D3E4F' : '••••••••'}
        value={valor}
        onChange={onChange}
        autoComplete={autoComplete}
        required
      />
      {/* Solo se muestra el error cuando el campo ya se toco: una
          pantalla que acusa desde el primer clic cansa. */}
      {!vacio && !bien && <p className="login-error">⚠ {regla.ayuda}</p>}
    </div>
  );
}

export default function ActivarCuentaPage({ onVolver }) {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', password: '', codigo: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Se valida aqui lo que se puede, para no gastar un intento del
    // freno de la API con algo que se ve en la propia pantalla.
    for (const campo of Object.keys(REGLAS)) {
      const v = form[campo].trim();
      if (v.length < REGLAS[campo].min || !REGLAS[campo].test(v)) {
        setError(REGLAS[campo].ayuda);
        return;
      }
    }

    setLoading(true);
    try {
      // El backend responde { user, token } igual que el login, asi
      // que la sesion queda abierta y no hay que volver a entrar.
      const data = await activarCuenta({
        username: form.username.trim(),
        password: form.password,
        codigo: form.codigo.trim().toUpperCase(),
      });
      login(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">
      <div className="login-bubble login-bubble--1" />
      <div className="login-bubble login-bubble--2" />

      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">🔑</div>
          <h1 className="login-title">Activar mi cuenta</h1>
          <p className="login-subtitle">Usa el código que te dio el taller</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <Reviso campo="codigo"    valor={form.codigo}    onChange={handleChange} autoComplete="one-time-code" />
          <Reviso campo="username"  valor={form.username}  onChange={handleChange} autoComplete="username" />
          <Reviso campo="password"  valor={form.password}  onChange={handleChange} autoComplete="new-password" />

          {error && <p className="login-error">⚠ {error}</p>}

          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? 'Activando…' : 'Activar cuenta'}
          </button>

          <p className="login-footer">
            ¿Ya tienes cuenta?{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); onVolver(); }}>Ingresa aquí</a>
          </p>
        </form>
      </div>
    </div>
  );
}
