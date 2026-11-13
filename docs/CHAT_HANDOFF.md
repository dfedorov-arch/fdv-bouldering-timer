# FDV Bouldering Timer — контекст следующего чата

Обновлено: 12 ноября 2026 года. Перед работой сверить Git и текущие процессы.

## Доступность резервного сервера в лаунчере

В исходниках develop454 строка состояния теперь различает настроенную пару и живое соединение: при потере контакта жёлтая надпись «Сервер работает, резервный сервер «адрес» недоступен» (на резервном — «основной сервер … недоступен»), после восстановления прежний текст; удаление пары очищает адрес. Добавлен заголовок X-FDV-Secondary-Available в существующую проверку /api/state, без нового опроса или изменения логики таймера. Windows/Win7 и общий Linux/macOS код обновлены, RU/EN. Проверки: [review/launcher-peer-status454.md](review/launcher-peer-status454.md). Старые архивы и рабочие экземпляры автоматически не обновлялись; для этого изменения нужны новый сервер и новый лаунчер. Пакеты в этом запросе не пересобирались.

## Оформление Windows-лаунчера

Windows/Win7 переведены на общий с Unix визуальный стиль: LauncherTheme.cs, Arial, плоские скруглённые кнопки, единые рамки/отступы, диалоги PIN/сертификата, подсказка о скрытии окна. В launcher.manifest включён system DPI awareness, формы используют AutoScaleMode.Dpi; исправлены повторное масштабирование ListBox и обрезание PIN-подписи. Проверки и ограничения: [review/windows-launcher-theme454.md](review/windows-launcher-theme454.md). Для сравнения/повторной сборки исходные Windows-пакеты build-454-autonomous-audio содержат прежний вид, новые Windows x64 и Windows7/8 x64 ZIP готовы в dist/build-454-windows-theme/artifacts (BUILD-INFO.json и SHA256SUMS.txt рядом). Оба пакета прошли запуск на bundled Node24/Node12, сверку всех файлов и встроенного DPI-манифеста. Рабочие приложения автоматически не заменялись.

## Новый тестовый запуск WSL

