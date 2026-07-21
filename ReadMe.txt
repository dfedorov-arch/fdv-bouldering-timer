Таймер болдеринга: краткий запуск
=================================

Английская версия находится ниже (English version follows below).

Полное руководство:

  help.html

Готовые portable-архивы для Windows, macOS и Linux:

  https://github.com/dfedorov-arch/fdv-bouldering-timer/releases


1. Перенос на другой компьютер
------------------------------

Скопируйте папку fdv-bouldering-timer целиком.

Для работы нужен Node.js LTS:

  https://nodejs.org/en/download

Проверка установленного Node.js:

  node -v

Пути к portable Node.js задаются в params.txt:

  portable_node_win=runtime\win\node.exe
  portable_node_mac=runtime/mac/bin/node
  portable_node_linux=runtime/linux/bin/node

Относительный путь считается от папки таймера. Если portable Node.js не найден,
скрипт запуска попробует использовать системный Node.js. Краткие инструкции по
распаковке находятся в runtime\win\README.txt, runtime\mac\README.txt и
runtime/linux/README.txt.


2. Запуск
---------

Windows:

  fdv-bouldering-timer.exe

EXE показывает адреса, открывает браузер и позволяет перезапустить или остановить
сервер. При закрытии окна он продолжает работать в области уведомлений Windows.
Резервный способ запуска:

  start-timer-win.bat

Разрешите Node.js доступ к частной сети в Windows Firewall.

macOS:

  FDV Bouldering Timer.app

Резервный способ запуска:

  start-timer-mac.command

Если запуск запрещён, щёлкните приложение или файл правой кнопкой и выберите "Открыть". Если macOS продолжает блокировать запуск, откройте Системные настройки → Конфиденциальность и безопасность и нажмите "Всё равно открыть" / "Разрешить" для FDV Bouldering Timer. Если macOS продолжает блокировать приложение сервера или portable Node.js, снимите quarantine-атрибут с распакованной папки:

  xattr -dr com.apple.quarantine .
  xattr -dr com.apple.quarantine "FDV Bouldering Timer.app"
  xattr -dr com.apple.quarantine "/полный/путь/к/fdv-bouldering-timer-v1.0.7-macos-arm64"

При ошибке Permission denied выполните:

  chmod +x fdv-bouldering-timer start-timer-mac.command create-https-certificate-mac.command

Linux:

  ./start-timer-linux.sh

При ошибке Permission denied выполните:

  chmod +x start-timer-linux.sh create-https-certificate-linux.sh

Не закрывайте окно сервера или Terminal во время работы таймера.


3. Адреса
---------

На компьютере сервера:

  http://127.0.0.1:8008/

На других устройствах откройте сетевой адрес, напечатанный скриптом запуска,
например http://192.168.1.68:8008/. Все устройства должны находиться в одной
локальной сети.


4. Первоначальная настройка
--------------------------

При необходимости измените params.txt и перезапустите сервер. Основные параметры:

  http_port=8008
  https_port=8443
  language=ru
  classic_rotation_minutes=5
  classic_break_seconds=15
  festival_round_minutes=120
  festival_break_minutes=30
  festival_announcements=true
  final_rotation_minutes=4
  sound_profile=FSR_2026

  timer_font_file=Roboto-Variable.ttf
  timer_font=Arial, sans-serif
  rotation_text_color=#f4f7fb
  rotation_last_five_text_color=#f4f7fb
  break_text_color=#f4f7fb
  rotation_background_color=#0e1116
  rotation_last_five_background_color=#0e1116
  break_background_color=#f05a59

Каждый подкаталог в beeps является звуковым профилем. Используются файлы START,
END, MINUTE и WARNING в WAV или MP3. Для фестивальных объявлений поддерживаются
FESTIVAL_60, FESTIVAL_30, FESTIVAL_10 и FESTIVAL_5. Если END отсутствует,
используется START. Подробности находятся в help.html и beeps\README.txt.

