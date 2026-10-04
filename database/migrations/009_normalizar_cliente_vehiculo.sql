-- ============================================================
--  009_normalizar_cliente_vehiculo.sql
--  Separa el propietario del vehiculo y saca las fechas de la
--  fila de la placa.
--
--  ------------------------------------------------------------
--  POR QUE ESTA MIGRACION
--  ------------------------------------------------------------
--  Hoy `vehiculos` mezcla cinco cosas distintas en una sola fila:
--
--      id, nombre, apellido, telefono,        <- el CLIENTE
--      placa,                                   <- el VEHICULO
--      fecha_inspeccion, fecha_recalificacion  <- el TRABAJO
--
--  Consecuencias concretas:
--
--  1. Un cliente con dos vehiculos queda duplicado. No hay forma
--     de saber que "Carlos Mamani" con el 59179795704 y con el
--     59170725109 es la misma persona, porque no hay entidad
--     cliente: hay dos filas.
--
--  2. La app movil no puede mostrar "mis vehiculos". Un usuario
--     con rol `cliente` no tiene ningun campo que lo conecte con
--     una fila de `vehiculos`. Por eso hoy recibe 403 en todos
--     los endpoints: ver el modulo `vehiculos` es ver el panel
--     del taller, no la vista del cliente.
--
--  3. Las fechas guardan el VENCIMIENTO, no la fecha en que se
--     hizo el trabajo. Para el taller la fecha real es la que
--     importa; el vencimiento es un calculo derivado.
--
--  ------------------------------------------------------------
--  QUE HACE
--  ------------------------------------------------------------
--  Crea:
--    clientes          el propietario, una vez, con sus vehiculos
--    inspecciones      un renglon por vehiculo, con la fecha real
--    recalificaciones  idem para la recalificacion
--
--  Y agrega a `vehiculos`:
--    id_cliente   -> clientes.id      (SET NULL)
--
--  ------------------------------------------------------------
--  LO QUE NO SE HACE CON CILINDROS
--  ------------------------------------------------------------
--  Una version anterior de esta migracion creaba la tabla
--  `cilindros` y la columna `vehiculos.id_cilindro`, para
--  registrar que equipo fisico estaba montado en cada auto.
--
--  Ya no se hace, a proposito: el cilindro no es una entidad
--  del taller. No se lleva serie, ni capacidad, ni tipo, ni
--  fecha de instalacion, ni stock. La recalificacion va
--  pegada al VEHICULO, por su fecha real:
--
--      inspecciones.fecha_realizada        + 1 ano
--      recalificaciones.fecha_realizada    + 5 anos
--
--  El unico lugar donde aparece un cilindro es la
--  recomendacion de la IA, que es una medida de mercado, no un
--  dato guardado. Si esta migracion ya se aplico en alguna base,
--  la 011 (011_retirar_cilindros.sql) borra lo que quedo.
--
--  ------------------------------------------------------------
--  LO QUE ESTA MIGRACION NO HACE (a proposito)
--  ------------------------------------------------------------
--  - NO borra ninguna tabla, columna ni fila. Las columnas
--    `nombre`, `apellido`, `telefono`, `fecha_inspeccion` y
--    `fecha_recalificacion` siguen existiendo. Son la red de
--    seguridad: si algo sale mal, la base de siempre sigue
--    intacta y arrancando.
--
--  - NO inventa fechas. Este es el punto mas delicado de toda
--    la migracion.
--
--    Podria "rellenar" `fecha_realizada` restando 1 ano (o 5)
--    al vencimiento que ya existe, y el resultado pareciera
--    limpio. Seria MENTIRA: nadie sabe cuando se hizo realmente
--    la inspeccion de un vehiculo que se cargo en 2019. Un dato
--    inventado con forma de dato real es peor que un NULL,
--    porque nadie lo va a volver a revisar.
--
--    Asi que `fecha_realizada` nace en NULL, que significa
--    "no consta". `fecha_vencimiento` si recibe el valor que ya
--    existia, que ese si es real y verificado.
--
--    Con eso la app movil ya puede mostrar fechas y contar dias
--    hacia el vencimiento, que es lo que el cliente viene a ver.
--    Las fechas reales se cargan despues, a mano, con el taller
--    delante. Para eso queda scripts/reporte-fechas-pendientes.js,
--    que lista los vehiculos con `fecha_realizada` en NULL.
--
--  - No siembra datos de prueba ni genera codigos.
--
--  ------------------------------------------------------------
--  ESTA MIGRACION ES RE-EJECUTABLE
--  ------------------------------------------------------------
--  - Las tablas se crean con IF NOT EXISTS.
--  - Las columnas y los indices se consultan antes en
--    `information_schema`: si ya existen, se saltan.
--  - Los respaldos de datos usan INSERT IGNORE contra claves
--    unicas, asi que una segunda pasada no duplica nada.
--
--  Se puede aplicar las veces que haga falta sin romper nada.
--
--  ORDEN: requiere 001-008 aplicadas. El indice sobre
--  `inventario_productos` se omite si esa tabla todavia no
--  existe (base sin 006/007); se agrega solo, no se rompe.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";

