# Levanta SQL Server local (docker run). Intenta abrir Docker Desktop si el motor no responde.
$dockerCandidates = @(
  "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
  'docker'
)
$docker = $dockerCandidates | Where-Object { $_ -eq 'docker' -or (Test-Path $_) } | Select-Object -First 1
if (-not $docker) {
  Write-Host 'No se encontro docker.exe. Instale Docker Desktop.'
  exit 1
}

function Test-DockerDaemon {
  param([string]$Exe)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  $null = & $Exe version 2>&1
  $ok = $?
  $ErrorActionPreference = $prev
  return $ok
}

Write-Host 'Comprobando motor Docker...'
if (-not (Test-DockerDaemon $docker)) {
  $dd = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dd) {
    Write-Host 'Arrancando Docker Desktop (espere 1-3 min la primera vez)...'
    Start-Process -FilePath $dd
  } else {
    Write-Host 'Abra Docker Desktop desde el menu Inicio y vuelva a ejecutar:'
    Write-Host '  npm run justicia-xxi:local:up'
    exit 1
  }

  $listo = $false
  for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Seconds 2
    if (Test-DockerDaemon $docker) {
      $listo = $true
      Write-Host "Docker listo (aprox. $($i * 2) s)."
      break
    }
    if ($i % 10 -eq 9) { Write-Host '... esperando motor Docker' }
  }
  if (-not $listo) {
    Write-Host 'Timeout: abra Docker Desktop, confirme que no pide actualizar WSL/Hyper-V, y ejecute de nuevo:'
    Write-Host '  npm run justicia-xxi:local:up'
    exit 1
  }
}

$volume = 'judicialsys_sql_justicia_local'
$name = 'judicialsys-justicia-xxi-local'
$ErrorActionPreference = 'Continue'
& $docker volume create $volume 2>$null | Out-Null
& $docker rm -f $name 2>$null | Out-Null

Write-Host 'Descargando/iniciando SQL Server (la primera vez descarga la imagen)...'
& $docker run -d `
  --name $name `
  -e 'ACCEPT_EULA=Y' `
  -e 'MSSQL_SA_PASSWORD=LocalDev9!Judicial' `
  -p 14333:1433 `
  -v "${volume}:/var/opt/mssql" `
  'mcr.microsoft.com/mssql/server:2022-latest'

if (-not $?) {
  Write-Host 'Fallo docker run. Revise el mensaje arriba.'
  exit 1
}
Write-Host 'Contenedor iniciado. SQL escucha en su PC: 127.0.0.1 puerto 14333'
Write-Host 'Siguiente: npm run justicia-xxi:local:init'
