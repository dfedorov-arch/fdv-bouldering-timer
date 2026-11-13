FDV Bouldering Timer for Linux
==============================

Актуально для сборки 454 (develop)

Лаунчер. В первой строке: «Открыть таймер», «Копировать ссылку», «PIN управления», «Перезапуск сервера», «Стоп и выход». Во второй: «Создать HTTPS-сертификат», «Проверить обновления», «Открыть сайт проекта». Проверка обновлений сообщает о новом GitHub-релизе; установку выполняет пользователь. Она не останавливает таймер. В строке состояния показаны роль сервера и адрес связанного сервера. При потере связи с настроенным резервом строка становится жёлтой: «Сервер работает, резервный сервер „адрес“ недоступен»; после восстановления снова показывается подключение. При удалении пары упоминание резерва исчезает.

Растягивание цифр настраивается отдельно для каждого экрана плашкой ↓↑. Тёмно-зелёная — доступно, светло-зелёная — включено, серая — недоступно или запрещено общим пределом. В params.txt: timer_vertical_stretch=false (выключено для новых экранов), timer_vertical_stretch_max_percent=200 (предел 200%). Для включения заранее задайте true; индивидуальный выбор браузера сохраняется. При пределе ≤100 растягивание отключено. После изменения params.txt перезапустите сервер. Поддерживается и Legacy с CSS transform; в современном экране двоеточие сохраняет пропорции.

Резервирование. При доступном резерве переход начинается после 2 секунд без связи с основным. Жёлтое сообщение показывает переход и работу на резерве. Основной, вернувшийся в течение 20 секунд от последнего контакта, получает управление обратно с сохранением изменений. Позже резерв становится основным, а прежний основной — резервным. Через 20 секунд предупреждение исчезает. Кнопка SEC рядом с PIN: зелёная рамка — доступны оба, красная — хотя бы один недоступен, жёлтая — резерв не назначен; текст светлеет при наведении, как у PIN. Плашка SEC в карточке браузера: серая — резерв недоступен, тёмно-зелёная — доступен, светло-зелёная — этот браузер подключён к резерву. Для сопряжения нужны сетевые адреса, доступные в обе стороны; 127.0.0.1 другого компьютера или VM не подходит.

Звук. После включения серверного канала звук поддерживает сам сервер: сворачивание, заморозка, закрытие вкладки и потеря связи с браузером его не останавливают. Выбор канала и звуковая поправка восстанавливаются из актуального состояния после перезапуска на том же компьютере. Явное выключение звука, выбор браузерного канала и правила резервирования сохраняют действие. При обнаруженном отказе серверного канала браузер сразу принимает воспроизведение. Автоматический возврат на сервер выполняется после восстановления, если пользователь выбрал сервер; ручной выбор браузера сохраняется. Во время передачи между каналами возможно перекрытие. Нажатие «Старт» сразу запрашивает тихий прогрев; новый ручной отсчёт на сервере начинается с подготовкой 600 мс. Стартовый сигнал может прозвучать однократно с опозданием не более 3 секунд; позже пропускается, для остальных сигналов допустимое опоздание короче. В Финале прогрев начинается за 10 секунд до конца ожидания и повторяется каждые 10 секунд до нажатия «Старт»; учитываются разрешение звука и no_sound_warm. AUDIO подтверждает готовность канала, а физическое звучание проверяется на слух. Поправка звука — от −750 до +250 мс.

Current for build 454 (develop)

Launcher. First row: Open timer, Copy link, Control PIN, Restart server, Stop and exit. Second row: Create HTTPS certificate, Check updates, Open project website. Update checks notify about a new GitHub release; installation is manual and the timer keeps running. The status line shows the server role and peer address. If the configured standby becomes unreachable, the status turns yellow and reports its address as unavailable; connection text returns when contact recovers. Removing the pairing clears the peer text.

Per-display digit stretching uses the ↓↑ badge: dark green when available, bright green when enabled, gray when unsupported or disabled by the shared cap. In params.txt: timer_vertical_stretch=false (new displays start with stretching off), timer_vertical_stretch_max_percent=200 (200% maximum). Set the first value to true to enable it in advance; individual browser choices are retained. A cap ≤100 disables stretching. Restart the server after editing. Legacy engines with CSS transforms are supported; the Modern colon keeps its proportions.

Standby. After 2 seconds without primary contact, displays switch to a reachable reserve and show a yellow transition/operation notice. Recovery within 20 seconds of the last contact returns authority to the primary while preserving changes. Later recovery makes the former primary the standby. The warning clears at 20 seconds. The SEC setup button beside PIN uses a green border when both servers are available, red when either is unavailable, yellow without a reserve; its text brightens on hover like PIN. Browser-card SEC badges stay gray for unavailable, dark green for available, bright green for connected through the reserve. Pair using network addresses reachable in both directions; another computer or VM cannot be reached through your own 127.0.0.1.

Audio. After server output is activated, the server maintains playback independently: hiding, freezing, closing or disconnecting the browser does not stop it. Output selection and correction restore from a valid snapshot after restart on the same host. Explicit muting, browser-output selection and standby authority rules still apply. Detected native-output failure immediately enables browser fallback. A recovered server resumes output only if the saved selection is server; manual browser selection is retained. Channels may overlap during handover. Start immediately requests quiet warm-up, with a 600 ms server preparation lead for a fresh manual countdown. Its start cue can play once up to 3 seconds late, then is skipped; other cues have shorter limits. Final prewarm begins 10 seconds before the waiting countdown ends and repeats every 10 seconds until Start, respecting sound permissions and no_sound_warm. AUDIO reports backend readiness; verify actual sound by ear. User correction spans −750 to +250 ms.


