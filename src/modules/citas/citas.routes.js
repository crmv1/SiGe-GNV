import { Router } from 'express';
import { requireAuth, requireStaff, requireAdmin } from '../../middleware/auth.js';
import { listarCitas, crearCita, listarClientesAgenda } from './citas.controller.js';
import { listarUsuariosClientes } from './citas.usuarios.controller.js';
import { cambiarEstado } from './citas.estados.controller.js';
import { reprogramarCitaWeb, cancelarCitaWeb } from './citas.web.actions.controller.js';
import { historialCita } from './cita.historial.controller.js';

const router = Router();

router.use(requireAuth, requireStaff);
router.get('/', listarCitas);
router.get('/clientes', listarClientesAgenda);
router.get('/usuarios-clientes', requireAdmin, listarUsuariosClientes);
router.post('/', crearCita);
router.patch('/:id/estado', cambiarEstado);
router.patch('/:id/reprogramar', reprogramarCitaWeb);
router.patch('/:id/cancelar', cancelarCitaWeb);

export default router;

