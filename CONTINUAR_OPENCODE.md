# CONTINUAR — opencode / SIGE-GNV VC GAS

**Pausa:** 29/09/2026, después de terminar y verificar la app móvil de punta a punta.
**Estado de la app móvil:** COMPLETA en `mobile/` (Expo SDK 57), probada contra el backend real.

---

## 1. Resumen del avance hasta acá

| Etapa | Estado |
|---|---|
| Backend (API Express + MariaDB) | Funcionando. 13 secciones de `validacion-final` OK |
| Migración 012 (marca/modelo + push cliente) | Aplicada en 3307 |
| Seed de clientes de prueba | OK: `pruebamovil1` / `pruebamovil2` |
| Test de los 3 huecos por HTTP | **42/42 OK** (`test-huecos.mjs`) |
| Validación final | **230/230 OK** (`validacion-final.js`) |
| Formulario web con marca/modelo | Hecho y build OK — pero el usuario lo **descartó** (7.2 cancelado) |
| **App móvil** | **COMPLETA** + verificada (abajo, sección 7) |

---

## 2. Servicios corriendo AHORA MISMO (NO reiniciar si están vivos)

| Proceso | Puerto | Quién |
|---|---|---|
| MariaDB portátil (PRUEBAS) | **3307** | `mariadbd.exe --defaults-file=C:\Users\camii\AppData\Local\Temp\opencode\gnvidem\my.ini` |
| API backend | **3100** | `node src/server.js` con las variables de la sección 3 |
| Metro / Expo dev server | **8081** | `npx expo start` en `mobile/` (quedó corriendo de fondo) |

Comprobación rápida:

```powershell
Invoke-WebRequest http://localhost:3100/api/health
Invoke-WebRequest http://localhost:8081/status   # -> packager-status:running
```

**Regla de oro: 3306 (base REAL) NO se toca.** Solo se trabaja contra `127.0.0.1:3307` / `gnv_taller` / `gnv` / `gnvtest`.

---

## 3. Variables de entorno

### Levantar la API contra 3307 (pruebas)

```powershell
$env:DB_HOST='127.0.0.1'; $env:DB_PORT='3307'
$env:DB_USER='gnv';  $env:DB_PASSWORD='gnvtest'
$env:DB_NAME='gnv_taller'; $env:PORT='3100'
node src/server.js
```

### Wrapper que ya existe

```powershell
.\scripts\con-3307.ps1 scripts\validacion-final.js
.\scripts\con-3307.ps1 scripts\test-inventario.js --escribir
```

### `.env` (NO modificar — apunta a 3306 real)

```
PORT=3100
DB_HOST=localhost
DB_PORT=3306
DB_USER=gnv_app
DB_PASSWORD=<32 chars>
DB_NAME=gnv_taller
JWT_SECRET=<existente>
JWT_EXPIRES_IN=8h
WHATSAPP_INTEGRATION_API_KEY=<existente>
```

### App móvil (`mobile/.env`, copiado de `.env.example`)

```
EXPO_PUBLIC_API_URL=http://<IP_DEL_PC>:3100/api
EXPO_PUBLIC_USE_MOCK_DATA=false
```

**En celular físico NO usar `localhost`** (el localhost del teléfono es el propio teléfono).
`mobile/.env` está en `.gitignore`; `.env.example` queda versionado.

---

## 4. Endpoints que usa la app móvil (mapeados, no inventados)

### Públicos (sin sesión)

`GET /api/public/consulta/placa/:placa`
→ `{success, data:{placa, proxima_inspeccion, estado_inspeccion, proxima_recalificacion, estado_recalificacion}}`
Estados públicos: `sin_registro | vencido | por_vencer | vigente`. 404 `PLACA_NOT_FOUND`, 400 `BAD_PLACA`, rate limit 30/min. No expone datos personales.

### Auth

