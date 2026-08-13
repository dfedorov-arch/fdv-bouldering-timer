FDV Bouldering Timer for macOS
==============================

Русский
-------

1. Распакуйте архив целиком.
2. Запустите FDV Bouldering Timer.app или файл fdv-bouldering-timer рядом с ним.
3. Приложение сервера покажет локальный и сетевые адреса, запустит сервер и откроет браузер.
4. На других экранах откройте сетевой адрес из окна приложения, например http://192.168.1.68:8008/.
5. Закрытие окна приложения останавливает сервер. Restart server перезапускает сервер после изменения портов или настроек Node.js.

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

1. Extract the complete archive.
2. Run FDV Bouldering Timer.app or the adjacent fdv-bouldering-timer file.
3. The server app displays local and network addresses, starts the server, and opens the browser.
4. On other displays, open a network address from the app window, for example http://192.168.1.68:8008/.
5. Closing the app window stops the server. Restart server restarts it after port or Node.js setting changes.

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
