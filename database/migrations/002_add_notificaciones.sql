-- ============================================================
--  002_add_notificaciones.sql
--  Cola de notificaciones programadas.
--
--  Antes, los recordatorios se generaban al vuelo en PHP y se
--  enviaban directo a WPConnect. Ahora el backend genera las
--  notificaciones y las deja en cola; WPConnect las consume.
--
--  Esto hace posible el par de endpoints que pide el proyecto:
--    GET  /api/integrations/whatsapp/pendientes
--    POST /api/integrations/whatsapp/notificaciones/:id/enviada
--    POST /api/integrations/whatsapp/notificaciones/:id/error
--
--  La tabla `recordatorios_enviados` NO se toca. Sigue siendo
--  el historial de lo ya notificado.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";

CREATE TABLE IF NOT EXISTS `notificaciones` (
  `id_notificacion` int(11) NOT NULL AUTO_INCREMENT,
  `id_vehiculo` int(11) NOT NULL,
  `tipo` enum('recalificacion','inspeccion') NOT NULL,
  `dias_anticipacion` int(3) NOT NULL COMMENT '10 dias antes. Un solo aviso.',
  `titulo` varchar(150) NOT NULL,
  `mensaje` text NOT NULL,
  `telefono` varchar(25) NOT NULL,
  `fecha_programada` date NOT NULL,
  `fecha_envio` datetime DEFAULT NULL,
  `estado` enum('pendiente','enviada','error') NOT NULL DEFAULT 'pendiente',
  `intentos` int(3) NOT NULL DEFAULT 0,
  `ultimo_error` varchar(500) DEFAULT NULL,
  `leida` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_notificacion`),
  -- Evita generar dos veces el mismo aviso para el mismo vehiculo.
  UNIQUE KEY `uq_vehiculo_tipo_dias_fecha`
    (`id_vehiculo`,`tipo`,`dias_anticipacion`,`fecha_programada`),
  KEY `idx_estado` (`estado`),
  KEY `idx_fecha_programada` (`fecha_programada`),
  CONSTRAINT `notificaciones_ibfk_1`
    FOREIGN KEY (`id_vehiculo`) REFERENCES `vehiculos` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
