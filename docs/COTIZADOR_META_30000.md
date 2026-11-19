# Meta de 30.000 originales: corte local

Meta: 1.000 fotos reales verificadas por cada uno de los 30 modelos; las escenas desconocidas y aumentos no suman al objetivo. El corte local está en `%LOCALAPPDATA%\Temp\opencode\reporte-meta1000-final\progreso.csv` y `progreso.json`. Contiene las 30 clases, fichas registradas y estado de entrenamiento. «Encontradas» se limita a registros de los manifiestos incluidos; no estima el total disponible en internet. «Descartadas» cuenta estados explícitos de revisión, no las coincidencias eliminadas en una auditoría anterior.

El lote `meta1000-lote01` descargó 328 registros, y la auditoría combinada produjo `meta1000-auditoria.csv`. El reporte registra 326 originales conocidos ya curados y 957 candidatos pendientes. Los originales verificados del piloto son 165 Corolla y 161 RAV4. El nuevo material no se considera validado ni representativo de Cochabamba por el mero resultado de búsqueda.

El recolector `openverse_flickr.py` conserva el manifiesto y `estado.json`. Para recuperar una corrida interrumpida, repetir con el mismo directorio, página y tamaño y agregar `--reanudar`. Respeta `Retry-After` o aplica una espera si falta esa cabecera. Los conectores anteriores y el importador local se mantienen; la documentación de licencias y exclusiones está en `COTIZADOR_CORPUS_PILOTO.md` y `COTIZADOR_RECOLECCION_PRIORITARIA.md`.

## Experimento de tamaño de muestra

El hito de 100 se aproxima usando 70 originales por clase conocida durante entrenamiento y dejando fijas las 81 fotografías de validación y las 73 de prueba del piloto. Conserva los negativos de entrenamiento. `--tope-originales` selecciona subconjuntos anidados de 70, 210, 350, 525 o 700 imágenes por clase en entrenamiento. No es una evaluación nueva de campo: para la defensa se necesita un test boliviano independiente no usado en decisiones previas.

| Entrenamiento conocido | Aciertos forzados | Cobertura | Sugerencias correctas/emitidas | Falsos aceptados desconocidos |
|---|---:|---:|---:|---:|
| 70 por clase | 46/73 | 23/73 | 20/23 | 1/22 |
| Piloto completo (111 Corolla y 108 RAV4) | 48/73 | 24/73 | 23/24 | 1/22 |

Las ejecuciones `piloto-hito100` y `piloto-checkpoint-meta1000` generan `metrics.json`, `por_modelo.csv`, historial, gráficas y `best-head.weights.h5` en el mismo directorio temporal. Los hitos mayores requieren más imágenes curadas. Se conserva la versión publicada.

Aplicar las migraciones `021` y `022` en orden. Incorporan código de chasis, motor, mercado y detalle de maletera sin convertir las dimensiones exteriores en dimensiones de carga. Los registros comerciales siguen sujetos a verificación por VC Gas.
