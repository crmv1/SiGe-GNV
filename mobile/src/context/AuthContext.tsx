import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as authService from '../services/authService';
import * as notificationService from '../services/notificationService';
import { guardarSesion, getToken, getUsuarioGuardado, limpiarSesion } from '../storage/secureStorage';
import type { Usuario } from '../types/auth';
import { normalizarError } from '../services/api';

interface AuthContextValue {
  usuario: Usuario | null;
  inicializando: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  activar: (username: string, codigo: string, password: string) => Promise<void>;
  registrarDispositivo: () => Promise<{ registrado: boolean }>;
  desactivarPush: () => Promise<{ desactivados: number }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Si la sesion guardada resulta invalida (401), se borra y se
// vuelve a la pantalla publica. Los demas errores de red no
// cierran sesion: la app sigue mostrando lo que tenia.
async function refrescarPerfil(usuario: Usuario): Promise<Usuario> {
  try {
    const perfil = await authService.getMe();
    await guardarSesion({ token: (await getToken()) ?? '', user: perfil });
    return perfil;
  } catch (err) {
    const e = normalizarError(err);
    if (e.status === 401) {
      await limpiarSesion();
      throw e;
    }
    return usuario;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [inicializando, setInicializando] = useState(true);

  useEffect(() => {
    let activo = true;
    (async () => {
      const [token, user] = await Promise.all([getToken(), getUsuarioGuardado()]);
      if (!activo) return;
      if (token && user) {
        // El refresco del perfil falla sin conexion: se conserva el
        // usuario guardado. Solo un 401 borra la sesion.
        refrescarPerfil(user)
          .then((perfil) => {
            if (activo) setUsuario(perfil);
          })
          .catch(() => {
            if (activo) setUsuario(null);
          });
      }
      setInicializando(false);
    })();
    return () => {
      activo = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const respuesta = await authService.login(username.trim(), password);
    await guardarSesion({ token: respuesta.token, user: respuesta.user });
    setUsuario(respuesta.user);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    await limpiarSesion();
    setUsuario(null);
  }, []);

  const activar = useCallback(async (username: string, codigo: string, password: string) => {
    const respuesta = await authService.activar({
      username: username.trim(),
      codigo: codigo.trim(),
      password,
    });
    await guardarSesion({ token: respuesta.token, user: respuesta.user });
    setUsuario(respuesta.user);
  }, []);

  const registrarDispositivo = useCallback(async (): Promise<{ registrado: boolean }> => {
    if (!usuario) return { registrado: false };
    // En Expo Go el push remoto no existe (SDK 53+). Se corta aqui
    // para no invocar ninguna funcion de notificaciones remotas.
    if (!notificationService.pushRemotoDisponible()) return { registrado: false };
    try {
      return await notificationService.registrarDispositivo();
    } catch {
      return { registrado: false };
    }
  }, [usuario]);

  const desactivarPush = useCallback(async () => {
    try {
      return await notificationService.desactivarDispositivos();
    } catch {
      return { desactivados: 0 };
    }
  }, []);

  const value = useMemo(
    () => ({ usuario, inicializando, login, logout, activar, registrarDispositivo, desactivarPush }),
    [usuario, inicializando, login, logout, activar, registrarDispositivo, desactivarPush]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}