# SIGE-GNV VC GAS — Guía Completa de Usuarios y Arranque

> Última actualización: 14 de octubre de 2026

---

## 1. Usuarios y Contraseñas

### Web (http://localhost:5173)

| Usuario | Contraseña | Rol | Ver |
|---|---|---|---|
| `administrador` | `DevAdmin2026!` | Administrador | Todo: agenda, inventario, proyecciones, cuentas |
| `tecnico` | `DevTecnico2026!` | Técnico | Agenda (estados de proceso), vehículos |

### Móvil (app Expo)

| Usuario | Contraseña | Cliente | Placa |
|---|---|---|---|
| `pruebamovil1` | `Prueba123!` | Carlos Mamani Prueba | 123ABC |
| `pruebamovil2` | `Prueba123!` | Ana Vargas Prueba | 4567DEF |

> Los usuarios móviles también pueden ver sus datos en la web (sección Cuentas).

### Base de datos (MariaDB 3307 pruebas)

| Campo | Valor |
|---|---|
| Host | `127.0.0.1` |
| Puerto | `3307` |
| Usuario | `gnv` |
| Contraseña | `gnvtest` |
| Base | `gnv_taller` |

---

## 2. Cómo levantar todo

### Opción A — Un solo comando (recomendado)

```powershell
.\scripts\levantar-todo.ps1
```

Levanta en segundo plano los 5 servicios:

| Servicio | Puerto | URL |
|---|---|---|
| MariaDB (pruebas) | 3307 | — |
| API backend | 3100 | http://localhost:3100/api |
| Web (Vite) | 5173 | http://localhost:5173 |
| Móvil (Expo) | 8081 | http://localhost:8081 |
| WhatsApp (WPConnect) | 21465 | http://localhost:21465 |

**Apagar todo:**
```powershell
.\scripts\levantar-todo.ps1 -Apagar
```

### Opción B — Servicio por servicio

```powershell
# 1. MariaDB 3307 (pruebas) — usar el helper
.\scripts\con-3307.ps1 scripts\cargar-inventario-demo.js   # para correr scripts

# 2. API backend (SIEMPRE contra 3307, nunca 3306)
$env:DB_HOST='127.0.0.1'; $env:DB_PORT='3307'; $env:DB_USER='gnv'; $env:DB_PASSWORD='gnvtest'; $env:DB_NAME='gnv_taller'; $env:PORT='3100'
node src\server.js

# 3. Web (otra terminal)
cd frontend; npm run dev    # → http://localhost:5173

# 4. Móvil (otra terminal)
cd mobile; npx expo start   # → http://localhost:8081

# 5. WhatsApp (otra terminal)
cd whatsapp; npm start      # → puerto 21465
```

---

## 3. Verificar que todo funciona

```powershell
# API activa
Invoke-RestMethod http://localhost:3100/api/health

# Que la API usa la 3307 (no la real)
Invoke-WebRequest http://localhost:3100/api/health | Select-Object -Expand Headers

# Web activa
Invoke-WebRequest http://localhost:5173 -UseBasicParsing | Select StatusCode

# Expo activo
Invoke-WebRequest http://localhost:8081/status -UseBasicParsing | Select Content
```

---

## 4. Login rápido (prueba)

**Web:**
1. Abrir http://localhost:5173
2. Usuario: `administrador`, Contraseña: `DevAdmin2026!`

**Móvil:**
1. Abrir Expo Go en el celular (misma red WiFi)
2. Escanear QR de http://localhost:8081
3. Usuario: `pruebamovil1`, Contraseña: `Prueba123!`

---

## 5. Notas importantes

- **NUNCA tocar la base 3306 real** (user `gnv_app`). Todo corre contra la 3307 de pruebas.
- **La API no tiene hot-rechange**: después de cambiar código, reiniciar con `levantar-todo.ps1` o matar el proceso del puerto 3100.
- **IP del PC**: `192.168.100.60`. Si cambias de red, regenerar `mobile/.env` con la nueva IP (lo hace `levantar-todo.ps1` automáticamente).
- **Logs**: en `%TEMP%\opencode\sige-gnv-logs\` (api.log, web.log, expo.log, whatsapp.log).

---

## 6. Generar un código de activación nuevo (para nuevos usuarios móviles)

1. Entrar a la web como admin → **Cuentas**
2. Escribir el teléfono del cliente
3. Marcar "Enviar por WhatsApp" (opcional)
4. Click **Generar código**
5. El código aparece **una sola vez** en pantalla → dárselo al cliente
6. El cliente abre la app móvil → se registra con el código + usuario + contraseña que quiera
7. Aparecerá automáticamente en la lista de usuarios de la web
