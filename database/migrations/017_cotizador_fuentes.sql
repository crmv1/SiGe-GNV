SET NAMES utf8mb4;

INSERT IGNORE INTO cot_fichas (modelo_id,generacion,carroceria,dimensiones,fuente)
SELECT id,'B12 · FB12 1500 EX Saloon (1988)','Sedán',
  'Exterior: largo 4175 mm, ancho 1640 mm, alto 1385 mm; batalla 2430 mm.',
  'https://www.nissan-global.com/EN/HERITAGE_COLLECTION/358_sunny_1500_ex_saloon.html'
FROM cot_modelos WHERE marca='Nissan' AND modelo='Sunny';

INSERT IGNORE INTO cot_fichas (modelo_id,generacion,carroceria,dimensiones,fuente)
SELECT id,'Carry 1.5 K15B · especificación Vietnam','Pick-up',
  'Plataforma: largo 2565 mm y ancho 1660 mm según texto del fabricante, sección Cargo.',
  'https://www.globalsuzuki.com/automobile/lineup/carry/#cargo'
FROM cot_modelos WHERE marca='Suzuki' AND modelo='Carry';
