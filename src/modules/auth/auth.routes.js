// ============================================================
//  src/modules/auth/auth.routes.js
// ============================================================
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, me, logout } from './auth.controller.js';
import { crearCodigo, activar } from './activacion.controller.js';
import { requireAuth, requireStaff } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

// Freno de fuerza bruta: 10 intentos por IP cada 15 minutos.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos de inicio de sesion. Intenta de nuevo en unos minutos.',
    code: 'RATE_LIMIT',
  },
});

// Freno del canje de codigos, MAS estricto que el del login.
//
// Un codigo de activacion es la prueba de que el taller autorizo
// esa cuenta, asi que adivinarlo es el ataque. El codigo tiene
// 2^50 combinaciones, pero se teclea: al ritmo de alguien que
// prueba a mano, el cuello de botella no es el hash sino el
// numero de intentos. 5 por IP cada 15 minutos lo deja imposible
// de fuerza bruta sin frenar a un cliente que se equivoca tres
// veces escribiendo de un papel.
//
// Va aparte del loginLimiter a proposito: son dos cubos
// distintos y compartirlos exhaustaria el cupo del login de un
// taller entero que esta probando.
const activacionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos de activacion. Pide un codigo nuevo al taller.',
    code: 'RATE_LIMIT',
  },
});

router.post('/login', loginLimiter, asyncHandler(login));
router.get('/me', requireAuth, asyncHandler(me));
router.post('/logout', requireAuth, asyncHandler(logout));

// El taller emite codigos: exige rol de personal. Si cualquiera
// pudiera pedir un codigo para cualquier telefono, la activacion
// no probaria nada.
router.post('/codigos', requireAuth, requireStaff, asyncHandler(crearCodigo));

// El cliente canjea el codigo. Sin sesion: todavia no tiene
// cuenta. Es lo unico publico de este router ademas del login.
router.post('/activar', activacionLimiter, asyncHandler(activar));

export default router;
