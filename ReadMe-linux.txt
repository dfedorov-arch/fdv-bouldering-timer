«Не давать заснуть колонке» включено по умолчанию: короткий тихий тон после длительной тишины, также в ожидании старта и паузе. Работает через выбранный источник звука. Параметры params.txt: speaker_keep_awake=true; speaker_keep_awake_interval_seconds=180 (10–600 с); speaker_keep_awake_gain=0.006 (амплитуда 0.0001–0.1); speaker_keep_awake_frequency_hz=440 (100–2000 Гц). Длительность 150 мс. После изменения params.txt перезапустите сервер. Эффект зависит от модели BT-колонки; слишком тихий тон может не предотвратить сон. В браузере необходима разблокировка звука; сон/заморозка вкладки может задерживать технические сигналы. На сервере они не зависят от активности вкладки. Выключение звука и снятие флажка отменяют технический тон.
Keep speaker awake is on by default: a short quiet tone after prolonged silence, also while waiting or paused. It uses the selected audio output. params.txt: speaker_keep_awake=true; speaker_keep_awake_interval_seconds=180 (10–600 seconds); speaker_keep_awake_gain=0.006 (linear amplitude 0.0001–0.1); speaker_keep_awake_frequency_hz=440 (100–2000 Hz). Duration150ms. Restart the server after parameter changes. Effectiveness depends on the BT speaker; a tone may be too quiet to prevent sleep. Browser playback requires audio unlocking and can be delayed by tab freezing/throttling. Native server playback is independent of tab activity. Muting sound or clearing the checkbox cancels the technical tone.

FDV Bouldering Timer for Linux
==============================

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

Закрытие окна приложения останавливает сервер. Резервный запуск: ./start-timer-linux.sh. В этом режиме Terminal нужно держать открытым, остановка — Ctrl+C.

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

Closing the app window stops the server. Fallback launcher: ./start-timer-linux.sh. Keep Terminal open in fallback mode; stop with Ctrl+C.

The server listens on all local network interfaces. Restart server reloads parameters and displayed links; network changes refresh the links automatically as well.

Node.js is bundled in runtime/linux/bin/node. Linux packages target glibc distributions including Ubuntu, Debian, and Fedora. Alpine Linux/musl requires a compatible Node.js build. Ports and settings are in params.txt. Legacy mode for older browsers and TV browsers is toggled from the browser list by clicking LEGACY. Full guide: help.html.
