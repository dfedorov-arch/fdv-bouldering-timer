FDV Bouldering Timer for Linux
==============================

Русский
-------

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

Закрытие окна приложения останавливает сервер. Резервный запуск: ./start-timer-linux.sh. В этом режиме Terminal нужно держать открытым, остановка — Ctrl+C.

Node.js уже включён в runtime/linux/bin/node. Linux-пакеты рассчитаны на glibc-дистрибутивы, включая Ubuntu, Debian и Fedora. Alpine Linux/musl требует совместимую сборку Node.js. Порты и настройки находятся в params.txt. Legacy-режим для старых браузеров и телевизоров включается из списка браузеров нажатием LEGACY. Полное руководство: help.html.

English
-------

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

Closing the app window stops the server. Fallback launcher: ./start-timer-linux.sh. Keep Terminal open in fallback mode; stop with Ctrl+C.

Node.js is bundled in runtime/linux/bin/node. Linux packages target glibc distributions including Ubuntu, Debian, and Fedora. Alpine Linux/musl requires a compatible Node.js build. Ports and settings are in params.txt. Legacy mode for older browsers and TV browsers is toggled from the browser list by clicking LEGACY. Full guide: help.html.
