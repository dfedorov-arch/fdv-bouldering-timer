Сборка436: текущие настройки и интерфейс включены во все варианты релизов. Серверный звук добавлен для macOS (Core Audio, Intel/Apple Silicon) и Linux (ALSA default, x64/ARM64), с общей очередью PCM, подстройкой браузера и его флажком отключения серверного вывода. Unix-лаунчер показывает номер сборки. Автономный HTML и Android сохраняют браузерный звук.
Build436: current UI/preferences are shared across release targets. Native server audio now supports macOS Core Audio and Linux ALSA on x64/ARM64 with the shared PCM scheduler, browser correction and opt-out. Unix launchers show the server build. Standalone HTML and Android retain browser audio.

Строка звука: без основного браузера чекбокс выровнен с верхними строками. При выбранном основном отступ от подписи10px; на узкой/средней панели подпись сокращается до «Звук в основном», с подсказкой «Звук в основном браузере».
Sound row: without a primary browser the checkbox aligns with the rows above. With a primary, the caption gap is10px; narrow/medium panels show “Sound in primary”, with the full “Sound in primary browser” tooltip.

«Не давать заснуть колонке» включено по умолчанию: короткий тихий тон после длительной тишины, также в ожидании старта и паузе. Работает через выбранный источник звука. Параметры params.txt: speaker_keep_awake=true; speaker_keep_awake_interval_seconds=180 (10–600 с); speaker_keep_awake_gain=0.006 (амплитуда 0.0001–0.1); speaker_keep_awake_frequency_hz=440 (100–2000 Гц). Длительность 150 мс. После изменения params.txt перезапустите сервер. Эффект зависит от модели BT-колонки; слишком тихий тон может не предотвратить сон. В браузере необходима разблокировка звука; сон/заморозка вкладки может задерживать технические сигналы. На сервере они не зависят от активности вкладки. Выключение звука и снятие флажка отменяют технический тон.
Keep speaker awake is on by default: a short quiet tone after prolonged silence, also while waiting or paused. It uses the selected audio output. params.txt: speaker_keep_awake=true; speaker_keep_awake_interval_seconds=180 (10–600 seconds); speaker_keep_awake_gain=0.006 (linear amplitude 0.0001–0.1); speaker_keep_awake_frequency_hz=440 (100–2000 Hz). Duration150ms. Restart the server after parameter changes. Effectiveness depends on the BT speaker; a tone may be too quiet to prevent sleep. Browser playback requires audio unlocking and can be delayed by tab freezing/throttling. Native server playback is independent of tab activity. Muting sound or clearing the checkbox cancels the technical tone.

В диагностике AUDIO флажок справа от статуса разрешает звук через сервер для выбранного браузера (включён по умолчанию). Снимите его для браузерного звука; в скрытой или спящей вкладке сигналы могут пропадать. Подстройка сохраняется. Выбор сохраняется по идентификатору вкладки, переживает разрыв связи, её перезагрузку и восстановление сервера; новая вкладка имеет отдельный идентификатор и настройки.
In AUDIO diagnostics, the checkbox beside the status allows server playback for the selected browser (on by default). Uncheck for browser audio; hidden or sleeping tabs may miss signals. The sound offset is preserved. The choice is saved by tab ID across disconnection, reload and server restoration; a new tab has its own ID and settings.

FDV BOULDERING TIMER
====================

Русский
-------
Сборка 429: допуск серверной точки старта и допуск браузерной технической подготовки установлены в 10 мс включительно. Сервер сравнивает с сохранённой точкой без накопления дрейфа; браузер дополнительно требует ту же календарную метку запуска. Превышение допуска и смена запуска/фазы по-прежнему отменяют устаревшую подготовку. Часы таймера и пользовательская подстройка не изменены.
Сборка 428: допуск изменения точки старта для серверного звукового расписания увеличен до 50 мс включительно. Сравнение ведётся с сохранённой точкой, поэтому последовательные небольшие изменения не накапливаются. Сдвиг больше 50 мс обновляет очередь. Браузерное воспроизведение, подстройка и часы таймера не изменены.
Сборка 427: исправлен пропуск минутного предупреждения перед первой ротацией при ожидании запланированного старта с серверным звуком. Подмиллисекундная погрешность повторных измерений больше не сбрасывает звуковую очередь. Подстройка сохранена; реальный перенос времени старта, Пауза, Стоп и выключение звука по-прежнему отменяют устаревшие сигналы.
Сборка 426: исправлена уязвимость серверного звука к задержкам подачи аудиоданных. Вместо двух блоков с общим запасом 40 мс используются три блока с запасом 120 мс; запись JSON вынесена из звукового потока. Временные цели сигналов и пользовательская подстройка сохранены. В диагностике сервера появились показатели подачи PCM. Браузер не дублирует сигналы при активном серверном выводе.
Сборка 425: На Windows звук автоматически передаётся серверу, если современный браузер открыт на том же компьютере и ему разрешено звучать. Сохраняются выбранный профиль и подстройка звука этого браузера, включая тестовую подстройку. Скрытие или заморозка вкладки не прерывает серверное расписание. Пауза, Стоп, выключение звука, отзыв роли и закрытие страницы отменяют соответствующие сигналы; один компьютер не дублирует звук нескольких вкладок. При недоступности нативного проигрывателя используется браузер. Сервер и Windows должны продолжать работать; сон компьютера не обходится. На других ОС, удалённых устройствах, в автономном HTML и APK звук остаётся браузерным; Legacy по-прежнему без звука.

