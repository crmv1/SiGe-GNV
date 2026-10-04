# Migración a MariaDB — SIGE-GNV VC GAS

Este documento explica, paso a paso, cómo pasar la base de datos del
taller a MariaDB como fuente principal del sistema, y cómo dejar de
depender de XAMPP.

---

## 0. Resumen de la situación real

Antes de migrar, esto es lo que se encontró en el proyecto:

| Hallazgo | Detalle |
|---|---|
| El backend no era Node.js | Eran 11 archivos `.php` servidos por Apache de XAMPP, con PDO |
| **La base ya era MariaDB** | Los dos dumps declaran `10.4.32-MariaDB`. XAMPP ya traía MariaDB |
| Existían dos bases | `gnv_taller` (la que usa el código) y `taller_clientes` (legada, sin usar) |
| El modelo no estaba normalizado | No hay `cilindros`, `inspecciones` ni `recalificaciones`. Todo son columnas planas en `vehiculos` |
| No había React Native | Ese proyecto no existe todavía en el repositorio |
| No había `.env` ni migraciones | La configuración estaba fija dentro de `backend/config.php` |
| No había inventario | Ninguna tabla de productos, repuestos ni stock. Se auditó: no hay datos que migrar (sección 3.5) |
| Los precios estaban en el código | El módulo de IA traía los precios de los cilindros escritos en el `.js` (sección 13) |

**Consecuencia importante:** la migración MySQL → MariaDB ya estaba
hecha. Lo que realmente se hizo fue:

1. Construir la API en Node.js + Express.
2. Conectar esa API a MariaDB mediante un pool centralizado.
3. Mover la configuración a variables de entorno.
4. Dejar XAMPP como opcional, solo para desarrollo.

### Arquitectura resultante

```
React Web          React Native
    \                  /
     \   HTTPS (API)  /
      \              /
   Node.js + Express  ────  WPConnect (local en el taller)
              |
          MariaDB  (online)
```

- **React Web** y **React Native** consumen solo la API. Ninguno habla
  con la base de datos.
- **WPConnect** sigue corriendo en la PC del taller, pero se conecta a
  la API online con una API Key. No tiene credenciales de MariaDB.
- **MariaDB** es la única fuente de verdad.

---

## 1. Backups

> Haz esta sección **primero**. Nada de lo que sigue modifica la base
> original.

### 1.1 Exportación desde phpMyAdmin

1. Abre `http://localhost/phpmyadmin` mientras XAMPP está encendido.
2. En la lista izquierda selecciona la base **`gnv_taller`**.
3. Pestaña **Exportar**.
4. Método: **Rápido** o **Personalizado**. Se recomienda **Personalizado**.
5. En **General**:
   - Marca **Estructura** y **Datos**.
   - Deja marcada la opción **Añadir DROP TABLE**.
6. En **Optimizaciones**:
   - Desmarca **AUTO_INCREMENT** solo si quieres conservar los
     contadores exactos. Si la dejas marcada, se recomputan al
     importar, que es lo normal.
7. **Ejecutar**.
8. Guarda el archivo como **`backup.sql`** en una carpeta fuera del
   proyecto, por ejemplo `C:\respaldos\gnv\backup.sql`.

Repite los pasos 2 a 8 para la base **`taller_clientes`** y guarda el
resultado como **`backup_taller_clientes.sql`**.

### 1.2 Exportación con `mysqldump`

`mysqldump` es más confiable que phpMyAdmin para una copia seria, porque
respeta claves foráneas, triggers y procedimientos.

```bash
# En PowerShell, con XAMPP detenido o en marcha.
# La contraseña se pide de forma interactiva: no se escribe en el comando
# ni queda en el historial.

& "C:\xampp\mysql\bin\mysqldump.exe" `
  -u root -p `
  --databases gnv_taller `
  --routines `
  --triggers `
  --events `
  --single-transaction `
  --default-character-set=utf8mb4 `
  --result-file="C:\respaldos\gnv\backup.sql"
```

Qué significa cada opción y por qué importa:

| Opción | Para qué sirve | Qué se rompe si la quitas |
|---|---|---|
| `--databases` | Incluye el `CREATE DATABASE` y el `USE` | El archivo no indica a qué base importar |
| `--routines` | Exporta procedimientos y funciones almacenados | Se pierden Stored Procedures |
| `--triggers` | Exporta los triggers | Se pierden los triggers |
| `--events` | Exporta eventos programados | Se pierden tareas programadas del servidor |
| `--single-transaction` | Copia consistente sin bloquear tablas | En tablas grandes, la copia puede quedar inconsistente |
| `--default-character-set=utf8mb4` | Fuerza la codificación correcta | Los acentos y la ñ se corrompen |
| `--result-file` | Escribe directo al archivo, sin redirección de shell | Problemas de codificación al redirigir en PowerShell |

**Sobre las claves foráneas:** `mysqldump` las exporta al final del
archivo, dentro de su propio bloque. No hay que hacer nada especial.
Lo que **no** se debe hacer es añadir `SET FOREIGN_KEY_CHECKS=0;`
a mano: el archivo ya lo manage correctamente.

### 1.3 Verificar el backup

Antes de seguir, confirma que el archivo no está vacío ni corrupto:

```powershell
Get-Item C:\respaldos\gnv\backup.sql | Select-Object Name, Length
```

Un backup sano pesa varios KB como mínimo. Si `Length` es 0, la
exportación falló: revisa que MySQL esté corriendo.

Además, ábrelo y confirma que contiene `CREATE TABLE` para las tres
tablas (`usuarios`, `vehiculos`, `recordatorios_enviados`) y que
termina con `COMMIT`.

---

## 2. Compatibilidad MySQL → MariaDB

### 2.1 Lo que NO dio problemas

Todo esto se migró **sin ningún cambio**:

- `ENGINE=InnoDB`
- `AUTO_INCREMENT` y sus valores
- Claves foráneas, incluido `ON DELETE CASCADE`
- Índices `KEY`, `UNIQUE KEY` y `PRIMARY KEY`
- `DATETIME`, `DATE`, `TIMESTAMP`
- `current_timestamp()` como valor por defecto
- `ENUM`
- `charset utf8mb4` y `collation utf8mb4_general_ci`
- `INSERT IGNORE`

MariaDB es compatible con el dialecto de MySQL, así que la estructura
de `gnv_taller` se importa sin tocar una línea.