| Método | Ruta | Respuesta |
|---|---|---|
| POST | `/api/auth/login` | `{success, user:{id,username,rol}, token}` (campo = `username`, no correo) |
| GET | `/api/auth/me` | `{success, user}` |
| POST | `/api/auth/logout` | ok |
| POST | `/api/auth/activar` | `{username, codigo, password}` → `201 {success, token, user, cliente}` |

`POST /api/auth/codigos` es del TALLER (`requireStaff`), la app cliente NO lo usa.
Login: rate limit 10/15min. Activar: 5/15min. Código `AAAAA-BBBBB`, sin `I/O/0/1`, se teclea en minúsculas y sin guion, un solo uso, vence.

### Cliente (requieren JWT)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/cliente/vehiculos` | `{success, vinculado, cliente, vehiculos[]}` |
| GET | `/api/cliente/vehiculos/:id` | `{success, vehiculo{inspeccion, recalificacion}}` |
| GET | `/api/cliente/notificaciones` | `{success, notificaciones[], no_leidas}` |
| GET | `/api/cliente/notificaciones?solo_no_leidas=true` | filtrado para el badge |
| PATCH | `/api/cliente/notificaciones/:id/leida` | `{success, id, leida:true}` |
| POST | `/api/cliente/dispositivos` | `{expo_push_token, plataforma}` (token sale del JWT) |
| POST | `/api/cliente/dispositivos/desactivar` | `{desactivados}` |

Aislamiento por SQL: `notificaciones → vehiculos.id → clientes.id → clientes.id_usuario` (del JWT, nunca del parámetro). Marcar leída responde 404 si no existe / es ajena / ya estaba leída.

**Forma de un vehículo (cliente):**
```json
{ "id_vehiculo": 1, "placa": "123ABC",
  "inspeccion":     { "fecha_realizada":"2026-10-09", "fecha_vencimiento":"2027-10-09", "dias_restantes":379, "estado":"por_vencer" },
  "recalificacion": { "fecha_realizada":"2022-06-20", "fecha_vencimiento":"2027-06-20", "dias_restantes":640, "estado":"vigente" } }
```
El vehículo **no tiene marca ni modelo**: se descartaron del registro del taller (ver §7.2).
Estados de cliente: `sin_fecha | vencido | vence_hoy | por_vencer | vigente`.
La app mapea ambos conjuntos a VIGENTE / PRÓXIMO / VENCIDO / SIN REGISTRO (`src/utils/status.ts`).

---

## 5. Datos de prueba en 3307

| Usuario | Password | Cliente | Vehículo | Avisos |
|---|---|---|---|---|
| `pruebamovil1` | `Prueba123!` | Carlos | **123ABC** (inspección por_vencer, recalificación vigente) | 2 (1 sin leer) |
| `pruebamovil2` | `Prueba123!` | Ana | **4567DEF** | 0 (aislamiento) |

> **Nota importante:** las placas siguen el formato boliviano **1-4 números + 3 letras** (`123ABC`, `1234ABC`).
> `normalizePlaca` quita guiones/espacios y sube a mayúsculas antes de validar y de buscar, así que
> la consulta pública por `123-ABC` (como la tipea el usuario) **funciona**.
> Los `id` de usuario/cliente/vehículo los asigna el seed en cada corrida: no son fijos.

**Fechas sembradas:** 123ABC → inspección realizada 2026-10-09 / vence 2027-10-09 (estado `por_vencer`); recalificación realizada 2022-06-20 / vence 2027-06-20 (`vigente`).

Reglas de negocio (las decide el backend): inspección = realizada + 1 año; recalificación = realizada + 5 años; recordatorio 10 días antes.

---

## 6. App móvil — lo que quedó hecho

`mobile/` — **Expo SDK 57** (`expo ~57.0.26`, RN 0.86.3, react 19.2.3). Sin Expo Router a propósito: usa **React Navigation v7** (native-stack + bottom-tabs), como pide el documento de trabajo.