Назначение
----------

FDV Bouldering Timer — локальный сетевой таймер для соревнований по болдерингу. Один браузер назначается основным и управляет общим состоянием сервера; телефоны, планшеты, компьютеры и телевизоры показывают синхронный экран. Интерфейс работает на русском и английском языках.

Форматы
-------

- Классика: повторяющиеся ротация и короткий перерыв.
- Фестиваль: длинный раунд и перерыв, дополнительные объявления за 60, 30, 10 и 5 минут.
- Финал: одна ротация за запуск; следующая начинается вручную. Поддерживаются старый и новый порядок продвижения участников.
- После «Стоп» смена начатого Финала на Классику/Фестиваль или «Старый / Новый» требует подтверждения завершения Финала. Отмена ничего не меняет; согласие сбрасывает счётчик до начала нового Финала. Смена «Старый / Новый» сохраняет длительность и число ротаций отдыха. Пауза не заменяет «Стоп».
- При завершении на 00:00 фон и цифры сразу получают цвета перерыва (по умолчанию красный фон), без запуска отдельного перерыва. Пройденные трассы в списках обозначаются сине-фиолетовыми ромбами.

Быстрый запуск
--------------

1. Распакуйте релиз полностью.
2. Windows: запустите fdv-bouldering-timer.exe. macOS/Linux: используйте приложение или штатный скрипт запуска из своей папки. Готовые установщики доступны в GitHub Releases и через Komi Store для Windows, macOS, Linux и Android.
3. На серверном компьютере откройте http://127.0.0.1:8008/.
4. Включите «Основной браузер» или нажмите Ctrl+M.
5. На остальных устройствах откройте адрес Wi-Fi/Ethernet, показанный приложением запуска.
6. Выберите формат и параметры. «Старт» запускает немедленно; маленькая кнопка ▶ у времени начала создаёт отложенный старт.

Основные команды
----------------

- Старт: Z.
- Пауза: Ctrl+Q.
- Стоп: P.
- Полный экран основного браузера: Ctrl+F.
- Назначение основного браузера: Ctrl+M.

Горячие клавиши работают при английской и русской раскладке.

На паузе основной браузер может перетаскивать полосу прогресса. Пока кнопка мыши или касание удерживаются, синхронизация с сервером не должна возвращать полосу назад.

Стартовые списки
----------------

Число трасс сохраняется по Enter, Tab или при выходе из поля; стрелки применяют изменение сразу. Синхронизация не сбрасывает ввод, в том числе при запущенном таймере. При ошибке значение остаётся с пояснением; Enter повторяет сохранение.

Можно загрузить до четырёх стартовых списков из XLSX, CSV, TSV, TXT или MXL. В пользовательском интерфейсе они обозначаются LIST 1–4. Термин «протокол» остаётся только во внутренних именах совместимости и в значении HTTP/HTTPS.

На экранах с видимыми списками под таймером отображается плашка номера ротации, в том числе в полном экране и Legacy. Она доступна только для чтения; стрелки изменения номера скрыты, включая Firefox. Без списков плашка скрыта. Перед запланированным стартом показывается «Ожидание старта».

- Таблицы показывают подготовку, лазание, завершение, паузы и остановки трасс.
- Значения участников не сокращаются многоточием; при нехватке ширины используется горизонтальная прокрутка. Сокращаться может заголовок.
- Для каждого экрана отдельно выбираются видимые LIST.
- Если выбраны ровно два списка, голубая кнопка переключает одну или две колонки. Оранжевый контур означает раскладку, отличающуюся от стандартной.
- Трассу можно приостановить и возобновить с текущей или будущей ротации. Запланированные границы сразу показываются в тексте инцидента и таблице.
- За ротацию до возобновления значки этой паузы исчезают; участники, выходящие в следующей ротации, видят жёлтые треугольники подготовки.
- При известном конце паузы значки отмечают лазание в период остановки и подготовку только к трассам 2 и далее. Подготовка к первой трассе не получает значок паузы. Сдвиг расписания сохраняется. Без заданного возобновления прежние значки остаются. Описание заканчивается последней приостановленной ротацией: пауза с 17 и возобновление с 19 означают «с ротации 17 по ротацию 18».
- Запланированные паузы с удержанием всей волны рассчитываются по порядку ротаций. Изменение более ранней паузы автоматически пересчитывает участников последующих пауз, включая уже сохранённые списки.
- Полная остановка трассы с той же или более ранней ротации делает её будущую паузу неактивной: лишних значков паузы и задержек на остальных трассах нет. Если пауза началась до полной остановки, её накопленный сдвиг сохраняется.
- При удалении такой остановки обе границы паузы сохраняются: пауза с 17 по 17 снова возобновляется с ротации 18.
- При выборе будущей ротации автоматически включается флажок «Остановить всю волну с этой ротации»: участники связанной волны не выходят и на предыдущие трассы. Оператор может снять флажок; для текущей или прошедшей ротации он по умолчанию выключен.
- Участников и трассы можно исключать и восстанавливать.

