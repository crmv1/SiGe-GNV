# ============================================================
#  scripts/crear-usuarios-3306.ps1
#  Crea gnv_app y gnv_admin en la BASE REAL (3306) y deja los
#  .env listos. NO hay que editar ningun archivo a mano.
#
#  Uso (desde la carpeta del proyecto):
#    .\scripts\crear-usuarios-3306.ps1
#
#  Lo UNICO que se teclea es la clave de root de MariaDB, en el
#  prompt de PowerShell. No se escribe en el chat, no se guarda en
#  ningun archivo y no queda en el historial.
#
#  ------------------------------------------------------------
#  QUE HACE Y QUE NO HACE
#  ------------------------------------------------------------
#  Hace:
#    - genera una clave fuerte para gnv_admin y la escribe sola en
#      .env.migraciones.local (que esta en .gitignore)
#    - reutiliza la clave de gnv_app que YA esta en .env, para no
#      obligar a nadie a inventarse una
#    - crea los dos usuarios con sus permisos
#    - prueba que los dos pueden conectarse
#
#  No hace:
#    - no borra ni modifica filas de datos
#    - no hace DROP ni TRUNCATE
#    - no toca la base de pruebas 3307
#    - no aplica migraciones (eso es migrar-3306.ps1 -Ejecutar)
# ============================================================

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root  = Split-Path -Parent $PSScriptRoot
$sql   = 'C:\Program Files\MariaDB 13.0\bin\mariadb.exe'
$puerto = 3306
$db     = 'gnv_taller'

if (-not (Test-Path $sql)) { throw "No se encontro mariadb.exe en $sql" }

# ------------------------------------------------------------
#  1. Clave de gnv_app: la que YA esta en .env
# ------------------------------------------------------------
$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) { throw 'Falta .env' }

$app = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^([A-Z_]+)=(.*)$') { $app[$Matches[1]] = $Matches[2] }
}
$claveApp = $app['DB_PASSWORD']
if (-not $claveApp -or $claveApp.Length -lt 8) {
  throw 'El .env no trae una DB_PASSWORD utilizable para gnv_app.'
}

# ------------------------------------------------------------
#  2. Clave de gnv_admin: generada aqui, al vuelo
#
#     Solo alfanumericos a proposito. Una clave con comillas,
#     backslash o backtick hay que escaparla en el SQL, en el
#     .env y en PowerShell; es la fuente clasica de "funciona en
#     la base pero no conecta la app". 32 caracteres de este
#     alfabeto ya son mas de 190 bits de entropia.
# ------------------------------------------------------------
$alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
$rnd = [System.Security.Cryptography.RandomNumberGenerator]::Create()
function Nueva-Clave([int]$largo) {
  $bytes = New-Object byte[] $largo
  $rnd.GetBytes($bytes)
  $sb = New-Object System.Text.StringBuilder
  foreach ($b in $bytes) { [void]$sb.Append($alfabeto[$b % $alfabeto.Length]) }
  return $sb.ToString()
}
$claveAdmin = Nueva-Clave 32

# ------------------------------------------------------------
#  3. Pedir la clave de root. Solo esto se teclea.
# ------------------------------------------------------------
Write-Host ''
Write-Host '  CREAR USUARIOS EN LA BASE REAL (3306)' -ForegroundColor Cyan
Write-Host '  --------------------------------------' -ForegroundColor Cyan
Write-Host '  Se necesita la clave de ROOT de MariaDB.' -ForegroundColor Yellow
Write-Host '  Tecleala en el prompt siguiente. No se guarda en ningun' -ForegroundColor DarkGray
Write-Host '  archivo, no se imprime y no queda en el historial.' -ForegroundColor DarkGray
Write-Host ''

$rootSec = Read-Host '  Clave de root de MariaDB (3306)' -AsSecureString
$rootPla = [System.Net.NetworkCredential]::new('', $rootSec).Password

# Probar ANTES de escribir nada: si root falla, no se creara
# ningun usuario a medias.
$env:MYSQL_PWD = $rootPla
$probe = & $sql --protocol=tcp -h 127.0.0.1 -P $puerto -u root -N -B -e "SELECT VERSION();" 2>&1
if ($LASTEXITCODE -ne 0) {
  Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
  Write-Host ''
  Write-Host '  [BLOQUEADO] La clave de root no es correcta.' -ForegroundColor Red
  Write-Host '  No se creo ningun usuario y no se toco nada.' -ForegroundColor DarkGray
  Write-Host "  MariaDB respondio: $probe" -ForegroundColor DarkGray
  exit 1
}
$version = $probe
Write-Host ''
Write-Host "  [OK] MariaDB $version" -ForegroundColor Green

