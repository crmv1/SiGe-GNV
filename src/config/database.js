// ============================================================
//  src/config/database.js
//  Conexion unica a MariaDB. Pool centralizado.
//
//  Driver: mysql2/promise. MariaDB es totalmente compatible con
//  el protocolo que usa mysql2, y el driver oficial `mariadb`
//  no aporta nada que necesitemos aqui. Se mantiene mysql2
//  porque ademas es el mas compatible con el ecosistema.
//
//  Este es el UNICO lugar del proyecto que abre conexiones.
// ============================================================
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import env from './env.js';

// --- Limites de conexion ------------------------------------------
const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  timezone: 'Z',
  dateStrings: ['DATE'],
  // Tiene que ser la MISMA collation que usan las tablas.
  // Con `utf8mb4_unicode_ci` aqui y `utf8mb4_general_ci` en el
  // esquema, MariaDB rechaza toda comparacion de texto con
  // ER_CANT_AGGREGATE_2COLLATIONS ("Illegal mix of collations")
  // en cuanto se escribe algo como WHERE estado = 'activo'.
  // MySQL lo tolera; MariaDB no.
  charset: 'utf8mb4_general_ci',
  multipleStatements: false,
  ...(env.db.ssl
    ? {
        ssl: {
          ...(env.db.sslCa ? { ca: env.db.sslCa } : {}),
          // Nunca se desactiva la validacion del certificado.
          rejectUnauthorized: true,
        },
      }
    : {}),
});

pool.on('connection', () => {
  console.log('[db] Nueva conexion al pool de MariaDB');
});

/**
 * Obtiene una conexion liberable del pool.
 * Usar siempre con try/finally o el pool se queda sin conexiones.
 */
export async function getConnection() {
  return pool.getConnection();
}

/** Ejecuta una consulta y devuelve las filas. */
export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Ejecuta una consulta y devuelve la primera fila, o undefined. */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0];
}

/**
 * Ejecuta dentro de una transaccion.
 * Si la funcion lanza, se hace ROLLBACK.
 */
export async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      /* la conexion ya esta muerta, el pool la descartara */
    }
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Prueba de conexion. No lanza: devuelve el estado.
 * Se usa en /api/health.
 */
export async function checkConnection() {
  try {
    await pool.query('SELECT 1');
    return { connected: true };
  } catch (error) {
    console.error('[db] Error de conexion:', error.code || error.name);
    return { connected: false, code: error.code || 'UNKNOWN' };
  }
}

/** Identifica el motor y la version realmente en uso. */
export async function getServerInfo() {
  const rows = await query('SELECT VERSION() AS version, DATABASE() AS db');
  return rows[0];
}

export async function closePool() {
  await pool.end();
}

export default pool;
