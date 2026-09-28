python -m pip install -r requirements.txt
python -m PyInstaller `
  --noconfirm `
  --onefile `
  --windowed `
  --name "WB_Supply_Calculator" `
  --add-data "index.html;." `
  --add-data "app.js;." `
  --add-data "styles.css;." `
  server.py

Write-Host ""
Write-Host "Done. EXE: .\dist\WB_Supply_Calculator.exe"
