SET NAMES utf8mb4;

INSERT IGNORE INTO cot_fichas
  (modelo_id, generacion, carroceria, dimensiones, fuente, codigo_chasis, motorizacion, mercado)
SELECT id, 'Y12 · Wingroad 15S 2WD', 'Familiar',
  'Exterior: 4440 × 1695 × 1505 mm. Batalla: 2600 mm.',
  'https://history.nissan.co.jp/WINGROAD/Y12/0511/www3.nissan.co.jp/content/dam/Nissan/jp/vehicles/WINGROAD_DEV/pdf/wingroad_specification.pdf',
  'DBA-Y12', 'HR15DE, gasolina, 1498 cm³', 'Japón'
FROM cot_modelos WHERE marca='Nissan' AND modelo='Wingroad';

INSERT IGNORE INTO cot_fichas
  (modelo_id, generacion, carroceria, dimensiones, fuente, motorizacion, mercado, maletera_l, maletera_detalle)
SELECT id, 'Novena generación · Familia S-wagon R FWD (lanzamiento 1998)', 'Familiar',
  'Exterior: 4200 × 1695 × 1420 mm.',
  'https://newsroom.mazda.com/en/publicity/release/1998/9806/980609.1.html',
  'ZL-VE, gasolina, 1,5 L', 'Japón', 366,
  'Máximo según VDA. Asientos traseros con desplazamiento de hasta 160 mm en FWD.'
FROM cot_modelos WHERE marca='Mazda' AND modelo='Familia';
