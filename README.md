# SIGE-GNV VC GAS — Sistema de Gestión de GNV

Sistema integral para talleres de conversión a Gas Natural Vehicular (GNV):
gestión de citas, control de proceso de recalificación, inventario de
refacciones, predicción de demanda y app móvil para clientes.

---

## Arquitectura

| Componente | Tecnología | Puerto |
|---|---|---|
| **Base de datos** | MariaDB 13.0 | 3307 (pruebas) |
| **API backend** | Node.js + Express | 3100 |
| **Web admin** | React + Vite | 5173 |
| **App móvil** | React Native (Expo) | 8081 |
| **WhatsApp** | WPConnect (Baileys) | 21465 |

---

## Funcionalidades implementadas

### 1. Agenda y proceso de recalificación

- **6 estados de proceso visibles** en web y móvil:
  - `RESERVADA` → `EN_TALLER` → `TANQUE_EN_RECALIFICADORA` → `MONTAJE_Y_PRUEBA` → `LISTA_PARA_RETIRO` → `ENTREGADA`
  - Además: `CANCELADA`, `NO_ASISTIO`, `REPROGRAMADA`
- Cada estado muestra badges de color y flechas de transición
- Web: calendario por día con citas y panel de transiciones
- Móvil: tira horizontal de 14 días + estados con badge y CTA
- Vehículos públicos terminan en ~3 días; privados el mismo día
- Tipo de vehículo se elige al reservar (público / privado)

### 2. Reserva de citas (cliente móvil)

- Solo se puede reservar **recalificación** (no otros servicios)
- Calendario interactivo con días disponibles y slots por hora
- Al reservar: tipo de vehículo + placa → aparece en la agenda del taller
- Móvil: sección "Mis citas" con estado actual y badge de color

### 3. Códigos de activación

- El taller genera un código por teléfono desde la web
- El código se encola en WhatsApp (si se marca) y se muestra **una sola vez** en pantalla
- El cliente usa el código + usuario + contraseña para registrarse en la app
- Endpoint: `POST /api/auth/activar`

### 4. Usuarios de la app móvil (web admin)

- Sección **Cuentas** en la web lista todos los usuarios rol `cliente`
- Muestra: usuario, cliente, teléfono, placas (color según público/privado), estado
- Permite generar códigos de activación nuevos
- Los nombres y placas coinciden entre móvil y web (mismas tablas)

### 5. Inventario

- Catálogo de productos GNV (filtros, mangueras, electroválvulas, etc.)
- Movimientos: entrada, salida, ajuste, retirada de cilindros
- Datos demo cargados: 40 productos, 234 movimientos, 913 unidades

### 6. Predicciones (regresión lineal)

- Módulo `src/modules/predicciones/` con modelo de **regresión ponderada**
- Variables: recalificaciones, inspecciones, conversiones por mes
- **R²**, error estándar, intervalo ±2·EE (`min`/`max`)
- **Detección de estacionalidad** (índice mensual, ≥12 meses de historia)
- Confiabilidad: alta / media / baja / muy_baja
- Sección **Proyecciones** en la web con métricas, barras y fórmula

---

## Estructura del proyecto

```
Proyecto/
├── src/                    # Backend (Node.js)
│   ├── config/             # database.js, etc.
│   ├── middleware/         # auth.js (JWT, requireStaff, requireAdmin)
│   ├── modules/
│   │   ├── auth/           # login, registro, activación con código
│   │   ├── citas/          # agenda, estados, reservas, web actions
│   │   ├── cliente/        # endpoints del cliente (mis citas)
│   │   ├── inventario/     # productos, movimientos, retiro cilindros
│   │   ├── notificaciones/ # cola WhatsApp (recordatorios, activación)
│   │   ├── predicciones/   # regresión lineal, estacionalidad
│   │   ├── public/         # endpoints públicos (códigos, registro)
│   │   └── vehiculos/      # CRUD vehículos
│   ├── routes/index.js     # rutas montadas por prefijo
│   └── app.js              # CORS, middleware global
├── database/
│   └── migrations/         # 001 a 015
├── frontend/               # Web (React + Vite)
│   └── src/
│       ├── api.js          # capa HTTP (fetch + JWT)
│       ├── pages/
│       │   ├── Agenda/         # calendario, citas, estados
│       │   ├── Cuentas/        # usuarios móvil + generar código
│       │   ├── Proyecciones/   # predicciones, gráficos
│       │   ├── Inventario/     # productos, movimientos
│       │   └── DashboardPage.jsx  # nav con 4 secciones
│       └── components/
├── mobile/                 # App móvil (Expo)
│   └── src/
│       ├── navigation/AppNavigator.tsx
│       ├── services/citaService.ts
│       └── screens/
│           ├── Citas/ReservarCitaScreen.tsx
│           ├── Citas/MisCitasScreen.tsx
│           ├── VehicleDetailScreen.tsx
│           └── HomeScreen.tsx
├── whatsapp/               # WPConnect (Baileys) puerto 21465
└── scripts/                # utilidades, seeds, helpers
```

