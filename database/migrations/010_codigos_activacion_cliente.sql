-- ============================================================
--  010_codigos_activacion_cliente.sql
--  Le dice a cada codigo de activacion PARA QUIEN es.
--
--  ------------------------------------------------------------
--  POR QUE ESTA MIGRACION
--  ------------------------------------------------------------
--  `codigos_activacion` (003) tiene `id_usuario`, y su comentario
--  dice "NULL si el cliente aun no tiene cuenta". Sobre el papel
--  alcanza: se crea el usuario primero y despues el codigo.
--
--  Pero asi el taller tiene que crear la cuenta del cliente a
--  mano, escribirle una contrasena y comunicarsela. Para una
--  app movil eso no sirve: el flujo natural es al reves, el
--  cliente recibe un codigo, se registra el mismo y recien ahi
--  existe la cuenta.
--
--  Ademas `id_usuario` no alcanza para NADA todavia, porque
--  `usuarios` no tiene columna de telefono. No hay forma de
--  encontrar al cliente que el taller quiere activar. Lo unico
--  que comparten hoy es... nada.
--
--  Esta migracion agrega las dos piezas que faltan:
--
--    id_cliente  -> clientes.id   (a quien pertenece el codigo)
--    telefono    -> varchar(25)   (para que se vea sin JOIN)
--
--  ------------------------------------------------------------
--  POR QUE `telefono` Y NO SOLO `id_cliente`
--  ------------------------------------------------------------
--  Porque el flujo de alta es "tengo este codigo", no "estoy
--  en la lista de mil clientes". El taller escribe el codigo en
--  la pantalla de prueba, el cliente lo teclea en el celular, y
--  de ahi sale el telefono. Sin la columna, cada canje seria un
--  JOIN para sacar un dato que esta a mano.
--
--  Se escribe el telefono y no se lee de `clientes.telefono` a
--  proposito: queda congelado en el momento en que se emitio el
--  codigo. Si despues el taller corrige un numero mal tipeado, el
--  codigo ya emitido sigue activate la cuenta correcta, que es lo
--  que el cliente recibio por WhatsApp.
--
--  ------------------------------------------------------------
--  LO QUE NO SE TOCA
--  ------------------------------------------------------------
--  - No se borra ningun codigo emitido. La tabla ya tiene
--    `usado` y `fecha_expiracion` justamente para eso.
--  - No se modifica `id_usuario` ni su FK.
--
--  Re-ejecutable: cada ADD COLUMN se consulta antes en
--  information_schema.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";

-- 1) A que cliente pertenece el codigo.
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `codigos_activacion` ADD COLUMN `id_cliente` int(11) DEFAULT NULL COMMENT ''Cliente que puede activar con este codigo.'' AFTER `id`',
    'DO 0'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'codigos_activacion'
    AND COLUMN_NAME = 'id_cliente'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Telefono del cliente, para mostrarlo sin JOIN.
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `codigos_activacion` ADD COLUMN `telefono` varchar(25) DEFAULT NULL COMMENT ''Telefono congelado al emitir el codigo. No se recalcula.'' AFTER `id_cliente`',
    'DO 0'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'codigos_activacion'
    AND COLUMN_NAME = 'telefono'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK a clientes, agregada aparte porque REFERENCES a una tabla
-- inexistente aborta el ALTER completo.
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `codigos_activacion` ADD CONSTRAINT `codigos_activacion_ibfk_cliente` FOREIGN KEY (`id_cliente`) REFERENCES `clientes` (`id`) ON DELETE SET NULL',
    'DO 0'
  )
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'codigos_activacion'
    AND CONSTRAINT_NAME = 'codigos_activacion_ibfk_cliente'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- El indice por hash existe desde 003 y se sigue usando: el
-- codigo se busca por su SHA-256, que si es determinista y
-- consultable (a diferencia de un hash bcrypt).
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `codigos_activacion` ADD INDEX `idx_codigos_cliente` (`id_cliente`)',
    'DO 0'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'codigos_activacion'
    AND INDEX_NAME = 'idx_codigos_cliente'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
--  Fin. COMPROBACION:
--
--    SHOW COLUMNS FROM codigos_activacion LIKE 'id_cliente';
--    SHOW COLUMNS FROM codigos_activacion LIKE 'telefono';
-- ============================================================
