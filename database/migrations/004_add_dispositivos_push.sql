-- ============================================================
--  004_add_dispositivos_push.sql
--  Tokens de Expo push de la app movil.
--
--  Un usuario puede tener mas de un dispositivo (por ejemplo
--  un celular y una tablet), por eso el token es unico pero
--  el indice por usuario no lo es.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";

CREATE TABLE IF NOT EXISTS `dispositivos_push` (
  `id_dispositivo` int(11) NOT NULL AUTO_INCREMENT,
  `id_usuario` int(11) NOT NULL,
  `expo_push_token` varchar(255) NOT NULL,
  `plataforma` enum('android','ios') NOT NULL DEFAULT 'android',
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `fecha_registro` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_dispositivo`),
  UNIQUE KEY `uq_expo_push_token` (`expo_push_token`),
  KEY `idx_id_usuario` (`id_usuario`),
  CONSTRAINT `dispositivos_push_ibfk_1`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
