$ErrorActionPreference = "Stop"
$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptPath = Join-Path $projectPath "scripts\actualizar_notas.py"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "No se encontró Python. Instala Python 3.11 o posterior y vuelve a ejecutar este archivo."
}

$credentialsPath = Join-Path $projectPath "firebase-service-account.json"
if (-not $env:FIREBASE_SERVICE_ACCOUNT -and -not $env:FIREBASE_SERVICE_ACCOUNT_FILE) {
  if (-not (Test-Path -LiteralPath $credentialsPath)) {
    throw "Guarda la clave de la cuenta de servicio como firebase-service-account.json junto a este archivo."
  }
  $env:FIREBASE_SERVICE_ACCOUNT_FILE = $credentialsPath
}

Write-Host "Descargando el reporte de Aprende Talma y validando las notas..."
python -m pip install --quiet google-auth==2.40.3
python $scriptPath --sync-public
if ($LASTEXITCODE -ne 0) { throw "La sincronización no terminó correctamente." }
Write-Host "Notas sincronizadas con Firestore."
