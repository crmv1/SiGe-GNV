-- ============================================================
--  database/dev/datos_replica_3307.sql
--  DATOS SOLO PARA DESARROLLO. NUNCA EN LA BASE REAL.
--
--  ------------------------------------------------------------
--  PARA QUE EXISTE
--  ------------------------------------------------------------
--  `gnv_taller` en 127.0.0.1:3307 (la instancia de pruebas) esta
--  vacia: tiene el esquema de las migraciones 001-008, pero cero
--  filas. Sin datos no se puede probar que la migracion 009
--  respalde bien la informacion, y una migracion probada contra
--  una tabla vacia no prueba nada.
--
--  Este archivo carga una COPIA de la forma de los datos que hay
--  hoy en la base real, tomada de gnv_taller.sql (el dump del
--  14-08-2026): mismos vehiculos, mismos nombres, mismas placas,
--  mismos telefonos, mismo vencimiento.
--
--  Los passwords NO son los de la base real. Son inventados para
--  esta replica:
--
--      administrador  ->  DevAdmin2026!
--      tecnico        ->  DevTecnico2026!
--      cliente        ->  DevCliente2026!
--
--  Los hashes bcrypt de la base real no se copian a ningun lado.
--  No hay razon para que se propaguen.
--
--  El usuario `cliente` usa el telefono de Carlos Mamani a
--  proposito: sirve para comprobar que el enlace
--  usuarios -> clientes -> vehiculos funciona con datos de
--  verdad y no solo con una tabla vacia.
--
--  ------------------------------------------------------------
--  COMO SE USA
--  ------------------------------------------------------------
--    mariadb -h 127.0.0.1 -P 3307 -u gnv -p gnv_taller \
--      < database/dev/datos_replica_3307.sql
--
--  Es re-ejecutable: borra lo que creo y lo vuelve a crear.
--  Por eso borra filas. NUNCA correrlo contra localhost:3306.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";

START TRANSACTION;

-- Se limpia lo que esta replica define. Solo filas de prueba.
--
-- Las cuatro tablas de la migracion 009 todavia no existen la
-- primera vez que se corre este archivo, asi que sus borrados
-- van condicionados: si la tabla no esta, se salta. Asi el
-- seed funciona igual antes y despues de aplicar la 009.
DELETE FROM `recordatorios_enviados`;
DELETE FROM `notificaciones`;
DELETE FROM `dispositivos_push`;
DELETE FROM `codigos_activacion`;
DELETE FROM `movimientos_inventario`;
DELETE FROM `parametros_precios`;
DELETE FROM `inventario_productos`;

SET @t := 'inspecciones';
SET @sql := IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @t),
  'DELETE FROM `inspecciones`', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @t := 'recalificaciones';
SET @sql := IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @t),
  'DELETE FROM `recalificaciones`', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Primero los vehiculos: son el padre. Si se borrara el cilindro
-- antes, la FK de `vehiculos.id_cilindro` lo impediria.
DELETE FROM `vehiculos`;

SET @t := 'cilindros';
SET @sql := IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @t),
  'DELETE FROM `cilindros`', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @t := 'clientes';
SET @sql := IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @t),
  'DELETE FROM `clientes`', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

DELETE FROM `usuarios`;

-- ------------------------------------------------------------
--  Usuarios
-- ------------------------------------------------------------
INSERT INTO `usuarios` (`id`, `username`, `password`, `rol`, `estado`) VALUES
  (5, 'tecnico',       '$2a$10$/2SHPgGLKUi/fcMsd0phUuVEwwgFVR.tWoWM43GBrTOYNqUAyoHDi', 'tecnico',       'activo'),
  (6, 'administrador', '$2a$10$GxrP9Z3J6lFbEn.tqgvoEOVbAY1XsLbCKW.8bEEbhvHDp6tMRRGSG', 'administrador', 'activo'),
  (7, '59179795704',   '$2a$10$qUyOVx3VuEGDGGbIL2UU8eSS7oXt7mTW3LhsjlrLaHw7lTYIrr2ii', 'cliente',       'activo');

-- ------------------------------------------------------------
--  Vehiculos: los mismos cinco del dump, con los mismos ids
--  (falta el 5, como en la base real: se borro alguna vez).
--  `id_cliente` e `id_cilindro` los enlaza la migracion 009.
-- ------------------------------------------------------------
INSERT INTO `vehiculos`
  (`id`, `nombre`, `apellido`, `placa`, `fecha_recalificacion`, `fecha_inspeccion`, `telefono`, `created_at`, `updated_at`)
VALUES
  (1, 'Carlos',     'Mamani', '1234ABC', '2026-06-01', '2026-04-20', '59179795704', '2026-04-12 20:38:53', '2026-04-12 21:48:05'),
  (2, 'Erik',       'Vargas', '5678DEF', '2026-10-09', '2026-05-27', '59170725109', '2026-04-12 20:38:53', '2026-04-12 22:07:49'),
  (3, 'Roberto',    'Flores', '9012GHI', '2027-04-12', '2026-07-11', '59179360308', '2026-04-12 20:38:53', '2026-04-12 21:31:37'),
  (4, 'Marco',      'Gabela', '4455ABC', '2021-12-10', '2026-04-15', '59179770943', '2026-04-12 22:04:58', '2026-04-12 22:04:58'),
  (6, 'Cristhian',  'Lopez',  '1239ABC', '2025-12-10', '2025-01-10', '59170552057', '2026-06-02 22:50:57', '2026-06-02 22:50:57');

-- El recordatorio ya enviado que aparece en el dump.
INSERT INTO `recordatorios_enviados` (`id`, `vehiculo_id`, `tipo`, `fecha_envio`) VALUES
  (3, 1, 'recalificacion', '2026-05-05 17:03:43');

COMMIT;

-- Aviso: el `INSERT IGNORE` de la migracion 009 creara los
-- clientes desde estas filas. Para comprobarlo despues:
--
--    SELECT * FROM clientes ORDER BY id;
