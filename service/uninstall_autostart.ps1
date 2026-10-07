# Remove the background auto-start of the taxi platform
Unregister-ScheduledTask -TaskName "TaxiPlatform" -Confirm:$false -ErrorAction SilentlyContinue
foreach ($port in 5000, 3600) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='pythonw.exe'" | Where-Object { $_.CommandLine -like "*taxi_supervisor*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host "Auto-start removed and platform stopped." -ForegroundColor Green
