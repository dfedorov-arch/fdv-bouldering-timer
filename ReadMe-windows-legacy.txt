FDV Bouldering Timer - Windows 7/8 Legacy (x86 / x64)
===================================================

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
Сборка 425: современный браузер на компьютере сервера автоматически передаёт ему звук, сохраняя собственную подстройку. Для нативного проигрывателя требуются PowerShell 3+ и .NET 4+; без них звук остаётся браузерным. Пауза/Стоп, выключение звука и закрытие страницы отменяют сигналы. Экранный Legacy по-прежнему без звука.
Сборка 424: современные браузеры дополнительно прогревают звук за 10 секунд до первого сигнала и сохраняют запоздавший технический прогрев в актуальной фазе. Допуски основных сигналов не изменены. Экранный Legacy остаётся без звука.
Сборка 423: современные браузеры сохраняют звук при переключении вкладок и проверяют задержки выполнения/звуковые часы. Это не обходит сон устройства или принудительную заморозку страницы. Экранный Legacy по-прежнему без звука; сборка 425 добавляет локальный серверный звук.
Сборка 422: современные браузеры этого сервера поддерживают CTRL (Старт/Стоп/Пауза/Экран и горячие клавиши), отдельное отключение звуков последних 5 секунд перерыва и MINUTE за минуту до запланированного старта. В экранном Legacy CTRL недоступен и звук по-прежнему отсутствует. Оба сервера резервной пары должны быть одной сборки.
Для Windows 7 SP1, Windows 8 и 8.1 доступны MSI и portable ZIP. MSI устанавливает программу и предлагает ярлыки; ZIP запускается из распакованной папки.
Выбирайте x86 для 32-битной ОС, x64 для 64-битной. Распакуйте весь ZIP
в отдельный каталог: не смешивайте файлы с обычной Windows-сборкой.

ВАЖНО: Node.js 12.22.12 и эти ОС больше не получают обновлений безопасности.
Используйте сборку только в доверенной изолированной локальной сети.
Не открывайте её порты в интернет. HTTPS не устраняет уязвимости runtime.
Для публичного сервера используйте современную ОС или VDS.

1. Запустите fdv-bouldering-timer.exe. Лаунчер собран для CLR 2.0/4.0:
   Windows 7 использует встроенный .NET 3.5.1, Windows 8 — встроенный .NET 4.x.
   Файл fdv-bouldering-timer.exe.config обязателен: держите его рядом с EXE.
2. Если .NET отключён/повреждён, запустите start-timer-win.bat: он не требует
   .NET и современных PowerShell-команд. Окно консоли должно оставаться открытым.
   Адреса HTTP будут напечатаны сервером; откройте нужный адрес в браузере.
   Ctrl+C останавливает сервер. Ошибка сервера остаётся видимой в консоли.
3. Лаунчер останавливает только запущенный им процесс. Если порт занят другим
   сервером, остановите тот сервер самостоятельно или измените порт в params.txt.
4. Параметры, списки, звук, синхронизация, восстановление и резервный сервер — общие с обычной
   сборкой. Встроенный Node не заменяйте современным: он не запустится на Win7.
   MSI устанавливает программу в Program Files\FDV Bouldering Timer Legacy; пользовательские данные — в %LOCALAPPDATA%\FDV Bouldering Timer. Удаление сохраняет эти данные; подробнее ReadMe-MSI.txt.
   Состояние portable-сервера сохраняется в runtime-state рядом с приложением;
   при запрете записи применяется общий пользовательский резервный каталог.
5. Браузеры старых ОС тоже устарели. Сервер на Win7 может обслуживать современные
   экраны на других устройствах. Legacy-экран для старого браузера не имеет звука.

Первый запуск — на русском независимо от языка Windows; сохранённый выбор языка
имеет приоритет. Кнопка EN / RU переключает язык лаунчера и общий язык таймера на запущенном им
сервере без перезапуска. Выбор сохраняется для пользователя и передаётся серверу
после готовности, перед автоматическим открытием браузера. Все экраны получают
изменение, как от основного браузера; резервный пересылает команду основному.
При ошибке будет предупреждение в журнале. Технический вывод Node.js не переводится.

HTTPS: в лаунчере нажмите «Создать HTTPS-сертификат», проверьте адреса и имена
сервера. Кнопка работает без OpenSSL и современных команд PowerShell, включая
Win7/Win8. Сертификат самоподписанный, срок 365 дней. Замена требует согласия;
перезапуск предлагается отдельно и не происходит без подтверждения.
Файлы сохраняются в https рядом с программой, при запрете записи — в
%LOCALAPPDATA%\FDV Bouldering Timer\https. Передавайте устройствам только
timer-public.cer для настройки доверия, не timer-cert.pfx с закрытым ключом.
Доверие не устанавливается автоматически; для резерва настройте его также
в Node.js обоих серверов. Современный BAT-генератор в этот архив не включён.
Для консольного запуска можно перенести подходящие корневые PEM/PFX с другого
компьютера, если управляемый сертификат ещё не создан. Руководство: help.html.

