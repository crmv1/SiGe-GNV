# ============================================================
#  levantar-todo.ps1 — SIGE-GNV VC GAS
#  Levanta TODOS los servicios en SEGUNDO PLANO:
#    MariaDB 3307, API 3100, Web 5173, Expo 8081, WhatsApp 21465
#  Cada uno con su log. No toca la base REAL (3306).
#
#  Uso:
#    .\scripts\levantar-todo.ps1          # levantar todo
#    .\scripts\levantar-todo.ps1 -Apagar  # apagar todo
# ============================================================

param([switch]$Apagar)

$ErrorActionPreference = 'Stop'
$root    = Split-Path -Parent $PSScriptRoot
$logs    = Join-Path $env:TEMP 'opencode\sige-gnv-logs'
$pidsDir = Join-Path $env:TEMP 'opencode\sige-gnv-pids'
$gnvi    = Join-Path $env:TEMP 'opencode\gnvidem'
$mariadb = 'C:\Program Files\MariaDB 13.0\bin\mariadbd.exe'
$mariadbCli = 'C:\Program Files\MariaDB 13.0\bin\mariadb.exe'

New-Item -ItemType Directory -Force -Path $logs, $pidsDir | Out-Null

function Log($msg) { Write-Host "[$(Get-Date -Format HH:mm:ss)] $msg" -ForegroundColor Cyan }

function Test-Port($port) {
  $conn = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port }
  return [bool]$conn
}

function Save-Pid($name, $procId) {
  Set-Content (Join-Path $pidsDir "$name.pid") $procId
}
function Get-SavedPid($name) {
  $f = Join-Path $pidsDir "$name.pid"
  if (Test-Path $f) { return [int](Get-Content $f) }
  return $null
}

function Stop-Saved($name) {
  $id = Get-SavedPid $name
  if ($id) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $pidsDir "$name.pid") -Force -ErrorAction SilentlyContinue
    Log "Detenido $name (PID $id)"
  }
}

if ($Apagar) {
  Log 'Apagando todos los servicios...'
  foreach ($n in 'whatsapp','expo','web','api','mariadb') { Stop-Saved $n }
  # Expo/Web/npm dejan hijos; matar por puerto si quedaron
  foreach ($p in 21465,8081,5173,3100,3307) {
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.LocalPort -eq $p } |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
  Log 'Listo. (La MariaDB del servicio 3306 REAL no se toca.)'
  exit 0
}

# ------------------------------------------------------------
# 0) my.ini de la instancia portatil 3307
# ------------------------------------------------------------
if (-not (Test-Path $gnvi)) { New-Item -ItemType Directory -Force -Path $gnvi | Out-Null }
$myini = Join-Path $gnvi 'my.ini'
@"
[mysqld]
port=3307
bind-address=127.0.0.1
basedir=C:\Program Files\MariaDB 13.0
datadir=$gnvi\data
tmpdir=$gnvi
log-error=$gnvi\error.log
innodb_buffer_pool_size=256M
max_connections=100
character-set-server=utf8mb4
collation-server=utf8mb4_general_ci

[client]
port=3307
host=127.0.0.1
"@ | Set-Content -Path $myini -Encoding ASCII

