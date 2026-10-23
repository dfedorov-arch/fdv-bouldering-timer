Сборка436: текущие настройки и интерфейс включены во все варианты релизов. Серверный звук добавлен для macOS (Core Audio, Intel/Apple Silicon) и Linux (ALSA default, x64/ARM64), с общей очередью PCM, подстройкой браузера и его флажком отключения серверного вывода. Unix-лаунчер показывает номер сборки. Автономный HTML и Android сохраняют браузерный звук.
Build436: current UI/preferences are shared across release targets. Native server audio now supports macOS Core Audio and Linux ALSA on x64/ARM64 with the shared PCM scheduler, browser correction and opt-out. Unix launchers show the server build. Standalone HTML and Android retain browser audio.

Сборка435: полная подпись звука появляется в обычной широкой панели; на средней/узкой остаётся короткая с полной подсказкой.
Build435: the full sound caption appears in the normal wide panel; medium/narrow panels retain the short caption with its full tooltip.

Строка звука: без основного браузера чекбокс выровнен с верхними строками. При выбранном основном отступ от подписи10px; на узкой/средней панели подпись сокращается до «Звук в основном», с подсказкой «Звук в основном браузере».
Sound row: without a primary browser the checkbox aligns with the rows above. With a primary, the caption gap is10px; narrow/medium panels show “Sound in primary”, with the full “Sound in primary browser” tooltip.

«Не давать заснуть колонке» включено по умолчанию: короткий тихий тон после длительной тишины, также в ожидании старта и паузе. Работает через выбранный источник звука. Параметры params.txt: speaker_keep_awake=true; speaker_keep_awake_interval_seconds=180 (10–600 с); speaker_keep_awake_gain=0.006 (амплитуда 0.0001–0.1); speaker_keep_awake_frequency_hz=440 (100–2000 Гц). Длительность 150 мс. После изменения params.txt перезапустите сервер. Эффект зависит от модели BT-колонки; слишком тихий тон может не предотвратить сон. В браузере необходима разблокировка звука; сон/заморозка вкладки может задерживать технические сигналы. На сервере они не зависят от активности вкладки. Выключение звука и снятие флажка отменяют технический тон.
Keep speaker awake is on by default: a short quiet tone after prolonged silence, also while waiting or paused. It uses the selected audio output. params.txt: speaker_keep_awake=true; speaker_keep_awake_interval_seconds=180 (10–600 seconds); speaker_keep_awake_gain=0.006 (linear amplitude 0.0001–0.1); speaker_keep_awake_frequency_hz=440 (100–2000 Hz). Duration150ms. Restart the server after parameter changes. Effectiveness depends on the BT speaker; a tone may be too quiet to prevent sleep. Browser playback requires audio unlocking and can be delayed by tab freezing/throttling. Native server playback is independent of tab activity. Muting sound or clearing the checkbox cancels the technical tone.

В диагностике AUDIO флажок справа от статуса разрешает звук через сервер для выбранного браузера (включён по умолчанию). Снимите его для браузерного звука; в скрытой или спящей вкладке сигналы могут пропадать. Подстройка сохраняется. Выбор сохраняется по идентификатору вкладки, переживает разрыв связи, её перезагрузку и восстановление сервера; новая вкладка имеет отдельный идентификатор и настройки.
In AUDIO diagnostics, the checkbox beside the status allows server playback for the selected browser (on by default). Uncheck for browser audio; hidden or sleeping tabs may miss signals. The sound offset is preserved. The choice is saved by tab ID across disconnection, reload and server restoration; a new tab has its own ID and settings.

Номер сборки сервера показан в скобках рядом с названием после запуска.
The server build appears in parentheses beside the title after startup.

FDV Bouldering Timer for Windows
================================