### 2.2 Incompatibilidades reales encontradas

Estas sí son problemas, y se explican en lugar de corregirse en
silencio:

#### a) Fechas `0000-00-00` en `taller_clientes.clientes`

- **Dónde:** filas con `id` 2, 7 y 9 del dump original.
- **Por qué no es compatible:** MariaDB 10.4 corre en modo `STRICT`
  por defecto. `0000-00-00` es una fecha inválida y el servidor la
  rechaza. La importación falla a mitad de camino.
- **Qué se propuso y se aplicó:** guardar esas fechas como `NULL`. La
  columna ya admitía `NULL` y la aplicación trata `NULL` como "sin
  fecha registrada". No se pierde información: `0000-00-00` no
  significa una fecha real.
- **Dónde está aplicado:** `database/legacy/taller_clientes_mariadb.sql`

#### b) Vistas con `DEFINER=root@localhost`

- **Dónde:** `v_inspeccion_en_7d` y `v_recalificacion_en_30d` del dump original.
- **Por qué no es compatible:** al crear una vista, MariaDB registra
  quién la define. El dump dice `DEFINER=root@localhost`. En un
  MariaDB online o en un proveedor gestionado ese usuario no existe,
  y la importación aborta con el **error 1449**.
- **Qué se propuso y se aplicó:** crear las vistas sin `DEFINER`, de
  modo que se definan con el usuario de conexión. La vista funciona
  exactamente igual.
- **Dónde está aplicado:** `database/legacy/taller_clientes_mariadb.sql`

#### c) Tablas "stand-in" para las vistas

- **Dónde:** el dump original creaba tablas vacías con el nombre de
  las vistas y luego las eliminaba con `DROP TABLE`.
- **Por qué es frágil:** si algo falla entre medio, quedan tablas
  basura con nombres que parecen vistas.
- **Qué se propuso y se aplicó:** crear las vistas directamente con
  `CREATE OR REPLACE VIEW`, sin pasos intermedios.

#### d) Contraseñas en texto plano en `taller_clientes.users`

