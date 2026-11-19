// ============================================================
//  src/modules/public/public.routes.js
//  Endpoints publicos: sin sesion, con freno de tasa.
// ============================================================
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { consultaPlaca, chatbot } from './public.controller.js';
import { requireIntegrationKey } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

const limitador = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas consultas. Intenta en un minuto.',
    code: 'RATE_LIMIT',
  },
});

router.get('/consulta/placa/:placa', limitador, asyncHandler(consultaPlaca));

// El chatbot va en /public pero si exige API Key: lo consume WPConnect,
// no un visitante anonimo.
router.post('/chatbot', limitador, requireIntegrationKey, asyncHandler(chatbot));

export default router;
