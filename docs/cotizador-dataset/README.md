# Avance de la meta de 30.000 fotos

[Reporte de las 30 clases (CSV)](progreso.csv) · [Datos del corte (JSON)](progreso.json)

Los archivos CSV y JSON se regeneran al completar un ciclo y son la fuente de los totales vigentes. El porcentaje usa solo originales verificados / 1.000; no cuenta escenas negativas, aumentos ni candidatos. Las cifras corresponden al último corte auditado, no a una lectura en tiempo real del proceso de descarga.

## Recolección y revisión

En Windows, la tarea programada `SIGE-GNV-Dataset` ejecuta `scripts/cotizador/ciclo.py` al iniciar sesión y cada 30 minutos, con la cuenta habitual y sin elevación. Usa `%LOCALAPPDATA%\SIGE-GNV-Dataset` para los archivos, checkpoints, instantáneas y logs. El proceso no depende del IDE. Si se reinicia el equipo, retoma después de iniciar sesión. No se prometen descargas durante una suspensión o una sesión cerrada. `ciclo.log` rota; `*.ultima.log` conserva la salida del último paso. Un bloqueo impide que dos ciclos escriban sobre el mismo directorio. Se pausa la descarga si quedan menos de 15 GiB libres y los pasos tienen límites de tiempo.

El ciclo recoge de Flickr vía Openverse e incorpora lotes autorizados de otras fuentes cuando existe un `entrada/<lote>/para_revision.csv` con sus fotos. Después deduplica, reconstruye el reporte y aplica revisión preliminar con CLIP local (LAION ViT-B/32 en `safetensors`, revisión fijada). CLIP guarda candidatos top-3 en `clip.sqlite`; solo señala desacuerdos, no acredita licencia ni verdadera identidad. Fallos del clasificador no invalidan el reporte consolidado. El piloto sigue siendo el modelo publicado; ninguna decisión preliminar cambia las alternativas comerciales.

Se inspeccionaron visualmente 50 candidatos de Ipsum, Probox, Succeed y Voxy. Las 16 exclusiones confirmadas corresponden a dos vehículos mal etiquetados, dos miniaturas y doce detalles mecánicos. Los demás registros de la muestra aún requieren confirmar licencia, etiqueta y grupo de vehículo antes del entrenamiento.

El barrido utiliza Flickr vía Openverse y combina nombres en tres idiomas, términos geográficos, chasis y años. Recorre las páginas disponibles de cada consulta sin fijar una cuota de fotos por clase. Conserva los bytes recibidos del enlace autorizado sin recomprimirlos, junto con la URL de procedencia, el autor y la licencia declarada. La resolución del archivo disponible depende de la fuente; no debe confundirse con el original de cámara.

```powershell
$p = "$env:LOCALAPPDATA\Temp\opencode"
python scripts/cotizador/openverse_flickr.py "$p\barrido-30-v1" --por-consulta 20 --todos --barrido --reanudar --continuo
```

No ejecutar dos procesos contra el mismo destino. `estado.json` conserva las consultas y páginas procesadas; `--continuo` espera el `Retry-After` indicado en un HTTP 429. Los archivos y manifiestos de procedencia de esta corrida se guardan en `barrido-30-v1`; el corte consolidado usado aquí está en `barrido-audit-v1.csv`, en ese mismo directorio temporal padre.

`revision_local.py` valida la lectura de las imágenes y señala indicios de baja calidad, etiquetas en conflicto y procedencia incompleta. Genera CSV por clase ordenados para revisar primero las alertas. En el corte total señaló 1.430 registros. Las alertas son indicios, no decisiones automáticas. Antes de aprobar una foto, contrastar la página original, corregir la etiqueta y anotar generación, ángulo y grupo de vehículo físico. Para una inspección visual por lotes se pueden generar hojas numeradas con `hojas_revision.py`.

