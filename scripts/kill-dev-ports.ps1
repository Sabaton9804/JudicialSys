# Libera puertos típicos de JudicialSys (Next 3000, puente Justicia XXI 3847).
$ports = 3000, 3847
foreach ($port in $ports) {
  Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
      Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
      Write-Host "Puerto $port : proceso $_ detenido."
    }
}
Write-Host "Listo. Ejecute: npm run dev"