# ------------------------------------------------------------
#  4. SQL de creacion
#
#     El archivo va a TEMP, nunca al repositorio: las claves no
#     deben acabar en una carpeta versionada. Se borra al final.
#
#     Idempotente. Ademas usa IF NOT EXISTS pero eso NO cambia la
#     clave de un usuario que ya exista con otra: para eso esta
#     el ALTER USER de mas abajo, que si la rota.
# ------------------------------------------------------------
$tmpSql = Join-Path $env:TEMP "gnv-crear-usuarios-3306.sql"
$sqlText = @"
CREATE USER IF NOT EXISTS 'gnv_app'@'localhost'   IDENTIFIED BY '$claveApp';
CREATE USER IF NOT EXISTS 'gnv_app'@'127.0.0.1'   IDENTIFIED BY '$claveApp';
GRANT SELECT, INSERT, UPDATE, DELETE ON $db.* TO 'gnv_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON $db.* TO 'gnv_app'@'127.0.0.1';

CREATE USER IF NOT EXISTS 'gnv_admin'@'localhost' IDENTIFIED BY '$claveAdmin';
CREATE USER IF NOT EXISTS 'gnv_admin'@'127.0.0.1' IDENTIFIED BY '$claveAdmin';
GRANT ALL PRIVILEGES ON $db.* TO 'gnv_admin'@'localhost';
GRANT ALL PRIVILEGES ON $db.* TO 'gnv_admin'@'127.0.0.1';

-- Si el usuario ya existia con otra clave, CREATE USER ... IF NOT
-- EXISTS la deja como estaba. El ALTER es lo que fija de verdad
-- la clave que vamos a usar, para que .env y MariaDB no se
-- queden peleando.
ALTER USER 'gnv_app'@'localhost'   IDENTIFIED BY '$claveApp';
ALTER USER 'gnv_app'@'127.0.0.1'   IDENTIFIED BY '$claveApp';
ALTER USER 'gnv_admin'@'localhost' IDENTIFIED BY '$claveAdmin';
ALTER USER 'gnv_admin'@'127.0.0.1' IDENTIFIED BY '$claveAdmin';

FLUSH PRIVILEGES;
"@
Set-Content -LiteralPath $tmpSql -Value $sqlText -Encoding UTF8

Write-Host '  Creando gnv_app y gnv_admin...' -ForegroundColor Cyan
$out = & $sql --protocol=tcp -h 127.0.0.1 -P $puerto -u root --default-character-set=utf8mb4 $db -e "source $($tmpSql -replace '\\','/')" 2>&1
$code = $LASTEXITCODE
Remove-Item -LiteralPath $tmpSql -Force -ErrorAction SilentlyContinue
Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue

if ($code -ne 0) {
  Write-Host ''
  Write-Host '  [ERROR] No se pudieron crear los usuarios.' -ForegroundColor Red
  $out | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  exit 1
}
Write-Host '  [OK] Usuarios creados y permisos asignados.' -ForegroundColor Green

# ------------------------------------------------------------
#  5. Escribir .env.migraciones.local con la clave de gnv_admin
#     (esta en .gitignore por la regla .env.*.local)
# ------------------------------------------------------------
$migFile = Join-Path $root '.env.migraciones.local'
$mig = @"
# Generado por scripts/crear-usuarios-3306.ps1
# Usuario con permisos de DDL. La aplicacion NO lo usa.
DB_USER=gnv_admin
DB_PASSWORD=$claveAdmin
"@
Set-Content -LiteralPath $migFile -Value $mig -Encoding UTF8
Write-Host '  [OK] .env.migraciones.local escrito con gnv_admin.' -ForegroundColor Green
Write-Host "       DB_USER=gnv_app ya estaba en .env (clave de $($claveApp.Length) caracteres reutilizada)." -ForegroundColor DarkGray

# ------------------------------------------------------------
#  6. Probar los DOS usuarios con sus permisos
# ------------------------------------------------------------
function Probar([string]$usuario, [string]$clave) {
  $env:MYSQL_PWD = $clave
  $r = & $sql --protocol=tcp -h 127.0.0.1 -P $puerto -u $usuario -N -B $db -e "SELECT 1;" 2>&1
  $ok = ($LASTEXITCODE -eq 0)
  Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
  return $ok
}

Write-Host ''
Write-Host '  PRUEBA DE CONEXION' -ForegroundColor Cyan
$okApp   = Probar 'gnv_app'   $claveApp
$okAdmin = Probar 'gnv_admin' $claveAdmin
if ($okApp)   { Write-Host '    [OK] gnv_app   conecta' } else { Write-Host '    [FALLO] gnv_app no conecta' }
if ($okAdmin) { Write-Host '    [OK] gnv_admin conecta' } else { Write-Host '    [FALLO] gnv_admin no conecta' }

if (-not ($okApp -and $okAdmin)) {
  Write-Host ''
  Write-Host '  Los usuarios se crearon pero no se pueden conectar.' -ForegroundColor Red
  Write-Host '  No sigas: habria que revisar los permisos a mano.' -ForegroundColor DarkGray
  exit 1
}

Write-Host ''
Write-Host '  LISTO. Siguiente paso (lo corre el asistente):' -ForegroundColor Green
Write-Host '    .\scripts\migrar-3306.ps1 -Ejecutar' -ForegroundColor White
Write-Host ''
exit 0
