// ============================================================
//  src/routes/index.js
//  Mapa de endpoints de la API.
// ============================================================
import { Router } from 'express';
import { checkConnection, getServerInfo } from '../config/database.js';
import env from '../config/env.js';
import authRoutes from '../modules/auth/auth.routes.js';
import vehiculosRoutes from '../modules/vehiculos/vehiculos.routes.js';
import clienteRoutes from '../modules/cliente/cliente.routes.js';
import publicRoutes from '../modules/public/public.routes.js';
import notificacionesRoutes from '../modules/notificaciones/notificaciones.routes.js';
import inventarioRoutes from '../modules/inventario/inventario.routes.js';
import aiRoutes from '../ai/vehicleRecognition/vehicleRecognition.routes.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

/**
 * GET /api/health
 * Respuesta segura. Nunca devuelve credenciales ni detalles internos.
 */
router.get('/health', asyncHandler(async (_req, res) => {
  const db = await checkConnection();

  // Fuera de produccion, el health declara a que puerto esta
  // conectada la API. Es lo que permite que los scripts de
  // validacion se neguen a correr si el servidor apunta a la
  // base real en vez de a la de pruebas.
  //
  // En produccion NO se envia: un health publico no tiene por
  // que contarle a nadie en que puerto esta el motor, y menos
  // todavia cuando ese puerto distingue desarrollo de datos de
  // clientes.
  if (!env.isProduction) {
    res.set('X-DB-Puerto', String(env.db.port));
  }

  res.status(db.connected ? 200 : 503).json({
    status: db.connected ? 'ok' : 'error',
    database: db.connected ? 'connected' : 'disconnected',
  });
}));

/**
 * GET /api/version
 * Identifica el motor en uso. No expone credenciales.
 */
router.get('/version', asyncHandler(async (_req, res) => {
  const info = await getServerInfo();

  res.json({
    success: true,
    version: info.version,
    motor: String(info.version).toLowerCase().includes('mariadb') ? 'mariadb' : 'mysql',
  });
}));

// --- Modulos ---
router.use('/auth', authRoutes);
router.use('/vehiculos', vehiculosRoutes);
router.use('/cliente', clienteRoutes);
router.use('/public', publicRoutes);
router.use('/integrations/whatsapp', notificacionesRoutes);
router.use('/inventario', inventarioRoutes);
router.use('/ai', aiRoutes);

export default router;
