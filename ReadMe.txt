Таймер болдеринга: краткий запуск
=================================

Английская версия находится ниже (English version follows below).

Полное руководство:

  help.html


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

Относительный путь считается от папки таймера. Если portable Node.js не найден,
скрипт запуска попробует использовать системный Node.js. Краткие инструкции по
распаковке находятся в runtime\win\README.txt и runtime\mac\README.txt.


2. Запуск
---------

Windows:

  start-timer.bat

Разрешите Node.js доступ к частной сети в Windows Firewall.

macOS:

  start-timer-mac.command

Если запуск запрещён, щёлкните файл правой кнопкой и выберите "Открыть".
При ошибке Permission denied выполните:

  chmod +x start-timer-mac.command create-https-certificate-mac.command

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


6. HTTPS
--------

HTTP работает без сертификата. Для HTTPS запустите:

  Windows: create-https-certificate.bat
  macOS:   create-https-certificate-mac.command

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

Relative paths are resolved from the timer folder. If portable Node.js is not
found, the launcher tries the system Node.js installation. Short extraction
instructions are in runtime\win\README.txt and runtime\mac\README.txt.


2. Starting the timer
---------------------

Windows:

  start-timer.bat

Allow Node.js access to private networks in Windows Firewall.

macOS:

  start-timer-mac.command

If macOS blocks the file, right-click it and select Open. For a Permission
denied error, run:

  chmod +x start-timer-mac.command create-https-certificate-mac.command

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


6. HTTPS
--------

HTTP works without a certificate. For HTTPS run:

  Windows: create-https-certificate.bat
  macOS:   create-https-certificate-mac.command

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