Русский
-------
Сборка 429: допуск серверной точки старта и допуск браузерной технической подготовки установлены в 10 мс включительно. Сервер сравнивает с сохранённой точкой без накопления дрейфа; браузер дополнительно требует ту же календарную метку запуска. Превышение допуска и смена запуска/фазы по-прежнему отменяют устаревшую подготовку. Часы таймера и пользовательская подстройка не изменены.
Сборка 428: допуск изменения точки старта для серверного звукового расписания увеличен до 50 мс включительно. Сравнение ведётся с сохранённой точкой, поэтому последовательные небольшие изменения не накапливаются. Сдвиг больше 50 мс обновляет очередь. Браузерное воспроизведение, подстройка и часы таймера не изменены.
Сборка 427: исправлен пропуск минутного предупреждения перед первой ротацией при ожидании запланированного старта с серверным звуком. Подмиллисекундная погрешность повторных измерений больше не сбрасывает звуковую очередь. Подстройка сохранена; реальный перенос времени старта, Пауза, Стоп и выключение звука по-прежнему отменяют устаревшие сигналы.
Сборка 426: исправлена уязвимость серверного звука к задержкам подачи аудиоданных. Вместо двух блоков с общим запасом 40 мс используются три блока с запасом 120 мс; запись JSON вынесена из звукового потока. Временные цели сигналов и пользовательская подстройка сохранены. В диагностике сервера появились показатели подачи PCM. Браузер не дублирует сигналы при активном серверном выводе.
Сборка 425: На Windows звук автоматически передаётся серверу, если современный браузер открыт на том же компьютере и ему разрешено звучать. Сохраняются выбранный профиль и подстройка звука этого браузера, включая тестовую подстройку. Скрытие или заморозка вкладки не прерывает серверное расписание. Пауза, Стоп, выключение звука, отзыв роли и закрытие страницы отменяют соответствующие сигналы; один компьютер не дублирует звук нескольких вкладок. При недоступности нативного проигрывателя используется браузер. Сервер и Windows должны продолжать работать; сон компьютера не обходится. На других ОС, удалённых устройствах, в автономном HTML и APK звук остаётся браузерным; Legacy по-прежнему без звука.
Сборка 424: добавлен короткий прогрев за 10 секунд до первого сигнала серии/минуты/запланированного старта. Ближние прогревы сохранены, технический прогрев больше не отбрасывается только из-за задержки; смена фазы, Пауза/Стоп и заморозка по-прежнему его отменяют. Допуски самих сигналов не изменены.
Сборка 423: обычное переключение вкладки больше не отключает звук. Проверки задержек JavaScript и звуковых часов восстанавливают будущие сигналы после обнаруженного разрыва. Сон ПК и принудительная заморозка страницы могут прервать воспроизведение; сборка 425 добавляет автоматический серверный звук на Windows.

Сборка 422: «Звук в перерыве» рядом с «Мигание» по умолчанию включён; снимите галочку, чтобы отключить короткие сигналы последних 5 секунд перерыва; вспышки и сигнал старта сохраняются. За минуту до запланированного старта звучит MINUTE. Плашка CTRL в основном браузере выдаёт современному экрану кнопки Старт/Стоп/Пауза/Экран и их горячие клавиши; повторное нажатие отзывает права. Оба сервера резервной пары должны быть одной сборки.

Windows 7 SP1 / 8 / 8.1: используйте отдельные ZIP windows7-8-x86 / windows7-8-x64,
а не этот современный MSI/ZIP. В Windows Legacy встроен устаревший Node.js 12;
сборка предназначена только для доверенной изолированной локальной сети.
Подробности: ReadMe-windows-legacy.txt в исходниках, ReadMe.txt в Legacy-архиве.

Установленная через MSI версия сохраняет состояние в %LOCALAPPDATA%\FDV Bouldering Timer\runtime-state. Portable-версия использует runtime-state рядом с программой; если запись запрещена, сервер выбирает пользовательский каталог. Выбранный путь виден в журнале лаунчера.

