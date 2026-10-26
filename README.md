# FDV Bouldering Timer

**Русский** | [English](#english)

Сетевой таймер для соревнований по болдерингу. Один браузер управляет соревнованием, а телефоны, планшеты, телевизоры и другие компьютеры в локальной сети работают как синхронные экраны.

[Скачать последнюю версию](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/latest) · [Сайт проекта](https://dfedorov-arch.github.io/fdv-bouldering-timer/) · [Полное руководство](https://dfedorov-arch.github.io/fdv-bouldering-timer/help.html)

## Возможности

В [v2.3.1](docs/releases/v2.3.1.md) исправлен стартовый сигнал ручного запуска Финала на дополнительных браузерах. После обновления перезапустите сервер и обновите все страницы; звук должен быть разрешён и разблокирован на каждом звуковом устройстве.

- Форматы **Классика**, **Фестиваль** и **Финал**.
- При завершении одноразового отсчёта на `00:00` включаются цвета перерыва (по умолчанию красный фон); пройденные трассы отмечаются сине-фиолетовыми ромбами.
- Немедленный или отложенный старт, пауза, перемотка по полосе прогресса и ручной выбор ротации на паузе.
- Единое серверное время для всех экранов и точное планирование звуков.
- Серверное звуковое расписание сохраняется при изменении точки старта в пределах 10 мс включительно; погрешность не накапливается.
- Минутное предупреждение перед запланированным стартом сохраняется при повторных измерениях времени серверного звука; подстройка не сбрасывается.
- В серверном звуке увеличен запас PCM до 120 мс для устойчивости к задержкам, без переноса целей сигналов или сброса подстройки.
- На Windows, macOS и Linux звук автоматически передаётся серверу, если современный браузер открыт на том же компьютере и ему разрешено звучать. Сохраняются выбранный профиль и подстройка звука этого браузера, включая тестовую подстройку. Скрытие или заморозка вкладки не прерывает серверное расписание. Пауза, Стоп, выключение звука, отзыв роли и закрытие страницы отменяют соответствующие сигналы; один компьютер не дублирует звук нескольких вкладок. При недоступности нативного проигрывателя используется браузер. Сервер и операционная система должны продолжать работать; сон компьютера не обходится. На удалённых устройствах, в автономном HTML и APK звук остаётся браузерным; Legacy по-прежнему без звука.
- Браузерный звук продолжает работать при переключении вкладок; проверки задержек и звуковых часов восстанавливают будущие сигналы после обнаруженного разрыва. Сон устройства и заморозка страницы могут прервать воспроизведение.
- Дополнительный прогрев за 10 секунд до первого сигнала; задержавшийся технический прогрев допускается в актуальной фазе без расширения допусков самих сигналов.
- Продолжение отсчёта при краткой потере сети; после возврата связи браузер снова принимает состояние сервера.
- **Legacy**-экран для старых или слабых браузеров и телевизоров; в портретном режиме компактные колонки номера и трасс оставляют больше места ФИО, при необходимости доступна горизонтальная прокрутка.
- До четырёх **стартовых списков** с импортом XLSX, MXL, CSV, TSV и TXT.
- Отдельный выбор списков и их раскладки для каждого экрана, включая Legacy.
- Маркеры подготовки, лазания и завершения; исключение участника; приостановка, возобновление и остановка трассы, включая управляемую остановку всей волны с будущей ротации.
- Диагностика браузеров: `LEG`, `CTRL`, `AUDIO`, `TIME`, `NET`, `SYNC`, `SSE`, `TAB`, `SEC` (при настройке резерва) и `LIST 1–4`.
- Закрепление и изменение порядка карточек, вывод номеров браузеров на экранах и дополнительные часы сервера.
- Ограниченное управление CTRL для современных экранов: Старт/Стоп/Пауза/Экран и их горячие клавиши; назначает основной браузер.
- «Звук в перерыве» включён по умолчанию; можно отключить звуки последних 5 секунд перерыва без отключения вспышек и сигнала старта; минутное предупреждение перед запланированным стартом, включая «Финал».
- Звуковые профили, поправка задержки звука, диагностика аудиочасов и тест сигналов.
- Русский и английский интерфейс, HTTP/HTTPS, установщики для Windows, macOS и Linux, portable-сборки и APK для Android с автономным и сетевым режимами.
- Установка через [Komi Store](https://komistore.app/) на Windows, macOS, Linux и Android: магазин выбирает подходящий файл из GitHub Releases. APK не запускает сервер, но новая Android-сборка может подключаться к существующему серверу как синхронный экран со звуком. В старых APK доступен только автономный режим.

APK учитывает системную панель навигации и вырезы экрана: кнопки таймера располагаются в доступной области как при кнопочной, так и при жестовой навигации.

В APK выберите **Подключиться к серверу**, введите его адрес (например, `192.168.1.10:8008`; без схемы используется HTTP) либо выберите **Автономный таймер**. Адрес сохраняется. В сетевом режиме используются обычные серверные настройки, списки, диагностика, звук и резервный сервер. Разрешите звук этого экрана в основном браузере и коснитесь страницы таймера для разблокировки аудио. Пока таймер открыт, Android нативно удерживает экран включённым даже при HTTP. **Не сворачивайте приложение и не блокируйте устройство:** фоновой службы нет, фоновый звук не поддерживается. На соревнованиях подключите планшет к питанию. Через «Назад» с подтверждением можно вернуться к выбору режима; звук этого устройства прекратится, но сервер продолжит работу. Для HTTPS нужен сертификат, которому доверяет WebView; ошибки сертификатов не обходятся.

## Быстрый запуск

1. Установите через [Komi Store](https://komistore.app/) либо скачайте файл из [Releases](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/latest): MSI для Windows, PKG для macOS, DEB для Debian/Ubuntu Linux или APK для Android. Portable-архивы и однофайловая автономная версия остаются альтернативой.
2. Запустите `fdv-bouldering-timer.exe` в Windows, `FDV Bouldering Timer.app` в macOS или `fdv-bouldering-timer` в Linux. Если macOS блокирует приложение или встроенный Node.js, сначала запустите правой кнопкой → «Открыть» файл `prepare-timer-mac.command`. Скрипты `start-timer-*` остаются резервным способом.
3. На компьютере сервера откройте `http://127.0.0.1:8008/`, на других устройствах — напечатанный запускателем сетевой адрес.
4. Включите **Основной браузер**, выберите формат и проверьте звук.

Все экраны должны находиться в одной локальной сети. Перед соревнованием проверьте каждый физический экран, звук и поведение при отключении Wi-Fi.

### Windows 7 / 8 / 8.1

Для этих ОС предусмотрены отдельные portable ZIP `windows7-8-x86` и `windows7-8-x64` в составе релиза; обычные Windows MSI/ZIP с современным Node.js для них не подходят. Распакуйте Legacy-архив целиком в отдельный короткий каталог, например `C:\FDVTimer`. Запускайте EXE вместе с его обязательным `.exe.config` либо `start-timer-win.bat` без .NET/PowerShell. Используются официальный Node.js 12.22.12 и адаптированная при сборке копия общего сервера, а не другая логика часов или звука. Старый браузер при необходимости использует отдельный экранный режим Legacy без звука; сервер может обслуживать современные экраны на других устройствах.

**Только доверенная изолированная локальная сеть:** Node.js 12 и старые ОС больше не получают обновлений безопасности. Не публикуйте такой сервер в интернете; HTTPS не устраняет этот риск. Для публичного сервера используйте современную ОС/VDS. Подробности — [ReadMe Windows Legacy](ReadMe-windows-legacy.txt). Первую сборку необходимо проверить на реальной Win7/Win8 перед соревнованиями.

Обычное восстановление сети не сбрасывает калибровку часов и звуковое расписание. Если обнаружено расхождение часов браузера (например, после сна или перевода системного времени), появится «Требуется проверка времени», а `SYNC` станет красным: отсчёт продолжается по последней монотонной модели, но сигналы приостановлены до измерения по серверу. Если сервера нет, для нового автономного отсчёта нажмите **Стоп**, затем **Старт**; это не восстанавливает достоверное время прежнего отсчёта. Подробная архитектура и ограничения проверок описаны в [docs/architecture.md](docs/architecture.md).

При первом подключении современный экран показывает «Синхронизация времени» и `--:--` до измерения серверных часов; звук ещё не планируется. Идущий отсчёт и сигналы используют независимую монотонную шкалу: перевод календарных часов сервера не сдвигает их и не пересоздаёт звуковое расписание. Старт по времени суток и восстановление после перезапуска по-прежнему используют календарные данные. Автономная версия не ожидает сервер.

## Резервный сервер

Если основной браузер открыт по HTTP через localhost/127.0.0.1, для связи с резервом на другом компьютере сервер автоматически выбирает адрес используемого сетевого интерфейса. Резерв проверяет, что по нему отвечает именно основной сервер. Уже указанный сетевой адрес или домен сохраняется. При HTTPS открывайте основной сервер по сетевому имени из доверенного сертификата: автоматической подмены имени на IP и отключения проверки сертификатов нет. При NAT/VDS выбранный адрес должен быть доступен из сети резерва и всех экранов; иначе откройте основной сервер по его доступному сетевому адресу и повторите настройку.

Отключение резерва не обрывает подключённые к нему экраны: сообщение перечислит мешающие браузеры. Верните их на основной сервер через плашки диагностики либо закройте вкладки, подождите 6–8 секунд и повторите отключение. Проверяется актуальный список на самом резерве. После обновления существующую пару со старым адресом 127.0.0.1 нужно отключить и настроить заново; сохранённая пара автоматически не переписывается.

В основном браузере кнопка **SEC** рядом с PIN подключает заранее запущенный пустой сервер той же сборки с одинаковыми звуками и шрифтами. После успешной связи контур кнопки зелёный. Резерв получает настройки, списки, команды и временную шкалу основного сервера; при потере связи продолжает отсчёт самостоятельно.

После 20 секунд без ответа основного сервера экраны переходят на доступный резерв при очередной проверке. Плашка SEC справа от TAB показывает доступность резерва: серая — недоступен, тёмно-зелёная — доступен, светло-зелёная — браузер подключён к нему. Нажатие переводит этот браузер; нажатие SEC в карточке основного переводит всю группу. Подключения обоих серверов видны вместе. Обратного автоматического перехода нет.

Адрес резерва должен быть доступен каждому экрану и основному серверу. Для HTTPS сертификат должен быть доверенным и браузерам, и Node.js основного сервера; одного подтверждения предупреждения в браузере недостаточно. Защищённая страница не может использовать HTTP-резерв. Резервный сервер недоступен в standalone HTML и автономном режиме APK; сетевой режим APK использует резервный сервер как обычный экран. Это горячий резерв, а не распределённый консенсус: при полном разделении сети нельзя гарантировать единственного управляющего без внешнего арбитра. Подробности — в [руководстве](help.html#secondary-server).

Повторное нажатие светло-зелёной SEC возвращает выбранный экран на текущий основной сервер; в карточке управляющего браузера — всю группу. После аварийной смены ролей текущим основным становится прежний резерв, а не обязательно исходный сервер. Плашки диагностики не переносятся на вторую строку; название Legacy во всех карточках сокращено до LEG, полное название сохранено для доступности.

После общего перехода вернувшийся прежний сервер автоматически становится резервным для нового основного: получает актуальные списки, настройки, назначение управляющего браузера и исходную отметку старта. Адрес резервного сервера обновляется на всех экранах. Это не обратный переход: текущий основной продолжает работу. Перед сменой ролей проверяется доступность вернувшегося сервера; для HTTPS доверие сертификатам нужно обоим серверам. Если обратного доступа нет, новый основной продолжает работать, а старый остаётся заблокированным до восстановления связи.

## Сохранение состояния

Состояние установленной версии сохраняется в пользовательском каталоге (Windows: `%LOCALAPPDATA%\FDV Bouldering Timer\runtime-state`); portable-версия сохраняет его рядом с таймером. Если каталог portable-версии закрыт для записи, сервер автоматически использует пользовательский каталог. Путь виден в журнале лаунчера.

## HTTP и HTTPS

HTTP достаточно для обычной локальной работы. HTTPS с сертификатом таймера создаёт для браузера защищённый контекст: на поддерживаемых телефонах и планшетах становится доступен **Wake Lock** (экран не гаснет во время работы), сервис-воркер может сохранить страницу для повторного открытия без интернета, а современный API буфера обмена позволяет надёжнее копировать адреса. Полноэкранный режим и звук всё равно требуют пользовательского касания, а Wake Lock зависит также от браузера и настроек энергосбережения ОС.

В Windows, включая отдельную сборку Win7/Win8, нажмите **«Создать HTTPS-сертификат»** в лаунчере, проверьте адреса и создайте сертификат. Замена и перезапуск требуют отдельных подтверждений; сама генерация сервер не прерывает. В macOS/Linux используйте штатный скрипт. После перезапуска открывайте `https://…:8443/`. Сертификат самоподписанный, доверие устройств настраивается отдельно; передавайте им только `timer-public.cer`, не закрытый ключ в `timer-cert.pfx`. После смены адреса пересоздайте сертификат. Подробности — в [руководстве](help.html#https).

## Стартовые списки

Число трасс можно менять и при запущенном таймере. Ввод сохраняется по Enter, Tab или при выходе из поля; стрелки поля применяют изменение сразу. Синхронизация не сбрасывает черновик или ожидающее сохранения значение. При ошибке значение остаётся в поле с пояснением — нажмите Enter для повторной попытки.

За ротацию до возобновления трассы значки этой паузы исчезают, а участники следующего выхода видят жёлтые треугольники подготовки.

Если конец паузы задан заранее, значки паузы отмечают лазание в период остановки, а подготовку — только к трассам 2 и далее: эти участники уже начали соревнование. Подготовка к первой трассе не получает значок паузы. У последующих участников значков нет, но сдвиг расписания сохраняется. В описании указан последний номер приостановленной ротации: при возобновлении с 19 пауза с 17 отображается «с ротации 17 по ротацию 18».

Запланированные паузы с удержанием всей волны учитываются по порядку ротаций, а не добавления. Если более ранняя пауза меняет расписание, привязки последующих пауз к участникам пересчитываются автоматически, в том числе в уже сохранённых списках.

Полная остановка трассы с той же или более ранней ротации делает её запланированную паузу неактивной: она не задерживает другие трассы и не показывает на них значки паузы. Если пауза началась раньше полной остановки, накопленный сдвиг сохраняется.

Такая остановка сохраняет обе границы паузы. После удаления остановки пауза с 17 по 17 восстанавливается с возобновлением в 18-й, а не превращается в паузу без окончания.

Переключатель **Стартовые списки** открывает область таблиц. Кнопка `+` добавляет до четырёх независимых списков. Для двух списков можно выбрать одну или две колонки. Каждый удалённый экран может показывать свой набор и свою раскладку.

На экране с видимыми списками под таймером показана плашка текущей ротации — без возможности редактирования. Она остаётся видимой в полноэкранном и Legacy-режимах; без списков экран сохраняет прежний вид. Перед запланированным стартом плашка показывает «Ожидание старта».

Таблица показывает расчётное продвижение участников и не управляет временем таймера. При планировании паузы трассы на будущую ротацию флажок после номера ротации позволяет удержать всю связанную волну; его можно снять, чтобы сохранить прежнее продвижение участников на предыдущих трассах. Подробно о формате файлов, маркерах, инцидентах трасс и автопрокрутке см. в [полном руководстве](help.html#start-lists).

## Горячие клавиши

| Клавиши | Действие |
| --- | --- |
| `Z` | Старт или продолжить |
| `Ctrl+Q` | Пауза |
| `P` | Стоп |
| `Ctrl+F` | Экранный режим |
| `Ctrl+M` | Назначить браузер основным |

Сочетания работают при английской и русской раскладке. Пробел не управляет таймером.

## Запуск из исходного кода

Требуется актуальная LTS-версия Node.js:

```bash
node serve-bouldering-timer.js
```

Начальные параметры находятся в `params.txt`. Порты по умолчанию: `8008` для HTTP и `8443` для HTTPS.

Цвета значков списка задаются отдельно: `list_ready_color` — подготовка, `list_active_color` — лазание, `list_done_color` — пройденная трасса (по умолчанию `#48488C`), `list_paused_color` — пауза, `list_stopped_color` — полная остановка. Формат — `#RRGGBB` или `#RGB`; неверное значение заменяется цветом по умолчанию. После изменения перезапустите сервер. Фоны строк и диагностика не меняются. В автономный HTML/APK цвета встраиваются при сборке.

### Проверка изменений

```bash
node serve-bouldering-timer.js --generate-offline-audio
node scripts/verify-release-inputs.js
npm test
npm run test:visual
```

Техническая карта документации: [docs/documentation-map.md](docs/documentation-map.md). Архитектура: [docs/architecture.md](docs/architecture.md). Расширенная диагностика: [docs/performance-diagnostics.md](docs/performance-diagnostics.md).

## Лицензия

MIT. См. [LICENSE](LICENSE).

## English

A network-synchronized timer for bouldering competitions. One browser controls the event while phones, tablets, televisions, and computers on the same local network act as synchronized displays.

### Features

[v2.3.1](docs/releases/v2.3.1.md) fixes manual Final START on other browsers. Restart the server and reload every page after upgrading; audio must be enabled and unlocked on each sound device.

- **Classic**, **Festival**, and **Final** competition formats.
- A completed one-shot timer at `00:00` uses the configured break colors (red background by default); completed routes use blue-purple diamonds.
- Immediate or scheduled start, pause, progress scrubbing, and paused rotation selection.
- Server-authoritative timing with local continuation during a short network outage.
- Native audio retains its accepted start anchor within10ms inclusive without accumulating drift.
- Native scheduled-start minute warnings survive repeated clock sampling without resetting correction.
- Native server audio keeps a 120ms PCM reserve against delayed refills without moving cue targets or resetting correction.
- On Windows, macOS and Linux, an eligible modern browser on the server computer automatically delegates sound to the server. Its selected profile and per-browser audio correction, including correction previews, are retained. Hiding or freezing the tab does not interrupt the server schedule. Pause, Stop, muting, role revocation and page closure cancel the relevant cues; multiple local tabs share one native output. If native playback is unavailable, the browser is used. The operating system and server must remain running; computer sleep is not bypassed. Remote devices, standalone HTML and APK retain browser audio; Legacy remains silent.
- Browser sound continues when switching tabs; callback-delay and audio-clock checks recover future signals after a detected gap. Device sleep and page freezing can still interrupt playback.
- Extra preparation 10 seconds before the first signal; delayed technical warmups remain valid in their current phase without widening competition-signal lateness limits.
- Simplified **Legacy** display for old or weak browsers and televisions; compact portrait number/route columns leave more room for names, with horizontal scrolling when needed.
- Up to four **start lists**, imported from XLSX, MXL, CSV, TSV, or TXT.
- Per-display list selection and two-list layout, including Legacy screens.
- Participant preparation/climbing/completion markers, exclusions, and route pause/resume/stop incidents, including an operator-controlled whole-wave hold from a future rotation.
- Browser diagnostics: `LEG`, `CTRL`, `AUDIO`, `TIME`, `NET`, `SYNC`, `SSE`, `TAB`, `SEC` (when configured), and `LIST 1–4`.
- Pinned and reorderable browser cards, display numbers, and optional server-time clocks.
- CTRL limited controls for modern displays: Start/Stop/Pause/Screen and their shortcuts, assigned by the primary browser.
- Break sound is on by default; uncheck it to mute the last five break-second sounds, preserving flashes and the start signal; a one-minute warning before a scheduled start, including Final.
- Sound profiles, per-browser audio correction, audio-clock diagnostics, and signal tests.
- Russian and English UI, HTTP/HTTPS, installers for Windows/macOS/Linux, portable packages, and an Android APK with standalone and server-client modes.
- Installation through [Komi Store](https://komistore.app/) on Windows, macOS, Linux, and Android. It selects a matching GitHub Release asset. The APK does not host a server; the new Android build can connect to an existing server as a synchronized display with sound. Older APKs only support standalone operation.

The APK respects system navigation bars and display cutouts, keeping timer buttons in the available area with either button or gesture navigation.

In the APK, select **Connect to server**, enter its address (for example `192.168.1.10:8008`; omitted schemes default to HTTP), or choose **Standalone timer**. The address is remembered. Network mode uses the server's normal lists, diagnostics, sound and Secondary server support. Enable this screen's sound in the primary browser and tap the timer page to unlock audio. Android keeps the screen on natively while the timer is open, including over HTTP. **Do not switch apps or lock the device:** there is no background service or background sound support. Keep competition devices connected to power. Back asks for confirmation before returning to mode selection; this device's sound stops, but the server continues. HTTPS requires a certificate trusted by WebView; certificate errors are never bypassed.

### Quick start

1. Install from [Komi Store](https://komistore.app/) or download an asset from [Releases](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/latest): MSI for Windows, PKG for macOS, DEB for Debian/Ubuntu Linux, or APK for Android. Portable archives and the one-file standalone timer remain alternatives.
2. Start `fdv-bouldering-timer.exe` on Windows, `FDV Bouldering Timer.app` on macOS, or `fdv-bouldering-timer` on Linux. If macOS blocks the app or bundled Node.js, first right-click `prepare-timer-mac.command`, choose Open, and confirm.
3. Open `http://127.0.0.1:8008/` on the server computer and the printed LAN address on every other display.
4. Enable **Primary browser**, select the format, and verify sound and every physical display before the event.

All devices must be on the same local network. See the [full guide](help.html?lang=en) for list imports, diagnostics, Legacy behavior, offline recovery, HTTPS, and troubleshooting.

### Windows 7 / 8 / 8.1

Use the separate `windows7-8-x86` or `windows7-8-x64` portable ZIP, not the ordinary Windows MSI/ZIP with modern Node.js. Extract everything into a separate short path such as `C:\FDVTimer`. Keep the mandatory `.exe.config` beside the GUI EXE, or use `start-timer-win.bat` without .NET/PowerShell. These packages use official Node.js 12.22.12 and a build-time adaptation of the same server, not separate clock/audio logic. Old-browser Legacy display mode remains a different feature and has no sound; modern devices can connect to a server running on an old OS.

**Trusted isolated LAN only:** Node12 and these OS versions are end-of-life. Do not expose the server to the Internet; HTTPS cannot fix that risk. Use a modern OS/VDS for public access. See [Windows Legacy notes](ReadMe-windows-legacy.txt). Physical Win7/Win8 testing is required before competition use.

Ordinary network recovery preserves clock calibration and valid sound schedules. A detected browser-clock discontinuity (for example, after sleep or a system-clock change) shows “Clock verification required” and turns `SYNC` red: the last monotonic timeline is retained, but timed signals are suspended until a measured server response verifies time. Without a server, press **Stop**, then **Start** for a new standalone run; this does not recover verified elapsed time for the previous run. See [docs/architecture.md](docs/architecture.md) for the recovery contract and test limitations.

On first connection, a modern display shows “Synchronizing time” and `--:--` until a measured server clock is available; it does not schedule sound yet. Running time and signals use an independent monotonic coordinate: changing the server's calendar clock neither shifts them nor replaces the sound schedule. Clock-time starts and restart recovery still use calendar data. Standalone does not wait for a server.

### Secondary server

When the operator opens the primary over HTTP localhost/127.0.0.1, pairing with another computer advertises the actual outbound network-interface address. The reserve verifies that it reaches the correct primary process. Existing network addresses/domains are preserved. For HTTPS, open the primary through a network name covered by its trusted certificate; no IP substitution or certificate-validation bypass is performed. With NAT/VDS, the advertised address must be reachable from the reserve and every display; otherwise reopen the primary through its reachable network address and retry setup.

Disconnecting does not strand connected reserve displays: the error lists those browsers. Return them through their diagnostic badges or close their tabs, wait 6–8 seconds and disconnect again. The reserve checks its current registry. After updating, remove/reconfigure an existing pair with an old 127.0.0.1 primary address; stored pairs are not silently rewritten.

The primary browser's **SEC** button beside PIN pairs a running empty server of the same build with identical audio and font assets. A green outline confirms connectivity. The standby mirrors settings, start lists, commands and the primary timeline, and continues independently if its upstream disappears.

After 20 seconds without primary contact, displays switch to a reachable standby on their next check. SEC after TAB is gray when unavailable, dark green when reachable and light green when connected through it. Click a browser's SEC badge to move that browser; click the primary browser's badge to move the whole group. Both servers' browser registries are combined. There is no automatic failback.

Every display and the primary server must reach the secondary address. HTTPS certificates must be trusted by browsers and by Node.js on the primary server; accepting a browser warning alone is insufficient. An HTTPS page cannot use an HTTP standby. A Secondary server is not available in standalone HTML or APK standalone mode; the network APK uses a Secondary server like an ordinary display. Two servers without a witness cannot guarantee a single authority during a complete network partition. See the [guide](help.html?lang=en#secondary-server-en).

Click a light-green SEC badge again to return that display to the current primary, or the operator's badge to return the group. After failover the current primary may be the original standby. Diagnostic badges stay on one line; Legacy is labelled LEG in every card, retaining its full accessible name.

After group takeover, the returning former primary automatically becomes the new primary's standby, receiving current lists, settings, operator assignment and the unchanged start anchor. Secondary server addresses update across displays without automatic failback. Reverse reachability is verified first; HTTPS trust is required on both servers. If that path is unavailable, the new primary continues and the old server remains fenced until connectivity is restored.

### State storage

Installed packages save state in a per-user directory (Windows: `%LOCALAPPDATA%\FDV Bouldering Timer\runtime-state`); portable packages keep it beside the timer. If the portable directory is read-only, the server falls back to per-user storage. The launcher log shows the selected path.

### HTTP and HTTPS

HTTP is sufficient for ordinary local use. HTTPS gives supported browsers a secure context: **Wake Lock** can keep a phone or tablet display awake, a service worker can retain the page for reopening without internet, and the modern clipboard API can copy connection links more reliably. Fullscreen and audio still require a user gesture, and Wake Lock also depends on the browser and OS power-saving policy.

On Windows (including the separate Win7/Win8 build), click **Create HTTPS certificate** in the launcher and review the server addresses. Replacement and restart require separate confirmations; generation does not interrupt the running server. On macOS/Linux use the platform script. After restarting, open `https://…:8443/`. Device trust for this self-signed certificate is configured separately; share only `timer-public.cer`, never `timer-cert.pfx` containing the private key. Recreate the certificate after address changes.

### Start lists

Route counts can be changed while running. Typing commits on Enter, Tab, or leaving the field; the field's arrows commit immediately. Synchronization preserves drafts and pending values. A failed save retains the value with an explanation; press Enter to retry.

One rotation before a route resumes, markers for that pause disappear and participants starting next see yellow preparation triangles.

If resumption is scheduled, pause icons cover climbing within the suspended interval and preparation only for routes 2 and later, after participants have entered competition. Preparation for the first route has no pause icon. Later participants retain their shifted schedule without pause icons. The description ends at the last suspended rotation: a pause starting at 17 and resuming at 19 reads “from rotation 17 through rotation 18”.

Planned whole-wave pauses follow rotation order, not creation order. If an earlier pause changes the timetable, subsequent pause-to-participant anchors are recalculated automatically, including in previously saved lists.

A permanent route stop at or before a planned pause's start supersedes that pause: it neither delays other routes nor adds pause markers to them. A pause that began before the stop retains its accumulated delay.

Such a stop preserves both pause boundaries. Cancelling it restores a pause from 17 through 17 with resumption at 18, rather than reopening it without an end.

Enable **Start lists** to open the table area. Add up to four independent lists. When exactly two lists are open, choose a stacked or parallel layout. Every remote screen may show a different list subset and may override the two-list layout.

Screens with visible lists show a read-only rotation badge below the timer, including fullscreen and Legacy displays. Screens without lists retain their previous appearance. Before a scheduled start, the badge says “Waiting for start”.

The lists visualize the calculated participant schedule; they never control timer timing. When a route pause is planned for a future rotation, the checkbox after the rotation number can hold the entire related wave; clear it to preserve the previous progression behavior on upstream routes. See [the full guide](help.html?lang=en#start-lists) for import rules, markers, exclusions, route incidents, and auto-scrolling.

### Development

Configure list marker colors in `params.txt`: `list_ready_color` (preparation), `list_active_color` (climbing), `list_done_color` (completed, default `#48488C`), `list_paused_color` (pause), and `list_stopped_color` (permanent stop). Use `#RRGGBB` or `#RGB`; invalid values fall back to defaults. Restart the server after editing. Row backgrounds and diagnostics are unaffected. Standalone HTML/APK embeds the colors at build time.

```bash
node serve-bouldering-timer.js
node serve-bouldering-timer.js --generate-offline-audio
node scripts/verify-release-inputs.js
npm test
npm run test:visual
```

See [docs/documentation-map.md](docs/documentation-map.md), [docs/architecture.md](docs/architecture.md), and [docs/performance-diagnostics.md](docs/performance-diagnostics.md).

### License

MIT. See [LICENSE](LICENSE).

Build431: In AUDIO diagnostics, the checkbox beside the status allows server playback for the selected browser (on by default). Uncheck for browser audio; hidden or sleeping tabs may miss signals. The sound offset is preserved. The choice is saved by tab ID across disconnection, reload and server restoration; a new tab has its own ID and settings.

Build432: Keep speaker awake is on by default: a short quiet tone after prolonged silence, also while waiting or paused. It uses the selected audio output. params.txt: speaker_keep_awake=true; speaker_keep_awake_interval_seconds=180 (10–600 seconds); speaker_keep_awake_gain=0.006 (linear amplitude 0.0001–0.1); speaker_keep_awake_frequency_hz=440 (100–2000 Hz). Duration150ms. Restart the server after parameter changes. Effectiveness depends on the BT speaker; a tone may be too quiet to prevent sleep. Browser playback requires audio unlocking and can be delayed by tab freezing/throttling. Native server playback is independent of tab activity. Muting sound or clearing the checkbox cancels the technical tone.

Build434: Sound row: without a primary browser the checkbox aligns with the rows above. With a primary, the caption gap is10px; narrow/medium panels show “Sound in primary”, with the full “Sound in primary browser” tooltip.

Build435: the full sound caption now appears at actual wide desktop panel sizes; medium/narrow panels retain the short caption and full tooltip.

Build436 adapts the current shared interface, audio preferences and180-second
speaker keep-awake default to all release targets. macOS and Linux x64/ARM64
can delegate local browser audio to self-contained Core Audio/ALSA helpers,
using the same PCM scheduler and per-browser correction as Windows. Unix
launchers display the running server's build. See [Unix audio prerequisites](native-audio/unix/README.md)
and [validation](docs/review/cross-platform-build436.md).