- **Dónde:** `users` guarda `tec123` y `adm123` sin cifrar.
- **Nota:** se conserva **sin cifrar**, a pedido explícito del dueño
  del proyecto. Ver [Riesgos pendientes](#5-riesgos-pendientes).

### 2.3 Driver usado: `mysql2`, no el oficial `mariadb`

El proyecto no tenía driver de Node.js (el backend era PHP), así que
no había un driver existente que preservar. Se eligió `mysql2` porque:

- MariaDB es totalmente compatible con el protocolo que usa `mysql2`.
- `mysql2/promise` tiene el pool de conexiones más maduro del
  ecosistema Node.
- El driver oficial `mariadb` no aporta nada que este proyecto
  necesite; su ventaja principal es el soporte de autenticación
  Kerberos y afín, que no aplica a un taller pequeño.

`scripts/test-database.js` confirma en cada conexión que el servidor
responde `MariaDB` y no `MySQL`, usando `SELECT VERSION()`.

---

## 3. Importar en MariaDB

### 3.1 Crear la base vacía en el proveedor online

La mayoría de proveedores crean la base por panel. Si necesitas
crearla por consola:

```bash
mariadb -h HOST -u USUARIO -p -e "CREATE DATABASE gnv_taller CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
```

### 3.2 Crear la estructura

```bash
# Opción A: cliente oficial de MariaDB
mariadb -h HOST -u USUARIO -p gnv_taller < database/schema.sql

# Opción B: el binario `mysql`, que también sirve contra MariaDB
mysql -h HOST -u USUARIO -p gnv_taller < database/schema.sql
```

Opcionalmente, usar las migraciones en orden, que es lo mismo hecho
por partes:

```bash
Get-ChildItem database/migrations/*.sql | Sort-Object Name | ForEach-Object {
  Write-Host "Aplicando $($_.Name)"
  mariadb -h HOST -u USUARIO -p gnv_taller < $_.FullName
}
```

> `-p` sin contraseña pegada a continuación hace que el cliente la
> pida. **Nunca** pongas la contraseña dentro del comando: queda en el
> historial de la shell.

### 3.3 Importar los datos del backup

```bash
mariadb -h HOST -u USUARIO -p gnv_taller < C:\respaldos\gnv\backup.sql
```

El `backup.sql` generado en el paso 1 contiene los `CREATE TABLE`. Si
ya creaste la estructura con `schema.sql`, **no** ejecutes el backup
completo: o importas solo los `INSERT`, o importas el backup entero en
una base vacía. Lo más simple es empezar de cero:

```bash
# Importar todo de una vez en una base recien creada
mariadb -h HOST -u USUARIO -p < C:\respaldos\gnv\backup.sql
```

### 3.4 Importar la base legada

`taller_clientes` no la usa el sistema actual, pero se conserva por si
algún día se necesita. Usa el archivo ya corregido:

```bash
mariadb -h HOST -u USUARIO -p < database/legacy/taller_clientes_mariadb.sql
```

Este archivo **no** lleva `DROP DATABASE` ni `DROP TABLE`. Se puede
volver a ejecutar sin riesgo.

### 3.5 Aplicar las migraciones 005 a 010

> **Las 009 y 010 son las de la app móvil del cliente.** Si tu objetivo
> es que el cliente vea sus vehículos desde el teléfono, no son
> opcionales: sin 009 no existe `clientes` y sin 010 los códigos de
> activación no saben a qué cliente pertenecen y se rechazan todos.

**Alternativa recomendada:** en la base real (3306) usa el script, que
hace el dump antes de tocar nada, aplica solo lo que falta y termina
con la verificación:

```powershell
.\scripts\migrar-3306.ps1            # plan, no modifica nada
.\scripts\migrar-3306.ps1 -Ejecutar   # pide SI, hace dump, aplica, verifica
```

**A mano**, se aplican **en orden**, sobre la base ya importada. Todas
son **re-ejecutables**: cada cambio consulta antes `information_schema`
y se salta si ya está hecho, así que repetirlas no rompe nada.

Se aplican **en orden**, sobre la base ya importada. Las tres son
**re-ejecutables**: cada cambio consulta antes `information_schema` y se
salta si ya está hecho, así que repetirlas no rompe nada.

```bash
mariadb -h HOST -u USUARIO -p gnv_taller < database/migrations/005_add_usuarios_estado.sql
mariadb -h HOST -u USUARIO -p gnv_taller < database/migrations/006_add_inventario.sql
mariadb -h HOST -u USUARIO -p gnv_taller < database/migrations/007_inventario_datos_ia.sql
mariadb -h HOST -u USUARIO -p gnv_taller < database/migrations/008_add_dispositivos_push.sql
mariadb -h HOST -u USUARIO -p gnv_taller < database/migrations/009_normalizar_cliente_vehiculo.sql
mariadb -h HOST -u USUARIO -p gnv_taller < database/migrations/010_codigos_activacion_cliente.sql
```

| Migración | Qué hace | Rompe algo |
|---|---|---|
| 005 | `estado`, `fecha_creacion` y rol `cliente` en `usuarios` | No. Valores por defecto. |
| 006 | Crea `inventario_productos`, `movimientos_inventario` y la vista `v_inventario_stock_bajo` | No. Tablas nuevas. |
| 007 | Agrega `capacidad_litros` y `montaje` a los productos; crea `parametros_precios` | No. Columnas en `NULL` y tabla vacía. |
| 008 | `dispositivos_push`, para los tokens de push de la app | No. Tabla vacía. |
| 009 | Normaliza: `clientes`, `cilindros`, `inspecciones`, `recalificaciones`; agrega `id_cliente` a `vehiculos` | No. Copia datos y conserva las columnas viejas. |
| 010 | Agrega `id_cliente` y `telefono` a `codigos_activacion` | No. Solo columnas. |

> **Por qué son re-ejecutables.** Un `ALTER TABLE` no puede ir dentro de
> un `IF` en MariaDB, así que cada migración arma el texto del `ALTER` en
> una variable según lo que diga `information_schema` y lo ejecuta con
> `PREPARE`/`EXECUTE`. Si el objeto ya existe, la sentencia se convierte
> en `DO 0`. Verificad las migraciones (001 a 010) aplicándolas dos
> veces seguidas: pasan las dos.

**Si instalaste desde cero con `database/schema.sql`, no apliques
ninguna.** Ese archivo ya incluye el contenido de las tres.

#### Sobre la 006: no hay datos de inventario que migrar

Se auditó la base original y **no existe ninguna tabla de inventario**.
Lo que había era:

- `gnv_taller`: `usuarios`, `vehiculos`, `recordatorios_enviados`,
  `notificaciones`, `codigos_activacion`, `dispositivos_push`.
- `taller_clientes` (legada): `clientes`, `users`,
  `allowed_numbers`, `notifications_log`, dos vistas.

Ninguna guardaba productos, repuestos, accesorios, insumos,
cilindros, kits ni cantidades. Tampoco hay servicios ni órdenes de
trabajo, así que hoy no existe ninguna relación que conservar.

**Conclusión: no hay datos de inventario que migrar.** Las tablas se
crean vacías y el catálogo se carga a mano desde la pantalla de
inventario. La 006 **no copia, renombra ni modifica ninguna tabla
existente**.

#### Sobre la 007: precios que no viven en el código

La 007 existe porque el módulo de IA tenía los cilindros y **sus
precios escritos dentro del `.js`**. Eso hacía imposible cambiar un
precio sin tocar código y redesplegar, y podía ofrecer un cilindro
que el taller ya no tenía.

Ahora:

- El **cilindro es un producto** del inventario (`categoria = 'cilindro'`),
  con su stock y su precio en `inventario_productos`.
- La **mano de obra de instalación** sale de `parametros_precios`.

La tabla `parametros_precios` **nace vacía a propósito**. Un precio
sembrado en una migración es un precio que nadie revisó. Lo carga el
administrador:

```sql
INSERT INTO parametros_precios (clave, valor, moneda, descripcion, id_usuario)
VALUES ('instalacion_gnv', 0.00, 'BOB', 'Mano de obra de instalacion GNV', 1)
ON DUPLICATE KEY UPDATE
  valor = VALUES(valor), moneda = VALUES(moneda),
  descripcion = VALUES(descripcion), id_usuario = VALUES(id_usuario);
```

Mientras esa fila no exista, la estimación de la IA **avisa que falta
el dato y no devuelve total**. No completa con cero: un 0 silencioso
se lee como "es gratis".

#### Sobre la 009: fechas reales que no existían

La 009 separa el propietario del vehículo y mueve las fechas a tablas
propias. El punto delicado es otro: **las fechas reales de los
trabajos antiguos no constan**.

Lo que había era un vencimiento, sin saber cuándo se hizo el trabajo.
Restar un año para deducir la fecha real habría sido **inventar un
dato**, y ese dato es el que después ve el cliente en su teléfono. Así
que la 009 hace lo contrario:

- `fecha_vencimiento` se copia tal cual, intacto. Los recordatorios
  siguen funcionando sin cambios.
- `fecha_realizada` queda en `NULL`. Significa "no consta", no
  "cero" ni "el día de hoy".

Para completarlas sin inventar nada, la vista
**`v_fechas_pendientes`** lista exactamente cuáles faltan y cuántas
de las dos (1 o 2) hay que capturar:

```sql
SELECT * FROM v_fechas_pendientes ORDER BY pendientes DESC;
```

Cuando el taller diga cuándo se hizo cada trabajo, se rellena con un
`UPDATE` normal desde el panel, el vencimiento se recalcula (+1 año o
+5 años) y la fila desaparece de la vista sola. El `verify-database`
avisa si alguna queda con un vencimiento que no cuadre con su fecha
real.

**Sobre la doble escritura.** `vehiculos` conserva `nombre`,
`apellido`, `telefono`, `fecha_inspeccion` y `fecha_recalificacion`,
y el backend los sigue escribiendo junto a las tablas nuevas, dentro
de la misma transacción. No es descuido: el job de recordatorios y los
scripts anteriores a la 009 leen esas columnas tal cual, y cambiarlas
de golpe habría roto avisos ya programados. Son una copia de
compatibilidad, no la fuente de verdad. `verify-database` compara
ambas y avisa si divergen.

#### Sobre la 010: códigos que saben a quién pertenecen

Sin `codigos_activacion.id_cliente`, un código no sabe qué cliente
debe canjearlo. Hay que adivinar por teléfono, y adivinar a quién
entrega el acceso a "mis vehículos" no es una opción aceptable. La
010 agrega la columna; los códigos que ya existían quedan con
`id_cliente` en `NULL` y se rechazan con "código no válido", que es lo
correcto: no se sabe a qué cliente pertenecen. El taller emite uno
nuevo y el cliente lo canjea sin problema.

---

## 4. Verificar la migración

### 4.1 Comprobación automática

```bash
npm run db:verify
```

Muestra únicamente conteos, claves foráneas, índices e integridad.
Nunca imprime nombres, teléfonos, CI ni correos.

Salida esperada si todo salió bien:

```
  CONTEO DE REGISTROS

  usuarios                  : 2
  vehiculos                 : 5
  recordatorios_enviados    : 1
  notificaciones            : 0
  codigos_activacion        : 0
  dispositivos_push         : 0
  inventario_productos      : 0
  movimientos_inventario    : 0
  parametros_precios        : 0
  clientes                  : 5
  cilindros                 : 0
  inspecciones              : 5
  recalificaciones          : 5
```

Los tres últimos de inventario deben dar `0` justo después de migrar:
el inventario es nuevo y no había datos que migrar.

#### Los bloques que importan para la app del cliente

Después del conteo, `verify-database` revisa tres cosas que sostienen
el teléfono. **Las tres deben dar `0` salvo la que se indica:**

```
  NORMALIZACION CLIENTE / VEHICULO

  clientes                            : 5
  con cuenta de usuario               : 2
  todavia sin cuenta (pueden activarse) : 3
  vehiculos sin cliente vinculado      : 0     <-- debe dar 0
  clientes sin ningun vehiculo         : 0
```

`vehiculos sin cliente vinculado` **debe ser 0**. Cada fila con
`id_cliente` en `NULL` es un vehículo que **no aparece en la app del
cliente**, aunque esté perfectamente guardado. Es la causa más común
de "no veo mi vehículo", y no se detecta desde el panel del taller.
Se arregla volviendo a guardar el vehículo desde el panel.

```
  FECHAS REALES Y VENCIMIENTOS

  inspecciones sin fecha real          : 5     <-- normal en los legacy
  inspecciones con +1 ano incorrecto    : 0     <-- debe dar 0
  recalificaciones sin fecha real      : 5     <-- normal en los legacy
  recalificaciones con +5 anos erroneo : 0     <-- debe dar 0
  fechas planas que no cuadran (inspec.) : 0   <-- debe dar 0
  fechas planas que no cuadran (recal.) : 0   <-- debe dar 0
```

`sin fecha real` **no es un error**: son los vehículos cargados antes
de la 009, de los que no se sabe cuándo se hizo el trabajo. La lista
exacta está en `v_fechas_pendientes`.

Los otros tres **sí deben dar 0**. Si dan algo, significa que el
vencimiento no coincide con la fecha real, o que la columna vieja y la
tabla nueva dicen cosas distintas: el panel y la app mostrarían
fechas diferentes para el mismo vehículo.

```
  codigos emitidos                     : 3
    ya canjeados                       : 1
    vigentes                           : 1
    vencidos sin usar                  : 1
  codigos con hash raro (no SHA-256)    : 0     <-- debe dar 0
```

Si `codigos con hash raro` no da 0, hay códigos guardados sin el
hash SHA-256: se pueden leer en claro desde un dump. Hay que
reemitirlos.

El bloque `INVENTARIO` que viene después comprueba, entre otras cosas,
que el stock guardado cuadre con la suma de los movimientos. Esa cifra
debe dar `0`. Si no da `0`, **el script no corrige nada**: muestra el
producto, el stock guardado y el stock que sale del historial, para que
se revise uno por uno.

### 4.2 Comparación manual

Si tienes conteos anotados de la base original, compáralos:

| Tabla | Origen (XAMPP) | Destino (MariaDB) | ¿Igual? |
|---|---|---|---|
| `usuarios` | 2 | | |
| `vehiculos` | 5 | | |
| `recordatorios_enviados` | 1 | | |
| `clientes` (legada) | 10 | | |

También conviene verificar que las **claves foráneas** se importaron:

```sql
SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'gnv_taller'
  AND REFERENCED_TABLE_NAME IS NOT NULL;
```

Debe listar:

- `recordatorios_enviados` → `vehiculos`
- `notificaciones` → `vehiculos`
- `codigos_activacion` → `usuarios` (CASCADE)
- `codigos_activacion` → `clientes` (SET NULL)
- `dispositivos_push` → `usuarios` (CASCADE)
- `clientes` → `usuarios` (SET NULL)
- `cilindros` → `inventario_productos` (SET NULL)
- `vehiculos` → `clientes` (SET NULL)
- `vehiculos` → `cilindros` (SET NULL)
- `inspecciones` → `vehiculos` (CASCADE)
- `recalificaciones` → `vehiculos` (CASCADE)
- `movimientos_inventario` → `inventario_productos` (RESTRICT)
- `movimientos_inventario` → `usuarios` (RESTRICT)
- `parametros_precios` → `usuarios` (SET NULL)

Deben ser **14**. Si `vehiculos → clientes` no aparece, la 009 no está
aplicada y la app del cliente no tiene nada que mostrar.

Y que no queden registros huérfanos:

```sql
SELECT COUNT(*) AS huerfanos
FROM recordatorios_enviados re
LEFT JOIN vehiculos v ON v.id = re.vehiculo_id
WHERE v.id IS NULL;
```

Debe dar `0`.

### 4.3 Probar la API

```bash
npm run db:test
```

Luego, con la API levantada (`npm start`):

```bash
curl http://localhost:3100/api/health
```

Respuesta esperada:

```json
{ "status": "ok", "database": "connected" }
```

Y la consulta pública por placa, que no expone datos personales:

```bash
curl http://localhost:3100/api/public/consulta/placa/1234ABC
```

```json
{
  "success": true,
  "data": {
    "placa": "1234ABC",
    "proxima_inspeccion": "2026-04-20",
    "estado_inspeccion": "vencido",
    "proxima_recalificacion": "2026-06-01",
    "estado_recalificacion": "vencido"
  }
}
```

### 4.4 Problema conocido: la contraseña de `tecnico`

Al verificar los hashes de `gnv_taller.usuarios` contra las contraseñas
de `backend/generate_hashes.php` se encontró esto:

| Usuario | Contraseña esperada | ¿Coincide el hash? |
|---|---|---|
| `administrador` | `admin123` | **Sí** |
| `tecnico` | `tecnico123` | **No** |

El hash guardado para `tecnico` no corresponde a `tecnico123`. O la
contraseña se cambió en phpMyAdmin en algún momento, o el hash del
dump está desactualizado.

No es un problema de compatibilidad: `bcryptjs` verifica correctamente
los hashes `$2y$` que genera PHP. Es un dato que no coincide.

Para fijarla de nuevo sin conocer la anterior:

```bash
npm run user:password -- tecnico NuevaClave123
```

El script genera el hash bcrypt y lo guarda. También sirve para
restablecer cualquier cuenta.

---

## 5. Riesgos pendientes

Estos puntos quedan abiertos y son conscientes:

### 5.0 La base real (3306) todavía no tiene los usuarios dedicados

`gnv_app` y `gnv_admin` están definidos en `.env` y en
`.env.migraciones.local`, pero **todavía no existen en el MariaDB de
XAMPP (3306)**. Hasta que se creen, la API no conecta contra la base
real y ninguna migración se puede aplicar ahí.

Se crean una vez, entrando como `root`. El archivo con las claves está
fuera del repositorio y se borra después de importarlo:

```powershell
& "C:\Program Files\MariaDB 13.0\bin\mariadb.exe" -h 127.0.0.1 -P 3306 -u root -p
  -> source C:/Users/camii/AppData/Local/Temp/opencode/crear_usuarios_gnv.sql
```

O por phpMyAdmin, pestaña *Importar*. Después, `.\scripts\migrar-3306.ps1`
aplica lo que falte. Mientras tanto, todo se valida contra 3307, que es
una réplica con datos de desarrollo inventados.

### 5.1 Contraseñas en texto plano en `taller_clientes.users`

Por pedido explícito, las contraseñas `tec123` y `adm123` se migraron
**sin cifrar**. Esa base queda accesible desde la API. El backend no
la lee: la autenticación usa `gnv_taller.usuarios`, que sí usa bcrypt.
Pero si alguien logra leer `taller_clientes.users`, tendrá las
contraseñas en claro.

Si en algún momento se decide cifrarlas:

```bash
npm run user:password -- tecnico <contrasena>
```

y luego se borra la tabla `users` de la base legada, o se le niega el
acceso al usuario de la base.

### 5.2 `node_modules/` ya está versionado en git

`frontend/node_modules/` y `whatsapp/node_modules/` estaban
comprometidos en el repositorio desde el primer commit. El `.gitignore`
ahora los cubre, pero eso **no** los saca del índice de git. Para
sacarlos:

```bash
git rm -r --cached frontend/node_modules whatsapp/node_modules
git commit -m "Dejar de versionar node_modules"
```

Es una operación que no borra los archivos del disco, solo deja de
seguirlos.

### 5.3 Roles en minúsculas

El proyecto pide los roles `ADMINISTRADOR`, `TECNICO`, `CLIENTE`, pero
la base los tiene en minúsculas y el frontend compara así:

```js
// frontend/src/pages/DashboardPage.jsx
user?.rol === 'administrador'
```

Se conservaron en minúsculas y se agregó `cliente` en el mismo estilo.
Pasarlos a mayúsculas rompería la app web. Si algún día se cambia,
hay que actualizar la comparación del frontend en el mismo commit.

### 5.4 Bug de seguridad en el backend PHP (resuelto al migrar)

`backend/enviar_recordatorios.php` imprimía la respuesta **antes** de
llamar a `requireAuth()`:

```php
$resumen = ['enviados' => $enviados, 'errores' => $errores];
echo json_encode($resumen) . "\n";      // <-- imprimía aquí

if (php_sapi_name() !== 'cli') {
    requireAuth();                      // <>y validación después
```

Cualquiera que abriera la URL disparaba envíos de WhatsApp. Además la
clave estaba fija en el código: `if ($clave !== 'gnv2024secreto')`.

Esto ya no aplica: la API nueva valida la API Key en el middleware,
antes de procesar la solicitud. El archivo PHP queda en el repositorio
por si hay que volver atrás, pero no debería volver a ejecutarse.

---

## 6. Desarrollo local sin XAMPP

### Opción A: MariaDB Server instalado (recomendada)

1. Descarga MariaDB Server para Windows desde `https://mariadb.org/download/`.
2. Instala. Durante la instalación, **desmarca** la opción de
   instalarlo como servicio de Windows si no quieres que arranque solo.
3. Abre la consola de MariaDB y crea la base y el usuario:

```sql
CREATE DATABASE gnv_taller CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER 'gnv_app'@'localhost' IDENTIFIED BY 'elige_una_clave';
GRANT ALL PRIVILEGES ON gnv_taller.* TO 'gnv_app'@'localhost';
FLUSH PRIVILEGES;
```

4. Crea el archivo `.env` en la raíz del proyecto:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=gnv_app
DB_PASSWORD=elige_una_clave
DB_NAME=gnv_taller
DB_SSL=false
```

5. Importa la estructura:

```bash
mariadb -u gnv_app -p gnv_taller < database/schema.sql
```

6. Levanta la API:

```bash
npm install
npm run db:test
npm run dev
```

**XAMPP ya no es necesario.** Puedes desinstalarlo cuando quieras. Su
base antigua puedes conservarla como respaldo, pero nada del sistema
la va a usar.

### Opción B: MariaDB con Docker

Solo si ya tienes Docker instalado. **No es obligatorio.**

Hay un `docker-compose.yml` en la raíz con MariaDB para desarrollo:

```bash
docker compose up -d
docker compose logs -f mariadb   # ver la clave temporal en el log
```

Después copia la contraseña que imprima el log a tu `.env` y corre
`npm run db:test`.

Para parar:

```bash
docker compose down
```

Para parar y borrar el volumen de datos (esto **sí** borra la base
local de desarrollo):

```bash
docker compose down -v
```

---

## 7. Puesta en producción

### 7.1 Configurar las variables de entorno

```bash
npm run build   # solo aplica al frontend
NODE_ENV=production
```

En el `.env` del servidor:

```env
PORT=3100
NODE_ENV=production
CORS_ORIGINS=https://tu-dominio.com

DB_HOST=el-host-que-te-dio-el-proveedor
DB_PORT=3306
DB_USER=el-usuario-del-proveedor
DB_PASSWORD=la-clave-del-proveedor
DB_NAME=gnv_taller
DB_SSL=true
DB_SSL_CA_PATH=/ruta/al/ca.pem

JWT_SECRET=<48 bytes aleatorios>
JWT_EXPIRES_IN=8h
WHATSAPP_INTEGRATION_API_KEY=<32 bytes aleatorios>
```

Generar los secretos:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Si el proveedor no da un certificado CA, deja `DB_SSL_CA_PATH` vacío:
el sistema usará el almacén de certificados del servidor. **Nunca**
 pongas `rejectUnauthorized: false`: la validación TLS no se desactiva.

### 7.2 HTTPS

La API debe quedar detrás de un proxy inverso con certificado. Con
Caddy, por ejemplo, un `Caddyfile` mínimo:

```
api.tudominio.com {
    reverse_proxy localhost:3100
}
```

Caddy emite el certificado automáticamente. Con Nginx hay que
configurar el certificado a mano.

Google Play **exige HTTPS**. La app móvil no se puede publicar apuntando
a una URL en claro.

### 7.3 Mantener el proceso vivo

Con `pm2`:

```bash
npm install -g pm2
pm2 start src/server.js --name sige-gnv-api
pm2 save
pm2 startup
```

Con PM2, el job de recordatorios se inicia solo porque
`NODE_ENV=production`. En desarrollo no corre, para no enviar
notificaciones de prueba.

### 7.4 WPConnect

En la PC del taller, en `whatsapp/.env`:

```env
API_URL=https://api.tudominio.com
WHATSAPP_INTEGRATION_API_KEY=<la misma clave que en la API>
```

Esa PC **no** tiene credenciales de MariaDB. Solo la API Key.

```bash
npm run dev
```

---

## 8. Comandos disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la API con recarga automática (nodemon) |
| `npm start` | Levanta la API en modo producción |
| `npm run db:test` | Prueba conexión, versión de MariaDB y base seleccionada |
| `npm run db:verify` | Conteos, claves foráneas, huérfanos e índices |
| `npm run test:inventario` | 80 comprobaciones del inventario y su integración con la IA |
| `node scripts/test-inventario.js` | Lo mismo, pero en modo solo lectura |
| `npm run user:password -- <usuario> <clave>` | Fija la contraseña de un usuario con hash bcrypt |

---

## 9. Endpoints de la API

### Públicos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado de la API y de la base |
| `GET` | `/api/version` | Versión del motor de base de datos |
| `GET` | `/api/public/consulta/placa/:placa` | Consulta por placa. **Sin datos personales** |

### Con sesión (JWT)

| Método | Ruta | Rol |
|---|---|---|
| `POST` | `/api/auth/login` | Público, con freno de fuerza bruta |
| `GET` | `/api/auth/me` | Cualquiera autenticado |
| `POST` | `/api/auth/logout` | Cualquiera autenticado |
| `GET` | `/api/vehiculos` | Cualquiera autenticado |
| `GET` | `/api/vehiculos/:id` | Cualquiera autenticado |
| `POST` | `/api/vehiculos` | Técnico o administrador |
| `PUT` | `/api/vehiculos/:id` | Técnico o administrador |
| `DELETE` | `/api/vehiculos/:id` | Solo administrador |

### Inventario

Detalle completo en la sección 12.

| Método | Ruta | Rol |
|---|---|---|
| `GET` | `/api/inventario/productos` | Técnico, administrador |
| `GET` | `/api/inventario/productos/:id` | Técnico, administrador |
| `POST` | `/api/inventario/productos` | Solo administrador |
| `PUT` | `/api/inventario/productos/:id` | Solo administrador |
| `GET` | `/api/inventario/movimientos` | Solo administrador |
| `GET` | `/api/inventario/movimientos/:id` | Solo administrador |
| `POST` | `/api/inventario/movimientos` | Solo administrador |
| `GET` | `/api/inventario/alertas` | Técnico, administrador |
| `GET` | `/api/inventario/resumen` | Técnico, administrador |

El rol `cliente` recibe `403` en las nueve.

### Integración (API Key de WPConnect)

| Método | Ruta |
|---|---|
| `POST` | `/api/public/chatbot` |
| `GET` | `/api/integrations/whatsapp/pendientes` |
| `POST` | `/api/integrations/whatsapp/notificaciones/:id/enviada` |
| `POST` | `/api/integrations/whatsapp/notificaciones/:id/error` |

La API Key viaja en el header `X-API-Key`. **Nunca** se coloca en React
Native ni en el frontend: quedaría expuesta en el dispositivo.

### Módulo de IA (reconocimiento en mock; catálogo y precios reales)

| Método | Ruta | Qué devuelve |
|---|---|---|
| `POST` | `/api/ai/vehicle-recognition` | **Mock.** Marca y modelo de ejemplo |
| `GET` | `/api/ai/maletera` | **Referencial.** Medidas por marca, a confirmar |
| `GET` | `/api/ai/cilindros` | **Real.** Del inventario, con stock y precio |
| `POST` | `/api/ai/estimacion` | **Real.** Precios de la base, o aviso de que faltan |

Mientras `AI_VEHICLE_RECOGNITION_ENABLED=false`, el reconocimiento
responde con un **mock** identificado como tal, para que nadie tome una
decisión sobre datos falsos. Falta que entregues la URL del repositorio,
la licencia, el modelo y los pesos.

`cilindros` y `estimacion` **ya no son mock**: leen de MariaDB. Ver la
sección 13.

---

## 10. Backups de MariaDB

### 10.1 Backup manual

```bash
mariadb-dump -h HOST -u USUARIO -p `
  --databases gnv_taller `
  --routines --triggers --events `
  --single-transaction `
  --default-character-set=utf8mb4 `
  --result-file="C:\respaldos\gnv\backup_$(Get-Date -Format yyyyMMdd_HHmm).sql"
```

En Linux o macOS, con fecha automática:

```bash
mariadb-dump -h HOST -u USUARIO -p \
  --databases gnv_taller --routines --triggers --events \
  --single-transaction --default-character-set=utf8mb4 \
  > "backup_$(date +%Y%m%d_%H%M).sql"
```

### 10.2 Backup automático (Linux, con cron)

```bash
crontab -e
```

```cron
# Todos los días a las 02:13, con retención de 30 días
13 2 * * * mariadb-dump -h HOST -u USUARIO -pPASS gnv_taller --routines --triggers --events --single-transaction --default-character-set=utf8mb4 | gzip > /var/backups/gnv/$(date +\%Y\%m\%d).sql.gz
```

**Aviso:** si el cron lleva la contraseña en línea, queda visible en
`ps` para cualquier usuario de la máquina. Mejor usa un archivo de
credenciales:

```bash
mariadb-dump --defaults-extra-file=/etc/mysql/backup.cnf gnv_taller ... > ...
```

con `/etc/mysql/backup.cnf` en permisos `600`:

```ini
[client]
user=gnv_backup
password=clave_solo_para_backups
```

Y con el proveedor gestionado, usa el respaldo automático que ya
incluye: casi todos lo ofrecen y es la opción más segura.

### 10.3 Restauración

```powershell
# Con el servidor MariaDB detenido, o sobre una base vacía.
Get-Content C:\respaldos\gnv\backup_20260928_0200.sql -Raw |
  & "C:\Program Files\MariaDB\...\bin\mariadb.exe" -u USUARIO -p gnv_taller
```

Si el backup está comprimido con gzip:

```bash
gunzip -c backup_20260928_0200.sql.gz | mariadb -h HOST -u USUARIO -p gnv_taller
```

### 10.4 Validación del respaldo

Un backup que nunca se restauró no es un backup. Al menos una vez por
trimestre:

1. Restaura el backup en una base con otro nombre:

```bash
mariadb -h HOST -u USUARIO -p -e "CREATE DATABASE gnv_taller_prueba CHARACTER SET utf8mb4;"
mariadb -h HOST -u USUARIO -p gnv_taller_prueba < backup_20260928_0200.sql
```

2. Comprueba los conteos:

```bash
mariadb -h HOST -u USUARIO -p gnv_taller_prueba -e "
  SELECT 'usuarios' AS tabla, COUNT(*) AS n FROM usuarios
  UNION ALL SELECT 'vehiculos', COUNT(*) FROM vehiculos
  UNION ALL SELECT 'recordatorios_enviados', COUNT(*) FROM recordatorios_enviados;"
```

3. Comprueba que las claves foráneas están:

```bash
mariadb -h HOST -u USUARIO -p gnv_taller_prueba -e "
  SELECT TABLE_NAME, REFERENCED_TABLE_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA='gnv_taller_prueba' AND REFERENCED_TABLE_NAME IS NOT NULL;"
```

4. Borra la base de prueba:

```bash
mariadb -h HOST -u USUARIO -p -e "DROP DATABASE gnv_taller_prueba;"
```

> Ese `DROP DATABASE` es sobre una base de **prueba** creada
> explícitamente para validar el respaldo. Nunca lo ejecutes contra
> `gnv_taller`.

---

## 11. Orden de migración aplicado

| Fase | Qué se hizo | Dónde |
|---|---|---|
| 1 | Auditoría de MySQL/XAMPP | Este documento, sección 0 |
| 2 | Instrucciones de backup | Sección 1 |
| 3 | Análisis de compatibilidad | Sección 2 |
| 4 | Variables de entorno | `.env.example` |
| 5 | Conexión MariaDB con pool | `src/config/database.js` |
| 6 | Estructura inicial | `database/schema.sql`, `database/migrations/001_initial_schema.sql` |
| 6b | Migraciones 002 a 004 — notificaciones, activación, push | `database/migrations/` |
| 6c | Migración 005 — estado y rol cliente en `usuarios` | `database/migrations/005_add_usuarios_estado.sql` |
| 6d | Migración 006 — módulo de inventario | `database/migrations/006_add_inventario.sql` |
| 6e | Migración 007 — datos de cilindro y precios para la IA | `database/migrations/007_inventario_datos_ia.sql` |
| 6f | Base legada corregida | `database/legacy/taller_clientes_mariadb.sql` |
| 7 | Importación | Sección 3 |
| 8 | Verificación de conteos | `scripts/verify-database.js` |
| 9 | Verificación de FK y huérfanos | `scripts/verify-database.js` |
| 10 | Pruebas del backend | `npm run db:test`, `npm start` |
| 10b | Pruebas del inventario | `npm run test:inventario` |
| 11 | MariaDB como base principal | Todo el proyecto |
| 12 | React Web sobre la API | `frontend/src/api.js` |
| 12b | Pantalla de inventario en React Web | `frontend/src/pages/InventarioPage.jsx` |
| 13 | React Native | Pendiente: el proyecto móvil no existe aún |
| 14 | WPConnect sobre la API | `whatsapp/server.js` |
| 15 | La IA lee catálogo y precios de la base | `src/ai/vehicleRecognition/vehicleRecognition.service.js` |
| 16 | Documentación | Este documento |

---

## 12. Módulo de inventario

### 12.1 Qué se creó

| Tabla | Para qué |
|---|---|
| `inventario_productos` | Catálogo único: productos, accesorios, repuestos, insumos, cilindros y kits. Lo que cambia entre uno y otro es `categoria`, no la tabla. |
| `movimientos_inventario` | Trazabilidad. Una fila por cada cambio de stock, con el antes, el después, el motivo, la referencia y el usuario responsable. |
| `v_inventario_stock_bajo` | Vista de solo lectura con los productos en o por debajo del mínimo. |

### 12.2 La regla central: el stock no se edita

`stock_actual` **no se escribe desde el formulario de edición**. Se
rechaza con `STOCK_SOLO_POR_MOVIMIENTO`.

El stock solo cambia dentro de la misma transacción que inserta el
movimiento, y con la fila del producto bloqueada
(`SELECT ... FOR UPDATE`). Sin ese bloqueo, dos salidas simultáneas
podrían leer el mismo stock y las dos pasar.

- El **UPDATE del stock** y el **INSERT del movimiento** van juntos:
  o se guardan los dos, o no se guarda ninguno.
- Por eso un producto nuevo arranca en `stock_actual = 0`, y la carga
  inicial se registra como una `ENTRADA`.

### 12.3 Los tres tipos de movimiento

| Tipo | Campos | Qué hace |
|---|---|---|
| `ENTRADA` | `cantidad` > 0 | Suma. Es la compra o la reposición. |
| `SALIDA` | `cantidad` > 0 | Resta. Es el uso en un servicio o la venta. |
| `AJUSTE` | `stock_nuevo` ≥ 0 | Fija el stock real contado. El servicio guarda la diferencia. |

`cantidad` se guarda **siempre positiva**; el signo lo da `tipo`. Un
`CHECK` de MariaDB obliga a que la cuenta cuadre:

```sql
CONSTRAINT chk_movimientos_coherencia CHECK (
     (`tipo` = 'ENTRADA' AND `stock_nuevo` = `stock_anterior` + `cantidad`)
  OR (`tipo` = 'SALIDA'  AND `stock_nuevo` = `stock_anterior` - `cantidad`)
  OR (`tipo` = 'AJUSTE'  AND `cantidad` = ABS(`stock_nuevo` - `stock_anterior`))
)
```

**El stock nunca queda negativo.** Hay tres redes: la validación del
cuerpo, el `CHECK` de la tabla y el error `409 STOCK_INSUFICIENTE`.

### 12.4 Permisos por rol

| Rol | Productos | Movimientos | Historial | Alertas y resumen |
|---|---|---|---|---|
| `administrador` | Crear y editar | Entrada, salida y ajuste | Sí | Sí |
| `tecnico` | Solo consultar | **No** (403) | **No** (403) | Sí |
| `cliente` | **No** (403) | **No** (403) | **No** (403) | **No** (403) |

Los permisos se aplican **en el backend**, en el middleware de las
rutas. La interfaz web además esconde los botones, pero eso es
comodidad: aunque alguien los pulse, el servidor responde `403`.

> El proyecto móvil de clientes **no existe todavía**. Cuando se
> construya, no debe incluir ninguna pantalla de inventario. La
> garantía de que un cliente no ve estos datos es la API, no la app.

### 12.5 No hay borrado físico

No existe endpoint `DELETE` de productos. Se dan de baja con
`estado = 'inactivo'`.

La razón: las FK hacia `inventario_productos` y `usuarios` son
`ON DELETE RESTRICT`. Borrar un producto con movimientos rompería el
historial. Desactivar mantiene la cuenta completa.

### 12.6 Relación con servicios (preparada, no implementada)

Hoy el taller no tiene tabla de servicios ni de detalle de servicio,
así que no hay a qué engancharse. La columna `referencia` de
`movimientos_inventario` ya guarda el dato que hará falta (número de
orden, factura).

Cuando exista el modelo de servicios, la cadena será:

```
servicio → detalle_servicio → producto + cantidad
```

No se creó nada de eso a propósito: serían tablas vacías que no
relacionan con nada.

### 12.7 Endpoints

| Método | Ruta | Rol |
|---|---|---|
| `GET` | `/api/inventario/productos` | técnico, administrador |
| `GET` | `/api/inventario/productos/:id` | técnico, administrador |
| `POST` | `/api/inventario/productos` | administrador |
| `PUT` | `/api/inventario/productos/:id` | administrador |
| `GET` | `/api/inventario/movimientos` | administrador |
| `GET` | `/api/inventario/movimientos/:id` | administrador |
| `POST` | `/api/inventario/movimientos` | administrador |
| `GET` | `/api/inventario/alertas` | técnico, administrador |
| `GET` | `/api/inventario/resumen` | técnico, administrador |

Filtros de `GET /productos`: `estado`, `categoria`, `busqueda`,
`stock_bajo`.
Filtros de `GET /movimientos`: `id_producto`, `tipo`, `desde`, `hasta`,
`limite` (máx. 200), `offset`.

### 12.8 Probar el módulo

```bash
# Solo lectura: comprueba que las tablas y columnas existen.
node scripts/test-inventario.js

# Prueba completa. Crea y borra solo sus propios datos.
npm run test:inventario
```

Cubre 13 grupos, 80 comprobaciones: creación con permiso, entradas,
salidas, stock insuficiente, ajustes, historial, usuario responsable,
stock mínimo, bloqueo al cliente móvil, persistencia en MariaDB con
una conexión independiente, y que el módulo de IA lea el catálogo y
los precios de la base.

Al terminar compara los conteos con los del principio. Deben quedar
igual: `0 fallo(s)`.

**Salvedades del script:**

- Con `NODE_ENV=production` se niega a correr, aunque le pasen
  `--escribir`.
- El precio de mano de obra de la prueba 13 usa la clave
  `instalacion_gnv_prueba_<marca>`, que **no** es la del taller
  (`instalacion_gnv`). El precio real no se pisa nunca.
- Si una corrida anterior se murió a mitad de camino, la siguiente
  limpia las sobras antes de empezar y los conteos siguen cuadrando.

---

## 13. La IA lee el catálogo y los precios de la base

Antes, `src/ai/vehicleRecognition/vehicleRecognition.service.js` traía
una tabla de 4 cilindros con sus precios escrita dentro del `.js`.
Eso era un precio que nadie revisaba, que se desactualizaba solo y que
no tenía nada que ver con el depósito.

Ahora el módulo **lee**:

| Dato | De dónde sale |
|---|---|
| Qué cilindros hay | `inventario_productos` con `categoria = 'cilindro'` |
| Capacidad y montaje | `capacidad_litros` y `montaje` del producto |
| Precio del cilindro | `inventario_productos.precio_venta` |
| Si se puede entregar hoy | `inventario_productos.stock_actual` |
| Mano de obra de instalación | `parametros_precios`, clave `instalacion_gnv` |
| Moneda | `parametros_precios.moneda` |

Consecuencias:

- **Cambiar un precio es editar una fila**, no tocar código ni
  redesplegar.
- El módulo **no ofrece un cilindro que el taller no tiene**.
- Si falta un precio, **avisa y no devuelve total**. No completa con
  cero: un `0` silencioso se lee como "es gratis".
- Un cilindro sin `capacidad_litros` **no se puede dar de alta**
  (`FALTA_CAPACIDAD_CILINDRO`): sin ese dato no se puede afirmar que
  entre en la maletera.

### Qué sigue siendo mock

La **predicción de marca y modelo** sigue siendo un mock, y la tabla de
**vistas de maletera** sigue siendo referencial. Son datos del
vehículo, no del taller: no cambian con el depósito ni con la lista.

Ambos avisan explícitamente que hay que confirmarlos. Cuando VC Gas
entregue la tabla definitiva de maleteras, se reemplaza el objeto por
una consulta, igual que se hizo con los cilindros.

Y la regla de siempre: **la IA no decide**. El encargado del taller
siempre confirma o corrige marca y modelo antes de guardarlo.