### Archivos clave

```
mobile/
  app.config.ts        # nombre "SIGE-GNV VC GAS", package com.vcgas.sigegnv, plugin secure-store
  eas.json             # development / preview (apk) / production (.aab)
  .env.example         # EXPO_PUBLIC_API_URL + EXPO_PUBLIC_USE_MOCK_DATA
  App.tsx              # raíz: SafeAreaProvider + AuthProvider + switch usuario? AppNavigator : PublicNavigator
  README.md            # documentación completa
  src/
    config.ts  theme.ts
    types/     auth, vehicle, notification, consulta
    utils/     normalizePlate, formatDate, status
    storage/   secureStorage (SecureStore: sigegnv.token / sigegnv.user — nunca la contraseña)
    services/  api (axios + errores en español), mock, authService, vehicleService,
               publicService, notificationService (manejo expo-notifications)
    context/   AuthContext (login/logout/activar/registro push)
    components/ AppHeader, StatusBadge, ServiceCard, VehicleCard, NotificationCard,
                LoadingIndicator, ErrorMessage, FormTextInput
    navigation/ types.ts, PublicNavigator, AppNavigator (tabs Inicio/MisVehiculos/Avisos/FAQ/Perfil + badge no_leidas)
    screens/   PublicHomeScreen, PlateResultScreen, LoginScreen, ActivateAccountScreen,
               HomeScreen, MyVehiclesScreen, VehicleDetailScreen, NotificationsScreen,
               FAQScreen, ProfileScreen        # las 10
```

### Decisiones que se tomaron (NO revertir sin avisar)

- **7.2 marca/modelo: ELIMINADOS de todo el registro del vehículo.** La app móvil y el backend
  (alta/edición/listado de vehículos) ya NO guardan ni devuelven marca ni modelo. El formulario
  web `VehiculoForm.jsx` también los quitó. Las columnas `vehiculos.marca` / `modelo` quedan en la
  tabla (NULL) solo por compatibilidad de esquema; ya nadie las lee ni escribe.
  Excepción: el módulo de IA `vehicleRecognition` sigue usando marca/modelo como su propio dominio
  (recomendación de medida de maletera), según `proyecto.txt`.
- **Errores HTTP → español:** `normalizarError`/`ApiError` cubren red(0)/400/401/403/404/429/500.
  Un 401 limpia la sesión guardada.
- **Push best-effort:** en Expo Go Android (SDK 53+) el push remoto no existe; `registrarDispositivo`
  nunca tira a la UI. Push real solo con build de desarrollo.
- `app.json` fue eliminado; manda `app.config.ts`.
- **Trampa de instalación:** `npx expo install` falla en esta máquina (npm 12 + `.npmrc` global
  `allow-scripts=opencode-ai` rechaza `--allow-scripts`). Las versiones se fijaron a mano en
  `package.json` (tomadas de `node_modules/expo/bundledNativeModules.json`) y se instalaron con
  `npm install`. `npx expo install --check` verifica = "up to date".

---

## 7. Verificación de la app móvil (ya hecha, todo OK)

| Chequeo | Resultado |
|---|---|
| `npx tsc --noEmit` (mobile/) | EXIT 0 |
| `npx expo-doctor` | **21/21 checks passed** |
| `npx expo export --platform android` | Bundle OK (937 módulos) |
| `npx expo start` | Metro arriba en `localhost:8081` |
| `.\scripts\con-3307.ps1 <temp>\test-movil-final.mjs` | **37/37 OK** contra API 3100 + MariaDB 3307 |

Los 37 chequeos cubren: consulta pública (PRUEBA111/PRUEBA222/inexistente 404, sin datos
personales), activación con código (emitir→canjear→token sirve→vinculado→no reutilizable),
login OK + clave mala 401, mis vehículos, detalle (inspección + recalificación), notificaciones
(lista, `solo_no_leidas`, marcar leída), aislamiento entre clientes, y logout + acceso sin
token → 401.

