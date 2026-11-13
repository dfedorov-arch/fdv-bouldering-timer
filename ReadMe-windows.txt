FDV Bouldering Timer for Windows
================================

Актуально для сборки 454 (develop)

Лаунчер. Оформление согласовано с Linux: шрифт, плоские кнопки, рамки и отступы; тот же стиль используется в диалогах PIN и сертификата. В первой строке: «Открыть таймер», «Копировать ссылку», «PIN управления», «Перезапуск сервера», «Стоп и выход». Во второй: «Создать HTTPS-сертификат», «Проверить обновления», «Открыть сайт проекта». Проверка обновлений сообщает о новом GitHub-релизе; установку выполняет пользователь. Она не останавливает таймер. В строке состояния показаны роль сервера и адрес связанного сервера. При потере связи с настроенным резервом строка становится жёлтой: «Сервер работает, резервный сервер „адрес“ недоступен»; после восстановления снова показывается подключение. При удалении пары упоминание резерва исчезает.

Растягивание цифр настраивается отдельно для каждого экрана плашкой ↓↑. Тёмно-зелёная — доступно, светло-зелёная — включено, серая — недоступно или запрещено общим пределом. В params.txt: timer_vertical_stretch=false (выключено для новых экранов), timer_vertical_stretch_max_percent=200 (предел 200%). Для включения заранее задайте true; индивидуальный выбор браузера сохраняется. При пределе ≤100 растягивание отключено. После изменения params.txt перезапустите сервер. Поддерживается и Legacy с CSS transform; в современном экране двоеточие сохраняет пропорции.

Резервирование. При доступном резерве переход начинается после 2 секунд без связи с основным. Жёлтое сообщение показывает переход и работу на резерве. Основной, вернувшийся в течение 20 секунд от последнего контакта, получает управление обратно с сохранением изменений. Позже резерв становится основным, а прежний основной — резервным. Через 20 секунд предупреждение исчезает. Кнопка SEC рядом с PIN: зелёная рамка — доступны оба, красная — хотя бы один недоступен, жёлтая — резерв не назначен; текст светлеет при наведении, как у PIN. Плашка SEC в карточке браузера: серая — резерв недоступен, тёмно-зелёная — доступен, светло-зелёная — этот браузер подключён к резерву. Для сопряжения нужны сетевые адреса, доступные в обе стороны; 127.0.0.1 другого компьютера или VM не подходит.

Звук. После включения серверного канала звук поддерживает сам сервер: сворачивание, заморозка, закрытие вкладки и потеря связи с браузером его не останавливают. Выбор канала и звуковая поправка восстанавливаются из актуального состояния после перезапуска на том же компьютере. Явное выключение звука, выбор браузерного канала и правила резервирования сохраняют действие. При обнаруженном отказе серверного канала браузер сразу принимает воспроизведение. Автоматический возврат на сервер выполняется после восстановления, если пользователь выбрал сервер; ручной выбор браузера сохраняется. Во время передачи между каналами возможно перекрытие. Нажатие «Старт» сразу запрашивает тихий прогрев; новый ручной отсчёт на сервере начинается с подготовкой 600 мс. Стартовый сигнал может прозвучать однократно с опозданием не более 3 секунд; позже пропускается, для остальных сигналов допустимое опоздание короче. В Финале прогрев начинается за 10 секунд до конца ожидания и повторяется каждые 10 секунд до нажатия «Старт»; учитываются разрешение звука и no_sound_warm. AUDIO подтверждает готовность канала, а физическое звучание проверяется на слух. Поправка звука — от −750 до +250 мс.

Current for build 454 (develop)

Launcher. Fonts, flat buttons, borders and spacing follow the Linux launcher, including PIN and certificate dialogs. First row: Open timer, Copy link, Control PIN, Restart server, Stop and exit. Second row: Create HTTPS certificate, Check updates, Open project website. Update checks notify about a new GitHub release; installation is manual and the timer keeps running. The status line shows the server role and peer address. If the configured standby becomes unreachable, the status turns yellow and reports its address as unavailable; connection text returns when contact recovers. Removing the pairing clears the peer text.

Per-display digit stretching uses the ↓↑ badge: dark green when available, bright green when enabled, gray when unsupported or disabled by the shared cap. In params.txt: timer_vertical_stretch=false (new displays start with stretching off), timer_vertical_stretch_max_percent=200 (200% maximum). Set the first value to true to enable it in advance; individual browser choices are retained. A cap ≤100 disables stretching. Restart the server after editing. Legacy engines with CSS transforms are supported; the Modern colon keeps its proportions.

Standby. After 2 seconds without primary contact, displays switch to a reachable reserve and show a yellow transition/operation notice. Recovery within 20 seconds of the last contact returns authority to the primary while preserving changes. Later recovery makes the former primary the standby. The warning clears at 20 seconds. The SEC setup button beside PIN uses a green border when both servers are available, red when either is unavailable, yellow without a reserve; its text brightens on hover like PIN. Browser-card SEC badges stay gray for unavailable, dark green for available, bright green for connected through the reserve. Pair using network addresses reachable in both directions; another computer or VM cannot be reached through your own 127.0.0.1.

Audio. After server output is activated, the server maintains playback independently: hiding, freezing, closing or disconnecting the browser does not stop it. Output selection and correction restore from a valid snapshot after restart on the same host. Explicit muting, browser-output selection and standby authority rules still apply. Detected native-output failure immediately enables browser fallback. A recovered server resumes output only if the saved selection is server; manual browser selection is retained. Channels may overlap during handover. Start immediately requests quiet warm-up, with a 600 ms server preparation lead for a fresh manual countdown. Its start cue can play once up to 3 seconds late, then is skipped; other cues have shorter limits. Final prewarm begins 10 seconds before the waiting countdown ends and repeats every 10 seconds until Start, respecting sound permissions and no_sound_warm. AUDIO reports backend readiness; verify actual sound by ear. User correction spans −750 to +250 ms.


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