При каждом запуске сервера автоматически обновляется lib/offline-audio.js. Он содержит
автономную копию профилей и позволяет открыть index.html напрямую без сервера со
звуком. После замены файлов в beeps один раз запустите таймер для обновления копии.
В автономном режиме плитка текущего браузера позволяет открыть AUDIO, настроить
поправку звука и проверить четыре типа сигналов.

Файл шрифта берётся из каталога fonts и загружается всеми экранами с локального
сервера. timer_font задаёт резервные системные шрифты. Поддерживаются WOFF2,
WOFF, TTF и OTF; указывайте только имя файла без пути. Размер цифр всегда
рассчитывается автоматически как максимально возможный.
Готовые варианты перечислены в fonts\README.txt. Все включённые шрифты имеют
обычный пустой ноль; у Roboto, Open Sans и Barlow Condensed круглое двоеточие.


5. Основные действия
--------------------

1. Включите "Основной браузер" в управляющем браузере.
2. Выберите формат и длительности.
3. Нажмите "Старт" для немедленного запуска.
4. Для запуска по часам задайте время и нажмите маленькую кнопку ▶.

Горячие клавиши:

  Z / Я             Старт или продолжить
  Ctrl+Q / Ctrl+Й   Пауза
  P / З             Сброс
  Ctrl+F / Ctrl+А   Полный экран
  Ctrl+M / Ctrl+Ь   Назначить основным

Пробел не управляет стартом или паузой.

Legacy-режим для старых браузеров и телевизоров включается из списка браузеров нажатием на индикатор LEGACY. Такой экран показывает только крупное время, использует упрощённый JavaScript и XHR-синхронизацию, не воспроизводит звук и возвращается в обычный режим повторным нажатием LEGACY из основного браузера.


6. HTTPS
--------

HTTP работает без сертификата. Для HTTPS запустите:

  Windows: create-https-certificate.bat
  macOS:   create-https-certificate-mac.command
  Linux:   create-https-certificate-linux.sh

Затем перезапустите таймер. После переноса на другой компьютер или изменения
локального IP сертификат рекомендуется создать заново.


7. Если экран не подключается
-----------------------------

Проверьте, что устройства находятся в одной негостевой сети, в адресе указан
порт, используется IP Wi-Fi или Ethernet, Node.js разрешён в Firewall, а VPN
отключён. Подробные инструкции находятся в help.html.


Лицензия
--------

Проект распространяется по лицензии MIT. Полный текст находится в LICENSE.

2026 Фёдоров Денис + Codex


==========================================================================

Bouldering Timer: Quick Start
=============================

Full user guide:

  help.html

Ready-to-use portable packages for Windows, macOS, and Linux:

  https://github.com/dfedorov-arch/fdv-bouldering-timer/releases


1. Moving to another computer
-----------------------------

Copy the entire fdv-bouldering-timer folder.

Node.js LTS is required:

  https://nodejs.org/en/download

Check the installed version:

  node -v

Portable Node.js paths are configured in params.txt:

  portable_node_win=runtime\win\node.exe
  portable_node_mac=runtime/mac/bin/node
  portable_node_linux=runtime/linux/bin/node

Relative paths are resolved from the timer folder. If portable Node.js is not
found, the launcher tries the system Node.js installation. Short extraction
instructions are in runtime\win\README.txt, runtime\mac\README.txt, and
runtime/linux/README.txt.


2. Starting the timer
---------------------

Windows:

  fdv-bouldering-timer.exe

The EXE displays addresses, opens the browser, and can restart or stop the
server. Closing its window keeps it running in the Windows notification area.
Fallback launcher:

  start-timer-win.bat

Allow Node.js access to private networks in Windows Firewall.

macOS:

  FDV Bouldering Timer.app

Fallback launcher:

  start-timer-mac.command

