FDV BOULDERING TIMER
====================

Русский
-------

Назначение
----------

FDV Bouldering Timer — локальный сетевой таймер для соревнований по болдерингу. Один браузер назначается основным и управляет общим состоянием сервера; телефоны, планшеты, компьютеры и телевизоры показывают синхронный экран. Интерфейс работает на русском и английском языках.

Форматы
-------

- Классика: повторяющиеся ротация и короткий перерыв.
- Фестиваль: длинный раунд и перерыв, дополнительные объявления за 60, 30, 10 и 5 минут.
- Финал: одна ротация за запуск; следующая начинается вручную. Поддерживаются старый и новый порядок продвижения участников.

Быстрый запуск
--------------

1. Распакуйте релиз полностью.
2. Windows: запустите fdv-bouldering-timer.exe. macOS/Linux: используйте приложение или штатный скрипт запуска из своей папки.
3. На серверном компьютере откройте http://127.0.0.1:8008/.
4. Включите «Основной браузер» или нажмите Ctrl+M / Ctrl+Ь.
5. На остальных устройствах откройте адрес Wi-Fi/Ethernet, показанный приложением запуска.
6. Выберите формат и параметры. «Старт» запускает немедленно; маленькая кнопка ▶ у времени начала создаёт отложенный старт.

Основные команды
----------------

- Старт: Z / Я.
- Пауза: Ctrl+Q / Ctrl+Й.
- Стоп: P / З.
- Полный экран основного браузера: Ctrl+F / Ctrl+А.
- Назначение основного браузера: Ctrl+M / Ctrl+Ь.

На паузе основной браузер может перетаскивать полосу прогресса. Пока кнопка мыши или касание удерживаются, синхронизация с сервером не должна возвращать полосу назад.

Стартовые списки
----------------

Можно загрузить до четырёх стартовых списков из XLSX, XLS, CSV, TSV, TXT или MXL. В пользовательском интерфейсе они обозначаются LIST 1–4. Термин «протокол» остаётся только во внутренних именах совместимости и в значении HTTP/HTTPS.

- Таблицы показывают подготовку, лазание, завершение, паузы и остановки трасс.
- Значения участников не сокращаются многоточием; при нехватке ширины используется горизонтальная прокрутка. Сокращаться может заголовок.
- Для каждого экрана отдельно выбираются видимые LIST.
- Если выбраны ровно два списка, голубая кнопка переключает одну или две колонки. Оранжевый контур означает раскладку, отличающуюся от стандартной.
- Трассу можно приостановить и возобновить с текущего или будущего цикла. Запланированные границы сразу показываются в тексте инцидента и таблице.
- Участников и трассы можно исключать и восстанавливать.

Экраны и диагностика
--------------------

Основной браузер всегда первый и выделен ярким контуром. Остальные карточки можно переставлять стрелками. Булавка сохраняет место браузера после отключения и повторного подключения. Если браузеров не меньше трёх, кнопка номера в карточке основного браузера показывает одинаковые номера на карточках и в правом верхнем углу поля таймера экранов.

Плашки расположены в порядке LEGACY, AUDIO, TIME, NET, SYNC, SSE, TAB, затем LIST 1–4.

- Серый: функция или параметр недоступны.
- Тёмно-зелёный: доступны, но неактивны.
- Светло-зелёный: активны или работают нормально.
- Жёлтый: предупреждение.
- Красный: ошибка либо требуемая функция не работает.
- Голубой: список показан или активна кнопка раскладки.
- Оранжевый контур: ручной Legacy на совместимом браузере или нестандартная раскладка двух списков.

LEGACY переключает облегчённую страницу старого телевизора. AUDIO показывает доступность, разблокировку и реальное продвижение аудиочасов. TIME включает компактные часы сервера под таймером. NET показывает сеть, SYNC — оценку синхронизации и задержки отрисовки, SSE — поток команд, TAB — видимость вкладки и, в обычном браузере, Wake Lock.

Порог NET: до 100 мс зелёный, 100–200 мс жёлтый, выше 200 мс красный. Порог задержки отрисовки и аудиочасов: до 100 мс зелёный, 100–250 мс жёлтый, выше 250 мс красный.

Legacy и временная потеря сети
-----------------------------

Legacy предназначен для старых ТВ-браузеров. Он показывает таймер, выбранные LIST и при включённом TIME часы сервера, но не воспроизводит звук. Страница использует XHR вместо SSE и продолжает локальный отсчёт при временной потере сети. Отложенный старт Классики и Фестиваля привязан к абсолютной отметке времени и должен наступить даже без сети; после восстановления экран принимает авторитетное состояние сервера.

Обычный экран также продолжает расчёт из последней временной шкалы. После длительной недоступности сервера предлагается автономный режим. Возврат к серверу выполняется явно, потому что автономные команды не отправляются назад.

