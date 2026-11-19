$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$data = Join-Path $env:LOCALAPPDATA 'SIGE-GNV-Web-Local'
$dbPassword = Join-Path $data 'db-password.local'
$dbConfig = Join-Path $data 'db/my.ini'
if (!(Test-Path -LiteralPath $dbConfig) -or !(Test-Path -LiteralPath $dbPassword)) {
    throw 'Falta la instalación de pruebas SIGE-GNV-Web-Local. Consulta docs/COTIZADOR_ESTADO_ACTUAL.md.'
}

function IsListening($port) {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

$maria = 'C:/Program Files/MariaDB 13.0/bin/mariadbd.exe'
if (!(IsListening 3317)) {
    $argsDb = '--defaults-file="{0}" --port=3317 --bind-address=127.0.0.1 --log-error="{1}/mariadb.log"' -f $dbConfig,$data
    Start-Process $maria -ArgumentList $argsDb -WindowStyle Hidden
}

$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '3317'
$env:DB_NAME = 'gnv_taller'
$env:DB_USER = 'gnv'
$env:DB_PASSWORD = Get-Content -LiteralPath $dbPassword -Raw
$env:DB_SSL = 'false'
$env:API_BIND_HOST = '127.0.0.1'
$env:PORT = '3100'
$env:CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
$env:VITE_API_URL = 'http://127.0.0.1:3100'
$node = (Get-Command node.exe).Source
for ($i=0; $i -lt 20 -and !(IsListening 3317); $i++) { Start-Sleep -Seconds 1 }
if (!(IsListening 3317)) { throw 'MariaDB local no responde. Revisa mariadb.log.' }

if (!(IsListening 3100)) {
    Start-Process $node -ArgumentList 'src/server.js' -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput "$data/api.log" -RedirectStandardError "$data/api.err"
}

for ($i=0; $i -lt 20 -and !(IsListening 3100); $i++) { Start-Sleep -Seconds 1 }
$health = Invoke-WebRequest 'http://127.0.0.1:3100/api/health' -UseBasicParsing -TimeoutSec 5
if ($health.Headers['X-DB-Puerto'] -ne '3317' -or ($health.Content | ConvertFrom-Json).database -ne 'connected') {
    throw 'La API del puerto 3100 no corresponde a la base local de demostración.'
}

if (!(IsListening 5173)) {
    Start-Process $node -ArgumentList 'node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort' -WorkingDirectory (Join-Path $repo 'frontend') -WindowStyle Hidden -RedirectStandardOutput "$data/web.log" -RedirectStandardError "$data/web.err"
}

for ($i=0; $i -lt 20 -and !(IsListening 5173); $i++) { Start-Sleep -Seconds 1 }
if (!(IsListening 5173)) { throw 'El frontend no responde. Revisa web.err.' }
Write-Output 'Web: http://127.0.0.1:5173/ | API: http://127.0.0.1:3100/api/health'
