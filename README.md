# FDV Bouldering Timer

**Русский** | [English](#english)

Сетевой таймер для соревнований по болдерингу. Один браузер управляет соревнованием, а телефоны, планшеты, телевизоры и другие компьютеры в локальной сети работают как синхронные экраны.

[Скачать последнюю версию](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/latest) · [Сайт проекта](https://dfedorov-arch.github.io/fdv-bouldering-timer/) · [Полное руководство](https://dfedorov-arch.github.io/fdv-bouldering-timer/help.html)

## Возможности

- Форматы **Классика**, **Фестиваль** и **Финал**.
- Немедленный или отложенный старт, пауза, перемотка по полосе прогресса и ручной выбор цикла на паузе.
- Единое серверное время для всех экранов и точное планирование звуков.
- Продолжение отсчёта при краткой потере сети; после возврата связи браузер снова принимает состояние сервера.
- **Legacy**-экран для старых или слабых браузеров и телевизоров.
- До четырёх **стартовых списков** с импортом XLSX, MXL, CSV, TSV и TXT.
- Отдельный выбор списков и их раскладки для каждого экрана, включая Legacy.
- Маркеры подготовки, лазания и завершения; исключение участника; приостановка, возобновление и остановка трассы.
- Диагностика браузеров: `LEGACY`, `AUDIO`, `TIME`, `NET`, `SYNC`, `SSE`, `TAB` и `LIST 1–4`.
- Закрепление и изменение порядка карточек, вывод номеров браузеров на экранах и дополнительные часы сервера.
- Звуковые профили, поправка задержки звука, диагностика аудиочасов и тест сигналов.
- Русский и английский интерфейс, HTTP/HTTPS, portable-сборки для Windows, macOS и Linux, а также однофайловый standalone-вариант.

## Быстрый запуск

1. Скачайте архив для своей системы в [Releases](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/latest) и распакуйте его целиком.
2. Запустите `fdv-bouldering-timer.exe` в Windows, `FDV Bouldering Timer.app` в macOS или `fdv-bouldering-timer` в Linux. Если macOS блокирует приложение или встроенный Node.js, сначала запустите правой кнопкой → «Открыть» файл `prepare-timer-mac.command`. Скрипты `start-timer-*` остаются резервным способом.
3. На компьютере сервера откройте `http://127.0.0.1:8008/`, на других устройствах — напечатанный запускателем сетевой адрес.
4. Включите **Основной браузер**, выберите формат и проверьте звук.

Все экраны должны находиться в одной локальной сети. Перед соревнованием проверьте каждый физический экран, звук и поведение при отключении Wi-Fi.

## Стартовые списки

Переключатель **Стартовые списки** открывает область таблиц. Кнопка `+` добавляет до четырёх независимых списков. Для двух списков можно выбрать одну или две колонки. Каждый удалённый экран может показывать свой набор и свою раскладку.

Таблица показывает расчётное продвижение участников и не управляет временем таймера. Подробно о формате файлов, маркерах, инцидентах трасс и автопрокрутке см. в [полном руководстве](help.html#start-lists).

## Горячие клавиши

| Клавиши | Действие |
| --- | --- |
| `Z` / `Я` | Старт или продолжить |
| `Ctrl+Q` / `Ctrl+Й` | Пауза |
| `P` / `З` | Стоп |
| `Ctrl+F` / `Ctrl+А` | Экранный режим |
| `Ctrl+M` / `Ctrl+Ь` | Назначить браузер основным |

Пробел не управляет таймером.

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
- Immediate or scheduled start, pause, progress scrubbing, and paused cycle selection.
- Server-authoritative timing with local continuation during a short network outage.
- Simplified **Legacy** display for old or weak browsers and televisions.
- Up to four **start lists**, imported from XLSX, MXL, CSV, TSV, or TXT.
- Per-display list selection and two-list layout, including Legacy screens.
- Participant preparation/climbing/completion markers, exclusions, and route pause/resume/stop incidents.
- Browser diagnostics: `LEGACY`, `AUDIO`, `TIME`, `NET`, `SYNC`, `SSE`, `TAB`, and `LIST 1–4`.
- Pinned and reorderable browser cards, display numbers, and optional server-time clocks.
- Sound profiles, per-browser audio correction, audio-clock diagnostics, and signal tests.
- Russian and English UI, HTTP/HTTPS, portable packages for Windows/macOS/Linux, and a single-file standalone build.

### Quick start

1. Download and extract the correct package from [Releases](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/latest).
2. Start `fdv-bouldering-timer.exe` on Windows, `FDV Bouldering Timer.app` on macOS, or `fdv-bouldering-timer` on Linux. If macOS blocks the app or bundled Node.js, first right-click `prepare-timer-mac.command`, choose Open, and confirm.
3. Open `http://127.0.0.1:8008/` on the server computer and the printed LAN address on every other display.
4. Enable **Primary browser**, select the format, and verify sound and every physical display before the event.

All devices must be on the same local network. See the [full guide](help.html?lang=en) for list imports, diagnostics, Legacy behavior, offline recovery, HTTPS, and troubleshooting.

### Start lists

Enable **Start lists** to open the table area. Add up to four independent lists. When exactly two lists are open, choose a stacked or parallel layout. Every remote screen may show a different list subset and may override the two-list layout.

The lists visualize the calculated participant schedule; they never control timer timing. See [the full guide](help.html?lang=en#start-lists) for import rules, markers, exclusions, route incidents, and auto-scrolling.

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
