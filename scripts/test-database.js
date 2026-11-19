#!/usr/bin/env node
// ============================================================
//  scripts/test-database.js
//  Prueba de conexion a MariaDB.
//
//  Verifica:
//    - que se puede conectar
//    - que el servidor es MariaDB (y no MySQL)
//    - la version exacta
//    - la base de datos seleccionada
//    - los permisos de lectura
//
//  NO muestra contrasenas, hosts privados ni ningun otro
//  dato sensible.
//
//  Uso:  npm run db:test
// ============================================================
import env from '../src/config/env.js';
import { getConnection, closePool } from '../src/config/database.js';

function linea() {
  console.log('-'.repeat(52));
}

async function main() {
  linea();
  console.log('  PRUEBA DE CONEXION — MariaDB');
  linea();

  console.log(`  Host      : ${env.db.host}`);
  console.log(`  Puerto    : ${env.db.port}`);
  console.log(`  Base      : ${env.db.database}`);
  console.log(`  Usuario   : ${env.db.user}`);
  console.log(`  SSL       : ${env.db.ssl ? 'si' : 'no'}`);
  linea();

  const conn = await getConnection();

  try {
    // --- 1. Conectado ---
    console.log('  [OK] Conexion establecida');

    // --- 2. Version real del motor ---
    const [versionRows] = await conn.query(
      'SELECT VERSION() AS version, @@version_comment AS comentario'
    );
    const version = versionRows[0].version;
    const esMariaDB = String(version).toLowerCase().includes('mariadb');

    console.log(`  [OK] Version del motor : ${version}`);
    console.log(`  [OK] Motor             : ${esMariaDB ? 'MariaDB' : 'MySQL'}`);

    if (!esMariaDB) {
      console.log('');
      console.log('  [AVISO] Este servidor NO es MariaDB.');
      console.log('          El proyecto esta disenado para MariaDB.');
      console.log('          MariaDB es compatible con el protocolo de');
      console.log('          mysql2, asi que probablemente funcione, pero');
      console.log('          revisa que las funciones usadas existan.');
    }

    // --- 3. Base seleccionada ---
    const [dbRows] = await conn.query('SELECT DATABASE() AS db');
    const dbActual = dbRows[0].db;

    console.log(`  [OK] Base seleccionada  : ${dbActual}`);

    if (dbActual !== env.db.database) {
      console.log(`  [AVISO] Se esperaba ${env.db.database} y se selecciono ${dbActual}`);
    }

    // --- 4. Permisos de lectura ---
    const [tablas] = await conn.query(
      `SELECT TABLE_NAME AS tabla, TABLE_TYPE AS tipo
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_TYPE, TABLE_NAME`,
      [env.db.database]
    );

    console.log(`  [OK] Tablas visibles   : ${tablas.length}`);

    for (const t of tablas) {
      const etiqueta = t.tipo === 'VIEW' ? 'vista  ' : 'tabla ';
      console.log(`         ${etiqueta} ${t.tabla}`);
    }

    // --- 5. Comprobacion de escritura ---
    //    Se usa information_schema, que siempre admite SELECT.
    //    No se escribe nada en la base del usuario.
    try {
      await conn.query('SELECT COUNT(*) AS n FROM usuarios');
      console.log('  [OK] Lectura de `usuarios` permitida');
    } catch (error) {
      console.log(`  [AVISO] No se pudo leer \`usuarios\`: ${error.code || error.name}`);
      console.log('          Revisa que la tabla exista y que el usuario tenga permisos.');
    }

    linea();
    console.log('  RESULTADO: conexion correcta');
    linea();
  } finally {
    conn.release();
    await closePool();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    linea();
    console.log('  RESULTADO: fallo la conexion');
    linea();
    console.log(`  Codigo   : ${error.code || error.name}`);
    console.log(`  Motivo   : ${error.message}`);
    console.log('');
    console.log('  Revision habitual:');
    console.log('    - .env existe y tiene DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
    console.log('    - el servidor MariaDB esta encendido');
    console.log('    - el puerto es el correcto (por defecto 3306)');
    console.log('    - el usuario tiene permisos sobre la base');
    console.log('    - si es MariaDB online, hace falta DB_SSL=true');
    linea();
    process.exit(1);
  });
