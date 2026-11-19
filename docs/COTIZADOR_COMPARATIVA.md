# Comparativa de modelos del Cotizador IA

## Piloto Corolla / RAV4

Tres corridas con pesos ImageNet, base congelada, la misma estrategia de cabeza y augmentación y las mismas 340/81/73 fotos por partición. Cada regla de abstención se eligió en validación y se midió en el mismo test. Latencia de Python en CPU; las dos corridas nuevas se ejecutaron en paralelo y la latencia no es un benchmark aislado ni del navegador.

| Arquitectura | Exactitud sin abstención | Cobertura | Aciertos entre sugerencias | Desconocidos aceptados | p50 local |
|---|---:|---:|---:|---:|---:|
| MobileNetV2 publicado | 48/73 | 24/73 | 23/24 | 1/22 | 58,7 ms |
| MobileNetV3 Small | 45/73 | 18/73 | 16/18 | 0/22 | 58,6 ms |
| EfficientNetB0 | 51/73 | 18/73 | 17/18 | 0/22 | 99,0 ms |

EfficientNetB0 sube la exactitud forzada al 69,9%, pero la proporción de fotos con una sugerencia correcta baja de 23/73 a 17/73 en el punto de operación evaluado. El piloto publicado se conserva en `frontend/public/cotizador-modelo`. Los artefactos de Python están en `%LOCALAPPDATA%\Temp\opencode\piloto-run-v4`, `comparacion-v3` y `comparacion-eff`. Las arquitecturas nuevas requieren validar operadores y paridad antes de habilitar su exportación web.

## Ampliación experimental: Nissan Sentra

Se entrenaron dos candidatos con 124 fotos curadas de Sentra, junto a Corolla, RAV4 y desconocidos. La nueva partición tiene 337 imágenes de entrenamiento, 69 de validación y 88 de prueba. No se usa para hacer una comparación directa con el test anterior de 73 fotos, pues cambian las clases y particiones.

| Arquitectura | Aciertos forzados en general | Aciertos forzados Sentra | Cobertura | Aciertos entre sugerencias |
|---|---:|---:|---:|---:|
| MobileNetV2 | 54/88 | 2/24 | 22/88 | 19/22 |
| EfficientNetB0 | 56/88 | 8/24 | 25/88 | 22/25 |

El test de esta ampliación contiene solo cinco desconocidos. Los candidatos quedan en `sentra-v2` y `sentra-eff` bajo el mismo directorio temporal y el candidato TF.js de V2 en `cotizador-modelo-sentra-v2`. No se promociona Sentra con esta sensibilidad. Sentra tampoco se usa como etiqueta sustituta de Sunny: sus denominaciones y variantes requieren revisión por mercado.

## Transporte público y fichas

Se añadió selección de clases al recolector y se ejecutó una búsqueda dirigida para Sunny, Hiace, Probox, Noah, AD, Carry y Caravan. La API respondió HTTP 429 en la primera clase; no produjo descargas nuevas. Queda por incorporar fotos con licencia individual y ejemplos de campo independientes de esos modelos y generaciones. El catálogo japonés oficial de [Nissan Caravan](https://www.nissan.co.jp/CARAVAN/) distingue van, wagon y microbús; `019_cotizador_caravan_japon.sql` incorpora la referencia del microbús de 14 plazas, dejando pendientes el volumen y la correspondencia con vehículos bolivianos. La fuente no implica permiso de reutilización para entrenamiento ni validación de alternativas por VC Gas.
