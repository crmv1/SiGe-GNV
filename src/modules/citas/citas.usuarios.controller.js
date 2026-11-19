import { asyncHandler } from '../../utils/asyncHandler.js';
import { query } from '../../config/database.js';

/**
 * GET /citas/usuarios-clientes   (admin)
 *
 * Lista todos los usuarios con rol `cliente` (los que pueden entrar
 * a la app móvil), junto con su ficha de cliente y sus vehículos.
 * Es lo que el admin necesita ver para saber quién tiene cuenta y
 * qué placas le corresponden.
 */
export const listarUsuariosClientes = asyncHandler(async (_req, res) => {
  // Usuarios cliente con su ficha de cliente (si está vinculada).
  const usuarios = await query(
    `SELECT u.id AS usuario_id, u.username, u.rol, u.estado,
            c.id AS cliente_id, c.nombre, c.apellido, c.telefono
       FROM usuarios u
       LEFT JOIN clientes c ON c.id_usuario = u.id
      WHERE u.rol = 'cliente'
      ORDER BY c.nombre, c.apellido, u.username`
  );

  // Vehículos de cada cliente vinculado.
  const vehiculos = await query(
    `SELECT v.id, v.placa, v.tipo_vehiculo, v.id_cliente
       FROM vehiculos v
       JOIN clientes c ON c.id = v.id_cliente
      WHERE c.id_usuario IS NOT NULL
      ORDER BY c.nombre, v.placa`
  );

  // Se agrupan los vehículos por cliente_id.
  const vehiculosPorCliente = {};
  for (const v of vehiculos) {
    if (!vehiculosPorCliente[v.id_cliente]) vehiculosPorCliente[v.id_cliente] = [];
    vehiculosPorCliente[v.id_cliente].push({
      id: v.id,
      placa: v.placa,
      tipo_vehiculo: v.tipo_vehiculo,
    });
  }

  // Se arma la salida: cada usuario con su cliente y sus vehículos.
  const lista = usuarios.map((u) => ({
    usuario_id: u.usuario_id,
    username: u.username,
    estado: u.estado,
    cliente: u.cliente_id
      ? {
          id: u.cliente_id,
          nombre: u.nombre,
          apellido: u.apellido,
          telefono: u.telefono,
        }
      : null,
    vehiculos: u.cliente_id ? (vehiculosPorCliente[u.cliente_id] || []) : [],
    vinculado: Boolean(u.cliente_id),
  }));

  res.json({ success: true, usuarios: lista });
});