English
-------
Build429: native audio-anchor tolerance and browser technical-preparation tolerance are10ms inclusive. Native comparison uses the retained anchor without accumulating drift; browser preparation also requires the same calendar start. Larger deviations and run/phase changes still invalidate stale work. Timer clocks and user correction are unchanged.
Build 428: native audio accepts anchor changes within50ms inclusive relative to the retained anchor, without accumulating stepwise drift. Changes greater than50ms replace the queue. Browser audio, per-client correction and timer clocks are unchanged.
Build 427: fixes a missing one-minute warning while waiting for the first scheduled rotation with native server audio. Sub-millisecond clock-sampling jitter no longer resets the audio queue. Per-browser correction is retained; actual start-time changes, Pause, Stop and mute still cancel obsolete signals.
Build 426: native server audio now tolerates delayed refills using three blocks totaling 120ms instead of two totaling 40ms. JSON output is moved off the PCM thread. Canonical cue targets and per-browser correction are retained. Server diagnostics include refill health. Active server playback suppresses browser signal output.
Build 425: modern browsers on the server computer automatically delegate sound, retaining their audio correction. Native output requires PowerShell 3+ and .NET 4+; otherwise browser playback remains. Pause/Stop, muting and page closure cancel cues. Legacy displays remain silent.
Build 424: modern browsers add preparation 10 seconds before the first signal and retain late technical warmups in their current phase. Competition-signal lateness limits are unchanged. Legacy displays remain silent.
Build 423: modern browsers keep sound active when switching tabs, with callback-delay and audio-clock checks. Device sleep and forced page freezing can still interrupt playback. Legacy displays remain silent; the server does not play sound.
Build 422: modern browsers on this server support CTRL (Start/Stop/Pause/Screen and shortcuts), optional last-five-break-second mute and MINUTE before a scheduled start. Legacy display mode remains silent with CTRL unavailable. Both paired servers must use the same build.
MSI installers and portable ZIPs are available for Windows 7 SP1 / Windows 8 / Windows 8.1. MSI provides installation/shortcuts; ZIP runs from its extracted folder. Installed data lives in %LOCALAPPDATA%\FDV Bouldering Timer and is retained on uninstall; see ReadMe-MSI.txt.
Use x86 for 32-bit Windows, x64 for 64-bit. Extract the full ZIP into a separate
folder; do not mix it with the ordinary Windows package.

SECURITY: Node.js 12.22.12 and these operating systems are end-of-life.
Use only on a trusted isolated LAN, never as an Internet-facing server.
HTTPS does not repair an obsolete runtime. Use a modern OS/VDS for public access.

Run fdv-bouldering-timer.exe with its mandatory .exe.config beside it. The
CLR2/CLR4 configuration uses Windows 7's built-in .NET 3.5.1 or Windows 8's .NET4.
If those components are disabled/broken, use start-timer-win.bat without .NET or
modern PowerShell. Keep the console open and open a printed HTTP address in a
browser. Ctrl+C stops the server; startup errors remain visible.

The GUI only stops its own child. Resolve port conflicts manually. The bundled
Node12 runs a build-time adaptation of the same server, not a separate clock or
audio algorithm. Lists, state recovery and Secondary server support retain the ordinary protocol.
Modern client devices can connect; old-browser Legacy display mode has no sound.
First launch defaults to Russian regardless of Windows language; saved choices
take precedence. The top-right EN / RU button changes the launcher and the common timer language
on its own server without restarting. It is remembered per user and sent after
readiness, before automatic browser opening. All screens update; a following
Secondary forwards to the current primary. Failures are logged. Tray and
certificate dialogs follow the choice; technical Node.js output stays original.

For HTTPS, use Create HTTPS certificate in the GUI, including on Win7/Win8.
Review server addresses/names. No OpenSSL or modern PowerShell is needed.
The self-signed certificate lasts 365 days; replacement and restart require
separate confirmations. Files use the adjacent https folder or per-user
%LOCALAPPDATA%\FDV Bouldering Timer\https if writing is denied. Share only
timer-public.cer for trust setup, not timer-cert.pfx with its private key.
Trust is not installed automatically; configure Node.js trust on both servers
for a Secondary pair. The modern BAT generator is not included. Console users
can supply suitable root PEM/PFX files when no managed certificate exists.


Сборка 448: шифрованный обмен основного и резервного серверов работает на
Node12.22.12 без дополнительных криптобиблиотек. Обновите оба сервера до одной
сборки; открытого fallback нет. Это не шифрует HTTP браузеров и не подтверждает
отпечаток сервера при первом сопряжении.
Build 448: encrypted primary/standby traffic works on Node12.22.12 without extra
crypto libraries. Update both servers to the same build; no plaintext fallback.
This does not encrypt browser HTTP or verify the peer fingerprint at first pairing.