По запросу владельца запущен обновлённый Linux 454 из dist/wsl-454-autonomous-audio/fdv-bouldering-timer-build454-linux-x64. HTTP 18055 (Windows: http://127.0.0.1:18055/; адрес WSL при запуске: http://172.21.198.121:18055/), HTTPS-порт настроен 18455 без созданного сертификата. Изолированы XDG_STATE_HOME, single-instance identity, runtime-state и .NET extraction; повторный запуск — dist/wsl-454-autonomous-audio/start-linux-test.cmd. Проверены HTTP 200, build454 и serverAudio.autonomous=true. Начальное состояние остановлено, резерв не назначен. Рабочее приложение не останавливать ради последующих тестов.

## Новые тестовые пакеты 454 — автономный серверный звук

Актуальные четыре portable-архива находятся в dist/build-454-autonomous-audio/artifacts: Windows x64, Windows7/8 x64, Linux x64, macOS ARM64. Они собраны из текущих незакоммиченных исходников develop, включают автономный звук, новые параметры и документацию. BUILD-INFO.json фиксирует базовый commit и SHA256 исходников; SHA256SUMS.txt — суммы всех артефактов. Старые каталоги build-454 и build-454-audio-events не заменялись.

Пересобраны все лаунчеры и Unix-аудиопроигрыватели. Проверены запуски серверов на bundled Node24 Windows/Linux WSL и Node12 Windows, новый autonomous-флаг, defaults false/200, стабильный audioRunId, HTTP-ресурсы, побайтовый состав архивов, отсутствие runtime-state/ключей и Unix execute-биты. ARM64 macOS app/helper имеют ad-hoc подписи; проверены CodeDirectory, специальные слоты и ресурсы, без запуска на Mac и Apple notarization. Рабочие экземпляры владельца не останавливались и не обновлялись автоматически.

## Серверный звук: независимость от браузера

В текущих исходниках выбранный серверный выход отделён от SSE-наблюдателей: закрытие/заморозка/потеря вкладки и удаление браузера из диагностики не прекращают звук. Сохраняется локальная привязанная к хосту конфигурация для восстановления после перезапуска; включение/выключение собственного звука основного передаётся явно. Подробности и проверки: [review/autonomous-server-audio454.md](review/autonomous-server-audio454.md). Новые архивы с этим изменением перечислены выше; ранее запущенные экземпляры сохраняют прежнюю реализацию.

## Текущее локальное состояние: develop / сборка 454

Рабочая копия fdv-bouldering-timer-develop содержит незакоммиченные изменения после build449 (HEAD c1490f6568bfb94be8ce519045ccc969a1346ea0). Номер остаётся 454 по указанию владельца. В этом обновлении документации commit/push, GitHub Release и пересборка пакетов не выполнялись.

Актуальны: отдельное растягивание цифр (общий default false, предел 200% в params.txt), сохранение пропорций двоеточия Modern, новая сетка настроек, тихий прогрев Start/Финала и предел восстановления ручного сигнала 3 секунды, немедленный браузерный fallback, audioRunId и дедупликация событий, резервирование 2/20 секунд, роль/адрес пары в лаунчере. SEC рядом с PIN показывает доступность пары цветом рамки и светлеет при наведении; карточки браузеров сохраняют прежние цвета маршрута.

Руководство RU/EN, README, четыре платформенные инструкции и скриншоты актуализированы; источники снимков и проверок: [review/documentation454.md](review/documentation454.md). Пользовательские серверы не следует останавливать ради тестов: применять disposable fixtures и passive launcher harnesses. Изолированный запуск WSL на 18054/18454 и сервер Windows на 8008 могут быть связаны и использоваться владельцем.

Локальные архивы dist/build-454-audio-events/artifacts содержат предыдущую сборку 454 со звуковыми идентификаторами; более поздние изменения SEC, флага timer_vertical_stretch и документации требуют отдельной пересборки перед раздачей. Факт физического звучания не подтверждается программными снимками. Причина сообщённого обрыва звука при ошибке аудиочасов −457 мс пока не установлена без соседних диагностических записей.

## История предыдущей передачи контекста (3 ноября)

Сведения ниже относятся к прежним коммитам/CI и не определяют текущую рабочую копию.

## Завершено: commit/push и пакеты develop448 /2.3.5

Текущий запрос пользователя выполнен. Вdevelop опубликованы:
-45aac79c909151d987569c51291f4616d66ec06a — сессии/PIN447 и encrypted peer448;
-648a26811dfe0082c15f5e14979ce6194b63f540 — bounded polling HTTP503 во время
  приёма baseline в новом mixed-runtime тесте; production code не менялся.
Именно648a268 — source commit готовых пакетов. Последующий docs-only HEAD
фиксирует результат, его hash читать изgit log -1; повторная CI не нужна.
main/da03969771edf88140e63398ead4818b322854bd и stable Latestv2.3.2 не менялись.

Итоговый GitHub Actions run41711270555 — SUCCESS,15successful jobs;
незапрошенная публикация macOS preview skipped. Inputs:
publish_macos_preview=false,preview_installer_version=2.3.5.
https://github.com/dfedorov-arch/fdv-bouldering-timer/actions/runs/41711270555
Artifact release-packages-41711270555,ID13267444279,956882485байт:
https://github.com/dfedorov-arch/fdv-bouldering-timer/actions/runs/41711270555/artifacts/13267444279
GitHub Release не создавался. Техническая версия пакетов2.3.5,таймер448.

Все14payload скачаны локально и SHA256 сверены сCI SHA256SUMS.txt:
`/Users/fd/Documents/ChatGPT/Timer 2/builds/develop-448-648a268`.
Содержимое: Windows MSI x64+modern ZIP; Windows7/8 ZIP x86/x64;
macOS PKG+portable tar.gz arm64/x64; Linux DEB+portable tar.gz arm64/x64;
Android APK иstandalone HTML. Общий размер payload964237321байт.
BUILD-INFO.json/CI-ARTIFACT.json содержат source/run,имена,размеры иSHA256.

ОбаPKG распакованы во временные каталоги:9критичных файлов совпали с648a268,
включаяsecondary-crypto/server/client scripts; версия2.3.5,иконка вResources;
codesign --verify --deep --strict app и--strict native helper успешны.
ОбаWin7/8 ZIP: защищённый протокол присутствует,старого plaintext header нет,
4исходных текста совпали сcommit с учётомEOL,собранные server bundles идентичны
междуx86/x64 и прошли--check настоящимNode12. Результаты вMACOS-*-VERIFICATION.json
иWINDOWS-LEGACY-*-VERIFICATION.json. Пакеты не устанавливались и не запускались;
рабочие серверы не перезапускались этим запросом.

Предыдущая попыткаrun41710431400 на45aac79 выявила вновомx86 тесте переходный
HTTP503 при смене ролей. В648a268 poll повторяет только ожидаемый baseline503,
проверяет готовность обеих ролей и сохраняет7s bound; все другие ошибки пробрасывает.
Полный повторный CI прошёл,включая реальныйWindows Node12 x86/x64 ибраузерыx64.
Скачивание полного набора делалось возобновляемыми ranges сcheckpoint иlock;
финально каждый payload повторно проверенSHA. Старые пакеты446 остаются историей.

## Новое: develop448 — шифрованный обмен серверов, включая Win7/8

Поверх локальной447 реализована448. Commit/push и упаковка2.3.5 завершены,
см. итоговый раздел выше. Stable release не публиковался.
Рабочий сервер и отдельный тестовый сервер447 не перезапускались этим изменением.

- Новыйlib/secondary-crypto.js: X25519, HKDF-SHA256 черезcreateHmac дляNode12,
  AES-256-GCM. Начальное сопряжение выводит общий секрет без его передачи.
  При reconnect/restart — свежий DH с HMAC-подтверждением существующим секретом.
- Все peer POST и ответы зашифрованы: pair, ping, replicate, commands, rejoin,
  return-ready, promote, unpair. Нет открытого x-fdv-secondary-key и fallback.
  Public identity/status/handshake содержат только публичные данные/proofs;
  browser takeover остаётся защищённым browser-session действием.
- Directional keys/nonces, counter replay window1024, path/status binding,
  эфемерные каналы не сохраняются. Корневой секрет пары — только private snapshot.
  Старые сохранённые пары могут поднять новый канал после обновления обоих peers;
  работающий старый бинарник продолжит старый протокол, поэтому обновлять оба.
- Время DH исключено из измерения часов, cache TTL монотонный. Тест с задержкой
  handshake220ms подтверждает отсутствие смещения часов. Якоря/сигналы не менялись.
- Согласованный предел защиты: пассивный перехват закрыт; при первом сопряжении
  без сверки отпечатка активный MITM остаётся возможен. Browser HTTP не шифруется.
- README/help/architecture обновлены; offline/standalone448 пересобраны;
  verify-release-inputs прошёл. Legacy bundler включает новый модуль автоматически.

Проверки448: полный Node567total/560pass/0fail/7skip, включая реальные Node12
тесты (/private/tmp/fdv448-final-node.log). Node12.22.12 darwin-x64 скачан сnodejs.org,
SHA256 сверён с официальным SHASUMS256. Mixed Node12/modern в обе стороны,
restart/reverse RPC/role reversal —5pass в/private/tmp/fdv448-node12-both.log.
Crypto6pass: wire capture, secrets отсутствуют, tamper/replay/path/status/old-protocol
rejection, slow handshake (/private/tmp/fdv448-crypto-final.log).
BrowserSEC:8pass modern,3pass Node12,1pass RU/EN crypto errors; логи
/private/tmp/fdv448-browser-{sec,node12,errors}.log. Windows CI x86/x64 запускает
добавленный mixed crypto case; реальная Win7/8 локально не проверялась.

## Новое: develop 447 — сессии браузеров и PIN лаунчера

Изменения447 поверхc78f491 вошли в448/45aac79; готовые пакеты448 указаны выше.
Отдельного набора установщиков447 нет. Сервер446 не перезапускался этим изменением.

- Случайный256-bit секрет вкладки, на сервере только SHA256; public ID не
  авторизует команды, изменение metadata, SEC administration или native prepare.
  Секрет только в sessionStorage и HTTP header, не вURL/SSE/diagnostics.
- Общий PIN независим от основного браузера. Первое назначение с PIN защищено;
  source не обходит проверку. Лимит попыток по source address, не clientId.
- Windows/Legacy и Unix лаунчеры: «PIN управления», установка/смена/удаление через
  локальный process capability. Смена отзывает подтверждения, не останавливая
  таймер. В режиме Экран PIN не мешает; возврат к панели требует подтверждения.
  Выданные CTRL сохраняются. Без PIN до назначения основного поведение прежнее.
- PIN plaintext больше не возвращается и не сохраняется; старый snapshot очищается.
  Даже истёкший snapshot сохраняет PIN. При обновлении со старой версии без
  секретов вкладки получают новые ID; основной и CTRL назначаются заново.
- Сессии/PIN revision сохраняются и реплицируются, отдельная session revision не
  меняет timer version/anchor. Проверены reverse RPC и автоматический failover.
  Empty standby с установленным PIN нельзя перепарить поверх его защиты.
- HTTP сохранён осознанно: remote secrets идут незашифрованно; localhost остаётся
  локальным. Не обещать защиту от сетевого MITM.

Проверки: полный Node559/551pass/0fail/8skip (до дополнительного migration case),
/private/tmp/fdv447-full-node3.log. Новые security cases вtest/browser-auth.test.js.
Browser: CTRL+PIN+audio reload3pass; Final format+SEC13pass; layout3pass;
command delivery+manual Final12pass. Security8pass в/private/tmp/fdv447-security8.log.
Offline bundle иdocs/standalone.html пересобраны447; verify-release-inputs прошёл.
Unix launcher build0warnings/errors, native headless/UI+реальный PIN transport
3pass: /private/tmp/fdv447-native-launcher2.log. Windows native здесь не запускался;
его harness обновлён для CI. Подробные результаты в/private/tmp/fdv447-*.log и текущем git diff.
help.docx не менялся.

## Проект и рабочие каталоги

Таймер соревнований по болдерингу: Классика, Фестиваль, Финал (старый/новый),
синхронные экраны в LAN, стартовые списки, приостановки, резервный сервер,
Legacy-экран без звука, автономный HTML и Android APK.

- Исходники: `/Users/fd/Documents/fdv-bouldering-timer`, ветка `develop`.
- Репозиторий: https://github.com/dfedorov-arch/fdv-bouldering-timer.
- Стабильная линия: `/Users/fd/Documents/fdv-bouldering-timer-stable`, `main`,
  сборка440 / v2.3.2 / da03969771edf88140e63398ead4818b322854bd.
- Рабочая папка чата: `/Users/fd/Documents/ChatGPT/Timer 2`; это не исходники.
- Текущая локальная разработка: сборка448 (см. выше). Готовые установщики446:74c1c50, результат последующим docs-only commit.
  Актуальный hash брать из `git log -1` и `git rev-parse origin/develop`.

## Завершено: коммиты и установочные пакеты develop

Пользователь явно попросил обновить описание проекта для следующего чата,
сделать commit/push в GitHub и собрать установщики develop. Выполнено.

Код опубликован в develop:
- e8602483f099cc1136124a20768f8b7d57962ab4: изменения444–446 и UI;
- 4350caefbc15e73ecd44d11372feb29f7cee385b: готовность упаковки и standalone;
- 74c1c5060945e399e586f9f99cf2cf56e0fe3fe0: окончательный macOS resource/signature fix.
Именно74c1c50 — source commit готовых установщиков. Следующий docs-only commit
фиксирует результаты и пропускает повторную CI-сборку; актуальный HEAD из Git.
main / da03969771edf88140e63398ead4818b322854bd и stable Latest v2.3.2 не менялись.

Финальный GitHub Actions run41633111506: SUCCESS,15successful jobs;
только не запрошенная публикация macOS preview штатно skipped.
https://github.com/dfedorov-arch/fdv-bouldering-timer/actions/runs/41633111506
Inputs: publish_macos_preview=false, preview_installer_version=2.3.4.
Техническая версия установщиков2.3.4, таймер446; GitHub Release не создавался.
Полный artifact release-packages-41633111506, ID13230300838, 956744057байт:
https://github.com/dfedorov-arch/fdv-bouldering-timer/actions/runs/41633111506/artifacts/13230300838

Готовы Windows MSI x64, macOS PKG arm64/x64, Linux DEB arm64/x64,
Android APK и Windows7/8 ZIP x86/x64. Локально все8и standalone HTML:
`/Users/fd/Documents/ChatGPT/Timer 2/builds/develop-446-74c1c50`.
Все9payload сверены с CI SHA256SUMS.txt. BUILD-INFO.json содержит source/run,
имена, размеры и SHA256; CI-ARTIFACT.json — метаданные полного архива.
5modern portable-архивов также собраны и доступны в полном GitHub artifact,
локально не скачивались. Из-за медленной сети установщики скачивались выборочно
HTTP-range из CI ZIP, с checkpoint/продолжением; каждый payload проверен SHA.

Оба macOS PKG дополнительно распакованы только во временные каталоги:
index/server/audio/receipt файлы побайтно совпадают с74c1c50, app version2.3.4,
PNG вContents/Resources, codesign --verify --deep --strict app и --strict
native helper успешны. Результаты MACOS-ARM64-VERIFICATION.json и
MACOS-X64-VERIFICATION.json. Ничего не устанавливалось и не запускалось.

Предыдущие попытки:
- run41598357866/e860248: x86 passive native UI timeout15с; child budget45с,
  case120с, проверки сохранены. В окончательном CI x86/x64 прошли.
- run41599355843/4350cae: CI SUCCESS и SHA совпали, но локальная strict-проверка
  PKG обнаружила unsigned PNG вContents/MacOS после ZIP-переноса. Эти macOS
  пакеты в builds/develop-446-4350cae помечены superseded, не являются итогом.
  В74c1c50 PNG перемещён вResources, Mac loader ищет этот путь первым;
  Linux/dev fallback оставлен. Реальный ZIP-transfer signature test и проверка
  готовых PKG после expand-full добавлены в CI и прошли на обеих архитектурах.
- Локальный SEC-row overflow1.36px при1024px исправлен medium gap1->.75px;
  targeted regression прошёл. Narrow sound-row240/300px тоже исправлен.
Дублирующие автоматические push-runs отменялись; источник результата — run выше.

Generated lib/native-audio/ исключён из Git; CI строит runtime из исходников.
Текущий запрос commit/push/build завершён. Новые публикация/restart/install
не выполняются автоматически и требуют актуального пользовательского запроса.

## Что изменено

-444: подтверждения получения и применения всех команд через существующие
  SSE/HTTP запросы. Получение не равняется применению. HTTP немедленно подхватывает
  пропуски и восстанавливает SSE; сервер делает разовую repair-попытку через3с.
  Команды повторно не исполняются. Legacy поддерживает receipts через общий ES5
  lib/client-delivery.js. Звуковые события дедуплицируются и имеют срок годности.
-445: macOS Node/libuv включает сон в clock, .NET8 Stopwatch не включает.
  Existing native keepalive с числовым now и RTT<=50мс исправляет offset-step
  >100мс до отправки cues; старая очередь отменяется, планируются будущие сигналы.
-446: при сбое native player — максимум3 попытки через1/3/10с; старый process
  должен завершиться до нового. Повторная загрузка PCM и калибровка, затем новый
  lease handshake. Независимые bounded transport retries браузера; ожидание
  release ACK до fallback; защита от старых prepare/stream callbacks.
  Native recovery epoch возвращает канал даже при пропущенном available=false.
  Лимит обновляется после60с стабильных проверок без gap>2.5с; сон не засчитывается.
  Stalled renderReads обнаруживается через2.5с, после сна даётся fresh grace.
  API хранит reason/state/attempt/limit/epoch даже без performance diagnostics.
- UI446: `Звук через: сервер [radio][radio] браузер`, RU/EN, выбранная подпись
  оранжевая, другая серая. При недоступности обе radio disabled с tooltip,
  визуально выбран browser fallback; сохранённое предпочтение не меняется.
  Receipt —8px круг после IP, без отдельной строки: green applied, yellow
  pending/received, red unconfirmed, gray unsupported; пояснение в title/aria.
  Длинное имя браузера сокращается; IPv4 и dot остаются в одной строке.
  Open audio editor обновляет radio/dot без потери несохранённой подстройки.
- Подготовка пакетов: Windows restart-тест языка ждёт debounced snapshot до
  завершения процесса (Windows SIGTERM не делает POSIX flush). Старый source-
  regex точной HTML-разметки удалён: геометрия заголовка покрыта браузерным тестом.
  При ширине звуковой строки<=310px у второго label убран лишний flex gap;
  caption/slots/main gap10px и порог полной подписи300px сохранены.

## Проверки и ограничения

- Последний полный Node:552total /544pass /0fail /8platform/opt-in skips,
  /private/tmp/fdv446-final-resource-node.log. Java больше не требуется исключать.
- Radio/reload/keyboard/failure-recovery и receipt geometry/tooltip:4browser
  cases passed14с; selected-color follow-up:1passed5.2с.
- Narrow/wide sound-row checks:2passed2с, RU/EN и все существующие ширины.
- Native suite до визуальных уточнений:8browser cases passed58.8с.
- CoreAudio isolated silent probe: принудительный SIGKILL тестового helper ->
  автоматическое восстановление ->1future cue played; исходники/параметры
  основного сервера не затрагивались. Это не акустическая проверка.
- Физический sleep/wake446 не проверялся. Ранее Web Audio в Safari мог молчать
  при context=running/nonzero PCM; исходный trigger не доказан. Проверка
  speechSynthesis.cancel дала неоднозначный результат, код речи не менялся.
- Старый полный visual suite имел4 baseline failures на d64f780. Sound-row
  blocker теперь исправлен; Modern two-protocol и два Legacy TV screenshot
  случая ещё не объявлять исправленными без отдельной проверки.
- Последний старый GitHub run40666432622 падал на Windows launcher-language
  restoration test; ожидание snapshot добавлено, финальный CI зелёный.

## Рабочий сервер на этом Mac

Launcher23820: `/private/tmp/fdv-launcher443-dock/osx-arm64/FDV Bouldering Timer.app`.
Он запускает Node из исходников; это не установленный release446.
По явному разрешению пользователя 3 ноября сервер перезапущен на446:
Node88121, native helper88127; HTTP8008, HTTPS8443.
Instance1c86a456-75bb-4621-9a14-13d642008485.
Оба браузера вернулись на446; primary847dcfdf-d036-43f4-8990-e8da035a9f0c
владеет native route. PIDs устаревают — перепроверять перед действиями.
Настройки/offsets/preferences сохранены. Restore намеренно очищает неприкреплённый
browserOrder до reconnect; оба экрана восстановили прежний живой порядок.
Backup: `/var/folders/1_/0ch204xs65n5k_vcvrn7t7tm0000gn/T/fdv-before446-restart-w8lSFr/`.
Визуальные правки446 уже отдаются static server, применяются обновлением страницы.
Новый перезапуск рабочего сервера/установка пакетов требуют отдельного разрешения.

## Среда и правила продолжения

Node24.16.0, .NET SDK10; native runtime self-contained.NET8. Для framework-
dependent .NET8 self-test с SDK10 использовался DOTNET_ROLL_FORWARD=Major.
OpenJDK17.0.21.0.3 ARM64 установлен через Homebrew. java/javac и java_home работают
через ~/Library/Java/JavaVirtualMachines/openjdk-17.jdk; shell profiles не менялись.
В CI Node24.17.0, JDK17, Gradle8.11.1, Android platform35.

Общаться по-русски; не смешивать develop/main, не делать force push/reset,
не удалять runtime snapshots/certs/user settings. Тесты — в изолированных fixture.
Часы, звук, authority и сигнальные ключи менять только с пониманием контракта:
обычный reconnect не сбрасывает калибровку; recovery не повторяет старые сигналы.
Коммит/push/публикация требуют явного запроса; текущий запрос разрешает commit/
push и сборку пакетов. Не использовать загруженные бинарники как исходники.
Визуальные тесты могут автоматически перезаписывать help PNG — сохранять только
изображения относящихся правок; не принимать новые эталоны ради зелёного теста.
help.docx пользователь разрешил не обновлять. Не заявлять физическую слышимость
или поддержку реального устройства по одним unit/headless/cross-compile тестам.

Архитектура: docs/architecture.md; карта: docs/documentation-map.md.
Подробная историческая диагностика и исходные логи:
[архив предыдущего контекста](archive/CHAT_HANDOFF-2026-11-03-before-packaging.md).
Рабочие probes и результаты сохранены в `/Users/fd/Documents/ChatGPT/Timer 2/analysis/`.
