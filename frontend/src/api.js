// src/api.js
// Capa de comunicacion con la API Node.js/Express.
//
// La app web NUNCA se conecta a la base de datos. Solo consume
// la API, que es la unica que habla con MariaDB.
//
// La URL viene de VITE_API_URL. En produccion debe ser HTTPS:
//   VITE_API_URL=https://api.tudominio.com
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3100';

const TOKEN_KEY = 'gnv_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(endpoint, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();

  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}/api${endpoint}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor.');
  }

  // 204 o cuerpo vacio: se normaliza.
  if (res.status === 204) return { success: true };

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Respuesta invalida del servidor.');
  }

  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'Error en el servidor');
  }

  return data;
}

// --- Sesion ---------------------------------------------------------
// La respuesta trae `token`: el backend usa JWT, ya no cookies de
// sesion PHP. El frontend lo guarda y lo envia en cada peticion.
export const login = (body) => request('/auth/login', { method: 'POST', body, auth: false });

export function verificarSesion() {
  return request('/auth/me', { auth: true });
}

// --- Activacion de cuenta --------------------------------------------
// El taller entrega un codigo en mano. El cliente lo teclea junto
// con el usuario y la contrasena que quiere usar, y el canje queda
// ligado a su ficha. `auth: false` porque todavia no hay token:
// todavia no existe una sesion que mandar.
export const activarCuenta = (body) =>
  request('/auth/activar', { method: 'POST', body, auth: false });

export async function logout() {
  try {
    await request('/auth/logout', { method: 'POST' });
  } catch {
    // Un 401 al cerrar sesion no es un problema: el token se
    // descarta igual del lado del cliente.
  }
  setToken(null);
}

// --- Vehiculos ------------------------------------------------------
export const getVehiculos = () => request('/vehiculos');

export const getVehiculo = (id) => request(`/vehiculos/${id}`);

export const addVehiculo = (body) => request('/vehiculos', { method: 'POST', body });

export const updateVehiculo = (id, body) =>
  request(`/vehiculos/${id}`, { method: 'PUT', body });

export const deleteVehiculo = (id) => request(`/vehiculos/${id}`, { method: 'DELETE' });

// --- Consulta publica por placa (sin sesion) -------------------------
export const consultarPlaca = (placa) =>
  request(`/public/consulta/placa/${encodeURIComponent(placa)}`, { auth: false });

// --- Inventario -------------------------------------------------------
// El backend decide por rol: el administrador crea y mueve stock,
// el tecnico solo consulta, y el rol `cliente` recibe 403 en todo
// lo que hay aqui. La app movil de clientes no usa ninguna de
// estas funciones.
//
// El stock no se edita con un PUT. Cambia solo por movimientos:
// ENTRADA, SALIDA o AJUSTE. Asi todo cambio queda en el historial.
export const getProductos = (filtros = {}) => {
  const params = new URLSearchParams();

  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') {
      params.append(clave, valor);
    }
  }

  const qs = params.toString();
  return request(`/inventario/productos${qs ? `?${qs}` : ''}`);
};

export const getProducto = (id) => request(`/inventario/productos/${id}`);

export const addProducto = (body) => request('/inventario/productos', { method: 'POST', body });

export const updateProducto = (id, body) =>
  request(`/inventario/productos/${id}`, { method: 'PUT', body });

export const getMovimientos = (filtros = {}) => {
  const params = new URLSearchParams();

  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') {
      params.append(clave, valor);
    }
  }

  const qs = params.toString();
  return request(`/inventario/movimientos${qs ? `?${qs}` : ''}`);
};

export const registrarMovimiento = (body) =>
  request('/inventario/movimientos', { method: 'POST', body });

export const getAlertasStock = () => request('/inventario/alertas');

export const getResumenInventario = () => request('/inventario/resumen');

// --- Salud del sistema ---------------------------------------------
export const health = () => request('/health', { auth: false });
