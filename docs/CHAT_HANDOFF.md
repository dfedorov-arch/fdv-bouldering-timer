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
- Текущая разработка: сборка446. Функциональный commit e860248 опубликован; packaging-fix следует за ним.
  Актуальный hash брать из `git log -1` и `git rev-parse origin/develop`.

## Текущий запрос: коммит и установочные пакеты develop

Пользователь явно попросил обновить описание проекта, сделать коммит в GitHub
и собрать установочные пакеты из develop. Эти действия разрешены текущим
запросом. Слияние в main и выпуск стабильного релиза не запрашивались.

В работу входят изменения444–446 и последние визуальные уточнения. Используется
существующий `.github/workflows/release.yml`: Windows MSI x64, macOS PKG arm64/
x64, Linux DEB arm64/x64, Android APK и portable-архивы, включая Win7/8 x86/x64.
Ручная сборка с `publish_macos_preview=false`, `preview_installer_version=2.3.4`
теперь использует эту техническую версию установщика и не публикует release.
Она выше установленных2.3.2 и старой preview2.3.3. Сам таймер остаётся446.
Команда после push: `gh workflow run release.yml --ref develop
-f publish_macos_preview=false -f preview_installer_version=2.3.4`.
Автоматический push-run можно отменить только для собственного нового commit,
чтобы не дублировать ручную сборку. Итоговые пакеты — artifact
`release-packages-<run_id>`; SHA256SUMS.txt проверять после скачивания.
Первый функциональный commit e8602483f099cc1136124a20768f8b7d57962ab4 отправлен
в develop. Run41598357866 уже собрал современные установщики, но x86 passive
Windows UI harness превысил15s timeout. Локальный обязательный browser subset
дал27pass/1fail: SEC row на1024px выходила на1.36px. Следующий packaging-fix
commit увеличивает только passive harness до45s (case120s) и сохраняет все
проверки; medium SEC chip gap1px ->.75px. Целевые сценарии перепроверяются,
после чего сборка запускается на новом commit. Целевой SEC-case теперь1pass,
Windows Node subset7pass/1platform-skip. Сохранённый docs/standalone.html
дополнительно синхронизирован с446 (раньше отставал на445); preflight теперь
проверяет и его buildNumber. Генерировать именно командой
`node scripts/build-standalone-html.js docs/standalone.html`; default пишет в dist.
Итог дополняется после успеха.

Не включать сгенерированный `lib/native-audio/` в Git: путь добавлен в ignore.
CI собирает аудиобинарники из исходников для каждой архитектуры.

## Дополнительная проверка macOS PKG после успешного CI

Run41599355843 на4350cae был SUCCESS, все9скачанных payload совпали с CI SHA.
Но локальная codesign --verify --deep --strict распакованного arm64 PKG нашла
unsigned nested code: Contents/MacOS/timer-launcher.png. Данные в каталоге кода
подписывались через xattrs, которые обычный CI ZIP не сохраняет. Нельзя считать
эти macOS PKG окончательно готовыми. В следующем commit PNG перемещён в
Contents/Resources, loader ищет этот путь первым только наmacOS. Linux/dev
fallback paths сохранены. Добавлены реальный ZIP-transfer signature test и
проверка готового PKG после expand-full на обеих архитектурах. Новая сборка
запускается после локальной проверки. Ничего не устанавливать/не перезапускать.

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

- Последний полный Node:551total /544pass /0fail /7platform/opt-in skips,
  /private/tmp/fdv-precommit446-node.log. Java больше не требуется исключать.
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
  restoration test; ожидание snapshot добавлено при подготовке новых пакетов.

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
OpenJDK17.0.21.0.3 ARM64 установлен через Homebrew. java/javaс и java_home работают
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
