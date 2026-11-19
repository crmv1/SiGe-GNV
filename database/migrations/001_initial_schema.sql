-- ============================================================
--  001_initial_schema.sql
--  SIGE-GNV VC GAS — Estructura inicial de `gnv_taller`
--
--  Reproduce la estructura que ya usaba el sistema, sin datos.
--  Las tres tablas provienen de la base MySQL/MariaDB que
--  estaba en XAMPP.
--
--  Aplicar con:
--    mariadb -h HOST -u USUARIO -p NOMBRE_BASE < database/migrations/001_initial_schema.sql
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";

-- ------------------------------------------------------------
-- usuarios
-- ------------------------------------------------------------
-- NOTA: el enum de rol queda como esta hoy ('tecnico',
-- 'administrador') para no romper el frontend, que compara
-- contra esos valores. El rol 'cliente' se agrega en 005.
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(60) NOT NULL,
  `password` varchar(255) NOT NULL COMMENT 'Hash bcrypt generado con password_hash de PHP',
  `rol` enum('tecnico','administrador') NOT NULL DEFAULT 'tecnico',
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ------------------------------------------------------------
-- vehiculos
-- ------------------------------------------------------------
-- Se conservan los indices que ya existian. El indice unico
-- en placa y el indice simple en placa se mantienen ambos
-- como estaban, aunque el segundo es redundante: no se tocan
-- para no alterar el comportamiento previo.
CREATE TABLE IF NOT EXISTS `vehiculos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(80) NOT NULL,
  `apellido` varchar(80) NOT NULL,
  `placa` varchar(20) NOT NULL,
  `fecha_recalificacion` date NOT NULL,
  `fecha_inspeccion` date NOT NULL,
  `telefono` varchar(25) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `placa` (`placa`),
  KEY `idx_placa` (`placa`),
  KEY `idx_fecha_recal` (`fecha_recalificacion`),
  KEY `idx_fecha_insp` (`fecha_inspeccion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ------------------------------------------------------------
-- recordatorios_enviados
-- ------------------------------------------------------------
-- Historial de avisos ya enviados. La FK con ON DELETE CASCADE
-- se mantiene igual que en la base original.
CREATE TABLE IF NOT EXISTS `recordatorios_enviados` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `vehiculo_id` int(11) NOT NULL,
  `tipo` enum('recalificacion','inspeccion') NOT NULL,
  `fecha_envio` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vehiculo_tipo` (`vehiculo_id`,`tipo`),
  CONSTRAINT `recordatorios_enviados_ibfk_1`
    FOREIGN KEY (`vehiculo_id`) REFERENCES `vehiculos` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
