// ============================================================
//  src/modules/notificaciones/notificaciones.routes.js
//  Solo WPConnect accede a esto, mediante API Key.
// ============================================================
import { Router } from 'express';
import { pendientes, enviada, error } from './notificaciones.controller.js';
import { requireIntegrationKey } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.use(requireIntegrationKey);

router.get('/pendientes', asyncHandler(pendientes));
router.post('/notificaciones/:id/enviada', asyncHandler(enviada));
router.post('/notificaciones/:id/error', asyncHandler(error));

export default router;
