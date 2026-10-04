// ============================================================
//  src/app.js
//  Configuracion de Express. Sin escuchar en el puerto: eso lo
//  hace src/server.js.
// ============================================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // Detras de un proxy (Nginx, Caddy) para conocer la IP real
  // y que el limite de tasa por IP funcione.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // La API no sirve HTML, solo JSON.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // CORS configurado por variable de entorno. Nunca "*" en produccion.
  app.use(
    cors({
      origin(origin, callback) {
        // Sin origin = peticion desde app movil, curl o server to server.
        if (!origin) return callback(null, true);

        if (env.corsOrigins.includes(origin)) return callback(null, true);

        return callback(new Error('Origen no permitido por CORS.'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      maxAge: 86400,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
