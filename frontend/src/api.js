// src/api.js — Capa de comunicación con el backend PHP
const BASE = 'http://localhost/backend';

async function request(endpoint, options = {}) {
  const res = await fetch(`${BASE}/${endpoint}`, {
    credentials: 'include',   // enviar cookie de sesión
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Error en el servidor');
  return data;
}

export const login          = (body)    => request('login.php',         { method: 'POST',   body: JSON.stringify(body) });
export const logout         = ()        => request('logout.php',        { method: 'POST' });
export const verificarSesion = ()       => request('verificar_permiso.php');
export const getVehiculos   = ()        => request('get_vehiculos.php');
export const addVehiculo    = (body)    => request('add_vehiculo.php',    { method: 'POST',   body: JSON.stringify(body) });
export const updateVehiculo = (body)    => request('update_vehiculo.php', { method: 'PUT',    body: JSON.stringify(body) });
export const deleteVehiculo = (id)      => request('delete_vehiculo.php', { method: 'DELETE', body: JSON.stringify({ id }) });
export const dispararRecordatorios = () => request('enviar_recordatorios.php');
