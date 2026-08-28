# ⛽ GNV Taller — Sistema de Gestión de Clientes y Recordatorios WhatsApp

![Version](https://img.shields.io/badge/versi%C3%B3n-1.0.0-blue)
![PHP](https://img.shields.io/badge/PHP-8.1%2B-777BB4?logo=php&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Node](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL%20%2F%20MariaDB-10.4-4479A1?logo=mysql&logoColor=white)
![License](https://img.shields.io/badge/licencia-MIT-green)

Sistema integral para la administración de un taller de **Gas Natural Vehicular (GNV)** — *Taller VC GAS* — que permite gestionar clientes/vehículos, controlar vencimientos de **recalificación de cilindros** e **inspecciones anuales**, y automatizar el envío de **recordatorios por WhatsApp** mediante un chatbot con respuestas oficiales e inteligencia artificial local (Ollama).

---

## 📑 Tabla de Contenidos

- [Descripción del Sistema](#-descripción-del-sistema)
- [Arquitectura](#-arquitectura)
- [Tecnologías Utilizadas](#-tecnologías-utilizadas)
- [Estructura de Carpetas](#-estructura-de-carpetas)
- [Funcionalidades](#-funcionalidades)
- [Prerrequisitos](#-prerrequisitos)
- [Instalación Paso a Paso](#-instalación-paso-a-paso)
- [Variables de Entorno / Configuración](#-variables-de-entorno--configuración)
- [Ejecución del Proyecto](#-ejecución-del-proyecto)
- [API REST — Endpoints](#-api-rest--endpoints)
- [Usuarios por Defecto](#-usuarios-por-defecto)
- [Capturas de Pantalla](#-capturas-de-pantalla)
- [Contribuciones](#-contribuciones)
- [Licencia](#-licencia)

---

## 📖 Descripción del Sistema

**GNV Taller** es una aplicación web full-stack orientada a talleres que instalan y mantienen equipos de GNV. El sistema resuelve tres necesidades principales:

1. **Gestión administrativa**: registro de propietarios de vehículos con su placa, teléfono y las fechas de vencimiento de la *recalificación del cilindro* (cada 5 años) y la *inspección anual*.
2. **Recordatorios automáticos por WhatsApp**: cuando un vencimiento se acerca (recalificación ≤ 60 días, inspección ≤ 10 días), el sistema envía un mensaje al cliente evitando duplicados.
3. **Atención al cliente 24/7**: un chatbot de WhatsApp responde consultas frecuentes (requisitos, horarios, ubicación), consulta datos reales del vehículo por número de placa en la base de datos, y usa una IA local (Ollama) para conversación libre controlada.
4. **Inventario de repuestos**: control de stock de repuestos GNV (cilindros, válvulas, kits de conversión, etc.) con precios de compra/venta, proveedor y registro de movimientos de **entrada/salida** con historial por artículo.

El panel web distingue dos roles: **técnico** (consulta y registra vehículos y artículos) y **administrador** (además puede eliminar registros).

---

## 🏗 Arquitectura

```
┌──────────────────────┐         ┌─────────────────────────────┐
│  Frontend (React)    │  HTTP   │  Backend (PHP REST API)     │
│  http://localhost:5173├────────►│  http://localhost/backend   │
└──────────────────────┘  JSON   └──────────┬──────────────────┘
                                            │ PDO
                                   ┌────────▼────────┐
                                   │  MySQL/MariaDB  │
                                   │   gnv_taller    │
                                   └────────▲────────┘
                                            │
┌──────────────────────┐  webhook  ┌────────┴────────────────────┐
│  WhatsApp Bot        │◄─────────►│  enviar_recordatorios.php   │
│  (Node + WPPConnect) │           │  (cron o dashboard)         │
│  http://localhost:21465          └─────────────────────────────┘
│        │                                          
│        ▼ consulta placas / IA                    
┌──────────────────────┐     ┌──────────────────────┐
│  Backend PHP         │     │  Ollama (IA local)   │
│  chatbot_webhook.php │     │  modelo vcgas-bot    │
└──────────────────────┘     │  :11434              │
                             └──────────────────────┘
```

---

## 💻 Tecnologías Utilizadas

### Frontend
| Tecnología | Versión | Uso |
|---|---|---|
| [React](https://react.dev/) | ^18.3 | Librería UI (SPA) |
| [Vite](https://vitejs.dev/) | ^5.4 | Dev server y build |
| CSS puro | — | Estilos personalizados (sin framework) |

### Backend
| Tecnología | Versión | Uso |
|---|---|---|
| PHP | 8.1+ | API REST sin framework |
| MySQL / MariaDB | 10.4 | Base de datos |
| PDO | — | Acceso a BD con prepared statements |
| Sesiones PHP + bcrypt | — | Autenticación y roles |

### Módulo WhatsApp
| Tecnología | Versión | Uso |
|---|---|---|
| Node.js | ≥ 18 | Runtime del bot |
| [@wppconnect-team/wppconnect](https://wppconnect.io/) | ^1.32 | Conexión no oficial a WhatsApp |
| Express | ^4.19 | API HTTP del bot |
| Axios | ^1.7 | Cliente HTTP |

### Inteligencia Artificial
| Tecnología | Uso |
|---|---|
| [Ollama](https://ollama.com/) | Inferencia LLM local |
| Phi-3 (modelo `vcgas-bot` vía `Modelfile`) | Asistente con datos oficiales del taller |

---

## 📂 Estructura de Carpetas

```
Proyecto/
├── backend/                      # API REST en PHP
│   ├── config.php                # Config central: BD, CORS, sesión, helpers
│   ├── login.php                 # POST autenticación (sesión + bcrypt)
│   ├── logout.php                # POST cierre de sesión
│   ├── verificar_permiso.php     # GET estado de sesión actual
│   ├── get_vehiculos.php         # GET listar vehículos
│   ├── add_vehiculo.php          # POST registrar vehículo
│   ├── update_vehiculo.php       # PUT editar vehículo
│   ├── delete_vehiculo.php       # DELETE eliminar (solo admin)
│   ├── enviar_recordatorios.php  # Envío WhatsApp de vencimientos (cron/manual)
│   ├── chatbot_webhook.php       # Webhook: consulta de vehículo por placa
│   ├── generate_hashes.php       # Utilidad CLI: genera hashes bcrypt de usuarios
│   ├── get_inventario.php        # GET listar artículos del inventario
│   ├── add_articulo.php          # POST registrar artículo (genera entrada inicial)
│   ├── update_articulo.php       # PUT editar artículo (precios, proveedor…)
│   ├── delete_articulo.php       # DELETE eliminar artículo (solo admin)
│   ├── get_movimientos.php       # GET historial de movimientos (?articulo_id=)
│   └── add_movimiento.php        # POST entrada/salida (actualiza stock)
│
├── frontend/                     # SPA React + Vite
│   ├── package.json
│   ├── vite.config.js            # Puerto 5173 + proxy /api
│   └── src/
│       ├── main.jsx              # Punto de entrada
│       ├── App.jsx               # Rutas según estado de sesión
│       ├── api.js                # Capa de comunicación con el backend
│       ├── index.css
│       ├── context/
│       │   └── AuthContext.jsx   # Contexto global de autenticación
│       ├── pages/
│       │   ├── LoginPage.jsx     # Login profesional con panel de marca
│       │   ├── DashboardPage.jsx # Layout con sidebar + vista Dashboard (KPIs)
│       │   └── InventoryPage.jsx # Vista del inventario de repuestos
│       └── components/
│           ├── Logo.jsx              # Logo "VC GAS" reutilizable
│           ├── VehiculoForm.jsx      # Modal alta/edición de vehículo
│           ├── InventarioForm.jsx    # Modal alta/edición de artículo
│           ├── MovimientoForm.jsx    # Modal registro entrada/salida
│           └── MovimientosModal.jsx  # Historial de movimientos por artículo
│
├── whatsapp/                     # Servidor del chatbot
│   ├── package.json
│   ├── server.js                 # Bot WPPConnect + cola anti-baneo + IA
│   ├── Modelfile                 # Definición del modelo Ollama (vcgas-bot)
│   └── tokens/                   # Sesión de WhatsApp (generada al escanear QR)
│
├── gnv_taller.sql                # Dump principal de BD (esquema + datos demo)
├── inventario.sql                # Esquema del módulo de inventario (artículos + movimientos)
├── taller_clientes (1).sql       # Dump de una iteración anterior (referencia)
├── taller_clientes.sql           # Dump actualizado de clientes
├── compartir/                    # Archivos compartidos auxiliares
├── .gitignore
└── README.md
```

---

## ✨ Funcionalidades

### 🔐 Autenticación y Roles
- Inicio/cierre de sesión con contraseñas cifradas (**bcrypt**) y sesiones PHP.
- Verificación automática de sesión activa al cargar la app.
- Dos roles: `técnico` (ver, crear, editar) y `administrador` (todo + eliminar).

### 🚗 Gestión de Vehículos
- Registro completo: propietario, placa (única), fechas de recalificación e inspección, teléfono.
- Edición y eliminación con confirmación modal.
- Búsqueda instantánea por nombre, apellido, placa o teléfono.

### 📦 Inventario de Repuestos
- Alta, edición y eliminación (solo admin) de artículos GNV: nombre, descripción, cantidad, **precio de compra y venta** (Bs) y proveedor.
- Movimientos de **entrada/salida** que actualizan el stock automáticamente y se registran con **fecha**, cantidad y usuario que los realizó.
- Validación de stock: una salida no puede superar la cantidad disponible.
- Historial completo por artículo y resumen del **valor del inventario** según precio de compra.

### 🎨 Semáforo de Vencimientos
Badges de colores según días restantes:

| Estado | Condición |
|---|---|
| 🔴 Vencido | fecha pasada |
| 🟠 Crítico | ≤ 30 días |
| 🟡 Próximo | ≤ 90 días |
| 🟢 OK | > 90 días |

Enlaces directos `wa.me` al teléfono de cada cliente.

### 📲 Recordatorios Automáticos por WhatsApp
- Recalificación: se avisa **60 días antes** del vencimiento.
- Inspección anual: se avisa **10 días antes**.
- Tabla `recordatorios_enviados` garantiza que **no se dupliquen mensajes**.
- Se disparan al abrir el dashboard o vía **cron/tarea programada**.
- Si se edita la fecha de un vehículo, sus recordatorios se reinician.

### 🤖 Chatbot Inteligente (flujo híbrido)
1. **Consulta por placa** → responde con datos reales desde MySQL (propietario y fechas).
2. **Preguntas frecuentes** → respuestas oficiales exactas del taller (requisitos de recalificación, instalación GNV, inspección, horarios, ubicación, citas).
3. **Conversación libre** → IA local (Ollama) restringida a los datos oficiales; nunca inventa precios ni requisitos.
4. Menú de bienvenida si no entiende la consulta.

### 🛡 Cola Anti-Baneo del Bot
- Espera aleatoria de **20–40 s** entre mensajes enviados.
- Descanso de **10–15 min** cada **10–15 mensajes**.
- Agrupación de mensajes consecutivos de un mismo usuario (buffer de 8 s).
- Ignora mensajes antiguos (>15 s), grupos y no-texto.

---

## 📋 Prerrequisitos

| Requisito | Versión mínima | Descarga |
|---|---|---|
| XAMPP (Apache + PHP + MariaDB + phpMyAdmin) | PHP 8.1+ | <https://www.apachefriends.org/> |
| Node.js | 18.x LTS | <https://nodejs.org/> |
| Git | cualquiera | <https://git-scm.com/> |
| Ollama *(solo chatbot IA)* | 0.3+ | <https://ollama.com/download> |
| Navegador Chromium/Chrome | — | Requerido por WPPConnect |
| Cuenta de WhatsApp activa | — | Para vincular el bot por QR |

> 💡 El proyecto fue desarrollado sobre Windows + XAMPP (MariaDB 10.4.32 / PHP 8.1.25), pero funciona en cualquier stack LAMP equivalente.

---

## ⚙️ Instalación Paso a Paso

### 1️⃣ Clonar el repositorio

```bash
git clone https://github.com/TU-USUARIO/gnv-taller.git
cd gnv-taller
```

*(Si aún no existe remoto, copia la carpeta del proyecto manualmente.)*

### 2️⃣ Base de datos

1. Inicia **Apache** y **MySQL** desde el panel de XAMPP.
2. Abre <http://localhost/phpmyadmin>.
3. Crea la base de datos `gnv_taller` (collation `utf8mb4_general_ci`).
4. Importa el archivo **`gnv_taller.sql`** (pestaña *Importar*).
5. Importa también **`inventario.sql`** para crear las tablas del módulo de inventario: `articulos_inventario`, `movimientos_inventario`.
6. Verifica que existan las tablas: `usuarios`, `vehiculos`, `recordatorios_enviados`, `articulos_inventario`, `movimientos_inventario`.

> El dump ya incluye usuarios de prueba y vehículos de ejemplo. Para regenerar contraseñas personalizadas ejecuta:
> ```bash
> php backend/generate_hashes.php
> ```

### 3️⃣ Backend (PHP)

Copia la carpeta `backend/` dentro del directorio público de Apache:

```powershell
# Windows + XAMPP
Copy-Item -Recurso .\backend -Destination C:\xampp\htdocs\backend -Recurse
```

Comprueba que responde: <http://localhost/backend/verificar_permiso.php>
(debe devolver JSON `401 No autenticado` ✔)

### 4️⃣ Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Abre <http://localhost:5173>.

### 5️⃣ Servidor WhatsApp (chatbot)

```bash
cd whatsapp
npm install
npm start
```

La primera vez aparecerá un **QR en consola**: escanéalo desde
*WhatsApp → Dispositivos vinculados → Vincular dispositivo*.
La sesión queda persistida en `whatsapp/tokens/` (no vuelve a pedir QR).

> ⚠️ `tokens/` contiene credenciales sensibles: **no lo subas al repositorio**.

### 6️⃣ Modelo de IA con Ollama (opcional pero recomendado)

```bash
ollama serve                       # servidor de inferencia
ollama pull phi3                   # base del modelo
cd whatsapp
ollama create vcgas-bot -f Modelfile
```

Sin este paso el bot sigue funcionando con las respuestas oficiales y la consulta por placa (la IA es el último nivel del flujo).

---

## 🔧 Variables de Entorno / Configuración

El proyecto actualmente centraliza su configuración en constantes (no usa archivos `.env`). Estos son todos los puntos que puedes/debes ajustar:

### `backend/config.php`
| Constante | Valor por defecto | Descripción |
|---|---|---|
| `DB_HOST` | `localhost` | Host de MySQL |
| `DB_NAME` | `gnv_taller` | Nombre de la base de datos |
| `DB_USER` | `root` | Usuario de BD — **cámbialo en producción** |
| `DB_PASS` | *(vacío)* | Contraseña de BD — **cámbiala en producción** |
| `$allowedOrigin` | `http://localhost:5173` | Origen CORS permitido (URL del frontend) |

### `backend/enviar_recordatorios.php`
| Constante | Valor por defecto | Descripción |
|---|---|---|
| `WPPCONNECT_URL` | `http://localhost:21465` | URL del servidor del bot |
| `WPPCONNECT_TOKEN` | `TU_TOKEN_AQUI` | Token Bearer de wpp.connect |
| `WPPCONNECT_SESSION` | `gnv-taller` | Nombre de sesión de WhatsApp |
| `$_GET['key']` | `gnv2024secreto` | Clave secreta para invocarlo desde cron |

### `whatsapp/server.js`
| Constante | Valor por defecto | Descripción |
|---|---|---|
| `SESSION` | `gnv-taller` | Nombre de la sesión de WhatsApp |
| `PORT` | `21465` | Puerto HTTP del bot |
| `BACKEND_URL` | `http://127.0.0.1/backend` | URL del backend PHP |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Endpoint de Ollama |
| `OLLAMA_MODEL` | `vcgas-bot` | Modelo de IA a usar |

### `frontend/src/api.js`
| Constante | Valor por defecto | Descripción |
|---|---|---|
| `BASE` | `http://localhost/backend` | URL base del backend PHP |

> 🔒 Recomendación: migra estos valores a variables de entorno (`getenv()` en PHP, `process.env` en Node con `dotenv`) antes de desplegar en producción.

---

## ▶️ Ejecución del Proyecto

Orden recomendado (usa una terminal por componente):

```text
PASO 1 · Panel XAMPP      → Iniciar Apache y MySQL
PASO 2 · Terminal 1       → cd frontend  && npm run dev      # http://localhost:5173
PASO 3 · Terminal 2       → cd whatsapp  && npm start        # QR la primera vez
PASO 4 · Terminal 3       → ollama serve                     # opcional (IA)
```

### Flujo de uso típico

1. Entra a <http://localhost:5173> e inicia sesión (`administrador / admin123`).
2. Registra vehículos desde **“+ Nuevo Vehículo”**.
3. El semáforo de colores te mostrará los vencimientos críticos.
4. Al cargar el dashboard se disparan automáticamente los recordatorios pendientes (si el bot está conectado).
5. Los clientes escriben al WhatsApp del taller y el chatbot responde solo.

### Recordatorios por cron (opcional)

```bash
# Linux/macOS (crontab -e): cada día 9 AM
0 9 * * * curl -s "http://localhost/backend/enviar_recordatorios.php?key=gnv2024secreto"

# Windows: Programador de tareas → acción:
"C:\xampp\php\php.exe" C:\xampp\htdocs\backend\enviar_recordatorios.php
```

---

## 🔌 API REST — Endpoints

Base: `http://localhost/backend` · Autenticación por cookie de sesión · Respuestas `{ success, ... }`

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `POST` | `/login.php` | — | `{username, password}` → inicia sesión |
| `POST` | `/logout.php` | — | Cierra la sesión |
| `GET` | `/verificar_permiso.php` | ✔ | Devuelve usuario y rol actuales |
| `GET` | `/get_vehiculos.php` | ✔ | Lista todos los vehículos |
| `POST` | `/add_vehiculo.php` | ✔ | Registra vehículo (valida placa única) |
| `PUT` | `/update_vehiculo.php` | ✔ | Edita vehículo (reinicia recordatorios) |
| `DELETE` | `/delete_vehiculo.php` | 🛡 admin | Elimina vehículo por `{id}` |
| `GET` | `/enviar_recordatorios.php` | sesión ó `?key=` | Procesa y envía recordatorios |
| `POST` | `/chatbot_webhook.php` | interna | Busca vehículo por placa para el bot |

### Inventario
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| `GET` | `/get_inventario.php` | ✔ | Lista todos los artículos |
| `POST` | `/add_articulo.php` | ✔ | Registra artículo (la cantidad inicial genera una entrada) |
| `PUT` | `/update_articulo.php` | ✔ | Edita artículo (precios, descripción, proveedor) |
| `DELETE` | `/delete_articulo.php` | 🛡 admin | Elimina artículo (y su historial en cascada) |
| `GET` | `/get_movimientos.php` | ✔ | Lista movimientos; `?articulo_id=` filtra por artículo |
| `POST` | `/add_movimiento.php` | ✔ | Registra entrada/salida y actualiza el stock |

Códigos habituales: `200 OK` · `201 Creado` · `400 Validación` · `401 Sin sesión` · `403 Sin permisos` · `404 No encontrado` · `409 Duplicado`.

---

## 👤 Usuarios por Defecto

| Usuario | Contraseña | Rol |
|---|---|---|
| `tecnico` | `tecnico123` | Técnico |
| `administrador` | `admin123` | Administrador |

> ⚠️ **Cambia estas credenciales antes de usar en producción.**

---

## 📸 Capturas de Pantalla

> 🚧 *Espacios reservados — añade tus imágenes en `docs/screenshots/`.*

| Vista | Captura |
|---|---|
| Inicio de sesión | `![Login](docs/screenshots/login.png)` |
| Dashboard principal | `![Dashboard](docs/screenshots/dashboard.png)` |
| Formulario de vehículo | `![Formulario](docs/screenshots/formulario.png)` |
| Recordatorio WhatsApp | ![WhatsApp](docs/screenshots/whatsapp.png) |
| Chatbot en acción | ![Chatbot](docs/screenshots/chatbot.png) |

<!-- Sugerencia: capturar 1) LoginPage, 2) tabla con badges de colores,
     3) modal VehiculoForm, 4) mensaje recibido del recordatorio,
     5) respuesta del bot al consultar una placa -->

---

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Para colaborar:

1. Haz un **fork** del repositorio.
2. Crea una rama con tu mejora:
   ```bash
   git checkout -b feature/mi-mejora
   ```
3. Realiza los cambios y haz commit:
   ```bash
   git commit -m "feat: describe tu cambio"
   ```
4. Sube la rama y abre un **Pull Request** describiendo qué aporta.

Convenciones sugeridas:
- Mensajes de commit estilo [*Conventional Commits*](https://www.conventionalcommits.org/es/).
- Un tema por PR, con pruebas manuales documentadas.

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia **MIT**.

```
MIT License

Copyright (c) 2026 GNV Taller — Taller VC GAS

Por la presente se concede permiso, libre de cargos, a cualquier persona
que obtenga una copia de este software y de los archivos de documentación
asociados, a utilizar el software sin restricción, incluyendo sin
limitación los derechos a copiar, modificar, fusionar, publicar,
distribuir, sublicenciar, y/o vender copias del software, siempre que la
anterior nota de copyright y este aviso de permiso se incluyan en todas
las copias sustanciales del Software.

EL SOFTWARE SE PROPORCIONA "COMO ESTÁ", SIN GARANTÍA DE NINGÚN TIPO...
```

---

<div align="center">
  Hecho con ❤️ para el Taller VC GAS — Cochabamba, Bolivia 🇧🇴
</div>
