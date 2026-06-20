@echo off
setlocal
cd /d "%~dp0"

echo Creating local HTTPS certificate for bouldering timer...
echo.

where openssl >nul 2>nul
if not errorlevel 1 goto create_pem

echo OpenSSL was not found.
echo Trying native Windows certificate creation instead...
echo.
goto create_pfx

:create_pem
set "CONFIG_FILE=%TEMP%\btimer-openssl-%RANDOM%-%RANDOM%.cnf"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $dns=@('localhost',$env:COMPUTERNAME) | Where-Object { $_ } | Select-Object -Unique; $ips=Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -ExpandProperty IPAddress -Unique; $lines=@('[req]','distinguished_name=req_distinguished_name','x509_extensions=v3_req','prompt=no','','[req_distinguished_name]','CN=Bouldering Timer','','[v3_req]','keyUsage=critical,digitalSignature,keyEncipherment','extendedKeyUsage=serverAuth','subjectAltName=@alt_names','','[alt_names]'); $i=1; foreach($name in $dns){ $lines += ('DNS.' + $i + '=' + $name); $i++ }; $i=1; foreach($ip in $ips){ $lines += ('IP.' + $i + '=' + $ip); $i++ }; Set-Content -LiteralPath '%CONFIG_FILE%' -Encoding ascii -Value $lines; Write-Host 'Certificate names:'; $dns | ForEach-Object { Write-Host ('  ' + $_) }; $ips | ForEach-Object { Write-Host ('  ' + $_) }"
if errorlevel 1 (
  if exist "%CONFIG_FILE%" del "%CONFIG_FILE%"
  echo Failed to create OpenSSL config.
  pause
  exit /b 1
)

openssl req -x509 -newkey rsa:2048 -nodes -days 1825 -keyout "%~dp0timer-key.pem" -out "%~dp0timer-cert.pem" -config "%CONFIG_FILE%" >nul 2>nul
set "OPENSSL_EXIT=%ERRORLEVEL%"

if exist "%CONFIG_FILE%" del "%CONFIG_FILE%"

if not "%OPENSSL_EXIT%"=="0" (
  echo Failed to create PEM HTTPS certificate.
  echo Trying native Windows certificate creation instead...
  echo.
  goto create_pfx
)

echo.
echo Created timer-key.pem and timer-cert.pem
echo Done. Restart start-timer-win.bat after this.
pause
exit /b 0

:create_pfx
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $dnsNames = @('localhost', $env:COMPUTERNAME) | Where-Object { $_ }; $ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -ExpandProperty IPAddress; $san = (($dnsNames | ForEach-Object { 'DNS=' + $_ }) + ($ips | ForEach-Object { 'IPAddress=' + $_ })) -join '&'; $cert = New-SelfSignedCertificate -Subject 'CN=Bouldering Timer' -TextExtension @('2.5.29.17={text}' + $san) -CertStoreLocation 'Cert:\CurrentUser\My' -FriendlyName 'Bouldering Timer Local HTTPS' -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(5); $pwd = ConvertTo-SecureString 'bouldering-timer' -AsPlainText -Force; Export-PfxCertificate -Cert $cert -FilePath '.\timer-cert.pfx' -Password $pwd -Force | Out-Null; Remove-Item ('Cert:\CurrentUser\My\' + $cert.Thumbprint); Write-Host 'Created timer-cert.pfx'; Write-Host ('Certificate names: ' + $san)"
if errorlevel 1 (
  echo Failed to create HTTPS certificate.
  echo.
  pause
  exit /b 1
)

echo.
echo Created timer-cert.pfx using native Windows tools.
echo Done. Restart start-timer-win.bat after this.
pause