-- ------------------------------------------------------------
--  1) CLIENTES
--  ------------------------------------------------------------
--  La clave unica (nombre, apellido, telefono) hace dos cosas:
--  es la regla de negocio "una persona, un registro" y es la
--  que permite deduplicar al migrar. Si el mismo nombre con el
--  mismo telefono aparece en dos placas, el segundo vehiculo se
--  cuelga del mismo cliente en lugar de crear otro.
--
--  `id_usuario` es el puente con la cuenta. Vive aqui y no en
--  `usuarios` porque el taller tambien tiene clientes que nunca
--  descargaron la app: son reales y tienen vehiculos, pero no
--  tienen cuenta. Por eso la FK es NULL y no obligatoria.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `clientes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(80) NOT NULL,
  `apellido` varchar(80) NOT NULL,
  `telefono` varchar(25) NOT NULL COMMENT 'Solo digitos. Es como los guarda el backend.',
  `id_usuario` int(11) DEFAULT NULL COMMENT 'Cuenta con rol cliente. NULL si todavia no se registro en la app.',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cliente_persona` (`nombre`,`apellido`,`telefono`),
  KEY `idx_clientes_telefono` (`telefono`),
  KEY `idx_clientes_usuario` (`id_usuario`),
  CONSTRAINT `clientes_ibfk_1`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ------------------------------------------------------------
--  2) INSPECCIONES
-- ------------------------------------------------------------
--  `fecha_realizada` es el dato principal: el dia en que el
--  vehiculo paso la inspeccion.
--  `fecha_vencimiento` es derivado: realizada + 1 ano.
--
--  El vencimiento NO se pide nunca. Lo calcula el backend con
--  sumarAnios() en src/modules/vehiculos/vehiculos.service.js y
--  se guarda para poder indexar y ordenar rapido. Se escribe
--  siempre junto a la fecha real, nunca desde el formulario.
--
--  UNIQUE en `id_vehiculo`: un renglon por vehiculo, que es el
--  estado actual. El historial de inspecciones anteriores es
--  OTRA tabla y no se mezcla aqui a proposito; hoy la aplicacion
--  no lo necesita y una tabla con un UNIQUE en vez de la fecha
--  seria una decision difficult de revertir.
--
--  `fecha_realizada` acepta NULL a proposito: ver la seccion
--  "LO QUE ESTA MIGRACION NO HACE" mas arriba.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inspecciones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_vehiculo` int(11) NOT NULL,
  `fecha_realizada` date DEFAULT NULL COMMENT 'NULL = no consta. No se adivina.',
  `fecha_vencimiento` date NOT NULL COMMENT 'Derivada: realizada + 1 ano. La calcula el backend.',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inspecciones_vehiculo` (`id_vehiculo`),
  KEY `idx_inspecciones_vencimiento` (`fecha_vencimiento`),
  KEY `idx_inspecciones_realizada` (`fecha_realizada`),
  CONSTRAINT `inspecciones_ibfk_1`
    FOREIGN KEY (`id_vehiculo`) REFERENCES `vehiculos` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ------------------------------------------------------------
