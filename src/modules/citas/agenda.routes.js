import { Router } from 'express';
import { getDisponibilidad } from './agenda.controller.js';
import * as cfg from './agenda.config.service.js';
import { requireAuth, requireAdmin, requireStaff } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.get('/disponibilidad', getDisponibilidad);

router.use(requireAuth, requireStaff);
router.get('/config', asyncHandler(async (_req, res) => {
  const config = await cfg.obtenerConfig();
  res.json({ success: true, config });
}));
router.put('/config/:id', requireAdmin, asyncHandler(async (req, res) => {
  const config = await cfg.actualizarConfig(req.params.id, req.body, req.user.id);
  res.json({ success: true, config });
}));

export default router;
