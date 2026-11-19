-- ============================================================
--  007_inventario_datos_ia.sql
--  Precios que el modulo de IA necesita leer de MariaDB.
--
--  ------------------------------------------------------------
--  POR QUE ESTA MIGRACION
--  ------------------------------------------------------------
--  El modulo de reconocimiento de vehiculos
--  (src/ai/vehicleRecognition) tenia los precios escritos dentro
--  del .js. Eso prohibia dos cosas:
--
--    - cambiar un precio sin tocar codigo y redesplegar,
--    - que el precio que ve el cliente sea el mismo que el que
--      ve el taller.
--
--  La primera correccion fue poner el cilindro como PRODUCTO
--  del inventario, con su stock. Tambien estaba mal: mezclaba
--  "lo que el taller vende" con "lo que el taller tiene", y
--  hacia que la recomendacion dependiera del deposito.
--
--  Ahora el modulo NO lee `inventario_productos`. El cilindro
--  que se recomienda es una medida de mercado que vive en el
--  codigo (CILINDROS_REFERENCIA), y lo unico que sale de la
--  base son los PRECIOS.
--
--  ------------------------------------------------------------
--  QUE SE CREA
--  ------------------------------------------------------------
--  La tabla `parametros_precios`, para los valores del taller
--  que no son un producto fisico:
--
--    - `instalacion_gnv`   mano de obra de instalacion,
--    - `cilindro_<N>`      precio del cilindro de N litros,
--      uno por cada capacidad del catalogo referencial.
--
--  ------------------------------------------------------------
--  LO QUE SE RETIRA DE ESTA MIGRACION
--  ------------------------------------------------------------
--  Antes esta migracion agregaba a `inventario_productos` las
--  columnas `capacidad_litros` y `montaje`, con un CHECK que
--  obligaba a todo cilindro del catalogo a declarar capacidad
--  para que la IA no tuviera que adivinarla.
--
--  Ya no aplican, y estorban:
--    - obligan a inventariar cilindros, que es justo lo que no
--      se quiere manejar,
--    - `cilindro` salio del enum de `categoria` en la 006,
--    - la IA lee la capacidad del catalogo referencial, no del
--      inventario.
--
--  Si esta migracion ya se aplico en alguna base, la 011
--  (011_retirar_cilindros.sql) borra lo que quedo.
--
--  ------------------------------------------------------------
--  LO QUE NO SE HACE (a proposito)
--  ------------------------------------------------------------
--  - No se siembran precios. La tabla nace VACIA a proposito:
--    un precio inventado en una migracion es un precio que
--    nadie reviso. Los carga el administrador del taller.
--  - No se toca `inventario_productos.stock_actual`: lo sigue
--    llevando el modulo de inventario con sus movimientos.
--  - No se crean tablas de servicios ni de ordenes de
--    trabajo. Siguen sin existir en el proyecto.
--  - No se migra nada: la tabla de parametros arranca vacia.
--    No hay datos que perder.
--
--  ------------------------------------------------------------
--  ESTA MIGRACION ES RE-EJECUTABLE
--  ------------------------------------------------------------
--  `CREATE TABLE IF NOT EXISTS` lo garantiza por si sola.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";

-- ------------------------------------------------------------
--  1) PARAMETROS_PRECIOS
--     Valores del taller que no son un producto del deposito:
--     el precio de cada capacidad de cilindro y la mano de obra
--     de instalacion.
--
--     `clave` es texto libre pero controlada por la API: solo se
--     aceptan minusculas, digitos, guion y guion bajo. Asi el
--     modulo de IA y el panel hablen siempre de la misma clave.
--
--     NO lleva filas iniciales. Ver "LO QUE NO SE HACE".
--
--     `valor` es DECIMAL y `moneda` es VARCHAR, no un numero
--     suelto: si el taller empieza a cobrar en otra moneda, se
--     anade la fila con su simbolo y no hay que migrar nada.
--
--     Sin precio cargado, la IA NO completa con cero: avisa que
--     falta el dato. Un 0 silencioso se lee como "es gratis".
-- ------------------------------------------------------------
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
--  2) COMO CARGAR LOS PRECIOS
--     NO va aqui. Se carga desde el taller, con la sesion del
--     administrador, para que quede registrado quien lo puso:
--
--       INSERT INTO parametros_precios (clave, valor, moneda, descripcion, id_usuario)
--       VALUES ('instalacion_gnv', 0.00, 'BOB', 'Mano de obra de instalacion GNV', 1)
--       ON DUPLICATE KEY UPDATE
--         valor = VALUES(valor), moneda = VALUES(moneda),
--         descripcion = VALUES(descripcion), id_usuario = VALUES(id_usuario);
--
--     Y por cada capacidad del catalogo referencial:
--
--       INSERT INTO parametros_precios (clave, valor, moneda, descripcion, id_usuario)
--       VALUES ('cilindro_40', 0.00, 'BOB', 'Cilindro GNV de 40 litros', 1)
--       ON DUPLICATE KEY UPDATE
--         valor = VALUES(valor), moneda = VALUES(moneda),
--         descripcion = VALUES(descripcion), id_usuario = VALUES(id_usuario);
--
--     Se deja el 0.00 a proposito: un valor inventado en una
--     migracion es un precio que nadie reviso.
--
--  ------------------------------------------------------------
--  3) POR QUE YA NO HAY PREPARE/EXECUTE
--  ------------------------------------------------------------
--  Este archivo creaba las columnas de cilindro con
--  PREPARE/EXECUTE, porque un `ALTER TABLE` no puede ir dentro
--  de un `IF`: el DDL se valida al preparar la sentencia, no al
--  ejecutarla. Ese bloque se elimino junto con las columnas; la
--  011 se encarga de borrarlas donde todavia existan.
-- ============================================================
