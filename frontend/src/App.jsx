// src/App.jsx
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage     from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

function AppRoutes() {
  const { user, loading } = useAuth();

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

  return user ? <DashboardPage /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