Резервный сервер
--------------------

При открытии основного браузера по HTTP через localhost/127.0.0.1 сервер передаёт резерву адрес используемого сетевого интерфейса; резерв проверяет доступность и идентификатор основного. Сетевой адрес или домен, уже использованный браузером, сохраняется. Для HTTPS откройте основной сервер по сетевому имени из доверенного сертификата. Если выбранный адрес недоступен резерву или экранам (например, NAT/VDS), откройте основной по доступному сетевому адресу и повторите настройку.

Если отключение запрещено, сообщение перечислит подключённые к резерву браузеры. Верните их на основной через плашки диагностики либо закройте вкладки, подождите 6–8 секунд и повторите. Существующую пару со старым адресом 127.0.0.1 после обновления настройте заново: сохранённые адреса автоматически не изменяются.

В основном браузере нажмите SEC рядом с PIN и укажите адрес пустого сервера той же сборки с одинаковыми звуками и шрифтами. Зелёный контур подтверждает связь. Резерв зеркалирует состояние, списки, команды и шкалу времени, а без основного продолжает отсчёт самостоятельно.

После 20 секунд без ответа основного сервера браузеры переходят на доступный резерв при очередной проверке. Плашка SEC после TAB: серая — недоступен, тёмно-зелёная — доступен, светло-зелёная — браузер подключён к резерву. Нажатие переводит выбранный браузер, а в карточке основного — всех. Обратного автоматического перехода нет. Диагностика объединяет подключения обоих серверов.

Адрес должен быть доступен всем экранам и основному серверу. HTTPS требует доверия к сертификату не только в браузерах, но и в Node.js основного сервера; подтверждения предупреждения браузера недостаточно. HTTPS-страница не может обращаться к HTTP-резерву. Standalone HTML и автономный режим APK не используют резервный сервер; в сетевом режиме APK резервный сервер работает как в обычном экране. При полном разделении сети два сервера без внешнего арбитра не гарантируют единственную управляющую сторону.

Светло-зелёная SEC при повторном нажатии возвращает экран на текущий основной сервер; в карточке управляющего — всю группу. Это именно текущий основной после возможной смены ролей. Диагностика остаётся в одной строке, плашка Legacy всегда подписана LEG.

После общего перехода старый сервер при возвращении автоматически становится резервом нового основного, получая его актуальное состояние и назначение управляющего браузера. Новый основной не меняется, адрес резервного сервера обновляется. Сначала проверяется обратный сетевой доступ; для HTTPS сертификатам должны доверять оба сервера. Если доступа нет, новый основной продолжает работать, а старый остаётся заблокированным и повторяет проверку.

Сохранение состояния
--------------------

Установленная версия сохраняет состояние в пользовательском каталоге: Windows — %LOCALAPPDATA%\FDV Bouldering Timer\runtime-state; macOS — ~/Library/Application Support/FDV Bouldering Timer/runtime-state; Linux — ~/.local/state/fdv-bouldering-timer/runtime-state (или каталог XDG_STATE_HOME). Portable-версия сохраняет состояние рядом с таймером; если запись запрещена, используется пользовательский каталог. Выбранный путь показывается в журнале лаунчера.

Экраны и диагностика
--------------------

Основной браузер всегда первый и выделен ярким контуром. Остальные карточки можно переставлять стрелками. Булавка сохраняет место браузера после отключения и повторного подключения. Если браузеров не меньше трёх, кнопка номера в карточке основного браузера показывает одинаковые номера на карточках и в правом верхнем углу поля таймера экранов.

Плашки расположены в порядке LEG, CTRL, AUDIO, TIME, NET, SYNC, SSE, TAB, SEC (если настроен резерв), затем LIST 1–4.

- Серый: функция или параметр недоступны.
- Тёмно-зелёный: доступны, но неактивны.
- Светло-зелёный: активны или работают нормально.
- Жёлтый: предупреждение.
- Красный: ошибка либо требуемая функция не работает.
- Голубой: список показан или активна кнопка раскладки.
- Оранжевый контур: ручной Legacy на совместимом браузере или нестандартная раскладка двух списков.

