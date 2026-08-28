-- ============================================================
--  inventario.sql — Módulo de Inventario (artículos + movimientos)
--  Importar en la base de datos `gnv_taller` (phpMyAdmin o CLI)
-- ============================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- --------------------------------------------------------
-- Tabla: articulos_inventario
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `articulos_inventario` (
  `id`            int(11)      NOT NULL,
  `nombre`        varchar(120) NOT NULL,
  `descripcion`   varchar(255) DEFAULT NULL,
  `cantidad`      int(11)      NOT NULL DEFAULT 0,
  `precio_compra` decimal(10,2) NOT NULL DEFAULT 0.00,
  `precio_venta`  decimal(10,2) NOT NULL DEFAULT 0.00,
  `proveedor`     varchar(120) DEFAULT NULL,
  `created_at`    timestamp    NOT NULL DEFAULT current_timestamp(),
  `updated_at`    timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Tabla: movimientos_inventario
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `movimientos_inventario` (
  `id`          int(11)      NOT NULL,
  `articulo_id` int(11)      NOT NULL,
  `tipo`        enum('entrada','salida') NOT NULL,
  `cantidad`    int(11)      NOT NULL,
  `fecha`       datetime     NOT NULL,
  `usuario_id`  int(11)      DEFAULT NULL,
  `created_at`  timestamp    NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Índices
-- --------------------------------------------------------
ALTER TABLE `articulos_inventario`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_nombre` (`nombre`),
  ADD KEY `idx_cantidad` (`cantidad`);

ALTER TABLE `movimientos_inventario`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_articulo` (`articulo_id`),
  ADD KEY `idx_fecha` (`fecha`);

-- --------------------------------------------------------
-- AUTO_INCREMENT
-- --------------------------------------------------------
ALTER TABLE `articulos_inventario`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `movimientos_inventario`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

-- --------------------------------------------------------
-- Restricciones
-- --------------------------------------------------------
ALTER TABLE `movimientos_inventario`
  ADD CONSTRAINT `mov_inv_fk_articulo` FOREIGN KEY (`articulo_id`)
    REFERENCES `articulos_inventario` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `mov_inv_fk_usuario` FOREIGN KEY (`usuario_id`)
    REFERENCES `usuarios` (`id`) ON DELETE SET NULL;

-- --------------------------------------------------------
-- Datos de ejemplo (opcional)
-- --------------------------------------------------------
INSERT INTO `articulos_inventario`
  (`id`, `nombre`, `descripcion`, `cantidad`, `precio_compra`, `precio_venta`, `proveedor`)
VALUES
  (1, 'Cilindro GNV 60L',        'Cilindro tipo 1 para vehículos livianos', 10,  1350.00, 1900.00, 'GNV Bolivia Center'),
  (2, 'Válvula de cilindro',     'Válvula de corte manual estándar',        25,  180.00,  350.00,  'GNV Bolivia Center'),
  (3, 'Kit de conversión 4to gen','Kits completos para conversión a GNV',    6,   2100.00, 3200.00, 'Importadora Andina'),
  (4, 'Regulador de presión',    'Regulador de 3 etapas para GNV',          15,  420.00,  750.00,  'Importadora Andina'),
  (5, 'Inyector VPR',            'Inyector de gas variable (juego)',         12,  950.00,  1450.00, 'GNV Bolivia Center');

INSERT INTO `movimientos_inventario`
  (`articulo_id`, `tipo`, `cantidad`, `fecha`, `usuario_id`)
VALUES
  (1, 'entrada', 10, NOW(), 6),
  (2, 'entrada', 25, NOW(), 6),
  (3, 'entrada', 6,  NOW(), 6),
  (4, 'entrada', 15, NOW(), 6),
  (5, 'entrada', 12, NOW(), 6);

COMMIT;