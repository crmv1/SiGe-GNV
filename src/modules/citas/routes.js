import { Router } from 'express';
import citasRoutes from './citas.routes.js';
import agendaRoutes from './agenda.routes.js';
import clienteCitasRoutes from './cliente.citas.routes.js';
import resultadosRoutes from './inspecciones.resultados.routes.js';
import vehiculoHistorialRoutes from './vehiculo.historial.routes.js';

const router = Router();

router.use('/citas', citasRoutes);
router.use('/agenda', agendaRoutes);
router.use('/cliente', clienteCitasRoutes);
router.use(resultadosRoutes);
router.use(vehiculoHistorialRoutes);

export default router;