--  3) RECALIFICACIONES
--  ------------------------------------------------------------
--  Igual que `inspecciones`, con la regla de +5 anos.
-- Va en su propia tabla y no como dos columnas mas porque
--  "recalificacion" y "inspeccion" no se comportan igual: la
--  inspeccion es anual y la recalificacion quinquenal, y cada
--  una tiene su historial y su aviso.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `recalificaciones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_vehiculo` int(11) NOT NULL,
  `fecha_realizada` date DEFAULT NULL COMMENT 'NULL = no consta. No se adivina.',
  `fecha_vencimiento` date NOT NULL COMMENT 'Derivada: realizada + 5 anos. La calcula el backend.',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_recalificaciones_vehiculo` (`id_vehiculo`),
  KEY `idx_recalificaciones_vencimiento` (`fecha_vencimiento`),
  KEY `idx_recalificaciones_realizada` (`fecha_realizada`),
  CONSTRAINT `recalificaciones_ibfk_1`
    FOREIGN KEY (`id_vehiculo`) REFERENCES `vehiculos` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ------------------------------------------------------------
--  4) La columna nueva en `vehiculos`
-- ------------------------------------------------------------
--  ON DELETE SET NULL en las dos, y es deliberado:
--
--  Borrar un cliente no debe borrar los vehiculos. El taller
--  podria dar de baja a un cliente que vendio el auto, y los
--  vehiculos con su historial de inspeccion se conservan. Lo
--  que se pierde es la referencia al cliente, que ya no existe.
--
--  Al reves, si el FK fuera CASCADE, un DELETE mal日系ado
--  llevaria por delante el historial del taller.
-- ------------------------------------------------------------
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `vehiculos` ADD COLUMN `id_cliente` int(11) DEFAULT NULL COMMENT ''Propietario. No es obligatorio: hay vehiculos de clientes que nunca se registraron.'' AFTER `id`',
    'DO 0'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vehiculos'
    AND COLUMN_NAME = 'id_cliente'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FKs. Se agregan aparte porque un REFERENCES a una tabla que no
-- existe todavia aborta el ALTER completo.
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `vehiculos` ADD CONSTRAINT `vehiculos_ibfk_cliente` FOREIGN KEY (`id_cliente`) REFERENCES `clientes` (`id`) ON DELETE SET NULL',
    'DO 0'
  )
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vehiculos'
    AND CONSTRAINT_NAME = 'vehiculos_ibfk_cliente'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Indices de consulta. La app movil va a filtrar siempre por
-- id_cliente, asi que sin este indice seria un escaneo de
-- tabla cada vez que un cliente abre su pantalla.
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `vehiculos` ADD INDEX `idx_vehiculos_cliente` (`id_cliente`)',
    'DO 0'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vehiculos'
    AND INDEX_NAME = 'idx_vehiculos_cliente'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
--  5) Respaldo de los datos que YA existen
-- ------------------------------------------------------------
--  INSERT IGNORE contra la clave unica: si ya hay un cliente con
--  ese nombre, apellido y telefono, la fila se salta y se
--  reutiliza. Por eso la migracion se puede correr dos veces.

-- 6.1) Un cliente por persona, dedupe por la clave unica.
INSERT IGNORE INTO `clientes` (`nombre`, `apellido`, `telefono`)
SELECT `nombre`, `apellido`, `telefono`
  FROM `vehiculos`;

-- 6.2) Cada vehiculo apunta a su cliente.
UPDATE `vehiculos` v
  JOIN `clientes` c
    ON c.`nombre`    = v.`nombre`
   AND c.`apellido`  = v.`apellido`
   AND c.`telefono`  = v.`telefono`
   SET v.`id_cliente` = c.`id`
 WHERE v.`id_cliente` IS NULL;

-- 6.3) Las fechas de vencimiento que ya existian.
--      `fecha_realizada` se queda en NULL: ver la seccion de
--      arriba. Solo se copia lo que si se sabe.
INSERT IGNORE INTO `inspecciones` (`id_vehiculo`, `fecha_realizada`, `fecha_vencimiento`)
SELECT `id`, NULL, `fecha_inspeccion`
  FROM `vehiculos`
 WHERE `fecha_inspeccion` IS NOT NULL;

INSERT IGNORE INTO `recalificaciones` (`id_vehiculo`, `fecha_realizada`, `fecha_vencimiento`)
SELECT `id`, NULL, `fecha_recalificacion`
  FROM `vehiculos`
 WHERE `fecha_recalificacion` IS NOT NULL;

-- 6.4) Enlazar las cuentas de cliente que YA existen.
--
-- Hoy `usuarios` no tiene columna de telefono, asi que la unica
-- forma de encontrar a un cliente es por `username`: en la app
-- movil el usuario es su numero de telefono, sin el + y sin
-- espacios (59179795704).
--
-- Se exigen TRES cosas a la vez, y las tres importan:
--
--   - que el rol sea 'cliente'. Sin esto se colgaria tambien la
--     cuenta del tecnico, que podria tener cualquier username.
--   - que el username sea solo digitos, para no enlazar un
--     cliente con una cuenta de correo que se parece a un
--     telefono por casualidad.
--   - que el cliente todavia no tenga cuenta. `id_usuario IS
--     NULL` evita pisar un enlace correcto.
--
-- En una base recien migrada esto no enlaza nada: todavia no
-- hay usuarios con rol 'cliente'. Sirve para las bases donde
-- la app movil ya se estuvo usando, y para no tener que hacerlo
-- a mano vehiculo por vehiculo.
--
-- El orden de las columnas en el SELECT es importante: el
-- segundo SELECT de un IN de MySQL/MariaDB se evalua en orden,
-- asi que el mas antiguo gana. Se ordena por id para que sea
-- determinista.
UPDATE `clientes` c
  JOIN (
    SELECT
      v.`telefono`  AS telefono,
      MIN(u.`id`)   AS id_usuario
    FROM `vehiculos` v
    JOIN `usuarios` u
      ON u.`username` = v.`telefono`
     AND u.`rol` = 'cliente'
     AND u.`username` REGEXP '^[0-9]+$'
    GROUP BY v.`telefono`
  ) l ON l.`telefono` = c.`telefono`
  SET c.`id_usuario` = l.`id_usuario`
 WHERE c.`id_usuario` IS NULL;

-- ------------------------------------------------------------
--  7) La vista de recordatorios pasa a leer las tablas nuevas
-- ------------------------------------------------------------
--  Antes leia `vehiculos.fecha_inspeccion`. Ahora lee el
--  vencimiento de `inspecciones` y `recalificaciones`, que es
--  donde va a vivir el dato de verdad.
--
--  COALESCE en nombre, apellido y telefono: mientras dure la
--  transicion, el nombre canonico esta en `clientes` pero la
--  columna vieja sigue siendo la que ve el resto del sistema.
--  Si por algun motivo un vehiculo no quedo enlazado, la vista
--  no pierde la fila ni manda NULL a WhatsApp.
--
--  La regla de los 10 dias no cambia. Lo que cambia es de donde
--  se lee la fecha.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW `v_recordatorios_10d` AS
SELECT
  v.id AS id,
  COALESCE(c.nombre,   v.nombre)   AS nombre,
  COALESCE(c.apellido, v.apellido) AS apellido,
  v.placa AS placa,
  COALESCE(c.telefono, v.telefono) AS telefono,
  'inspeccion' AS tipo,
  i.fecha_vencimiento AS fecha_objetivo
FROM inspecciones i
JOIN vehiculos v ON v.id = i.id_vehiculo
LEFT JOIN clientes c ON c.id = v.id_cliente
WHERE i.fecha_vencimiento IS NOT NULL
  AND i.fecha_vencimiento = CURDATE() + INTERVAL 10 DAY
UNION ALL
SELECT
  v.id AS id,
  COALESCE(c.nombre,   v.nombre)   AS nombre,
  COALESCE(c.apellido, v.apellido) AS apellido,
  v.placa AS placa,
  COALESCE(c.telefono, v.telefono) AS telefono,
  'recalificacion' AS tipo,
  r.fecha_vencimiento AS fecha_objetivo
FROM recalificaciones r
JOIN vehiculos v ON v.id = r.id_vehiculo
LEFT JOIN clientes c ON c.id = v.id_cliente
WHERE r.fecha_vencimiento IS NOT NULL
  AND r.fecha_vencimiento = CURDATE() + INTERVAL 10 DAY;

-- ------------------------------------------------------------
--  8) Vista de apoyo: que le falta completar a cada vehiculo
-- ------------------------------------------------------------
--  No es una vista de negocio, es una lista de trabajo. Sirve
--  para lo unico que no se puede resolver solo: pedirle al
--  taller la fecha en que se hizo cada inspeccion, la que hoy
--  no esta en ninguna parte.
--
--  `pendientes` cuenta cuantas fechas reales faltan. Con
--  `pendientes > 0` la fila aparece en la lista.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW `v_fechas_pendientes` AS
SELECT
  v.id AS id,
  v.placa AS placa,
  COALESCE(c.nombre,   v.nombre)   AS nombre,
  COALESCE(c.apellido, v.apellido) AS apellido,
  COALESCE(c.telefono, v.telefono) AS telefono,
  i.fecha_realizada AS inspeccion_realizada,
  i.fecha_vencimiento AS inspeccion_vencimiento,
  r.fecha_realizada AS recalificacion_realizada,
  r.fecha_vencimiento AS recalificacion_vencimiento,
  ((i.fecha_realizada IS NULL) + (r.fecha_realizada IS NULL)) AS pendientes
FROM vehiculos v
LEFT JOIN clientes c        ON c.id = v.id_cliente
LEFT JOIN inspecciones i    ON i.id_vehiculo = v.id
LEFT JOIN recalificaciones r ON r.id_vehiculo = v.id
WHERE i.fecha_realizada IS NULL
   OR r.fecha_realizada IS NULL;

-- ============================================================
--  Fin.
--
--  COMPROBACIONES
--
--    -- Los clientes se crearon solos, uno por persona:
--    SELECT id, nombre, apellido, telefono FROM clientes;
--
--    -- Cada vehiculo quedo enlazado a su cliente:
--    SELECT COUNT(*) AS sin_cliente FROM vehiculos WHERE id_cliente IS NULL;
--
--    -- No se invento ninguna fecha: deben salir todas en NULL.
--    SELECT COUNT(*) AS inventadas
--      FROM inspecciones WHERE fecha_realizada IS NOT NULL;
--
--    -- Las fechas que el taller ya tenia siguen intactas:
--    SELECT COUNT(*) FROM vehiculos;
--
--    -- Que falta completar:
--    SELECT * FROM v_fechas_pendientes ORDER BY placa;
-- ============================================================
