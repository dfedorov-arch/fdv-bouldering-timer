@echo off
setlocal
cd /d "%~dp0"
echo FDV Bouldering Timer - Windows 7/8 Legacy
echo Node.js 12 is end-of-life. Use only on a trusted isolated LAN.
echo This console must stay open while the server is running. Ctrl+C stops it.
echo Open the HTTP address printed below in your browser.
echo.
"%~dp0runtime\win\node.exe" "%~dp0serve-bouldering-timer.js"
if errorlevel 1 (
  echo.
  echo Server failed. See the error above. Check that the configured ports are free.
  pause
)
