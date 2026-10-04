# ============================================================
#  scripts/reiniciar-pruebas.ps1
#  Deja la base de pruebas (3307) como debe estar: con el
#  esquema completo, la replica de datos y las migraciones 009
#  y 010 aplicadas.
#
#  Uso:
#    .\scripts\reiniciar-pruebas.ps1
#    .\scripts\validacion-pruebas.ps1
#
#  ------------------------------------------------------------
#  POR QUE EXISTE
#  ------------------------------------------------------------
#  Cargar el seed y aplicar la migracion 009 son dos pasos que
#  siempre van juntos y siempre en ese orden:
#
#    1. datos_replica_3307.sql  borra `clientes` y `vehiculos`
#       para recargar las filas del dump
#    2. 009_normalizar...sql    es la que vuelve a crear
#       `clientes` a partir de los vehiculos y los enlaza
#
#  Si se hace al reves, o se hace solo el paso 1, la base queda
#  sin clientes y la app responde `vinculado: false`, que parece
#  un fallo del endpoint cuando en realidad falto la migracion.
#
#  Conviene sobre todo antes de la activacion de cuentas, que
#  depende de que el telefono del cliente y el username de su
#  cuenta coincidan.
# ============================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sql  = 'C:\Program Files\MariaDB 13.0\bin\mariadb.exe'
$argsConn = @('--protocol=tcp', '-h', '127.0.0.1', '-P', '3307', '-u', 'gnv', '-pgnvtest', 'gnv_taller')

Write-Host "`n[1/3] Cargando datos de la replica..." -ForegroundColor Cyan
& $sql @argsConn -e "source $root/database/dev/datos_replica_3307.sql"
if ($LASTEXITCODE -ne 0) { throw 'Falló la carga de la replica.' }

Write-Host "[2/3] Aplicando la migracion 009..." -ForegroundColor Cyan
& $sql @argsConn -e "source $root/database/migrations/009_normalizar_cliente_vehiculo.sql"
if ($LASTEXITCODE -ne 0) { throw 'Falló la migracion 009.' }

# La 010 agrega `codigos_activacion.id_cliente`. Sin ella, la
# activacion responde "codigo no valido" para todos los codigos
# recien emitidos, y parece un fallo de la app movil.
Write-Host "[3/3] Aplicando la migracion 010..." -ForegroundColor Cyan
& $sql @argsConn -e "source $root/database/migrations/010_codigos_activacion_cliente.sql"
if ($LASTEXITCODE -ne 0) { throw 'Falló la migracion 010.' }

# Comprobacion de que el enlace quedo bien. Si `vinculado` sale en
# cero, el endpoint de la app movil respondera `vinculado: false`
# y no es un fallo suyo.
$vinculados = & $sql @argsConn -N -B -e "SELECT COUNT(*) FROM clientes WHERE id_usuario IS NOT NULL;"
Write-Host "`n[OK] Base de pruebas lista. Clientes con cuenta: $vinculados" -ForegroundColor Green
Write-Host "     Con 1 cliente vinculado, la app movil ya muestra vehiculos." -ForegroundColor DarkGray
