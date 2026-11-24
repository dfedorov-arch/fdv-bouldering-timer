# FDV Bouldering Timer — контекст следующего чата

## Публичный таймер, кабинет и WSS — 24 ноября 2026

Начните с [руководства](../help.html#hosted-timer), [развёртывания кабинета](../portal/README.md) и [описания SEC по WSS](sec-websocket.md). Рабочая копия для продолжения — `fdv-bouldering-timer-develop`, ветка `develop`. Кабинет и WSS интегрированы в сборку 459. Изменения для будущих Windows MSI описаны ниже. Тесты и дальнейшие правки выполнять в этой рабочей копии.

### Состояние развёртывания

- [Главная страница и кабинет](https://fdvtimer.online/) раздаются на VDS через Caddy. Публичные экземпляры находятся в wildcard-зоне `timers.fdvtimer.online`. Служба `fdv-portal.service` слушает `127.0.0.1:9190`. Код кабинета в `/opt/fdv-portal/portal`, исходные файлы таймера в `/opt/fdv-portal/timer`, учётные записи, заявки и данные экземпляров в `/var/lib/fdv-portal`. Порты дочерних экземпляров 9200–9207 доступны через loopback.
- Стабильный GitHub Latest — [v3.1.2](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/tag/v3.1.2), сборка 458 по `update-info.json`, коммит тега `ef62b7a0d32640801c3a61a41fb09c0f02231ca7`. В исходниках этого тега отсутствуют поле кода SEC и туннель WSS. Кнопка «Скачать последнюю версию» ведёт на стабильный релиз. Для теста WSS нужен локальный FDV с этими изменениями.
- Публичный экземпляр на 9200 отвечает как тестовая сборка 457. Локальный тестовый сервер на `http://127.0.0.1:8009/` также ответил сборкой 457. HTML на 8009 содержит поле кода SEC. Старый тестовый порт 18088 не ответил при проверке 24 ноября. Перед проверками сверяйте фактический адрес из кабинета и номер сборки в `/api/sec/identity`. Адрес экземпляра может измениться по решению владельца.
- Для проверки пары после обновления до 459 сначала обновите обе стороны. Действующие экземпляры 457 продолжают использовать ранее развёрнутые исходники.
- Служба читает закрытую конфигурацию из `/etc/fdv-portal/portal.env` и `/etc/fdv-portal/smtp.env`. Пароли, ключи и токены в историю чата не включать. Справочник по инфраструктуре VDS лежит в рабочей папке проекта Proxy, `VDS-HANDOFF.md`. Публикация руководства на `help.fdvtimer.online` обслуживается из `/var/www/fdvtimer-help` отдельно от процессов таймера.

### Что реализовано

- Доступ по списку разрешённых email с подтверждением почты. С главной страницы можно подать заявку. Администратор одобряет или отклоняет её с отправкой письма заявителю и может приостановить аккаунт. Изменения главной страницы включают актуальные скриншоты, логотип вкладки и ссылку на полное руководство.
- Кабинет управляет запуском, обычным перезапуском и остановкой экземпляра, показывает сборку, отсчёт, состояние SEC и журнал. PIN меняется в панели. «Стоп» с активным отсчётом или действующей локальной связью требует подтверждения.
- Очистка публичного сервера удаляет сохранённый отсчёт, списки, PIN и настройки экземпляра, закрывает туннель, меняет его токен и отзывает старый код. Учётная запись, адреса и гостевая ссылка сохраняются. Перед привязкой портал проверяет данные публичного резерва. Списки блокируют привязку, даже если их показ выключен в интерфейсе.
- Локальный сервер за NAT открывает исходящий WSS. Для пары передаются HTTPS-адрес экземпляра и одноразовый код на 15 минут. После выдачи кода проверьте его в SEC локального таймера с тем же номером сборки. Туннель использует существующий протокол SEC. VPN-варианты и отдельный режим ретранслятора отложены.
- Публичный HTTPS-адрес можно скопировать значком или изменить карандашом. Старый адрес по умолчанию продолжает работать. После отдельного подтверждения его можно отключить, закрыв соединения экранов и SEC по этому адресу. Отключённый адрес остаётся зарезервирован за владельцем. Копирование подтверждается прямо под соответствующим полем.
- Гостевое табло использует общий снимок и измерение канонического времени, показывает номер ротации и поддерживает полный экран. Гостевые вкладки не получают управление и не регистрируются в диагностике. QR открывается в новой вкладке как изображение. В кабинете адрес можно скопировать отдельной пиктограммой.

### Проверки и следующие ориентиры

- Интеграционный тест `node --test test/hosted-portal.test.js` покрывает допуск по почте с заглушкой SMTP, регистрацию, операции владельца, пустоту резерва, выдачу/отзыв кода, смену адреса и закрытие SSE/WSS только по отключённому адресу, гостевой доступ и QR. На Windows в песочнице можно перед запуском назначить `TEMP` и `TMP` на каталог этой рабочей копии.
- Реальные браузерные проверки в Edge подтвердили копирование, подтверждения рядом с полями, расположение кнопок на узких/широких экранах и декодирование QR ровно в гостевой URL. Отдельный ручной тест меню копирования картинки не проводился. SMTP-заглушка не заменяет проверку внешней доставки.
- Для следующей полной проверки пары используйте тестовые экземпляры. Выполните привязку, проверьте отсчёт на обычном и гостевом экранах, отказ основного и возврат, затем проверьте работу при сохранении старого адреса. Перед намеренным отключением адреса или сбросом убедитесь, что это тестовый экземпляр. Публичные данные ради документации не сбрасывались.
- При публикации портала сначала проверяют, что нет активного отсчёта. Изменения Node-шаблонов и маршрутов требуют перезапуска службы. Статические файлы выдаются с диска. Последняя деплой-резервная копия файлов кабинета до локализации сообщений копирования лежит в `/root/fdv-portal-copy-status.39Mz336g/before`.
- Обновлённое русское и английское руководство опубликовано на `help.fdvtimer.online` без перезапуска служб. Краткие инструкции добавлены в существующий публичный ReadMe. Перед публикацией проверили 45 файлов оформления и иллюстраций, переходы по оглавлению и размеры на мобильной и настольной ширине. Резервная копия опубликованных файлов до этой редакции в `/root/fdv-hosted-guide.1aEXM0xC/before`. Канонический исходник — `help.html` в рабочей копии develop. Word-копия от 3 августа 2026 года архивная, владелец ей больше не пользуется.
- На этапе документации целевой набор кабинета и SEC дал 22 успешных проверки и 2 пропуска из 24. Проверка файлов сборки 457 прошла. Полный `npm test` в Windows не прошёл. В повторном запуске из 666 проверок 642 прошли, 13 завершились ошибкой и 11 были пропущены. В общих прогонах проявились ошибки Unix-упаковки и проверки SEC, часов и сохранения растяжения экрана. Полный лог повторного прогона лежит в `.codex-test-temp/hosted-docs-full-suite.log` у корня рабочего пространства.
- При последовательном повторе проверки шифрования SEC и растяжения экрана прошли. Две проверки непрерывности часов из `test/server-clock-continuity.test.js` снова завершились ошибкой. Лог в `.codex-test-temp/hosted-docs-retry-suite.log`.

Future installer preference: Windows MSI desktop shortcut checkbox now defaults
ON through CREATE_DESKTOP_SHORTCUT=1 in shared Product.wxs (modern and Win7/8,
x86/x64). Users can still uncheck it; component remains property-conditioned.
Compiled-MSI verification now requires both shortcut defaults to be selected.
Four installer asset checks, XML wiring and PowerShell parsing passed. The
change is part of develop for future releases. Existing installers keep
their original defaults.

## Latest stable 3.1.2 / build458 (20 November 2026)

Published [v3.1.2](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/tag/v3.1.2)
at commit ef62b7a0d32640801c3a61a41fb09c0f02231ca7. All 15 required
[release jobs](https://github.com/dfedorov-arch/fdv-bouldering-timer/actions/runs/44813125920)
passed. Verified 18 assets, all 16 package digests, the bilingual notes and
v3.1.2/build458 update metadata. The
[project site](https://github.com/dfedorov-arch/fdv-bouldering-timer/actions/runs/44814628512)
deployed successfully from main. Running timer instances were left alone.

Local checks: 654 Node tests passed and 10 platform-specific tests were skipped.
Chromium passed 22 of 23 initially. The existing silent extra-rotation test
timed out on its second Start and passed both targeted reruns. The Unix
launcher compiled successfully.

- On macOS automatic browser opening uses `open -g` to keep the launcher
  focused at startup. The owner reported no further hover delays in repeated
  launches. Manual opening still activates the browser.
- Selecting the next rotation in New Final stages the pending extra rotation
  at that boundary. Server and standalone use the same staging helper, limited
  to Final modes.
- During a scheduled start wait, browser sound tests use the calendar start
  anchor. Internal clock updates continue without cancelling the test.
- A separate Windows report of silent server audio remains under investigation.
  The WAV/MP3 comparison was discussed with the owner. No Windows audio or codec
  changes are included.

## Previous release: 3.1.1 / build457 (19 November 2026)

Published v3.1.1, tag7146332eafcb5062ef1bb80914fb1d06eb4a73ce. Main and develop
synchronized. Workflow44559509616 passed; waiting macOS jobs were retried with
successful jobs preserved and no source/tag changes. Verified18 assets,16 package
SHA-256 digests, release body, v3.1.1/build457 metadata and stable Latest.
Review: [review/release311.md](review/release311.md). Test server left running.

Build457 exclusion display follow-up: restore full-row red strikes through all
route cells in Classic and Old Final. In New Final, retain DNS text without a
route-cell strike for retained nominal slots; globally skipped nominal rotations
receive a red strike instead of visible DNS. Pure excludedCellSkipped helper
reads the existing global skipped mapping without changing any timing or schedule.
Modern and Legacy, standalone and filtered-list behavior verified: 95 Node cases,
seven Chromium Playbook cases passed. Three row screenshots visually inspected.
Updated owner test UI/shared display module and standalone without server restart;
existing browser tabs need Ctrl+F5. Build stays457; no commit/push/release yet.

Latest local development build is457 (456 is already published in3.1.0).
Updated Modern/Legacy/server/SW constants, Legacy asset query versions and
generated offline/standalone bundles; release-input and whitespace checks pass.
Current test server was updated to457 while paused; params/lists and exact
paused elapsed3467.084726811328s were retained. System Node runs at the same
`dist/test-server-20261119-456` path and HTTP18088; folder name retained intentionally.
Backup `dist/final-playbook-audit/test-before-build457-20261119-173147`.
No commit/push/new release for this local follow-up yet. Refresh existing tabs.

## Post-3.1.0: manual Start at an ordinary rotation boundary

Local develop fix: a manual start at any exact full-span rotation boundary
receives the initial-start 600ms quiet prewarm lead and one start cue, including
after seek and after an exclusive Classic repeat. Middle-of-phase resumes remain
silent. `manualStartElapsed` preserves the selected timeline coordinate separately
from the new start target; included in server snapshots/SEC and standalone saves.
Modern/Legacy hold the selected rotation during preparation; Modern recovery and
native planning share the new target without a duplicate boundary cue. Standalone
now applies the same lead. Full Linux662/650pass/12skip/0fail; targeted39 Node cases,
two initial browser cases and five distinct regression browser scenarios passed
(Classic seventh-rotation start, pause/reset during resume, both standalone flows).
Updated owner `dist/test-server-20261119-456`, system Node PID32048 on18088.
Paused coordinate1890s preserved, no extra rotations; Ctrl+F5 needed.
Backup `dist/final-playbook-audit/test456-before-boundary-start-20261119-172404`.
Build456 retained. Changes are local; released v3.1.0/tag has not been modified.

## Stable 3.1.0 published, 19 November 2026

Latest stable is now v3.1.0/build456, tag88b5f8e. Main/develop synchronized;
notes committed separately1278fb6. Workflow44507877659 passed after retrying
the failed Win7/8 x64 browser job without changing source/tag. Verified18 assets,
all16 package SHA-256 digests, update metadata and Latest. Review:
[review/release310.md](review/release310.md). Current test server was left running.

## Синхронизация develop с GitHub и зелёный CI (19 ноября 2026)

Работа над сборкой 456 опубликована. Коммит `37b2952` («Add Playbook Final
schedule, extra rotations and Classic slots (build 456)», 48 файлов, +3751/−225)
отправлен в `origin/develop`. `main` не менялся и остаётся на `23a6a86`. Тег и
релиз не создавались: `v3.0.1` (сборка 455) остаётся Latest.

Первый прогон CI 44347205138 упал не из-за кода: в заданиях `windows-legacy`
x86/x64 файл `started.txt` читался, пока дочерний Node-процесс ещё держал его
открытым (`IOException` «файл занят другим процессом»). Тот же тест в задании
`windows-launcher` того же прогона прошёл; локальный прогон
`test/windows-legacy.test.js` на настоящем Node12.22.12 x64 дал 5/5. Отдельно
macOS ARM64 так и не получил раннер (очередь), а `release` и `*-installers`
были пропущены из-за падения.

Исправление — коммит `35f7c8e` («Fix launcher startup test race reading
started.txt while it is written»): в `test/helpers/launcher-process-checks.cs`
добавлено чтение с повтором до появления нужного числа строк; логика таймера не
менялась. Прогон 44477996497 (номер 77) полностью зелёный: все 15 обязательных
заданий успешны, включая `windows-legacy` x86/x64, macOS ARM64 и `release`;
`macos-preview` пропущен штатно. Пакеты 456 существуют только как артефакты CI
(`release-packages-44477996497`, 939,3 МБ), ничего не опубликовано.

Тестовая копия из этих исходников: `dist/test-server-20261119-456`, свой
`params.txt` (http 18088 / https 18443) и своё `runtime-state`; запущена
19 ноября в 10:21 MSK, PID 24948, http://127.0.0.1:18088/, сборка 456, таймер
остановлен. Процесс работает с обычными правами, поэтому из confined-shell не
виден (`Access denied`) — останавливать из обычного PowerShell. Основной сервер
8008/8443 не запускался.

## Classic / Old Final / empty rotations (develop456, 18 November)

19 November: immediate reservations now resolve route incidents before locating
the displaced ordinary athlete. The owner's pause on route2 at cycles7–9 moved
the actual route5 occupant into15; the earlier projection displaced a different
athlete using unpaused cycles. Reservation and final occupancy validation now
include resolved ordinary attempts; queue/list changes reject remaining conflicts.
Projection caching includes incident content. Last-route time badges appear LEFT
of the marker. 106 targeted Node cases, four Chromium scenarios and full Linux
suite656/644pass/12skip/0fail passed.
IMPORTANT current server is the user's NEW copy `dist/test-server-20261119-456`,
not the former launcher-test folder. System Node PID27468, HTTP18088/HTTPS18443;
actual process directory was verified. Updated/restarted preserving saved pause
1881.873429841797s, Classic120s+10s and one immediate repeat after14 on route5.
Independent API/projection confirms repeat15, displaced ordinary athlete16.
Backup `dist/final-playbook-audit/test456-before-incident-reservation-20261119-110634`.
Launch metadata updated; existing tabs need Ctrl+F5. Recheck process paths before
stopping anything; the parent process may already have exited.

Latest user correction: retain the next ordinary athlete's preparation while
the current Classic repeat is still preparing, but draw that ordinary triangle
at 35% opacity. Restore full opacity when the repeat starts. Marker semantics,
row highlighting and scroll readiness remain ordinary ready. This supersedes
the earlier hidden-ready correction below. Modern/Legacy both use the shared
preparationDeferred display helper; no clock/audio changes. 87 Node cases and
two Chromium scenarios passed, including automatic return to full opacity.
Owner test UI and standalone updated without restart; existing tabs need Ctrl+F5.

Ready-time overlay follow-up: Modern and Legacy display awarded M:SS to the
right of an additional-attempt ready marker, in an opaque absolute badge above
adjacent cells/dashes. It disappears when the marker becomes active or done;
ordinary preparation and empty rows have no badge. Covers Classic virtual rows
and both exclusive Final formats, including preparation for the next A/R.
Ready plan edits invalidate display data. Three Chromium scenarios, 105 targeted
Node cases and a final 43-case domain/ES5 check passed; screenshots inspected.
Standalone and owner test UI updated without server restart; Ctrl+F5 required.

Follow-up: a delayed shared-flow repeat in the current rotation and the normal
athlete for the next rotation both displayed ready on the same boulder. Shared
Modern/Legacy marker logic now hides the next ordinary ready marker until the
repeat's awarded time begins. Its schedule remains shifted to the next rotation.
87 Node cases and two Modern/Legacy Chromium scenarios passed. UI/shared display
files and standalone were updated in the owner test copy without restarting its
server. Existing tabs need Ctrl+F5; clock/audio scheduling were not changed.

Completed the user's extension and answered choices: Classic placement is per
block (front slot or immediate next rotation); solo checkbox defaults off;
empty rotations are available in Classic and both Finals. Old Final route pause
is disabled and exactly one athlete may be assigned to its A/R. New shared ES5
rotation-slots projection adds virtual rows and shifted ordinary schedules.
Classic solo stages automatically at a regular boundary, saves/restores its
coordinate, persists and mirrors over SEC. Existing warm-ups and common cues
remain; optional starts are grouped, bounded and skipped after resume. Native
boundary END survives staging. Standalone completion now persists for reload.
Guide and RU/EN dialog screenshots updated. Full Linux suite654/642pass/12skip,
46 distinct Chromium scenarios, 31 actual Node12 child-server A/R cases and
67 targeted native/slot cases passed. Build remains456. This work was later
committed and pushed as `37b2952` (see the synchronization section above); no tag
or release was created.
On the user's subsequent launch request, the separate owner test copy was updated
and launched on 18 November at http://127.0.0.1:18088/. Launcher PID26284 and child
Node PID28852 are recorded in `dist/github-sync-20261116/launched-test.json`;
recheck executable paths before stopping them. Params and saved lists were kept,
ordinary counter3, timer idle, no queued extra rotations. Backup:
`dist/final-playbook-audit/test456-before-slots-20261118-180233`.
An independent HTTP check confirmed build456 and both updated slot/dialog modules.
Existing browser tabs need Ctrl+F5. See [review/rotation-slots456.md](review/rotation-slots456.md).


Обновлено: 19 ноября 2026 года. Перед работой сверить Git и текущие процессы.

## Дополнительные ротации нового Финала (develop456)

Последующая правка редактора: белый CSS-плюс, выровненная шапка; минуты/секунды
отдельными полями со стрелками, максимум — время обычной ротации из актуальных
настроек. Save/Cancel у каждого блока; сохранённый блок сворачивается, пустой
исчезает; Add скрыта во время правки. Завершённые доступны для Edit/Remove,
фактически выполняющаяся попытка защищена от перезаписи. Возврат назад и загрузка
старого снимка после возврата переотмечают будущие допротации как запланированные.
Подготовка Modern/Legacy учитывает следующий фактический выход, сохраняя текущих
лезущих. Повторное исполнение того же ID различается по аудиоидентичности запуска.
Проверки: полный Node640/628pass/12skip/0fail; Chromium38 различных сценариев;
18 A/R проверок с дочерними Node12. RU/EN скриншоты редактора обновлены.
В краткой сводке допротации каждый спортсмен теперь показан отдельной строкой
вместо разделения точками с запятой. Проверен прежний браузерный сценарий
редактора и скриншот сводки; модуль и standalone обновлены в тестовой копии.
Тестовая копия `dist/launcher-test-20261116-fb05eec3` обновлена и запущена
18.11.2026 на http://127.0.0.1:18088/; PID лаунчера19852 на момент запуска,
перед остановкой всегда заново проверять путь процесса. Метаданные запуска:
`dist/github-sync-20261116/launched-test.json`. Резервная копия до UI2:
`dist/final-playbook-audit/test456-before-ui2-20261118-155639`.
Настройки и списки сохранены; обычный счётчик8 остался, две будущие допротации
снова запланированы. Дополнительная правка заголовка ФИО заменяет float у плюса
на flex-строку с вертикальным центрированием. Проверены 62 Node-проверки и
геометрия заголовков в Chromium. HTML обновлён в тестовой копии без перезапуска;
для применения в уже открытой вкладке нужен Ctrl+F5.
После обнаружения остановленной тестовой копии она запущена повторно с уже
выровненным заголовком: последний PID лаунчера22728, метаданные обновлены;
последующий независимый HTTP-запрос подтвердил200 и актуальный HTML.

Реализованы по согласованному сценарию владельца: + перед первой трассой,
таблица спортсменов/чекбоксов трасс/времени и стартового сигнала, несколько
блоков. Все стартовые сигналы по умолчанию выключены. Общий таймер равен
максимальному времени; более короткие попытки начинаются позже, общий финиш.
Обычный счётчик не увеличивается для допротации. Сохранены общие прогревы,
600мс серверного ручного старта, предупреждения и финиш. Повторы прошедших
стартов после паузы отсекаются; поздний стартовый сигнал — максимум3с.
Очередь следует снимкам/SEC; есть standalone и read-only Legacy.
Пауза трассы нового Финала отключена, полная остановка и пауза таймера остаются.
Подробности и проверки: [review/final-appeals456.md](review/final-appeals456.md).
Финальные проверки: Node634/622pass/12skip/0fail; Chromium35 различных
сценариев; 12 A/R проверок с реальными дочерними Node12 и 5 прежних проверок
Windows Legacy, включая смешанное шифрованное SEC. Скриншоты диалога RU/EN
обновлены; standalone пересобран. Первоначально тест456 с Playbook запускался
на18088; последующие обновления этой копии описаны выше.
Изменения опубликованы коммитом `37b2952` в `develop`; `main` и опубликованный
3.0.1 не менялись, тег и релиз не создавались.

## Локальный develop456: новый Финал по Playbook2026

По руководству владельца обновлён общий ES5 расчёт списков Modern/Legacy/Node.
8 финалистов — 20 ротаций, 9 — 22; для10+ максимум два спортсмена на трассах.
Исключение в новом Финале означает DNS на первой трассе и сохраняет исходные
места. Полностью пустые ротации пропускаются с непрерывным фактическим счётчиком:
при DNS третьего четвёртый выходит на третьем запуске. Сервер публикует общую
карту пропусков для всех браузеров независимо от выбранных списков. Standalone
рассчитывает её самостоятельно; таймерные и аудиочасы/идентичности не менялись.
Отдых автоматический; final_rest_rotations сохранён для совместимости файлов,
но больше не применяется к расписанию и не показан в редакторе параметров.
Порядок строк не переворачивается; список загружается в стартовом порядке.
Пользователь уточнил: нельзя оставлять пустой фактический запуск при DNS1–4.
Старый Финал/Классика сохранили прежнее исключение со сдвигом.
Код опубликован в `develop` (см. раздел синхронизации выше); опубликованный3.0.1
не заменён. Тестовые копии обновляются отдельно.
Подробности: [review/final-playbook456.md](review/final-playbook456.md).
Проверки: полный Node-набор609 pass/12 skip/0 fail, Chromium28 pass,
Windows/CLR2 launcher/update8 pass, Linux headless settings RU/EN pass.

## Выпущен 3.0.1 / сборка 455

Коммит `d77eb6f3e9c737c2b565a4de8f85abfbff68a8f5` опубликован в develop,
main обновлён fast-forward с сохранением всех изменений. Аннотированный тег
v3.0.1 указывает на этот исходный код. Релиз опубликован как Latest с 18 файлами,
включая MSI/ZIP Windows7/8 x86/x64. Все 15 обязательных заданий релизного CI
43870532875 успешны; после зависания очереди macOS ARM повторено только это
задание с зависимыми этапами, без изменения тега или исходников. Проверены
контрольные суммы 16 пакетов, metadata v3.0.1/build455, описание RU/EN и Latest.
Сайт для исходного кода релиза обновлён. Владелец проверил локальный тестовый
экземпляр455 перед выпуском; при публикации его не перезапускали.
Подробности: [review/release301.md](review/release301.md).

## Сборка 455: сохранение настроек без изменений

Номер сборки по запросу владельца увеличен до 455 в сервере, современном/Legacy
экранах и service worker; offline bundle и docs/standalone.html пересозданы.
Общая модель LauncherParameters.Save возвращает false без записи файла, если
значения не изменились (включая возврат исходного значения и внешние пробелы).
Windows/Win7 и macOS/Linux в таком случае закрывают настройки без вопроса
о перезапуске. Реальное изменение сохраняет прежние validation/conflict и Yes/No.
Native Windows/CLR2 тесты и Linux headless settings RU/EN в WSL прошли;
проверяется также сохранение байтов и времени изменения файла при no-op.
Работающий тестовый лаунчер автоматически не заменён и не перезапущен.
Standalone-fonts и verify-release-inputs455 прошли. Изначальные ограничения
локальных Bash preflight устранены в изолированной Linux-копии для выпуска:
полный набор — 602 pass/12 skip/0 fail. Рабочий Windows checkout сохранён.

## Синхронизация 16 ноября: настройки и отзывчивый запуск лаунчера

Сначала получен GitHub develop `91700ee` (редактор params.txt и исправления
тестовых сигналов), затем поверх него перенесено локальное исправление зависания
лаунчера. Конфликты списков исходников сборки и тестов разрешены с сохранением
обоих компонентов. Редактор настроек временно недоступен во время подготовки
запуска, чтобы запрос перезапуска из диалога не терялся. Сетевые интерфейсы,
подготовка запуска и поиск runtime проверки обновлений работают в фоне;
дедлайны и отмена защищают от позднего завершения.

Проверки совмещённого кода: Windows/CLR2 и затронутые звуковые тесты —
101 pass, один Unix opt-in skip на Windows. В WSL отдельно прошли headless
settings RU/EN, process-tests, startup и peer-status; шесть macOS-контрактов
и verify-release-inputs также прошли. macOS ARM64 компилируется, на самом Mac
не запускался. Версия 3.0.0/build454 и опубликованные пакеты сохранены;
рабочие серверы не перезапускались. Резервная копия локальных правок —
dist/github-sync-20261116 и именованный Git stash.
Подробности: [review/launcher-startup454.md](review/launcher-startup454.md).

## Текущее состояние develop

Основные исходники — ветка `develop` репозитория dfedorov-arch/fdv-bouldering-timer.
Базовый коммит перед изменениями 15 ноября: `e0b2ce2`.
Текущий HEAD и факт синхронизации с GitHub проверять через Git, не по старым хешам
из исторических разделов. Версия остаётся 3.0.0, сборка таймера 454.
Пользователь запросил коммит и push всех согласованных изменений в `develop`.
Рабочая копия `main`, опубликованный релиз и установленные приложения не менялись.
Новых установщиков не собирали, рабочий сервер и вкладки не restart/reload.

## Настройки в настольных лаунчерах

Во всех GUI-лаунчерах Windows modern/Win7/Win8, macOS и Linux добавлена кнопка
только с иконкой шестерёнки справа от языка. «Настройки»/Settings — подсказка
и доступное имя. Окно редактирует существующие параметры `params.txt` с RU/EN
подписями. Сохранение атомарное; сохраняются комментарии, неизвестные ключи,
UTF-8 BOM и переносы строк. Есть проверка ввода, ошибок записи и конфликта
с внешним изменением файла. Cancel файл не меняет.

После сохранения вопрос:
«Настройки сохранены, для их немедленного применения необходимо перезапустить сервер, сделать это сейчас?».
Да вызывает существующий перезапуск сервера; Нет оставляет текущий процесс.
Механика таймера прежняя: параметры читаются сервером при запуске.
Общая CLR2-совместимая модель файла — launcher/windows/LauncherParameters.cs;
Windows Forms и Unix Avalonia используют свои ParametersDialog.cs.
Unix csproj и Windows build scripts включают общий код, включая Legacy-сборку.

Проверки лаунчеров:9 pass/0 fail/2 Windows-native skip в целевом Node-наборе
с реальным Unix headless harness; Unix build без warnings/errors; новые
Windows классы прошли compile-проверку. Проверены RU/EN, save/Yes/No/cancel,
неверный порт и конфликт файла. Полная Windows/.NET Framework и реальный GUI
Windows7 здесь не проверялись. Подробности в README лаунчеров.

## Исправление гонки тестовых сигналов

Найдена и воспроизведена в Chromium собственная программная отмена звука:
SSE audio-test назначал буфер на +1.8с, затем HTTP action response применял
stopped state и clearStoppedTimerSignals -> clearSignalTimers вызывали stop(0).
До исправления узел отменялся через1–2мс после назначения, даже при длинной
паузе между нажатиями. Зависимость от порядка HTTP/SSE объясняет непостоянство.

Исправление в index.html: diagnosticAudioScope отдельно владеет WebAudio
buffer/oscillator nodes, fallback timers и HTML media. Обычный HTTP/SSE cleanup
таймерного расписания больше не удаляет previews. Потеря разрешения/канала,
активный отсчёт, смена профиля, запуска/anchor или сервера, потеря калибровки
и suspension инвалидируют scope. Локальные Start/Reset отменяют тесты сразу.
Поздняя загрузка или отклонённый HTML play не возвращают отменённый звук.
AudioContext/sampleRate и общий аудиодвижок сохранены. Snapshot показывает
тестовые nodes/timers/html отдельно от сигналов соревнования.

Задержка теста1.8с — общий запас доставки/подготовки от времени команды на сервере;
с поправкой[-750,+250]мс начало получается через1.05–2.05с. Cooldown кнопок и
общий серверный rate limit —1с. «5 сек» даёт5 сигналов через1с. Во время активного
отсчёта тесты запрещены, до отложенного старта допускаются. Доставка сохраняет
срок годности и дедупликацию. Единая docs/standalone.html пересобрана.

Также исправлен stale AUDIO при открытом редакторе поправки: смена основной роли
принудительно обновляет карточки, сохраняя несохранённую поправку. Изолированный
тест подтверждает, что прежняя серая плашка могла быть только устаревшим UI при
canPlaySound=true; она сама по себе не доказывала ошибки передачи звука.

Проверки аудио:229 Node pass и16 различных Chromium browser pass; release inputs454
и git diff --check проходят. Проверены оба порядка HTTP/SSE, повторный stopped
forceApply, серии start/end/minute+все5warn через1100мс, mute/late load, настоящий
Start с сохранением competition nodes, fallback/pagehide, profile/primary handover,
HTML/iOS media ownership, synthetic tones с audio-time ended и unlock.
Исходный reproducer после patch не даёт stop(0): узлы завершаются после целевого
start+duration. iOS standalone проверен повторно после пересборки generated HTML.

## Что остаётся проверить

Исправленная версия ещё не устанавливалась в рабочее приложение. Слуховые тесты
нового кода в пользовательских Chrome/Safari, длительная работа и сон/пробуждение
не проверены. Не объявлять исправленными все возможные отказы физического вывода.

Ранее обе проблемные вкладки Safari удалось временно восстановить пересозданием
контекста48000 ->44100 через trusted click. Владелец слышал Start и Finish.
После этого снова сообщал о тишине штатных тестов, в том числе в Chrome.
В свете найденной гонки эти тесты НЕ доказывают повторную поломку WebKit backend:
они могли отменяться самим приложением. Независимые прямые тоны/HTML обходы —
отдельные наблюдения; точная причина всех прежних эпизодов не доказана.
Профилактическое пересоздание после сна и смена частоты в production не добавлены.
Серверный звук был недоступен до выполненного самим владельцем перезапуска;
причину того отдельного эпизода установить не удалось.

Полная хронология, доказательства и уточнения:
[review/safari-sleep-audio454.md](review/safari-sleep-audio454.md).
Не трогать пользовательские params/certs/snapshots, main или рабочий сервер
без соответствующего запроса. Следующий этап — акустическая проверка новой
версии после согласованного обновления работающей копии.

## История состояния до изменений 15 ноября

## Дополнение 3.0.0: MSI для Windows7/8

Опубликованы MSI Windows7/8 x64 и x86 в существующем стабильном релизе 3.0.0: теперь 18 assets и 16 контрольных сумм пакетов. Тег и все исходные пакеты сохранены; сборка таймера 454. Установщики используют проверенные опубликованные ZIP и добавляют только marker установленной версии и ReadMe-MSI.txt. Сборка будущих MSI автоматизирована в release.yml. Все 15 заданий [CI43430573905](https://github.com/dfedorov-arch/fdv-bouldering-timer/actions/runs/43430573905) успешны; сайт обновлён. Подробности проверок, хеши, ограничения и неизменность старых assets: [review/windows-legacy-msi300.md](review/windows-legacy-msi300.md). Инструкции: [../installer/windows/README.md](../installer/windows/README.md). Отчёты/файлы: dist/win7-msi300. Обычный MSI сохраняет семейство обновлений; Legacy использует отдельные семейства/каталог, кодовую страницу 1251 и штатный Windows Installer5.0. Проверены административное извлечение и изолированный сервер; установка на самой Windows7 ещё не выполнялась. Рабочие серверы владельца не останавливались.

## Выпущен стабильный релиз 3.0.0

По запросу владельца сначала синхронизирован локальный develop с GitHub (0c4ba95), затем объединены main/develop. Опубликован [стабильный Latest v3.0.0](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/tag/v3.0.0), сборка таймера остаётся 454. Тег указывает на 2e0d72b6b0d8c7d3bef6ca579aab4b1ac906e78f. RU/EN описание нового относительно 2.3.2: releases/v3.0.0.md. Все 15 заданий [релизного CI 43424303738](https://github.com/dfedorov-arch/fdv-bouldering-timer/actions/runs/43424303738) успешны (отдельный preview пропущен). Проверены 14 пакетов, 16 asset digests, SHA256SUMS.txt, update-info.json и статус Latest; сайт обновлён. Подробности проверок, исходного слияния и последующего тестового/документального коммита: [review/release300.md](review/release300.md). Рабочие серверы владельца не перезапускались. Разделы ниже фиксируют историю локальных тестовых сборок до этого стабильного выпуска.

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

## Историческое локальное состояние до подготовки 3.0.0

До подготовки 3.0.0 рабочая копия fdv-bouldering-timer-develop содержала незакоммиченные изменения после build449 (HEAD c1490f6568bfb94be8ce519045ccc969a1346ea0). Эта запись относится к прежнему этапу; актуальный стабильный выпуск и синхронизация описаны в начале файла. Номер 454 сохранён по указанию владельца.

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
