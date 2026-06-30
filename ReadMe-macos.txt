FDV Bouldering Timer for macOS
==============================

Русский
-------

1. Распакуйте архив целиком.
2. Запустите FDV Bouldering Timer.app или файл fdv-bouldering-timer рядом с ним.
3. Приложение сервера покажет локальный и сетевые адреса, запустит сервер и откроет браузер.
4. На других экранах откройте сетевой адрес из окна приложения, например http://192.168.1.68:8008/.
5. Закрытие окна приложения останавливает сервер. Restart server перезапускает сервер после изменения портов или настроек Node.js.

Если macOS блокирует запуск, щёлкните приложение правой кнопкой и выберите Открыть. При Permission denied выполните:

  chmod +x fdv-bouldering-timer start-timer-mac.command create-https-certificate-mac.command

Резервный запуск: start-timer-mac.command. В этом режиме Terminal нужно держать открытым, остановка — Ctrl+C.

Node.js уже включён в runtime/mac/bin/node. Порты и настройки находятся в params.txt. Полное руководство: help.html.

English
-------

1. Extract the complete archive.
2. Run FDV Bouldering Timer.app or the adjacent fdv-bouldering-timer file.
3. The server app displays local and network addresses, starts the server, and opens the browser.
4. On other displays, open a network address from the app window, for example http://192.168.1.68:8008/.
5. Closing the app window stops the server. Restart server restarts it after port or Node.js setting changes.

If macOS blocks the app, right-click it and choose Open. For Permission denied run:

  chmod +x fdv-bouldering-timer start-timer-mac.command create-https-certificate-mac.command

Fallback launcher: start-timer-mac.command. Keep Terminal open in fallback mode; stop with Ctrl+C.

Node.js is bundled in runtime/mac/bin/node. Ports and settings are in params.txt. Full guide: help.html.
