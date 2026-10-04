// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  verificarSesion,
  logout as apiLogout,
  setToken,
  getToken,
} from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Al montar, comprobar si el token guardado sigue siendo valido.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }

    verificarSesion()
      .then((data) => setUser(data.user))
      .catch(() => {
        // Token vencido o invalido: se limpia para no reintentarlo.
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // El backend devuelve el token en la respuesta del login.
  const login = useCallback((userData, token) => {
    setToken(token);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
