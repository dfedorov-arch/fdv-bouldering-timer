# Windows launcher

## Language / Язык

The top-right EN / RU button switches the native launcher, current status,
address labels, tray commands/notifications and subsequent certificate dialogs
immediately, without stopping/starting Node.js. From build420 it also sets the
common server timer language, as the primary browser does; displays update over
the existing SSE/replication path. It does not change timer timing or audio settings.
`LauncherLanguage.cs` stores only `ru` / `en` in
`%LOCALAPPDATA%\FDV Bouldering Timer\launcher-language.txt`. Missing/invalid
preferences use Russian regardless of the Windows UI language. An existing
valid English or Russian choice is preserved. A write failure
does not undo the current selection; it adds a localized log warning. Params.txt
is untouched. Launcher-generated messages follow the
current choice; historical lines and raw Node.js output remain untouched.

Кнопка EN / RU меняет язык без перезапуска сервера. Выбор запоминается для
пользователя Windows, включая portable-сборку и Win7/Win8. Язык таймера на всех
экранах также меняется. Технические сообщения ОС/Node.js остаются на исходном языке.

The command is an asynchronous language-only POST to loopback using a random
per-child-process capability passed only in the child environment, never in
URLs/files/browser state/logs. Requests with browser Origin/Referer/fetch-site
headers, non-loopback requests, wrong tokens and extra body fields are denied.
It does not register/impersonate a browser or disable PIN checks. Following
servers forward only this command through the authenticated Secondary channel;
fenced/rejoining servers reject it. Startup readiness sends the chosen language
before optional automatic browser opening. A pre-ready choice is deferred;
there is no periodic language polling/retry. In-flight requests are serialized,
bound to the tracked process and invalidated on restart. Failure logs a warning;
browser opening still proceeds if originally requested. Browser language changes
do not poll/synchronize back into the launcher; the last explicit control wins.

With `FDV_TEST_WINDOWS_CERTIFICATES=1`, `test/windows-launcher.test.js` builds
and renders the actual form in a passive off-screen mode, clicks its language
button, checks both locales/tray/current status/preference reload/address
selection and unchanged logs/params/readiness/timers/process. The optional CLR2
build uses the same harness. These are not physical Win7/Win8 screenshots.

## HTTPS certificate / HTTPS-сертификат

The **Create HTTPS certificate** button (also in the tray menu) opens an editable
list of local IP addresses and the computer name. Add the DNS names/devices'
actual server addresses, remove unused entries, then create the certificate.
The same native Windows CryptoAPI implementation works in the modern and CLR2
builds, without OpenSSL or PowerShell. It generates RSA2048/SHA256, SAN DNS/IP,
serverAuth, CA:false and a 365-day lifetime. Native signing is delegated to
Windows, not implemented in application code.

Replacement asks first (default No), retaining backups of managed files.
Restart asks separately (default No): generation never restarts the server,
replaces its in-memory TLS context, or changes timer/audio clocks. Links refresh
after the explicitly requested restart. A self-signed certificate does not
become trusted automatically; configure browser/device trust explicitly, and
Node.js trust on **both** servers for a Secondary pair. DNS/firewall settings
are not changed. Renewal/IP changes require generation and trust setup again.

MSI (`fdv-installed.marker`) uses `%LOCALAPPDATA%\FDV Bouldering Timer\https`;
portable uses `<root>\https`, falling back to the same per-user location if the
dedicated directory cannot be secured/written. An existing active portable PFX
is never falsely “replaced” by a lower-priority fallback. Directory/files/backups
are restricted to the current user and SYSTEM. FAT/exFAT portable media may
therefore use the user fallback. Keep the launcher and Node under the same user.
Older .NET may report unsupported ACLs as InvalidOperationException with
"unexpected error code 1", or NotSupportedException. Directory preparation
handles these like write-denied errors and retries only in the protected user
directory. Failure there still aborts; an active portable PFX is not shadowed,
and cryptographic exceptions never trigger a storage fallback. The native test
harness injects these filesystem errors (including CLR2), not an emulated Win7.
Share only `timer-public.cer` for trust configuration, **never** `timer-cert.pfx`:
the latter contains an exportable private key with the application's compatibility
password, which is not a substitute for file access protection. Temporary key
containers are removed after export. No trust store is modified.

