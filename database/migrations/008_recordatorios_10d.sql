-- ============================================================
--  008_recordatorios_10d.sql
--  Deja el recordatorio en UN solo aviso: 10 dias antes.
--
--  ------------------------------------------------------------
--  POR QUE ESTA MIGRACION
--  ------------------------------------------------------------
--  La base venia de un dump que traia dos vistas:
--
--      v_inspeccion_en_7d       ->  7 dias antes
--      v_recalificacion_en_30d  ->  30 dias antes
--
--  Y el job generaba avisos a 30, 15 y 7 dias. Eso es un
--  sistema de tres recordatorios por vehiculo. El taller
--  pidio UNO solo, 10 dias antes, asi que:
--
--    - se borran las dos vistas viejas,
--    - se crea `v_recordatorios_10d`, que cubre inspeccion y
--      recalificacion en una sola lectura.
--
--  ------------------------------------------------------------
--  REGLA DE NEGOCIO (queda escrita aqui para que no se pierda)
--  ------------------------------------------------------------
--    inspeccion     = fecha en que se hizo + 1 ano
--    recalificacion = fecha en que se hizo + 5 anos
--    aviso          = 10 dias antes de esa fecha
--
--  El calculo de +1 ano y +5 anos NO es de esta migracion:
--  vive en el backend, en src/modules/vehiculos/vehiculos.service.js
--  (calcularProxima). Esta migracion no inventa fechas; solo
--  cambia de cuando se avisa.
--
--  ------------------------------------------------------------
--  LO QUE NO SE HACE
--  ------------------------------------------------------------
--  - No se modifica ninguna fila de `vehiculos`. Las fechas ya
--    registradas se respetan tal cual estan.
--  - No se borran notificaciones ni recordatorios ya enviados.
--  - No se siembran datos.
--
--  Es re-ejecutable: DROP VIEW IF EXISTS y CREATE OR REPLACE.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";

-- ------------------------------------------------------------
--  1) Fuera las vistas de 7 y 30 dias.
-- ------------------------------------------------------------
DROP VIEW IF EXISTS `v_inspeccion_en_7d`;
DROP VIEW IF EXISTS `v_recalificacion_en_30d`;

-- ------------------------------------------------------------
--  2) La vista unica de 10 dias.
--     `tipo` permite leer inspeccion y recalificacion juntas.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW `v_recordatorios_10d` AS
SELECT
  v.id,
  v.nombre,
  v.apellido,
  v.placa,
  v.telefono,
  'inspeccion' AS tipo,
  v.fecha_inspeccion AS fecha_objetivo
FROM vehiculos v
WHERE v.fecha_inspeccion IS NOT NULL
  AND v.fecha_inspeccion = CURDATE() + INTERVAL 10 DAY
UNION ALL
SELECT
  v.id,
  v.nombre,
  v.apellido,
  v.placa,
  v.telefono,
  'recalificacion' AS tipo,
  v.fecha_recalificacion AS fecha_objetivo
FROM vehiculos v
WHERE v.fecha_recalificacion IS NOT NULL
  AND v.fecha_recalificacion = CURDATE() + INTERVAL 10 DAY;

-- ============================================================
--  Fin. Para comprobar que quedo bien:
--
--    SELECT * FROM v_recordatorios_10d;
--
--  deberia devolver 0 filas hoy, y traer una por cada vehiculo
--  cuya inspeccion o recalificacion vence en 10 dias.
-- ============================================================
