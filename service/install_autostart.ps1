# Taxi platform - auto start at Windows boot (runs hidden in background)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$sup  = Join-Path $root "service\taxi_supervisor.py"
$taskName = "TaxiPlatform"

Write-Host "=== Taxi platform: background auto-start setup ===" -ForegroundColor Cyan
Write-Host "Folder: $root"

# 1) pythonw.exe (python without window)
$pyw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $pyw) {
  $py = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
  if ($py) { $pyw = Join-Path (Split-Path $py) "pythonw.exe" }
}
if (-not $pyw -or -not (Test-Path $pyw)) { throw "pythonw.exe not found - is Python installed?" }
Write-Host "Python: $pyw"

# 2) stop old manual windows / processes on the platform ports
foreach ($port in 5000, 3600, 3000) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 3) scheduled task: at startup (+ every 5 min watchdog + at logon)
$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute $pyw -Argument "`"$sup`"" -WorkingDirectory $root
$t1 = New-ScheduledTaskTrigger -AtStartup
$t1.Delay = "PT40S"
$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$t3 = New-ScheduledTaskTrigger -AtLogOn -User $user
$set = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew `
        -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

Write-Host ""
Write-Host "Enter the Windows PASSWORD of $user" -ForegroundColor Yellow
Write-Host "(needed so the platform starts even before anyone logs in; PIN is NOT accepted)"
$sec = Read-Host -AsSecureString "Password"
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))

$mode = "before login (at boot)"
try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $t1,$t2,$t3 -Settings $set `
    -User $user -Password $plain -RunLevel Highest -Force | Out-Null
} catch {
  Write-Host "Password not accepted -> installing in 'at logon' mode instead." -ForegroundColor Yellow
  $p = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $t2,$t3 -Settings $set -Principal $p -Force | Out-Null
  $mode = "after login"
}
$plain = $null

# 4) never sleep / hibernate on AC power (so the server stays reachable)
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null

# 5) start now
Start-ScheduledTask -TaskName $taskName
Write-Host ""
Write-Host "DONE. The platform now runs hidden in the background ($mode)." -ForegroundColor Green
Write-Host "It restarts automatically if any part stops, and after every reboot."
Write-Host "Local link : http://localhost:3600"
Write-Host "Public link: see $root\current-url.txt (ready in ~30 s)"
Write-Host "Logs       : $root\logs\"
