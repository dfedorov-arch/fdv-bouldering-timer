# FDV Bouldering Timer — контекст следующего чата

Обновлено: 3 ноября 2026 года. Перед работой сверить Git и текущие процессы.

## Проект и рабочие каталоги

Таймер соревнований по болдерингу: Классика, Фестиваль, Финал (старый/новый),
синхронные экраны в LAN, стартовые списки, приостановки, резервный сервер,
Legacy-экран без звука, автономный HTML и Android APK.

- Исходники: `/Users/fd/Documents/fdv-bouldering-timer`, ветка `develop`.
- Репозиторий: https://github.com/dfedorov-arch/fdv-bouldering-timer.
- Стабильная линия: `/Users/fd/Documents/fdv-bouldering-timer-stable`, `main`,
  сборка440 / v2.3.2 / da03969771edf88140e63398ead4818b322854bd.
- Рабочая папка чата: `/Users/fd/Documents/ChatGPT/Timer 2`; это не исходники.
- Текущая разработка: сборка446. Код готовых установщиков74c1c50, результат последующим docs-only commit.
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
