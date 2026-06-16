@echo off
cd /d "%~dp0"
set "HTTP_PORT=8008"
set "HTTPS_PORT=8443"
set "HAS_HTTPS=0"
if exist "%~dp0params.txt" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0params.txt") do (
    if /i "%%A"=="http_port" set "HTTP_PORT=%%B"
    if /i "%%A"=="https_port" set "HTTPS_PORT=%%B"
  )
)
if exist "%~dp0timer-key.pem" if exist "%~dp0timer-cert.pem" set "HAS_HTTPS=1"
if exist "%~dp0timer-cert.pfx" set "HAS_HTTPS=1"
set "NODE_EXE="
if exist "%~dp0runtime\win\node.exe" set "NODE_EXE=%~dp0runtime\win\node.exe"
if not defined NODE_EXE if exist "%~dp0runtime\win-x64\node.exe" set "NODE_EXE=%~dp0runtime\win-x64\node.exe"
if not defined NODE_EXE if exist "%~dp0runtime\node.exe" set "NODE_EXE=%~dp0runtime\node.exe"
if not defined NODE_EXE if exist "%~dp0node\win-x64\node.exe" set "NODE_EXE=%~dp0node\win-x64\node.exe"
if not defined NODE_EXE if exist "%~dp0node\node.exe" set "NODE_EXE=%~dp0node\node.exe"
if not defined NODE_EXE (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)
if not defined NODE_EXE (
  echo Node.js is not found.
  echo Put portable Node.js into runtime\win\node.exe or install Node.js LTS:
  echo https://nodejs.org/en/download
  echo.
  pause
  exit /b 1
)
echo Starting bouldering timer...
echo Using Node.js: %NODE_EXE%
echo.
echo Stopping previous timer server on ports %HTTP_PORT% and %HTTPS_PORT%...
powershell -NoProfile -Command "$ports=@(%HTTP_PORT%,%HTTPS_PORT%); $connections = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort }; $connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
timeout /t 1 /nobreak >nul
echo.
echo Local address:
echo   http://127.0.0.1:%HTTP_PORT%/
if "%HAS_HTTPS%"=="1" echo   https://127.0.0.1:%HTTPS_PORT%/
echo.
echo Network addresses for other devices:
powershell -NoProfile -Command "$port='%HTTP_PORT%'; Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | ForEach-Object { $ip=$_; $adapter=Get-NetAdapter -InterfaceIndex $ip.InterfaceIndex -ErrorAction SilentlyContinue; $alias=if($adapter){$adapter.Name}else{$ip.InterfaceAlias}; $desc=if($adapter){$adapter.InterfaceDescription}else{''}; $text=($alias + ' ' + $desc); $type='Network'; if($text -match 'Wi-?Fi|Wireless|WLAN|802\.11|Беспровод'){ $type='Wi-Fi' } elseif($text -match 'Ethernet|GbE|LAN|Realtek|Intel'){ $type='Ethernet' } elseif($text -match 'VirtualBox|VMware|Hyper-V|vEthernet|WSL|Docker|TAP|Loopback'){ $type='Virtual' }; '  [' + $type + ': ' + $alias + '] http://' + $ip.IPAddress + ':' + $port + '/' }"
if "%HAS_HTTPS%"=="1" (
  echo.
  echo HTTPS network addresses:
  powershell -NoProfile -Command "$port='%HTTPS_PORT%'; Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | ForEach-Object { $ip=$_; $adapter=Get-NetAdapter -InterfaceIndex $ip.InterfaceIndex -ErrorAction SilentlyContinue; $alias=if($adapter){$adapter.Name}else{$ip.InterfaceAlias}; $desc=if($adapter){$adapter.InterfaceDescription}else{''}; $text=($alias + ' ' + $desc); $type='Network'; if($text -match 'Wi-?Fi|Wireless|WLAN|802\.11|Беспровод'){ $type='Wi-Fi' } elseif($text -match 'Ethernet|GbE|LAN|Realtek|Intel'){ $type='Ethernet' } elseif($text -match 'VirtualBox|VMware|Hyper-V|vEthernet|WSL|Docker|TAP|Loopback'){ $type='Virtual' }; '  [' + $type + ': ' + $alias + '] https://' + $ip.IPAddress + ':' + $port + '/' }"
) else (
  echo.
  echo HTTPS is disabled. Run create-https-certificate.bat to create certificate files.
)
echo.
echo If another computer cannot open the timer, allow Node.js in Windows Firewall.
echo For HTTPS with the generated certificate, the browser may show a warning. Open Advanced and continue.
echo.
start "Bouldering Timer Server" /min "%NODE_EXE%" "%~dp0serve-bouldering-timer.js"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:%HTTP_PORT%/"
pause
