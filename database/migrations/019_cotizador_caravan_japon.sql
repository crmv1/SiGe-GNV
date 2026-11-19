SET NAMES utf8mb4;

INSERT IGNORE INTO cot_fichas (modelo_id,generacion,carroceria,fuente)
SELECT id,'Caravan microbús · gama japonesa, ficha 2026-07','Microbús de 14 plazas',
  'Nissan Japón: https://www-asia.nissan-cdn.net/content/dam/Nissan/jp/vehicles/caravan/2607/pdf/caravan_2607_specsheet_01.pdf'
FROM cot_modelos WHERE marca='Nissan' AND modelo='Caravan';