CTRL назначает современному экрану ограниченное управление: Старт/Стоп/Пауза/Экран и Z/Я, P/З, Ctrl+Q/Й, Ctrl+F/А. Назначает и отзывает основной браузер. Тёмно-зелёная плашка доступна, светло-зелёная включена; в Legacy — серая. Остальные настройки остаются у основного браузера.
Чекбокс «Звук в перерыве» рядом с «Мигание» по умолчанию включён. Снимите его, чтобы отключить только короткие сигналы последних пяти секунд перерыва на всех современных экранах; вспышки и сигнал старта сохраняются. Выбор сохраняется. За минуту до запланированного старта звучит MINUTE, в том числе при предварительном отсчёте Финала.

LEG переключает облегчённую страницу старого телевизора. AUDIO показывает доступность, разблокировку и реальное продвижение аудиочасов. TIME включает компактные часы сервера под таймером. NET показывает сеть, SYNC — оценку синхронизации и задержки отрисовки, SSE — поток команд, TAB — видимость вкладки и, в обычном браузере, Wake Lock.

Порог NET: до 100 мс зелёный, 100–200 мс жёлтый, выше 200 мс красный. Порог задержки отрисовки и аудиочасов: до 100 мс зелёный, 100–250 мс жёлтый, выше 250 мс красный.

После расхождения часов браузера SYNC красный до нового измерения по серверу; подсказка и предупреждение «Требуется проверка времени» объясняют причину. Оценка ошибки учитывает и ещё не применённую поправку, а не только сетевую задержку.

Legacy и временная потеря сети
-----------------------------

Legacy предназначен для старых ТВ-браузеров. Он показывает таймер, выбранные LIST и при включённом TIME часы сервера, но не воспроизводит звук. Страница использует XHR вместо SSE и продолжает локальный отсчёт при временной потере сети. Отложенный старт Классики и Фестиваля привязан к абсолютной отметке времени и должен наступить даже без сети; после восстановления экран принимает авторитетное состояние сервера.

В портретном режиме колонки номера и трасс компактные, а ФИО сохраняется целиком без наложения значков. Если данные шире экрана, список можно прокрутить по горизонтали.

Обычный экран также продолжает расчёт из последней временной шкалы. Обычное возвращение сети сохраняет калибровку часов и корректное расписание звука. После длительной недоступности сервера предлагается автономный режим. На странице, открытой через сервер, восстановление контакта автоматически возвращает серверное состояние; автономные команды и изменения не отправляются назад и отбрасываются. Прямая однофайловая автономная версия сервера не использует.

Сон или перевод системных часов могут нарушить доверие к измерениям времени. В таком случае прежний монотонный отсчёт продолжается с предупреждением, а сигналы приостанавливаются до проверки по серверу: системные часы не используются для скачка времени. Если сервера нет, Стоп, затем Старт задают новый автономный отсчёт, но не восстанавливают точность прежнего. Перед соревнованием отдельно проверьте обрыв сети, сон/пробуждение и переходы ротаций на физических устройствах. Эта новая логика относится к обычному экрану, не к упрощённой синхронизации Legacy.

При первом подключении обычный экран, включая сетевой режим APK, показывает «Синхронизация времени» и --:-- до измерения времени сервера; звуковые события в этот момент не планируются. После измерения экран сразу показывает текущий отсчёт. Перевод календарных часов сервера не сдвигает уже запущенный таймер и его звуковое расписание. Запуск по заданному времени и восстановление после перезапуска по-прежнему учитывают календарные часы. Прямая автономная версия и автономный режим APK не ждут серверной синхронизации.

Звук
----

В v2.3.1 исправлен стартовый сигнал ручного запуска Финала на дополнительных современных браузерах. После обновления перезапустите сервер и обновите все страницы таймера; звук должен быть разрешён и разблокирован на каждом звуковом устройстве. Предварительный отсчёт Финала по-прежнему требует отдельного ручного старта.

Дополнительный короткий прогрев запускается за 10 секунд до первого сигнала серии, минутного предупреждения и запланированного старта; ближние прогревы сохраняются. Запоздавшая техническая подготовка допускается, пока актуальны запуск и фаза. Основные сигналы сохраняют прежние допуски. no_sound_warm=true также отключает дополнительные тихие тоны.

При переключении вкладки звук сохраняется. В существующем цикле таймера проверяются задержки JavaScript и ход звуковых часов. После обнаруженного разрыва восстанавливаются будущие сигналы; уже подготовленный звук сохраняется, если аудиочасы исправны. Сон устройства и принудительная заморозка страницы могут прервать воспроизведение. На Windows локальный браузер автоматически использует серверный звук (см. сборку 425).

