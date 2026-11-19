-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 14-08-2026 a las 22:53:36
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.1.25

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `taller_clientes`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `allowed_numbers`
--

CREATE TABLE `allowed_numbers` (
  `msisdn` varchar(20) NOT NULL,
  `nombre` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `allowed_numbers`
--

INSERT INTO `allowed_numbers` (`msisdn`, `nombre`) VALUES
('59165385778', 'Prueba 2'),
('59179360308', 'Prueba 1');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `clientes`
--

CREATE TABLE `clientes` (
  `id` int(11) NOT NULL,
  `placa` varchar(20) NOT NULL,
  `celular` varchar(20) NOT NULL,
  `fecha_recalificacion` date DEFAULT NULL,
  `fecha_inspeccion` date DEFAULT NULL,
  `nombre` varchar(255) NOT NULL,
  `apellido` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `clientes`
--

INSERT INTO `clientes` (`id`, `placa`, `celular`, `fecha_recalificacion`, `fecha_inspeccion`, `nombre`, `apellido`) VALUES
(1, '', '', NULL, NULL, '', ''),
(2, 'XYZ789', '59165385778', '0000-00-00', '0000-00-00', 'Edgar', 'Aguilar'),
(3, '', '', NULL, NULL, '', ''),
(4, '333kmj', '7777777', '2025-12-12', '2025-12-12', 'angel', 'caero'),
(5, 'ABC123', '59179360308', '2027-12-10', '2025-12-10', 'Camila', 'Prueba'),
(6, 'ABC123', '79360308', '2026-10-12', '2025-10-19', 'Prueba', 'Demo'),
(7, '', '', '0000-00-00', '0000-00-00', '', ''),
(8, '1524fkd', '477541233', '2027-12-15', '2026-12-10', 'sofia', 'felipez'),
(9, '', '', '0000-00-00', '0000-00-00', '', ''),
(10, '1111ppp', '77777774', '2028-12-10', '2026-12-10', 'rosa', 'galindo');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `notificaciones`
--

CREATE TABLE `notificaciones` (
  `id` int(11) NOT NULL,
  `cliente_id` int(11) NOT NULL,
  `tipo` enum('inspeccion','recalificacion') NOT NULL,
  `etapa` enum('30','7','0') NOT NULL,
  `fecha_objetivo` date NOT NULL,
  `enviado_en` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `notifications_log`
--

CREATE TABLE `notifications_log` (
  `id` int(11) NOT NULL,
  `cliente_id` int(11) NOT NULL,
  `tipo` enum('RECALIFICACION_1M','INSPECCION_1S') NOT NULL,
  `objetivo` date NOT NULL,
  `enviado_en` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `users`
--

INSERT INTO `users` (`id`, `username`, `password`) VALUES
(1, 'tecnico', 'tec123'),
(2, 'administrador', 'adm123');

-- --------------------------------------------------------

--
-- Estructura Stand-in para la vista `v_inspeccion_en_7d`
-- (Véase abajo para la vista actual)
--
CREATE TABLE `v_inspeccion_en_7d` (
`id` int(11)
,`nombre` varchar(255)
,`apellido` varchar(255)
,`placa` varchar(20)
,`celular` varchar(20)
,`fecha_objetivo` date
);

-- --------------------------------------------------------

--
-- Estructura Stand-in para la vista `v_recalificacion_en_30d`
-- (Véase abajo para la vista actual)
--
CREATE TABLE `v_recalificacion_en_30d` (
`id` int(11)
,`nombre` varchar(255)
,`apellido` varchar(255)
,`placa` varchar(20)
,`celular` varchar(20)
,`fecha_objetivo` date
);

-- --------------------------------------------------------

--
-- Estructura para la vista `v_inspeccion_en_7d`
--
DROP TABLE IF EXISTS `v_inspeccion_en_7d`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v_inspeccion_en_7d`  AS SELECT `clientes`.`id` AS `id`, `clientes`.`nombre` AS `nombre`, `clientes`.`apellido` AS `apellido`, `clientes`.`placa` AS `placa`, `clientes`.`celular` AS `celular`, `clientes`.`fecha_inspeccion` AS `fecha_objetivo` FROM `clientes` WHERE `clientes`.`fecha_inspeccion` is not null AND cast(`clientes`.`fecha_inspeccion` as date) = cast(curdate() + interval 7 day as date) ;

-- --------------------------------------------------------

--
-- Estructura para la vista `v_recalificacion_en_30d`
--
DROP TABLE IF EXISTS `v_recalificacion_en_30d`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v_recalificacion_en_30d`  AS SELECT `clientes`.`id` AS `id`, `clientes`.`nombre` AS `nombre`, `clientes`.`apellido` AS `apellido`, `clientes`.`placa` AS `placa`, `clientes`.`celular` AS `celular`, `clientes`.`fecha_recalificacion` AS `fecha_objetivo` FROM `clientes` WHERE `clientes`.`fecha_recalificacion` is not null AND cast(`clientes`.`fecha_recalificacion` as date) = cast(curdate() + interval 30 day as date) ;

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `allowed_numbers`
--
ALTER TABLE `allowed_numbers`
  ADD PRIMARY KEY (`msisdn`);

--
-- Indices de la tabla `clientes`
--
ALTER TABLE `clientes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_fecha_inspeccion` (`fecha_inspeccion`),
  ADD KEY `idx_fecha_recalificacion` (`fecha_recalificacion`);

--
-- Indices de la tabla `notificaciones`
--
ALTER TABLE `notificaciones`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_cliente_tipo_etapa_fecha` (`cliente_id`,`tipo`,`etapa`,`fecha_objetivo`);

--
-- Indices de la tabla `notifications_log`
--
ALTER TABLE `notifications_log`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_cliente_tipo_fecha` (`cliente_id`,`tipo`,`objetivo`);

--
-- Indices de la tabla `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `clientes`
--
ALTER TABLE `clientes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT de la tabla `notificaciones`
--
ALTER TABLE `notificaciones`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `notifications_log`
--
ALTER TABLE `notifications_log`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `notifications_log`
--
ALTER TABLE `notifications_log`
  ADD CONSTRAINT `fk_log_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
