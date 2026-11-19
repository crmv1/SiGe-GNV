# Cotizador IA: reglas y primera recolección

La sugerencia visual precarga el modelo del catálogo si supera el umbral. Con el año confirmado, se buscan fichas verificadas y alternativas activas. Si varias fichas coinciden, se pide confirmar la variante. El año guía prioriza un equipo entre las opciones verificadas, admite excepciones y no desempata el año de transición. Solo se precarga un presupuesto si una pareja resulta inequívoca. Se pueden elegir otras opciones verificadas y el servidor vuelve a comprobar pareja, año y precio antes de guardar.

## Recolección ejecutada

Fuente: Wikimedia Commons, búsqueda por modelo con metadatos de licencia por archivo. Una primera corrida con tope 30 por modelo devolvió **307 candidatos con metadatos** y descargó **2 fotos únicas** antes de que las limitaciones HTTP 429 impidieran ampliar el conjunto. Ambas etiquetas se contrastaron visualmente. No hay suficientes grupos independientes para entrenar. Los enlaces incluyen la atribución y licencia originales:

- **Nissan AD: 1**, [Nissan AD Van Y10, vista trasera lateral](https://commons.wikimedia.org/wiki/File:Nissan_AD_Van_Y10_002.JPG), 天然ガス, CC BY-SA 3.0.
- **Toyota Corolla: 1**, [Corolla Ascent ZRE172R, vista trasera lateral](https://commons.wikimedia.org/wiki/File:2018_Toyota_Corolla_(ZRE172R)_Ascent_sedan_(2018-11-02)_02.jpg), EurovisionNim, CC BY-SA 4.0. Revisar privacidad de placa antes de usar.
- **0 cada uno:** Hyundai Accent y H100; Mazda Familia; Mitsubishi Delica; Nissan Bluebird, Caravan, March, Sentra, Sunny, Tiida y Wingroad; Suzuki APV, Alto, Carry y Swift; Toyota Caldina, Hiace, Ipsum, Noah, Probox, RAV4, Starlet, Succeed, Tercel, Vitz, Voxy, Wish y Yaris.

Los artefactos de esa corrida se conservan en `C:\Users\camii\AppData\Local\Temp\opencode\commons-cotizador-01`: `fotos/`, `candidatos.csv`, `para_revision.csv` y `recoleccion.json`. Son muestras de curación, no un dataset entrenable ni evidencia de frecuencia en el parque boliviano. El recolector actualizado `python scripts/cotizador/commons.py <directorio-nuevo> --maximo 30` solicita miniaturas, serializa peticiones y deja de solicitar a la fuente que devuelve 429. Antes de otra corrida, respetar la ventana de espera de la fuente. El título del archivo no sustituye la inspección visual ni la agrupación por vehículo.

- [CompCars](https://mmlab.ie.cuhk.edu.hk/datasets/comp_cars/index.html): abarca muchos modelos, pero los autores limitan el uso a investigación no comercial. Excluido del cotizador.
- [Stanford Cars / Cars196](https://www.tensorflow.org/datasets/catalog/cars196): 196 clases por marca, modelo y año. La ficha consultada no acredita permiso de reutilización comercial de las fotografías. Excluido del cotizador.

## Entrenamiento local o en Colab

Se descargaron los [pesos base ImageNet oficiales](https://storage.googleapis.com/tensorflow/keras-applications/mobilenet_v2/mobilenet_v2_weights_tf_dim_ordering_tf_kernels_1.0_224_no_top.h5), SHA-256 `f8aff69536bd77a692c594f559c798c19bf7f3f36668fc9fa00b21c6aab4797c`. Son pesos base, no un modelo de 30 vehículos. El comando local de entrenamiento admite `--weights <archivo.h5>`.

Para [Colab](https://colab.research.google.com/) gratuito, subir una copia del repositorio y del manifiesto revisado con sus fotos, descomprimirlos en `/content`, abrir un notebook con GPU si está disponible y usar un entorno Python 3.11 compatible con el archivo de requisitos. Desde la carpeta del proyecto, ejecutar las tres etapas de [preparación, entrenamiento y exportación](COTIZADOR_IA.md#entrenar-y-publicar). Conservar los resultados de evaluación y descargar únicamente `cotizador-modelo/` para integrarlo bajo `frontend/public/`. No se ejecutó Colab ni se publicó ningún modelo.

## Catálogo técnico

La migración `017_cotizador_fuentes.sql` añade referencias para el [Nissan Sunny FB12 de 1988](https://www.nissan-global.com/EN/HERITAGE_COLLECTION/358_sunny_1500_ex_saloon.html) y la [Suzuki Carry 1.5, especificación Vietnam](https://www.globalsuzuki.com/automobile/lineup/carry/#cargo), a revisar por el taller. En la Carry la fuente describe la plataforma de carga, no un volumen de maletera ni una variante boliviana equivalente. El resto de variantes y capacidades quedan pendientes donde no haya fuente exacta.

El [catálogo CNG de Faber](https://faber-italy.com/product/cylinders-for-compressed-natural-gas-cng/) es una fuente del fabricante, pero el volumen por sí solo no identifica un producto de inventario. No se asignaron fichas a los cilindros comerciales de 40, 60, 80 y 100 L sin una correspondencia por fabricante y referencia del taller.
