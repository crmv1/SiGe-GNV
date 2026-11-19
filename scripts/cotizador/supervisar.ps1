$ErrorActionPreference = 'Stop'
$task = 'SIGE-GNV-Dataset'
$root = Join-Path $env:LOCALAPPDATA 'SIGE-GNV-Dataset'
if (!(Test-Path -LiteralPath $root)) { exit 1 }
$statePath = Join-Path $root 'estado-ciclo.json'
$state = if (Test-Path -LiteralPath $statePath) { [IO.File]::ReadAllText($statePath) | ConvertFrom-Json }
$scheduled = Get-ScheduledTask -TaskName $task
$age = if ($state) { [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - $state.actualizado } else { 0 }
if ($scheduled.State -eq 'Running' -and $state -and $age -gt 420 -and $state.hijo) {
  $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($state.pid)"
  $child = Get-CimInstance Win32_Process -Filter "ProcessId=$($state.hijo)"
  if ($parent.CommandLine -like '*scripts\cotizador\ciclo.py*' -and $child.ParentProcessId -eq $parent.ProcessId -and $child.CommandLine -like '*scripts\cotizador\*.py*') {
    Stop-Process -Id $child.ProcessId
  }
}
if ($scheduled.State -eq 'Ready' -and (!$state -or ($age -gt 420 -and $state.etapa -notin @('terminado','sin manifiestos')))) {
  Start-ScheduledTask -TaskName $task
}
