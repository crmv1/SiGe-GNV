import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { listarMisCitas, crearCitaMóvil } from './cliente.citas.controller.js';
import { cancelarCitaCliente, reprogramarCitaCliente } from './cliente.citas.actions.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/mis-citas', listarMisCitas);
router.post('/citas', crearCitaMóvil);
router.patch('/citas/:id/cancelar', cancelarCitaCliente);
router.patch('/citas/:id/reprogramar', reprogramarCitaCliente);

export default router;
