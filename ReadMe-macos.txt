FDV Bouldering Timer for macOS
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


Сборка 441: кнопка Create HTTPS certificate в лаунчере для Intel и Apple Silicon создаёт сертификат без OpenSSL. Проверьте IP/DNS. Замена и перезапуск подтверждаются отдельно; генерация не прерывает сервер. PKG: ~/Library/Application Support/FDV Bouldering Timer/https. Portable: https рядом с программой, с пользовательским резервным каталогом при запрете записи. Open directory показывает фактический путь. Передавайте устройствам только timer-public.cer, не timer-cert.pfx с закрытым ключом. Доверие настраивается отдельно. Консольный скрипт не заменяет управляемый сертификат.
Build441: Create HTTPS certificate in both Intel/Apple Silicon launchers works without OpenSSL. Review IP/DNS names. Replacement and restart require separate confirmations; generation does not interrupt the server. PKG: ~/Library/Application Support/FDV Bouldering Timer/https. Portable: adjacent https with per-user fallback if writing is denied. Open directory shows the actual path. Share only timer-public.cer, never the private timer-cert.pfx. Configure trust separately. The console script does not replace managed certificates.

Сборка 436: серверный звук добавлен для Intel и Apple Silicon через Core Audio. Если звучащий современный браузер находится на компьютере сервера, используется тот же планировщик PCM с его подстройкой и индивидуальным флажком серверного звука. Для фестиваля без записанных фраз нужны установленные голоса Milena (русский) или Samantha (английский). При ошибке подготовки используется браузер. Номер сборки виден в лаунчере; prepare-timer-mac.command восстанавливает права запуска аудиокомпонента. Перед соревнованиями проверьте выбранный выход на этом Mac.
Build436: local modern browser audio can use native Core Audio on Intel and Apple Silicon with the shared PCM scheduler, browser correction and individual opt-out. Festival synthesized speech requires installed Milena (Russian) or Samantha (English) voices; preparation failures fall back to browser audio. The launcher displays the server build. Test the actual output before competition use.

Русский
-------

Установленная через PKG версия сохраняет состояние в ~/Library/Application Support/FDV Bouldering Timer/runtime-state. Portable-версия использует runtime-state рядом с программой; если запись запрещена, сервер выбирает пользовательский каталог. Выбранный путь виден в журнале лаунчера.

1. Распакуйте архив целиком.
2. Запустите FDV Bouldering Timer.app или файл fdv-bouldering-timer рядом с ним.
3. Приложение сервера покажет локальный и сетевые адреса, запустит сервер и откроет браузер.
4. На других экранах откройте сетевой адрес из окна приложения, например http://192.168.1.68:8008/.
5. Закрытие окна скрывает лаунчер, сервер продолжает работать; остановка — «Стоп и выход». Restart server заново читает параметры и обновляет показанные ссылки. При смене сети ссылки также обновляются автоматически.

Если macOS блокирует приложение или оно открывается, но не может запустить встроенный Node.js, щёлкните правой кнопкой по prepare-timer-mac.command, выберите Открыть и подтвердите запуск. Если macOS всё равно блокирует скрипт, откройте Системные настройки → Конфиденциальность и безопасность и нажмите "Всё равно открыть". Скрипт снимает quarantine-атрибут со всего распакованного релиза и восстанавливает права запуска. После сообщения Done запустите FDV Bouldering Timer.app обычным способом.

Если prepare-timer-mac.command не запускается из-за утраченного исполняемого атрибута, откройте Terminal в каталоге релиза и один раз выполните:

  chmod +x prepare-timer-mac.command

Затем снова запустите скрипт. Ручной эквивалент его основной операции:

  xattr -dr com.apple.quarantine .
  xattr -dr com.apple.quarantine "FDV Bouldering Timer.app"
  xattr -dr com.apple.quarantine "/полный/путь/к/fdv-bouldering-timer-macos-arm64"

При Permission denied выполните:

  chmod +x prepare-timer-mac.command fdv-bouldering-timer start-timer-mac.command create-https-certificate-mac.command

Резервный запуск: start-timer-mac.command. В этом режиме Terminal нужно держать открытым, остановка — Ctrl+C.

Node.js уже включён в runtime/mac/bin/node. Порты и настройки находятся в params.txt. Полное руководство: help.html.

English
-------

The PKG installation saves state in ~/Library/Application Support/FDV Bouldering Timer/runtime-state. Portable packages use runtime-state beside the application, with a per-user fallback if writing there is denied. The launcher log shows the selected directory.

1. Extract the complete archive.
2. Run FDV Bouldering Timer.app or the adjacent fdv-bouldering-timer file.
3. The server app displays local and network addresses, starts the server, and opens the browser.
4. On other displays, open a network address from the app window, for example http://192.168.1.68:8008/.
5. Closing the app window hides it without stopping the server. Use Stop and exit to stop it. Restart server reloads parameters and displayed links. Network changes refresh the links automatically as well.

If macOS blocks the app, or the app opens but cannot start bundled Node.js, right-click prepare-timer-mac.command, choose Open, and confirm. If macOS still blocks the script, open System Settings → Privacy & Security and click Open Anyway. The script removes quarantine from the complete extracted release and restores executable permissions. After it reports Done, start FDV Bouldering Timer.app normally.

If prepare-timer-mac.command cannot run because its executable bit was lost, open Terminal in the release directory and run this once:

  chmod +x prepare-timer-mac.command

Then run the script again. The manual equivalent of its primary operation is:

  xattr -dr com.apple.quarantine .
  xattr -dr com.apple.quarantine "FDV Bouldering Timer.app"
  xattr -dr com.apple.quarantine "/full/path/to/fdv-bouldering-timer-macos-arm64"

For Permission denied run:

  chmod +x prepare-timer-mac.command fdv-bouldering-timer start-timer-mac.command create-https-certificate-mac.command

Fallback launcher: start-timer-mac.command. Keep Terminal open in fallback mode; stop with Ctrl+C.

Node.js is bundled in runtime/mac/bin/node. Ports and settings are in params.txt. Full guide: help.html.