1. Установите MSI, выбрав каталог и нужные ярлыки, или распакуйте portable-архив целиком.
2. После установки запустите FDV Bouldering Timer через меню «Пуск» или созданный ярлык. Автозапуска из MSI нет. Для portable-версии запустите fdv-bouldering-timer.exe.
3. Приложение сервера покажет локальный и сетевые адреса, запустит сервер и откроет браузер.
4. На других экранах откройте сетевой адрес из окна приложения, например http://192.168.1.68:8008/.
5. Если Windows Firewall спросит доступ для Node.js, разрешите частные сети.

Закрытие окна сворачивает приложение в область уведомлений Windows. Команда Stop and exit останавливает сервер. Резервный запуск: start-timer-win.bat.

При первом запуске используется русский язык независимо от языка Windows.
Ранее сохранённый выбор EN / RU сохраняет приоритет.
Кнопка EN / RU справа вверху меняет язык лаунчера и общий язык таймера на
запущенном им сервере, без перезапуска. Выбор запоминается для пользователя
Windows и применяется к меню трея, статусам и окну сертификата. Все подключённые
экраны получают язык сервера, как после переключения в основном браузере.
После запуска язык передаётся перед автоматическим открытием браузера. Если
сервер ещё не готов, выбор применяется после готовности; при ошибке будет
предупреждение в журнале. Резервный передаёт команду текущему основному.
Технический вывод Node.js и прежние строки журнала сохраняются в оригинале.

HTTPS: нажмите «Создать HTTPS-сертификат» в лаунчере, проверьте IP-адреса и
имена сервера, добавьте нужные и нажмите «Создать сертификат». OpenSSL и
PowerShell для этого не нужны. Сертификат самоподписанный, действует 365 дней.
Замена существующего сертификата требует подтверждения; прежние управляемые
файлы сохраняются как .backup. Перезапуск предлагается отдельно: ответ «Нет»
оставляет работающий сервер без изменений. Новый сертификат применяется при
следующем запуске сервера. После смены IP/имени создайте его заново.

MSI: файлы находятся в %LOCALAPPDATA%\FDV Bouldering Timer\https.
Portable: в https рядом с программой; при запрете записи — в том же
пользовательском каталоге. «Открыть каталог» показывает фактический путь.
timer-public.cer — публичный сертификат для настройки доверия устройств;
timer-cert.pfx содержит закрытый ключ, не передавайте его экранам.
Лаунчер не устанавливает доверие автоматически. Для резервного сервера
настройте доверие также в Node.js обоих серверов. Подробности: help.html.

Сервер слушает все локальные сетевые интерфейсы. После перезапуска лаунчер заново читает параметры и обновляет ссылки; при смене сети ссылки также обновляются автоматически.

Node.js уже включён в runtime\win\node.exe. Порты и настройки находятся в params.txt. Legacy-режим для старых браузеров и телевизоров включается из списка браузеров нажатием LEGACY. Полное руководство: help.html.

English
-------
Build429: native audio-anchor tolerance and browser technical-preparation tolerance are10ms inclusive. Native comparison uses the retained anchor without accumulating drift; browser preparation also requires the same calendar start. Larger deviations and run/phase changes still invalidate stale work. Timer clocks and user correction are unchanged.
Build 428: native audio accepts anchor changes within50ms inclusive relative to the retained anchor, without accumulating stepwise drift. Changes greater than50ms replace the queue. Browser audio, per-client correction and timer clocks are unchanged.
Build 427: fixes a missing one-minute warning while waiting for the first scheduled rotation with native server audio. Sub-millisecond clock-sampling jitter no longer resets the audio queue. Per-browser correction is retained; actual start-time changes, Pause, Stop and mute still cancel obsolete signals.
Build 426: native server audio now tolerates delayed refills using three blocks totaling 120ms instead of two totaling 40ms. JSON output is moved off the PCM thread. Canonical cue targets and per-browser correction are retained. Server diagnostics include refill health. Active server playback suppresses browser signal output.
Build 425: On Windows, an eligible modern browser on the server computer automatically delegates sound to the server. Its selected profile and per-browser audio correction, including correction previews, are retained. Hiding or freezing the tab does not interrupt the server schedule. Pause, Stop, muting, role revocation and page closure cancel the relevant cues; multiple local tabs share one native output. If native playback is unavailable, the browser is used. Windows and the server must remain running; computer sleep is not bypassed. Other operating systems, remote devices, standalone HTML and APK retain browser audio; Legacy remains silent.
Build 424: adds a short prewarm 10 seconds before the first countdown/minute/scheduled-start signal. Close warmups remain, and callback delay alone no longer expires technical preparation; run/phase changes, Pause/Stop and freezing still cancel it. Competition-signal lateness limits are unchanged.
Build 423: switching tabs keeps sound active. JavaScript-delay and audio-clock checks recover future signals after a detected gap. PC sleep and forced page freezing can still interrupt playback. Build 425 adds automatic local server audio on Windows.

