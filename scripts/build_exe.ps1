# ============================================================
#  WB Supply Planner — сборка десктопного EXE (Windows)
# ------------------------------------------------------------
#  Запуск:  powershell -ExecutionPolicy Bypass -File scripts\build_exe.ps1
#  Результат: dist\WB_Supply_Calculator.exe
# ============================================================

$ErrorActionPreference = "Stop"

# Корень проекта = папка на уровень выше scripts/
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "==> Установка зависимостей" -ForegroundColor Cyan
python -m pip install -r requirements.txt

Write-Host "==> Сборка EXE" -ForegroundColor Cyan
python -m PyInstaller `
  --noconfirm `
  --onefile `
  --windowed `
  --name "WB_Supply_Calculator" `
  --distpath "$Root\dist" `
  --workpath "$Root\build" `
  --specpath "$Root\build" `
  --add-data "$Root\web;web" `
  "$Root\server\server.py"

Write-Host ""
Write-Host "Готово. EXE: $Root\dist\WB_Supply_Calculator.exe" -ForegroundColor Green
Write-Host "База данных будет создана в папке data\ рядом с EXE." -ForegroundColor DarkGray
