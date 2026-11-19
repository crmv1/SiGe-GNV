SET NAMES utf8mb4;
INSERT IGNORE INTO cot_fichas (modelo_id,generacion,carroceria,dimensiones,fuente)
SELECT id,'B11 · HB11 1500 SGL Extra (1982)','Sedán',
  'Exterior: 4050 × 1620 × 1390 mm; batalla 2400 mm.',
  'https://www.nissan-global.com/EN/HERITAGE_COLLECTION/sunny_1500_sgl_extra.html'
FROM cot_modelos WHERE marca='Nissan' AND modelo='Sunny';