Para regenerar el reporte permanente, ejecutar `progreso.py` con destino `docs/cotizador-dataset`, el manifiesto consolidado, `--particiones` con las particiones revisadas, `--fichas` con la exportación local de fichas y `--decisiones docs/cotizador-dataset/decisiones-visuales.csv`. Las decisiones se vinculan por modelo y URL, para no depender del orden de las hojas de contacto. Ver las fuentes y sus límites en [la recolección prioritaria](../COTIZADOR_RECOLECCION_PRIORITARIA.md) y [el corpus piloto](../COTIZADOR_CORPUS_PILOTO.md).

## Catálogo técnico

`024_cotizador_sunny_b110.sql` añade el [Sunny B110 de cuatro puertas de 1970](https://www.nissan-global.com/EN/HERITAGE_COLLECTION/datsun_sunny_1200_4_deluxe.html), con motor A12, dimensiones exteriores y batalla. Maletera y verificación comercial pendientes.

## Supervisión

La hoja de contacto muestra hasta 24 candidatas por página. El filtro busca en el título, el autor, la licencia y la fuente dentro del modelo seleccionado. Abre una miniatura para inspeccionar la foto y consultar su procedencia. Para descartar varias, selecciona las fotos inspeccionadas que compartan el mismo motivo y anótalo en el formulario. El descarte por lote conserva cualquier decisión previa del panel. Las aprobaciones se registran desde el detalle de cada foto.

**Panel local:** <http://127.0.0.1:8768/>. La tarea `SIGE-GNV-Dataset-Panel` lo levanta al iniciar sesión. Muestra la etapa actual cada cinco segundos y abre las clases con menor número de candidatos primero. Cada aprobación exige generación, ángulo, grupo físico y evidencia de revisión de licencia; las decisiones se registran en `decisiones.sqlite`. Los vecinos visuales se calculan a partir de embeddings CLIP disponibles y no asignan grupos automáticamente.

El ciclo alterna Flickr y Wikimedia como proveedores del índice Openverse, con checkpoints separados. Si el servicio compartido limita ambas búsquedas, los lotes locales autorizados, la deduplicación y la curación siguen disponibles. Para la comprobación preliminar se compara el identificador de licencia con la URL canónica; la página del autor sigue siendo la fuente para decidir casos dudosos.

`experimento_local.py` solo inicia una corrida si hay una clase nueva con al menos 100 fotos revisadas y 12 grupos registrados, además de negativos y otras clases. `dataset.py` vuelve a exigir cantidad y separación tras deduplicar. Cada corpus tiene un identificador para evitar repetir corridas exitosas. Un candidato evaluado queda fuera de la ruta de pesos publicada hasta que se valide su comparación con el modelo activo.

`SIGE-GNV-Dataset-Supervisor` comprueba la tarea cada cinco minutos. `estado-ciclo.json` guarda la etapa, PID, tareas completadas y última señal de actividad. Si se pierde la señal, el supervisor solo detiene un hijo cuya identidad y relación con el ciclo puede comprobar. Los límites temporales del ciclo permiten que los procesos recuperables vuelvan a arrancar desde sus checkpoints. La auditoría reutiliza huellas guardadas en SQLite y usa un índice por bandas para buscar coincidencias perceptuales.

CLIP y SigLIP tienen bases SQLite separadas bajo el directorio persistente. La cola de revisión conserva ambos top-3. Estos resultados no forman parte de los totales verificados. Para SigLIP en el entorno local se comprobó `transformers==4.57.6` con `sentencepiece==0.2.0`.

La migración `023_cotizador_sunny_b10.sql` añade la referencia del [Datsun Sunny B10 de 1966](https://www.nissan-global.com/EN/HERITAGE_COLLECTION/datsun_sunny_deluxe.html). Nissan documenta dimensiones exteriores, batalla y motor A10; la fuente no publica capacidad de maletera. El registro queda pendiente de verificación del taller y no crea alternativas comerciales.
