// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { verificarSesion, logout as apiLogout } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);   // { id, username, rol }
  const [loading, setLoading] = useState(true);

  // Al montar, verificar si hay sesión activa en el servidor
  useEffect(() => {
    verificarSesion()
      .then(data => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = (userData) => setUser(userData);

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
