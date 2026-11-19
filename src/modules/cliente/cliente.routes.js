// ============================================================
//  src/modules/cliente/cliente.routes.js
//
//  La vista del cliente. Exige sesion, y el alcance lo define
//  el SQL de cliente.service.js: siempre `clientes.id_usuario
//  = req.user.id`.
//
//  ------------------------------------------------------------
//  POR QUE NO SE USA requireStaff NI requireAdmin
//  ------------------------------------------------------------
//  Los dos middlewares de rol sirven para el panel del taller,
//  donde el permiso depende del cargo. Aqui el permiso no
//  depende del cargo: depende de ser uno mismo. El tecnico que
//  tambien sea cliente ve SUS autos, y el administrador tambien,
//  si tiene cuenta.
//
//  Escribir `requireStaff` aca seria un error de lectura: dira
//  "esto es para el taller" cuando es lo contrario, y el
//  siguiente que lo lea va a poner un requireStaff encima
//  "para ser seguro" y va a romper la app otra vez.
// ============================================================
import { Router } from 'express';
import { index, show, notificaciones, marcarLeida, crearDispositivo, desactivarDispositivos } from './cliente.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.use(requireAuth);

router.get('/vehiculos', asyncHandler(index));
router.get('/vehiculos/:id', asyncHandler(show));

// Avisos del cliente. El alcance lo pone el SQL, no un filtro en
// JavaScript: un `WHERE c.id_usuario = ?` en la consulta no se
// puede olvidar en un `return` temprano.
router.get('/notificaciones', asyncHandler(notificaciones));
router.patch('/notificaciones/:id/leida', asyncHandler(marcarLeida));

// Token de push del telefono.
router.post('/dispositivos', asyncHandler(crearDispositivo));
router.post('/dispositivos/desactivar', asyncHandler(desactivarDispositivos));

export default router;
