SET NAMES utf8mb4;

INSERT IGNORE INTO cot_fichas
  (modelo_id,generacion,desde,hasta,carroceria,dimensiones,fuente,motorizacion,mercado,maletera_l,maletera_detalle)
SELECT id,'Sentra S · año modelo 2020',2020,2020,'Sedán',
  'Exterior: 182.7 × 71.5 × 56.9 pulgadas. Batalla: 106.8 pulgadas.',
  'https://www.nissanusa.com/content/dam/Nissan/us/vehicle-brochures/2020/2020-nissan-sentra-brochure-en.pdf',
  'Gasolina, 2.0 L','Estados Unidos',404.93,'Capacidad de carga publicada: 14.3 pies cúbicos, equivalentes a 404.93 L.'
FROM cot_modelos WHERE marca='Nissan' AND modelo='Sentra';

INSERT IGNORE INTO cot_fichas
  (modelo_id,generacion,carroceria,dimensiones,fuente,motorizacion,mercado,maletera_l,maletera_detalle)
SELECT id,'Accent HC · 1.6 MPi (catálogo 2018)','Sedán',
  'Exterior: 4385 × 1729 × 1475 mm. Batalla: 2580 mm.',
  'https://www.hyundai.com/content/dam/hyundai/ww/en/images/footer/downloads/cars/e-brochure/accent-ebrochure-2018.pdf',
  'Gamma 1.6 MPi, gasolina, 1591 cm³','Catálogo internacional LHD',387,'Volumen de maletera según SAE.'
FROM cot_modelos WHERE marca='Hyundai' AND modelo='Accent';

INSERT IGNORE INTO cot_fichas
  (modelo_id,generacion,carroceria,dimensiones,fuente,motorizacion,mercado,maletera_detalle)
SELECT id,'Segunda generación · Yaris 1.3 (presentación 2006)','Hatchback',
  'Exterior: 3750 × 1695 × 1530 mm. Batalla: 2460 mm.',
  'https://media.toyota.co.uk/wp-content/uploads/sites/5/pdf/Gen2-Yaris-archive-press-pack.pdf',
  '2SZ-FE, gasolina, 1296 cm³','Reino Unido',
  'VDA con asientos traseros en uso: 272–363 L según posición. Con asientos plegados y carga hasta el borde superior de los delanteros: 737 L.'
FROM cot_modelos WHERE marca='Toyota' AND modelo='Yaris';
