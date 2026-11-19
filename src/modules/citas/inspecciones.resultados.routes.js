import { Router } from 'express';
import { requireAuth, requireStaff } from '../../middleware/auth.js';
import { registrarResultado, listarResultados } from './inspecciones.resultados.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/resultados', listarResultados);
router.post('/resultados', requireStaff, registrarResultado);

export default router;
