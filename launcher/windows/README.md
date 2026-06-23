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


==========================================================================

# Лаунчер для Windows

`fdv-bouldering-timer.exe` — это небольшой нативный лаунчер для Windows.
Он читает `params.txt`, использует portable или системный Node.js, показывает
локальные сетевые адреса, открывает таймер и предоставляет команды перезапуска
и остановки.

Сборка выполняется в Windows с помощью компилятора .NET Framework, входящего
в состав Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File launcher\windows\build-launcher.ps1
```

Сгенерированный исполняемый файл записывается в `dist\windows-launcher`.
GitHub Actions собирает его автоматически и включает в portable-релиз для
Windows. Лаунчер должен находиться рядом с `serve-bouldering-timer.js`,
`params.txt` и остальными файлами таймера. `start-timer-win.bat` остаётся
резервным способом запуска.
