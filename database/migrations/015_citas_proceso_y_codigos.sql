-- ============================================================
-- 015_citas_proceso_y_codigos.sql
-- Estados de PROCESO de recalificacion, tipo de vehiculo
-- (publico/privado) y cola de codigos de activacion por WhatsApp.
--
--  POR QUE ESTOS ESTADOS
--  El taller no ve "reservada/confirmada/completada": ve el
--  PROCESO fisico de la recalificacion, que para un vehiculo
--  publico dura ~3 dias (tanque baja, va a la recalificadora,
--  el taller cambia accesorios, el tanque vuelve, se monta, se
--  prueba) y para un privado total se resuelve en el dia.
--
--  El cliente ve esos mismos estados en la app movil, y el admin
--  / tecnico los avanza desde la web. El orden del proceso es:
--
--    1 RESERVADA                    cita agendada, no llego
--    2 EN_TALLER                    ingreso al taller
--    3 TANQUE_EN_RECALIFICADORA     tanque fuera / trabajo en curso
--    4 MONTAJE_Y_PRUEBA             tanque de vuelta, montado y probando
--    5 LISTA_PARA_RETIRO            todo listo, falta entregar
--    6 ENTREGADA                    entregado, proceso cerrado
--
--  Excepcionales (fuera del flujo): CANCELADA, NO_ASISTIO,
--  REPROGRAMADA.
--
--  NOTA IMPORTANTE SOBRE TIPO_VEHICULO
--  Se guarda en la CITA (se elige al reservar) y tambien en el
--  VEHICULO (para que el taller recuerde cual es). Se permite que
--  un "publico" reserve como "privado" (el taller lo confirma), por
--  eso no se asume desde el vehiculo.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ------------------------------------------------------------
-- 1) citas.estado -> enum del proceso (6 estados + excepcionales)
-- ------------------------------------------------------------
-- No hay filas en citas (0 al momento de escribir esto), pero el
-- UPDATE por si acaso re-mapea estados viejos a los nuevos antes
-- de restringir el enum, para no perder datos si alguien ya cargo
-- algo. MariaDB exige que los valores que queden en la columna
-- existan en el enum nuevo.
UPDATE `citas` SET `estado` = 'RESERVADA'  WHERE `estado` = 'CONFIRMADA';
UPDATE `citas` SET `estado` = 'EN_TALLER'  WHERE `estado` = 'EN_ATENCION';
UPDATE `citas` SET `estado` = 'ENTREGADA'  WHERE `estado` = 'COMPLETADA';

ALTER TABLE `citas`
  MODIFY COLUMN `estado`
  ENUM('RESERVADA','EN_TALLER','TANQUE_EN_RECALIFICADORA','MONTAJE_Y_PRUEBA','LISTA_PARA_RETIRO','ENTREGADA','CANCELADA','NO_ASISTIO','REPROGRAMADA')
  NOT NULL DEFAULT 'RESERVADA';

-- ------------------------------------------------------------
-- 2) citas.tipo_vehiculo (se elige al reservar)
-- ------------------------------------------------------------
SET @ex := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'citas' AND COLUMN_NAME = 'tipo_vehiculo');
SET @sql := IF(@ex = 0,
  'ALTER TABLE `citas` ADD COLUMN `tipo_vehiculo` ENUM(''publico'',''privado'') DEFAULT NULL COMMENT ''Se elige al reservar. Publico ~3 dias, privado 1 dia.'' AFTER `tipo_servicio`',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ------------------------------------------------------------
-- 3) vehiculos.tipo_vehiculo (para que el taller recuerde)
-- ------------------------------------------------------------
SET @ex := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehiculos' AND COLUMN_NAME = 'tipo_vehiculo');
SET @sql := IF(@ex = 0,
  'ALTER TABLE `vehiculos` ADD COLUMN `tipo_vehiculo` ENUM(''publico'',''privado'') DEFAULT NULL COMMENT ''Publico o privado. NULL = aun no clasificado.'' AFTER `placa`',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ------------------------------------------------------------
-- 4) notificaciones: id_vehiculo nullable + tipo 'activacion'
--    (para enviar codigos de activacion por WhatsApp)
-- ------------------------------------------------------------
-- 4a) Soltar la FK para poder hacer la columna nullable.
SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificaciones'
               AND REFERENCED_TABLE_NAME = 'vehiculos' AND COLUMN_NAME = 'id_vehiculo'
             LIMIT 1);
SET @sql := IF(@fk IS NOT NULL, CONCAT('ALTER TABLE `notificaciones` DROP FOREIGN KEY `', @fk, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 4b) id_vehiculo nullable (una notificacion de activacion no tiene
--     vehiculo: es solo el codigo para crear la cuenta).
ALTER TABLE `notificaciones` MODIFY COLUMN `id_vehiculo` INT(11) NULL;

-- 4c) Re-agregar la FK (ahora permite NULL).
SET @fk2 := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificaciones'
                AND REFERENCED_TABLE_NAME = 'vehiculos' AND COLUMN_NAME = 'id_vehiculo'
              LIMIT 1);
SET @sql := IF(@fk2 IS NULL,
  'ALTER TABLE `notificaciones` ADD CONSTRAINT `notificaciones_ibfk_1` FOREIGN KEY (`id_vehiculo`) REFERENCES `vehiculos` (`id`) ON DELETE CASCADE',
  'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 4d) 'activacion' al enum de tipo.
ALTER TABLE `notificaciones`
  MODIFY COLUMN `tipo`
  ENUM('recalificacion','inspeccion','activacion') NOT NULL;

-- ------------------------------------------------------------
-- Verificacion rapida (no detiene la migracion, solo informa)
-- ------------------------------------------------------------
SELECT 'citas.estado' AS campo, COLUMN_TYPE AS valor
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'citas' AND COLUMN_NAME = 'estado'
UNION ALL
SELECT 'notificaciones.tipo', COLUMN_TYPE
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificaciones' AND COLUMN_NAME = 'tipo'
UNION ALL
SELECT 'notificaciones.id_vehiculo.nullable', IS_NULLABLE
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificaciones' AND COLUMN_NAME = 'id_vehiculo';
