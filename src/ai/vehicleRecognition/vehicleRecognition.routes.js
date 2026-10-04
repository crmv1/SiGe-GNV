// ============================================================
//  src/ai/vehicleRecognition/vehicleRecognition.routes.js
//  Solo para personal del taller (tecnico o administrador).
// ============================================================
import { Router } from 'express';
import multer from 'multer';
import { reconocer, maletera, cilindros, estimacion } from './vehicleRecognition.controller.js';
import { requireAuth, requireStaff } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

// La imagen se procesa en memoria: no se guarda en disco.
const subir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

router.use(requireAuth, requireStaff);

router.post('/vehicle-recognition', subir.single('imagen'), asyncHandler(reconocer));
router.get('/maletera', asyncHandler(maletera));
router.get('/cilindros', asyncHandler(cilindros));
router.post('/estimacion', asyncHandler(estimacion));

export default router;
