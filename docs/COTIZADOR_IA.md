# Cotizador Inteligente GNV

## Activación y prueba

1. Aplicar `database/migrations/016_cotizador_ia.sql` en una copia de la base que ya tenga `inventario_productos`. Reiniciar el backend y ejecutar `npm ci` y `npm run build` en `frontend`.
2. Entrar como administrador a **Cotizador IA → Catálogo y precios**. Dar de alta y verificar una ficha con fuente; vincular cada capacidad a un producto existente si corresponde. La cotización no reserva ni modifica stock.
3. Como técnico o administrador, registrar una pareja kit–cilindro verificada para la ficha, con evidencia. Si cambia la ficha, retirar primero sus alternativas activas. Sin alternativa verificada se puede identificar el vehículo y consultar la información, pero no guardar un presupuesto.
4. Probar selección manual, año, confirmación de pareja y guardado. Kit de tercera + 40 L en modalidad separada: **8.500 Bs**. Cambiar el precio y comprobar que el presupuesto histórico mantiene su desglose original. Probar también la modalidad incluida y el rechazo con una sesión cliente (403) o sin sesión (401).
5. Para las pruebas unitarias: `node --test scripts/cotizador/calculo.test.js` desde la raíz.

La prueba `node scripts/cotizador/integracion.js` usa una base aislada de nombre de directorio `cotizador-db`, puerto 3307. Con las variables `DB_*` apuntando a esa instancia, verifica el catálogo, los permisos, el rechazo de un año o importe incorrecto, el guardado e historial y el retiro de la alternativa. Elimina sus registros temporales. Para uso normal, arrancar la API habitual y entrar con una cuenta existente de administrador o técnico. No se requiere una cuenta de demostración.

El año guía no aprueba ni descarta equipos. Las fichas y alternativas se refieren a variantes concretas; no se debe extrapolar entre mercados, carrocerías o configuraciones. La foto no sale del navegador ni se guarda en el historial.

## Fuentes y curación

- [Wikimedia Commons: guía de reutilización](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia): fuente de candidatos. Revisar la página y licencia de **cada** archivo, conservar atribución y documentar modificaciones. La presencia en un buscador o la opción de descargar no equivale a permiso de reutilización.
- [Toyota: linaje oficial de vehículos](https://www.toyota.co.jp/jpn/company/history/75years/vehicle_lineage/): punto de partida para contrastar generaciones y mercado japonés.
- [Nissan Heritage Collection](https://www.nissan-global.com/EN/HERITAGE_COLLECTION/): fichas por variante. Se incorporó como referencia pendiente de revisión local el [Sunny FB13 de 1993](https://www.nissan-global.com/EN/HERITAGE_COLLECTION/355_sunny_1500_super_saloon.html), con dimensiones exteriores y batalla; la fuente no indica litros de maletera ni un rango completo para la variante.
- Preferir fotos locales de VC Gas con permiso explícito de uso para entrenamiento, junto con fotos de licencia compatible. Revisar privacidad antes de incorporar fotos (placas, rostros, metadatos). Para fichas, buscar manuales o folletos oficiales por mercado, versión, año y carrocería. Registrar documento y página; dejar los datos faltantes en blanco. No usar un volumen de maletera como criterio de aptitud.

Completar `scripts/cotizador/manifiesto.csv` con una fila por foto autorizada. `modelo` debe coincidir exactamente con la etiqueta (p. ej. `Toyota Corolla`). `grupo` es un identificador no personal y común a todas las fotos del mismo vehículo físico, sesión o anuncio; no usar un identificador nuevo por ángulo. `fuente` referencia la página del archivo o evidencia del permiso escrito; `autor`, `licencia`, `generacion`, `angulo` y `revisada=si` requieren revisión humana. Proporcionar `archivo` relativo al manifiesto o `descarga` HTTPS directa.

Objetivo: 200–300 fotos **limpias** por modelo (6.000–9.000 en total), con diversidad de años, colores, carrocerías, iluminación y ángulos. Añadir fotos del parque boliviano para evitar una evaluación dominada por mercados extranjeros. Revisar visualmente pares difíciles y denominaciones de mercados distintos. El hash exacto y perceptual, incluido espejo, no sustituye agrupar los vehículos físicos; tampoco garantiza encontrar recortes intensos. Los porcentajes 70/15/15 se aproximan sin romper grupos y se reportan al preparar el dataset.

## Entrenar y publicar

Usar Python 3.11 en Linux/WSL para las dependencias del conversor y ejecutar desde la raíz. `artefactos/` debe quedar fuera del despliegue y del control de versiones; cada destino de ejecución debe ser nuevo.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r scripts/cotizador/requirements.txt
python scripts/cotizador/dataset.py scripts/cotizador/manifiesto.csv artefactos/dataset
python scripts/cotizador/train.py train artefactos/dataset artefactos/entrenamiento
python scripts/cotizador/train.py export artefactos/entrenamiento frontend/public/cotizador-modelo
```

Durante el entrenamiento puede descargarse MobileNetV2 ImageNet. Después del build, la app sirve `metadata.json`, `model.json` y los pesos desde su propio origen; no usa APIs de IA remotas. Verificar la red del navegador al identificar, además de las predicciones en fotos bolivianas, fotos fuera del catálogo y fotos sin vehículo. Los scores softmax no son probabilidades calibradas de acierto. Ajustar el umbral con validación (incluidas entradas fuera de catálogo), nunca optimizarlo con test. El umbral inicial de 0,65 es provisional.

Cada corrida evaluada genera `metrics.json` (accuracy, precision, recall, F1, soporte por clase, matriz, cobertura y latencias p50/p95), `history.json`, `confusion.png` y `training.png`. La latencia académica mide inferencia por imagen en el equipo de evaluación; la pantalla mide preprocesamiento e inferencia en el navegador tras cargar los pesos. No se han generado métricas ni distribuido pesos con esta entrega.
