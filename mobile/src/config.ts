// Configuracion de entorno de la app.
// EXPO_PUBLIC_* se inyectan en tiempo de compilacion por Expo CLI.
// En el celular fisico NO usar "localhost": alli localhost es el
// propio telefono. Usar la IP del PC en la misma red.

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3100/api'
).replace(/\/+$/, '');

export const USE_MOCK_DATA = process.env.EXPO_PUBLIC_USE_MOCK_DATA === 'true';

export const APP_NAME = 'SIGE-GNV VC GAS';
export const APP_VERSION = '1.0.0';