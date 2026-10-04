# ============================================================
#  database/schema.sql
#  SIGE-GNV VC GAS — Estructura de la base `gnv_taller`
#  Compatible con MariaDB 10.4+
#
#  IMPORTANTE
#  Este archivo NO contiene datos personales ni contrasenas.
#
#  Refleja la estructura que usa la aplicacion HOY, que es la
#  normalizada (migraciones 009 y 010):
#
#    - El propietario vive en `clientes`, no en la fila del
#      vehiculo. `vehiculos.id_cliente` lo apunta. Las columnas
#      nombre/apellido/telefono de `vehiculos` se conservan y se
#      siguen escribiendo en paralelo (doble escritura) para que
#      los scripts previos a la migracion sigan funcionando. No
#      son la fuente de verdad.
#
#    - Las fechas viven en `inspecciones` y `recalificaciones`,
#      donde la REAL es el dato principal y el vencimiento se
#      deriva de ella (+1 ano, +5 anos). Las columnas planas
#      fecha_inspeccion / fecha_recalificacion de `vehiculos`
#      tambien se escriben, por el mismo motivo.
#
#  `fecha_realizada` es NULL en los vehiculos que ya estaban
#  cargados antes de la migracion: no consta y no se inventa. El
#  vencimiento de esos si se conserva intacto. La vista
#  `v_fechas_pendientes` lista cuales son.
#
#  ORDEN DE LAS TABLAS
#  Este es el orden de creacion y NO es alfabetico: MariaDB
#  exige que la tabla referenciada por una clave foranea ya exista.
#  Por eso `usuarios` va antes que `clientes`,
#  `codigos_activacion`, `inventario_productos` y
#  `parametros_precios`.
#
#  Para reconstruir una base vacia:
#    mariadb -h HOST -u USUARIO -p NOMBRE_BASE < database/schema.sql
#
#  Quien ya tiene la base importada NO debe usar este archivo:
#  aplica las migraciones de database/migrations/ en orden, que
#  respetan los datos existentes. Este es para instalar de cero.
#
#  Para restaurar los datos, usar el backup.sql generado segun
#  docs/MIGRACION_MARIADB.md
# ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";

-- ------------------------------------------------------------
-- Tablas
-- ------------------------------------------------------------

