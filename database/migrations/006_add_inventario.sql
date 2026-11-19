-- ============================================================
--  006_add_inventario.sql
--  Modulo de INVENTARIO del taller (SIGE-GNV VC GAS).
--
--  ------------------------------------------------------------
--  AUDITORIA PREVIA (leer antes de aplicar)
--  ------------------------------------------------------------
--  Se reviso la base actual y NO existe ninguna tabla de
--  inventario. Lo que se encontro:
--
--    - `gnv_taller`: usuarios, vehiculos, recordatorios_enviados,
--      notificaciones, codigos_activacion, dispositivos_push.
--    - `taller_clientes` (legada): clientes, users,
--      allowed_numbers, notifications_log, dos vistas.
--
--  Ninguna de esas tablas guarda productos, repuestos,
--  accesorios, insumos, kits ni cantidades.
--  Tampoco hay servicios ni ordenes de trabajo, asi que hoy no
--  existe ninguna relacion que conservar.
--
--  Conclusion: no hay datos de inventario que migrar ni
--  estructura equivalente que reutilizar. Se crean las tablas.
--  NO se copia, renombra ni modifica ninguna tabla existente.
--
--  ------------------------------------------------------------
--  DECISIONES
--  ------------------------------------------------------------
--  1) Los nombres siguen la convencion real del proyecto:
--     snake_case en espanol, tablas en plural, clave primaria
--     `id_<entidad>` (igual que `notificaciones` y
--     `dispositivos_push`), enums en minusculas para los
--     estados y categorias.
--
--  2) `movimientos_inventario.tipo` usa ENTRADA / SALIDA /
--     AJUSTE en mayusculas porque es el valor que pide la
--     especificacion del taller. La API acepta el tipo en
--     mayusculas o minusculas y siempre guarda la mayuscula,
--     asi que no hay dos formas de escribirlo.
--
--  3) `cantidad` se guarda siempre positiva. El signo lo define
--     `tipo`. `stock_anterior` y `stock_nuevo` dejan la
--     cuenta explicita sin recalcular nada.
--
--  4) El stock NUNCA se escribe directo. Solo cambia dentro de
--     la misma transaccion que inserta el movimiento. Por eso
--     `inventario_productos.stock_actual` arranca en 0 y la
--     carga inicial se registra como una ENTRADA.
--
--  5) CHECK en `stock_actual` y en `stock_nuevo`: MariaDB los
--     valida desde la 10.2. Es la ultima red antes de que
--     exista un -2. Si alguna vez hubiera que importar datos
--     historicos con negativos, hay que quitar el CHECK antes
--     (ver nota al final del archivo) y reportar el caso, no
--     corregirlo en silencio.
--
--  6) No hay endpoint ni accion para borrar un producto. Se
--     marca `estado = 'inactivo'`. Asi el historial de
--     movimientos nunca queda huerfano ni se pierde.
--
--  ------------------------------------------------------------
--  RELACION CON SERVICIOS (preparada, NO implementada)
--  ------------------------------------------------------------
--  Hoy el taller no tiene tabla de servicios ni de detalle de
--  servicio, asi que no hay a que engancharse todavia. La
--  columna `referencia` de `movimientos_inventario` ya guarda
--  el dato que hara falta (numero de orden, factura, etc.).
--  Cuando exista el modelo de servicios, la cadena sera:
--
--      servicio -> detalle_servicio -> producto + cantidad
--
--  No se crea nada de eso aqui a proposito: seria inventar
--  tablas vacias que no relacionan con nada.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";

-- ------------------------------------------------------------
--  0) Comprobacion previa.
--     Lista cualquier tabla que ya exista con un nombre de
--     inventario. Si aparece alguna, NO seguir con este
--     archivo: hay que revisar que tabla es la buena.
-- ------------------------------------------------------------
SELECT TABLE_NAME AS tabla_existente
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME REGEXP 'inventario|producto|repuesto|accesorio|insumo|stock|kit'
   ORDER BY TABLE_NAME;

