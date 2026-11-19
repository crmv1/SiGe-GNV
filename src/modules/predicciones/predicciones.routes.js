import { Router } from 'express';
import { requireAuth, requireStaff } from '../../middleware/auth.js';
import { obtenerProyeccion } from './predicciones.controller.js';

const router = Router();

router.use(requireAuth, requireStaff);
router.get('/', obtenerProyeccion);

export default router;