Звук
----

Звук основного браузера и звук других браузеров настраиваются отдельно. Браузер требует хотя бы одного касания для разблокировки. Дополнительный браузер на том же компьютере, что и основной, не дублирует звук. AUDIO открывает поправку от −500 до +500 мс и тест сигналов. Профили находятся в beeps; поддерживаются WAV и MP3.

Настройки и помощь
------------------

Начальные параметры, порты, цвета, шрифт и профиль звука задаются в params.txt и читаются при запуске сервера. Полное двуязычное руководство: help.html. Техническая карта документации: docs/documentation-map.md.

Автономная версия
-----------------

fdv-bouldering-timer-standalone.html работает одним файлом без Node.js и сети, но не синхронизирует другие браузеры. Android APK с пометкой standalone — тот же одиночный автономный таймер: в нём нет сервера, сетевых экранов и синхронизации. Обычный index.html также может работать напрямую после генерации lib/offline-audio.js.


English
-------

Purpose
-------

FDV Bouldering Timer is a local-network competition timer. One primary browser controls authoritative server state while phones, computers, tablets, and televisions show synchronized displays. Russian and English interfaces are included.

Formats
-------

- Classic: repeating rotation and short break.
- Festival: long round and break with optional 60, 30, 10, and 5 minute announcements.
- Final: one rotation per Start, followed by an operator-controlled next attempt; Old and New participant schedules are supported.

Quick start
-----------

1. Extract the complete release.
2. Start fdv-bouldering-timer.exe on Windows or the supplied app/script on macOS or Linux.
3. Open http://127.0.0.1:8008/ on the server computer.
4. Enable Primary browser or press Ctrl+M.
5. Open the Wi-Fi/Ethernet address shown by the launcher on each display.
6. Select a format and durations. Start runs immediately; the small ▶ beside Start time creates a scheduled start.

Keys: Z Start, Ctrl+Q Pause, P Stop, Ctrl+F fullscreen, Ctrl+M primary browser. While paused, the primary browser can drag the progress bar; server synchronization does not take control while the pointer is held.

Start lists
-----------

Load up to four lists from XLSX, XLS, CSV, TSV, TXT, or MXL. The user interface calls them LIST 1–4; old “protocol” names remain only in internal compatibility identifiers and the HTTP/HTTPS meaning.

Participant cells are never ellipsized. Each display selects its own visible LIST badges. With exactly two visible lists, a cyan button switches one or two columns; an orange outline marks a non-default layout. Route incidents can suspend and resume a route at a current or future cycle, and participants or routes can be excluded and restored.

Browsers and diagnostics
------------------------

The primary browser is always first and has a brighter border. Arrows reorder other cards; a pin preserves a browser's place through reconnects. With at least three browsers, the number button in the primary card displays matching numbers on cards and in the top-right corner of every timer area.

Badge order is LEGACY, AUDIO, TIME, NET, SYNC, SSE, TAB, followed by LIST 1–4. Gray means unavailable, dark green available but inactive, light green active/healthy, yellow warning, red fault, cyan visible list/layout control, and orange outline a manual Legacy choice or non-default two-list layout.

LEGACY selects the simplified old-browser page. AUDIO reports availability, unlock state, and real audio-clock progress. TIME shows a compact server clock below the timer. NET reports request latency, SYNC clock/render timing, SSE instant command delivery, and TAB visibility plus Wake Lock on modern browsers.

NET is green up to 100 ms, yellow from 100 to 200 ms, and red above 200 ms. Render and audio-clock progress are green below 100 ms, yellow from 100 to 250 ms, and red above 250 ms.

Legacy and network loss
-----------------------

Legacy is intended for older TV browsers. It shows the timer, selected LIST tables, and the optional TIME clock, but has no sound. It uses XHR rather than SSE and continues locally through a temporary network interruption. A scheduled Classic or Festival start is anchored to its absolute timestamp and must occur while offline; reconnecting applies authoritative server state.

The modern page also extrapolates from the last known timeline. After a longer server outage it offers Standalone mode. Returning to server state is explicit because standalone commands are not uploaded.

Sound, settings, and help
-------------------------

Primary and remote-display sound are controlled separately. A tap is required to unlock audio. A second browser on the primary computer does not duplicate sound. AUDIO provides a −500 to +500 ms user offset and signal tests. WAV and MP3 profiles live under beeps.

Startup values, ports, colors, timer font, and sound profile are read from params.txt. The complete bilingual guide is help.html; the documentation map is docs/documentation-map.md.

fdv-bouldering-timer-standalone.html is a one-file offline timer without multi-browser synchronization. The Android APK marked standalone is the same single-device timer: it has no server, LAN displays, or synchronization.