Сборка 441: кнопка Create HTTPS certificate в лаунчере x64/arm64 создаёт сертификат без OpenSSL. Проверьте IP/DNS. Замена и перезапуск подтверждаются отдельно; генерация не прерывает сервер. DEB: ${XDG_STATE_HOME:-~/.local/state}/fdv-bouldering-timer/https (только абсолютный XDG_STATE_HOME). Portable: https рядом с программой, с пользовательским резервным каталогом при запрете записи. Open directory показывает фактический путь. Передавайте только timer-public.cer, не timer-cert.pfx с закрытым ключом. Доверие настраивается отдельно. Консольный скрипт не заменяет управляемый сертификат.
Build441: Create HTTPS certificate in x64/arm64 launchers works without OpenSSL. Review IP/DNS names. Replacement and restart require separate confirmations; generation does not interrupt the server. DEB: ${XDG_STATE_HOME:-~/.local/state}/fdv-bouldering-timer/https (absolute XDG_STATE_HOME only). Portable: adjacent https with per-user fallback if writing is denied. Open directory shows the actual path. Share only timer-public.cer, never the private timer-cert.pfx. Configure trust separately. The console script does not replace managed certificates.

Сборка 436: серверный звук добавлен для Linux x64/ARM64. Если звучащий современный браузер находится на компьютере сервера, вывод автоматически передаётся ALSA через системное устройство default. Подстройка и индивидуальный флажок серверного звука сохраняются. Нужны libasound.so.2 и аудиосеанс текущего пользователя; для озвучки фестиваля без записанных фраз — espeak-ng или espeak. При ошибке подготовки используется браузер. В DEB зависимость ALSA указана явно. Номер сборки виден в лаунчере. Перед соревнованиями проверьте выбранный выход на этом компьютере.
Build436: local modern browser audio can use the native ALSA default output on Linux x64/ARM64. Per-browser correction and server-output preference are preserved. Requires libasound.so.2 and the user's desktop audio session; Festival synthesized speech requires espeak-ng or espeak. Preparation failures fall back to the browser. The launcher shows the server build. Test the actual output before competition use.

Русский
-------

Установленная через DEB версия сохраняет состояние в ~/.local/state/fdv-bouldering-timer/runtime-state (или в каталоге XDG_STATE_HOME). Portable-версия использует runtime-state рядом с программой; если запись запрещена, сервер выбирает пользовательский каталог. Выбранный путь виден в журнале лаунчера.

1. Распакуйте архив целиком.
2. При необходимости выполните:

   chmod +x fdv-bouldering-timer install-linux-launcher.sh start-timer-linux.sh create-https-certificate-linux.sh

3. Запустите приложение сервера:

   ./fdv-bouldering-timer

4. Приложение покажет локальный и сетевые адреса, запустит сервер и откроет браузер.
5. На других экранах откройте сетевой адрес из окна приложения, например http://192.168.1.68:8008/.

Для Ubuntu/GNOME-меню и иконки выполните один раз:

  ./install-linux-launcher.sh

После этого запускайте FDV Bouldering Timer из меню приложений и при необходимости закрепите его в Dock. Сам исполняемый файл в файловом менеджере может оставаться со стандартной иконкой: это нормально для Linux, иконку задаёт установленный .desktop-ярлык.

Закрытие окна скрывает лаунчер, сервер продолжает работать; остановка — «Стоп и выход». Резервный запуск: ./start-timer-linux.sh. В этом режиме Terminal нужно держать открытым, остановка — Ctrl+C.

Сервер слушает все локальные сетевые интерфейсы. Restart server заново читает параметры и обновляет показанные ссылки; при смене сети ссылки также обновляются автоматически.

Node.js уже включён в runtime/linux/bin/node. Linux-пакеты рассчитаны на glibc-дистрибутивы, включая Ubuntu, Debian и Fedora. Alpine Linux/musl требует совместимую сборку Node.js. Порты и настройки находятся в params.txt. Legacy-режим для старых браузеров и телевизоров включается из списка браузеров нажатием LEGACY. Полное руководство: help.html.

English
-------

The DEB installation saves state in ~/.local/state/fdv-bouldering-timer/runtime-state (or under XDG_STATE_HOME). Portable packages use runtime-state beside the application, with a per-user fallback if writing there is denied. The launcher log shows the selected directory.

1. Extract the complete archive.
2. Run when required:

   chmod +x fdv-bouldering-timer install-linux-launcher.sh start-timer-linux.sh create-https-certificate-linux.sh

3. Start the server app:

   ./fdv-bouldering-timer

4. The app displays local and network addresses, starts the server, and opens the browser.
5. On other displays, open a network address from the app window, for example http://192.168.1.68:8008/.

For the Ubuntu/GNOME application menu and icon, run once:

  ./install-linux-launcher.sh

Then launch FDV Bouldering Timer from the applications menu and pin it to the Dock if needed. The executable itself may still show a generic icon in the file manager; this is normal on Linux because the installed .desktop entry supplies the app icon.

Closing only hides the launcher; the server keeps running. Use Stop and exit to stop it. Fallback launcher: ./start-timer-linux.sh. Keep Terminal open in fallback mode; stop with Ctrl+C.

The server listens on all local network interfaces. Restart server reloads parameters and displayed links; network changes refresh the links automatically as well.

Node.js is bundled in runtime/linux/bin/node. Linux packages target glibc distributions including Ubuntu, Debian, and Fedora. Alpine Linux/musl requires a compatible Node.js build. Ports and settings are in params.txt. Legacy mode for older browsers and TV browsers is toggled from the browser list by clicking LEGACY. Full guide: help.html.
