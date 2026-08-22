-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 14-08-2026 a las 22:53:48
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
-- Base de datos: `gnv_taller`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `recordatorios_enviados`
--

CREATE TABLE `recordatorios_enviados` (
  `id` int(11) NOT NULL,
  `vehiculo_id` int(11) NOT NULL,
  `tipo` enum('recalificacion','inspeccion') NOT NULL,
  `fecha_envio` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `recordatorios_enviados`
--

INSERT INTO `recordatorios_enviados` (`id`, `vehiculo_id`, `tipo`, `fecha_envio`) VALUES
(3, 1, 'recalificacion', '2026-05-05 17:03:43');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int(11) NOT NULL,
  `username` varchar(60) NOT NULL,
  `password` varchar(255) NOT NULL,
  `rol` enum('tecnico','administrador') NOT NULL DEFAULT 'tecnico'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `usuarios`
--

INSERT INTO `usuarios` (`id`, `username`, `password`, `rol`) VALUES
(5, 'tecnico', '$2y$10$07rSMMMW9bvHX3RIpWnasOOUS/E79Dn67mIBcLMieWMvA1i6vnPze', 'tecnico'),
(6, 'administrador', '$2y$10$69qYGeGdiv4kox3LLqh8/.mXJrtg/jywMxsS2/56vjlYi1S9njsxy', 'administrador');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `vehiculos`
--

CREATE TABLE `vehiculos` (
  `id` int(11) NOT NULL,
  `nombre` varchar(80) NOT NULL,
  `apellido` varchar(80) NOT NULL,
  `placa` varchar(20) NOT NULL,
  `fecha_recalificacion` date NOT NULL,
  `fecha_inspeccion` date NOT NULL,
  `telefono` varchar(25) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `vehiculos`
--

INSERT INTO `vehiculos` (`id`, `nombre`, `apellido`, `placa`, `fecha_recalificacion`, `fecha_inspeccion`, `telefono`, `created_at`, `updated_at`) VALUES
(1, 'Carlos', 'Mamani', '1234ABC', '2026-06-01', '2026-04-20', '59179795704', '2026-04-12 20:38:53', '2026-04-12 21:48:05'),
(2, 'Erik', 'Vargas', '5678DEF', '2026-10-09', '2026-05-27', '59170725109', '2026-04-12 20:38:53', '2026-04-12 22:07:49'),
(3, 'Roberto', 'Flores', '9012GHI', '2027-04-12', '2026-07-11', '59179360308', '2026-04-12 20:38:53', '2026-04-12 21:31:37'),
(4, 'Marco', 'Gabela', '4455ABC', '2021-12-10', '2026-04-15', '59179770943', '2026-04-12 22:04:58', '2026-04-12 22:04:58'),
(6, 'Cristhian', 'Lopez', '1239ABC', '2025-12-10', '2025-01-10', '59170552057', '2026-06-02 22:50:57', '2026-06-02 22:50:57');

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `recordatorios_enviados`
--
ALTER TABLE `recordatorios_enviados`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_vehiculo_tipo` (`vehiculo_id`,`tipo`);

--
-- Indices de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- Indices de la tabla `vehiculos`
--
ALTER TABLE `vehiculos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `placa` (`placa`),
  ADD KEY `idx_placa` (`placa`),
  ADD KEY `idx_fecha_recal` (`fecha_recalificacion`),
  ADD KEY `idx_fecha_insp` (`fecha_inspeccion`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `recordatorios_enviados`
--
ALTER TABLE `recordatorios_enviados`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT de la tabla `vehiculos`
--
ALTER TABLE `vehiculos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `recordatorios_enviados`
--
ALTER TABLE `recordatorios_enviados`
  ADD CONSTRAINT `recordatorios_enviados_ibfk_1` FOREIGN KEY (`vehiculo_id`) REFERENCES `vehiculos` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
