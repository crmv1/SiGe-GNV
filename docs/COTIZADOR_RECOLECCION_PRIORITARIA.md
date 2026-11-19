# Recolección prioritaria y recepción de fotos locales

La búsqueda ejecutada usó [Openverse](https://openverse.org/) como índice y [Flickr](https://www.flickr.com/creativecommons/) como fuente, con consultas por nombre, denominación japonesa, chasis y términos geográficos de Bolivia y Perú. El CSV conserva la página original, autor y licencia de cada archivo. Los códigos son pistas de búsqueda, no equivalencias automáticas (Probox/Succeed y Noah/Voxy deben distinguirse visualmente). No se identificaron fotos bolivianas verificadas en este lote. No se incorporaron fotos de catálogos comerciales sin permiso.

| Modelo | Candidatas deduplicadas |
|---|---:|
| Nissan Sunny | 60 |
| Toyota Hiace | 60 |
| Toyota Probox | 16 |
| Toyota Noah | 19 |
| Nissan AD | 25 |
| Suzuki Carry | 60 |
| Nissan Caravan | 35 |
| Toyota Ipsum | 12 |
| Toyota Caldina | 50 |
| Toyota Succeed | 1 |
| Toyota Voxy | 8 |

El corte contiene 346 fotos. La deduplicación apartó 82 filas; seis tenían una coincidencia perceptual con otra etiqueta. Las conservadas siguen pendientes de inspección, revisión de licencia en Flickr, verificación de generación y agrupación por vehículo. El manifiesto y fotos están en `%LOCALAPPDATA%\Temp\opencode` (`flickr-prioritarios-consolidado.csv` y directorios `flickr-prioritarios-*`). Para buscar más, ejecutar `python scripts/cotizador/openverse_flickr.py <destinoNuevo> --por-consulta 15 --pagina 5` y auditar los manifiestos juntos con `auditar_candidatos.py`. Mantener constante `--por-consulta` entre páginas.

## Tus fotos autorizadas

Coloca los JPEG, PNG o WebP en una carpeta de trabajo. Prepara un CSV UTF-8 con los encabezados `archivo,modelo,generacion,angulo,grupo,autor,licencia,fuente`. Usa rutas relativas; registra la evidencia de autorización (por ejemplo `PERMISO-ESCRITO` y un identificador de autorización en `fuente`). Anota el mismo `grupo` no personal en todas las fotos de la misma unidad, aunque se tomen en sesiones diferentes. Evita incluir placas o rostros identificables.

```powershell
python scripts/cotizador/importar_local.py C:\fotos\lote C:\fotos\lote.csv C:\fotos\importado
```

El destino debe ser nuevo. La herramienta copia los originales por clase, detecta duplicados exactos dentro del lote y genera `para_revision.csv` y `rechazadas.csv`. Verifica las etiquetas, la licencia, la procedencia y las unidades antes de cambiar a `revisada=si`. Mantén el material y los permisos fuera del directorio web. `dataset.py` realiza la deduplicación perceptual y la separación por grupo para el entrenamiento.

## Fichas

`020_cotizador_sunny_hb11.sql` registra el [Sunny HB11 1500 SGL Extra, 1982](https://www.nissan-global.com/EN/HERITAGE_COLLECTION/sunny_1500_sgl_extra.html), con dimensiones exteriores y batalla. Nissan documenta una denominación Sentra para el B11 de EE. UU., no una equivalencia para todos los Sunny. No se encontró volumen de maletera para esa unidad. El [catálogo japonés actual de Probox](https://toyota.jp/probox/) y el [archivo histórico Toyota](https://www.toyota.co.jp/jpn/company/history/75years/vehicle_lineage/) quedan como referencias para contrastar versiones; no se trasladaron dimensiones de una generación a otra ni se registraron compatibilidades.
