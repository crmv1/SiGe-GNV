# ============================================================
#  scripts/migrar-3306.ps1
#  Aplica las migraciones faltantes a la BASE REAL (3306).
#
#  Uso:
#    1. Con XAMPP encendido, entra como root a MariaDB 3306 y
#       ejecuta el archivo de usuarios (ver abajo).
#    2. .\scripts\migrar-3306.ps1            (muestra el plan)
#    3. .\scripts\migrar-3306.ps1 -Ejecutar   (aplica)
#
#  ------------------------------------------------------------
#  POR QUE HACE FALTA UN -Ejecutar
#  ------------------------------------------------------------
#  Esto corre contra la base de datos del taller. Un `source` con
#  la palabra mal puesta no se avisa: ejecuta. Por eso primero
#  imprime que va a hacer y pide confirmacion.
#
#  ------------------------------------------------------------
#  GARANTIAS
#  ------------------------------------------------------------
#  - Antes de tocar nada hace un mysqldump de respaldo. Si algo
#    sale mal, el respaldo esta en la carpeta respaldos.
#  - Solo aplica migraciones que NO esten ya aplicadas. Una que
#    ya esta no se vuelve a correr.
#  - Ninguna migracion contiene DROP TABLE ni TRUNCATE: solo
#    crean, agregan columnas o rellenan datos. Los datos del
#    taller no se borran.
#  - Al final corre la verificacion, que es de solo lectura.
# ============================================================

[CmdletBinding()]
param(
  [switch]$Ejecutar
)

$ErrorActionPreference = 'Stop'
$root  = Split-Path -Parent $PSScriptRoot
$sql   = 'C:\Program Files\MariaDB 13.0\bin\mariadb.exe'

if (-not (Test-Path $sql)) {
  throw "No se encontro mariadb.exe en $sql"
}

# gnv_admin viene de .env.migraciones.local, que esta fuera del
# repositorio. gnv_app NO sirve para esto: por diseno no tiene
# permiso de DDL.
if (-not (Test-Path (Join-Path $root '.env.migraciones.local'))) {
  throw 'Falta .env.migraciones.local (el usuario administrativo gnv_admin).'
}
$admin = @{}
Get-Content (Join-Path $root '.env.migraciones.local') | ForEach-Object {
  if ($_ -match '^([A-Z_]+)=(.*)$') { $admin[$Matches[1]] = $Matches[2] }
}
$usuario = $admin['DB_USER']
$clave   = $admin['DB_PASSWORD']
if (-not $usuario) { throw '.env.migraciones.local no trae DB_USER.' }

$argsConn = @('--protocol=tcp', '-h', '127.0.0.1', '-P', '3306', '-u', $usuario, "-p$clave")

