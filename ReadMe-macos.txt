FDV Bouldering Timer for macOS
==============================

Русский
-------

1. Распакуйте архив целиком.
2. Запустите FDV Bouldering Timer.app или файл fdv-bouldering-timer рядом с ним.
3. Приложение сервера покажет локальный и сетевые адреса, запустит сервер и откроет браузер.
4. На других экранах откройте сетевой адрес из окна приложения, например http://192.168.1.68:8008/.
5. Закрытие окна приложения останавливает сервер. Restart server перезапускает сервер после изменения портов или настроек Node.js.

Если macOS блокирует запуск, щёлкните приложение правой кнопкой и выберите Открыть. Если запуск всё равно заблокирован, откройте Системные настройки → Конфиденциальность и безопасность и нажмите "Всё равно открыть" / "Разрешить" для FDV Bouldering Timer. Если после распаковки приложение или встроенный runtime всё равно не запускаются, снимите quarantine-атрибут с распакованной папки или с самого приложения:

  xattr -dr com.apple.quarantine .
  xattr -dr com.apple.quarantine "FDV Bouldering Timer.app"
  xattr -dr com.apple.quarantine "/полный/путь/к/fdv-bouldering-timer-v1.0.7-macos-arm64"

При Permission denied выполните:

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

If macOS blocks the app, right-click it and choose Open. If launch is still blocked, open System Settings → Privacy & Security and click Open Anyway / Allow for FDV Bouldering Timer. If the extracted app or bundled runtime still cannot start, clear the quarantine attribute on the extracted folder or on the app itself:

  xattr -dr com.apple.quarantine .
  xattr -dr com.apple.quarantine "FDV Bouldering Timer.app"
  xattr -dr com.apple.quarantine "/full/path/to/fdv-bouldering-timer-v1.0.7-macos-arm64"

For Permission denied run:

  chmod +x fdv-bouldering-timer start-timer-mac.command create-https-certificate-mac.command

Fallback launcher: start-timer-mac.command. Keep Terminal open in fallback mode; stop with Ctrl+C.

Node.js is bundled in runtime/mac/bin/node. Ports and settings are in params.txt. Full guide: help.html.
