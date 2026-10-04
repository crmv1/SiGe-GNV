-- ============================================================
--  database/migrations/012_marca_modelo_y_push_cliente.sql
--  Lo que necesita la app movil de clientes.
--
--  ------------------------------------------------------------
--  QUE AGREGA
--  ------------------------------------------------------------
--  1) vehiculos.marca y vehiculos.modelo
--  2) dispositivos_push.fecha_actualizacion
--
--  ------------------------------------------------------------
--  POR QUE SON OPCIONALES
--  ------------------------------------------------------------
--  `marca` y `modelo` son NULL por defecto, a proposito. La tabla
--  `vehiculos` ya tiene datos: poner NOT NULL obligaria a
--  inventarle un modelo a cada auto que el taller todavia no
--  conoce, y ese dato falso es peor que un campo vacio. El
--  cliente ve "Sin especificar" y el taller lo completa cuando
--  pueda.
--
--  Por eso van con DEFAULT NULL y no con '' : NULL significa
--  "no lo sabemos" y '' significa "esta vacio". La app los
--  distingue.
--
--  ------------------------------------------------------------
--  LO QUE NO HACE
--  ------------------------------------------------------------
--  No agrega cilindros, serie, tipo, capacidad, stock ni nada de
--  inventario. `marca` y `modelo` son texto del auto, no del
--  equipo de gas. La recalificacion sigue siendo una FECHA
--  asociada al vehiculo, como en el resto del sistema.
--
--  No borra ni modifica filas. Solo columnas e indices.
--  Es re-ejecutable.
-- ============================================================

-- ------------------------------------------------------------
--  1) Marca y modelo del vehiculo
-- ------------------------------------------------------------

-- MariaDB no tiene "ADD COLUMN IF NOT EXISTS" en todas las
-- versiones, asi que se usa el truco de information_schema: se
-- pregunta antes de agregar. Asi el archivo se puede correr dos
-- veces sin error.
SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'vehiculos'
        AND COLUMN_NAME  = 'marca') > 0,
    'SELECT 1',
    'ALTER TABLE `vehiculos` ADD COLUMN `marca` varchar(60) DEFAULT NULL AFTER `placa`'
  )
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'vehiculos'
        AND COLUMN_NAME  = 'modelo') > 0,
    'SELECT 1',
    'ALTER TABLE `vehiculos` ADD COLUMN `modelo` varchar(60) DEFAULT NULL AFTER `marca`'
  )
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Indice para buscar por marca. El taller va a filtrar la flota
-- por "todos los Toyota", y sin indice eso es un barrido de
-- tabla completo.
SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'vehiculos'
        AND COLUMN_NAME  = 'marca') > 0,
    'SELECT 1',
    'ALTER TABLE `vehiculos` ADD INDEX `idx_marca` (`marca`)'
  )
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ------------------------------------------------------------
--  2) dispositivos_push.fecha_actualizacion
--
--  `fecha_registro` dice cuando se agrego el token por primera
--  vez. `fecha_actualizacion` dice cuando fue la ultima vez que
--  ese telefono abrio la app.
--
--  Se separan porque se usan para cosas distintas: si un token
--  lleva meses sin actualizarse, el telefono probablemente se
--  desinstalo y ya no hay que seguir mandandole avisos. Con una
--  sola columna no se podria distinguir "nuevo" de "abandonado".
-- ------------------------------------------------------------
SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'dispositivos_push'
        AND COLUMN_NAME  = 'fecha_actualizacion') > 0,
    'SELECT 1',
    'ALTER TABLE `dispositivos_push`
       ADD COLUMN `fecha_actualizacion` datetime
       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       AFTER `fecha_registro`'
  )
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Backfill: los tokens que ya existian se consideran actualizados
-- hoy. Si se dejaran en NULL, el codigo que busca "tokens viejos
-- para limpiar" no los encontraria y nunca los borraria.
UPDATE `dispositivos_push`
   SET `fecha_actualizacion` = `fecha_registro`
 WHERE `fecha_actualizacion` IS NULL;

-- ------------------------------------------------------------
--  3) Comprobacion
-- ------------------------------------------------------------
SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'vehiculos'
   AND COLUMN_NAME IN ('marca', 'modelo')
 ORDER BY ORDINAL_POSITION;
