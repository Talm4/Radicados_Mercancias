$ErrorActionPreference = "Stop"
$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$credentialsPath = Join-Path $projectPath "firebase-service-account.json"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "No se encontró Python. Instala Python 3.11 o posterior."
}

if (Test-Path -LiteralPath $credentialsPath) {
  $env:FIREBASE_SERVICE_ACCOUNT_FILE = $credentialsPath
  python -m pip install --quiet google-auth==2.40.3
} else {
  Write-Warning "El reporte se descargará y validará, pero las notas no podrán escribirse en Firestore hasta agregar firebase-service-account.json."
}

Write-Host "Iniciando Talma. La descarga se repetirá automáticamente cada hora."
python (Join-Path $projectPath "servidor.py") --port 4173 --interval 3600
