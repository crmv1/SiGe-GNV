SET NAMES utf8mb4;
INSERT IGNORE INTO cot_fichas (modelo_id,generacion,carroceria,dimensiones,fuente,codigo_chasis,motorizacion,mercado)
SELECT id,'B110 · Datsun Sunny 1200 Deluxe 4 puertas (1970)','Sedán',
  'Exterior: 3830 × 1495 × 1390 mm; batalla 2300 mm.',
  'https://www.nissan-global.com/EN/HERITAGE_COLLECTION/datsun_sunny_1200_4_deluxe.html','B110','A12, 1171 cm³','Japón'
FROM cot_modelos WHERE marca='Nissan' AND modelo='Sunny';