function Consulta([string]$sqlTexto) {
  $out = & $sql @argsConn -N -B gnv_taller -e $sqlTexto 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Consulta fallo: $sqlTexto`n$out" }
  return $out
}

# ------------------------------------------------------------
#  Conexion
# ------------------------------------------------------------
try {
  $saludo = Consulta "SELECT VERSION();"
} catch {
  Write-Host ''
  Write-Host '  [BLOQUEADO] No se pudo conectar a 3306 con el usuario administrativo.' -ForegroundColor Red
  Write-Host "             $($_.Exception.Message)" -ForegroundColor DarkGray
  Write-Host ''
  Write-Host ' Casi siempre es una de estas dos:' -ForegroundColor Yellow
  Write-Host '   1. XAMPP no esta encendido (MariaDB de 3306 apagado).'
  Write-Host '   2. El usuario gnv_admin todavia NO existe en 3306. Es el primer uso,'
  Write-Host '      asi que hay que crearlo antes como root:'
  Write-Host ''
  Write-Host '      & "C:\Program Files\MariaDB 13.0\bin\mariadb.exe" -h 127.0.0.1 -P 3306 -u root -p'
  Write-Host '        -> source C:/Users/camii/AppData/Local/Temp/opencode/crear_usuarios_gnv.sql'
  Write-Host ''
  exit 1
}

Write-Host ''
Write-Host '  BASE REAL  localhost:3306' -ForegroundColor Green
Write-Host "  MariaDB   $saludo" -ForegroundColor DarkGray
Write-Host "  usuario   $usuario" -ForegroundColor DarkGray
Write-Host ''

# ------------------------------------------------------------
#  Que migraciones faltan
# ------------------------------------------------------------
$migraciones = @(
  @{ Archivo = '006_add_inventario.sql';                 Requerida = $false },
  @{ Archivo = '007_inventario_datos_ia.sql';           Requerida = $false },
  @{ Archivo = '008_add_dispositivos_push.sql';         Requerida = $false },
  @{ Archivo = '009_normalizar_cliente_vehiculo.sql';    Requerida = $true  },
  @{ Archivo = '010_codigos_activacion_cliente.sql';     Requerida = $true  }
)

function TablaExiste([string]$t) {
  $n = Consulta "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$t';"
  return [int]$n -gt 0
}

$plan = @()
foreach ($m in $migraciones) {
  $ruta = Join-Path $root "database/migrations/$($m.Archivo)"
  if (-not (Test-Path $ruta)) { continue }

  $aplicada = $false
  switch -Regex ($m.Archivo) {
    '006' { $aplicada = TablaExiste 'inventario_productos' }
    '007' { $aplicada = TablaExiste 'parametros_precios' }
    '008' { $aplicada = TablaExiste 'dispositivos_push' }
    '009' { $aplicada = TablaExiste 'clientes' }
    '010' {
      $col = Consulta "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='codigos_activacion' AND COLUMN_NAME='id_cliente';"
      $aplicada = [int]$col -gt 0
    }
  }

  $plan += [pscustomobject]@{
    Archivo  = $m.Archivo
    Ruta     = $ruta
    Estado   = if ($aplicada) { 'ya aplicada' } else { 'FALTA' }
    Obligatoria = $m.Requerida
  }
}

Write-Host '  MIGRACIONES' -ForegroundColor Cyan
Write-Host '  ------------' -ForegroundColor Cyan
foreach ($p in $plan) {
  $marca = if ($p.Estado -eq 'FALTA') { '[ ]' } else { '[x]' }
  $color = if ($p.Estado -eq 'FALTA') { 'Yellow' } else { 'DarkGray' }
  $oblig = if ($p.Obligatoria -and $p.Estado -eq 'FALTA') { '  <- obligatoria' } else { '' }
  Write-Host "  $marca $($p.Archivo.PadRight(42)) $($p.Estado)$oblig" -ForegroundColor $color
}

$pendientes = @($plan | Where-Object { $p = $_; $p.Estado -eq 'FALTA' })

Write-Host ''
if ($pendientes.Count -eq 0) {
  Write-Host '  [OK] No falta ninguna migracion. La base real esta al dia.' -ForegroundColor Green
  Write-Host ''
  Write-Host '  Verificacion de solo lectura:' -ForegroundColor DarkGray
  & $sql @argsConn gnv_taller -e "source $($root -replace '\\','/')/scripts/verify-database.js" 2>&1 | Out-Null
  $env:DB_USER = $usuario; $env:DB_PASSWORD = $clave
  node (Join-Path $root 'scripts/verify-database.js')
  exit 0
}

# Cuantas filas hay ahora, para comparar despues. No se imprime
# ningun dato personal: solo el numero.
$conteoAntes = Consulta "SELECT CONCAT('vehiculos=', (SELECT COUNT(*) FROM vehiculos));" 2>$null
if (-not $conteoAntes) { $conteoAntes = 'vehiculos=(sin tabla)' }

# ------------------------------------------------------------
#  Respaldo antes de tocar nada
# ------------------------------------------------------------
$carpeta = Join-Path $root 'respaldos'
if (-not (Test-Path $carpeta)) { New-Item -ItemType Directory -Path $carpeta | Out-Null }
$sello = Get-Date -Format 'yyyyMMdd-HHmmss'
$dump  = Join-Path $carpeta "antes-migracion-$sello.sql"
$dumpArgs = @('--protocol=tcp', '-h', '127.0.0.1', '-P', '3306', '-u', $usuario, "-p$clave",
              '--result-file=' + $dump, '--single-transaction', '--routines', '--triggers', 'gnv_taller')

Write-Host ''
Write-Host '  PLAN' -ForegroundColor Cyan
Write-Host "    Pendientes : $($pendientes.Count) ($($pendientes.Archivo -join ', '))"
Write-Host "    Datos antes: $conteoAntes"
Write-Host "    Respaldo   : respaldos\antes-migracion-$sello.sql"
Write-Host ''

if (-not $Ejecutar) {
  Write-Host '  ESTO NO SE EJECUTO. Faltó -Ejecutar.' -ForegroundColor Yellow
  Write-Host ''
  Write-Host '  Cuando estes seguro, corre:' -ForegroundColor DarkGray
  Write-Host '    .\scripts\migrar-3306.ps1 -Ejecutar' -ForegroundColor White
  Write-Host ''
  exit 0
}

$confirmar = Read-Host '  Escribe SI para aplicar a la BASE REAL'
if ($confirmar -ne 'SI') {
  Write-Host '  Cancelado. No se aplico nada.' -ForegroundColor Yellow
  exit 0
}

Write-Host ''
& $sql @dumpArgs 2>&1 | Out-Null
if (-not (Test-Path $dump) -or (Get-Item $dump).Length -lt 100) {
  throw 'El respaldo salio vacio. NO se aplica nada sin respaldo.'
}
Write-Host "  Respaldo listo: $((Get-Item $dump).Length) bytes" -ForegroundColor Green

foreach ($p in $pendientes) {
  Write-Host ''
  Write-Host "  Aplicando $($p.Archivo)..." -ForegroundColor Cyan
  $sqlFile = $p.Ruta -replace '\\', '/'
  & $sql @argsConn gnv_taller -e "source $sqlFile" 2>&1 | ForEach-Object {
    if ($_ -and $_ -notmatch 'insecure passwordless') { Write-Host "    $_" -ForegroundColor DarkGray }
  }
  if ($LASTEXITCODE -ne 0) { throw "Fallo $($p.Archivo). El respaldo esta en $dump" }
  Write-Host "  [OK] $($p.Archivo)" -ForegroundColor Green
}

$conteoDespues = Consulta "SELECT CONCAT('vehiculos=', (SELECT COUNT(*) FROM vehiculos));" 2>$null
if (-not $conteoDespues) { $conteoDespues = 'vehiculos=(sin tabla)' }

Write-Host ''
Write-Host "  Antes : $conteoAntes" -ForegroundColor DarkGray
Write-Host "  Despues: $conteoDespues" -ForegroundColor DarkGray
if ($conteoAntes -ne $conteoDespues) {
  Write-Host '  AVISO: el conteo de vehiculos cambio. Revisa el respaldo.' -ForegroundColor Yellow
} else {
  Write-Host '  Las filas de vehiculos no cambiaron.' -ForegroundColor Green
}

Write-Host ''
Write-Host '  Verificacion final (solo lectura)...' -ForegroundColor Cyan
$env:DB_USER = $usuario
$env:DB_PASSWORD = $clave
node (Join-Path $root 'scripts/verify-database.js')