# ------------------------------------------------------------
# 1) MariaDB 3307
# ------------------------------------------------------------
if (Test-Port 3307) {
  Log 'MariaDB 3307 ya estaba corriendo. OK.'
} else {
  Log 'Levantando MariaDB 3307...'
  $p = Start-Process $mariadb -ArgumentList "--defaults-file=`"$myini`"" -PassThru -WindowStyle Hidden
  Save-Pid 'mariadb' $p.Id
  Start-Sleep -Seconds 6
}

for ($i=0; $i -lt 15; $i++) {
  if (Test-Port 3307) { break }
  Start-Sleep -Seconds 1
}
if (-not (Test-Port 3307)) { throw 'MariaDB 3307 no levanto. Revisar error.log en gnvidem.' }
& $mariadbCli --protocol=tcp -h 127.0.0.1 -P 3307 -u gnv -pgnvtest gnv_taller -e "SELECT 1;" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'MariaDB 3307 escucha pero el login gnv/gnvtest fallo.' }
Log 'MariaDB 3307 OK (login gnv/gnvtest).'

# ------------------------------------------------------------
# 2) API 3100 contra 3307
# ------------------------------------------------------------
if (Test-Port 3100) {
  Log 'API 3100 ya estaba corriendo. OK.'
} else {
  Log 'Levantando API 3100 (contra 3307)...'
  $apiLog = Join-Path $logs 'api.log'
  $envScript = @'
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='3307'
$env:DB_USER='gnv'
$env:DB_PASSWORD='gnvtest'
$env:DB_NAME='gnv_taller'
$env:PORT='3100'
Set-Location C:\Users\camii\Music\Proyecto
node src/server.js *>> LOGFILE
'@ -replace 'LOGFILE', $apiLog
  $ps1 = Join-Path $logs 'start-api.ps1'
  Set-Content -Path $ps1 -Value $envScript -Encoding UTF8
  $p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',$ps1 -PassThru -WindowStyle Hidden
  Save-Pid 'api' $p.Id
  Start-Sleep -Seconds 5
}
for ($i=0; $i -lt 20; $i++) {
  try {
    $h = Invoke-RestMethod http://localhost:3100/api/health -TimeoutSec 2
    if ($h.status -eq 'ok') { break }
  } catch { Start-Sleep -Seconds 1 }
}
try {
  $h = Invoke-RestMethod http://localhost:3100/api/health -TimeoutSec 3
  Log "API OK: $($h | ConvertTo-Json -Compress)"
} catch { throw 'La API no responde en /api/health. Revisar api.log.' }

# ------------------------------------------------------------
# 3) Web 5173
# ------------------------------------------------------------
if (Test-Port 5173) {
  Log 'Web 5173 ya estaba corrienda. OK.'
} else {
  Log 'Levantando Web (Vite) 5173...'
  $webLog = Join-Path $logs 'web.log'
  $ps1 = Join-Path $logs 'start-web.ps1'
  @"
Set-Location C:\Users\camii\Music\Proyecto\frontend
npm run dev *>> $webLog
"@ | Set-Content -Path $ps1 -Encoding UTF8
  $p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',$ps1 -PassThru -WindowStyle Hidden
  Save-Pid 'web' $p.Id
  Start-Sleep -Seconds 6
}
for ($i=0; $i -lt 20; $i++) {
  if (Test-Port 5173) { break }
  Start-Sleep -Seconds 1
}
if (-not (Test-Port 5173)) { throw 'Vite no levanto el puerto 5173. Revisar web.log.' }
Log 'Web OK en http://localhost:5173'

# ------------------------------------------------------------
# 4) Expo / Movil 8081
# ------------------------------------------------------------
$mobileEnv = 'C:\Users\camii\Music\Proyecto\mobile\.env'
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1 -ExpandProperty IPAddress)
@"
# Variables publicas de la app (generado para pruebas en dispositivo fisico).
# La IP debe ser la del PC en la misma red wifi que el celular.
# OJO: se regenera al cambiar de red. Verificar con `ipconfig`.
EXPO_PUBLIC_API_URL=http://${ip}:3100/api
EXPO_PUBLIC_USE_MOCK_DATA=false
"@ | Set-Content -Path $mobileEnv -Encoding UTF8
Log "mobile/.env apunta a http://${ip}:3100/api"

if (Test-Port 8081) {
  Log 'Expo 8081 ya estaba corriendo. OK.'
} else {
  Log 'Levantando Expo (movil) 8081...'
  $expoLog = Join-Path $logs 'expo.log'
  $ps1 = Join-Path $logs 'start-expo.ps1'
  @"
Set-Location C:\Users\camii\Music\Proyecto\mobile
npx expo start *>> $expoLog
"@ | Set-Content -Path $ps1 -Encoding UTF8
  $p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',$ps1 -PassThru -WindowStyle Hidden
  Save-Pid 'expo' $p.Id
  Start-Sleep -Seconds 8
}
for ($i=0; $i -lt 25; $i++) {
  try {
    $s = Invoke-WebRequest http://localhost:8081/status -TimeoutSec 2 -UseBasicParsing
    if ($s.Content -match 'running') { break }
  } catch { Start-Sleep -Seconds 2 }
}
Log 'Expo (movil) OK en http://localhost:8081'

# ------------------------------------------------------------
# 5) WhatsApp 21465
# ------------------------------------------------------------
if (Test-Port 21465) {
  Log 'WhatsApp 21465 ya estaba corriendo. OK.'
} else {
  Log 'Levantando WhatsApp (WPConnect) 21465...'
  $wppLog = Join-Path $logs 'whatsapp.log'
  $ps1 = Join-Path $logs 'start-whatsapp.ps1'
  @"
Set-Location C:\Users\camii\Music\Proyecto\whatsapp
npm start *>> $wppLog
"@ | Set-Content -Path $ps1 -Encoding UTF8
  $p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',$ps1 -PassThru -WindowStyle Hidden
  Save-Pid 'whatsapp' $p.Id
  Start-Sleep -Seconds 8
}
for ($i=0; $i -lt 20; $i++) {
  if (Test-Port 21465) { break }
  Start-Sleep -Seconds 2
}
if (Test-Port 21465) {
  Log 'WhatsApp OK en http://localhost:21465'
} else {
  Log 'WhatsApp no abrio puerto aun. Revisar whatsapp.log (puede pedir QR).'
}

# ------------------------------------------------------------
# Resumen
# ------------------------------------------------------------
Write-Host ''
Write-Host '============================================' -ForegroundColor Green
Write-Host ' SERVICIOS LEVANTADOS' -ForegroundColor Green
Write-Host '============================================' -ForegroundColor Green
Write-Host " MariaDB pruebas  : 3307"
Write-Host " API backend      : http://localhost:3100/api"
Write-Host " Web (Vite)       : http://localhost:5173"
Write-Host " Movil (Expo)     : http://localhost:8081  (IP PC: $ip)"
Write-Host " WhatsApp         : 21465"
Write-Host ''
Write-Host " Logs : $logs"
Write-Host " Apagar: .\scripts\levantar-todo.ps1 -Apagar"
Write-Host '============================================' -ForegroundColor Green
