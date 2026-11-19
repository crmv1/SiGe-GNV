# Piloto visual ejecutado

Los artefactos entrenados están en `frontend/public/cotizador-modelo/`. Vite los copia al build. Para probar con un usuario habitual, usar la web configurada con la URL de la API habitual (`VITE_API_URL`), entrar en Cotizador IA y cargar una foto frontal, lateral o trasera donde destaque un solo vehículo. El modelo no infiere el año ni la aptitud técnica.

## Entrenamiento y evaluación

Se inspeccionaron las hojas de revisión de las 646 fotos del corte anterior y 29 escenas negativas de Wikimedia Commons. Tras filtrar fotos ambiguas, repetidas o con encuadre inapropiado, quedaron 165 Corolla, 161 RAV4 y 168 desconocidos (otros vehículos y escenas). Se separaron las particiones por autor como medida conservadora, junto con detección de duplicados; esto no garantiza que no exista una misma unidad fotografiada por personas diferentes. Se usaron 340 imágenes para entrenamiento, 81 para validación y 73 para prueba. El entrenamiento en CPU de MobileNetV2 ImageNet con cabeza ajustada localmente restauró la mejor época según pérdida de validación. Umbral de aceptación 0,78 y margen 0,55, seleccionados exclusivamente con validación.

En las 73 imágenes de prueba: exactitud sin abstención 48/73 (65,8%); aceptó 24/73 (32,9%), de las que acertó 23/24 (95,8%). Aceptó erróneamente 1 de 22 ejemplos desconocidos (4,5%). Las fotos no representan por sí solas el parque boliviano. No usar estas métricas como estimación de campo.

Artefactos reproducibles en `C:\Users\camii\AppData\Local\Temp\opencode`: `piloto-revisado.csv`, `piloto-dataset-v1/splits.json`, `piloto-run-v4/{metrics.json,history.json,confusion.png,training.png,vehiculos.h5,smoke.json}`. El manifiesto conserva la fuente y atribución. Se usó TensorFlow CPU 2.16.2 y `tf-keras` 2.16.0 en Windows.

## Prueba del navegador

`scripts/cotizador/probar_web.py <ruta-a-smoke.json>` con Chrome y Vite en el puerto 5186 carga tres JPEG reales del test. Verificó Corolla, RAV4 y abstención en un candidato desconocido con los pesos exportados. La sesión y el catálogo de la prueba son fixtures; la inferencia y el cálculo en React son reales. La pareja de prueba del Corolla produjo 8.500 Bs al indicar 2012. La app en servicio usa las alternativas verificadas de MySQL y la sesión habitual. TensorFlow.js ejecuta en CPU del navegador para mantener resultados coherentes con la prueba de referencia.

Queda por ampliar y validar el corpus boliviano (prioridad: Sunny, Hiace, Probox, Noah, AD, Carry y Caravan), completar las fichas por mercado y variante, y registrar alternativas verificadas por el taller. Las fichas de fabricante ya incorporadas conservan su fuente y estado de revisión.
