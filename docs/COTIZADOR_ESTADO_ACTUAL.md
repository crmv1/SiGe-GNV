# Estado del Cotizador Inteligente GNV

## Aplicación web local comprobada

- **SIGE-GNV:** [http://127.0.0.1:5173/](http://127.0.0.1:5173/). Inicia sesión como `administrador` o `tecnico` con las credenciales de demostración de la [guía de usuarios](../USUARIOS_Y_ARRANQUE.md) y abre **Cotizador IA** en el menú.
- **API:** [http://127.0.0.1:3100/api/health](http://127.0.0.1:3100/api/health). Usa la base local `gnv_taller` en MariaDB, puerto `3317`, bajo `%LOCALAPPDATA%\SIGE-GNV-Web-Local`. Se preparó con el esquema del repositorio y las migraciones 014 a 028. La réplica antigua `gnvidem` no arrancó porque faltaba la tabla de permisos `mysql.db`. Las bases anteriores siguen separadas.
- **Prueba inicial en Chrome:** inicio de sesión y menú de ambos roles, carga de fotos JPEG, vista previa y TensorFlow.js real. Corolla y RAV4 quedaron seleccionados según la sugerencia. En la foto desconocida el modelo se abstuvo y la selección manual funcionó. El presupuesto de prueba **#1 de Bs 8.500,00** quedó en el historial tras recargar.
- **Catálogo comercial:** la ficha y alternativa `DEMO LOCAL` provenían de la prueba inicial. La API las excluye del catálogo y del guardado comercial, y el presupuesto previo figura como prueba histórica. La consulta de la base 3317 confirmó que todavía contiene cero alternativas comerciales verificadas por el taller. Los seis importes de componentes provienen de MariaDB y se muestran en el panel de presupuesto. Si el modelo tiene opciones, se comprueba el año y la variante, se precarga una combinación cuando queda determinada y se recalcula el total al cambiarla.
- **Validación posterior:** se desactivó la alternativa de demostración y se conservó su ficha y el único registro del historial local. En Chrome, administrador y técnico vieron los seis precios y el aviso de ausencia de alternativas para Corolla. En la copia E2E separada, ambos roles confirmaron la generación, vieron Bs 8.500,00 como total automático, cambiaron a Bs 11.300,00 y guardaron ese importe en el historial de la copia.
- **Panel de dataset:** [http://127.0.0.1:8768/](http://127.0.0.1:8768/). Es una herramienta independiente del cotizador. El ciclo de SigLIP y las tareas programadas quedaron activos.

Para volver a iniciar la instalación local en este equipo, desde la raíz del repositorio:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\iniciar-web-cotizador-local.ps1
```

La prueba repetible `scripts/cotizador/probar_web_real.py` recibe el `smoke.json` de `%TEMP%\opencode\piloto-run-v4` y entra por Chrome sin interceptar las solicitudes. En la instalación local comprueba precios y ausencia de alternativas comerciales para Corolla. El modo `--aislado` requiere la copia temporal 3327 con sus variantes E2E y prueba recalcular y guardar para ambos roles en esa copia. Requiere Playwright y Chrome. Los logs de la web, la API y MariaDB quedan en `%LOCALAPPDATA%\SIGE-GNV-Web-Local`.

## Añadir fotografías autorizadas al dataset

La foto que cargas para cotizar permanece en el navegador. Para ampliar el dataset, prepara las fotos originales en una carpeta propia y un CSV UTF-8 con las columnas `archivo,modelo,generacion,angulo,grupo,autor,fuente,licencia,licencia_url`. Usa rutas relativas dentro del lote, una clase escrita tal como aparece en el catálogo y el mismo identificador de grupo para varias fotos del mismo vehículo físico. Conserva la licencia o permiso individual y el autor. Para fotos propias con autorización documentada, usa `PERMISO-ESCRITO` y registra la referencia del permiso en `fuente` sin publicar datos personales.

```powershell
$dataset = Join-Path $env:LOCALAPPDATA 'SIGE-GNV-Dataset'
$python = Join-Path $env:LOCALAPPDATA 'Programs/Python/Python312/python.exe'
$lote = Join-Path $dataset 'entrada/lote-2026-11-18-01'
& $python scripts/cotizador/importar_local.py 'C:\ruta\fotos-originales' 'C:\ruta\manifiesto.csv' $lote
```

Usa un destino nuevo por lote. Revisa `rechazadas.csv` si faltan archivos, permisos o metadatos. El ciclo ordinario leerá `para_revision.csv`, deduplicará las candidatas y las incorporará a la cola local. Busca la clase en el panel para revisar identidad, generación, ángulo, grupo físico y licencia. Las candidatas cuentan para la meta solo después de la verificación.

## Corte del 18 de noviembre de 2026

### Continuación y comparación

- Corte durante SigLIP: de las 5.645 candidatas pendientes, 2.210 tenían ambas predicciones y 3.435 aún esperaban al menos una. En 640 ambos motores señalaron la clase propuesta. En 386 ambos señalaron la misma etiqueta alternativa. Solo CLIP señaló la clase en 102, solo SigLIP en 424 y en 658 ambos dieron etiquetas distintas entre sí y de la propuesta. Estas cifras describen concordancia top-1 entre motores. La exactitud requiere etiquetas revisadas.
- El panel ofrece colas de concordancia para Nissan Sentra (394 candidatas consolidadas), Hyundai Accent (494) y Toyota Yaris (252). Conserva filtros al abrir una foto o registrar una decisión. El nuevo orden de inferencia prioriza estas tres clases en las próximas corridas. El proceso en curso conserva su orden y checkpoint.
- El panel agotó el tiempo de espera en algunas solicitudes tras recargarlo. El servidor ahora atiende solicitudes en paralelo y limita a 10 segundos la espera de cada conexión. Se probó que el estado y la cola Yaris responden mientras otro cliente mantiene una conexión abierta.
- El lote de Hugging Face subió de 9 a 18 fotos (6 por clase), con procedencia individual de Wikimedia. Una búsqueda acotada en Flickr añadió 3 candidatas Accent. Ambos lotes están en la bandeja de entrada y se deduplicarán al consolidar. La consulta de WordPress Photo Directory filtrada a CC0, nombres, chasis y Bolivia finalizó sin candidatas. Geograph admite reutilización con atribución bajo CC BY-SA y dirige los proyectos de entrenamiento a sus dumps oficiales. Mapillary publica imágenes con CC BY-SA y remite al API y a sus términos para descargas amplias. Queda pendiente comprobar la cobertura y las condiciones concretas para entrenar con esas dos fuentes. [WordPress CC0](https://wordpress.org/photos/license/) · [Geograph y sus descargas](https://www.geograph.org.uk/help/api) · [Licencia Mapillary](https://help.mapillary.com/hc/en-us/articles/115001770409-CC-BY-SA-license-for-open-data)
- El trabajo experimental se evalúa al final del ciclo, incluida la curación completa. El proceso de preparación o de entrenamiento tiene su propio límite de tiempo. Un vencimiento permite reintentar más adelante y conserva el intento para diagnóstico. Las tres clases prioritarias siguen en 0 revisadas y 0 grupos registrados para el primer hito. El trabajo experimental sigue sin publicar pesos.
- La migración 028 registra referencias separadas para Sentra S 2020, Accent HC 1.6 MPi y Yaris 1.3 de segunda generación. Dos aplicaciones en MariaDB temporal conservaron una fila pendiente de validación por variante. La instancia existente sigue sin cambios. [Fuentes técnicas](COTIZADOR_FUENTES_TECNICAS.md#fichas-prioritarias-de-la-migración-028)

- 30 clases objetivo, con un mínimo de 1.000 originales verificados por modelo. El último reporte consolidado registra 326 verificadas (165 Corolla, 161 RAV4), 5.645 pendientes y 16 descartes históricos. Cada entrada de CLIP o SigLIP es una señal de revisión.
- Al iniciar la curación completa había 776 resultados de CLIP y 200 de SigLIP. Los 200 estaban incluidos en los 776 al cruzar SHA-256 y clase. El motor conserva resultados y vectores por lote y recupera vectores faltantes. Se reutilizan las representaciones de texto por corrida. En ocho fotos reales, los dos motores conservaron el orden top-3, con diferencias máximas de logits de 0,00000763 para CLIP y 0 para SigLIP. Consulta el log y las dos SQLite para medir avance posterior.
- CLIP completó las 5.987 filas únicas del consolidado, incluidas las 5.645 candidatas pendientes, con un vector por fila. El ciclo reanudado inició SigLIP y actualizará las hojas de revisión al terminar.
- Existe un lote reanudable en `entrada/hf-reanudable-01` con nueve candidatas nuevas del índice fijado de Hugging Face, tres por clase para Yaris, Accent y Sentra, con origen individual de Wikimedia. El ciclo las incorpora en el siguiente consolidado ordinario. El [proyecto Roboflow de clasificación](https://universe.roboflow.com/vehicleclassification-y9ylv/vehicles-ikkwd) declara CC BY 4.0 en el conjunto, pero queda pendiente comprobar procedencia y permisos individuales antes de descargarlo. [Open Images](https://storage.googleapis.com/openimages/web/download.html) es fuente potencial de escenas y negativos y exige revisar las licencias de las fotos individualmente.
- El [panel local](http://127.0.0.1:8768/) filtra por texto y predicción. Muestra concordancias de ambos motores, desacuerdos de cualquiera y resultados incompletos. `/` enfoca la búsqueda. Las flechas izquierda y derecha cambian de página. Desde una foto se puede abrir su grupo de vecinas por similitud CLIP. El grupo visual requiere confirmación humana antes de asignarle identidad física. Un descarte por lote requiere un motivo común.
- Sigue activo MobileNetV2 en `frontend/public/cotizador-modelo/`. La puerta experimental considera los hitos 100, 300, 500, 750 y 1.000, confirma cantidad y grupos después de deduplicar y registra los hitos evaluados. EfficientNetV2B0 y ResNet50 están disponibles para corridas de Python. Queda pendiente ejecutar sus experimentos con un corpus elegible.
- La compilación de React terminó correctamente y empaquetó los mismos pesos del piloto, verificados por SHA-256. Vite señaló un paquete JavaScript superior a 500 kB después de minificar.

## Evidencia reproducible

En [evidencia del piloto](cotizador-evidencia/piloto-mobilenetv2/) se conservan [métricas](cotizador-evidencia/piloto-mobilenetv2/metrics.json), [historial](cotizador-evidencia/piloto-mobilenetv2/history.json), [matriz de confusión](cotizador-evidencia/piloto-mobilenetv2/confusion.png) y [gráficas de entrenamiento](cotizador-evidencia/piloto-mobilenetv2/training.png) del artefacto entrenado por OpenCode. Sobre 73 fotos de prueba, MobileNetV2 obtuvo 48 aciertos forzados (65,75 %), precisión macro de 66,37 %, recall macro de 64,66 % y F1 macro de 64,10 %. Emitió 24 sugerencias (32,88 %), acertó en 23 (95,83 % entre las emitidas) y aceptó por error 1 de 22 desconocidos.

El conjunto piloto carece de una prueba independiente de campo en Bolivia. `evaluar_bolivia.py` aplica los umbrales congelados a un manifiesto revisado, exige evidencia de procedencia boliviana y comprueba solapamientos conocidos por grupo, fuente y similitud perceptual. El CSV de campo incluye `modelo,revisada,licencia,archivo,fuente,autor,grupo,pais,municipio,evidencia`. Mantén el mismo identificador anónimo por vehículo, y aparta unidades, archivos y sesiones de las usadas para entrenar y elegir umbrales. Incluye todas las clases activas y desconocidos. Conserva la autorización fuera del directorio web. Queda pendiente reunir ese lote.

## MariaDB y catálogo

El servicio MariaDB 13 instalado ocupa 3306 y carece de `gnv_taller`. Allí las dos cuentas de `.env` y `.env.migraciones.local` devolvieron `ER_ACCESS_DENIED_ERROR`. Se comprobó XAMPP MariaDB 10.4 en el puerto alternativo 3308 en modo de solo lectura. Ahí existe `gnv_taller`, pero faltan las cuentas `gnv_app` y `gnv_admin` y las tablas `cot_*`. Se cerró XAMPP después de comprobarlo. El puerto 3307 se levantó desde `cotizador-db`. Su cliente nativo rechazó la cuenta de pruebas documentada y el intento administrativo sin contraseña. Mantén las instancias y credenciales identificadas antes de migrar una base existente.

El nombre del servicio activo es `MariaDB`. Su archivo de configuración está en `C:\Program Files\MariaDB 13.0\data\my.ini`. XAMPP conserva el mismo puerto 3306 en `C:\xampp\mysql\bin\my.ini` y usa su propio directorio de datos. Se confirmó que 3308 estaba libre después del diagnóstico. Los servicios, las cuentas y los archivos de configuración se conservaron.

Se aplicaron las migraciones 016–025 en una MariaDB temporal de prueba en 33325 y se repitió la 025. Quedó una sola ficha Succeed, con volumen nulo y pendiente de validación. La API conectada a esa instancia devolvió 401 sin sesión, 403 para cliente y 200 para técnico y administrador al consultar el catálogo. El técnico recibió 403 al intentar editar un precio. Se verificaron los equipos de Bs 4.300 y 6.100, los cilindros de Bs 4.200, 5.200, 6.200 y 7.200 y el año guía 2017. La aplicación al entorno existente requiere una cuenta autorizada para la instancia que contiene el catálogo. Continúan vigentes las alternativas verificadas y las excepciones comerciales existentes. La compatibilidad definitiva requiere validación profesional.

El [índice de fuentes técnicas](COTIZADOR_FUENTES_TECNICAS.md) cubre los 30 nombres obligatorios. La 025 registra Succeed, la 026 añade Wingroad Y12 15S y Familia S-wagon R FWD y la 027 añade Hiace Wagon y Probox Van. En la instancia temporal se verificó que Wingroad queda con volumen nulo y Familia con 366 L VDA de capacidad máxima. La ficha Probox distingue los 1.310 mm referenciales de largo de carga para dos ocupantes de las dimensiones exteriores. Queda pendiente completar las fichas por generación y contrastarlas con el parque boliviano.

## Operación y reanudación

Desde la raíz, en PowerShell:

```powershell
$dataset = Join-Path $env:LOCALAPPDATA 'SIGE-GNV-Dataset'
$python = Join-Path $env:LOCALAPPDATA 'Programs/Python/Python312/python.exe'
Get-Content "$dataset/estado-ciclo.json"
Get-Content "$dataset/clip_preliminar.ultima.log" -Tail 10
Get-ScheduledTask -TaskName 'SIGE-GNV*' | Select-Object TaskName,State
& $python scripts/cotizador/comparar_predicciones.py $dataset --salida "$dataset/comparacion-predicciones.json"
```

Si la curación completa se interrumpe, comprueba primero el proceso indicado en `estado-ciclo.json`. El bloqueo compartido impide ejecutar dos ciclos. Las SQLite conservan los lotes confirmados. En Windows, el ciclo reintenta publicar su estado si otro proceso tiene abierto el archivo. Este modo recorre el consolidado existente y deja la recolección para el turno programado:

```powershell
& $python scripts/cotizador/ciclo.py $dataset --solo-curacion --segundos 5400 --esperar-bloqueo 5400
```

Para continuar el lote de Hugging Face, conserva la revisión fijada del índice y el destino:

```powershell
$metadata = Join-Path $env:LOCALAPPDATA 'Temp/opencode/hf-car-metadata.csv'
& $python scripts/cotizador/importar_hf.py $metadata "$dataset/entrada/hf-reanudable-01" --reanudar --labels "Toyota Yaris" "Hyundai Accent" "Nissan Sentra" --maximo 3 --conocidos "$dataset/consolidado.csv"
```

Para la prueba de campo, sustituye las dos rutas de campo con archivos autorizados:

```powershell
$piloto = Join-Path $env:LOCALAPPDATA 'Temp/opencode'
& $python scripts/cotizador/evaluar_bolivia.py "$piloto/piloto-run-v4" "$piloto/piloto-dataset-v1/splits.json" "campo-bolivia.csv" "resultado-bolivia.json"
node --test scripts/cotizador/calculo.test.js scripts/cotizador/recomendacion.test.js
```
