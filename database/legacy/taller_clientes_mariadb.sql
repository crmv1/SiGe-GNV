-- ============================================================
--  database/legacy/taller_clientes_mariadb.sql
--
--  Version corregida del dump original "taller_clientes (1).sql"
--  para poder importarse en MariaDB 10.4+ (el que usa el hosting
--  online, Docker y MariaDB Server instalado directo).
--
--  QUE SE CORRIGIO Y POR QUE
--
--  1) Fechas 0000-00-00
--     Origen: clientes con fecha_recalificacion y fecha_inspeccion
--     en '0000-00-00'.
--     Problema: MariaDB 10.4 corre en modo STRICT por defecto y
--     rechaza la fecha '0000-00-00'. El import falla a mitad de camino.
--     Correccion: se guardan como NULL. La columna ya permitia NULL
--     y la app trata NULL como "sin fecha registrada".
--     Datos afectados: 3 filas de 10.
--
--  2) Vistas con DEFINER=root@localhost
--     Origen: v_inspeccion_en_7d y v_recalificacion_en_30d definidas
--     con DEFINER=`root`@`localhost`.
--     Problema: en un MariaDB online o gestionado ese usuario no
--     existe, y el import aborta con error 1449.
--     Correccion: se crean sin DEFINER, usando el usuario de
--     conexion. La vista sigue funcionando igual.
--
--  3) Tablas "stand-in" de las vistas
--     Origen: el dump creaba tablas vacias v_inspeccion_en_7d y
--     v_recalificacion_en_30d y luego las eliminaba con DROP TABLE
--     para poder exportar las vistas.
--     Problema: es fragil y deja restos si algo falla en el medio.
--     Correccion: se creo la vista directamente con
--     CREATE OR REPLACE VIEW, sin pasos intermedios.
--
--  4) Passwords en texto plano
--     Origen: la tabla `users` guardaba 'tec123' y 'adm123'.
--     Nota: a pedido explicito del dueno del proyecto se conservan
--     SIN encriptar, tal como estan.
--     RIESGO CONOCIDO: esta base queda accesible desde la API.
--     Ver la seccion "RIESGOS PENDIENTES" de
--     docs/MIGRACION_MARIADB.md. El backend no lee esta tabla:
--     la autenticacion usa `gnv_taller.usuarios`, que si tiene
--     bcrypt.
--
--  LO QUE NO SE TOCO
--    Nombres de tablas, columnas, tipos, indices, claves foraneas
--    y datos. Este archivo es una copia fiel con las 3 correcciones
--    tecnicas de arriba.
--
--  IMPORTAR
--    mariadb -h HOST -u USUARIO -p < database/legacy/taller_clientes_mariadb.sql
--  (sin indicar base: el CREATE DATABASE va incluido)
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `taller_clientes`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE `taller_clientes`;