---

## Migraciones (base 3307)

| # | Archivo | Contenido |
|---|---|---|
| 001 | initial_schema.sql | Esquema base: usuarios, clientes, vehículos, citas, notificaciones |
| 002 | add_notificaciones.sql | Tabla notificaciones |
| 003 | add_codigos_activacion.sql | Códigos de activación |
| 004 | add_dispositivos_push.sql | Tokens push |
| 005 | add_usuarios_estado.sql | Estado de usuario (activo/inactivo) |
| 006 | add_inventario.sql | Productos y movimientos |
| 007 | inventario_datos_ia.sql | Datos demo inventario |
| 008 | recordatorios_10d.sql | Recordatorios 10 días antes |
| 009 | normalizar_cliente_vehiculo.sql | Relación cliente-vehículo |
| 010 | codigos_activacion_cliente.sql | Código → cliente |
| 011 | retirar_cilindros.sql | Retiro de cilindros |
| 012 | marca_modelo_y_push_cliente.sql | Marca/modelo |
| 013 | drop_marca_modelo.sql | Limpieza |
| 014 | agenda_citas.sql | Agenda (origen, tipo_vehiculo) |
| 015 | citas_proceso_y_codigos.sql | **Estados de proceso, enum, notificaciones.id_vehiculo** |

---

## Endpoints principales

### Auth
- `POST /api/auth/login` — login (web y móvil)
- `POST /api/auth/activar` — activar cuenta con código
- `POST /api/auth/registro` — registro con código

### Citas (staff/admin)
- `GET /api/citas` — listar citas
- `POST /api/citas` — crear (walk-in)
- `PATCH /api/citas/:id/estado` — cambiar estado (transiciones)
- `PATCH /api/citas/:id/reprogramar`
- `PATCH /api/citas/:id/cancelar`
- `GET /api/citas/clientes` — listar clientes para agenda
- `GET /api/citas/usuarios-clientes` — usuarios móvil con vehículos (admin)

### Cliente (app móvil)
- `GET /api/cliente/citas` — mis citas
- `POST /api/cliente/citas` — reservar (solo recalificación)
- `GET /api/cliente/vehiculos` — mis vehículos

### Predicciones
- `GET /api/predicciones?meses=12` — modelo, R², estacionalidad, capacidad

### Agenda
- `GET /api/agenda/config`
- `GET /api/agenda/disponibilidad?fecha=YYYY-MM-DD`

### Inventario
- `GET /api/inventario/productos`
- `POST /api/inventario/movimientos`

---

## Datos de prueba

| Dato | Cantidad |
|---|---|
| Clientes | 248 |
| Vehículos | 247 (70 públicos, 173 privados) |
| Citas (varios estados) | 64 |
| Recalificaciones/mes (próximos 12) | ~16 |
| Conversiones/mes (histórico 12 meses) | ~20 |
| Productos inventario | 40 |
| Movimientos inventario | 234 |
| Usuarios móviles | 3 |

---

## Comandos útiles

```powershell
# Levantar todo
.\scripts\levantar-todo.ps1

# Apagar todo
.\scripts\levantar-todo.ps1 -Apagar

# Correr un script contra la 3307
.\scripts\con-3307.ps1 scripts\seed-proyecciones.mjs

# Cargar inventario demo
.\scripts\con-3307.ps1 scripts\cargar-inventario-demo.js

# Cambiar contraseña de un usuario
node scripts\set-user-password.js <username> <nueva>

# Verificar conexión a 3307
node scripts\verify-database.js

# Typecheck móvil
cd mobile; npx tsc --noEmit

# Build web
cd frontend; npm run build
```

---

## Reglas de seguridad

1. **La base 3306 REAL NUNCA se toca** — todo corre contra la 3307 de pruebas.
2. **JWT** para autenticación; roles: `administrador`, `tecnico`, `cliente`.
3. **CORS** limitado a métodos GET, POST, PUT, PATCH, DELETE, OPTIONS.
4. **Códigos de activación** se muestran solo una vez en pantalla.
5. **Contraseñas** con bcrypt (10 rounds).
6. La API **no tiene hot-reload** → reiniciar después de cambios.

---

## Documentación adicional

- `USUARIOS_Y_ARRANQUE.md` — usuarios, contraseñas y cómo levantar todo
- `ARRANQUE_RAPIDO.md` — arranque rápido
- `ESTADO_MODULO_CITAS.md` — estado del módulo de citas
