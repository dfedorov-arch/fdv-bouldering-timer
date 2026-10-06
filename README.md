# FDV Bouldering Timer

**Русский** | [English](#english)

Сетевой таймер для соревнований по болдерингу. Один браузер управляет соревнованием, а телефоны, планшеты, телевизоры и другие компьютеры в локальной сети работают как синхронные экраны.

[Скачать последнюю версию](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/latest) · [Сайт проекта](https://dfedorov-arch.github.io/fdv-bouldering-timer/) · [Полное руководство](https://dfedorov-arch.github.io/fdv-bouldering-timer/help.html)

## Возможности

- Форматы **Классика**, **Фестиваль** и **Финал**.
- При завершении одноразового отсчёта на `00:00` включаются цвета перерыва (по умолчанию красный фон); пройденные трассы отмечаются тёмно-синими ромбами.
- Немедленный или отложенный старт, пауза, перемотка по полосе прогресса и ручной выбор ротации на паузе.
- Единое серверное время для всех экранов и точное планирование звуков.
- Продолжение отсчёта при краткой потере сети; после возврата связи браузер снова принимает состояние сервера.
- **Legacy**-экран для старых или слабых браузеров и телевизоров; в портретном режиме компактные колонки номера и трасс оставляют больше места ФИО, при необходимости доступна горизонтальная прокрутка.
- До четырёх **стартовых списков** с импортом XLSX, MXL, CSV, TSV и TXT.
- Отдельный выбор списков и их раскладки для каждого экрана, включая Legacy.
- Маркеры подготовки, лазания и завершения; исключение участника; приостановка, возобновление и остановка трассы, включая управляемую остановку всей волны с будущей ротации.
- Диагностика браузеров: `LEGACY`, `AUDIO`, `TIME`, `NET`, `SYNC`, `SSE`, `TAB` и `LIST 1–4`.
- Закрепление и изменение порядка карточек, вывод номеров браузеров на экранах и дополнительные часы сервера.
- Звуковые профили, поправка задержки звука, диагностика аудиочасов и тест сигналов.
- Русский и английский интерфейс, HTTP/HTTPS, установщики для Windows, macOS и Linux, portable-сборки и автономный APK для Android.
- Установка через [Komi Store](https://komistore.app/) на Windows, macOS, Linux и Android: магазин выбирает подходящий файл из GitHub Releases. Android-версия остаётся одиночным автономным таймером без сервера и синхронных экранов.

APK учитывает системную панель навигации и вырезы экрана: кнопки таймера располагаются в доступной области как при кнопочной, так и при жестовой навигации.

## Быстрый запуск

1. Установите через [Komi Store](https://komistore.app/) либо скачайте файл из [Releases](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/latest): MSI для Windows, PKG для macOS, DEB для Debian/Ubuntu Linux или APK для Android. Portable-архивы и однофайловая автономная версия остаются альтернативой.
2. Запустите `fdv-bouldering-timer.exe` в Windows, `FDV Bouldering Timer.app` в macOS или `fdv-bouldering-timer` в Linux. Если macOS блокирует приложение или встроенный Node.js, сначала запустите правой кнопкой → «Открыть» файл `prepare-timer-mac.command`. Скрипты `start-timer-*` остаются резервным способом.
3. На компьютере сервера откройте `http://127.0.0.1:8008/`, на других устройствах — напечатанный запускателем сетевой адрес.
4. Включите **Основной браузер**, выберите формат и проверьте звук.

Все экраны должны находиться в одной локальной сети. Перед соревнованием проверьте каждый физический экран, звук и поведение при отключении Wi-Fi.

## Сохранение состояния

Состояние установленной версии сохраняется в пользовательском каталоге (Windows: `%LOCALAPPDATA%\FDV Bouldering Timer\runtime-state`); portable-версия сохраняет его рядом с таймером. Если каталог portable-версии закрыт для записи, сервер автоматически использует пользовательский каталог. Путь виден в журнале лаунчера.

## HTTP и HTTPS

HTTP достаточно для обычной локальной работы. HTTPS с сертификатом таймера создаёт для браузера защищённый контекст: на поддерживаемых телефонах и планшетах становится доступен **Wake Lock** (экран не гаснет во время работы), сервис-воркер может сохранить страницу для повторного открытия без интернета, а современный API буфера обмена позволяет надёжнее копировать адреса. Полноэкранный режим и звук всё равно требуют пользовательского касания, а Wake Lock зависит также от браузера и настроек энергосбережения ОС.

Создайте сертификат штатным скриптом для своей ОС, перезапустите сервер и открывайте именно адрес `https://…:8443/`. Сертификат локальный и самоподписанный: на каждом устройстве сначала подтвердите переход к нему. После смены IP-адреса или компьютера создайте сертификат заново. Подробности — в [руководстве](help.html#https).

## Стартовые списки

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

- **Classic**, **Festival**, and **Final** competition formats.
- A completed one-shot timer at `00:00` uses the configured break colors (red background by default); completed routes use dark-blue diamonds.
- Immediate or scheduled start, pause, progress scrubbing, and paused rotation selection.
- Server-authoritative timing with local continuation during a short network outage.
- Simplified **Legacy** display for old or weak browsers and televisions; compact portrait number/route columns leave more room for names, with horizontal scrolling when needed.
- Up to four **start lists**, imported from XLSX, MXL, CSV, TSV, or TXT.
- Per-display list selection and two-list layout, including Legacy screens.
- Participant preparation/climbing/completion markers, exclusions, and route pause/resume/stop incidents, including an operator-controlled whole-wave hold from a future rotation.
- Browser diagnostics: `LEGACY`, `AUDIO`, `TIME`, `NET`, `SYNC`, `SSE`, `TAB`, and `LIST 1–4`.
- Pinned and reorderable browser cards, display numbers, and optional server-time clocks.
- Sound profiles, per-browser audio correction, audio-clock diagnostics, and signal tests.
- Russian and English UI, HTTP/HTTPS, installers for Windows/macOS/Linux, portable packages, and a standalone Android APK.
- Installation through [Komi Store](https://komistore.app/) on Windows, macOS, Linux, and Android. It selects a matching GitHub Release asset; the Android APK remains a single-device standalone timer without a server or synchronized displays.

The APK respects system navigation bars and display cutouts, keeping timer buttons in the available area with either button or gesture navigation.

### Quick start

1. Install from [Komi Store](https://komistore.app/) or download an asset from [Releases](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/latest): MSI for Windows, PKG for macOS, DEB for Debian/Ubuntu Linux, or APK for Android. Portable archives and the one-file standalone timer remain alternatives.
2. Start `fdv-bouldering-timer.exe` on Windows, `FDV Bouldering Timer.app` on macOS, or `fdv-bouldering-timer` on Linux. If macOS blocks the app or bundled Node.js, first right-click `prepare-timer-mac.command`, choose Open, and confirm.
3. Open `http://127.0.0.1:8008/` on the server computer and the printed LAN address on every other display.
4. Enable **Primary browser**, select the format, and verify sound and every physical display before the event.

All devices must be on the same local network. See the [full guide](help.html?lang=en) for list imports, diagnostics, Legacy behavior, offline recovery, HTTPS, and troubleshooting.

### State storage

Installed packages save state in a per-user directory (Windows: `%LOCALAPPDATA%\FDV Bouldering Timer\runtime-state`); portable packages keep it beside the timer. If the portable directory is read-only, the server falls back to per-user storage. The launcher log shows the selected path.

### HTTP and HTTPS

HTTP is sufficient for ordinary local use. HTTPS gives supported browsers a secure context: **Wake Lock** can keep a phone or tablet display awake, a service worker can retain the page for reopening without internet, and the modern clipboard API can copy connection links more reliably. Fullscreen and audio still require a user gesture, and Wake Lock also depends on the browser and OS power-saving policy.

Create a certificate with the supplied platform script, restart the server, and open `https://…:8443/`. The local certificate is self-signed, so accept it on every display. Recreate it after changing the server computer or its LAN IP.

### Start lists

One rotation before a route resumes, markers for that pause disappear and participants starting next see yellow preparation triangles.

If resumption is scheduled, pause icons cover climbing within the suspended interval and preparation only for routes 2 and later, after participants have entered competition. Preparation for the first route has no pause icon. Later participants retain their shifted schedule without pause icons. The description ends at the last suspended rotation: a pause starting at 17 and resuming at 19 reads “from rotation 17 through rotation 18”.

Planned whole-wave pauses follow rotation order, not creation order. If an earlier pause changes the timetable, subsequent pause-to-participant anchors are recalculated automatically, including in previously saved lists.

A permanent route stop at or before a planned pause's start supersedes that pause: it neither delays other routes nor adds pause markers to them. A pause that began before the stop retains its accumulated delay.

Such a stop preserves both pause boundaries. Cancelling it restores a pause from 17 through 17 with resumption at 18, rather than reopening it without an end.

Enable **Start lists** to open the table area. Add up to four independent lists. When exactly two lists are open, choose a stacked or parallel layout. Every remote screen may show a different list subset and may override the two-list layout.

Screens with visible lists show a read-only rotation badge below the timer, including fullscreen and Legacy displays. Screens without lists retain their previous appearance. Before a scheduled start, the badge says “Waiting for start”.

The lists visualize the calculated participant schedule; they never control timer timing. When a route pause is planned for a future rotation, the checkbox after the rotation number can hold the entire related wave; clear it to preserve the previous progression behavior on upstream routes. See [the full guide](help.html?lang=en#start-lists) for import rules, markers, exclusions, route incidents, and auto-scrolling.

### Development

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
