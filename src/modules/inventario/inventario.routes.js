// ============================================================
//  src/modules/inventario/inventario.routes.js
//
//  Permisos, segun lo pedido para el taller:
//
//    ADMINISTRADOR  crea y edita productos, registra entradas,
//                   salidas y ajustes, consulta el historial y
//                   configura el stock minimo.
//    TECNICO        solo consulta stock y alertas. No puede
//                   crear, editar ni mover nada: hasta que exista
//                   una logica que lo autorice, el tecnico no
//                   toca el inventario.
//    CLIENTE        sin acceso. La app movil de clientes no
//                   tiene ninguna ruta de inventario, y el rol
//                   `cliente` tampoco pasa `requireStaff`.
//
//  Nota: no hay ruta DELETE. Un producto con movimientos no se
//  borra, se da de baja con `estado = 'inactivo'`.
// ============================================================
import { Router } from 'express';
import {
  index,
  show,
  create,
  update,
  indexMovimientos,
  showMovimiento,
  createMovimiento,
  alertas,
  resumen,
} from './inventario.controller.js';
import { requireAuth, requireAdmin, requireStaff } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

// Todas las rutas de inventario exigen sesion. A partir de ahi,
// `requireStaff` deja pasar a administrador y tecnico, y frena al
// cliente antes de tocar cualquier dato.
router.use(requireAuth);

router.get('/resumen', requireStaff, asyncHandler(resumen));
router.get('/alertas', requireStaff, asyncHandler(alertas));

router.get('/productos', requireStaff, asyncHandler(index));
router.get('/productos/:id', requireStaff, asyncHandler(show));
router.post('/productos', requireAdmin, asyncHandler(create));
router.put('/productos/:id', requireAdmin, asyncHandler(update));

router.get('/movimientos', requireAdmin, asyncHandler(indexMovimientos));
router.get('/movimientos/:id', requireAdmin, asyncHandler(showMovimiento));
router.post('/movimientos', requireAdmin, asyncHandler(createMovimiento));

export default router;