Build 422: Break sound beside Flashing is on by default; uncheck it to mute only the last five break-second sounds, preserving flashes and START. MINUTE also warns one minute before a scheduled start. CTRL in the primary browser assigns or revokes Start/Stop/Pause/Screen buttons and shortcuts on a modern display. Both paired servers must use the same build.

Windows 7 SP1 / 8 / 8.1 require the separate windows7-8-x86 / windows7-8-x64 ZIP,
not this modern MSI/ZIP. Windows Legacy bundles end-of-life Node12 for trusted
isolated LAN use only. See the Legacy archive's ReadMe.txt for limitations.

The MSI installation saves state in %LOCALAPPDATA%\FDV Bouldering Timer\runtime-state. Portable packages use runtime-state beside the application; if writing there is denied, the server uses per-user storage. The launcher log shows the selected directory.

1. Install the MSI, choosing the destination and shortcuts, or extract the complete portable archive.
2. After installation, launch FDV Bouldering Timer from the Start menu or a created shortcut. The MSI does not launch it automatically. For portable packages, run fdv-bouldering-timer.exe.
3. The server app displays local and network addresses, starts the server, and opens the browser.
4. On other displays, open a network address from the app window, for example http://192.168.1.68:8008/.
5. If Windows Firewall asks about Node.js, allow private networks.

Closing the window keeps the app in the Windows notification area. Stop and exit stops the server. Fallback launcher: start-timer-win.bat.

First launch defaults to Russian regardless of Windows language. A previously
saved EN / RU choice takes precedence.
The top-right EN / RU button changes the launcher and the common timer language
on its own server without restarting it. All connected displays receive the
change, as with the primary browser button. The choice is remembered per user
and used for tray commands, statuses and certificate dialogs. After startup it
is sent before automatically opening the browser; if not ready it is deferred
until readiness. A following Secondary forwards it to the current primary.
Failures are logged. Original Node.js output and log history are not rewritten.

HTTPS: click Create HTTPS certificate, review/edit the server IP addresses and
names, then create it. No OpenSSL or PowerShell is needed. The self-signed
certificate lasts 365 days. Replacement requires confirmation and keeps backups
of managed files. Restart is a separate question: No leaves the running server
unchanged; the certificate takes effect on its next start. Recreate it when the
server address changes. MSI storage: %LOCALAPPDATA%\FDV Bouldering Timer\https;
portable storage: the adjacent https directory, with per-user fallback if not
writable. Open directory shows the actual location. Share timer-public.cer for
trust setup, never timer-cert.pfx (private key). Trust is not installed
automatically; a Secondary pair also needs Node.js trust on both servers.

The server listens on all local network interfaces. After a restart the launcher reloads parameters and displayed links; network changes refresh the links automatically as well.

Node.js is bundled in runtime\win\node.exe. Ports and settings are in params.txt. Legacy mode for older browsers and TV browsers is toggled from the browser list by clicking LEGACY. Full guide: help.html.
