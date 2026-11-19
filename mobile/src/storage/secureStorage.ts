import * as SecureStore from 'expo-secure-store';
import type { Sesion, Usuario } from '../types/auth';

const TOKEN_KEY = 'sigegnv.token';
const USER_KEY = 'sigegnv.user';

// En SecureStore va el JWT y el perfil basico de la sesion.
// Las contrasenas NUNCA se guardan en el dispositivo.

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getUsuarioGuardado(): Promise<Usuario | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Usuario;
  } catch {
    await limpiarSesion();
    return null;
  }
}

export async function guardarSesion(sesion: Sesion): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, sesion.token),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(sesion.user)),
  ]);
}

export async function limpiarSesion(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
}