If macOS blocks the app or file, right-click it and select Open. If launch is still blocked, open System Settings → Privacy & Security and click Open Anyway / Allow for FDV Bouldering Timer. If macOS still blocks the server app or bundled Node.js runtime, clear the quarantine attribute on the extracted folder:

  xattr -dr com.apple.quarantine .
  xattr -dr com.apple.quarantine "FDV Bouldering Timer.app"
  xattr -dr com.apple.quarantine "/full/path/to/fdv-bouldering-timer-v1.0.7-macos-arm64"

For a Permission denied error, run:

  chmod +x fdv-bouldering-timer start-timer-mac.command create-https-certificate-mac.command

Linux:

  ./start-timer-linux.sh

For a Permission denied error, run:

  chmod +x start-timer-linux.sh create-https-certificate-linux.sh

Official portable Node.js Linux builds target glibc distributions. Alpine Linux
and other musl systems require a compatible Node.js build.

Keep the server or Terminal window open while the timer is in use.


3. Addresses
------------

On the server computer:

  http://127.0.0.1:8008/

On other devices, open a network address printed by the launcher, for example
http://192.168.1.68:8008/. All devices must be on the same local network.


4. Initial configuration
------------------------

Edit params.txt if required, then restart the server. Main parameters:

  http_port=8008
  https_port=8443
  language=ru
  classic_rotation_minutes=5
  classic_break_seconds=15
  festival_round_minutes=120
  festival_break_minutes=30
  festival_announcements=true
  final_rotation_minutes=4
  sound_profile=FSR_2026

  timer_font_file=Roboto-Variable.ttf
  timer_font=Arial, sans-serif
  rotation_text_color=#f4f7fb
  rotation_last_five_text_color=#f4f7fb
  break_text_color=#f4f7fb
  rotation_background_color=#0e1116
  rotation_last_five_background_color=#0e1116
  break_background_color=#f05a59

Each subfolder in beeps is a sound profile. Profiles use START, END, MINUTE and
WARNING files in WAV or MP3 format. Festival announcements may use FESTIVAL_60,
FESTIVAL_30, FESTIVAL_10 and FESTIVAL_5. START is used when END is missing. See
help.html and beeps\README.txt for details.

Every server start automatically refreshes lib/offline-audio.js. It contains a standalone
copy of the profiles, allowing index.html to be opened directly without the server
and retain sound. After replacing files in beeps, start the timer once to refresh it.
In standalone mode, the current-browser card provides AUDIO offset adjustment and
local tests for all four signal types.

The font file is loaded from the fonts folder by every display through the
local server. timer_font defines system fallbacks. WOFF2, WOFF, TTF and OTF are
supported; specify a file name without a path. Digit size is always calculated
automatically to fill the available space.
Bundled choices are listed in fonts\README.txt. Every included font has a plain,
empty zero; Roboto, Open Sans and Barlow Condensed have round colon dots.


5. Main controls
----------------

1. Enable Primary browser in the controlling browser.
2. Select a format and durations.
3. Press Start for an immediate start.
4. For a scheduled start, enter the time and press the small ▶ button.

Keyboard shortcuts:

  Z          Start or resume
  Ctrl+Q     Pause
  P          Reset
  Ctrl+F     Fullscreen
  Ctrl+M     Set as primary browser

Space does not start or pause the timer.

Legacy mode for older browsers and TV browsers is toggled from the browser list by clicking the LEGACY badge. That display shows only the large time, uses simplified JavaScript and XHR synchronization, does not play sound, and returns to the normal interface when LEGACY is clicked again from the primary browser.


6. HTTPS
--------

HTTP works without a certificate. For HTTPS run:

  Windows: create-https-certificate.bat
  macOS:   create-https-certificate-mac.command
  Linux:   create-https-certificate-linux.sh

Restart the timer afterwards. Recreate the certificate after moving to another
computer or changing the local IP address.


7. If a display cannot connect
------------------------------

Check that all devices use the same non-guest network, the address includes the
port, a Wi-Fi or Ethernet IP is used, Node.js is allowed through the firewall,
and VPN is disabled. See help.html for detailed troubleshooting.


License
-------

This project is distributed under the MIT License. See LICENSE for the full text.

2026 Fedorov Denis + Codex