-- ------------------------------------------------------------
-- Tablas
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `allowed_numbers` (
  `msisdn` varchar(20) NOT NULL,
  `nombre` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `allowed_numbers`
  ADD PRIMARY KEY (`msisdn`);

INSERT INTO `allowed_numbers` (`msisdn`, `nombre`) VALUES
('59165385778', 'Prueba 2'),
('59179360308', 'Prueba 1');

-- CORREGIDO 1: las filas 2, 7 y 9 tenian '0000-00-00'. Ahora NULL.
CREATE TABLE IF NOT EXISTS `clientes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `placa` varchar(20) NOT NULL,
  `celular` varchar(20) NOT NULL,
  `fecha_recalificacion` date DEFAULT NULL,
  `fecha_inspeccion` date DEFAULT NULL,
  `nombre` varchar(255) NOT NULL,
  `apellido` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `clientes`
  (`id`, `placa`, `celular`, `fecha_recalificacion`, `fecha_inspeccion`, `nombre`, `apellido`)
VALUES
(1,  '',        '',           NULL,         NULL,         '',         ''),
(2,  'XYZ789',  '59165385778', NULL,         NULL,         'Edgar',    'Aguilar'),
(3,  '',        '',           NULL,         NULL,         '',         ''),
(4,  '333kmj',  '7777777',    '2025-12-12', '2025-12-12', 'angel',    'caero'),
(5,  'ABC123',  '59179360308', '2027-12-10', '2025-12-10', 'Camila',   'Prueba'),
(6,  'ABC123',  '79360308',    '2026-10-12', '2025-10-19', 'Prueba',   'Demo'),
(7,  '',        '',           NULL,         NULL,         '',         ''),
(8,  '1524fkd', '477541233',   '2027-12-15', '2026-12-10', 'sofia',    'felipez'),
(9,  '',        '',           NULL,         NULL,         '',         ''),
(10, '1111ppp', '77777774',   '2028-12-10', '2026-12-10', 'rosa',     'galindo');

ALTER TABLE `clientes`
  ADD INDEX `idx_fecha_inspeccion` (`fecha_inspeccion`),
  ADD INDEX `idx_fecha_recalificacion` (`fecha_recalificacion`);

CREATE TABLE IF NOT EXISTS `notificaciones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `cliente_id` int(11) NOT NULL,
  `tipo` enum('inspeccion','recalificacion') NOT NULL,
  `etapa` enum('30','7','0') NOT NULL,
  `fecha_objetivo` date NOT NULL,
  `enviado_en` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_cliente_tipo_etapa_fecha` (`cliente_id`,`tipo`,`etapa`,`fecha_objetivo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- CORREGIDO 4: passwords en texto plano, conservados a pedido
-- explicito del dueno del proyecto.
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL COMMENT 'ATENCION: texto plano. Riesgo conocido.',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `users` (`id`, `username`, `password`) VALUES
(1, 'tecnico', 'tec123'),
(2, 'administrador', 'adm123');

ALTER TABLE `users` AUTO_INCREMENT = 3;

-- ------------------------------------------------------------
-- Vistas
-- CORREGIDO 2: sin DEFINER, para que el archivo se importe en
-- cualquier MariaDB online. CORREGIDO 3: se crean directo, sin
-- las tablas stand-in que usaba el dump original.
-- ------------------------------------------------------------

CREATE OR REPLACE VIEW `v_inspeccion_en_7d` AS
SELECT
  `clientes`.`id`              AS `id`,
  `clientes`.`nombre`          AS `nombre`,
  `clientes`.`apellido`        AS `apellido`,
  `clientes`.`placa`           AS `placa`,
  `clientes`.`celular`         AS `celular`,
  `clientes`.`fecha_inspeccion` AS `fecha_objetivo`
FROM `clientes`
WHERE `clientes`.`fecha_inspeccion` IS NOT NULL
  AND `clientes`.`fecha_inspeccion` = CURDATE() + INTERVAL 7 DAY;

CREATE OR REPLACE VIEW `v_recalificacion_en_30d` AS
SELECT
  `clientes`.`id`                AS `id`,
  `clientes`.`nombre`            AS `nombre`,
  `clientes`.`apellido`          AS `apellido`,
  `clientes`.`placa`             AS `placa`,
  `clientes`.`celular`           AS `celular`,
  `clientes`.`fecha_recalificacion` AS `fecha_objetivo`
FROM `clientes`
WHERE `clientes`.`fecha_recalificacion` IS NOT NULL
  AND `clientes`.`fecha_recalificacion` = CURDATE() + INTERVAL 30 DAY;

-- ------------------------------------------------------------
-- notifications_log
-- Se crea al final porque tiene FK contra `clientes`.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `notifications_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `cliente_id` int(11) NOT NULL,
  `tipo` enum('RECALIFICACION_1M','INSPECCION_1S') NOT NULL,
  `objetivo` date NOT NULL,
  `enviado_en` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cliente_tipo_fecha` (`cliente_id`,`tipo`,`objetivo`),
  CONSTRAINT `fk_log_cliente`
    FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET FOREIGN_KEY_CHECKS = 1;
