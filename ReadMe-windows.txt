FDV Bouldering Timer for Windows
================================

Русский
-------

Установленная через MSI версия сохраняет состояние в %LOCALAPPDATA%\FDV Bouldering Timer\runtime-state. Portable-версия использует runtime-state рядом с программой; если запись запрещена, сервер выбирает пользовательский каталог. Выбранный путь виден в журнале лаунчера.

1. Распакуйте архив целиком.
2. Запустите fdv-bouldering-timer.exe.
3. Приложение сервера покажет локальный и сетевые адреса, запустит сервер и откроет браузер.
4. На других экранах откройте сетевой адрес из окна приложения, например http://192.168.1.68:8008/.
5. Если Windows Firewall спросит доступ для Node.js, разрешите частные сети.

Закрытие окна сворачивает приложение в область уведомлений Windows. Команда Stop and exit останавливает сервер. Резервный запуск: start-timer-win.bat.

Сервер слушает все локальные сетевые интерфейсы. После перезапуска лаунчер заново читает параметры и обновляет ссылки; при смене сети ссылки также обновляются автоматически.

Node.js уже включён в runtime\win\node.exe. Порты и настройки находятся в params.txt. Legacy-режим для старых браузеров и телевизоров включается из списка браузеров нажатием LEGACY. Полное руководство: help.html.

English
-------

The MSI installation saves state in %LOCALAPPDATA%\FDV Bouldering Timer\runtime-state. Portable packages use runtime-state beside the application; if writing there is denied, the server uses per-user storage. The launcher log shows the selected directory.

1. Extract the complete archive.
2. Run fdv-bouldering-timer.exe.
3. The server app displays local and network addresses, starts the server, and opens the browser.
4. On other displays, open a network address from the app window, for example http://192.168.1.68:8008/.
5. If Windows Firewall asks about Node.js, allow private networks.

Closing the window keeps the app in the Windows notification area. Stop and exit stops the server. Fallback launcher: start-timer-win.bat.

The server listens on all local network interfaces. After a restart the launcher reloads parameters and displayed links; network changes refresh the links automatically as well.

Node.js is bundled in runtime\win\node.exe. Ports and settings are in params.txt. Legacy mode for older browsers and TV browsers is toggled from the browser list by clicking LEGACY. Full guide: help.html.
