// src/App.jsx
import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage        from './pages/LoginPage';
import ActivarCuentaPage from './pages/ActivarCuentaPage';
import DashboardPage    from './pages/DashboardPage';

function AppRoutes() {
  const { user, loading } = useAuth();
  // No es una ruta con URL: es la segunda pantalla del bloque de
  // entrada. Se resuelve con estado porque la app no tiene router y
  // el caso es "estoy en el login y elijo activar", no "comparto
  // un enlace a activar".
  const [viendoActivacion, setViendoActivacion] = useState(false);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif', color: '#6b7280', fontSize: '1rem',
      }}>
        ⏳ Cargando…
      </div>
    );
  }

  if (user) return <DashboardPage />;

  return viendoActivacion
    ? <ActivarCuentaPage onVolver={() => setViendoActivacion(false)} />
    : <LoginPage onActivar={() => setViendoActivacion(true)} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
