# SIGE-GNV VC GAS â€” App mÃ³vil (cliente)

AplicaciÃ³n mÃ³vil Expo + React Native + TypeScript para que los clientes del taller
GNV VC GAS consulten sus fechas (inspecciÃ³n y recalificaciÃ³n), sus avisos y su perfil.

> La app NO incluye inventario, cilindros, serie, capacidad, stock ni IA. Es solo la
> vista del cliente. Las fechas (+1 aÃ±o, +5 aÃ±os, recordatorio a 10 dÃ­as) las calcula
> **el backend**, nunca la app.

---

## Requisitos

- Node.js **18+**
- Celular **Android fÃ­sico** con **Expo Go** (recomendado para desarrollo) o build de desarrollo.
- Backend levantado contra la base de **pruebas**:

```powershell
$env:DB_HOST='127.0.0.1'; $env:DB_PORT='3307'
$env:DB_USER='gnv';  $env:DB_PASSWORD='gnvtest'
$env:DB_NAME='gnv_taller'
node src/server.js
```

---

## Variables de entorno (`mobile/.env`)

| Variable | DescripciÃ³n | Ejemplo |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | URL base del backend (`/api` incluido), **sin barra final**. | `http://192.168.1.50:3100/api` |
| `EXPO_PUBLIC_USE_MOCK_DATA` | `true` = datos de ejemplo sin servidor; `false` = backend real. | `false` |

En celular fÃ­sico **no uses `localhost`**: el localhost del telÃ©fono es el propio
telÃ©fono. Usa la IP del PC en la misma red Wi-Fi. Copia `mobile/.env.example` a `mobile/.env`.

---

## InstalaciÃ³n y arranque

```powershell
cd mobile
npm install
# .env con EXPO_PUBLIC_API_URL=<IP_DEL_PC>:3100/api
npx expo start
```

Escanea el QR con Expo Go (Android) o escanea con la cÃ¡mara (iOS). TambiÃ©n:

```bash
npm run android   # abre en un emulador/Expo Go
npm run typecheck # verificaciÃ³n de tipos
```

---

## Estructura

```
mobile/
  app.config.ts            # nombre visible, package com.vcgas.sigegnv
  eas.json                 # perfiles development / preview / production (.aab)
  App.tsx                  # raÃ­z: AuthProvider + NavigationContainer
  src/
    components/            # AppHeader, StatusBadge, ServiceCard, VehicleCard,
                           #   NotificationCard, LoadingIndicator, ErrorMessage,
                           #   FormTextInput
    screens/               # PublicHome, PlateResult, Login, Activate, Home,
                           #   MyVehicles, VehicleDetail, Notifications, FAQ, Profile
    navigation/            # PublicNavigator (stack pÃºblico) + AppNavigator
                           #   (stack autenticado con tabs inferiores)
    context/               # AuthContext (sesiÃ³n, login/logout/activar)
    services/              # api (axios + errores en espaÃ±ol), auth, vehicles,
                           #   notifications, public, mock
    storage/               # secureStorage (JWT en SecureStore)
    types/                 # auth, vehicle, notification, consulta
    utils/                 # formatDate, normalizePlate, status
```

---

## Endpoints que usa

| Pantalla | MÃ©todo | Ruta |
|---|---|---|
| Consulta por placa | GET | `/api/public/consulta/placa/:placa` |
| Login | POST | `/api/auth/login` |
| Activar cuenta | POST | `/api/auth/activar` |
| Mis vehÃ­culos / Inicio | GET | `/api/cliente/vehiculos` |
| Detalle de vehÃ­culo | GET | `/api/cliente/vehiculos/:id` |
| Avisos | GET | `/api/cliente/notificaciones` (+ `?solo_no_leidas=true`) |
| Marcar aviso leÃ­do | PATCH | `/api/cliente/notificaciones/:id/leida` |
| Registro push | POST | `/api/cliente/dispositivos` |
| Desactivar push | POST | `/api/cliente/dispositivos/desactivar` |
| Salir (opcional) | POST | `/api/auth/logout` |

Los estados llegan en dos vocabularios (`vigente|por_vencer|vence_hoy|vencido|sin_fecha`
del cliente y `vigente|por_vencer|vencido|sin_registro` del pÃºblico). La app los mapea a
**VIGENTE / PRÃ“XIMO / VENCIDO / SIN REGISTRO** (`src/utils/status.ts`).

---

## Seguridad

- El **JWT va en `expo-secure-store`**; se inyecta en cada peticiÃ³n vÃ­a interceptor.
- **La contraseÃ±a nunca se guarda** en el dispositivo.
- Errores `401/403/404/429/500` y de red se traducen a mensajes en espaÃ±ol.
- La consulta pÃºblica no necesita sesiÃ³n y jamÃ¡s expone datos personales.

---

## Notificaciones push

`expo-notifications` registra el token del telÃ©fono cuando el usuario habilita la opciÃ³n
en **Perfil**. Notas:

- En **Expo Go para Android (SDK 53+)** el push remoto **no estÃ¡ disponible**; el
  registro falla silenciosamente y la app sigue funcionando. UsÃ¡ un build de desarrollo
  (`npx eas-cli@latest build --profile development`) para push real.
- El envÃ­o real de notificaciones es responsabilidad del **backend** (Expo Push API),
  no de la app.

---

## Build de producciÃ³n (EAS)

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile production --platform android   # genera .aab
```

`eas.json` define: `development` (dev client, apk), `preview` (apk interno) y
`production` (`.aab` para Google Play).

---

## Pruebas contra el backend real

Endpoints probados contra `API 3100 + MariaDB 3307`: consulta pÃºblica de placa, login,
activaciÃ³n de cuenta con cÃ³digo, listado de vehÃ­culos, detalle, notificaciones,
marcar leÃ­do y cierre de sesiÃ³n. Todo con `EXPO_PUBLIC_USE_MOCK_DATA=false`.

### Usuarios de prueba (siembra de `scripts`/temp)

```
pruebamovil1 / Prueba123!  â†’ Carlos, placa PRUEBA111, 2 avisos
pruebamovil2 / Prueba123!  â†’ Ana, placa PRUEBA222, sin avisos (aislamiento)
```

---

## Lo que la app NO hace (a propÃ³sito)

- **No** consulta inventario, stock, entradas/salidas ni ajustes.
- **No** muestra cilindros, serie, capacidad ni tipo de equipo de gas.
- **No** recalcula fechas: +1 aÃ±o, +5 aÃ±os y el aviso de 10 dÃ­as los decide el backend.
- **No** guarda la contraseÃ±a del usuario en ningÃºn lugar.