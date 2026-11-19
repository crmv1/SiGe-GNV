SET NAMES utf8mb4;
INSERT IGNORE INTO cot_fichas (modelo_id,generacion,carroceria,dimensiones,fuente,codigo_chasis,motorizacion,mercado)
SELECT id,'B10 · Datsun Sunny 1000 Deluxe (1966)','Sedán',
  'Exterior: 3820 × 1445 × 1345 mm; batalla 2280 mm.',
  'https://www.nissan-global.com/EN/HERITAGE_COLLECTION/datsun_sunny_deluxe.html','B10','A10, 988 cm³','Japón'
FROM cot_modelos WHERE marca='Nissan' AND modelo='Sunny';
