// ============================================================
//  src/modules/vehiculos/vehiculos.routes.js
//
//  Todos los endpoints exigen sesion.
//
//  Los GET tambien exigen rol de personal (administrador o
//  tecnico). Antes solo pedian `requireAuth`, asi que un usuario
//  con rol `cliente` podia hacer:
//
//      GET /api/vehiculos            -> ver TODOS los vehiculos
//      GET /api/vehiculos/8          -> ver el vehiculo de otro
//
//  incluyendo nombre, apellido y telefono del propietario. Eso es
//  un IDOR: conocer un ID no debe dar acceso a datos ajenos.
//
//  Que el cliente vea SUS vehiculos es trabajo del endpoint de
//  la app movil, no de este modulo, que es el panel del taller.
// ============================================================
import { Router } from 'express';
import { index, show, create, update, remove } from './vehiculos.controller.js';
import { requireAuth, requireAdmin, requireStaff } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.use(requireAuth);

router.get('/', requireStaff, asyncHandler(index));
router.get('/:id', requireStaff, asyncHandler(show));
router.post('/', requireStaff, asyncHandler(create));
router.put('/:id', requireStaff, asyncHandler(update));
router.delete('/:id', requireAdmin, asyncHandler(remove));

export default router;
