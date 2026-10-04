-- ============================================================
--  005_add_usuarios_estado.sql
--  Agrega `estado` y `fecha_creacion` a `usuarios`, y el rol
--  'cliente' que necesita la app movil.
--
--  DECISION IMPORTANTE
--  El enum de rol ya tiene valores en minusculas y el frontend
--  los compara asi:
--      frontend/src/pages/DashboardPage.jsx  -> user?.rol === 'administrador'
--  Por eso NO se pasan a mayusculas. Se agrega 'cliente' en
--  minusculas, igual que los otros dos. Cambiar a
--  ADMINISTRADOR/TECNICO/CLIENTE romperia la app web.
--
--  `estado` y `fecha_creacion` se agregan con valores por
--  defecto, de modo que las filas existentes quedan en 'activo'
--  y con la fecha de hoy. No se modifica ningun otro dato.
--
--  ------------------------------------------------------------
--  ESTA MIGRACION ES RE-EJECUTABLE
--  ------------------------------------------------------------
--  Cada ADD COLUMN y cada ADD INDEX se consulta antes en
--  `information_schema`: si ya existe, se salta. Asi el archivo
--  se puede volver a aplicar sin que MariaDB falle con
--  "Duplicate column name" ni "Duplicate key name".
--
--  Se hace con PREPARE/EXECUTE porque un ALTER TABLE no puede
--  ir dentro de un IF. Es la forma estandar en MariaDB.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";

-- 1) Estado de la cuenta
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `usuarios` ADD COLUMN `estado` enum(''activo'',''inactivo'') NOT NULL DEFAULT ''activo'' AFTER `rol`',
    'DO 0'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'estado'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Fecha de creacion
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `usuarios` ADD COLUMN `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp() AFTER `estado`',
    'DO 0'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'fecha_creacion'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) Rol 'cliente'
--    Se reconstruye el enum agregando el valor. MariaDB no
--    permite agregar un valor a un enum en sitio: hay que
--    redefinir la columna completa.
--    MODIFY es idempotente: repetirlo deja el enum igual.
ALTER TABLE `usuarios`
  MODIFY COLUMN `rol` enum('tecnico','administrador','cliente') NOT NULL DEFAULT 'tecnico';

-- 4) Indices de soporte
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `usuarios` ADD INDEX `idx_rol` (`rol`)',
    'DO 0'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND INDEX_NAME = 'idx_rol'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `usuarios` ADD INDEX `idx_estado` (`estado`)',
    'DO 0'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND INDEX_NAME = 'idx_estado'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
