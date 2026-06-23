# Windows launcher

`fdv-bouldering-timer.exe` is a small native Windows launcher for the timer.
It reads `params.txt`, uses portable or system Node.js, displays local network
addresses, opens the timer, and provides restart and stop commands.

Build it on Windows with the .NET Framework compiler included in Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher\windows\build-launcher.ps1
```

The generated executable is written to `dist\windows-launcher`. GitHub Actions
builds it automatically and includes it in the Windows portable release. The
launcher must remain next to `serve-bouldering-timer.js`, `params.txt`, and the
other timer files. `start-timer-win.bat` remains the fallback launcher.
