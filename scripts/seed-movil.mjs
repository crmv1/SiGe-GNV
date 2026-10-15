// ============================================================
//  scripts/seed-movil.mjs
//  Crea/limpia los datos de prueba de la app movil en 3307.
//  Re-ejecutable: borra lo suyo y lo vuelve a crear.
//
//  Uso:
//    node scripts/seed-movil.mjs            (usa env o .env de 3307 via con-3307)
//    .\scripts\con-3307.ps1 scripts\seed-movil.mjs
//
//  Crea:
//    pruebamovil1 / Prueba123!  cliente Carlos  placa 123ABC  2 avisos (1 sin leer)
//    pruebamovil2 / Prueba123!  cliente Ana     placa 4567DEF 0 avisos
// ============================================================
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || 'gnv',
  password: process.env.DB_PASSWORD || 'gnvtest',
  database: process.env.DB_NAME || 'gnv_taller',
  multipleStatements: true,
});

const hash = bcrypt.hashSync('Prueba123!', 10);

await conn.beginTransaction();

try {
  // Limpia solo lo de estas cuentas de prueba (por username/placa).
  await conn.query(
    `DELETE n FROM notificaciones n
     JOIN vehiculos v ON v.id = n.id_vehiculo
     WHERE v.placa IN ('123ABC','4567DEF')`
  );
  await conn.query(
    `DELETE FROM dispositivos_push WHERE id_usuario IN (
       SELECT id FROM usuarios WHERE username IN ('pruebamovil1','pruebamovil2'))`
  );
  await conn.query(
    `DELETE FROM codigos_activacion WHERE id_cliente IN (
       SELECT id FROM clientes WHERE telefono IN ('59170000001','59170000002'))`
  );
  await conn.query(
    `DELETE FROM inspecciones WHERE id_vehiculo IN (
       SELECT id FROM vehiculos WHERE placa IN ('123ABC','4567DEF'))`
  );
  await conn.query(
    `DELETE FROM recalificaciones WHERE id_vehiculo IN (
       SELECT id FROM vehiculos WHERE placa IN ('123ABC','4567DEF'))`
  );
  // Desvincula y borra los vehiculos de prueba.
  await conn.query(
    `UPDATE vehiculos SET id_cliente = NULL WHERE placa IN ('123ABC','4567DEF')`
  );
  await conn.query(`DELETE FROM vehiculos WHERE placa IN ('123ABC','4567DEF')`);
  // Borra usuarios y clientes de prueba.
  await conn.query(
    `DELETE FROM clientes WHERE telefono IN ('59170000001','59170000002')`
  );
  await conn.query(
    `DELETE FROM usuarios WHERE username IN ('pruebamovil1','pruebamovil2')`
  );

  // ---- pruebamovil1 / Carlos / 123ABC ----
  const [u1] = await conn.query(
    `INSERT INTO usuarios (username, password, rol, estado) VALUES (?, ?, 'cliente', 'activo')`,
    ['pruebamovil1', hash]
  );
  const idU1 = u1.insertId;
  const [c1] = await conn.query(
    `INSERT INTO clientes (nombre, apellido, telefono, id_usuario) VALUES (?, ?, ?, ?)`,
    ['Carlos', 'Mamani Prueba', '59170000001', idU1]
  );
  const idC1 = c1.insertId;
  const [v1] = await conn.query(
    `INSERT INTO vehiculos (nombre, apellido, placa, fecha_recalificacion, fecha_inspeccion, telefono, id_cliente)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['Carlos', 'Mamani Prueba', '123ABC', '2027-06-20', '2027-10-09', '59170000001', idC1]
  );
  const idV1 = v1.insertId;
  // Inspeccion: realizada 2026-10-09, vence 2027-10-09 (por_vencer).
  await conn.query(
    `INSERT INTO inspecciones (id_vehiculo, fecha_realizada, fecha_vencimiento) VALUES (?, '2026-10-09', '2027-10-09')`,
    [idV1]
  );
  // Recalificacion: realizada 2022-06-20, vence 2027-06-20 (vigente).
  await conn.query(
    `INSERT INTO recalificaciones (id_vehiculo, fecha_realizada, fecha_vencimiento) VALUES (?, '2022-06-20', '2027-06-20')`,
    [idV1]
  );
  // 2 avisos (1 sin leer).
  await conn.query(
    `INSERT INTO notificaciones (id_vehiculo, tipo, dias_anticipacion, titulo, mensaje, telefono, fecha_programada, estado, leida) VALUES
     (?, 'inspeccion', 10, 'Inspeccion proxima a vencer', 'Su vehiculo 123ABC tiene la inspeccion por vencer. Agende su cita.', '59170000001', '2027-09-29', 'enviada', 0),
     (?, 'recalificacion', 10, 'Recalificacion registrada', 'Se registro la recalificacion del vehiculo 123ABC. Proximo vencimiento 2027-06-20.', '59170000001', '2027-06-10', 'enviada', 1)`,
    [idV1, idV1]
  );

  // ---- pruebamovil2 / Ana / 4567DEF ----
  const [u2] = await conn.query(
    `INSERT INTO usuarios (username, password, rol, estado) VALUES (?, ?, 'cliente', 'activo')`,
    ['pruebamovil2', hash]
  );
  const idU2 = u2.insertId;
  const [c2] = await conn.query(
    `INSERT INTO clientes (nombre, apellido, telefono, id_usuario) VALUES (?, ?, ?, ?)`,
    ['Ana', 'Vargas Prueba', '59170000002', idU2]
  );
  const idC2 = c2.insertId;
  const [v2] = await conn.query(
    `INSERT INTO vehiculos (nombre, apellido, placa, fecha_recalificacion, fecha_inspeccion, telefono, id_cliente)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['Ana', 'Vargas Prueba', '4567DEF', '2027-08-15', '2027-11-20', '59170000002', idC2]
  );
  const idV2 = v2.insertId;
  await conn.query(
    `INSERT INTO inspecciones (id_vehiculo, fecha_realizada, fecha_vencimiento) VALUES (?, '2026-11-20', '2027-11-20')`,
    [idV2]
  );
  await conn.query(
    `INSERT INTO recalificaciones (id_vehiculo, fecha_realizada, fecha_vencimiento) VALUES (?, '2022-08-15', '2027-08-15')`,
    [idV2]
  );

  await conn.commit();
  console.log('[OK] Seed movil creado: pruebamovil1 (123ABC, 2 avisos) y pruebamovil2 (4567DEF, 0 avisos).');
} catch (e) {
  await conn.rollback();
  console.error('[ERROR] Seed movil fallo, rollback:', e.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
