SET NAMES utf8mb4;

INSERT IGNORE INTO cot_fichas
  (modelo_id, generacion, carroceria, dimensiones, fuente, codigo_chasis, motorizacion, mercado)
SELECT id,
  'Primera generación · Succeed Van UL (lanzamiento 2002)',
  'Furgón',
  'Exterior: 4300 × 1695 × 1525 mm. Batalla: 2550 mm.',
  'https://www.toyota-global.com/company/history_of_toyota/75years/vehicle_lineage/car/id60006139B/index.html',
  'UB-NCP51V-FXMGK',
  '1NZ-FE, gasolina, 1496 cm³',
  'Japón'
FROM cot_modelos
WHERE marca = 'Toyota' AND modelo = 'Succeed';