`lib/https-certificate-storage.js` mirrors these paths at server startup.
A managed PFX takes priority; without one, existing root PEM/PFX behavior remains.
The entire `https` subtree is blocked by the static HTTP server, including backups.
Use the original platform scripts only for legacy root certificates; they do not
replace a managed PFX. Modern BAT generation remains omitted from Legacy ZIPs.

**Русский:** кнопка «Создать HTTPS-сертификат» доступна и в Win7/Win8. Проверьте
адреса, создайте сертификат и отдельно подтвердите перезапуск, когда он допустим.
Ответ «Нет» не прерывает текущую работу. «Открыть каталог» показывает созданные
файлы. Доверие на экранах и в Node.js обоих серверов настраивается отдельно.

Native verification on a modern Windows host:

```powershell
$env:FDV_TEST_WINDOWS_CERTIFICATES='1'
# Optional: FDV_LEGACY_NODE = actual Node12 executable;
# FDV_NET20_REFERENCES = .NET2 reference assembly directory.
node --test test/https-certificate.test.js test/windows-launcher.test.js
```

Tests generate only temporary user keys/files, check real TLS/server startup,
SAN/algorithm/ACLs/backups, no listener change before restart, CLR2 compilation
and opt-in Node12 loading. RU/EN off-screen renders exercise the native dialog;
they are not screenshots from physical Win7/Win8. Real old-OS validation remains
required before competition use.

`fdv-bouldering-timer.exe` is a small native Windows launcher for the timer.
It reads `params.txt`, uses portable or system Node.js, displays local network
addresses, opens the timer, and provides restart and stop commands.

The server listens on all local interfaces. The launcher reloads settings and
rebuilds the displayed links after every restart, and refreshes those links
when Windows reports a network-address change. Repeated notifications that do
not change the address list are ignored, and health checks are serialized and
bounded.

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

Сервер принимает подключения на всех локальных интерфейсах. После каждого
перезапуска лаунчер заново читает настройки и формирует ссылки, а при смене
сетевых адресов обновляет их без повторных записей в журнале. Проверки
доступности выполняются последовательно и имеют ограничение по времени.

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

## Windows 7/8 Legacy build / Сборка для старых ОС

`build-launcher.ps1 -LegacyReferenceDirectory <NET2-reference-directory>` builds
the same GUI against CLR2 reference assemblies with `FDV_LEGACY_WINDOWS`.
Keep the generated `.exe.config`: it selects installed CLR4 then CLR2. The
Dictionary-backed compatibility set and WinForms MethodInvoker avoid a .NET3.5
assembly dependency; the Legacy build does not call NetTCPIP cmdlets or stop
other port owners. Its package has a foreground BAT fallback without .NET or
PowerShell. Normal builds keep the existing behavior. Microsoft references are
build-only; do not package them or a modern Node runtime with the Legacy GUI.

Legacy-сборка рассчитана на встроенный CLR2/CLR4 Windows 7/8; файл `.exe.config`
обязателен. Она останавливает только собственный дочерний процесс и не вызывает
современные PowerShell-команды. Консольный BAT не требует .NET. Это серверная
portable-сборка на устаревшем Node12, только для доверенной изолированной LAN;
не путайте с экранным режимом Legacy. Подробности: `docs/windows-legacy.md`.

The header and window title show the server build in parentheses, separated from the product name. The build is read from the existing startup /api/state response, never hardcoded into the EXE. It is cleared on restart; normal health probes still read headers only. Modern and CLR2 passive native harnesses verify the suffix, language switching and minimum-width layout.