Звук основного браузера и звук других браузеров настраиваются отдельно. Браузер требует хотя бы одного касания для разблокировки. Дополнительный браузер на том же компьютере, что и основной, не дублирует звук. AUDIO открывает поправку от −500 до +500 мс и тест сигналов. Профили находятся в beeps; поддерживаются WAV и MP3.

Настройки и помощь
------------------

Начальные параметры, порты, цвета, шрифт и профиль звука задаются в params.txt и читаются при запуске сервера. Полное двуязычное руководство: help.html. Техническая карта документации: docs/documentation-map.md.

Цвета значков списка: list_ready_color — подготовка, list_active_color — лазание, list_done_color — пройденная трасса (#48488C), list_paused_color — пауза, list_stopped_color — полная остановка. Формат #RRGGBB или #RGB; неверные значения заменяются стандартными. Перезапустите сервер после изменения. Фоны строк и диагностика не меняются; в автономный HTML/APK цвета встраиваются при сборке.

Windows 7 / 8 / 8.1
-------------------

Windows 7 SP1 / 8 / 8.1: отдельные portable ZIP windows7-8-x86 и windows7-8-x64
с Node.js 12.22.12, CLR2/CLR4-лаунчером и консольным запуском без .NET/PowerShell.
Не смешивайте с обычным Windows MSI/ZIP. Node12 и старые ОС больше не получают
обновлений безопасности: только доверенная изолированная LAN, не интернет-сервер.
Это не экранный режим Legacy: сервер сохраняет общий протокол, время, звук и резервный сервер.
Перед соревнованиями требуется проверка на настоящей Win7/Win8.

Автономная версия
-----------------

fdv-bouldering-timer-standalone.html работает одним файлом без Node.js и сети, но не синхронизирует другие браузеры. В новой Android-сборке FDV Bouldering Timer есть два режима: «Автономный таймер» и «Подключиться к серверу». В старых APK доступен только автономный режим. APK не запускает сервер на Android. Komi Store устанавливает подходящий файл GitHub Release на Windows, macOS, Linux или Android.

Введите адрес сервера, например 192.168.1.10:8008 (без схемы используется HTTP); приложение запомнит адрес. Сетевой режим открывает обычный синхронный экран со списками, звуком, диагностикой и резервным сервером. Разрешите звук этого экрана в основном браузере и коснитесь страницы таймера для разблокировки аудио. Пока таймер открыт, Android не даёт экрану автоматически погаснуть даже при HTTP. Не сворачивайте приложение и не блокируйте устройство: фоновой службы и фонового звука нет. Подключите планшет к питанию. «Назад» с подтверждением возвращает к выбору режима; звук устройства прекратится, сервер продолжит работу. HTTPS требует доверенного WebView сертификата; обхода ошибок нет. Ошибка подключения не запускает автономный таймер автоматически.

В APK системная панель навигации и вырезы экрана не перекрывают кнопки таймера. Учитывается реальная занятая область; при скрытой панели лишнего отступа нет.

HTTP и HTTPS
------------

HTTP подходит для обычной локальной работы. HTTPS создаёт защищённый контекст: на поддерживаемых устройствах доступны Wake Lock (экран не гаснет), сервис-воркер для повторного открытия кэшированной страницы и современный API буфера обмена. Звук и полный экран всё равно требуют касания, а Wake Lock зависит от браузера и энергосбережения ОС.

В Windows (включая Win7/Win8), macOS и Linux нажмите «Создать HTTPS-сертификат» / Create HTTPS certificate в лаунчере и проверьте адреса. Замена и перезапуск требуют отдельных подтверждений; генерация не прерывает сервер. OpenSSL не требуется. Скрипты остаются для консольного запуска и не заменяют управляемый сертификат. После перезапуска откройте https://…:8443/. Доверие к самоподписанному сертификату настройте на устройствах отдельно; для резерва — также в Node.js обоих серверов. Передавайте только timer-public.cer, не timer-cert.pfx с закрытым ключом. Пересоздайте сертификат после смены адреса. Установленная Windows хранит файлы в %LOCALAPPDATA%\FDV Bouldering Timer\https, macOS — ~/Library/Application Support/FDV Bouldering Timer/https, Linux — ${XDG_STATE_HOME:-~/.local/state}/fdv-bouldering-timer/https (только абсолютный XDG_STATE_HOME); portable — в https рядом с программой, с пользовательским резервным каталогом при запрете записи. Этот управляемый PFX имеет приоритет перед старыми корневыми PEM/PFX.


English
-------
Build429: native audio-anchor tolerance and browser technical-preparation tolerance are10ms inclusive. Native comparison uses the retained anchor without accumulating drift; browser preparation also requires the same calendar start. Larger deviations and run/phase changes still invalidate stale work. Timer clocks and user correction are unchanged.
Build 428: native audio accepts anchor changes within50ms inclusive relative to the retained anchor, without accumulating stepwise drift. Changes greater than50ms replace the queue. Browser audio, per-client correction and timer clocks are unchanged.
Build 427: fixes a missing one-minute warning while waiting for the first scheduled rotation with native server audio. Sub-millisecond clock-sampling jitter no longer resets the audio queue. Per-browser correction is retained; actual start-time changes, Pause, Stop and mute still cancel obsolete signals.
Build 426: native server audio now tolerates delayed refills using three blocks totaling 120ms instead of two totaling 40ms. JSON output is moved off the PCM thread. Canonical cue targets and per-browser correction are retained. Server diagnostics include refill health. Active server playback suppresses browser signal output.
Build 425: On Windows, an eligible modern browser on the server computer automatically delegates sound to the server. Its selected profile and per-browser audio correction, including correction previews, are retained. Hiding or freezing the tab does not interrupt the server schedule. Pause, Stop, muting, role revocation and page closure cancel the relevant cues; multiple local tabs share one native output. If native playback is unavailable, the browser is used. Windows and the server must remain running; computer sleep is not bypassed. Other operating systems, remote devices, standalone HTML and APK retain browser audio; Legacy remains silent.

Purpose
-------

FDV Bouldering Timer is a local-network competition timer. One primary browser controls authoritative server state while phones, computers, tablets, and televisions show synchronized displays. Russian and English interfaces are included.

Formats
-------

- Classic: repeating rotation and short break.
- Festival: long round and break with optional 60, 30, 10, and 5 minute announcements.
- Final: one rotation per Start, followed by an operator-controlled next attempt; Old and New participant schedules are supported.
- After Stop, changing a progressed Final to Classic/Festival or Old / New asks to end Final. Cancel preserves everything; acceptance resets the Final counter. Old / New retains duration and rest-rotation count. Pause does not replace Stop.
- At completion on 00:00, the timer immediately uses the configured break background and text colors (red background by default), without starting a separate break. Completed routes in lists use blue-purple diamonds.

Quick start
-----------

1. Extract the complete release.
2. Start fdv-bouldering-timer.exe on Windows or the supplied app/script on macOS or Linux. Ready installers are available in GitHub Releases and through Komi Store for Windows, macOS, Linux, and Android.
3. Open http://127.0.0.1:8008/ on the server computer.
4. Enable Primary browser or press Ctrl+M.
5. Open the Wi-Fi/Ethernet address shown by the launcher on each display.
6. Select a format and durations. Start runs immediately; the small ▶ beside Start time creates a scheduled start.

Keys: Z Start, Ctrl+Q Pause, P Stop, Ctrl+F fullscreen, Ctrl+M primary browser. While paused, the primary browser can drag the progress bar; server synchronization does not take control while the pointer is held.

Secondary server
--------------------

An HTTP localhost/127.0.0.1 primary advertises its selected outbound network interface; the reserve verifies reachability and process identity. Existing network addresses/domains are preserved. For HTTPS, open the primary through a network name covered by its trusted certificate. If NAT/VDS makes an address unreachable by the reserve/displays, reopen the primary through a reachable address and retry setup.

Disconnect errors list browsers still connected to the reserve. Return them using diagnostic badges or close their tabs, wait 6–8 seconds and retry. After updating, reconfigure an existing pair with an old 127.0.0.1 primary address; saved addresses are not automatically rewritten.

Click SEC beside PIN in the primary browser and enter the address of an empty running server of the same build with identical audio/fonts. A green outline confirms connectivity. The standby mirrors state, lists, commands and the timer coordinate, and continues independently without upstream contact.

After 20 seconds without primary contact, browsers switch to a reachable standby on the next check. SEC after TAB is gray when unavailable, dark green when reachable, light green when connected through it. Click a browser badge to move that browser, or the primary browser's badge to move everyone. Both browser registries are combined. There is no automatic failback.

Every display and the primary server must reach that address. HTTPS requires certificate trust in browsers AND the primary server's Node.js; accepting a browser warning alone is insufficient. HTTPS pages cannot use HTTP standbys. Standalone HTML and APK standalone mode do not use a Secondary server; network APK mode uses a Secondary server like an ordinary display. A pair without a witness cannot guarantee single authority during a complete network partition.

Click a light-green SEC badge again to return that display to the current primary, or the operator's badge for the group. After role reversal, this may be the original standby. Diagnostic badges stay in one row; Legacy is always labelled LEG.

After group takeover the returning former primary automatically becomes the current primary's standby, receiving current state and operator assignment. The current primary does not change; Secondary server addresses update. Reverse reachability is checked first, with HTTPS certificate trust required on both servers. Otherwise the current primary continues while the old server remains fenced and retries.

State storage
-------------

Installed packages save state per user: Windows — %LOCALAPPDATA%\FDV Bouldering Timer\runtime-state; macOS — ~/Library/Application Support/FDV Bouldering Timer/runtime-state; Linux — ~/.local/state/fdv-bouldering-timer/runtime-state (or XDG_STATE_HOME). Portable packages keep state beside the timer, with a per-user fallback if writing there is denied. The launcher log shows the selected directory.

Start lists
-----------

Route counts commit on Enter, Tab, or leaving the field; arrows commit immediately. Synchronization preserves input, including while running. Failed saves retain the value with an explanation; Enter retries saving.

One rotation before a route resumes, markers for that pause disappear and participants starting in the next rotation see yellow preparation triangles.
With scheduled resumption, pause icons cover climbing during the suspended interval and preparation only for routes 2 and later. First-route preparation has no pause icon. The schedule shift remains unchanged. Without scheduled resumption, existing markers are retained. The description ends at the last suspended rotation: a pause starting at 17 and resuming at 19 reads “from rotation 17 through rotation 18”.
Planned whole-wave pauses follow rotation order. Changing an earlier pause automatically recalculates participant anchors for later pauses, including previously saved lists.
A permanent stop at or before a route pause's start supersedes that pause, with no extra pause markers or delays on other routes. A pause that began before the stop retains its accumulated delay.
Cancelling such a stop preserves both pause boundaries: a pause from 17 through 17 resumes at rotation 18 again.

Load up to four lists from XLSX, CSV, TSV, TXT, or MXL. The user interface calls them LIST 1–4; old “protocol” names remain only in internal compatibility identifiers and the HTTP/HTTPS meaning.

Screens with visible lists show a read-only rotation badge without number-editing arrows (including Firefox) below the timer, including fullscreen and Legacy. Without lists the badge is hidden. Before a scheduled start it says “Waiting for start”.

Participant cells are never ellipsized. Each display selects its own visible LIST badges. With exactly two visible lists, a cyan button switches one or two columns; an orange outline marks a non-default layout. Route incidents can suspend and resume a route at a current or future rotation. Choosing a future pause rotation enables “Hold the entire wave from this rotation” by default so the related wave does not start on upstream routes; the operator may clear it, and it defaults off for a current or past rotation. Participants or routes can also be excluded and restored.

Browsers and diagnostics
------------------------

The primary browser is always first and has a brighter border. Arrows reorder other cards; a pin preserves a browser's place through reconnects. With at least three browsers, the number button in the primary card displays matching numbers on cards and in the top-right corner of every timer area.

Badge order is LEG, CTRL, AUDIO, TIME, NET, SYNC, SSE, TAB, SEC (when configured), followed by LIST 1–4. Gray means unavailable, dark green available but inactive, light green active/healthy, yellow warning, red fault, cyan visible list/layout control, and orange outline a manual Legacy choice or non-default two-list layout.

CTRL assigns Start/Stop/Pause/Screen and Z, P, Ctrl+Q, Ctrl+F shortcuts to a modern display. Only the primary browser assigns or revokes it. Dark green means available, light green enabled; Legacy is gray. Other settings remain with the primary browser.
The saved “Break sound” checkbox beside Flashing is on by default. Uncheck it to mute only the last five break-second warnings on all modern displays; flashes and the start sound remain. MINUTE also sounds one minute before a scheduled start, including the Final preliminary countdown.

LEG selects the simplified old-browser page. AUDIO reports availability, unlock state, and real audio-clock progress. TIME shows a compact server clock below the timer. NET reports request latency, SYNC clock/render timing, SSE instant command delivery, and TAB visibility plus Wake Lock on modern browsers.

NET is green up to 100 ms, yellow from 100 to 200 ms, and red above 200 ms. Render and audio-clock progress are green below 100 ms, yellow from 100 to 250 ms, and red above 250 ms.

After a browser-clock discontinuity, SYNC stays red until a fresh server measurement; its tooltip and the “Clock verification required” warning explain why. The error estimate includes an unapplied correction as well as network delay.

Legacy and network loss
-----------------------

Legacy is intended for older TV browsers. It shows the timer, selected LIST tables, and the optional TIME clock, but has no sound. It uses XHR rather than SSE and continues locally through a temporary network interruption. A scheduled Classic or Festival start is anchored to its absolute timestamp and must occur while offline; reconnecting applies authoritative server state.

Portrait number and route columns are compact; full names do not overlap markers. Lists wider than the screen can be scrolled horizontally.

The modern page also extrapolates from the last known timeline. Ordinary network recovery retains clock calibration and valid sound schedules. After a longer server outage it offers Standalone mode. A server-opened page automatically returns to authoritative server state when contact resumes; standalone commands and changes are not uploaded and are discarded. The direct single-file standalone version has no server.

Sleep or a system-clock change can invalidate clock measurements. The previous monotonic timeline then continues with a warning, while timed signals are suspended until server verification; wall time does not directly jump the timer. Without a server, Stop followed by Start establishes a new standalone run, not verified elapsed time for the previous run. Before competition use, test network loss, sleep/wake, and rotation boundaries on the physical devices. This new recovery policy applies to the normal page, not Legacy's simplified synchronization.

On first connection, a modern screen, including network APK mode, shows “Synchronizing time” and --:-- until a measured server clock is available, with no scheduled sounds. It then displays the current countdown. Changing the server calendar clock does not shift an active timer or its sound schedule. Scheduled clock-time starts and restart recovery still use calendar time. Direct standalone HTML and APK standalone mode do not wait for server synchronization.

Sound, settings, and help
-------------------------

v2.3.1 fixes manual Final START on other modern browsers. Restart the server and reload every timer page after upgrading; enable and unlock audio on each sound device. Final's preliminary countdown still requires a separate manual Start.

An extra short prewarm runs 10 seconds before the first countdown/minute/scheduled-start signal, retaining the close warmups. Late technical preparation is accepted while its run and phase remain current. Competition-signal lateness limits are unchanged. no_sound_warm=true also mutes the extra quiet tones.

Switching tabs keeps sound active. The existing timer loop checks JavaScript delays and audio-clock progress, recovering future cues after a detected gap and retaining submitted audio when its clock remains healthy. Device sleep and forced page freezing can still interrupt playback. Build 425 adds automatic local server audio on Windows.

Primary and remote-display sound are controlled separately. A tap is required to unlock audio. A second browser on the primary computer does not duplicate sound. AUDIO provides a −500 to +500 ms user offset and signal tests. WAV and MP3 profiles live under beeps.

Startup values, ports, colors, timer font, and sound profile are read from params.txt. The complete bilingual guide is help.html; the documentation map is docs/documentation-map.md.

Marker colors: list_ready_color (preparation), list_active_color (climbing), list_done_color (completed, #48488C), list_paused_color (pause), list_stopped_color (permanent stop). Use #RRGGBB or #RGB; invalid values use defaults. Restart the server after editing. Row backgrounds/diagnostics are unchanged; standalone HTML/APK embeds colors at build time.

fdv-bouldering-timer-standalone.html is a one-file offline timer without multi-browser synchronization. The new Android build, FDV Bouldering Timer, offers Standalone timer and Connect to server. Older APKs only support standalone mode. The APK does not host a server on Android. Komi Store installs the matching GitHub Release asset on Windows, macOS, Linux, or Android.

Enter the server address, e.g. 192.168.1.10:8008 (HTTP if no scheme is provided); the app remembers it. Network mode opens the normal synchronized screen with lists, sound, diagnostics and Secondary server support. Enable this display's audio in the primary browser and tap the timer page to unlock audio. Android keeps the screen on natively while the timer is open, even over HTTP. Do not lock the device or switch apps: there is no background service or background sound. Connect the tablet to power. Back asks for confirmation before returning to mode selection; sound on this device stops, but the server continues. HTTPS requires a WebView-trusted certificate; errors are never bypassed. Connection failure never starts a standalone timer automatically.

The APK keeps timer buttons clear of system navigation bars and display cutouts, using their actual occupied area with no fixed gap when bars are hidden.

Windows 7 / 8 / 8.1
-------------------

Windows 7 SP1 / 8 / 8.1: use separate windows7-8-x86 / windows7-8-x64 portable
ZIPs, not the modern Windows MSI/ZIP. They contain official end-of-life Node12
and a CLR2/CLR4 GUI (keep its .exe.config), plus a console BAT without .NET or
PowerShell. Trusted isolated LAN only, never Internet-facing. The server uses
the common clock/audio/Secondary server implementation; old-browser Legacy display mode is
a different feature. Real Win7/Win8 validation is required before competition use.

HTTP and HTTPS
--------------

HTTP is sufficient for ordinary local use. HTTPS creates a secure context: supported devices can use Wake Lock to keep the display awake, a service worker can reopen a cached page without internet, and the modern clipboard API can copy links. Sound and fullscreen still need a user gesture, and Wake Lock depends on browser and OS power-saving policy.

On Windows (including Win7/Win8), macOS and Linux, click Create HTTPS certificate in the launcher and review server addresses. Replacement and restart require separate confirmations; generation does not interrupt the server. No OpenSSL is required. Platform scripts remain available for console use but do not replace managed certificates. After restarting, open https://…:8443/. Configure self-signed certificate trust separately on devices and in Node.js on both servers for a Secondary pair. Share only timer-public.cer, never timer-cert.pfx with its private key. Recreate after address changes. Installed Windows uses %LOCALAPPDATA%\FDV Bouldering Timer\https, macOS uses ~/Library/Application Support/FDV Bouldering Timer/https, Linux uses ${XDG_STATE_HOME:-~/.local/state}/fdv-bouldering-timer/https (absolute XDG_STATE_HOME only); portable uses adjacent https with per-user fallback when writing is denied. Managed PFX takes priority over legacy root PEM/PFX.
