-- ============================================================
--  003_add_codigos_activacion.sql
--  Activacion de cuentas desde la app movil.
--
--  Reglas:
--    - el codigo es de un solo uso (columna `usado`)
--    - el codigo expira (columna `fecha_expiracion`)
--    - se guarda el HASH del codigo, nunca el codigo en claro
--
--  `id_usuario` admite NULL a proposito: el cliente puede
--  existir sin cuenta hasta que activa la app movil.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";

CREATE TABLE IF NOT EXISTS `codigos_activacion` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_usuario` int(11) DEFAULT NULL COMMENT 'NULL si el cliente aun no tiene cuenta',
  `codigo_hash` varchar(255) NOT NULL COMMENT 'Hash del codigo. Nunca el codigo en claro.',
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_expiracion` datetime NOT NULL,
  `usado` tinyint(1) NOT NULL DEFAULT 0,
  `fecha_uso` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_codigo_hash` (`codigo_hash`),
  KEY `idx_id_usuario` (`id_usuario`),
  KEY `idx_expiracion` (`fecha_expiracion`),
  CONSTRAINT `codigos_activacion_ibfk_1`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
