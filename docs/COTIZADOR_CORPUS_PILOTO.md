# Corpus piloto y reconocimiento parcial

Fuente efectiva: [555 US Car Models, snapshot fijado](https://huggingface.co/datasets/timdwms/us-car-models-1948-2026/tree/063a8a846d4797c520447bf29ddf51318a4e792c). Metadatos CC BY 4.0; cada fotografía conserva su autor, licencia original y enlace de Commons. El importador admite solo licencias reconocidas, con atribución, origen y control de calidad del proveedor. Las etiquetas vienen de categorías automáticas y requieren curación; el conjunto está sesgado a variantes del mercado estadounidense.

| Clase | Candidatos del índice filtrado | Fotos únicas en el corte de auditoría |
| --- | ---: | ---: |
| Toyota Corolla | 920 | 218 |
| Toyota RAV4 | 803 | 220 |
| Toyota Yaris | 195 | 19 |
| Nissan Sentra | 185 | 179 |
| Hyundai Accent | 252 | 9 |
| Nissan AD (fuente anterior) | — | 1 |

El corte deduplicado contiene 646 fotos candidatas. Los otros 24 modelos no tenían descargas en el corte. Se apartaron 79 duplicados mediante procedencia, SHA-256 y hash perceptual. El manifiesto consolidado está en `C:\Users\camii\AppData\Local\Temp\opencode\cotizador-auditoria-corte2.csv`. Contiene rutas locales y no se versiona. Una fila candidata no equivale a una etiqueta aprobada ni a un vehículo físico independiente.

Otras fuentes examinadas:

- [Roboflow UFSC Corolla 2016](https://universe.roboflow.com/ufsc-8gifn/corolla-2016): proyecto CC BY 4.0, 261 imágenes repartidas en cinco clases. Fuente potencial para ejemplos difíciles; no se incorporó el paquete en este corte.
- [Open Images V7](https://storage.googleapis.com/openimages/web/factsfigures_v7.html#licenses): anotaciones CC BY 4.0 y fotos declaradas CC BY 2.0 con revisión individual recomendada por el proveedor. Potencial para escenas negativas, sin asumir correspondencia de marca y modelo.
- [VMMRdb académico/GitHub](https://github.com/faezetta/VMMRdb): organizado por marca, modelo y año. El MIT del repositorio no verifica derechos sobre las fotos de terceros del archivo externo; excluido. [Hugging Face Car Models 3778](https://huggingface.co/datasets/Unit293/car_models_3887): extraído de Autoevolution, sin autorización comercial comprobada de las imágenes. [Kaggle: búsqueda Stanford Cars](https://www.kaggle.com/datasets?search=stanford+cars) y [Stanford en Hugging Face](https://huggingface.co/datasets/tanganke/stanford_cars): los espejos no acreditan por sí solos derechos sobre las fotografías. CompCars sigue excluido por su licencia no comercial. No se verificó un paquete específico de mercado japonés que cubra las clases restantes con permisos adecuados.

## Preparar una primera versión

1. Revisar visualmente la clase, licencia y privacidad, y agrupar por vehículo físico y sesión antes de cambiar `revisada` a `si`. Para `__desconocido__`, incluir fotos autorizadas con modelos fuera del piloto y escenas sin vehículo. Procurar modelos parecidos y separar unidades, fuentes o sesiones entre conjuntos. No asignar una clase a partir del nombre de la carpeta sin revisar.
2. Ejecutar `dataset.py <manifiesto> <destino> --labels "Toyota Corolla" "Toyota RAV4" --incluir-desconocidos`. Se conservan los 30 modelos del catálogo. Añadir una clase solo cuando la curación y cobertura lo permitan.
3. Entrenar y exportar siguiendo [el procedimiento existente](COTIZADOR_IA.md#entrenar-y-publicar). La exportación exige una evaluación con ejemplos de la clase desconocida. Ajustar `--umbral` y `--margen` con validación y medir cobertura y falsos aceptados en el test. La abstención por clase desconocida, umbral y margen puede reducir errores, pero no garantiza detectar cualquier imagen ajena al entrenamiento.

La migración `018_cotizador_fichas_oficiales.sql` registra la ficha oficial de [Yaris híbrido de cuarta generación (Reino Unido), p. 3](https://media.toyota.co.uk/wp-content/uploads/sites/5/pdf/260810-Yaris-Tech-Specs.pdf), con **286 L** y dimensiones de carga; y [Suzuki APV de ocho plazas](https://www.globalsuzuki.com/automobile/lineup/apv/#interior), sin volumen publicado en esa página. Ninguna referencia se marcó como verificada por VC Gas ni generó compatibilidades.