### Correcciones de datos hechas en 3307 (importante saber por qué)

1. **Placas sin guion:** la siembra original guardó `PRUEBA-111`, pero la consulta pública
   normaliza y no la encontraba → se actualizaron a `PRUEBA111`/`PRUEBA222`. Hoy la consulta
   pública funciona igual escribas `PRUEBA111` o `PRUEBA-111`.
2. **Notificaciones demo:** `validacion-final.js` las borra en su limpieza (líneas 280-281).
   Se re-sembraron y `test-movil-final.mjs` las reconstruye determinísticamente en cada corrida
   (delete + insert idéntico a `seed-movil.mjs`).

---

## 8. Trabajos en segundo plano que corren (no restablecer si siguen vivos)

- Instancia portátil de MariaDB 3307: `C:\Users\camii\AppData\Local\Temp\opencode\gnvidem\`
- Backend: `Start-Process node src/server.js` (env de 3307)
- Metro/Expo: proceso `node ...\expo\bin\cli start` en `mobile/`

### Scripts en temp (existen, útiles)

```
C:\Users\camii\AppData\Local\Temp\opencode\
  seed-movil.mjs        # crea/limpia pruebamovil1/2 (placas normalizadas, marca/modelo)
  test-huecos.mjs       # 42/42 OK — 3 huecos por HTTP
  test-movil-final.mjs  # 37/37 OK — flujos de la app móvil (crea admin temporal + activa cuenta)
  validacion-final.js   # (está en scripts/, 230/230)
```

---

## 9. Pendientes reales (fuera de lo ya verificado)

1. **Probar la UI en un celular físico** (visual): Expo Go, `EXPO_PUBLIC_API_URL=http://<IP>:3100/api`.
2. **Push remoto real:** requiere build de desarrollo (`npx eas-cli@latest build --profile development`);
   el envío con Expo Push API es del backend, no de la app.
3. **Infraestructura 3306 (producción, NO tocar hasta que lo pida):** crear `gnv_app`/`gnv_admin`
   con `scripts\crear-usuarios-3306.ps1`, aplicar migraciones con `scripts\migrar-3306.ps1 -Ejecutar`.
4. **WhatsApp real:** entrega sin probar (falta sesión/QR).
5. `git status` muestra mucho como untracked — **no se hizo ningún commit**; no commitear sin que lo pida.

---

## 10. NO volver a implementar (reglas fijas)

- **Cilindros / serie / capacidad / tipo como dato del vehículo.** No existen como columnas.
  La capacidad es solo recomendación de la IA, nunca se guarda.
- **Inventario en la app del cliente.** La app móvil NO toca productos, stock, entradas o salidas.
- **IA de reconocimiento en la app cliente.** Es de técnicos, va en la web.
- **Calcular fechas en la app.** +1 año, +5 años y 10 días los decide el backend.
- **`requireStaff` dentro de `/cliente`.** El permiso ahí es "ser uno mismo", no el cargo.
- **Marca/modelo en la app móvil.** Descartado por el usuario.

---

## 11. Para reanudar la próxima sesión

```powershell
cd C:\Users\camii\Music\Proyecto
.\scripts\con-3307.ps1 scripts\validacion-final.js        # debe seguir 230/230
.\scripts\con-3307.ps1 <temp>\test-movil-final.mjs        # debe seguir 37/37
# API: $env:... 3307 + node src/server.js (si no está corriendo)
# App: cd mobile; npx expo start (si Metro no está arriba)
```

Todo lo del Checklist del usuario (app creada, Expo inicia, login, activación, consulta placa,
mis vehículos, notificaciones, logout) está **hecho y verificado**. La próxima tarea lógica es
la prueba visual en dispositivo físico y, si el usuario lo pide, los pasos de 3306/WhatsApp/EAS.