SET NAMES utf8mb4;
UPDATE cot_fichas SET codigo_chasis=COALESCE(codigo_chasis,'HB11'), motorizacion=COALESCE(motorizacion,'E15, 1487 cm³')
WHERE fuente='https://www.nissan-global.com/EN/HERITAGE_COLLECTION/sunny_1500_sgl_extra.html' AND verificada=0;
UPDATE cot_fichas SET codigo_chasis=COALESCE(codigo_chasis,'FB13'), motorizacion=COALESCE(motorizacion,'GA15DS, 1497 cm³')
WHERE fuente='https://www.nissan-global.com/EN/HERITAGE_COLLECTION/355_sunny_1500_super_saloon.html' AND verificada=0;
UPDATE cot_fichas SET maletera_detalle=COALESCE(maletera_detalle,'Largo 630 mm con asientos levantados; ancho máximo 1004 mm; alto 837 mm, p. 3.'), mercado=COALESCE(mercado,'Reino Unido')
WHERE fuente LIKE '%260810-Yaris-Tech-Specs.pdf' AND verificada=0;
