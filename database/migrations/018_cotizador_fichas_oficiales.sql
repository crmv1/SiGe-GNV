SET NAMES utf8mb4;

INSERT IGNORE INTO cot_fichas (modelo_id,generacion,carroceria,maletera_l,dimensiones,fuente)
SELECT id,'4.ª generación híbrida · ficha Reino Unido','Hatchback',286,
  'Exterior: 3940 × 1745 × 1500 mm; batalla 2560 mm. Carga: largo 630 mm con asientos levantados, ancho máximo 1004 mm, alto 837 mm.',
  'Toyota GB, Technical Specs, p. 3: https://media.toyota.co.uk/wp-content/uploads/sites/5/pdf/260810-Yaris-Tech-Specs.pdf'
FROM cot_modelos WHERE marca='Toyota' AND modelo='Yaris';

INSERT IGNORE INTO cot_fichas (modelo_id,generacion,carroceria,fuente)
SELECT id,'APV pasajeros · ficha global Suzuki','Van de ocho plazas',
  'https://www.globalsuzuki.com/automobile/lineup/apv/#interior'
FROM cot_modelos WHERE marca='Suzuki' AND modelo='APV';
