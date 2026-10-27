Сборка 442: во всех настольных лаунчерах одинаковые команды и EN/RU. Язык окна, меню, сертификата и таймера меняется без перезапуска и сохраняется для пользователя; по умолчанию — русский. Закрытие окна скрывает лаунчер: сервер работает дальше. Откройте окно через значок в трее/строке меню или повторный запуск приложения; в macOS также через Dock. Остановка — «Стоп и выход». Консольные BAT/command/sh по-прежнему требуют открытого терминала и останавливаются Ctrl+C.
Build 442: every desktop launcher has the same commands and EN/RU. Window/menu/certificate/timer language changes without restart and is saved per user; default is Russian. Closing only hides the launcher: the server keeps running. Reopen from tray/menu bar or launch the app again (also Dock on macOS). Use Stop and exit to stop it. Foreground BAT/command/sh scripts still require an open terminal and stop with Ctrl+C.

«Не давать заснуть колонке» включено по умолчанию: короткий тихий тон после длительной тишины, также в ожидании старта и паузе. Работает через выбранный источник звука. Параметры params.txt: speaker_keep_awake=true; speaker_keep_awake_interval_seconds=180 (10–600 с); speaker_keep_awake_gain=0.006 (амплитуда 0.0001–0.1); speaker_keep_awake_frequency_hz=440 (100–2000 Гц). Длительность 150 мс. После изменения params.txt перезапустите сервер. Эффект зависит от модели BT-колонки; слишком тихий тон может не предотвратить сон. В браузере необходима разблокировка звука; сон/заморозка вкладки может задерживать технические сигналы. На сервере они не зависят от активности вкладки. Выключение звука и снятие флажка отменяют технический тон.
Keep speaker awake is on by default: a short quiet tone after prolonged silence, also while waiting or paused. It uses the selected audio output. params.txt: speaker_keep_awake=true; speaker_keep_awake_interval_seconds=180 (10–600 seconds); speaker_keep_awake_gain=0.006 (linear amplitude 0.0001–0.1); speaker_keep_awake_frequency_hz=440 (100–2000 Hz). Duration150ms. Restart the server after parameter changes. Effectiveness depends on the BT speaker; a tone may be too quiet to prevent sleep. Browser playback requires audio unlocking and can be delayed by tab freezing/throttling. Native server playback is independent of tab activity. Muting sound or clearing the checkbox cancels the technical tone.

FDV Bouldering Timer for macOS
==============================

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
