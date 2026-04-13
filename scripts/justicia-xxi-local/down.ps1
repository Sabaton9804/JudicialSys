$ErrorActionPreference = 'Continue'
$docker = if (Test-Path "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe") {
  "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe"
} else { 'docker' }
& $docker rm -f judicialsys-justicia-xxi-local 2>$null
Write-Host 'Contenedor judicialsys-justicia-xxi-local detenido y eliminado (el volumen con datos se conserva).'
