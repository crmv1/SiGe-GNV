# ARRANQUE RÁPIDO — SIGE-GNV VC GAS

> Guía para levantar la **app web** y la **app móvil** en esta PC (modo pruebas).
> Contiene credenciales **de prueba**. No subir este archivo al repositorio ni
> publicarlo. La base REAL (puerto **3306**) NO se toca nunca: todo esto usa la
> base de pruebas en **3307**.

---

## 1. Puertos y servicios

| Servicio | Puerto | Comando carpeta | Necesario para |
|---|---|---|---|
| MariaDB (pruebas) | `3307` | `mariadbd.exe --defaults-file=...gnvidem\my.ini` | Todo |
| API (Node/Express) | `3100` | `node src/server.js` (con env 3307) | Web, móvil, WhatsApp |
| Web (Vite/React) | `5173` | `npm run dev` en `frontend/` | Probar la web |
| Móvil (Expo/Metro) | `8081` | `npx expo start` en `mobile/` | Probar la app móvil |
| WhatsApp (WPConnect) | `21465` | `npm start` en `whatsapp/` | Probar WhatsApp (opcional) |

IP LAN de esta PC: **`192.168.100.60`** (Wi-Fi). Si cambia de red, vuelve a
mirarla con `ipconfig` y actualiza `mobile/.env`.

---

## 2. Orden de arranque

Abre **una terminal por servicio**. El orden importa: la base primero.

### Paso 1 — MariaDB de pruebas (3307)

En una terminal nueva (deja esta abierta, corre en primer plano):

```powershell
& "C:\Program Files\MariaDB 13.0\bin\mariadbd.exe" --defaults-file="C:\Users\camii\AppData\Local\Temp\opencode\gnvidem\my.ini"
```

### Paso 2 — API en 3100 (apuntando a 3307)

En otra terminal, desde `C:\Users\camii\Music\Proyecto`:

```powershell
$env:DB_HOST='127.0.0.1'; $env:DB_PORT='3307'; $env:DB_USER='gnv'; $env:DB_PASSWORD='gnvtest'; $env:DB_NAME='gnv_taller'; $env:PORT='3100'
node src/server.js
```

> **MUY IMPORTANTE:** la API tiene que arrancar SIEMPRE con esas variables.
> Si corres `node src/server.js` a secas, el `.env` apunta a la base REAL
> (`3306`) y no queremos eso. Con las variables puestas, `dotenv` no las pisa.

### Paso 3 — App WEB

En otra terminal:

```powershell
cd C:\Users\camii\Music\Proyecto\frontend
npm run dev
```

Abre en el navegador: **http://localhost:5173**

### Paso 4 — App MÓVIL

1. Verifica que `mobile\.env` tenga la IP correcta del PC:
   ```
   EXPO_PUBLIC_API_URL=http://192.168.100.60:3100/api
   EXPO_PUBLIC_USE_MOCK_DATA=false
   ```
2. En otra terminal:
   ```powershell
   cd C:\Users\camii\Music\Proyecto\mobile
   npx expo start
   ```
3. En el celular abre **Expo Go** y escanea el QR (celular en la **misma Wi-Fi** que la PC).
   - Si Expo Go ya tenía la app abierta, **ciérrala por completo** antes de reescanear (cachea el bundle).
   - Los avisos push NO funcionan en Expo Go; el resto sí.
   - Si la red falla, alternativa: `npx expo start --tunnel`.

### Paso 5 — WhatsApp (OPCIONAL)

No lo necesitas para probar web ni móvil. Solo si quieres probar el chatbot.

```powershell
cd C:\Users\camii\Music\Proyecto\whatsapp
npm start
```

- Si la sesión guardada sigue viva, se conecta solo.
- Si no, imprime un QR (y lo guarda en `whatsapp\qr_gnv.png`): escanéalo desde
  WhatsApp → Dispositivos vinculados.
- Necesita Chrome instalado (ya está) y la API en `3100` arriba.

---

## 3. Credenciales (solo pruebas)

### App WEB (usuarios del taller)

| Usuario | Contraseña | Rol |
|---|---|---|
| `administrador` | `DevAdmin2026!` | administrador (crea/edita/borra vehículos, inventario, precios) |
| `tecnico` | `DevTecnico2026!` | técnico (consulta y alta según permisos) |

### App MÓVIL (clientes)

| Usuario | Contraseña | Placa | Contenido |
|---|---|---|---|
| `pruebamovil1` | `Prueba123!` | **123ABC** | 2 avisos (1 sin leer) |
| `pruebamovil2` | `Prueba123!` | **4567DEF** | 0 avisos (aislamiento) |

La consulta pública por placa (pantalla inicial de la app) funciona **sin login**
con `123ABC` o `4567DEF`, y también escribiéndola con guion/espacios (`123-ABC`).

### Base de datos de PRUEBAS (3307)

| Dato | Valor |
|---|---|
| Host / Puerto | `127.0.0.1` / `3307` |
| Usuario | `gnv` |
| Contraseña | `gnvtest` |
| Base | `gnv_taller` |

### WhatsApp (WPConnect)

| Dato | Valor |
|---|---|
| API key | `clave_de_pruebas_wpconnect_123456` |
| Puerto local | `21465` |

---

## 4. Comprobaciones rápidas

API viva y conectada a la base:

```powershell
Invoke-RestMethod http://localhost:3100/api/health
# -> {"status":"ok","database":"connected"}
```

Consulta pública por placa:

```powershell
Invoke-RestMethod http://localhost:3100/api/public/consulta/placa/123-ABC
```

Ver qué puertos están escuchando: `3307`, `3100`, `5173`, `8081`, `21465`.

---

## 5. Datos de prueba: recargar si hace falta

Las pruebas automáticas **borran** las notificaciones demo. Para dejarlas otra vez:

```powershell
cd C:\Users\camii\Music\Proyecto
.\scripts\con-3307.ps1 "C:\Users\camii\AppData\Local\Temp\opencode\seed-movil.mjs"
```

Para dejar la base 3307 con el esquema y la réplica base:

```powershell
.\scripts\reiniciar-pruebas.ps1
```

Suite de verificación del backend (230 comprobaciones):

```powershell
.\scripts\con-3307.ps1 scripts\validacion-final.js
```

---

## 6. Problemas comunes

| Síntoma | Causa / solución |
|---|---|
| Login responde **429** | Freno anti-fuerza bruta: espera ~15 min y no reintentes en bucle. |
| El móvil no conecta a la API | Celular en otra red Wi-Fi, o IP cambiada. Actualiza `mobile/.env` y reescanea. |
| Expo Go no abre / queda viejo | Cierra Expo Go por completo y vuelve a escanear. |
| La web carga pero sin datos | La API no está arriba o arrancó contra `3306`. Verifica el Paso 2 y `/api/health`. |
| WhatsApp no responde | El servicio de `whatsapp/` (puerto `21465`) está apagado. Levántalo (Paso 5). |

---

## 7. Apagar

Cierra cada terminal con `Ctrl + C`. La API y Expo se detienen solos. No cierres
la terminal de MariaDB antes que la API.
