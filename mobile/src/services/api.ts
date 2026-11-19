import axios from 'axios';
import { API_URL } from '../config';
import { getToken } from '../storage/secureStorage';

// Cliente HTTP unico de la app. El token JWT se agrega en cada
// peticion desde SecureStore (nunca en claro ni en codigo). Los
// errores se normalizan en espanol con status para que las
// pantallas puedan decidir (401 = creo que la sesion expiro, etc.).

export const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const MENSAJES: Record<number, string> = {
  400: 'La solicitud es inválida. Revisa los datos e intenta de nuevo.',
  401: 'Tu sesión expiró o las credenciales son incorrectas. Vuelve a iniciar sesión.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'No se encontró lo que buscabas.',
  429: 'Demasiados intentos. Espera unos minutos y vuelve a intentar.',
  500: 'Error interno del servidor. Intenta de nuevo más tarde.',
};

export function normalizarError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    const body = err.response?.data as
      | { message?: string; error?: string; code?: string }
      | undefined;
    const mensaje =
      body?.message ||
      body?.error ||
      MENSAJES[status] ||
      (status === 0
        ? 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
        : 'Ocurrió un error inesperado. Intenta de nuevo.');
    return new ApiError(status, mensaje, body?.code);
  }

  if (err instanceof Error) return new ApiError(0, err.message);
  return new ApiError(0, 'Ocurrió un error inesperado.');
}