-- INVENTARIO_PRODUCTOS
-- Catalogo unico del taller: productos, accesorios, repuestos,
-- insumos y kits de conversion. Lo que cambia entre uno y otro
-- es `categoria`, no la tabla.
--
-- `stock_actual` no se edita a mano. El modulo lo actualiza
-- siempre dentro de la misma transaccion que inserta el
-- movimiento, de modo que el stock y su historial nunca se
-- separan. Por eso arranca en 0 y la carga inicial se registra
-- como una ENTRADA.
--
-- NO hay categoria `cilindro` ni columnas de capacidad o
-- montaje. El cilindro no se inventaria: la IA lo recomienda
-- por medida, con un catalogo referencial que vive en el
-- codigo, y el taller lo pide. Lo que el taller COMPRA
-- (productos, repuestos) si se controla aqui.
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
  KEY `idx_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- USUARIOS
-- Personal del taller y clientes de la app movil. La contrasena
-- se guarda como hash bcrypt, nunca en claro.
--
-- El enum de `rol` empieza por 'tecnico' a proposito: es el valor
-- por defecto y el primero de la lista, y las filas existentes
-- usan 'tecnico' y 'administrador' en minusculas. Cambiar el orden
-- del enum no rompe datos, pero si el codigo, que compara por
-- posicion en vez de por nombre, se llevaria una sorpresa.
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(60) NOT NULL,
  `password` varchar(255) NOT NULL COMMENT 'Hash bcrypt. Nunca texto plano.',
  `rol` enum('tecnico','administrador','cliente') NOT NULL DEFAULT 'tecnico',
  `estado` enum('activo','inactivo') NOT NULL DEFAULT 'activo',
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_rol` (`rol`),
  KEY `idx_estado` (`estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- CLIENTES
-- El propietario, una vez por persona y no una vez por vehiculo.
-- De esta tabla cuelga la app movil: el usuario ve sus vehiculos
-- por `id_usuario`, nunca por telefono.
--
-- La clave unica es (nombre, apellido, telefono), no el telefono
-- solo, porque una familia puede compartir un numero. Por eso NO
-- hay indice unico en telefono: dos personas distintas pueden
-- tener el mismo.
--
-- `id_usuario` queda NULL hasta que la persona canjea su codigo
-- de activacion. Es el estado normal de un cliente que todavia no
-- abrio la app.
CREATE TABLE IF NOT EXISTS `clientes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(80) NOT NULL,
  `apellido` varchar(80) NOT NULL,
  `telefono` varchar(25) NOT NULL,
  `id_usuario` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cliente_persona` (`nombre`,`apellido`,`telefono`),
  KEY `idx_telefono` (`telefono`),
  KEY `idx_id_usuario` (`id_usuario`),
  CONSTRAINT `clientes_ibfk_1`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- VEHICULOS
-- El vehiculo, con su propietario en `clientes`.
--
-- `id_cliente` es la que usa la app movil. Si fuera NULL, el
-- vehiculo no apareceria en la lista del cliente: por eso
-- verify-database avisa cuando hay filas asi.
--
-- Las columnas planas (nombre, apellido, telefono,
-- fecha_inspeccion, fecha_recalificacion) se conservan y se
-- escriben en paralelo con las tablas normalizadas. Nadie las
-- deberia leer como fuente de verdad; se mantienen porque el job
-- de recordatorios y los scripts previos a la migracion las leen
-- tal cual, y cambiarlas de golpe habria roto avisos ya
-- programados.
--
-- indice unico en placa: no puede haber dos vehiculos con la
-- misma placa.
--
-- NO hay `id_cilindro`. El cilindro no es una entidad del
-- taller: no se lleva serie, capacidad, tipo ni stock. La
-- recalificacion cuelga del VEHICULO, por su fecha real.
--
-- NO hay `marca` ni `modelo`. Se agregaron en la migracion 012 y
-- se retiraron en la 013: el registro del taller guarda solo
-- propietario, placa y fechas.
CREATE TABLE IF NOT EXISTS `vehiculos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(80) NOT NULL,
  `apellido` varchar(80) NOT NULL,
  `placa` varchar(20) NOT NULL,
  `fecha_recalificacion` date NOT NULL,
  `fecha_inspeccion` date NOT NULL,
  `telefono` varchar(25) NOT NULL,
  `id_cliente` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `placa` (`placa`),
  KEY `idx_placa` (`placa`),
  KEY `idx_fecha_recal` (`fecha_recalificacion`),
  KEY `idx_fecha_insp` (`fecha_inspeccion`),
  KEY `idx_propietario` (`apellido`,`nombre`),
  KEY `idx_id_cliente` (`id_cliente`),
  CONSTRAINT `vehiculos_ibfk_cliente`
    FOREIGN KEY (`id_cliente`) REFERENCES `clientes` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- INSPECCIONES
-- La inspeccion de un vehiculo. UNA fila por vehiculo
-- (id_vehiculo es unico), no un historial: hoy solo interesa la
-- ultima.
--
-- REGLA DE NEGOCIO
--   fecha_vencimiento = fecha_realizada + 1 ano
--
-- `fecha_realizada` es el dato principal y puede ser NULL cuando
-- no consta (vehiculos cargados antes de la migracion). NO se
-- deduce restando un ano al vencimiento: eso seria inventar un
-- dato. En ese caso solo hay `fecha_vencimiento`, que es lo que
-- los recordatorios necesitan.
--
-- El indice sobre fecha_vencimiento es el que usa el job para
-- encontrar lo que vence en 10 dias.
CREATE TABLE IF NOT EXISTS `inspecciones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_vehiculo` int(11) NOT NULL,
  `fecha_realizada` date DEFAULT NULL,
  `fecha_vencimiento` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inspecciones_vehiculo` (`id_vehiculo`),
  KEY `idx_vencimiento` (`fecha_vencimiento`),
  CONSTRAINT `inspecciones_ibfk_1`
    FOREIGN KEY (`id_vehiculo`) REFERENCES `vehiculos` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- RECALIFICACIONES
-- Igual que `inspecciones`, con su propia regla:
--   fecha_vencimiento = fecha_realizada + 5 anos
CREATE TABLE IF NOT EXISTS `recalificaciones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_vehiculo` int(11) NOT NULL,
  `fecha_realizada` date DEFAULT NULL,
  `fecha_vencimiento` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_recalificaciones_vehiculo` (`id_vehiculo`),
  KEY `idx_vencimiento` (`fecha_vencimiento`),
  CONSTRAINT `recalificaciones_ibfk_1`
    FOREIGN KEY (`id_vehiculo`) REFERENCES `vehiculos` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- RECORDATORIOS_ENVIADOS
-- Historial de recordatorios ya enviados. Se conserva tal cual
-- estaba: la aplicacion lo usa para no repetir avisos.
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

-- NOTIFICACIONES
-- Cola de avisos programados (10 dias antes de la inspeccion o
-- la recalificacion). Antes eran 30, 15 y 7; ahora es solo 10.
-- Es lo que consume WPConnect desde
-- GET /api/integrations/whatsapp/pendientes
CREATE TABLE IF NOT EXISTS `notificaciones` (
  `id_notificacion` int(11) NOT NULL AUTO_INCREMENT,
  `id_vehiculo` int(11) NOT NULL,
  `tipo` enum('recalificacion','inspeccion') NOT NULL,
  `dias_anticipacion` int(3) NOT NULL COMMENT '10. Un solo aviso.',
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
  UNIQUE KEY `uq_vehiculo_tipo_dias_fecha`
    (`id_vehiculo`,`tipo`,`dias_anticipacion`,`fecha_programada`),
  KEY `idx_estado` (`estado`),
  KEY `idx_fecha_programada` (`fecha_programada`),
  CONSTRAINT `notificaciones_ibfk_1`
    FOREIGN KEY (`id_vehiculo`) REFERENCES `vehiculos` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- CODIGOS_ACTIVACION
-- Activacion de cuentas desde la app movil.
--
-- El codigo se guarda como SHA-256, nunca en claro: el hash es lo
-- unico que queda en la base si alguien lee el dump. Un codigo son
-- 10 caracteres de un alfabeto sin I, O, 0 ni 1 (para que no se
-- confundan al dictarse por telefono), y se teclea en minusculas o
-- sin guion: el backend normaliza antes de comparar.
--
-- Es de un solo uso y expira a los 7 dias. Al emitir uno nuevo se
-- invalidan los anteriores del mismo cliente.
--
-- `id_cliente` es quien puede canjearlo. Sin esta columna, un
-- codigo emitido antes de la migracion 010 no sabria a que cliente
-- pertenece y habria que rechazarlo en vez de adivinar.
--
-- `id_usuario` se llena al canjear: es quien lo redimio. Queda NULL
-- mientras el codigo esta sin usar.
CREATE TABLE IF NOT EXISTS `codigos_activacion` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_cliente` int(11) DEFAULT NULL COMMENT 'Cliente que puede canjearlo.',
  `id_usuario` int(11) DEFAULT NULL COMMENT 'Quien lo canjeo. NULL si sigue sin usar.',
  `telefono` varchar(25) DEFAULT NULL COMMENT 'Telefono al que se entrego.',
  `codigo_hash` varchar(255) NOT NULL COMMENT 'SHA-256. Nunca el codigo en claro.',
  `fecha_creacion` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_expiracion` datetime NOT NULL,
  `usado` tinyint(1) NOT NULL DEFAULT 0,
  `fecha_uso` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_codigo_hash` (`codigo_hash`),
  KEY `idx_id_usuario` (`id_usuario`),
  KEY `idx_id_cliente` (`id_cliente`),
  KEY `idx_expiracion` (`fecha_expiracion`),
  CONSTRAINT `codigos_activacion_ibfk_1`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `codigos_activacion_ibfk_cliente`
    FOREIGN KEY (`id_cliente`) REFERENCES `clientes` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- DISPOSITIVOS_PUSH
-- Tokens de Expo push de la app movil.
CREATE TABLE IF NOT EXISTS `dispositivos_push` (
  `id_dispositivo` int(11) NOT NULL AUTO_INCREMENT,
  `id_usuario` int(11) NOT NULL,
  `expo_push_token` varchar(255) NOT NULL,
  `plataforma` enum('android','ios') NOT NULL DEFAULT 'android',
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `fecha_registro` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_actualizacion` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id_dispositivo`),
  UNIQUE KEY `uq_expo_push_token` (`expo_push_token`),
  KEY `idx_usuario` (`id_usuario`),
  KEY `idx_usuario_activo` (`id_usuario`,`activo`),
  CONSTRAINT `dispositivos_push_ibfk_1`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- MOVIMIENTOS_INVENTARIO
-- Historial de entradas, salidas y ajustes del deposito. Nunca se
-- edita ni se borra: la trazabilidad depende de que sea inmutable.
-- El indice unico con `id_producto` impide el doble envio en
-- reintentos del job.
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
  KEY `idx_producto_fecha` (`id_producto`,`fecha`),
  KEY `idx_tipo` (`tipo`),
  KEY `idx_usuario` (`id_usuario`),
  CONSTRAINT `movimientos_inventario_ibfk_1`
    FOREIGN KEY (`id_producto`) REFERENCES `inventario_productos` (`id_producto`)
    ON DELETE RESTRICT,
  CONSTRAINT `movimientos_inventario_ibfk_2`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id`)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- PARAMETROS_PRECIOS
-- Valores del taller que no son un producto del deposito. Son lo
-- UNICO que el modulo de IA lee de la base: el precio de cada
-- capacidad de cilindro (`cilindro_40`) y la mano de obra de
-- instalacion (`instalacion_gnv`).
--
-- Los cilindros NO son productos del inventario, asi que su
-- precio va aqui y no en `inventario_productos.precio_venta`.
-- Asi el catalogo de la IA no depende del deposito.
--
-- Nace VACIA a proposito: un precio sembrado en el codigo es un
-- precio que nadie reviso. Lo carga el administrador.
--
-- Si falta un precio, la IA lo avisa con `faltan` en vez de
-- completar con cero: un 0 se lee como "es gratis".
--
-- `id_usuario` es ON DELETE SET NULL a proposito: si se da de
-- baja a quien cargo un precio, el precio se conserva. Perder un
-- precio por baja de un usuario seria peor que perder al autor.
CREATE TABLE IF NOT EXISTS `parametros_precios` (
  `clave` varchar(60) NOT NULL COMMENT 'Ej: instalacion_gnv, cilindro_40',
  `valor` decimal(12,2) NOT NULL,
  `moneda` varchar(8) NOT NULL DEFAULT 'BOB',
  `descripcion` varchar(255) DEFAULT NULL,
  `id_usuario` int(11) DEFAULT NULL COMMENT 'Quien lo cargo o lo cambio.',
  `fecha_actualizacion` datetime NOT NULL DEFAULT current_timestamp()
    ON UPDATE current_timestamp(),
  PRIMARY KEY (`clave`),
  CONSTRAINT `parametros_precios_ibfk_1`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id`)
    ON DELETE SET NULL,
  CONSTRAINT `chk_parametros_precio` CHECK (`valor` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ------------------------------------------------------------
-- Vistas
-- ------------------------------------------------------------
--  Sin DEFINER: asi el archivo se puede importar en cualquier
--  MariaDB online, donde el usuario root@localhost no existe.

-- Antes existian dos vistas, `v_inspeccion_en_7d` y
-- `v_recalificacion_en_30d`, con 7 y 30 dias. Se eliminan: el
-- taller dejo un unico aviso, 10 dias antes. Ver DIAS_AVISO en
-- src/modules/notificaciones/notificaciones.service.js.
DROP VIEW IF EXISTS `v_inspeccion_en_7d`;
DROP VIEW IF EXISTS `v_recalificacion_en_30d`;

-- VEHICULOS CON VENCIMIENTO EN 10 DIAS
-- Lo que consume el job de recordatorios.
--
-- Lee de `inspecciones` y `recalificaciones`, no de las columnas
-- planas: si el taller corrige una fecha real, el vencimiento se
-- recalcula y esta vista lo ve en el mismo momento.
--
-- El LEFT JOIN a `clientes` con COALESCE es a proposito. Un
-- vehiculo guardado sin cliente (id_cliente NULL) tiene que
-- seguir apareciendo en el aviso: que le falte el vinculo a la
-- app movil es un problema del cliente, no una razon para dejar
-- de avisarle. Un INNER JOIN le quitaria el recordatorio.
--
-- `tipo` permite leer las dos filas juntas sin dos consultas.
CREATE OR REPLACE VIEW `v_recordatorios_10d` AS
SELECT
  v.id,
  COALESCE(c.nombre, v.nombre)     AS nombre,
  COALESCE(c.apellido, v.apellido) AS apellido,
  v.placa,
  COALESCE(c.telefono, v.telefono) AS telefono,
  'inspeccion'                     AS tipo,
  i.fecha_vencimiento              AS fecha_objetivo
FROM inspecciones i
JOIN vehiculos v   ON v.id = i.id_vehiculo
LEFT JOIN clientes c ON c.id = v.id_cliente
WHERE i.fecha_vencimiento IS NOT NULL
  AND i.fecha_vencimiento = CURDATE() + INTERVAL 10 DAY
UNION ALL
SELECT
  v.id,
  COALESCE(c.nombre, v.nombre)     AS nombre,
  COALESCE(c.apellido, v.apellido) AS apellido,
  v.placa,
  COALESCE(c.telefono, v.telefono) AS telefono,
  'recalificacion'                 AS tipo,
  r.fecha_vencimiento              AS fecha_objetivo
FROM recalificaciones r
JOIN vehiculos v   ON v.id = r.id_vehiculo
LEFT JOIN clientes c ON c.id = v.id_cliente
WHERE r.fecha_vencimiento IS NOT NULL
  AND r.fecha_vencimiento = CURDATE() + INTERVAL 10 DAY;

-- FECHAS QUE FALTA COMPLETAR
-- Vehiculos con vencimiento pero sin fecha real: son los cargados
-- antes de la migracion 009.
--
-- No es un error, es trabajo pendiente de captura. NO se deduce
-- restando anos del vencimiento: eso seria inventar un dato.
-- Cuando el taller diga cuando se hizo cada trabajo, se completa
-- y la fila desaparece de aqui sola.
--
-- `pendientes` cuenta cuantos de los dos trabajos falta capturar
-- (0, 1 o 2), para priorizar.
CREATE OR REPLACE VIEW `v_fechas_pendientes` AS
SELECT
  v.id,
  v.placa,
  COALESCE(c.nombre, v.nombre)     AS nombre,
  COALESCE(c.apellido, v.apellido) AS apellido,
  COALESCE(c.telefono, v.telefono) AS telefono,
  i.fecha_realizada  AS inspeccion_realizada,
  i.fecha_vencimiento AS inspeccion_vencimiento,
  r.fecha_realizada  AS recalificacion_realizada,
  r.fecha_vencimiento AS recalificacion_vencimiento,
  (i.fecha_realizada IS NULL) + (r.fecha_realizada IS NULL) AS pendientes
FROM vehiculos v
LEFT JOIN clientes c   ON c.id = v.id_cliente
LEFT JOIN inspecciones i     ON i.id_vehiculo = v.id
LEFT JOIN recalificaciones r ON r.id_vehiculo = v.id
WHERE i.fecha_realizada IS NULL
   OR r.fecha_realizada IS NULL;

-- INVENTARIO POR DEBAJO DEL MINIMO
-- `sin_stock` y `stock_bajo` se separan porque agotarse no es
-- lo mismo que estar por agotarse.
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
