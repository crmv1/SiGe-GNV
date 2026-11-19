# ============================================================
#  scripts/con-3307.ps1
#  Corre un comando Node contra la instancia de PRUEBAS (3307).
#
#  Uso:
#    .\scripts\con-3307.ps1 scripts\test-database.js
#    .\scripts\con-3307.ps1 scripts\validacion-final.js
#
#  Solo developimiento. .env sigue apuntando a la base REAL
#  (localhost:3306). Este script sobrescribe las variables en el
#  proceso, y dotenv NO pisa las que ya existen, asi que el .env
#  no se toca.
# ============================================================

$env:DB_HOST     = '127.0.0.1'
$env:DB_PORT     = '3307'
$env:DB_USER     = 'gnv'
$env:DB_PASSWORD = 'gnvtest'
$env:DB_NAME     = 'gnv_taller'

& node $args
exit $LASTEXITCODE
