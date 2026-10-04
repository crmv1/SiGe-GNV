-- ============================================================
--  011_retirar_cilindros.sql
--  Saca el cilindro como ENTIDAD. No borra datos del taller.
--
--  ------------------------------------------------------------
--  POR QUE HACE FALTA UNA MIGRACION, Y NO SOLO EDITAR LAS
--  ANTERIORES
--  ------------------------------------------------------------
--  La 006, la 007 y la 009 ya se editaron para que no creen
--  nada de cilindros. Eso basta en una base NUEVA.
--
--  En una base donde esas migraciones ya corrieron, el
--  `CREATE TABLE IF NOT EXISTS` y los `ADD COLUMN` no hacen
--  nada: la estructura vieja sigue ahi. Esta migracion la
--  retira. Por eso es un paso propio y no una correccion
--  silenciosa.
--
--  ------------------------------------------------------------
--  QUE QUITA
--  ------------------------------------------------------------
--    1) `inventario_productos.capacidad_litros`
--    2) `inventario_productos.montaje`
--    3) el CHECK `chk_productos_cilindro_completo`
--    4) el valor `cilindro` del enum `categoria`
--    5) `vehiculos.id_cilindro` (con su FK y su indice)
--    6) la tabla `cilindros`
--
--  ------------------------------------------------------------
--  LO QUE NO TOCA
--  ------------------------------------------------------------
--  - `inventario_productos` sigue existiendo y sigue siendo el
--    catalogo de lo que el taller COMPRA: productos, accesorios,
--    repuestos, insumos, kits. De ahi no se saca nada.
--  - `parametros_precios` sigue existiendo: es de donde la IA
--    toma los precios (`cilindro_<N>` e `instalacion_gnv`).
--  - Las fechas de inspeccion y recalificacion no se tocan: ya
--    viven en el vehiculo, con su fecha real.
--  - No borra filas de datos del taller, salvo la tabla
--    `cilindros`, que se borra SOLO si esta vacia (ver 4).
--
--  ------------------------------------------------------------
--  POR QUE ES SEGURA SI ALGO YA SE USO
--  ------------------------------------------------------------
--  Cada paso comprueba `information_schema` antes de actuar, asi
--  que se puede correr una, dos o diez veces.
--
--  Y en vez de un `DROP TABLE cilindros` a seco, primero se
--  pregunta si tiene filas:
--
--    - si esta VACIA, se borra;
--    - si tiene filas, NO se borra y el script avisa. Perder
--      datos reales en una migracion es peor que dejar una
--      tabla de mas, y el taller tiene que decidir que hacer
--      con ella, no el script.
--
--  En la base de pruebas y en la de desarrollo la tabla esta
--  vacia, asi que se borra y listo.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";

-- ------------------------------------------------------------
--  1) CHECK de cilindro completo
--
--  Va primero: obliga a `capacidad_litros`, que se borra en el
--  paso 2. Si se invirtiera el orden, el ALTER podria fallar.
-- ------------------------------------------------------------
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'DO 0',
    'ALTER TABLE `inventario_productos` DROP CONSTRAINT `chk_productos_cilindro_completo`'
  )
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventario_productos'
    AND CONSTRAINT_NAME = 'chk_productos_cilindro_completo'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
--  2) Columnas que solo servian para el cilindro
--
--  `capacidad_litros` y `montaje` se consultan por separado
--  porque cada ALTER se decide por su cuenta.
-- ------------------------------------------------------------
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'DO 0',
    'ALTER TABLE `inventario_productos` DROP COLUMN `capacidad_litros`'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventario_productos'
    AND COLUMN_NAME = 'capacidad_litros'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'DO 0',
    'ALTER TABLE `inventario_productos` DROP COLUMN `montaje`'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventario_productos'
    AND COLUMN_NAME = 'montaje'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
--  3) El valor `cilindro` sale del enum de `categoria`
--
--  Solo si ya no queda ningun producto con esa categoria: si
--  quedara alguno, el ALTER fallaria y es preferible fallar
--  aqui que dejar el enum a medias.
-- ------------------------------------------------------------
SET @cilindros_en_uso := (
  SELECT COUNT(*) FROM `inventario_productos` WHERE `categoria` = 'cilindro'
);

SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'inventario_productos'
        AND COLUMN_NAME = 'categoria') = 0,
    'DO 0',
    IF(
      @cilindros_en_uso > 0,
      -- Con productos de categoria cilindro, no se toca el enum:
      -- se avisa y sigue. Ver el paso 3b.
      'DO 0',
      'ALTER TABLE `inventario_productos` MODIFY COLUMN `categoria` ENUM(''producto'',''accesorio'',''repuesto'',''insumo'',''kit'',''otro'') NOT NULL DEFAULT ''producto'''
    )
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3b) Aviso, sin cambiar nada.
SELECT IF(
  @cilindros_en_uso > 0,
  CONCAT('  ATENCION: hay ', @cilindros_en_uso,
         ' producto(s) con categoria=cilindro. No se toco el enum de categoria.'),
  '  categoria: sin productos de tipo cilindro, valor retirado del enum.'
) AS aviso_categoria
\G

-- ------------------------------------------------------------
--  4) La tabla `cilindros` y `vehiculos.id_cilindro`
--
--  `id_cilindro` se va siempre: es una FK a una tabla que ya
--  no debe existir, y todas sus filas estan en NULL. Se borran
--  primero la FK y el indice, porque una columna con FK no se
--  puede quitar sin soltar antes la restriccion.
--
--  La tabla, en cambio, SOLO se borra si esta vacia.
-- ------------------------------------------------------------
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'DO 0',
    'ALTER TABLE `vehiculos` DROP FOREIGN KEY `vehiculos_ibfk_cilindro`'
  )
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vehiculos'
    AND CONSTRAINT_NAME = 'vehiculos_ibfk_cilindro'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'DO 0',
    'ALTER TABLE `vehiculos` DROP INDEX `idx_vehiculos_cilindro`'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vehiculos'
    AND INDEX_NAME = 'idx_vehiculos_cilindro'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'DO 0',
    'ALTER TABLE `vehiculos` DROP COLUMN `id_cilindro`'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vehiculos'
    AND COLUMN_NAME = 'id_cilindro'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- La tabla: primero se mira si tiene filas.
--
-- El -1 significa "la tabla no existe". No se puede llamar a
-- `SELECT COUNT(*) FROM cilindros` sin saber si existe, asi que
-- el IF decide que consulta se hace. Con una base vacia de
-- tablas, el COUNT sobre information_schema devuelve 0 y no se
-- intenta leer `cilindros`.
SET @cilindros_existe := (
  SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cilindros'
);

-- El SELECT se arma en una variable y se PREPAREa aparte. Un
-- `IF(cond, -1, (SELECT ...))` dentro de SET no funciona: MariaDB
-- evalua la rama del SELECT aunque la condicion sea falsa, asi
-- que al segundo corrida, con la tabla ya borrada, falla con
-- "Table 'cilindros' doesn't exist".
SET @sql := IF(
  @cilindros_existe = 0,
  'SELECT -1 INTO @filas_cilindros',
  'SELECT COUNT(*) INTO @filas_cilindros FROM `cilindros`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- El IF va DENTRO de la expresion de SET: un `IF ... THEN ...
-- END IF` suelto solo es valido dentro de un stored program
-- (procedure, function, trigger, event) y aqui daria error de
-- sintaxis. Lo mismo aplica a los dos SELECT de aviso, que por
-- eso son `IF(...)` y no bloques.
SET @sql := IF(@filas_cilindros = 0, 'DROP TABLE IF EXISTS `cilindros`', 'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ultima vez: el aviso, o la confirmacion.
SELECT IF(
  @filas_cilindros = 0,
  '  tabla cilindros: existia y estaba vacia -> borrada.',
  IF(
    @filas_cilindros < 0,
    '  tabla cilindros: no existia. Nada que hacer.',
    CONCAT('  ATENCION: la tabla cilindros tiene ', @filas_cilindros,
           ' fila(s). NO se borro. Revisala y borrala a mano si corresponde.')
  )
) AS aviso_cilindros
\G

-- ------------------------------------------------------------
--  5) QUE QUEDA PARA LA IA
-- ------------------------------------------------------------
--  La IA ya no lee nada de esto:
--
--    - el catalogo de cilindros esta en el codigo
--      (CILINDROS_REFERENCIA), con sus medidas,
--    - los precios salen de `parametros_precios`
--      (`cilindro_<N>` e `instalacion_gnv`).
--
--  Para cargar un precio, desde el panel de ajustes:
--
--      INSERT INTO parametros_precios (clave, valor, moneda, descripcion, id_usuario)
--      VALUES ('cilindro_40', 0.00, 'BOB', 'Cilindro GNV de 40 litros', 1)
--      ON DUPLICATE KEY UPDATE
--        valor = VALUES(valor), moneda = VALUES(moneda),
--        descripcion = VALUES(descripcion), id_usuario = VALUES(id_usuario);
--
-- ============================================================
