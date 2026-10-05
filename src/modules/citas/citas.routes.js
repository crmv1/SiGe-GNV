import { Router } from 'express';
import { requireAuth, requireStaff } from '../../middleware/auth.js';
import { listarCitas, crearCita } from './citas.controller.js';
import { cambiarEstado } from './citas.estados.controller.js';
import { reprogramarCitaWeb, cancelarCitaWeb } from './citas.web.actions.controller.js';
import { historialCita } from './cita.historial.controller.js';

const router = Router();

router.use(requireAuth, requireStaff);
router.get('/', listarCitas);
router.post('/', crearCita);
router.patch('/:id/estado', cambiarEstado);
router.patch('/:id/reprogramar', reprogramarCitaWeb);
router.patch('/:id/cancelar', cancelarCitaWeb);

export default router;