-- ------------------------------------------------------------
--  1) INVENTARIO_PRODUCTOS
--     Catalogo unico del taller. Cubre productos, accesorios,
--     repuestos, insumos, kits de conversion y componentes: lo
--     que cambia es `categoria`, no la tabla.
--
--     NO esta `cilindro` en el enum, a proposito. Los cilindros
--     no se inventarian: la IA los recomienda por medida
--     (ver `CILINDROS_REFERENCIA`) y el taller los pide. Lo que
--     el taller compra y guarda (productos, repuestos) si se
--     controla aqui.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventario_productos` (
  `id_producto` int(11) NOT NULL AUTO_INCREMENT,
  `codigo` varchar(50) NOT NULL COMMENT 'Codigo interno del taller. Unico.',
  `nombre` varchar(150) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `categoria` enum('producto','accesorio','repuesto','insumo','kit','otro')
    NOT NULL DEFAULT 'producto',
  `unidad` varchar(20) NOT NULL DEFAULT 'unidad' COMMENT 'unidad, litro, metro, juego, par...',
  `stock_actual` int(11) NOT NULL DEFAULT 0 COMMENT 'Lo mantiene el modulo, nunca a mano.',
  `stock_minimo` int(11) NOT NULL DEFAULT 0 COMMENT 'Alerta cuando stock_actual <= stock_minimo.',
  `precio_compra` decimal(12,2) NOT NULL DEFAULT 0.00,
  `precio_venta` decimal(12,2) DEFAULT NULL COMMENT 'NULL si el producto no se vende.',
  `estado` enum('activo','inactivo') NOT NULL DEFAULT 'activo',
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_actualizacion` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id_producto`),
  UNIQUE KEY `uq_codigo` (`codigo`),
  KEY `idx_categoria` (`categoria`),
  KEY `idx_estado` (`estado`),
  KEY `idx_nombre` (`nombre`),
  KEY `idx_stock` (`stock_actual`),
  CONSTRAINT `chk_productos_stock_no_negativo` CHECK (`stock_actual` >= 0),
  CONSTRAINT `chk_productos_stock_minimo` CHECK (`stock_minimo` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ------------------------------------------------------------
--  2) MOVIMIENTOS_INVENTARIO
--     Trazabilidad. Una fila por cada cambio de stock, con el
--     stock antes y despues, el motivo, la referencia y el
--     usuario responsable.
--
--     La FK hacia `inventario_productos` es ON DELETE RESTRICT:
--     no se puede borrar un producto con movimientos. Es lo
--     coherente con el punto 6 de las decisiones.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `movimientos_inventario` (
  `id_movimiento` int(11) NOT NULL AUTO_INCREMENT,
  `id_producto` int(11) NOT NULL,
  `tipo` enum('ENTRADA','SALIDA','AJUSTE') NOT NULL,
  `cantidad` int(11) NOT NULL COMMENT 'Cantidad movida. Siempre positiva; el signo lo da `tipo`.',
  `stock_anterior` int(11) NOT NULL,
  `stock_nuevo` int(11) NOT NULL,
  `motivo` varchar(255) NOT NULL,
  `referencia` varchar(100) DEFAULT NULL COMMENT 'Factura, orden de trabajo, servicio.',
  `id_usuario` int(11) NOT NULL COMMENT 'Quien hizo el movimiento.',
  `fecha` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_movimiento`),
  KEY `idx_id_producto` (`id_producto`),
  KEY `idx_id_usuario` (`id_usuario`),
  KEY `idx_tipo` (`tipo`),
  KEY `idx_fecha` (`fecha`),
  CONSTRAINT `movimientos_inventario_ibfk_1`
    FOREIGN KEY (`id_producto`) REFERENCES `inventario_productos` (`id_producto`)
    ON DELETE RESTRICT,
  CONSTRAINT `movimientos_inventario_ibfk_2`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id`)
    ON DELETE RESTRICT,
  CONSTRAINT `chk_movimientos_cantidad` CHECK (`cantidad` >= 0),
  CONSTRAINT `chk_movimientos_stock_nuevo` CHECK (`stock_nuevo` >= 0),
  -- La cuenta tiene que cuadrar con el tipo. Si alguna vez alguien
  -- inserta un movimiento a mano con numeros que no coinciden,
  -- MariaDB lo rechaza en vez de dejar el historial incoherente.
  CONSTRAINT `chk_movimientos_coherencia` CHECK (
       (`tipo` = 'ENTRADA' AND `stock_nuevo` = `stock_anterior` + `cantidad`)
    OR (`tipo` = 'SALIDA'  AND `stock_nuevo` = `stock_anterior` - `cantidad`)
    OR (`tipo` = 'AJUSTE'  AND `cantidad` = ABS(`stock_nuevo` - `stock_anterior`))
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ------------------------------------------------------------
--  3) Vista de alertas de stock.
--     Solo lectura. La usan la app web y verify-database.js.
--     `sin_stock` y `stock_bajo` se separan porque no es lo
--     mismo agotarse que estar por agotarse.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW `v_inventario_stock_bajo` AS
SELECT
  p.id_producto,
  p.codigo,
  p.nombre,
  p.categoria,
  p.unidad,
  p.stock_actual,
  p.stock_minimo,
  p.precio_compra,
  p.precio_venta,
  CASE
    WHEN p.stock_actual = 0 THEN 'sin_stock'
    ELSE 'stock_bajo'
  END AS alerta,
  (p.stock_actual - p.stock_minimo) AS diferencia
FROM inventario_productos p
WHERE p.estado = 'activo'
  AND p.stock_actual <= p.stock_minimo;

-- ============================================================
--  NOTA SOBRE EL CHECK, si alguna vez hay que retirarlo
-- ============================================================
--  Solo si aparece un producto con stock negativo heredado de
--  otra base, y solo con el visto bueno del dueño del taller:
--
--    ALTER TABLE `inventario_productos`
--      DROP CONSTRAINT `chk_productos_stock_no_negativo`;
--
--  Antes hay que reportar el caso (producto, problema y
--  correccion propuesta). No se ajusta la cantidad a mano.
-- ============================================================
