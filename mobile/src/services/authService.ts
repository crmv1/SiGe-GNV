import { USE_MOCK_DATA } from '../config';
import type { ActivarResponse, DatosActivacion, LoginResponse, Usuario } from '../types/auth';
import { api, normalizarError } from './api';
import { mockActivar, mockLogin } from './mock';

export async function login(username: string, password: string): Promise<LoginResponse> {
  if (USE_MOCK_DATA) return mockLogin(username, password);
  try {
    const { data } = await api.post<LoginResponse>('/auth/login', { username, password });
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}

export async function getMe(): Promise<Usuario> {
  try {
    const { data } = await api.get<{ success: boolean; user: Usuario }>('/auth/me');
    return data.user;
  } catch (err) {
    throw normalizarError(err);
  }
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // El token igual se descarta del lado del cliente. La app no
    // depende de que el servidor conteste para cerrar sesion.
  }
}

export async function activar(datos: DatosActivacion): Promise<ActivarResponse> {
  if (USE_MOCK_DATA) return mockActivar(datos);
  try {
    const { data } = await api.post<ActivarResponse>('/auth/activar', datos);
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}