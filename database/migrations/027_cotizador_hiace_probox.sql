SET NAMES utf8mb4;

INSERT IGNORE INTO cot_fichas
  (modelo_id, generacion, carroceria, dimensiones, fuente, codigo_chasis, motorizacion, mercado)
SELECT id, 'Quinta generación · Hiace Wagon Long 2WD (lanzamiento 2004)', 'Wagon',
  'Exterior: 4840 × 1880 × 2105 mm. Batalla: 2570 mm.',
  'https://www.toyota.co.jp/jpn/company/history/75years/vehicle_lineage/car/id60015464/index.html',
  'CBA-TRH214W-JDPDK', '2TR-FE, gasolina, 2693 cm³', 'Japón'
FROM cot_modelos WHERE marca='Toyota' AND modelo='Hiace';

INSERT IGNORE INTO cot_fichas
  (modelo_id, generacion, carroceria, dimensiones, fuente, codigo_chasis, motorizacion, mercado, maletera_detalle)
SELECT id, 'Primera generación · Probox Van GL 1.5 2WD (lanzamiento 2002)', 'Furgón',
  'Exterior: 4195 × 1690 × 1525 mm. Batalla: 2550 mm.',
  'https://www.toyota-global.com/company/history_of_toyota/75years/vehicle_lineage/car/id60012554B/index.html',
  'UB-NCP51V-EXMGK', '1NZ-FE, gasolina, 1496 cm³', 'Japón',
  'Toyota documenta 1310 mm de largo de carga para la serie Probox Van con dos ocupantes.'
FROM cot_modelos WHERE marca='Toyota' AND modelo='Probox';
