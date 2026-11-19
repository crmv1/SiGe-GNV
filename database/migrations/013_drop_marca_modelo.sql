-- ============================================================
--  database/migrations/013_drop_marca_modelo.sql
--  Retira del registro del vehiculo la marca y el modelo.
--
--  ------------------------------------------------------------
--  POR QUE
--  ------------------------------------------------------------
--  La 012 agrego `vehiculos.marca` y `vehiculos.modelo` para la
--  app movil. El usuario descarto esos datos: el taller guarda
--  solo propietario, placa, telefono y fechas de inspeccion y
--  recalificacion. Ningun modulo, consulta ni la IA los leen de
--  la tabla (la IA usa sus propias clases de ejemplo, no estas
--  columnas).
--
--  ------------------------------------------------------------
--  QUE HACE
--  ------------------------------------------------------------
--  1) Quita el indice `idx_marca`.
--  2) Quita las columnas `marca` y `modelo`.
--
--  No borra ni modifica filas. Es re-ejecutable: pregunta a
--  information_schema antes de cada ALTER, asi que correrla dos
--  veces no falla.
--
--  La 012 NO se edita: queda como historia. Al correr las
--  migraciones en orden, la 012 agrega las columnas y la 013 las
--  vuelve a quitar; el estado final es el correcto.
-- ============================================================

-- 1) Indice idx_marca (si todavia existe).
SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'vehiculos'
        AND INDEX_NAME   = 'idx_marca') > 0,
    'ALTER TABLE `vehiculos` DROP INDEX `idx_marca`',
    'SELECT 1'
  )
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2) Columna modelo (si todavia existe).
SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'vehiculos'
        AND COLUMN_NAME  = 'modelo') > 0,
    'ALTER TABLE `vehiculos` DROP COLUMN `modelo`',
    'SELECT 1'
  )
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3) Columna marca (si todavia existe).
SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'vehiculos'
        AND COLUMN_NAME  = 'marca') > 0,
    'ALTER TABLE `vehiculos` DROP COLUMN `marca`',
    'SELECT 1'
  )
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Comprobacion: no debe devolver ninguna fila.
SELECT COLUMN_NAME
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'vehiculos'
   AND COLUMN_NAME IN ('marca', 'modelo');
