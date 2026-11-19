import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import { USE_MOCK_DATA } from '../config';
import type { NotificacionesResponse } from '../types/notification';
import { api, normalizarError } from './api';
import { mockMarcarLeida, mockNotificaciones } from './mock';

// ---------------------------------------------------------------
// POR QUE expo-notifications NO SE IMPORTA DE FORMA ESTATICA
// ---------------------------------------------------------------
// expo-notifications SDK 53+ tiene un efecto de modulo: apenas se
// importa, `build/DevicePushTokenAutoRegistration.fx.js` ejecuta en
// el scope global del modulo:
//
//     if (ServerRegistrationModule.getRegistrationInfoAsync) {
//       addPushTokenListener(...)   <-- linea 78
//     }
//
// `addPushTokenListener` llama a `warnOfExpoGoPushUsage()`, que en
// Android dentro de Expo Go LANZA:
//   "Android Push notifications ... was removed from Expo Go with
//    the release of SDK 53."
//
// Ese throw ocurre durante el IMPORT, antes de que se ejecute
// ninguna linea de esta app, y por eso la app no levanta
// ("[runtime not ready]"). No se puede evitar con try/catch ni con
// guards: hay que no cargar el modulo.
//
// Solucion: NO existe `import ... from 'expo-notifications'` en este
// archivo. El modulo se carga con `require()` de forma diferida, solo
// cuando NO estamos en Expo Go. Metro incluye el codigo en el bundle
// pero no lo ejecuta hasta que se hace el require, asi que dentro de
// Expo Go la rama que lanza nunca llega a correr.
//
// En una development build `isRunningInExpoGo()` da false, se carga
// el modulo y el push funciona completo (canal, permisos, token y
// listener de auto-registro nativo del propio modulo).
// ---------------------------------------------------------------

// Import SOLO de tipos: TypeScript lo borra por completo, asi que
// no genera ninguna llamada a require() en tiempo de ejecucion.
import type * as NotificationsTypes from 'expo-notifications';

export function pushRemotoDisponible(): boolean {
  return !isRunningInExpoGo();
}

let modulo: typeof NotificationsTypes | null = null;

// Carga diferida. Solo se invoca desde una development build.
function notificaciones(): typeof NotificationsTypes {
  if (!modulo) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modulo = require('expo-notifications') as typeof NotificationsTypes;

    // Como se muestran las notificaciones push con la app abierta.
    // SDK 57: shouldShowBanner / shouldShowList en vez de shouldShowAlert.
    modulo.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }
  return modulo;
}

export async function listNotificaciones(soloNoLeidas = false): Promise<NotificacionesResponse> {
  if (USE_MOCK_DATA) return mockNotificaciones(soloNoLeidas);
  try {
    const { data } = await api.get<NotificacionesResponse>('/cliente/notificaciones', {
      params: soloNoLeidas ? { solo_no_leidas: 'true' } : undefined,
    });
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}

export async function marcarLeida(id: number): Promise<{ success: boolean; id: number; leida: boolean }> {
  if (USE_MOCK_DATA) return mockMarcarLeida(id);
  try {
    const { data } = await api.patch(`/cliente/notificaciones/${id}/leida`);
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}

// Se pide permiso al sistema y se obtiene el token de Expo. En
// Expo Go para Android (SDK 53+) el push remoto no esta disponible:
// ni se pide permiso ni se pide token, porque ni siquiera se llega a
// cargar expo-notifications. En una development build este bloque
// corre completo.
async function obtenerTokenExpo(): Promise<string | null> {
  // En Expo Go NO cargamos expo-notifications ni hacemos ninguna
  // operacion de push (ni listener, ni canal, ni token).
  if (!pushRemotoDisponible()) return null;

  try {
    const Notifications = notificaciones();

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('aviso', {
        name: 'Avisos',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0B5ED7',
      });
    }

    const { status: actual } = await Notifications.getPermissionsAsync();
    let status = actual;
    if (status !== 'granted') {
      const pedido = await Notifications.requestPermissionsAsync();
      status = pedido.status;
    }
    if (status !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
    if (!projectId) return null;

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (err) {
    console.warn('No se pudo obtener el token push de Expo:', err);
    return null;
  }
}

export async function registrarDispositivo(): Promise<{ registrado: boolean }> {
  if (USE_MOCK_DATA) return { registrado: true };
  // Expo Go: se omite el registro de push. No tira a la UI, la app
  // sigue usable; solo el interruptor de avisos queda en false.
  if (!pushRemotoDisponible()) return { registrado: false };
  const token = await obtenerTokenExpo();
  if (!token) return { registrado: false };
  try {
    await api.post('/cliente/dispositivos', {
      expo_push_token: token,
      plataforma: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    return { registrado: true };
  } catch (err) {
    throw normalizarError(err);
  }
}

export async function desactivarDispositivos(): Promise<{ desactivados: number }> {
  if (USE_MOCK_DATA) return { desactivados: 1 };
  try {
    const { data } = await api.post('/cliente/dispositivos/desactivar');
    return data;
  } catch (err) {
    throw normalizarError(err);
  }
}