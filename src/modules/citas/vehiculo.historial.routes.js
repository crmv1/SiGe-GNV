import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { getHistorialVehiculo } from './vehiculo.historial.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/vehiculos/:id/historial', getHistorialVehiculo);

export default router;
