# Контекст для продолжения работы в новом чате

Обновлено: 3 ноября 2026 года. Это снимок состояния, а не замена проверки Git.
Перед изменениями проверить рабочее дерево, ветку и актуальность удалённых refs.

## Последняя задача: компактные аудиоканал и подтверждение команд в446

По запросу пользователя index.html заменяет checkbox аудиоканала на строку
«Звук через: сервер [radio][radio] браузер» (RU/EN); нативные radio с общим name,
работает клавиатурное переключение. При недоступности оба disabled с tooltip,
визуально выбран браузер, сохранённая native preference не сбрасывается.
При восстановлении выбор возвращается. API/clock/audio routing не менялись.
Следующее визуальное уточнение: label выбранной radio option оранжевый
(#ff9f43 через :has(input:checked)); невыбранная остаётся прежней серой.

Отдельная строка receipt удалена: пустой8px круг после IP в strong заголовке;
цвета прежние, title/aria-label содержат текущий статус и blocked reason.
При открытом editor обновляются радио и tooltip круга без потери slider value.
Header flex не даёт кругу уйти на отдельную строку; IPv4 сохраняется полностью,
длинное browser name сокращается с полным hover-title.

Это только клиентские файлы и справка; build446 сохранён, сервер88121 этой
визуальной задачей НЕ перезапускался. Для применения достаточно reload страницы.
standalone пересобирается; обновлены только4 относящихся help PNG (server-audio
и command-delivery RU/EN). Снимки просмотрены, после правки IP больше не
обрезается и dot не уходит на новую строку.4browser cases passed14.0s:
radio route switch + keyboard ArrowLeft + reload + failure/recovery + receipt
position/title/aria language update with open audio editor. Лог:
/private/tmp/fdv-audio-delivery-visual.log. Release inputs446, standalone build,
git diff --check pass. Live GET8008/ отдаёт новые radio/dot selectors; process
88121 остался прежним. Полный Node suite в этой чисто визуальной итерации
не повторялся (последний544pass/7skip с Java17 описан ниже).
Коммит/push/release не выполнялись.

## Предыдущая задача: 446, ограниченное восстановление аудиоканала

3 ноября пользователь увидел исчезновение переключателя на445. Проверено:
Node81522 жив, helper81585 отсутствует, available=false; подписанный helper
на диске цел. Точная причина завершения прежнего процесса не установлена:
первая ошибка прежде не сохранялась в обычном API. Пользователь запросил
неактивный видимый переключатель с hover-пояснением и ограниченное recovery.

446 добавляет три попытки1/3/10сек, ожидание выхода старого процесса, загрузку
PCM/повторную калибровку до available=true, новый lease handshake, recovery
epoch для пропущенного false-state, сохранение reason и счётчика в state API.
Сброс бюджета только после60сек здорового heartbeat без gap>2.5сек. Добавлена
проверка остановившегося renderReads с grace2.5сек после сна. Нового poller нет.
Настройка local browser остаётся disabled с RU/EN tooltip, сохранённое enabled
и audio offset не меняются. Опоздавшие сигналы не повторяются.

Пользователь явно разрешил перезапуск: основной сервер применён на446.
Node81522 получил SIGTERM, действующий launcher23820 поднял Node88121;
instance1c86a456-75bb-4621-9a14-13d642008485, helper88127. HTTP8008 и HTTPS8443
проверены:200/build446. Оба браузера автоматически вернулись с clientBuild446;
primary847dcfdf-d036-43f4-8990-e8da035a9f0c владеет активным native route.
Настройки таймера, audioOffsets, native preferences и Legacy flags сохранены.
Первое строгое snapshot-сравнение обнаружило version+1 и очистку неприкреплённого
browserOrder: это существующее поведение restoreTimerSnapshot (строки1059+).
Оба браузера переподключились в прежнем порядке, это проверено по publicClients.
Резервная копия /var/folders/1_/0ch204xs65n5k_vcvrn7t7tm0000gn/T/fdv-before446-restart-w8lSFr/;
итог workspace analysis/server446-restart-result.json. Акустическую слышимость
на основном сервере после этого перезапуска пользователь ещё не подтверждал.
Коммит/push/release не выполняли.
Generated native binary445 достаточен, C# этой задачей не менялся. Все прежние
локальные изменения444/445 сохранены. Добавлены также bounded1/3/10s повторы
browser/native transport, fence старых prepare/stream callbacks и ожидание
retiring child перед browser release ACK. Native и transport имеют независимые
лимиты: сбой SSE не перезапускает исправный CoreAudio-процесс.

3 ноября по запросу пользователя установлен Homebrew OpenJDK17.0.21.0.3 ARM64.
Он зарегистрирован пользовательским symlink:
~/Library/Java/JavaVirtualMachines/openjdk-17.jdk ->
/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk.
/usr/libexec/java_home -v17, обычные /usr/bin/java и /usr/bin/javac находят JDK;
JAVA_HOME/PATH и shell profiles не менялись. Первичная установка Homebrew
оборвалась на fontconfig unknown install step:run. После brew update и повтора
из кеша установка завершилась; brew postinstall fontconfig тоже успешен.
Android host-tests:2passed,0skipped. Полный Node-набор теперь БЕЗ исключения
Android:551total,544passed,0failed,7прежних platform/opt-in skips;14.59s.
Лог /private/tmp/fdv-audio446-node-with-java17.log. Предыдущий fail отсутствующей
Java сохранён в /private/tmp/fdv-audio446-node.log (теперь устранён). Physical CoreAudio silent probe успешно
завершил только свой child87713 SIGKILL -> auto child87714,1recovered, future
played lateness0.00322ms. Рабочий сервер не менялся. Результат в workspace:
analysis/native-recovery446-results.json. Это не реальный sleep/wake и не
акустическая проверка. Браузерный итоговый лог:
/private/tmp/fdv-audio446-browser-final.log:8passed58.8s. Скриншоты справки
не перезаписывались. Release inputs446, syntax и git diff --check прошли.

## Предыдущее состояние:445, нативный звук восстановлен


Рабочая веткаdevelop. Все изменения444 (подтверждения команд/SSE/HTTP) сохранены,
к ним добавлено исправление серверного аудио445. Коммит/push/release/main этой
задачей не выполнялись. Перед дальнейшими изменениями проверить Git.

По ЯВНОМУ разрешению пользователя основной сервер перезапущен на445: старый
Node23853 завершён SIGTERM, действующий launcher23820 сам поднял Node81522.
Instance995c76a5-745f-4530-b821-59d0c2e21fa2; Safari сообщает clientBuild445.
Сравнение сохранённых полей до/после перезапуска: изменений нет. Резервная копия:
/private/tmp/fdv-before445-restart-93ln1b23/. Пользователь подтвердил, что через
сервер снова есть звук. Native process на последней проверке81585. Сейчас идёт
ручной тест2–3циклов nativeOFF -> браузерный Start -> nativeON -> серверный Start
ЗАВЕРШЁН: пользователь подтвердил «Да, оба режима работают каждый раз».
Фактическая слышимость обоих каналов и повторные переходы на445 подтверждены.
Полного физического sleep/wake теста445 ещё не было; разрыв часов проверен
моделью и настоящим CoreAudio с нулевым PCM. Начальный дефект Safari не имеет
доказанного trigger, сейчас повторным переключением не воспроизводится.

### Исправление445

.NET8 Stopwatch на macOS использует CLOCK_UPTIME_RAW без сна, а Node24/libuv1.52
включает сон. NativeAudio.clockOffset раньше измерялся только при запуске.
Дневной сон (pmset, пробуждение18:26 +0300) мог увести дедлайны старого helper
в будущее при active=true. Модель с разрывом1час это воспроизвела: два теста
падали до fix. Existing keepalive теперь возвращает native now; принимаются
только конечные numeric samples с RTT<=50ms. Offset step>100ms -> clock-reanchor.
Existing heartbeat перенесён ДО отправки cues; old native generation отменяется,
перестраиваются future cues. Нет нового polling, seek, изменения competition
version/rate/поправки. Stable IPC jitter не двигает offset. Old helper без now
читается совместимо, но для recovery нужен новый бинарник.

Изменены lib/server-audio-native.js, lib/server-audio.js, общий C# player,
добавлены5 regression cases в двух существующих test файлах. Build445 согласован
вserver/index/legacy/SW/offline/standalone. README/quickstarts/help RU+EN,
architecture/performance/docs-map обновлены. Проверки:
-535 Node total,528passed,0failed,7skipped; Android actual-activities исключён
из-за отсутствующей локальной Java, прочие platform/opt-in пропуски прежние.
Лог /private/tmp/fdv-audio445-node.log.
-6 native browser cases passed39.5s, PNG не перезаписывались:
/private/tmp/fdv-audio445-browser.log. Весь browser suite повторно не запускали;
его прежние4 baseline failures описаны в секции444 ниже.
-C# device-free mixer/protocol/13assets pass; первый framework-dependent запуск
не нашёл.NET8 (установлен10), повтор DOTNET_ROLL_FORWARD=Major прошёл без установки.
Продукционный бинарник self-contained.NET8.
-Настоящий CoreAudio с НУЛЕВЫМ PCM и simulated gap1час:1played,
lateness~-0.00085ms. Это не акустическая проверка. Результат в рабочей папке
чата analysis/native-clock-gap-results.json.
-Release inputs445, JS syntax, git diff --check прошли.

Новый helper /private/tmp/fdv-audio445-recovery/native-audio/ подписан и атомарно
установлен в source/lib/native-audio/darwin-arm64/; SHA256
9b03f63b4809b031c2facefbd79b4b27f94350d519cd573068229cc2903f92eb.
Предыдущий runtime /private/tmp/fdv-audio443-before445-ulzdwfsv/.
lib/native-audio/ UNTRACKED generated runtime — НЕ добавлять бинарник в Git.

### Что остаётся неизвестным про Safari

Изначально Web Audio молчал при running/идущих часах, canPlay=true, не пустом
PCM и synthetic=true. HTMLAudio после разрешения Auto-Play слышен.
Пользователь подтвердил: в той вкладке звук сначала работал, затем пропал;
reload восстанавливал, а nativeON->OFF однажды снова вызывал тишину.
Нельзя считать этот браузерный дефект исправленным нативным clock fix.

Проверки для локализации:
-Safari с имитацией native (без CoreAudio) звучал до/после переключения.
-Chromium с имитацией native:3цикла, PCM RMS~0.7075, акустика не проверялась.
-Минимальная страница без кода таймера с настоящим CoreAudio:3heard=true,
Web Audio до native, после stop и после dispose. RMS~0.0848, peak0.12,
output timestamp идёт. Временные серверы50608/51254 и session94429/6302 закрыты.
-Патч speechSynthesis.cancel (не отменять пустую очередь) сначала совпал с
успешным переключением, но обратный тест после reload БЕЗ патча тоже прошёл.
Причинность не подтверждена, Speech API в source НЕ менялся.

CUA Safari многократно зависал с timeout; прямого UI-доступа нет. Если сбой
повторится на445, подготовлен полный изолированный trace-сценарий в рабочей папке
чата analysis/full-native-handoff-probe.cjs + full-native-handoff-trace.js.
Ещё НЕ запускался. Команда FDV_PERFORMANCE_DIAGNOSTICS=1 node analysis/full-native-handoff-probe.cjs
(нужен escalated loopback). Пассивная трассировка, без добавления узлов в Web Audio;
отдельный runtime profile, real native, collector localhost,2часа/Ctrl-C cleanup.
Проверить актуальность источника копии в скрипте перед запуском: он был создан
для старого смешанного443/444. Основной8008 не затрагивать без нового разрешения.

Подробная хронология/артефакты: рабочая папка чата
analysis/safari-silent-audio-2026-11-02.md и safari-audio-findings-2026-11-02.md.
Актуальные выводы стоят сверху, старые гипотезы ниже не считать доказанными.

## Предыдущая локальная задача: подтверждения команд, сборка 444

По запросу пользователя реализованы подтверждения получения и применения
актуального состояния для всех команд состояния, отдельно — обработки теста
звука. Запасной канал уточнён пользователем: обычный HTTP того же сервера,
не изменение failover на отдельный сервер.

Работа основана на `develop` / `d64f780`, дерево до задачи было чистым.
Новые изменения444 пока локальные, не закоммичены/не отправлены; main не менялся.
Сервер, index, Legacy, SW, offline audio и standalone HTML согласованы на444.

Основной контракт — раздел State delivery receipts в architecture.md:

- `lib/client-delivery.js`: ES5 receipt tracker для Modern/Legacy и общие
  ключи/статусы. Ключ включает authority process, SEC session/epoch и version.
  Получение и успешное полное применение/отрисовка подтверждаются раздельно.
  Нельзя использовать только lastServerVersion/stateVersion как ACK.
- Отрисовка видимых списков должна завершиться; калибровка, resume snap,
  редактирование и заблокированный fullscreen оставляют применение без ACK.
  Есть человекочитаемая причина, например «нужен тап для полного экрана».
- HTTP с новым состоянием или ранее пропущенным звуковым событием немедленно
  применяет данные и запускает ограниченный ремонт SSE. Ошибка SSE также
  запускает recovery сразу; cooldown2s, прежний serialized coordinator.
  Отдельная серверная проверка неподтверждённой команды — через3s, один раз,
  без нового периодического опроса. Idle watchdog25s сохранён для тихого канала.
- Никаких повторных Start/Pause/Seek: восстанавливается снимок. Звуковые тесты
  дедуплицируются по общей идентичности SSE/HTTP, имеют expiry и исходный
  state key; после новой команды/authority старый тест не воспроизводится.
  Есть bounded per-tab sessionStorage receipts и защита reload/in-flight.
- Исходящие ping сохраняют registry lastSeen для прежней native-audio
  непрерывности, но не lastReportAt. Public age/connected отражают отчёты JS.
  Активный native-audio клиент исключён из принудительного закрытия основного
  SSE; HTTP fallback работает, отдельный аудиоканал/его watchdog не менялись.
- Mode-команды сохраняют manualLegacy=1, чтобы возврат через following reserve
  работал по HTTP. SEC merge проверяет текущую authority, не старый зелёный статус.

Обновлены руководства RU/EN, quick starts, docs map и screenshots
`help-assets/command-delivery.png` / `command-delivery-en.png`.
Непрофильные PNG, автоматически перезаписанные старым полным browser suite,
сохранены в рабочей папке чата (analysis/command-delivery-444-test-captures)
и восстановлены из base после проверки hash. Новые два снимка сохранены в repo.

Проверки:

- Полный Node suite:530 тестов,523 passed,0 failed,7 skipped; исключён
  `actual Android activities` из-за отсутствующей локальной Java, остальные
  пропуски прежние platform/opt-in. Лог: /private/tmp/fdv-delivery444-final-validation.log.
- Окончательный отдельный прогон всех9 новых command-delivery browser cases:
  9 passed (52s), /private/tmp/fdv-delivery444-command-confirmation-final.log.
- Целевые browser-сценарии command-delivery и Secondary:17 случаев прошли
  в основном и завершающих повторных запусках. Последний дополнительный
  режим через резерв: /private/tmp/fdv-delivery444-secondary-mode-final.log.
  Проверены получение/применение/ошибки, HTTP fallback, repair3s, no replay,
  списки, fullscreen rejection, Legacy, две смены authority, аудиоконтекст.
- Общий browser suite:106 случаев. После отдельной проверки/уточнения нового
  fullscreen-теста остались4 сбоя, воспроизведённые и на исходном d64f780:
  sound-row width240, Modern phone two protocols, Legacy TV sticky fallback
  screenshot, Legacy TV two-after-stop screenshot. Эталонные снимки не менялись.
  Логи: /private/tmp/fdv-delivery444-browser-full.log,
  /private/tmp/fdv-delivery444-baseline-layout.log. Базовая копия исходного
  коммита: /private/tmp/fdv-delivery-baseline. Не называть весь browser suite зелёным.
- Итоговые receipt/clock/recovery/audio проверки:91 passed без пропусков,
  /private/tmp/fdv-delivery444-receipts-final.log.
- verify-release-inputs, JS syntax, git diff --check пройдены.

Работающий пользовательский сервер не перезапускался; физический Samsung
Internet после изменения не тестировался. Для проверки перезапустить develop
сервер и обновить страницы, убедиться в444. Сначала «Стоп и выход» в старом
лаунчере. Предыдущие локальные launcher443 бинарники могут запускать новый
сервер из исходников через FDV_TIMER_BASE_DIR; сами установленные app/PKG
этой задачей не обновлялись. Коммит/push выполнять только по запросу.

## Проект и рабочие каталоги

FDV Bouldering Timer — таймер соревнований по болдерингу с синхронными экранами
в локальной сети. Форматы: Классика, Фестиваль, Финал (старый/новый).
Один браузер управляет соревнованием; остальные устройства отображают таймер
и при разрешённом звуке воспроизводят сигналы. Есть стартовые списки,
приостановки трасс/волны, резервный сервер, Legacy-экран без звука,
автономный HTML и Android APK.

- Репозиторий: https://github.com/dfedorov-arch/fdv-bouldering-timer
- Разработка: `/Users/fd/Documents/fdv-bouldering-timer`, ветка `develop`.
- Стабильная версия: `/Users/fd/Documents/fdv-bouldering-timer-stable`, ветка
  `main`, отдельный Git worktree. Не переносить туда develop целиком без запроса.
- Рабочая папка этого чата: `/Users/fd/Documents/ChatGPT/Timer 2`.
  Это НЕ каталог исходников таймера.

Состояние перед подготовкой этого документа:

| Ветка | Коммит | Сборка / назначение |
| --- | --- | --- |
| develop, origin/develop | `c33c6035357a0f54f9b574a22959e434bd40d96e` | 443, последние изменения опубликованы |
| main, origin/main | `da03969771edf88140e63398ead4818b322854bd` | 440, стабильная линия 2.3.2 |

Оба дерева были чистыми. Новые изменения документации после указанного коммита
могут оставаться незакоммиченными — не удалять их и не считать посторонними.
Статус GitHub Actions для `c33c603` в этом шаге не проверялся.

## Последующее локальное изменение: повторное нажатие Dock

Пользователь попросил сворачивать открытое окно лаунчера повторным нажатием
значка Dock. Добавлен `LauncherWindow.ReopenFromDock`: видимое несвёрнутое окно
переходит в `WindowState.Minimized`; скрытое/свёрнутое восстанавливается через
прежний `ShowLauncher`. Открытый диалог сертификата вместо сворачивания
показывается с владельцем. Выходящий лаунчер игнорирует Reopen.

`ActivationKind.Reopen` вызывает новый метод; macOS использует это событие и
для повторного открытия `.app` через Finder. Явная команда меню/трея и IPC
повторного запуска бинарника по-прежнему только показывают окно. Windows/Linux
пути запуска не изменены. Новых запросов/таймеров нет; сервер, readiness,
поколение health checks и одноразовый startup guard сохраняются.

Проверено локально: 22 целевых теста прошли без пропусков (language,
Unix headless, macOS network/preview, release preflight), release inputs443 и
`git diff --check` прошли. Headless harness проверяет повторные minimize/restore,
hide/restore, открытый сертификат, явный Show, shutdown и сохранность дочернего
процесса/проб/готовности. Это не проверка физического нажатия Dock.

При проверке выявилась нестабильность старого теста: синхронный запуск UI/render
harness блокировал Node event loop до закрытия keep-alive соединения сервера,
следующий fetch иногда получал ECONNRESET. В `test/unix-launcher.test.js`
запуск harness заменён на ожидаемый асинхронный `execFile`; проверки и коды
завершения сохранены. После этого полный целевой запуск прошёл.

Новый arm64 `.app` с исправленной иконкой и переключением Dock:
`/private/tmp/fdv-launcher443-dock/osx-arm64/FDV Bouldering Timer.app`.
Сборка/подпись проверены; сервер не запускался. Для теста нужен «Стоп и выход»
в прежнем лаунчере, затем запуск бинарника внутри этого `.app` с
`FDV_TIMER_BASE_DIR=/Users/fd/Documents/fdv-bouldering-timer`.
Старый `/private/tmp/fdv-launcher443-builds/osx-arm64/fdv-bouldering-timer`
не обновлялся и не содержит переключение Dock.

Руководства README/ReadMe/ReadMe-macos/help (RU/EN), Unix README, архитектура и
карта обновлены. Пользователь подтвердил результат и попросил коммит в GitHub.
Изменения и этот handoff включены в коммит «Fix macOS launcher menu-bar icon
and Dock window toggle» ветки develop; точный hash и факт отправки проверять
по Git. Preview/стабильный релиз не выпускались, номер серверной сборки443
сохранён. Часы/звук/соревнование не менялись.

## Новое локальное исправление: иконка строки меню macOS

После передачи контекста пользователь запустил локальный бинарник443 через
терминал: меню строки macOS работало, но значок был пустым. В raw publish нет
PNG, а полноценный macOS builder генерировал PNG снаружи `.app`; portable/PKG
копировали только `.app`, поэтому файл тоже терялся.

Исправлено локально, без коммита/push/preview и без смены номера443:

- `launcher/unix/build-launcher.sh` кладёт PNG в
  `Contents/MacOS/timer-launcher.png` до подписи. Существующий
  `SetLauncherIcon` уже ищет там файл; код запуска/таймера не менялся.
- `scripts/build-portable-releases.sh` отклоняет macOS `.app` без непустого PNG
  до загрузок. Тест проверяет отсутствующий и пустой файл.
- Обновлены `launcher/unix/README.md`, архитектура и карта документации.
- 15 целевых тестов packaging/network/preview прошли, как и shell syntax,
  `git diff --check`, `verify-release-inputs.js`.
- Полный builder успешно собрал arm64/x64 `.app` в
  `/private/tmp/fdv-launcher443-icons/{osx-arm64,osx-x64}/`.
  PNG присутствует внутри; `codesign --verify --deep --strict` прошёл.
  Это временные локальные `.app`, не полные пакеты с сервером/Node/audio.
- PNG дополнительно скопирован к прежнему raw-бинарнику:
  `/private/tmp/fdv-launcher443-builds/osx-arm64/timer-launcher.png`.
  Прежняя команда запуска с `FDV_TIMER_BASE_DIR` теперь должна показывать
  иконку строки меню после «Стоп и выход» и нового запуска.
  Рабочий лаунчер/сервер автоматически не перезапускался. Реальное отображение
  пользователем после исправления ещё не подтверждено. Dock у raw-бинарника
  остаётся отдельным ограничением; полноценный `.app` содержит ICNS.

Перед исправлением `git ls-remote` подтвердил прежние heads develop/main;
локальные старые изменения README/карты/этого handoff сохранены.

## Последняя задача: двусторонний язык лаунчера

Пользователь подтвердил работоспособность переключения языка лаунчер → браузер
в macOS preview 442 и попросил добавить браузер → лаунчер на ВСЕХ ОС,
строго без новых периодических запросов. Реализовано в сборке 443, отправлено
в `develop` коммитом `c33c603`. Main и стабильные релизы не изменялись.

Текущий контракт:

- Сервер хранит общий `language` (`ru`/`en`). Обычная смена в браузере уже
  распространяется через серверное состояние/SSE.
- Существующий успешный `GET /api/state` дополнен заголовками
  `X-FDV-Language`, `X-FDV-State-Version`, `X-FDV-Server-Instance`, взятыми
  из одного снимка ответа. Нового запроса, endpoint или таймера для чтения нет.
- Все настольные лаунчеры читают эти заголовки из прежних health checks,
  примерно раз в секунду; периодически читать JSON тела не требуется.
- При получении языка обновляются окно, меню/трей и пользовательская настройка.
  Обратного POST при принятии серверного языка НЕТ. Скрытое окно тоже обновляется.
- Явная кнопка языка лаунчера по-прежнему отправляет существующий
  аутентифицированный loopback POST `/api/launcher/language` своему серверу.
  Новый случайный токен передаётся только через окружение дочернего процесса;
  в логи, URL, снимки и публичное состояние он не попадает.
- При старте восстановленный серверный язык имеет приоритет над устаревшей
  сохранённой настройкой лаунчера. Явный выбор, поставленный оператором в очередь
  во время запуска, сохраняет приоритет. Для старого сервера без заголовков
  оставлена совместимость с прежней отправкой языка при готовности.
- Pending/in-flight локальный выбор блокирует принятие языка из health check.
  Счётчик намерения меняется при клике и завершении команды: ответ, пересекающий
  локальную команду, не отменяет более новый выбор.
- Unix проверяет поколение probe/экземпляр дочернего процесса после await;
  health checks сериализованы. Windows читает health последовательно в UI-потоке.
  Версии разных экземпляров сервера/эпох резерва не сравниваются как одна шкала:
  перезапуск и смена authority могут законно уменьшить номер версии.
- Невалидные/отсутствующие заголовки не меняют интерфейс. Открытый диалог
  сертификата сохраняет свой язык до закрытия; принятие возобновляется на
  следующей проверке. Новые диалоги используют текущий язык.
- Логика часов, звука, расписания, конкуренции браузеров и соревнования
  в этой задаче НЕ менялась. Смена языка не перезапускает сервер.

Ключевые файлы последнего изменения:
`serve-bouldering-timer.js`, `launcher/windows/LauncherLanguage.cs`,
`launcher/windows/FdvBoulderingTimerLauncher.cs`, `launcher/unix/Program.cs`.
Словарь/разбор языка общий для всех desktop-сборок; Windows Legacy должен
сохранять совместимость с CLR 2.0, не добавлять туда современные .NET API.

## Предыдущие изменения и ограничения

- Сборка 441 добавила генерацию HTTPS-сертификата во все macOS/Linux лаунчеры;
  Windows, включая Legacy, уже имел эту функцию.
- Сборка 442 унифицировала кнопки, язык и поведение закрытия на desktop.
  Закрытие окна СКРЫВАЕТ его, сервер работает. «Стоп и выход» останавливает
  собственный сервер. Повторный запуск/Dock/трей восстанавливают существующее
  окно. Не возвращать автозапуск сервера при каждом Avalonia `Opened`:
  событие возникает также после Hide/Show, поэтому нужен одноразовый guard.
- Не возвращать Bonjour/активный поиск устройств до старта Node.js: это было
  связано с проблемами macOS Local Network. Не менять привязку сервера к
  `0.0.0.0` ради обхода этих проблем без отдельного анализа.
- Сертификаты не устанавливают доверие автоматически. Передавать на экраны
  только публичный CER, не PFX с закрытым ключом. Установленная macOS-версия
  хранит данные в `~/Library/Application Support/FDV Bouldering Timer`;
  portable может использовать `https` рядом с программой.
- Стабильная 2.3.1 исправляла конкретно START ручного запуска Финала на других
  современных браузерах. Исходный отзыв о полном отсутствии всех сигналов
  не считать полностью диагностированным только на основании этого исправления.
- Стабильная 2.3.2 добавила единое подтверждение выхода из остановленного
  Финала при выборе Классики/Фестиваля и смене старого/нового Финала.

## Архитектура: где искать

- `serve-bouldering-timer.js`: Node.js, HTTP API, SSE, снимки, клиенты,
  версия состояния/идентичность сервера, интеграция резерва и звука.
- `index.html`: основной браузерный интерфейс и исходник автономной версии.
- `legacy.html`: облегчённый экран для старых устройств, без звука.
- `lib/timer-domain.js`, `lib/timer-transitions.js`: доменная логика переходов.
- `lib/server-audio*.js`, `lib/client-server-audio.js`, `native-audio/unix/`:
  серверное аудио и передача локального звука. Удалённые современные экраны
  используют браузерное аудио, локальный современный браузер может передавать
  его нативному серверному проигрывателю. Legacy не озвучивает сигналы.
- `launcher/unix/`: общий Avalonia/.NET 8 лаунчер macOS/Linux, x64/arm64.
- `launcher/windows/`: WinForms, обычная и CLR2/Win7/8 линии.
- `scripts/`, `.github/workflows/release.yml`: генерация, тесты и упаковка.
- `docs/architecture.md`: актуальный подробный технический контракт,
  в том числе часы, восстановление, звук, резерв и язык лаунчера.
- `docs/documentation-map.md`: карта документации;
  `docs/review/01-project-overview.md`: краткий обзор кода.

Время и звук критичны: обычный reconnect не должен сбрасывать калибровку или
аудиорасписание. Подозрение на разрыв часов после сна — отдельный случай,
не равный восстановлению сети. Каноническая монотонная шкала отделена от
календарных часов. Не упрощать это по одному симптому; сначала читать контракт
и регрессионные тесты, затем обсуждать рискованные изменения с пользователем.

## Выполненные проверки сборки 443

- Общий запуск: 522 теста, 515 passed, 0 failed, 7 skipped.
  Использовался `--test-skip-pattern='actual Android activities'`: локально нет
  Java для этого теста. Другие platform/opt-in пропуски не считать пройденными.
- Отдельный запуск с `FDV_TEST_UNIX_LAUNCHER=1`: 11 тестов, 10 passed,
  1 Windows-only skipped. Реальные Avalonia controls/headless, временный сервер,
  готовность со старым языком, отсутствие эхо-команд, pending/busy/stale ответы,
  скрытое окно, меньшая версия нового экземпляра, настройки, IPC и восстановление.
- Скомпилированы macOS arm64/x64 и Linux arm64/x64.
- Windows и Windows Legacy с тестовым harness скомпилированы против reference
  assemblies .NET 4.0 и .NET 2.0. Реальный Windows UI на этом Mac НЕ запускался;
  native проверки расширены для запуска под Windows.
- `git diff --check` и `node scripts/verify-release-inputs.js` прошли.

Команды для повторения (из корня исходников):

```sh
node scripts/verify-release-inputs.js
node --test --test-skip-pattern='actual Android activities' test/*.test.js
FDV_TEST_UNIX_LAUNCHER=1 DOTNET=/usr/local/share/dotnet/dotnet node --test test/launcher-language.test.js test/unix-launcher.test.js test/windows-launcher.test.js
```

Для Windows native тестов: `FDV_TEST_WINDOWS_CERTIFICATES=1`; Legacy дополнительно
использует `FDV_NET20_REFERENCES`. Обычный `npm test` запускает полный набор.
Локальный Node: `/usr/local/bin/node`; SDK: `/usr/local/share/dotnet/dotnet`.
Unix runtime self-contained .NET 8; установленный SDK 10 может его собрать.
При локальной Avalonia-сборке `-p:UsedAvaloniaProducts=` отключает телеметрию.

Артефакты проверки временные и могут быть удалены системой:

- `/private/tmp/fdv-launcher443-builds/{osx-arm64,osx-x64,linux-arm64,linux-x64}/`
- `/private/tmp/fdv-launcher443-full-tests.log`
- `/private/tmp/fdv-launcher443-tests.log`
- `/private/tmp/fdv-launcher443-modern.exe`, `/private/tmp/fdv-launcher443-legacy.exe`

## Как пользователь может проверить локальную 443

Сначала «Стоп и выход» в другом GUI лаунчере. Обычное закрытие его не завершает;
повторный запуск может лишь открыть старый экземпляр из-за single-instance.
Запуск лаунчера также может остановить слушателей настроенных портов, поэтому
не запускать его автоматически поверх рабочего соревнования.

```sh
FDV_TIMER_BASE_DIR="/Users/fd/Documents/fdv-bouldering-timer" /private/tmp/fdv-launcher443-builds/osx-arm64/fdv-bouldering-timer
```

Он использует текущие исходники `develop` и `params.txt` (сейчас HTTP 8008,
HTTPS 8443), а не установленную программу. Ожидается сборка 443 в браузере.
Это бинарник, не готовый установочный пакет. Сам по себе он не заменяет app
в Applications. Старые каталоги `dist/` могут содержать очень старые сборки;
не считать их актуальными по одному факту наличия. Порт 8009 использовался
ранее для тестов — не предполагать, что там сейчас работает нужная сборка.

Пользователю дана команда запуска, но подтверждения ручного теста именно
обратного переключения 443 в этом чате ещё нет. Следующий разумный шаг —
двусторонний RU/EN при видимом/скрытом окне и после перезапуска сервера.

## GitHub, preview и релизы

Последний подготовленный в этом чате macOS preview:
https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/tag/develop-442-macos

Это сборка 442 из `3e1bf8ea30f572de545ef5d5f36596c34b3eb9b0`, ещё БЕЗ
обратного переключения 443. PKG/app имеют техническую версию 2.3.3, но это
НЕ стабильный выпуск 2.3.3. Приложение ad-hoc подписано, не notarized Apple.
Полный CI этой 442 был зелёным:
https://github.com/dfedorov-arch/fdv-bouldering-timer/actions/runs/40566625699

Для новой preview предусмотрен `workflow_dispatch`:

```sh
gh workflow run release.yml --ref develop -f publish_macos_preview=true -f preview_installer_version=2.3.3
```

Запускать только по запросу пользователя. Обычный push `develop` запускает
проверки/сборки, но сам НЕ публикует preview. Ручной workflow проходит полный
набор платформ, создаёт отдельный prerelease `develop-<build>-macos`, проверяет
digest/commit, не меняет main, v-теги и стабильный Latest. Подробности:
`.github/workflows/release.yml`, `scripts/build-macos-preview.sh`,
`docs/releases/macos-preview.md`. При новом запуске проверить актуальную схему,
источник артефактов и не перезаписывать уже опубликованную preview.

Сборка 443 уже в GitHub develop; стабильный релиз/preview 443 НЕ выпускались
в рамках этого чата. Пользователь не просил сейчас слияние или новый релиз.

## Стиль работы и безопасность изменений

- Общаться по-русски. Пользователь просит аккуратные, точечные изменения,
  особенно часов, звука, остановок и расписания; объяснять механизм и риски.
- Сохранять отдельную стабильную линию для срочных исправлений соревнований.
  Не смешивать develop/main и не делать force push/reset/удаление данных.
- Обновлять релевантную документацию и генерируемые файлы. `help.docx`
  пользователь разрешил не обновлять. README.md/ReadMe.md на этом Mac могут
  обозначать один файл из-за нечувствительной к регистру ФС.
- Сборка задаётся в сервере, index.html, legacy.html (включая query к JS), sw.js;
  после повышения регенерировать `lib/offline-audio.js` и `docs/standalone.html`:
  `node serve-bouldering-timer.js --generate-offline-audio` и
  `node scripts/build-standalone-html.js docs/standalone.html`.
- Не редактировать пользовательские снимки/сертификаты/настройки для тестов;
  временные fixture изолируют HOME/USERPROFILE/LOCALAPPDATA/XDG_STATE_HOME.
- В `controlled-clock-server.js` важны ожидание child `close`, асинхронный rm
  с повторами и достаточный transport timeout в отдельных Windows CI тестах.
  Не возвращать синхронное удаление, блокирующее callbacks и дающее EPERM.
- Завершённая смена ролей резерва может законно сбросить `switchAll`: тест должен
  проверять новую authority/identity, а не обязательно промежуточный флаг.
- Не сообщать про проверку акустической синхронности/физических ОС на основании
  одних unit/headless/cross-compile тестов.
- Коммит/push/release выполнять по явному запросу, не по наличию готовых файлов.

## Короткий старт для нового чата

Попросить прочитать этот файл и `docs/architecture.md`, затем выполнить
`git status --short --branch` в реальном каталоге проекта. Исходить из текущего
запроса пользователя, а не автоматически продолжать выпуск релиза.
