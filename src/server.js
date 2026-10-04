// ============================================================
//  src/server.js
//  Punto de entrada de la API.
// ============================================================
import env from './config/env.js';
import { createApp } from './app.js';
import { checkConnection, closePool } from './config/database.js';
import { iniciarJobRecordatorios } from './jobs/recordatorios.job.js';
import logger from './utils/logger.js';

const app = createApp();

async function arrancar() {
  // La base es MariaDB. Si no responde, se avisa pero el proceso
  // sigue vivo: /api/health debe poder reportar "disconnected".
  const db = await checkConnection();

  if (!db.connected) {
    logger.warn('MariaDB no responde al arrancar. Revisa las variables de entorno del .env', {
      host: env.db.host,
      port: env.db.port,
      database: env.db.database,
    });
  } else {
    logger.info('Conectado a MariaDB', {
      host: env.db.host,
      port: env.db.port,
      database: env.db.database,
    });
  }

  if (env.isProduction) {
    iniciarJobRecordatorios();
  }

  const server = app.listen(env.port, () => {
    logger.info(`API escuchando en http://localhost:${env.port}`, {
      entorno: env.nodeEnv,
    });
  });

  const apagar = async (senal) => {
    logger.info(`${senal} recibido. Cerrando...`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    // Salida forzada si algo queda colgado.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => apagar('SIGINT'));
  process.on('SIGTERM', () => apagar('SIGTERM'));
}

arrancar().catch((error) => {
  logger.error('No se pudo arrancar el servidor', {
    name: error.name,
    message: error.message,
  });
  process.exit(1);
});
